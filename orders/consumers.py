import json
from urllib.parse import parse_qs

from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async


from julmin_taxis.staff_auth import staff_user_from_token
from julmin_taxis.websocket_auth import (
    can_access_driver_ws,
    can_access_enterprise_ws,
    can_access_order_ws,
)


@database_sync_to_async
def _user_from_jwt(token):
    return staff_user_from_token(token)


class OrderConsumer(AsyncWebsocketConsumer):
    """WebSocket consumer for real-time order updates."""

    async def connect(self):
        self.order_id = self.scope['url_route']['kwargs']['order_id']
        if not await can_access_order_ws(self.scope, self.order_id):
            await self.close(code=4403)
            return
        self.group_name = f'order_{self.order_id}'

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data):
                                                                              
        return

    async def order_update(self, event):
        await self.send(text_data=json.dumps({
            'event': event['event'],
            'data': event['data']
        }))

    async def broadcast_message(self, event):
        msg = event.get('message', {})
        await self.send(text_data=json.dumps({
            'event': msg.get('type', 'message'),
            'data': msg.get('data', {})
        }))


class AdminOrderConsumer(AsyncWebsocketConsumer):
    """WebSocket for admin order dashboard."""

    async def connect(self):
        user = self.scope.get('user')
        is_staff = bool(user and getattr(user, 'is_authenticated', False) and getattr(user, 'is_staff', False))

        if not is_staff:
            qs = parse_qs(self.scope.get('query_string', b'').decode())
            token = (qs.get('token') or [None])[0]
            if token:
                user = await _user_from_jwt(token)
                is_staff = bool(user and getattr(user, 'is_authenticated', False) and getattr(user, 'is_staff', False))

        if not is_staff:
            session = self.scope.get('session') or {}
            is_staff = bool(session.get('is_admin'))

        if not is_staff:
            await self.close(code=4403)
            return

        self.group_name = 'admin_orders'
        await self.channel_layer.group_add(self.group_name, self.channel_name)
                                                                
        await self.channel_layer.group_add('admin', self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)
            await self.channel_layer.group_discard('admin', self.channel_name)

    async def order_update(self, event):
        await self.send(text_data=json.dumps({
            'event': event['event'],
            'data': event['data']
        }))

    async def broadcast_message(self, event):
        msg = event.get('message', {})
        await self.send(text_data=json.dumps({
            'event': msg.get('type', 'message'),
            'data': msg.get('data', {})
        }))


class DriverConsumer(AsyncWebsocketConsumer):
    """WebSocket for driver notifications."""

    async def connect(self):
        self.driver_id = self.scope['url_route']['kwargs']['driver_id']
        if not await can_access_driver_ws(self.scope, self.driver_id):
            await self.close(code=4403)
            return
        self.group_name = f'driver_{self.driver_id}'
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        await self._mark_driver_presence()

    async def disconnect(self, close_code):
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    @database_sync_to_async
    def _mark_driver_presence(self):
        from julmin_taxis.presence import mark_online
        from julmin_taxis.driver_presence import touch_driver_last_seen
        from drivers.models import Driver
        mark_online('driver', self.driver_id)
        try:
            driver = Driver.objects.get(pk=self.driver_id)
            touch_driver_last_seen(driver, save=True)
        except Driver.DoesNotExist:
            pass

    async def receive(self, text_data):
        await self._mark_driver_presence()
        data = json.loads(text_data)
        if data.get('type') == 'location_update':
            from julmin_taxis.gps_trace import gps_trace
            gps_trace(
                'BACKEND',
                'BACKEND_WS_DRIVER_LOCATION_RECEIVED',
                driver_id=self.driver_id,
                lat=data.get('latitude'),
                lng=data.get('longitude'),
                channel='websocket',
            )
            order_id = await self.update_driver_location(data)
            if order_id:
                from julmin_taxis.driver_gps_utils import driver_location_payload
                lat = data.get('latitude')
                lng = data.get('longitude')
                payload = driver_location_payload(lat, lng, self.driver_id, order_id)
                await self.channel_layer.group_send(
                    f'order_{order_id}',
                    {
                        'type': 'order_update',
                        'event': 'driver_location',
                        'data': payload,
                    }
                )
                await self.channel_layer.group_send(
                    'admin_orders',
                    {
                        'type': 'order_update',
                        'event': 'driver_location',
                        'data': payload,
                    }
                )
                gps_trace(
                    'BACKEND',
                    'BACKEND_WS_BROADCAST_DRIVER_LOCATION',
                    driver_id=self.driver_id,
                    order_id=order_id,
                    lat=lat,
                    lng=lng,
                    groups=['order_' + str(order_id), 'admin_orders'],
                    channel='websocket_path',
                )
            else:
                gps_trace(
                    'BACKEND',
                    'BACKEND_WS_BROADCAST_DRIVER_LOCATION_SKIP',
                    ok=False,
                    driver_id=self.driver_id,
                    reason='no_active_order',
                    lat=data.get('latitude'),
                    lng=data.get('longitude'),
                )

    @database_sync_to_async
    def update_driver_location(self, data):
        from drivers.models import Driver
        from orders.models import Order
        from julmin_taxis.driver_presence import touch_driver_location_seen
        try:
            driver = Driver.objects.get(pk=self.driver_id)
            driver.latitude = data.get('latitude')
            driver.longitude = data.get('longitude')
            touch_driver_location_seen(driver, save=False)
            driver.save(update_fields=['latitude', 'longitude', 'location_updated_at', 'last_seen_at'])
            active = Order.objects.filter(
                driver=driver,
                status__in=['driver_assigned', 'on_way', 'arrived', 'in_progress']
            ).values_list('pk', flat=True).first()
            return active
        except Driver.DoesNotExist:
            return None

    async def order_update(self, event):
        await self.send(text_data=json.dumps({
            'event': event['event'],
            'data': event['data']
        }))

    async def broadcast_message(self, event):
        msg = event.get('message', {})
        await self.send(text_data=json.dumps({
            'event': msg.get('type', 'message'),
            'data': msg.get('data', {})
        }))


class EnterpriseOrderConsumer(AsyncWebsocketConsumer):
    """WebSocket pour tableau de bord entreprise — mises à jour commandes en direct."""

    async def connect(self):
        self.enterprise_id = self.scope['url_route']['kwargs']['enterprise_id']
        if not await can_access_enterprise_ws(self.scope, self.enterprise_id):
            await self.close(code=4403)
            return
        self.group_name = f'enterprise_{self.enterprise_id}'
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def order_update(self, event):
        await self.send(text_data=json.dumps({
            'event': event['event'],
            'data': event['data']
        }))

    async def broadcast_message(self, event):
        msg = event.get('message', {})
        await self.send(text_data=json.dumps({
            'event': msg.get('type', 'message'),
            'data': msg.get('data', {})
        }))


class TrackShareConsumer(AsyncWebsocketConsumer):
    """WebSocket public de suivi course via share_token (proches)."""

    async def connect(self):
        self.token = self.scope['url_route']['kwargs']['token']
        order = await self._get_order()
        if not order:
            await self.close(code=4404)
            return
        if order.status in ('pending', 'price_proposed', 'cancelled'):
            await self.close(code=4403)
            return
        self.order_id = order.pk
        self.group_name = f'order_{self.order_id}'
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        snapshot = await self._snapshot()
        await self.send(text_data=json.dumps({'event': 'snapshot', 'data': snapshot}))

    async def disconnect(self, close_code):
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    @database_sync_to_async
    def _get_order(self):
        from julmin_taxis.htmx_views import _get_order_by_share_token
        return _get_order_by_share_token(self.token)

    @database_sync_to_async
    def _snapshot(self):
        from julmin_taxis.htmx_views import _trip_share_payload, _get_order_by_share_token
        order = _get_order_by_share_token(self.token)
        if not order:
            return {}
        return _trip_share_payload(order)

    async def order_update(self, event):
        await self.send(text_data=json.dumps({
            'event': event.get('event', 'update'),
            'data': event.get('data', {}),
        }))

    async def broadcast_message(self, event):
        msg = event.get('message', {})
        await self.send(text_data=json.dumps({
            'event': msg.get('type', 'update'),
            'data': msg.get('data', {}),
        }))


class UserConsumer(AsyncWebsocketConsumer):
    """WebSocket for user notifications."""

    async def connect(self):
        user = self.scope.get('user')
        if not user or not user.is_authenticated:
            await self.close()
            return

        self.user_id = user.pk
        self.group_name = f'user_{user.pk}'
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        await self._mark_user_presence()

    @database_sync_to_async
    def _mark_user_presence(self):
        from julmin_taxis.presence import mark_online
        mark_online('user', self.user_id)

    async def receive(self, text_data):
        await self._mark_user_presence()

    async def disconnect(self, close_code):
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def order_update(self, event):
        await self.send(text_data=json.dumps({
            'event': event['event'],
            'data': event['data']
        }))

    async def broadcast_message(self, event):
        msg = event.get('message', {})
        await self.send(text_data=json.dumps({
            'event': msg.get('type', 'message'),
            'data': msg.get('data', {})
        }))
