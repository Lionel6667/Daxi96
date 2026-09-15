"""Completed-only email policy + None-safe date/time formatting."""
from decimal import Decimal
from unittest.mock import patch

from django.core import mail
from django.test import TestCase, override_settings

from drivers.models import Driver
from enterprises.models import Enterprise
from julmin_taxis.notify import notify_order_status_sync
from notifications.email_service import (
    EmailService,
    _fmt_date,
    _fmt_time,
    _order_date_display,
    _order_time_display,
)
from orders.models import Order


@override_settings(
    EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
    EMAIL_HOST_USER='admin@daxipro.com',
    DEFAULT_FROM_EMAIL='DAXI <info@daxipro.com>',
    SITE_URL='http://testserver',
)
class EmailSimplifyTests(TestCase):
    def setUp(self):
        self.driver = Driver.objects.create(
            full_name='Jean Chauffeur',
            email='driver@test.ht',
            phone='+50911110000',
            vehicle='Toyota',
            plate='ABC123',
            status='busy',
        )
        self.enterprise = Enterprise.objects.create(
            name='Hotel Test',
            phone='+50922220000',
            email='enterprise@test.ht',
            password_hash='x',
            status='approved',
        )
        self.order = Order.objects.create(
            client_name='Client Test',
            client_email='client@test.ht',
            client_phone='+50933330000',
            pickup='Port-au-Prince',
            destination='Pétion-Ville',
            price=Decimal('25.00'),
            status='in_progress',
            driver=self.driver,
            enterprise=self.enterprise,
            date=None,
            time=None,
        )

    def test_fmt_helpers_tolerate_none(self):
        self.assertEqual(_fmt_date(None), '—')
        self.assertEqual(_fmt_time(None), '—')
        # Falls back to created_at when date/time are None (no crash).
        self.assertNotEqual(_order_date_display(self.order), '')
        self.assertIsInstance(_order_date_display(self.order), str)
        self.assertIsInstance(_order_time_display(self.order), str)
        # Explicit null fields must never raise.
        class _Bare:
            date = None
            time = None
            completed_at = None
            scheduled_at = None
            created_at = None
        self.assertEqual(_order_date_display(_Bare()), '—')
        self.assertEqual(_order_time_display(_Bare()), '—')

    def test_completed_sends_thank_you_with_pdf_to_all_audiences(self):
        with patch.object(
            EmailService,
            '_receipt_pdf_attachment',
            return_value=('daxi-recu-1.pdf', b'%PDF-fake', 'application/pdf'),
        ):
            EmailService.send_trip_completed(self.order)

        recipients = sorted(m.to[0] for m in mail.outbox)
        self.assertEqual(
            recipients,
            sorted([
                'client@test.ht',
                'driver@test.ht',
                'admin@daxipro.com',
                'enterprise@test.ht',
            ]),
        )
        for msg in mail.outbox:
            self.assertIn('Merci', msg.subject)
            self.assertTrue(
                any(att[0].endswith('.pdf') for att in msg.attachments),
                f'missing PDF on {msg.to}',
            )

    def test_driver_assigned_email_is_noop_even_with_null_date(self):
        # Historical crash: order.date.strftime when date is None.
        EmailService.send_driver_assigned(self.order)
        EmailService.send_price_proposed(self.order)
        EmailService.send_driver_on_way(self.order)
        EmailService.send_driver_arrived(self.order)
        EmailService.send_trip_started(self.order)
        self.assertEqual(len(mail.outbox), 0)

    @patch.object(
        EmailService,
        '_receipt_pdf_attachment',
        return_value=('daxi-recu-1.pdf', b'%PDF-fake', 'application/pdf'),
    )
    def test_notify_completed_sends_email_accept_does_not(self, _pdf):
        mail.outbox.clear()
        notify_order_status_sync(self.order, 'driver_assigned')
        self.assertEqual(len(mail.outbox), 0)

        notify_order_status_sync(self.order, 'completed')
        self.assertGreaterEqual(len(mail.outbox), 1)
        self.assertTrue(any('client@test.ht' in m.to for m in mail.outbox))
