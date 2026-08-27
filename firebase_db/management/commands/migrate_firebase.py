"""
Management command: migrate_firebase
Migre toutes les données Firebase RTDB vers Django SQLite.
Usage: python manage.py migrate_firebase
"""
import json
import os
from datetime import datetime, timezone
from django.core.management.base import BaseCommand
from django.conf import settings
from django.db import transaction


def ts_to_dt(ms):
    """Convertit un timestamp Firebase (ms) en datetime Django."""
    if not ms:
        return None
    try:
        return datetime.fromtimestamp(int(ms) / 1000, tz=timezone.utc)
    except Exception:
        return None


class Command(BaseCommand):
    help = 'Migre les données Firebase RTDB vers Django SQLite'

    def add_arguments(self, parser):
        parser.add_argument(
            '--file',
            default=None,
            help='Chemin vers le fichier JSON exporté Firebase (défaut: auto-détection)',
        )
        parser.add_argument(
            '--skip-users', action='store_true', help='Ne pas migrer les utilisateurs'
        )
        parser.add_argument(
            '--skip-drivers', action='store_true', help='Ne pas migrer les chauffeurs'
        )
        parser.add_argument(
            '--skip-orders', action='store_true', help='Ne pas migrer les commandes'
        )

    def handle(self, *args, **options):
                                 
        json_file = options.get('file')
        if not json_file:
            json_file = os.path.join(settings.BASE_DIR, 'data', 'julmin-taxis-default-rtdb-export.json')

        if not os.path.exists(json_file):
            self.stderr.write(self.style.ERROR(f'Fichier introuvable: {json_file}'))
            return

        self.stdout.write(self.style.SUCCESS(f'Lecture du fichier Firebase: {json_file}'))

        with open(json_file, encoding='utf-8') as f:
            data = json.load(f)

        with transaction.atomic():
            if not options['skip_users']:
                self._migrate_users(data)
            if not options['skip_drivers']:
                self._migrate_drivers(data)
            if not options['skip_orders']:
                self._migrate_orders(data)
            self._migrate_raw_nodes(data)

        self.stdout.write(self.style.SUCCESS('\n✅ Migration Firebase → Django terminée avec succès!'))

                                                                              
    def _migrate_users(self, data):
        from accounts.models import CustomUser

        save_members = data.get('save_member', {})
        self.stdout.write(f'\n📥 Migration utilisateurs ({len(save_members)} entrées)...')

        created = 0
        skipped = 0

        for firebase_key, user_data in save_members.items():
            if not isinstance(user_data, dict):
                continue

            email = (user_data.get('email') or '').strip().lower()
            user_id = str(user_data.get('userId', '')).strip()
            prenom = (user_data.get('prenom') or '').strip()
            nom = (user_data.get('nom') or '').strip()

                                      
            username = email if email else f'user_{user_id}' if user_id else f'fb_{firebase_key[:8]}'

                                     
            if email and CustomUser.objects.filter(email=email).exists():
                skipped += 1
                continue
            if CustomUser.objects.filter(username=username).exists():
                skipped += 1
                continue

            try:
                user = CustomUser(
                    username=username,
                    email=email,
                    first_name=prenom,
                    last_name=nom,
                    firebase_uid=firebase_key,
                    phone=user_data.get('phone', ''),
                    is_verified=user_data.get('emailVerified', False),
                )
                                                                         
                raw_password = user_data.get('password', '')
                if raw_password:
                    user.set_password(raw_password)
                else:
                    user.set_unusable_password()

                user.save()
                created += 1
                self.stdout.write(f'  ✓ Utilisateur: {prenom} {nom} ({email or user_id})')

            except Exception as e:
                self.stderr.write(f'  ✗ Erreur utilisateur {firebase_key}: {e}')

        self.stdout.write(f'  → {created} créés, {skipped} ignorés (déjà existants)')

                                                                               
    def _migrate_drivers(self, data):
        from drivers.models import Driver

        drivers_data = data.get('drivers', {})
        self.stdout.write(f'\n🚗 Migration chauffeurs ({len(drivers_data)} entrées)...')

        created = 0
        skipped = 0

        for firebase_key, driver_data in drivers_data.items():
            if not isinstance(driver_data, dict):
                continue

            firstname = (driver_data.get('firstname') or '').strip()
            lastname = (driver_data.get('lastname') or '').strip()
            phone = (driver_data.get('phone') or '').strip()
            full_name = f'{firstname} {lastname}'.strip()

                                               
            if phone and Driver.objects.filter(phone=phone).exists():
                skipped += 1
                continue

                             
            status_map = {
                'available': 'available',
                'busy': 'busy',
                'offline': 'offline',
                'finished': 'available',
            }
            fb_status = driver_data.get('status', 'available')
            django_status = status_map.get(fb_status, 'available')

                                                                
            photo_b64 = driver_data.get('photoURL', '')

            try:
                driver = Driver(
                    firebase_uid=firebase_key,
                    full_name=full_name,
                    phone=phone,
                    city=driver_data.get('city', '').strip(),
                    status=django_status,
                    latitude=driver_data.get('latitude'),
                    longitude=driver_data.get('longitude'),
                    photo_base64=photo_b64[:5000] if photo_b64 else '',                       
                )
                              
                raw_pw = driver_data.get('password', '')
                if raw_pw:
                    import hashlib
                    driver.password_hash = hashlib.sha256(raw_pw.encode()).hexdigest()

                driver.save()
                created += 1
                self.stdout.write(f'  ✓ Chauffeur: {full_name} ({phone})')

            except Exception as e:
                self.stderr.write(f'  ✗ Erreur chauffeur {firebase_key}: {e}')

        self.stdout.write(f'  → {created} créés, {skipped} ignorés')

                                                                               
    def _migrate_orders(self, data):
        from orders.models import Order
        from drivers.models import Driver

        order_tables = {
            'commande': 'pending',
            'commande_confirmed': None,                               
        }

        total_created = 0

        for table_name, default_status in order_tables.items():
            orders_data = data.get(table_name, {})
            self.stdout.write(f'\n📦 Migration {table_name} ({len(orders_data)} entrées)...')

            for firebase_key, order_data in orders_data.items():
                if not isinstance(order_data, dict):
                    continue

                        
                fb_status = order_data.get('status', default_status or 'pending')
                status_map = {
                    'pending': 'pending',
                    'price_proposed': 'price_proposed',
                    'price_confirmed': 'price_confirmed',
                    'accepted': 'driver_assigned',
                    'driver_assigned': 'driver_assigned',
                    'on_way': 'on_way',
                    'driver_on_way': 'on_way',
                    'arrived': 'arrived',
                    'driver_arrived': 'arrived',
                    'in_progress': 'in_progress',
                    'trip_started': 'in_progress',
                    'finished': 'completed',
                    'completed': 'completed',
                    'cancelled': 'cancelled',
                }
                django_status = status_map.get(fb_status, 'completed' if table_name == 'commande_confirmed' else 'pending')

                              
                user_id = str(order_data.get('userId', '')).strip()
                guest_id = str(order_data.get('guestId', '')).strip()
                client_name = order_data.get('clientName') or order_data.get('driverName', 'Client')

                           
                created_at = ts_to_dt(order_data.get('timestamp'))

                      
                price = None
                try:
                    price = float(order_data.get('price', 0) or 0)
                except Exception:
                    price = 0

                                      
                driver = None
                driver_fb_id = order_data.get('driverId', '')
                if driver_fb_id:
                    try:
                        driver = Driver.objects.get(firebase_uid=driver_fb_id)
                    except Driver.DoesNotExist:
                        pass

                                       
                from accounts.models import CustomUser
                user = None
                if user_id:
                    try:
                                                                                             
                        user = CustomUser.objects.filter(firebase_uid__icontains=user_id).first()
                    except Exception:
                        pass

                try:
                    order = Order(
                        firebase_uid=firebase_key,
                        user=user,
                        guest_id=guest_id,
                        firebase_user_id=user_id,
                        client_name=client_name or 'Client',
                        client_email=order_data.get('clientEmail', ''),
                        client_phone=order_data.get('clientPhone', '') or order_data.get('driverPhone', ''),
                        pickup=order_data.get('pickup', ''),
                        destination=order_data.get('destination', ''),
                        pickup_lat=order_data.get('latitude'),
                        pickup_lng=order_data.get('longitude'),
                        status=django_status,
                        price=price,
                        price_confirmed=order_data.get('priceConfirmed', False),
                        driver=driver,
                        driver_name=order_data.get('driverName', ''),
                        driver_phone=order_data.get('driverPhone', ''),
                        service_plan=str(order_data.get('servicePlan', '')),
                        trip_type=order_data.get('tripType', 'one_way'),
                        description=order_data.get('description', ''),
                        firebase_table=table_name,
                    )
                    if created_at:
                        order.created_at = created_at
                    order.save()
                    total_created += 1
                    self.stdout.write(f'  ✓ Commande {firebase_key[:12]}: {order_data.get("pickup","?")} → {order_data.get("destination","?")} [{django_status}]')

                except Exception as e:
                    self.stderr.write(f'  ✗ Erreur commande {firebase_key}: {e}')

        self.stdout.write(f'  → {total_created} commandes migrées au total')

                                                                              
    def _migrate_raw_nodes(self, data):
        from firebase_db.models import FirebaseNode

        self.stdout.write('\n💾 Sauvegarde des données brutes dans FirebaseNode...')
        count = 0

        tables = ['save_member', 'unsave_member', 'commande', 'commande_confirmed',
                  'drivers', 'users', 'admin', 'app_download']

        for table in tables:
            table_data = data.get(table, {})
            if isinstance(table_data, dict):
                for key, value in table_data.items():
                    path = f'{table}/{key}'
                                                                  
                    if isinstance(value, dict):
                        value = {k: v for k, v in value.items()
                                 if k not in ('photoURL', 'driverPhoto', 'photo')}
                    FirebaseNode.objects.update_or_create(
                        path=path,
                        defaults={'data': value}
                    )
                    count += 1
            elif table_data:
                FirebaseNode.objects.update_or_create(
                    path=table,
                    defaults={'data': table_data}
                )
                count += 1

        self.stdout.write(f'  → {count} nœuds Firebase sauvegardés')
