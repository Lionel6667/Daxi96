"""Tests de sécurité automatisés (smoke tests IDOR / auth)."""
from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from drivers.models import Driver
from orders.models import Order


class SecuritySmokeTests(TestCase):
    def setUp(self):
        self.client = Client()
        User = get_user_model()
        self.user_a = User.objects.create_user('client_a', 'a@test.com', 'pass12345')
        self.user_b = User.objects.create_user('client_b', 'b@test.com', 'pass12345')
        self.order_a = Order.objects.create(
            user=self.user_a, client_name='A', pickup='P1', destination='D1', status='pending',
        )
        self.order_b = Order.objects.create(
            user=self.user_b, client_name='B', pickup='P2', destination='D2', status='pending',
        )

    def test_client_cannot_confirm_other_order_price(self):
        self.client.force_login(self.user_a)
        resp = self.client.post(f'/htmx/client/orders/{self.order_b.pk}/confirm-price/')
        self.assertEqual(resp.status_code, 200)
        body = resp.content.decode().lower()
        self.assertTrue(
            'introuvable' in body or 'refus' in body or 'interdit' in body or 'erreur' in body,
            msg=body[:200],
        )

    def test_anon_cannot_access_admin_orders_tab(self):
        resp = self.client.get('/api/orders/tab/pending/')
        self.assertEqual(resp.status_code, 403)

    def test_payment_status_not_settable_via_patch(self):
        self.client.force_login(self.user_a)
        resp = self.client.patch(
            f'/api/orders/{self.order_a.pk}/status/',
            data={'status': 'completed'},
            content_type='application/json',
        )
        self.assertIn(resp.status_code, (403, 400))

    def test_mark_paid_requires_gateway_source(self):
        from julmin_taxis.payment_security import mark_order_paid
        from django.core.exceptions import PermissionDenied
        order = self.order_a
        with self.assertRaises(PermissionDenied):
            mark_order_paid(order, 'card', 'fake', source='frontend')
