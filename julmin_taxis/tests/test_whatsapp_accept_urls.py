"""Tests liens WhatsApp accept / coords / reçu."""
from django.core import signing
from django.test import Client, TestCase, override_settings

from drivers.models import Driver
from julmin_taxis.whatsapp_accept import load_accept_token, make_accept_token
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
        token_part = suffix.split('/', 1)[1].strip('/')
        self.assertNotIn(':', token_part)
        self.assertNotIn('.', token_part)

    def test_accept_token_url_safe_roundtrip(self):
        token = make_accept_token(42, 7)
        self.assertNotIn(':', token)
        self.assertNotIn('.', token)
        self.assertEqual(load_accept_token(token), {'o': 42, 'd': 7})

    def test_accept_url_uses_wa_path_with_driver(self):
        url = _accept_url(42, 7)
        self.assertIn('/wa/accept/42/', url)
        self.assertTrue(url.endswith('/'))

    def test_accept_url_ignores_ngrok_site_url(self):
        with self.settings(SITE_URL='https://manly-area-underarm.ngrok-free.dev'):
            url = _accept_url(42, 7)
            self.assertTrue(url.startswith('https://daxipro.com/'))
            self.assertNotIn('ngrok', url)

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
        token = make_accept_token(999, self.driver.pk)
        resp = self.client.get(f'/wa/accept/999/{token}/')
        self.assertIn(resp.status_code, (200, 302))

    def test_wa_accept_legacy_colon_token_still_works(self):
        token = signing.dumps({'o': 999, 'd': self.driver.pk}, salt='daxi-wa-accept')
        resp = self.client.get(f'/wa/accept/999/{token}/')
        self.assertIn(resp.status_code, (200, 302))

    def test_legacy_commande_deeplink_redirects(self):
        resp = self.client.get('/commande_55/')
        self.assertEqual(resp.status_code, 302)
        self.assertIn('/driver/#commande-55', resp['Location'])

    def test_driver_accept_with_token_uses_wa_handler(self):
        token = make_accept_token(999, self.driver.pk)
        resp = self.client.get(f'/driver/accept/999/{token}/')
        self.assertIn(resp.status_code, (200, 302))

    def test_driver_accept_meta_malformed_url(self):
        token = make_accept_token(114, self.driver.pk)
        resp = self.client.get(f'/driver/accept/%7B%7B1%7D%7D114/{token}/')
        self.assertIn(resp.status_code, (200, 302))

    def test_driver_accept_without_slash_redirects(self):
        resp = self.client.get('/driver/accept/888')
        self.assertIn(resp.status_code, (301, 302))

    def test_driver_home_legacy_redirects(self):
        for path in ('/driver_home', '/driver_home/', '/driver_home.html', '/driver', '/driver_login'):
            resp = self.client.get(path)
            self.assertEqual(resp.status_code, 301, path)
            self.assertTrue(resp['Location'].endswith('/driver/') or resp['Location'].endswith('/driver/login/'), path)

    def test_compte_legacy_redirect(self):
        resp = self.client.get('/compte')
        self.assertEqual(resp.status_code, 301)
        self.assertEqual(resp['Location'], '/compte/')

    def test_legacy_html_admin_redirects(self):
        resp = self.client.get('/adm.html')
        self.assertEqual(resp.status_code, 301)
        self.assertEqual(resp['Location'], '/admin-dashboard/')
