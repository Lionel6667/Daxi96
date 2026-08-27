"""
Management command: check_later_orders
Run periodically (e.g. every 2-5 minutes via cron or Windows Task Scheduler) to:
  1. Transition LATER orders to NOW when scheduled_at <= now
  2. Send GPS reminders for orders within 1 hour that have stale client GPS

Usage: python manage.py check_later_orders
"""
from django.core.management.base import BaseCommand
from julmin_taxis.htmx_views_tracking import check_later_transitions, check_gps_reminders


class Command(BaseCommand):
    help = 'Check and transition LATER orders to NOW, and send GPS reminders'

    def handle(self, *args, **options):
        transitioned = check_later_transitions()
        reminded = check_gps_reminders()
        self.stdout.write(
            self.style.SUCCESS(
                f'check_later_orders: {transitioned} transitioned, {reminded} GPS reminders sent'
            )
        )
