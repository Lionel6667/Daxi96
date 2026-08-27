"""
WebSocket consumer for Firebase RTDB real-time subscription emulation.
Clients subscribe to a path and receive push notifications when data changes.
"""
import json
from channels.generic.websocket import AsyncWebsocketConsumer
from .views import _get_node_data
from .access import authorize_firebase_read_scope
from asgiref.sync import sync_to_async


class FirebaseConsumer(AsyncWebsocketConsumer):
    """
    WebSocket endpoint: ws://host/ws/fb/<path>/

    Messages from client:
      { "type": "subscribe", "path": "commande/xxx" }
      { "type": "unsubscribe", "path": "commande/xxx" }

    Messages to client:
      { "type": "value", "path": "...", "data": {...} }
      { "type": "child_added", "path": "...", "key": "...", "data": {...} }
      { "type": "child_changed", "path": "...", "key": "...", "data": {...} }
      { "type": "child_removed", "path": "...", "key": "..." }
    """

    async def connect(self):
        self.subscriptions = set()
        await self.accept()

    async def disconnect(self, close_code):
        for group_name in self.subscriptions:
            await self.channel_layer.group_discard(group_name, self.channel_name)

    async def receive(self, text_data):
        try:
            msg = json.loads(text_data)
        except Exception:
            return

        msg_type = msg.get('type')
        path = msg.get('path', '').strip('/')

        if msg_type == 'subscribe':
            allowed = await sync_to_async(authorize_firebase_read_scope)(self.scope, path)
            if not allowed:
                await self.send(json.dumps({
                    'type': 'error',
                    'path': path,
                    'error': 'Accès refusé',
                }))
                return

            group_name = 'fb_' + path.replace('/', '__').replace('-', '_')[:90]
            if group_name not in self.subscriptions:
                self.subscriptions.add(group_name)
                await self.channel_layer.group_add(group_name, self.channel_name)

            data = await sync_to_async(_get_node_data)(path)
            await self.send(json.dumps({
                'type': 'value',
                'path': path,
                'data': data
            }))

        elif msg_type == 'unsubscribe':
            group_name = 'fb_' + path.replace('/', '__').replace('-', '_')[:90]
            if group_name in self.subscriptions:
                self.subscriptions.discard(group_name)
                await self.channel_layer.group_discard(group_name, self.channel_name)

    async def firebase_change(self, event):
        """Handler for group messages broadcasted by views."""
        await self.send(json.dumps({
            'type': event.get('event', 'value'),
            'path': event.get('path', ''),
            'data': event.get('data'),
        }))
