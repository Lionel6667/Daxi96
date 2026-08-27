from django.core.management.base import BaseCommand, CommandError

from julmin_taxis.db_backup import run_backup


class Command(BaseCommand):
    help = 'Sauvegarde la base DAXI (SQLite copie gzip, ou pg_dump).'

    def add_arguments(self, parser):
        parser.add_argument('--force', action='store_true', help='Ignore BACKUP_ENABLED=False')

    def handle(self, *args, **options):
        result = run_backup(force=options['force'])
        if not result.get('ok'):
            raise CommandError(result.get('reason') or result.get('error') or 'sauvegarde refusée')
        self.stdout.write(self.style.SUCCESS(
            f"OK {result.get('kind')} -> {result.get('file')} ({result.get('bytes')} octets)"
        ))
