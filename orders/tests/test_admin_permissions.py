"""Tests permissions admin granulaires et IDOR client."""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from drivers.models import Driver, DriverWalletTransaction
from orders.models import Order, SecurityLog


class AdminPermissionTests(TestCase):
    def setUp(self):
        self.client = Client()
        User = get_user_model()
        self.support = User.objects.create_user(
            'support1', 'support@test.com', 'pass12345',
            is_staff=True, admin_role='support',
        )
        self.finance = User.objects.create_user(
            'finance1', 'finance@test.com', 'pass12345',
            is_staff=True, admin_role='finance',
        )
        self.driver = Driver.objects.create(
            firstname='Test', lastname='Driver', phone='50912345678',
            wallet_balance=Decimal('100.00'),
        )
        self.withdraw_tx = DriverWalletTransaction.objects.create(
            driver=self.driver,
            transaction_type='withdrawal_request',
            amount=Decimal('-50.00'),
            balance_after=Decimal('50.00'),
            admin_status='pending',
            payout_method='moncash',
            payout_phone='50912345678',
        )

    def test_support_cannot_approve_driver_withdrawal(self):
        self.client.force_login(self.support)
        resp = self.client.post(
            f'/htmx/admin/withdrawals/driver/{self.withdraw_tx.pk}/',
            {'action': 'pay', 'finance_confirm': 'oui'},
        )
        self.assertEqual(resp.status_code, 200)
        self.assertIn('Permission refusée', resp.content.decode())
        self.withdraw_tx.refresh_from_db()
        self.assertEqual(self.withdraw_tx.admin_status, 'pending')

    def test_finance_can_approve_small_withdrawal(self):
        self.client.force_login(self.finance)
        resp = self.client.post(
            f'/htmx/admin/withdrawals/driver/{self.withdraw_tx.pk}/',
            {'action': 'pay'},
        )
        self.assertEqual(resp.status_code, 200)
        self.withdraw_tx.refresh_from_db()
        self.assertEqual(self.withdraw_tx.admin_status, 'paid')

    def test_support_cannot_block_driver(self):
        self.client.force_login(self.support)
        resp = self.client.post(f'/htmx/admin/drivers/{self.driver.pk}/block/', {'action': 'block'})
        self.assertIn('Permission refusée', resp.content.decode())
        self.driver.refresh_from_db()
        self.assertFalse(self.driver.is_blocked)

    def test_access_denied_logged(self):
        self.client.force_login(self.support)
        self.client.post(f'/htmx/admin/withdrawals/driver/{self.withdraw_tx.pk}/', {'action': 'pay'})
        self.assertTrue(SecurityLog.objects.filter(action='ACCESS_DENIED').exists())


class ClientCancelIdorTests(TestCase):
    def setUp(self):
        self.client = Client()
        User = get_user_model()
        self.user_a = User.objects.create_user('ca', 'a@test.com', 'pass12345')
        self.user_b = User.objects.create_user('cb', 'b@test.com', 'pass12345')
        self.order_b = Order.objects.create(
            user=self.user_b, client_name='B', pickup='P', destination='D', status='pending',
        )

    def test_client_a_cannot_cancel_client_b_order(self):
        self.client.force_login(self.user_a)
        resp = self.client.post(f'/htmx/client/orders/{self.order_b.pk}/cancel/')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('introuvable', resp.content.decode().lower())
        self.order_b.refresh_from_db()
        self.assertEqual(self.order_b.status, 'pending')


class GpsAntispoofTests(TestCase):
    def test_rejects_teleportation(self):
        from julmin_taxis.gps_antispoof import validate_driver_gps
        ok1, _, _ = validate_driver_gps(99, 18.5, -72.3)
        self.assertTrue(ok1)
        
        ok2, reason, trust = validate_driver_gps(99, 19.7, -72.1)
        self.assertFalse(ok2)
        self.assertIn('gps_speed', reason)
        self.assertLess(trust, 100)


class AdminDriverReviewTests(TestCase):
    def setUp(self):
        self.client = Client()
        User = get_user_model()
        self.admin = User.objects.create_user(
            'adm1', 'admin@test.com', 'pass12345', is_staff=True,
        )
        self.support = User.objects.create_user(
            'support2', 'support2@test.com', 'pass12345',
            is_staff=True, admin_role='support',
        )
        self.pending = Driver.objects.create(
            firstname='Jean', lastname='Pierre', phone='+50937001111',
            email='pending.drv@daxi.ht', city='Cap-Haïtien',
            plate='ABC-1', is_verified=False, is_blocked=False,
        )

    def test_admin_approves_pending_driver(self):
        self.client.force_login(self.admin)
        resp = self.client.post(
            f'/htmx/admin/drivers/{self.pending.pk}/verify/',
            HTTP_ACCEPT='application/json',
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data.get('ok'))
        self.pending.refresh_from_db()
        self.assertTrue(self.pending.is_verified)
        self.assertFalse(self.pending.is_blocked)

    def test_admin_rejects_pending_driver(self):
        self.client.force_login(self.admin)
        resp = self.client.post(
            f'/htmx/admin/drivers/{self.pending.pk}/reject/',
            {'reason': 'Permis illisible'},
            HTTP_ACCEPT='application/json',
        )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json().get('ok'))
        self.pending.refresh_from_db()
        self.assertFalse(self.pending.is_verified)
        self.assertTrue(self.pending.is_blocked)
        self.assertIn('Permis illisible', self.pending.verification_notes)

    def test_admin_reject_driver_requires_reason(self):
        self.client.force_login(self.admin)
        resp = self.client.post(
            f'/htmx/admin/drivers/{self.pending.pk}/reject/',
            {},
            HTTP_ACCEPT='application/json',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(resp.json().get('ok'))

    def test_support_cannot_approve_driver(self):
        self.client.force_login(self.support)
        self.client.post(f'/htmx/admin/drivers/{self.pending.pk}/verify/')
        self.pending.refresh_from_db()
        self.assertFalse(self.pending.is_verified)

    def test_staff_driver_list_includes_review_fields(self):
        self.client.force_login(self.admin)
        resp = self.client.get('/api/drivers/')
        self.assertEqual(resp.status_code, 200)
        rows = resp.json()
        if isinstance(rows, dict):
            rows = rows.get('results') or []
        match = next((r for r in rows if r.get('id') == self.pending.pk), None)
        self.assertIsNotNone(match)
        self.assertIn('city', match)
        self.assertIn('driving_license_url', match)
        self.assertEqual(match['city'], 'Cap-Haïtien')

    def test_public_driver_list_hides_unverified_and_docs(self):
        resp = self.client.get('/api/drivers/')
        self.assertEqual(resp.status_code, 200)
        rows = resp.json()
        if isinstance(rows, dict):
            rows = rows.get('results') or []
        ids = [r.get('id') for r in rows]
        self.assertNotIn(self.pending.pk, ids)

    def test_session_admin_list_includes_pending_driver(self):
        session = self.client.session
        session['is_admin'] = True
        session.save()
        resp = self.client.get('/api/admin-panel/drivers/')
        self.assertEqual(resp.status_code, 200)
        rows = resp.json()
        if isinstance(rows, dict):
            rows = rows.get('results') or []
        match = next((r for r in rows if r.get('id') == self.pending.pk), None)
        self.assertIsNotNone(match)
        self.assertFalse(match.get('is_verified'))
        self.assertIn('driving_license_url', match)
        self.assertEqual(match.get('city'), 'Cap-Haïtien')

    def test_drivers_badge_stays_until_reviewed(self):
        from django.utils import timezone
        self.client.force_login(self.admin)
        session = self.client.session
        session['is_admin'] = True
        session['admin_badge_seen_at'] = {'drivers': timezone.now().isoformat()}
        session.save()
        resp = self.client.get('/api/admin-panel/badge-counts/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json().get('drivers'), 1)

    def test_staff_jwt_driver_list_includes_pending(self):
        self.client.force_login(self.admin)
        session = self.client.session
        session['is_admin'] = True
        session.save()
        resp = self.client.get('/api/drivers/')
        self.assertEqual(resp.status_code, 200)
        rows = resp.json()
        if isinstance(rows, dict):
            rows = rows.get('results') or []
        ids = [r.get('id') for r in rows]
        self.assertIn(self.pending.pk, ids)
