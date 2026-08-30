"""Liens boutons WhatsApp Meta — suffixes relatifs + parsing des URLs mal formées."""
from __future__ import annotations

import re
from urllib.parse import parse_qs, unquote, urlparse


def clean_meta_raw(raw: str) -> str:
    """Retire {{1}}, URL encodée, préfixe https://daxipro.com/ d'un segment path."""
    s = unquote(raw or '').strip().strip('/')
    s = re.sub(r'\{\{1\}\}', '', s, flags=re.IGNORECASE)
    if 'http' in s:
        s = s[s.index('http'):]
    if s.startswith('http'):
        parsed = urlparse(s)
        s = parsed.path.lstrip('/')
        if parsed.query:
            sep = '&' if '?' in s else '?'
            s = f'{s}{sep}{parsed.query}'
    return s


def normalize_meta_button_suffix(suffix: str, site_url: str = '') -> str:
    """Meta : le template a la base URL — {{1}} ne doit recevoir qu'un suffixe relatif."""
    s = (suffix or '').strip()
    if not s:
        return s
    s = clean_meta_raw(s)
    site = (site_url or '').strip().rstrip('/')
    if site:
        for prefix in (f'{site}/', site.replace('https://', 'http://') + '/'):
            if s.startswith(prefix):
                s = s[len(prefix):]
                break
    for path_prefix in ('driver/accept/', 'wa/accept/'):
        if s.startswith(path_prefix):
            s = s[len(path_prefix):]
            break
    return s.lstrip('/')[:256]


def accept_button_suffix(order_id: int, driver_id: int) -> str:
    from julmin_taxis.whatsapp_accept import make_accept_token

    token = make_accept_token(order_id, driver_id)
    return f'{order_id}/?sig={token}'


def commande_button_suffix(order_id: int) -> str:
    return f'driver/commande_{order_id}/'


def receipt_button_suffix(order_id: int) -> str:
    return f'recu_{order_id}.pdf'


def compte_order_button_suffix(order_id: int) -> str:
    return f'compte/?order={order_id}'


def admin_orders_button_suffix() -> str:
    return 'admin-dashboard/#orders'


def parse_malformed_accept_raw(raw: str):
    """Extrait (order_id, token) depuis un lien accept Meta mal concaténé."""
    s = clean_meta_raw(raw)

    m = re.search(
        r'(?:wa|driver)/accept/(\d+)(?:/?\?(?:.*&)?sig=([^&/#]+)|/([^/?#]+))?',
        s,
    )
    if m:
        token = (m.group(2) or m.group(3) or '').strip('/')
        return int(m.group(1)), token

    m = re.match(r'^(\d+)/?\?(?:.*&)?sig=([^&/#]+)', s)
    if m:
        return int(m.group(1)), m.group(2)

    m = re.match(r'^(\d+)/(.+)$', s)
    if m:
        rest = m.group(2).strip('/')
        if '?sig=' in rest:
            rest = rest.split('?sig=', 1)[1].split('&')[0]
        elif rest.startswith('?sig='):
            rest = rest[5:]
        return int(m.group(1)), rest

    m = re.match(r'^(\d+)$', s)
    if m:
        return int(m.group(1)), ''

    return None, ''


def parse_malformed_commande_raw(raw: str):
    s = clean_meta_raw(raw)
    m = re.search(r'(?:driver/)?commande_(\d+)', s)
    if m:
        return int(m.group(1))
    m = re.match(r'^(\d+)$', s)
    return int(m.group(1)) if m else None


def parse_malformed_receipt_raw(raw: str):
    s = clean_meta_raw(raw)
    m = re.search(r'recu_(\d+)\.pdf', s, re.IGNORECASE)
    if m:
        return int(m.group(1))
    m = re.match(r'^(\d+)$', s)
    return int(m.group(1)) if m else None


def parse_malformed_compte_raw(raw: str):
    s = clean_meta_raw(raw)
    if '?' in s:
        qs = parse_qs(s.split('?', 1)[1])
        vals = qs.get('order') or []
        if vals and str(vals[0]).isdigit():
            return int(vals[0])
    m = re.search(r'order=(\d+)', s)
    if m:
        return int(m.group(1))
    return None


def resolve_meta_link(raw: str):
    """Résout un path Meta mal formé → ('accept'|'commande'|'recu'|'compte'|'admin', payload)."""
    s = clean_meta_raw(raw)
    if not s:
        return None

    order_id, token = parse_malformed_accept_raw(raw)
    if order_id:
        return 'accept', {'order_id': order_id, 'token': token}

    if 'admin-dashboard' in s:
        return 'admin', {}

    order_id = parse_malformed_compte_raw(raw)
    if order_id is not None and ('compte' in s or 'order=' in s):
        return 'compte', {'order_id': order_id}

    order_id = parse_malformed_receipt_raw(raw)
    if order_id is not None:
        return 'recu', {'order_id': order_id}

    order_id = parse_malformed_commande_raw(raw)
    if order_id is not None:
        return 'commande', {'order_id': order_id}

    return None
