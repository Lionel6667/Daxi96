"""Cloudinary upload helper for images and chat voice notes.

Uses CLOUDINARY_* from settings. If credentials are set, media goes to Cloudinary.
Local /media/ is only a fallback when Cloudinary is unavailable (dev / tests).
"""
from __future__ import annotations

import base64
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
    r'res\.cloudinary\.com/([^/]+)/(image|video|raw)/upload/(?:v\d+/)?(.+)$',
    re.I,
)
_DATA_IMG_RE = re.compile(
    r'''src=(['"])data:image/([a-zA-Z0-9+.-]+);base64,([A-Za-z0-9+/=\s]+)\1''',
    re.I,
)


def cloudinary_configured() -> bool:
    return all([
        getattr(settings, 'CLOUDINARY_CLOUD_NAME', ''),
        getattr(settings, 'CLOUDINARY_API_KEY', ''),
        getattr(settings, 'CLOUDINARY_API_SECRET', ''),
    ])


def _cloudinary_sign_params(params: dict) -> str:
    """Cloudinary requires alphabetically sorted key=value pairs, then the API secret."""
    secret = getattr(settings, 'CLOUDINARY_API_SECRET', '')
    to_sign = '&'.join(
        f'{k}={params[k]}' for k in sorted(params) if params[k] is not None and params[k] != ''
    )
    return hashlib.sha1(f'{to_sign}{secret}'.encode()).hexdigest()


def parse_cloudinary_public_id(url_or_id: str) -> tuple[str, str]:
    """Return (public_id, resource_type) from URL or bare public_id."""
    raw = (url_or_id or '').strip()
    if not raw:
        return '', 'image'
    if raw.startswith('http'):
        m = _CLOUDINARY_URL_RE.search(raw)
        if m:
            rtype = (m.group(2) or 'image').lower()
            path = m.group(3)
            if '.' in path.rsplit('/', 1)[-1]:
                path = path.rsplit('.', 1)[0]
            return path, rtype
        return '', 'image'
    return raw, 'image'


def delete_cloudinary_public_id(public_id: str, resource_type: str = 'image') -> bool:
    if not public_id or not cloudinary_configured():
        return False
    pid, parsed_type = parse_cloudinary_public_id(public_id)
    if not pid:
        return False
    rtype = parsed_type or resource_type or 'image'
    cloud_name = settings.CLOUDINARY_CLOUD_NAME
    api_key = settings.CLOUDINARY_API_KEY
    timestamp = str(int(time.time()))
    signature = _cloudinary_sign_params({'public_id': pid, 'timestamp': timestamp})
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


def _post_cloudinary(file_obj, folder: str, resource_type: str = 'image', public_id: str | None = None):
    if hasattr(file_obj, 'seek'):
        file_obj.seek(0)
    cloud_name = settings.CLOUDINARY_CLOUD_NAME
    api_key = settings.CLOUDINARY_API_KEY
    timestamp = str(int(time.time()))
    sign_params = {'timestamp': timestamp, 'folder': folder}
    if public_id:
        sign_params['public_id'] = public_id
    signature = _cloudinary_sign_params(sign_params)
    data = {
        'api_key': api_key,
        'timestamp': timestamp,
        'folder': folder,
        'signature': signature,
    }
    if public_id:
        data['public_id'] = public_id
    url = f'https://api.cloudinary.com/v1_1/{cloud_name}/{resource_type}/upload'
    filename = getattr(file_obj, 'name', None) or 'upload.bin'
    content_type = getattr(file_obj, 'content_type', None) or 'application/octet-stream'
    r = requests.post(
        url,
        files={'file': (os.path.basename(str(filename)), file_obj, content_type)},
        data=data,
        timeout=60,
    )
    r.raise_for_status()
    body = r.json()
    return body.get('secure_url'), body.get('public_id')


def upload_image_to_cloudinary(
    file_obj,
    folder='daxi/media',
    public_id: str | None = None,
    *,
    validate: bool = True,
):
    """
    Upload image to Cloudinary.
    Returns (secure_url, public_id) or (None, error_message).
    """
    if validate:
        err = validate_upload(file_obj, allowed_mimes=ALLOWED_IMAGE_MIMES, max_bytes=MAX_IMAGE_BYTES)
        if err:
            return None, err
    if not cloudinary_configured():
        return None, 'Cloudinary non configuré'
    try:
        return _post_cloudinary(file_obj, folder, resource_type='image', public_id=public_id)
    except Exception as e:
        return None, str(e)


def upload_image_bytes_to_cloudinary(
    image_bytes, filename='image.png', folder='daxi/media', content_type='image/png',
):
    """Upload raw image bytes (e.g. AI-generated cars) to Cloudinary."""
    from django.core.files.uploadedfile import SimpleUploadedFile
    file_obj = SimpleUploadedFile(filename, image_bytes, content_type=content_type)
    return upload_image_to_cloudinary(file_obj, folder=folder)


def rewrite_html_data_images_to_cloudinary(html: str) -> str:
    """Replace data-URI <img> tags with Cloudinary URLs (Quill paste / toolbar)."""
    if not html or 'data:image/' not in html:
        return html or ''
    if not cloudinary_configured():
        return html

    def _repl(match):
        quote, mime, b64 = match.group(1), match.group(2).lower(), match.group(3)
        try:
            raw = base64.b64decode(re.sub(r'\s+', '', b64))
        except Exception:
            return match.group(0)
        if not raw:
            return match.group(0)
        ext = 'png' if 'png' in mime else ('webp' if 'webp' in mime else 'jpg')
        from django.core.files.uploadedfile import SimpleUploadedFile
        f = SimpleUploadedFile(f'inline.{ext}', raw, content_type=f'image/{mime.split("+")[0]}')
        url, _err = upload_image_to_cloudinary(f, folder='daxi/blog/inline')
        if not url:
            return match.group(0)
        return f'src={quote}{url}{quote}'

    return _DATA_IMG_RE.sub(_repl, html)


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
    """Upload vocal — Cloudinary video endpoint (audio), sinon stockage local."""
    err = validate_upload(file_obj, allowed_mimes=ALLOWED_AUDIO_MIMES, max_bytes=MAX_AUDIO_BYTES)
    if err:
        return None, err
    if cloudinary_configured():
        try:
            url, _pid = _post_cloudinary(file_obj, folder, resource_type='video')
            if url:
                return url, None
            return None, 'Upload Cloudinary audio échoué'
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
