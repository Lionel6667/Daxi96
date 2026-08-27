"""Pipelines d'étapes UI pour les commandes issues des forfaits / cartes plans."""
from julmin_taxis.round_trip_utils import is_round_trip_order, order_pipeline_index


def _norm_plan_key(raw: str) -> str:
    return (raw or '').strip().lower().replace('_', '-')



_PLAN_PIPELINES = {
    
    'transport': {
        'statuses': (
            'pending', 'price_proposed', 'price_confirmed', 'driver_assigned',
            'on_way', 'arrived', 'in_progress', 'completed',
        ),
    },
    
    'duration': {
        'statuses': (
            'pending', 'price_confirmed', 'driver_assigned',
            'on_way', 'in_progress', 'completed',
        ),
    },
    
    'premium': {
        'statuses': (
            'pending', 'price_confirmed', 'driver_assigned',
            'on_way', 'arrived', 'in_progress', 'completed',
        ),
    },
}

_PLAN_KEY_VARIANT = {
    'ville-a-ville': 'transport',
    'accueil-aeroport-cap': 'transport',
    'demi-journee': 'duration',
    'journee-complete': 'duration',
    'journee': 'duration',
    'elegance-night': 'premium',
    'business-vip': 'premium',
}


def plan_pipeline_variant(plan_key: str) -> str:
    key = _norm_plan_key(plan_key)
    if not key:
        return ''
    return _PLAN_KEY_VARIANT.get(key, 'transport')


def is_plan_order(order) -> bool:
    return bool((getattr(order, 'service_plan', None) or '').strip())


def _normalize_plan_status(status: str, statuses: tuple) -> str:
    status = (status or '').strip()
    if status == 'price_proposed' and 'price_proposed' not in statuses:
        return 'price_confirmed' if 'price_confirmed' in statuses else status
    if status == 'arrived' and 'arrived' not in statuses:
        if 'in_progress' in statuses:
            return 'in_progress'
        if 'on_way' in statuses:
            return 'on_way'
    if status == 'waiting_return':
        return 'in_progress' if 'in_progress' in statuses else status
    return status


def plan_pipeline_index(order, status=None) -> int:
    """Index pipeline pour commandes forfait / plan."""
    status = (status or getattr(order, 'status', None) or '').strip()
    if status == 'cancelled':
        return -1
    if is_round_trip_order(order):
        return order_pipeline_index(order, status)

    key = _norm_plan_key(getattr(order, 'service_plan', None) or '')
    if not key:
        return -1

    variant = plan_pipeline_variant(key)
    spec = _PLAN_PIPELINES.get(variant) or _PLAN_PIPELINES['transport']
    statuses = spec['statuses']
    norm = _normalize_plan_status(status, statuses)
    try:
        return statuses.index(norm)
    except ValueError:
        return -1


def plan_pipeline_step_count(order) -> int:
    key = _norm_plan_key(getattr(order, 'service_plan', None) or '')
    if not key:
        return 0
    variant = plan_pipeline_variant(key)
    spec = _PLAN_PIPELINES.get(variant) or _PLAN_PIPELINES['transport']
    return len(spec['statuses'])
