from django.apps import AppConfig


class GeoConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'geo'
    verbose_name = 'Géographie DAXI'

    def ready(self):
        from django.conf import settings
        if getattr(settings, 'USE_POSTGIS', False):
            return
        try:
            from django.db import connection
            if connection.vendor != 'sqlite':
                return
            with connection.cursor() as cursor:
                cursor.execute('PRAGMA journal_mode=WAL;')
                cursor.execute('PRAGMA busy_timeout=60000;')
        except Exception:
            pass
