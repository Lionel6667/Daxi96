"""Tests inscription chauffeur — POST /htmx/driver/register/"""
import hashlib
import io
import tempfile

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, TestCase, override_settings
from PIL import Image

from drivers.models import Driver


def _tiny_png(name='doc.png'):
    buf = io.BytesIO()
    Image.new('RGB', (40, 40), color=(200, 200, 200)).save(buf, format='PNG')
    buf.seek(0)
    return SimpleUploadedFile(name, buf.read(), content_type='image/png')


def _register_payload(**overrides):
    base = {
        'firstname': 'Jean',
        'lastname': 'Pierre',
        'email': 'jean.pierre.reg@daxi.ht',
        'phone': '44123456',
        'phone_prefix': '+509',
        'city': 'Cap-Haïtien',
        'password': 'SecurePass8',
        'password_confirm': 'SecurePass8',
        'car_brand': 'Toyota',
        'car_model': 'Corolla',
        'car_year': '2018',
        'car_color': 'Blanc',
        'plate': 'AA-12345',
    }
    base.update(overrides)
    return base


def _register_files():
    return {
        'photo': _tiny_png('photo.png'),
        'vehicle_reference_photo': _tiny_png('vehicle.png'),
        'driving_license': _tiny_png('license.png'),
        'oavct_insurance': _tiny_png('oavct.png'),
        'dgi_card': _tiny_png('dgi.png'),
    }


@override_settings(
    DRIVER_REGISTRATION_STRICT_DOCS=False,
    DRIVER_DOC_ALLOW_MANUAL_REVIEW=True,
    MEDIA_ROOT=tempfile.mkdtemp(),
)
class DriverRegistrationTests(TestCase):
    def setUp(self):
        self.client = Client()

    def _prime_driver_otp(self, email, phone='+50944123456', otp='847291'):
        cache.set(f'reg_otp_driver_{email}', otp, timeout=600)
        cache.set(f'reg_otp_driver_phone_{email}', phone, timeout=600)

    def test_register_success_non_strict(self):
        email = 'jean.pierre.reg@daxi.ht'
        self._prime_driver_otp(email)
        resp = self.client.post(
            '/htmx/driver/register/',
            {**_register_payload(email=email), 'otp': '847291', **_register_files()},
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.get('HX-Redirect'), '/driver/')

        driver = Driver.objects.get(email='jean.pierre.reg@daxi.ht')
        self.assertEqual(driver.firstname, 'Jean')
        self.assertEqual(driver.phone, '+50944123456')
        self.assertFalse(driver.is_verified)
        self.assertEqual(driver.status, 'offline')
        self.assertTrue(driver.photo)
        self.assertTrue(driver.vehicle_reference_photo)
        self.assertFalse(driver.vehicle_professional_photo)
        self.assertFalse(driver.car_image_url)
        self.assertTrue(driver.driving_license)
        expected_hash = hashlib.sha256(b'SecurePass8').hexdigest()
        self.assertEqual(driver.password_hash, expected_hash)
        self.assertIn('vérification admin', driver.verification_notes.lower())

        session = self.client.session
        session.load()
        self.assertEqual(session.get('driver_id'), driver.pk)
        self.assertTrue(session.get('driver_pending_verification'))

    def test_register_rejects_duplicate_email(self):
        Driver.objects.create(
            email='dup@daxi.ht',
            firstname='A',
            lastname='B',
            phone='+50937001111',
            plate='DUP-1',
            password_hash='x',
        )
        self._prime_driver_otp('dup@daxi.ht')
        resp = self.client.post(
            '/htmx/driver/register/',
            {**_register_payload(email='dup@daxi.ht'), 'otp': '847291', **_register_files()},
        )
        self.assertEqual(resp.status_code, 200)
        self.assertIn(b'email', resp.content.lower())
        self.assertEqual(Driver.objects.filter(email='dup@daxi.ht').count(), 1)

    def test_register_rejects_duplicate_phone(self):
        Driver.objects.create(
            email='other@daxi.ht',
            firstname='A',
            lastname='B',
            phone='+50944123456',
            plate='DUP-2',
            password_hash='x',
        )
        self._prime_driver_otp('new@daxi.ht')
        resp = self.client.post(
            '/htmx/driver/register/',
            {**_register_payload(email='new@daxi.ht'), 'otp': '847291', **_register_files()},
        )
        self.assertEqual(resp.status_code, 200)
        self.assertIn(b'whatsapp', resp.content.lower())
        self.assertFalse(Driver.objects.filter(email='new@daxi.ht').exists())

    def test_register_rejects_short_password(self):
        self._prime_driver_otp('jean.pierre.reg@daxi.ht')
        resp = self.client.post(
            '/htmx/driver/register/',
            {**_register_payload(password='abc'), 'otp': '847291', **_register_files()},
        )
        self.assertIn(b'8', resp.content)
        self.assertEqual(Driver.objects.count(), 0)

    def test_register_rejects_invalid_phone(self):
        self._prime_driver_otp('jean.pierre.reg@daxi.ht', phone='+50944123456')
        resp = self.client.post(
            '/htmx/driver/register/',
            {**_register_payload(phone='123'), 'otp': '847291', **_register_files()},
        )
        self.assertIn(b'whatsapp', resp.content.lower())
        self.assertEqual(Driver.objects.count(), 0)

    def test_register_rejects_missing_documents(self):
        files = _register_files()
        del files['driving_license']
        self._prime_driver_otp('jean.pierre.reg@daxi.ht')
        resp = self.client.post(
            '/htmx/driver/register/',
            {**_register_payload(), 'otp': '847291', **files},
        )
        self.assertIn(b'permis', resp.content.lower())
        self.assertEqual(Driver.objects.count(), 0)

    def test_register_login_after_signup(self):
        email = 'login.after@daxi.ht'
        self._prime_driver_otp(email)
        self.client.post(
            '/htmx/driver/register/',
            {**_register_payload(email=email), 'otp': '847291', **_register_files()},
        )
        self.client.session.flush()
        resp = self.client.post(
            '/htmx/driver/login/',
            {'identifier': email, 'password': 'SecurePass8'},
        )
        self.assertEqual(resp.get('HX-Redirect'), '/driver/')
        driver = Driver.objects.get(email=email)
        self.client.session.load()
        self.assertEqual(self.client.session.get('driver_id'), driver.pk)

    def test_unverified_driver_blocked_from_accepting(self):
        from julmin_taxis.htmx_views import _driver_can_accept_order
        from orders.models import Order

        driver = Driver.objects.create(
            email='unverified@daxi.ht',
            firstname='U',
            lastname='V',
            phone='+50937009998',
            plate='UV-1',
            password_hash='x',
            is_verified=False,
        )
        order = Order.objects.create(
            status='pending',
            pickup='A',
            destination='B',
            pickup_lat=19.76,
            pickup_lng=-72.20,
            destination_lat=19.78,
            destination_lng=-72.18,
        )
        ok, msg = _driver_can_accept_order(driver, order)
        self.assertFalse(ok)
        self.assertIn('validation', msg.lower())
