from django.core.management.base import BaseCommand

from admin_panel.models import CoveredDepartment
from geo.models import GeoZone


class Command(BaseCommand):
    help = 'Crée une GeoZone pour chaque département couvert actif'

    def handle(self, *args, **options):
        created = 0
        for dept in CoveredDepartment.objects.filter(is_active=True):
            zone, was_created = GeoZone.objects.get_or_create(
                department_slug=dept.slug,
                defaults={
                    'name': dept.name,
                    'department': dept,
                    'status': 'not_downloaded',
                },
            )
            if was_created:
                created += 1
                self.stdout.write(f'  + {zone.name}')
        self.stdout.write(self.style.SUCCESS(f'{created} zone(s) créée(s)'))
