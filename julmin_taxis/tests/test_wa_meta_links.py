"""Tests liens boutons Meta WhatsApp (suffixes + parsing URLs mal formées)."""
from django.test import Client, TestCase, override_settings
from urllib.parse import quote

from julmin_taxis.wa_meta_links import (
    accept_button_suffix,
    admin_orders_button_suffix,
    clean_meta_raw,
    commande_button_suffix,
    compte_order_button_suffix,
    normalize_meta_button_suffix,
    parse_malformed_accept_raw,
    parse_malformed_commande_raw,
    parse_malformed_compte_raw,
    parse_malformed_receipt_raw,
    receipt_button_suffix,
    resolve_meta_link,
)
from julmin_taxis.whatsapp_accept import make_accept_token


@override_settings(SITE_URL='https://daxipro.com')
class WaMetaSuffixTests(TestCase):
    def test_all_button_suffixes_relative(self):
        token = accept_button_suffix(42, 7)
        cases = [
            token,
            commande_button_suffix(42),
            receipt_button_suffix(42),
            compte_order_button_suffix(42),
            admin_orders_button_suffix(),
        ]
        for suffix in cases:
            self.assertNotIn('://', suffix)
            self.assertNotIn('daxipro.com', suffix)
            norm = normalize_meta_button_suffix(
                f'https://daxipro.com/{suffix}', 'https://daxipro.com'
            )
            self.assertNotIn('daxipro.com', norm)

    def test_normalize_strips_accept_path_from_full_url(self):
        token = make_accept_token(111, 3)
        full = f'https://daxipro.com/driver/accept/111/?sig={token}'
        self.assertEqual(
            normalize_meta_button_suffix(full, 'https://daxipro.com'),
            f'111/?sig={token}',
        )


@override_settings(SITE_URL='https://daxipro.com')
class WaMetaParseTests(TestCase):
    def test_parse_all_malformed_patterns(self):
        token = make_accept_token(111, 3)
        self.assertEqual(
            parse_malformed_accept_raw(f'{{{{1}}}}111/?sig={token}'),
            (111, token),
        )
        self.assertEqual(parse_malformed_commande_raw('{{1}}driver/commande_55/'), 55)
        self.assertEqual(parse_malformed_receipt_raw('{{1}}recu_77.pdf'), 77)
        self.assertEqual(parse_malformed_compte_raw('{{1}}compte/?order=88'), 88)

    def test_resolve_meta_link_kinds(self):
        token = make_accept_token(10, 2)
        self.assertEqual(resolve_meta_link(f'111/?sig={token}')[0], 'accept')
        self.assertEqual(resolve_meta_link('driver/commande_12/')[0], 'commande')
        self.assertEqual(resolve_meta_link('recu_9.pdf')[0], 'recu')
        self.assertEqual(resolve_meta_link('compte/?order=4')[0], 'compte')
        self.assertEqual(resolve_meta_link('admin-dashboard/#orders')[0], 'admin')


@override_settings(SITE_URL='https://daxipro.com')
class WaMetaRouteTests(TestCase):
    def setUp(self):
        self.client = Client()

    def test_malformed_commande_redirects(self):
        resp = self.client.get('/driver/commande_%7B%7B1%7D%7D111/')
        self.assertEqual(resp.status_code, 302)
        self.assertIn('/driver/#commande-111', resp['Location'])

    def test_malformed_receipt_redirects(self):
        resp = self.client.get('/recu_%7B%7B1%7D%7D42.pdf')
        self.assertEqual(resp.status_code, 302)
        self.assertIn('/htmx/client/orders/42/receipt.pdf', resp['Location'])

    def test_malformed_compte_catchall_redirects(self):
        raw = quote('{{1}}compte/?order=15', safe='')
        resp = self.client.get(f'/{raw}')
        self.assertEqual(resp.status_code, 302)
        self.assertIn('/compte/?order=15', resp['Location'])
