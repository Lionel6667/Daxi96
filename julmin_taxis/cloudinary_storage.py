"""Stockage Cloudinary pour fichiers média Django (repli local uniquement si non configuré)."""
from __future__ import annotations

import os

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import FileSystemStorage, Storage
from django.utils.deconstruct import deconstructible

from julmin_taxis.media_utils import (
    cloudinary_configured,
    delete_cloudinary_public_id,
    upload_image_to_cloudinary,
)


@deconstructible
class CloudinaryMediaStorage(Storage):
    """Upload vers Cloudinary ; supprime l'ancien asset lors du remplacement."""

    def __init__(self, folder: str = 'daxi/media'):
        self.folder = folder.strip('/') or 'daxi/media'

    def deconstruct(self):
        return (
            'julmin_taxis.cloudinary_storage.CloudinaryMediaStorage',
            [],
            {'folder': self.folder},
        )

    def _local_fallback(self):
        return FileSystemStorage(location=settings.MEDIA_ROOT, base_url=settings.MEDIA_URL)

    def save(self, name, content, max_length=None):
        if not cloudinary_configured():
            return self._local_fallback().save(
                os.path.join(self.folder, name or ''), content, max_length=max_length
            )
        if name and not name.startswith('http') and '/' in name:
            delete_cloudinary_public_id(name)
        url, public_id = upload_image_to_cloudinary(
            content, folder=self.folder, validate=False,
        )
        if url:
            return public_id or url
        raise IOError(f'Cloudinary upload failed: {public_id or "unknown error"}')

    def delete(self, name):
        if not name:
            return
        if cloudinary_configured() and not str(name).startswith('http'):
            delete_cloudinary_public_id(name)
            return
        try:
            self._local_fallback().delete(name)
        except Exception:
            pass

    def exists(self, name):
        if not name:
            return False
        name = str(name).lstrip('/')
        if name.startswith('daxi/') or name.startswith('http://') or name.startswith('https://'):
            return True
        return self._local_fallback().exists(name)

    def url(self, name):
        if not name:
            return ''
        name = str(name).lstrip('/')
        if name.startswith('http://') or name.startswith('https://'):
            return name
        if cloudinary_configured():
            cloud_name = getattr(settings, 'CLOUDINARY_CLOUD_NAME', '')
            if cloud_name:
                if name.startswith('daxi/'):
                    return f'https://res.cloudinary.com/{cloud_name}/image/upload/{name}'
                if name.startswith('drivers/'):
                    pid = f'{self.folder}/{os.path.basename(name)}'
                    return f'https://res.cloudinary.com/{cloud_name}/image/upload/{pid}'
        return self._local_fallback().url(name)

    def size(self, name):
        return 0

    def open(self, name, mode='rb'):
        if not name:
            raise FileNotFoundError(name)
        if cloudinary_configured():
            import requests
            url = self.url(name)
            if url.startswith('http'):
                r = requests.get(url, timeout=30)
                r.raise_for_status()
                return ContentFile(r.content, name=os.path.basename(str(name)))
        return self._local_fallback().open(name, mode)


def media_storage(folder: str) -> CloudinaryMediaStorage:
    return CloudinaryMediaStorage(folder=folder)


def driver_storage(subfolder: str) -> Storage:
    folder = f'daxi/drivers/{subfolder}'
    if cloudinary_configured():
        return CloudinaryMediaStorage(folder=folder)
    return FileSystemStorage(location=settings.MEDIA_ROOT, base_url=settings.MEDIA_URL)
