"""Fichiers d'association App Links / Universal Links.

Servis en JSON pur, sans redirection, avant le fallback HTML/SPA.
"""
from __future__ import annotations

import json
import re

from django.conf import settings
from django.http import HttpResponse
from django.views.decorators.http import require_GET


ANDROID_DEBUG_SHA256 = (
    '23:9A:2B:CA:63:B6:5F:AF:68:9E:92:88:47:22:A5:F0:64:E7:81:02:D6:64:FE:A0:2F:62:15:3D:8B:47:0F:A7'
)
_TEAM_PLACEHOLDER = 'YOUR_APPLE_TEAM_ID'
_TEAM_RE = re.compile(r'^[A-Z0-9]{10}$')


def _split_fps(raw: str) -> list[str]:
    return [p.strip().upper() for p in str(raw or '').replace(';', ',').split(',') if p.strip()]


def android_fingerprints() -> list[str]:
    seen: list[str] = []

    def _add(raw: str) -> None:
        for fp in _split_fps(raw):
            if fp and fp not in seen:
                seen.append(fp)

    _add(ANDROID_DEBUG_SHA256)
    _add(getattr(settings, 'ANDROID_APP_SHA256_DEBUG', '') or '')
    _add(getattr(settings, 'ANDROID_APP_SHA256_RELEASE', '') or '')
    _add(getattr(settings, 'ANDROID_APP_SHA256_PLAY', '') or '')
    _add(getattr(settings, 'ANDROID_APP_SHA256_FINGERPRINTS', '') or '')
    return seen


def ios_team_id() -> str:
    team = (getattr(settings, 'IOS_APP_TEAM_ID', '') or '').strip()
    if not team or team == _TEAM_PLACEHOLDER or team.upper().startswith('YOUR_'):
        return ''
    if not _TEAM_RE.match(team):
        return ''
    return team


def _json_response(body) -> HttpResponse:
    resp = HttpResponse(
        json.dumps(body, separators=(',', ':')),
        content_type='application/json',
    )
    resp['Cache-Control'] = 'public, max-age=300'
    resp['X-Content-Type-Options'] = 'nosniff'
    return resp


def assetlinks_body() -> list:
    return [
        {
            'relation': ['delegate_permission/common.handle_all_urls'],
            'target': {
                'namespace': 'android_app',
                'package_name': getattr(settings, 'ANDROID_APP_PACKAGE', 'com.daxipro.daxi'),
                'sha256_cert_fingerprints': android_fingerprints(),
            },
        }
    ]


def aasa_body() -> dict:
    team = ios_team_id()
    bundle = getattr(settings, 'IOS_APP_BUNDLE_ID', 'com.daxipro.daxi')
    details = []
    if team:
        details.append({
            'appID': f'{team}.{bundle}',
            'paths': [
                '/',
                '/driver/*',
                '/wa/*',
                '/track/*',
                '/payer/*',
                '/payment/*',
                '/recu_*',
                '/compte/*',
                '/entreprise/*',
                '/assistance/*',
                '/blog/*',
            ],
        })
    return {'applinks': {'apps': [], 'details': details}}


@require_GET
def android_assetlinks(_request):
    return _json_response(assetlinks_body())


@require_GET
def apple_app_site_association(_request):
    resp = _json_response(aasa_body())
    if not ios_team_id():
        resp['X-Daxi-AASA'] = 'team-id-not-configured'
    return resp


class WellKnownAssociationMiddleware:
    """Répond JSON tout de suite — avant APPEND_SLASH, WhiteNoise et le HTML d'accueil."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = (request.path or '').rstrip('/')
        if request.method in ('GET', 'HEAD') and path in (
            '/.well-known/assetlinks.json',
            '/.well-known/apple-app-site-association',
        ):
            if path.endswith('assetlinks.json'):
                resp = _json_response(assetlinks_body())
            else:
                resp = _json_response(aasa_body())
                if not ios_team_id():
                    resp['X-Daxi-AASA'] = 'team-id-not-configured'
            if request.method == 'HEAD':
                resp.content = b''
            return resp
        return self.get_response(request)
