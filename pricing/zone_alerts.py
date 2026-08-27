"""Alertes de zone — une notif combinée par zone, chauffeur + client."""
from __future__ import annotations

import logging

from django.core.cache import cache

logger = logging.getLogger(__name__)

ZONE_CACHE_TTL = 20 * 60
ZONES_SNAPSHOT_TTL = 45


def _zone_snapshot() -> list[dict]:
    cached = cache.get('daxi_pricing_zone_alerts')
    if cached is not None:
        return cached
    from pricing.models import PricingZone
    zones = PricingZone.objects.filter(is_active=True).prefetch_related('tags')
    data = []
    for z in zones:
        data.append({
            'id': z.pk,
            'name': z.name,
            'polygon': z.polygon,
            'tags': [
                {
                    'name': t.name,
                    'is_danger': t.is_danger,
                    'notify_on_approach': t.notify_on_approach,
                    'alert_message': t.alert_message,
                }
                for t in z.tags.all()
            ],
        })
    cache.set('daxi_pricing_zone_alerts', data, ZONES_SNAPSHOT_TTL)
    return data


def process_order_zone_alerts(order, lat: float, lng: float) -> tuple[list[dict], list[dict]]:
    """Retourne (nearby, freshly_emitted)."""
    if not order or getattr(order, 'status', '') not in ('on_way', 'arrived', 'in_progress'):
        return [], []
    from pricing.geo_utils import find_nearby_alert_zones

    nearby = find_nearby_alert_zones(lat, lng, _zone_snapshot())
    emitted = []
    for hit in nearby:
        cache_key = f'zone_alert_{order.pk}_{hit["zone_id"]}'
        if not cache.add(cache_key, 1, ZONE_CACHE_TTL):
            continue
        try:
            _emit(order, hit)
            emitted.append(hit)
        except Exception as exc:
            cache.delete(cache_key)
            logger.warning('[ZoneAlert] emit failed order #%s zone %s: %s', order.pk, hit.get('zone_id'), exc)
    return nearby, emitted


def _emit(order, hit: dict) -> None:
    from asgiref.sync import async_to_sync
    from channels.layers import get_channel_layer
    from orders.models import OrderMessage

    combined = hit.get('alert_message') or ''
    dist = hit.get('distance_m')
    prefix = '⚠️ Zone sensible' if hit.get('is_danger') else 'ℹ️ Sur la route'
    OrderMessage.objects.create(
        order=order,
        sender_type='system',
        sender_name='DAXI',
        content=f'{prefix} ({dist} m) : {combined}',
        message_type='text',
    )
    payload = {
        'message': combined,
        'messages': hit.get('messages') or [combined],
        'zone': hit.get('zone_name'),
        'zone_id': hit.get('zone_id'),
        'distance_m': dist,
        'is_danger': bool(hit.get('is_danger')),
        'severity': hit.get('severity') or 'info',
        'ttl_ms': hit.get('ttl_ms') or 4000,
        'order_id': order.pk,
    }
    layer = get_channel_layer()
    if layer:
        async_to_sync(layer.group_send)(f'order_{order.pk}', {
            'type': 'broadcast_message',
            'message': {'type': 'danger_zone', 'data': payload},
        })
    try:
        from julmin_taxis.notify import notify_zone_approach
        notify_zone_approach(order, payload)
    except Exception as exc:
        logger.warning('[ZoneAlert] push failed order #%s: %s', order.pk, exc)
