"""Stockage Cloudinary pour fichiers média Django (avec repli local si non configuré)."""
from __future__ import annotations

import os
from django.conf import settings
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
        return (self.__class__.__qualname__, [], {'folder': self.folder})

    def _local_fallback(self):
        return FileSystemStorage(location=settings.MEDIA_ROOT, base_url=settings.MEDIA_URL)

    def save(self, name, content, max_length=None):
        if not cloudinary_configured():
            return self._local_fallback().save(
                os.path.join(self.folder, name or ''), content, max_length=max_length
            )
        if name and not name.startswith('http') and '/' in name:
            delete_cloudinary_public_id(name)
        url, public_id = upload_image_to_cloudinary(content, folder=self.folder)
        if public_id:
            return public_id
        if url:
            return url
        return self._local_fallback().save(
            os.path.join(self.folder, name or ''), content, max_length=max_length
        )

    def delete(self, name):
        if not name:
            return
        if cloudinary_configured() and not name.startswith('http'):
            delete_cloudinary_public_id(name)
            return
        try:
            self._local_fallback().delete(name)
        except Exception:
            pass

    def exists(self, name):
        return bool(name)

    def url(self, name):
        if not name:
            return ''
        if name.startswith('http://') or name.startswith('https://'):
            return name
        if cloudinary_configured():
            cloud_name = getattr(settings, 'CLOUDINARY_CLOUD_NAME', '')
            if cloud_name:
                return f'https://res.cloudinary.com/{cloud_name}/image/upload/{name}'
        return self._local_fallback().url(name)

    def size(self, name):
        return 0

    def open(self, name, mode='rb'):
        return self._local_fallback().open(name, mode)


def driver_storage(subfolder: str) -> Storage:
    folder = f'daxi/drivers/{subfolder}'
    if cloudinary_configured():
        return CloudinaryMediaStorage(folder=folder)
    return FileSystemStorage(location=settings.MEDIA_ROOT, base_url=settings.MEDIA_URL)
