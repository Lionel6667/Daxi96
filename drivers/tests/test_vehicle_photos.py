"""Tests séparation photos véhicule référence vs professionnelle."""
import io
import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image

from drivers.models import Driver
from julmin_taxis.driver_display_utils import driver_public_dict


def _tiny_png(name='img.png'):
    buf = io.BytesIO()
    Image.new('RGB', (40, 40), color=(100, 150, 200)).save(buf, format='PNG')
    buf.seek(0)
    return SimpleUploadedFile(name, buf.read(), content_type='image/png')


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class DriverVehiclePhotoTests(TestCase):
    def test_public_image_uses_professional_not_reference(self):
        driver = Driver.objects.create(
            email='veh@daxi.ht',
            firstname='A',
            lastname='B',
            phone='+50937001112',
            plate='VH-1',
            password_hash='x',
            vehicle_reference_photo=_tiny_png('ref.png'),
            vehicle_professional_photo=_tiny_png('pro.png'),
        )
        pub = driver.get_public_vehicle_image_url()
        ref = driver.get_vehicle_reference_image_url()
        self.assertTrue(pub)
        self.assertTrue(ref)
        self.assertNotEqual(pub, ref)

        payload = driver_public_dict(driver)
        self.assertEqual(payload['driver_car_image'], pub)
        self.assertNotEqual(payload['driver_car_image'], ref)

    def test_public_image_falls_back_to_legacy_url(self):
        driver = Driver.objects.create(
            email='legacy@daxi.ht',
            firstname='L',
            lastname='G',
            phone='+50937001113',
            plate='LG-1',
            password_hash='x',
            car_image_url='/media/car_images/legacy.jpg',
        )
        self.assertEqual(driver.get_public_vehicle_image_url(), '/media/car_images/legacy.jpg')
