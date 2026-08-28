"""Données de test admin — vérifie que PostgreSQL alimente bien le dashboard."""
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone

TEST_TAG = '__daxi_test_seed__'
TEST_EMAIL_DOMAIN = '@test-seed.daxi.ht'


class Command(BaseCommand):
    help = 'Crée des enregistrements de test (chauffeur en attente, entreprise, commande, lieu, zone) pour l’admin.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--clean',
            action='store_true',
            help='Supprime les enregistrements de test précédents avant de recréer.',
        )
        parser.add_argument(
            '--verify',
            action='store_true',
            help='Affiche les compteurs admin après création.',
        )

    def handle(self, *args, **options):
        if options['clean']:
            self._clean()
        created = self._seed()
        for label, n in created.items():
            self.stdout.write(f'  {label}: {n}')
        if options['verify']:
            self._print_counts()
        self.stdout.write(self.style.SUCCESS(
            'OK - Ouvre Admin > Chauffeurs > En attente (2e onglet) et les autres sections.'
        ))

    def _clean(self):
        from drivers.models import Driver
        from enterprises.models import Enterprise
        from lieux.models import LieuxCategory, LieuxPlace
        from orders.models import LostObject, Order
        from pricing.models import PricingZone

        Driver.objects.filter(verification_notes__contains=TEST_TAG).delete()
        Driver.objects.filter(email__endswith=TEST_EMAIL_DOMAIN).delete()
        Enterprise.objects.filter(admin_notes__contains=TEST_TAG).delete()
        Enterprise.objects.filter(email__endswith=TEST_EMAIL_DOMAIN).delete()
        Order.objects.filter(description__contains=TEST_TAG).delete()
        LieuxPlace.objects.filter(description__contains=TEST_TAG).delete()
        LieuxCategory.objects.filter(slug='test-seed-lieux').delete()
        PricingZone.objects.filter(notes__contains=TEST_TAG).delete()
        LostObject.objects.filter(description__contains=TEST_TAG).delete()
        get_user_model().objects.filter(email__endswith=TEST_EMAIL_DOMAIN).delete()

    def _seed(self) -> dict:
        from drivers.models import Driver
        from enterprises.models import Enterprise
        from lieux.models import LieuxCategory, LieuxPlace
        from orders.models import LostObject, Order
        from pricing.models import PricingZone

        stamp = timezone.now().strftime('%H%M')
        notes = f'{TEST_TAG} seed {stamp}'

        driver, _ = Driver.objects.get_or_create(
            email=f'chauffeur.test{stamp}{TEST_EMAIL_DOMAIN}',
            defaults={
                'firstname': 'Test',
                'lastname': 'Chauffeur',
                'full_name': 'Test Chauffeur (seed)',
                'phone': f'+5093700{stamp}',
                'city': 'Cap-Haïtien',
                'plate': f'TST-{stamp}',
                'vehicle': 'Toyota Test',
                'car_brand': 'Toyota',
                'car_model': 'Test',
                'password_hash': 'seed',
                'is_verified': False,
                'is_blocked': False,
                'verification_notes': notes,
            },
        )
        if driver.is_verified or driver.is_blocked:
            driver.is_verified = False
            driver.is_blocked = False
            driver.verification_notes = notes
            driver.save(update_fields=['is_verified', 'is_blocked', 'verification_notes'])

        ent, _ = Enterprise.objects.get_or_create(
            email=f'entreprise.test{stamp}{TEST_EMAIL_DOMAIN}',
            name=f'Entreprise Test Seed {stamp}',
            defaults={
                'phone': f'+5093800{stamp}',
                'password_hash': 'seed',
                'status': 'pending',
                'presentation': notes,
                'admin_notes': notes,
            },
        )
        if ent.status != 'pending':
            ent.status = 'pending'
            ent.admin_notes = notes
            ent.save(update_fields=['status', 'admin_notes'])

        order, _ = Order.objects.get_or_create(
            client_email=f'client.test{stamp}{TEST_EMAIL_DOMAIN}',
            pickup=f'Pickup test {stamp}',
            destination=f'Destination test {stamp}',
            defaults={
                'client_name': 'Client Test Seed',
                'client_phone': f'+5093900{stamp}',
                'status': 'pending',
                'description': notes,
            },
        )

        cat, _ = LieuxCategory.objects.get_or_create(
            slug='test-seed-lieux',
            defaults={'name': 'Test seed lieux', 'icon': 'ri-map-pin-line', 'order': 999},
        )
        place, _ = LieuxPlace.objects.get_or_create(
            name=f'Lieu test seed {stamp}',
            defaults={
                'category': cat,
                'city': 'Cap-Haïtien',
                'description': notes,
                'is_published': False,
                'is_listed': True,
                'latitude': 19.76,
                'longitude': -72.20,
            },
        )

        zone, _ = PricingZone.objects.get_or_create(
            name=f'Zone test seed {stamp}',
            defaults={
                'polygon': {
                    'type': 'Polygon',
                    'coordinates': [[
                        [-72.21, 19.75], [-72.19, 19.75], [-72.19, 19.77], [-72.21, 19.77], [-72.21, 19.75],
                    ]],
                },
                'notes': notes,
                'is_active': True,
            },
        )

        lost = LostObject.objects.filter(description__contains=TEST_TAG).first()
        if not lost:
            lost = LostObject.objects.create(
                order=order,
                description=notes,
                status='reported',
                driver_handled=False,
            )

        User = get_user_model()
        user, _ = User.objects.get_or_create(
            username=f'client.test{stamp}{TEST_EMAIL_DOMAIN}',
            defaults={
                'email': f'client.test{stamp}{TEST_EMAIL_DOMAIN}',
                'first_name': 'Client',
                'last_name': 'Seed',
                'phone': f'+5093900{stamp}',
            },
        )
        if not user.has_usable_password():
            user.set_password('TestSeed123!')
            user.save(update_fields=['password'])

        return {
            'pending_driver_id': driver.pk,
            'pending_enterprise_id': ent.pk,
            'pending_order_id': order.pk,
            'lieu_id': place.pk,
            'zone_id': zone.pk,
            'lost_object_id': lost.pk,
            'test_user_id': user.pk,
        }

    def _print_counts(self):
        from admin_panel.views import compute_admin_badge_counts
        from drivers.models import Driver
        from enterprises.models import Enterprise
        from lieux.models import LieuxPlace
        from orders.models import Order

        class _Req:
            session = {}

        badges = compute_admin_badge_counts(_Req())
        pending_drivers = Driver.objects.filter(is_verified=False, is_blocked=False).count()
        pending_ent = Enterprise.objects.filter(status='pending').count()
        pending_orders = Order.objects.filter(status='pending').count()
        lieux = LieuxPlace.objects.filter(description__contains=TEST_TAG).count()

        self.stdout.write('--- Vérification PostgreSQL ---')
        self.stdout.write(f'  Chauffeurs en attente (DB): {pending_drivers}')
        self.stdout.write(f'  Entreprises pending (DB): {pending_ent}')
        self.stdout.write(f'  Commandes pending (DB): {pending_orders}')
        self.stdout.write(f'  Lieux seed (DB): {lieux}')
        self.stdout.write(f'  Badge admin drivers: {badges.get("drivers")}')
        self.stdout.write(f'  Badge admin orders: {badges.get("orders")}')
        self.stdout.write(f'  Badge admin enterprises: {badges.get("enterprises")}')
