"""Client Gemini — plusieurs modèles, clé serveur uniquement."""
from __future__ import annotations

import base64
import json
import logging
import os
import re

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

GEMINI_GENERATE_URL = (
    'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent'
)
MODEL_CANDIDATES = (
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-2.0-flash-001',
    'gemini-1.5-flash',
    'gemini-1.5-flash-latest',
    'gemini-flash-latest',
)


def gemini_api_key() -> str:
    return (getattr(settings, 'GEMINI_API_KEY', '') or os.environ.get('GEMINI_API_KEY', '')).strip()


def _extract_text(data: dict) -> str:
    try:
        cands = data.get('candidates') or []
        if not cands:
            return ''
        parts = (cands[0].get('content') or {}).get('parts') or []
        return ''.join(p.get('text', '') for p in parts).strip()
    except (KeyError, IndexError, TypeError):
        return ''


def _parse_json_object(text: str) -> dict:
    if not text:
        raise ValueError('Réponse Gemini vide')
    start, end = text.find('{'), text.rfind('}')
    if start >= 0 and end > start:
        text = text[start:end + 1]
    return json.loads(text)


def _post_generate(key: str, model: str, body: dict, timeout: int):
    url = GEMINI_GENERATE_URL.format(model=model)
    headers = {'Content-Type': 'application/json', 'x-goog-api-key': key}
    resp = requests.post(url, params={'key': key}, headers=headers, json=body, timeout=timeout)
    try:
        data = resp.json()
    except Exception:
        data = {'error': {'message': (resp.text or '')[:240]}}
    return resp.status_code, data


def gemini_generate(
    prompt: str,
    *,
    system: str = '',
    image_bytes: bytes | None = None,
    mime_type: str = 'image/jpeg',
    json_mode: bool = False,
    timeout: int = 28,
    model: str | None = None,
) -> str:
    key = gemini_api_key()
    if not key:
        raise RuntimeError('GEMINI_API_KEY manquante')

    preferred = (model or getattr(settings, 'GEMINI_MODEL', '') or '').strip()
    models = []
    for m in (preferred,) + MODEL_CANDIDATES:
        if m and m not in models:
            models.append(m)

    parts = []
    user_text = prompt or ''
    if system:
        user_text = system.strip() + '\n\n---\nQuestion / conversation :\n' + user_text
    if user_text:
        parts.append({'text': user_text})
    if image_bytes:
        b64 = base64.b64encode(image_bytes).decode('ascii')
        mt = mime_type or 'image/jpeg'
        if mt == 'image/jpg':
            mt = 'image/jpeg'
        parts.append({'inline_data': {'mime_type': mt, 'data': b64}})

    gen = {
        'temperature': 0.35 if json_mode else 0.7,
        'maxOutputTokens': 1200 if json_mode else 900,
    }
    if json_mode:
        gen['responseMimeType'] = 'application/json'

    last_err = 'Gemini indisponible'
    for mdl in models:
        body = {'contents': [{'role': 'user', 'parts': parts}], 'generationConfig': gen}
        if system:
            body['systemInstruction'] = {'parts': [{'text': system}]}
        try:
            status, data = _post_generate(key, mdl, body, timeout)
        except Exception as exc:
            last_err = str(exc)
            continue
        if status != 200:
            last_err = (data.get('error') or {}).get('message') or f'HTTP {status}'
            logger.warning('[DAXI AI] Gemini %s: %s', mdl, last_err[:180])
            continue
        text = _extract_text(data)
        if text:
            return text
        last_err = 'Réponse vide (%s)' % mdl
    raise RuntimeError(last_err)


def gemini_generate_json(prompt: str, **kwargs) -> dict:
    kwargs['json_mode'] = True
    raw = gemini_generate(prompt, **kwargs)
    try:
        return _parse_json_object(raw)
    except json.JSONDecodeError:
        cleaned = re.sub(r'```json|```', '', raw).strip()
        return _parse_json_object(cleaned)
