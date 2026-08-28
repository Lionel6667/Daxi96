"""Tests liens WhatsApp accept / coords / reçu."""
from django.core import signing
from django.test import Client, TestCase, override_settings

from drivers.models import Driver
from julmin_taxis.whatsapp_service import (
    _accept_url,
    _accept_wa_button_suffix,
    _driver_order_button_suffix,
    _receipt_public_path,
)


@override_settings(SITE_URL='https://daxipro.com')
class WhatsAppAcceptUrlTests(TestCase):
    def test_wa_button_suffix_includes_signed_token(self):
        suffix = _accept_wa_button_suffix(42, 7)
        self.assertTrue(suffix.startswith('42/'))
        self.assertTrue(suffix.endswith('/'))
        self.assertIn(':', suffix.split('/', 1)[1])

    def test_accept_url_uses_wa_path_with_driver(self):
        url = _accept_url(42, 7)
        self.assertIn('/wa/accept/42/', url)
        self.assertTrue(url.endswith('/'))

    def test_driver_order_button_suffix_full_path(self):
        self.assertEqual(_driver_order_button_suffix(99), 'driver/commande_99/')

    def test_receipt_public_path(self):
        self.assertEqual(_receipt_public_path(12), 'recu_12.pdf')


@override_settings(SITE_URL='https://daxipro.com')
class WhatsAppAcceptRouteTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.driver = Driver.objects.create(
            email='wa.driver@test.ht',
            firstname='WA',
            lastname='Driver',
            phone='+50937009988',
            plate='WA-1',
            password_hash='x',
            is_verified=True,
            status='available',
        )

    def test_legacy_wa_accept_without_token_not_404(self):
        resp = self.client.get('/wa/accept/999/')
        self.assertEqual(resp.status_code, 200)
        self.assertIn(b"Lien", resp.content)

    def test_wa_accept_signed_link(self):
        token = signing.dumps({'o': 999, 'd': self.driver.pk}, salt='daxi-wa-accept')
        resp = self.client.get(f'/wa/accept/999/{token}/')
        self.assertIn(resp.status_code, (200, 302))

    def test_legacy_commande_deeplink_redirects(self):
        resp = self.client.get('/commande_55/')
        self.assertEqual(resp.status_code, 302)
        self.assertIn('/driver/#commande-55', resp['Location'])

    def test_driver_accept_with_token_uses_wa_handler(self):
        token = signing.dumps({'o': 999, 'd': self.driver.pk}, salt='daxi-wa-accept')
        resp = self.client.get(f'/driver/accept/999/{token}/')
        self.assertIn(resp.status_code, (200, 302))

    def test_driver_accept_meta_malformed_url(self):
        token = signing.dumps({'o': 114, 'd': self.driver.pk}, salt='daxi-wa-accept')
        resp = self.client.get(f'/driver/accept/%7B%7B1%7D%7D114/{token}/')
        self.assertIn(resp.status_code, (200, 302))

    def test_driver_accept_without_slash_redirects(self):
        resp = self.client.get('/driver/accept/888')
        self.assertIn(resp.status_code, (301, 302))
