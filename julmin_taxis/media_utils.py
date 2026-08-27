"""Cloudinary upload helper for chat images and voice notes.

Uses CLOUDINARY_* from settings (.env). If credentials are set, chat audio/images
go to Cloudinary. Local /media/ is only a fallback when Cloudinary is unavailable.
"""
import hashlib
import os
import re
import time
import uuid
import requests
from django.conf import settings

from julmin_taxis.security_utils import (
    ALLOWED_AUDIO_MIMES,
    ALLOWED_IMAGE_MIMES,
    MAX_AUDIO_BYTES,
    MAX_IMAGE_BYTES,
    safe_media_ext,
    validate_upload,
)

_CLOUDINARY_URL_RE = re.compile(
    r'res\.cloudinary\.com/([^/]+)/(?:image|video)/upload/(?:v\d+/)?(.+)$',
    re.I,
)


def cloudinary_configured() -> bool:
    return all([
        getattr(settings, 'CLOUDINARY_CLOUD_NAME', ''),
        getattr(settings, 'CLOUDINARY_API_KEY', ''),
        getattr(settings, 'CLOUDINARY_API_SECRET', ''),
    ])


def _cloudinary_sign(params: str) -> str:
    secret = getattr(settings, 'CLOUDINARY_API_SECRET', '')
    return hashlib.sha1(f'{params}{secret}'.encode()).hexdigest()


def parse_cloudinary_public_id(url_or_id: str) -> tuple[str, str]:
    """Return (public_id, resource_type) from URL or bare public_id."""
    raw = (url_or_id or '').strip()
    if not raw:
        return '', 'image'
    if raw.startswith('http'):
        m = _CLOUDINARY_URL_RE.search(raw)
        if m:
            path = m.group(2)
            if '.' in path.rsplit('/', 1)[-1]:
                path = path.rsplit('.', 1)[0]
            return path, 'image'
        return '', 'image'
    return raw, 'image'


def delete_cloudinary_public_id(public_id: str, resource_type: str = 'image') -> bool:
    if not public_id or not cloudinary_configured():
        return False
    pid, rtype = parse_cloudinary_public_id(public_id)
    if not pid:
        return False
    cloud_name = settings.CLOUDINARY_CLOUD_NAME
    api_key = settings.CLOUDINARY_API_KEY
    timestamp = str(int(time.time()))
    params = f'public_id={pid}&timestamp={timestamp}'
    signature = _cloudinary_sign(params)
    destroy_url = f'https://api.cloudinary.com/v1_1/{cloud_name}/{rtype}/destroy'
    try:
        r = requests.post(
            destroy_url,
            data={
                'public_id': pid,
                'api_key': api_key,
                'timestamp': timestamp,
                'signature': signature,
            },
            timeout=20,
        )
        return r.ok
    except Exception:
        return False


def delete_cloudinary_url(url: str) -> bool:
    pid, rtype = parse_cloudinary_public_id(url)
    if pid:
        return delete_cloudinary_public_id(pid, rtype)
    return False


def upload_image_to_cloudinary(file_obj, folder='daxi/media', public_id: str | None = None):
    """
    Upload image to Cloudinary.
    Returns (secure_url, public_id) or (None, error_message).
    """
    err = validate_upload(file_obj, allowed_mimes=ALLOWED_IMAGE_MIMES, max_bytes=MAX_IMAGE_BYTES)
    if err:
        return None, err
    if not cloudinary_configured():
        return None, 'Cloudinary non configuré'

    if hasattr(file_obj, 'seek'):
        file_obj.seek(0)

    cloud_name = settings.CLOUDINARY_CLOUD_NAME
    api_key = settings.CLOUDINARY_API_KEY
    timestamp = str(int(time.time()))
    sign_parts = f'timestamp={timestamp}&folder={folder}'
    if public_id:
        sign_parts += f'&public_id={public_id}'
    signature = _cloudinary_sign(sign_parts)

    data = {
        'api_key': api_key,
        'timestamp': timestamp,
        'folder': folder,
        'signature': signature,
    }
    if public_id:
        data['public_id'] = public_id

    url = f'https://api.cloudinary.com/v1_1/{cloud_name}/image/upload'
    try:
        r = requests.post(url, files={'file': file_obj}, data=data, timeout=60)
        r.raise_for_status()
        body = r.json()
        return body.get('secure_url'), body.get('public_id')
    except Exception as e:
        return None, str(e)


def upload_chat_image(file_obj, folder='daxi/chat'):
    url, meta = upload_image_to_cloudinary(file_obj, folder=folder)
    if url:
        return url, None
    if cloudinary_configured():
        return None, meta or 'Upload Cloudinary échoué'

    from django.core.files.storage import default_storage
    ext = safe_media_ext(file_obj, '.jpg')
    name = f'{folder}/{uuid.uuid4().hex}{ext}'
    try:
        path = default_storage.save(name, file_obj)
        media_url = getattr(settings, 'MEDIA_URL', '/media/')
        return f'{media_url.rstrip("/")}/{path}', None
    except Exception as e:
        return None, str(e)


def upload_chat_audio(file_obj, folder='daxi/chat_audio'):
    """Upload vocal — Cloudinary si configuré, sinon stockage local media."""
    err = validate_upload(file_obj, allowed_mimes=ALLOWED_AUDIO_MIMES, max_bytes=MAX_AUDIO_BYTES)
    if err:
        return None, err
    cloud_name = getattr(settings, 'CLOUDINARY_CLOUD_NAME', '')
    api_key = getattr(settings, 'CLOUDINARY_API_KEY', '')
    api_secret = getattr(settings, 'CLOUDINARY_API_SECRET', '')
    if all([cloud_name, api_key, api_secret]):
        timestamp = str(int(time.time()))
        params = f'timestamp={timestamp}&folder={folder}&resource_type=video{api_secret}'
        signature = hashlib.sha1(params.encode()).hexdigest()
        data = {
            'api_key': api_key,
            'timestamp': timestamp,
            'folder': folder,
            'signature': signature,
        }
        url = f'https://api.cloudinary.com/v1_1/{cloud_name}/video/upload'
        try:
            r = requests.post(url, files={'file': file_obj}, data=data, timeout=60)
            r.raise_for_status()
            return r.json().get('secure_url'), None
        except Exception as e:
            return None, str(e)

    from django.core.files.storage import default_storage
    ext = safe_media_ext(file_obj, '.webm')
    name = f'{folder}/{uuid.uuid4().hex}{ext}'
    try:
        path = default_storage.save(name, file_obj)
        media_url = getattr(settings, 'MEDIA_URL', '/media/')
        return f'{media_url.rstrip("/")}/{path}', None
    except Exception as e:
        return None, str(e)
