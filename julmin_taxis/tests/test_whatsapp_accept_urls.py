"""Tests liens WhatsApp accept / coords / reçu."""
from django.core import signing
from django.test import Client, TestCase, override_settings

from drivers.models import Driver
from julmin_taxis.whatsapp_accept import load_accept_token, make_accept_token, parse_malformed_accept_raw
from julmin_taxis.whatsapp_service import (
    _accept_url,
    _accept_wa_button_suffix,
    _driver_order_button_suffix,
    _normalize_meta_button_suffix,
    _receipt_public_path,
    _send_nouvelle_commande_template,
)


@override_settings(SITE_URL='https://daxipro.com')
class WhatsAppAcceptUrlTests(TestCase):
    def test_wa_button_suffix_includes_signed_token(self):
        suffix = _accept_wa_button_suffix(42, 7)
        self.assertTrue(suffix.startswith('42/?sig='))
        token_part = suffix.split('sig=', 1)[1]
        self.assertNotIn(':', token_part)
        self.assertNotIn('.', token_part)

    def test_accept_url_uses_query_sig(self):
        url = _accept_url(42, 7)
        self.assertIn('/wa/accept/42/?sig=', url)

    def test_accept_token_url_safe_roundtrip(self):
        token = make_accept_token(42, 7)
        self.assertNotIn(':', token)
        self.assertNotIn('.', token)
        self.assertEqual(load_accept_token(token), {'o': 42, 'd': 7})

    def test_parse_malformed_meta_double_url(self):
        token = make_accept_token(111, 3)
        raw = f'{{{{1}}}}https://daxipro.com/driver/accept/111/?sig={token}'
        order_id, parsed = parse_malformed_accept_raw(raw)
        self.assertEqual(order_id, 111)
        self.assertEqual(parsed, token)

    def test_wa_button_suffix_no_full_site_url(self):
        suffix = _accept_wa_button_suffix(111, 3)
        self.assertTrue(suffix.startswith('111/?sig='))
        self.assertNotIn('daxipro.com', suffix)
        self.assertNotIn('driver/accept', suffix)

    def test_meta_button_suffix_normalizes_full_url(self):
        token = make_accept_token(111, 3)
        full = f'https://daxipro.com/driver/accept/111/?sig={token}'
        norm = _normalize_meta_button_suffix(full)
        self.assertEqual(norm, f'111/?sig={token}')
        self.assertNotIn('daxipro.com', norm)

    def test_all_dynamic_button_suffixes_are_relative(self):
        """Audit — tous les boutons Meta doivent rester relatifs (pas d'URL complète)."""
        token = make_accept_token(42, 7)
        cases = [
            _accept_wa_button_suffix(42, 7),
            f'compte/?order=42',
            _receipt_public_path(42),
            'admin-dashboard/#orders',
            _driver_order_button_suffix(42),
        ]
        for suffix in cases:
            self.assertNotIn('://', suffix, suffix)
            self.assertNotIn('daxipro.com', suffix, suffix)
            norm = _normalize_meta_button_suffix(f'https://daxipro.com/{suffix}')
            self.assertFalse(norm.startswith('http'), norm)
            if '?sig=' in suffix:
                self.assertIn('sig=', norm)

    def test_accept_url_uses_wa_path_with_driver(self):
        url = _accept_url(42, 7)
        self.assertIn('/wa/accept/42/?sig=', url)

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
        resp = self.client.get(f'/wa/accept/999/?sig={token}')
        self.assertIn(resp.status_code, (200, 302))

    def test_wa_accept_signed_link_path_legacy(self):
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

    def test_driver_accept_meta_double_prefixed_full_url(self):
        token = make_accept_token(111, self.driver.pk)
        raw = f'{{{{1}}}}https://daxipro.com/driver/accept/111/?sig={token}'
        from urllib.parse import quote
        resp = self.client.get(f'/driver/accept/{quote(raw, safe="")}/')
        self.assertIn(resp.status_code, (200, 302))

    def test_wa_accept_shows_friendly_page_when_order_already_taken(self):
        from orders.models import Order

        other = Driver.objects.create(
            email='wa.other@test.ht',
            firstname='Other',
            lastname='Driver',
            phone='+50937009999',
            plate='WA-2',
            password_hash='x',
            is_verified=True,
            status='busy',
        )
        order = Order.objects.create(
            status='driver_assigned',
            driver=other,
            driver_name='Other Driver',
            pickup='Port-au-Prince',
            destination='Pétion-Ville',
            price=500,
        )
        token = make_accept_token(order.pk, self.driver.pk)
        resp = self.client.get(f'/wa/accept/{order.pk}/?sig={token}')
        self.assertEqual(resp.status_code, 200)
        self.assertIn(b'Commande d\xc3\xa9j\xc3\xa0 accept\xc3\xa9e', resp.content)
        self.assertIn(b'd\xc3\xa9j\xc3\xa0 \xc3\xa9t\xc3\xa9 accept\xc3\xa9e', resp.content)
        self.assertNotIn(b'Acceptation impossible', resp.content)

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
