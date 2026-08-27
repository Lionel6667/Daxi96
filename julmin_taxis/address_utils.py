"""Display helpers for addresses and service-area checks."""
import re

PLUS_CODE_SEGMENT = re.compile(
    r'^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,4}$',
    re.IGNORECASE,
)
PLUS_CODE_PREFIX = re.compile(
    r'^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,4}(\s*,\s*)?',
    re.IGNORECASE,
)


def clean_address_display(addr):
    """Strip Plus Codes and other opaque prefixes for user-facing text."""
    if not addr:
        return ''
    raw = str(addr).strip()
    s = PLUS_CODE_PREFIX.sub('', raw).strip().lstrip(',').strip()
    if not s:
        parts = [p.strip() for p in raw.split(',') if p.strip()]
        parts = [p for p in parts if not PLUS_CODE_SEGMENT.match(p)]
        s = ', '.join(parts).strip()
    return s or raw


def coords_in_covered_zone(lat, lng):
    """Return True if coordinates fall inside an active covered department."""
    if lat is None or lng is None:
        return False
    try:
        from admin_panel.models import CoveredDepartment
        covered = CoveredDepartment.objects.filter(is_active=True)
        if not covered.exists():
            return True
        for d in covered:
            if None in (d.lat_min, d.lat_max, d.lng_min, d.lng_max):
                continue
            if d.lat_min <= lat <= d.lat_max and d.lng_min <= lng <= d.lng_max:
                return True
        return False
    except Exception:
        return True
