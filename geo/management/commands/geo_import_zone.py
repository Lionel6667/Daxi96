import threading

from django.core.management.base import BaseCommand, CommandError

from geo.models import DownloadJob, GeoZone
from geo.services.osm_importer import run_zone_import_pipeline


class Command(BaseCommand):
    help = 'Import OSM pour une zone DAXI (Geofabrik Haiti + osmium filtre département)'

    def add_arguments(self, parser):
        parser.add_argument('--zone-id', type=int, required=True, help='ID GeoZone')
        parser.add_argument('--async', dest='run_async', action='store_true', help='Lancer en arrière-plan')

    def handle(self, *args, **options):
        zone_id = options['zone_id']
        try:
            zone = GeoZone.objects.get(pk=zone_id)
        except GeoZone.DoesNotExist:
            raise CommandError(f'GeoZone {zone_id} introuvable')

        job = DownloadJob.objects.create(zone=zone, status='queued')
        self.stdout.write(f'Job #{job.pk} créé pour {zone.name}')

        if options['run_async']:
            t = threading.Thread(
                target=run_zone_import_pipeline,
                args=(zone_id, job.pk),
                daemon=True,
            )
            t.start()
            self.stdout.write(self.style.SUCCESS(f'Import lancé en arrière-plan (job #{job.pk})'))
            return

        zone.status = 'downloading'
        zone.save(update_fields=['status'])
        run_zone_import_pipeline(zone_id, job.pk)
        self.stdout.write(self.style.SUCCESS(f'Import terminé — job #{job.pk}'))
