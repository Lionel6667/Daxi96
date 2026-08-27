"""Crée des comptes démo client, chauffeur et entreprise pour les tests."""
import hashlib

from django.core.management.base import BaseCommand
from django.contrib.auth.hashers import make_password
from django.utils import timezone

from accounts.models import CustomUser
from drivers.models import Driver
from enterprises.models import Enterprise


DEMO_PASSWORD = 'DemoDaxi2026!'

ACCOUNTS = {
    'client': {
        'email': 'demo.client@daxi.ht',
        'username': 'demo.client@daxi.ht',
        'first_name': 'Jean',
        'last_name': 'Client',
        'phone': '+50937000001',
        'firebase_user_id': '9001',
    },
    'driver': {
        'email': 'demo.driver@daxi.ht',
        'first_name': 'Marc',
        'last_name': 'Chauffeur',
        'phone': '+50937000002',
        'plate': 'DAXI-001',
        'vehicle': 'Toyota Corolla',
        'car_brand': 'Toyota',
        'car_model': 'Corolla',
        'car_year': '2020',
    },
    'enterprise': {
        'name': 'DAXI Demo Entreprise',
        'email': 'demo.entreprise@daxi.ht',
        'phone': '+50937000003',
        'mode': 'self_order',
        'presentation': 'Compte démo — commandes directes pour nos clients.',
    },
    'enterprise_shared': {
        'name': 'DAXI Demo Lien',
        'email': 'demo.lien@daxi.ht',
        'phone': '+50937000004',
        'mode': 'shared_code',
        'presentation': 'Compte démo — lien affilié partagé aux clients.',
    },
    'admin': {
        'email': 'admin@daxi.com',
        'username': 'admin@daxi.com',
        'first_name': 'Admin',
        'last_name': 'DAXI',
    },
}


class Command(BaseCommand):
    help = 'Crée ou met à jour les comptes démo DAXI (client, chauffeur, entreprise).'

    def handle(self, *args, **options):
        pw_hash_sha = hashlib.sha256(DEMO_PASSWORD.encode()).hexdigest()

        c = ACCOUNTS['client']
        user, created = CustomUser.objects.update_or_create(
            email=c['email'],
            defaults={
                'username': c['username'],
                'first_name': c['first_name'],
                'last_name': c['last_name'],
                'phone': c['phone'],
                'firebase_user_id': c['firebase_user_id'],
                'is_verified': True,
                'is_active': True,
            },
        )
        user.set_password(DEMO_PASSWORD)
        user.save()
        self.stdout.write(self.style.SUCCESS(
            f"Client {'créé' if created else 'mis à jour'}: {c['email']}"
        ))

        d = ACCOUNTS['driver']
        driver, d_created = Driver.objects.update_or_create(
            email=d['email'],
            defaults={
                'firstname': d['first_name'],
                'lastname': d['last_name'],
                'full_name': f"{d['first_name']} {d['last_name']}",
                'phone': d['phone'],
                'plate': d['plate'],
                'vehicle': d['vehicle'],
                'car_brand': d['car_brand'],
                'car_model': d['car_model'],
                'car_year': d['car_year'],
                'password_hash': pw_hash_sha,
                'status': 'available',
                'is_verified': True,
                'is_blocked': False,
                'latitude': 19.7602,
                'longitude': -72.2040,
                'rating': 4.8,
                'rating_count': 12,
            },
        )
        self.stdout.write(self.style.SUCCESS(
            f"Chauffeur {'créé' if d_created else 'mis à jour'}: {d['email']}"
        ))

        e = ACCOUNTS['enterprise']
        ent, e_created = Enterprise.objects.update_or_create(
            email=e['email'],
            name=e['name'],
            defaults={
                'phone': e['phone'],
                'password_hash': make_password(DEMO_PASSWORD),
                'status': 'approved',
                'mode': e['mode'],
                'presentation': e['presentation'],
                'commission_percent': 10.0,
                'approved_at': timezone.now(),
            },
        )
        self.stdout.write(self.style.SUCCESS(
            f"Entreprise {'créée' if e_created else 'mise à jour'}: {e['email']} (mode: {e['mode']})"
        ))

        es = ACCOUNTS['enterprise_shared']
        ent2, e2_created = Enterprise.objects.update_or_create(
            email=es['email'],
            name=es['name'],
            defaults={
                'phone': es['phone'],
                'password_hash': make_password(DEMO_PASSWORD),
                'status': 'approved',
                'mode': es['mode'],
                'presentation': es['presentation'],
                'commission_percent': 10.0,
                'approved_at': timezone.now(),
            },
        )
        self.stdout.write(self.style.SUCCESS(
            f"Entreprise {'créée' if e2_created else 'mise à jour'}: {es['email']} (mode: {es['mode']})"
        ))

        a = ACCOUNTS['admin']
        admin_user, a_created = CustomUser.objects.update_or_create(
            email=a['email'],
            defaults={
                'username': a['username'],
                'first_name': a['first_name'],
                'last_name': a['last_name'],
                'is_staff': True,
                'is_superuser': True,
                'is_active': True,
                'is_verified': True,
            },
        )
        admin_user.set_password(DEMO_PASSWORD)
        admin_user.save()
        self.stdout.write(self.style.SUCCESS(
            f"Admin {'créé' if a_created else 'mis à jour'}: {a['email']}"
        ))

        self.stdout.write('')
        self.stdout.write(self.style.WARNING('=== IDENTIFIANTS DÉMO ==='))
        self.stdout.write(f"Mot de passe commun: {DEMO_PASSWORD}")
        self.stdout.write('')
        self.stdout.write('CLIENT — / (modal Connexion)')
        self.stdout.write(f"  Email: {c['email']}")
        self.stdout.write(f"  ID optionnel: {c['firebase_user_id']}")
        self.stdout.write('')
        self.stdout.write('CHAUFFEUR — /driver/login/')
        self.stdout.write(f"  Email: {d['email']}")
        self.stdout.write('')
        self.stdout.write('ENTREPRISE (commande directe) — /entreprise/')
        self.stdout.write(f"  Email: {e['email']}")
        self.stdout.write(f"  Mode: commande directe (self_order)")
        self.stdout.write(f"  Code affilié: {ent.affiliate_code}")
        self.stdout.write('')
        self.stdout.write('ENTREPRISE (lien client) — /entreprise/')
        self.stdout.write(f"  Email: {es['email']}")
        self.stdout.write(f"  Mode: lien partagé (shared_code)")
        self.stdout.write(f"  Code affilié: {ent2.affiliate_code}")
        self.stdout.write('')
        self.stdout.write('ADMIN — /admin-dashboard/')
        self.stdout.write(f"  Email: {a['email']}")
        self.stdout.write(f"  Mot de passe: {DEMO_PASSWORD}")
