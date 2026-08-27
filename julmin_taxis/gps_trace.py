import logging
from django.utils import timezone

logger = logging.getLogger('daxi.gps.trace')


def gps_trace(side, step, ok=True, **fields):
    payload = {
        'ts': timezone.now().isoformat(),
        'side': side,
        'step': step,
        'ok': ok,
        **fields,
    }
    msg = 'DAXI_GPS_TRACE %s'
    if ok:
        logger.info(msg, payload)
    else:
        logger.warning(msg, payload)
    return payload
