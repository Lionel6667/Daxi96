"""Helpers for driver/enterprise registration approval and rejection messages."""

SENSITIVE_REGISTRATION_FIELDS = frozenset({
    'password',
    'password_hash',
    'password_confirm',
    'new_password',
    'old_password',
})


def strip_sensitive_registration_fields(data: dict) -> dict:
    """Remove password fields from API/admin payloads — never expose credentials."""
    if not isinstance(data, dict):
        return data
    for key in SENSITIVE_REGISTRATION_FIELDS:
        data.pop(key, None)
    return data


def driver_rejection_reason(verification_notes: str) -> str:
    notes = (verification_notes or '').strip()
    if not notes:
        return 'Non précisé'
    if 'REFUS:' in notes:
        return notes.split('REFUS:', 1)[1].strip().split('\n')[0].strip() or 'Non précisé'
    if 'Refusé' in notes and '—' in notes:
        return notes.split('—', 1)[1].strip().split('\n')[0].strip() or 'Non précisé'
    return notes


def set_driver_rejection_notes(existing_notes: str, reason: str) -> str:
    existing = (existing_notes or '').strip()
    ocr_notes = existing
    if existing.startswith('REFUS:'):
        ocr_notes = ''
    elif '\nREFUS:' in existing:
        ocr_notes = existing.split('\nREFUS:', 1)[0].strip()
    reason = reason.strip()
    if ocr_notes:
        return f'{ocr_notes}\nREFUS:{reason}'.strip()
    return f'REFUS:{reason}'
