import re

from django.core.exceptions import ValidationError
from django.core.validators import validate_email

_EMAIL_RE = re.compile(
    r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@"
    r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?"
    r"(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$"
)


def is_valid_email(value):
    email = (value or '').strip()
    if not email or len(email) > 254 or ' ' in email or email.count('@') != 1:
        return False
    if '.' not in email.rsplit('@', 1)[1]:
        return False
    try:
        validate_email(email)
    except ValidationError:
        return False
    return bool(_EMAIL_RE.match(email))
