from django.apps import AppConfig


class JulminTaxisConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'julmin_taxis'
    verbose_name = 'DAXI Core'

    def ready(self):
        try:
            from julmin_taxis.scheduled_tasks import start_background_scheduler
            start_background_scheduler()
        except Exception:
            pass
