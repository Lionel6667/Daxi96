from django.core.management.base import BaseCommand, CommandError

from julmin_taxis.db_backup import run_backup


class Command(BaseCommand):
    help = 'Sauvegarde la base DAXI (SQLite copie gzip, ou pg_dump).'

    def add_arguments(self, parser):
        parser.add_argument('--force', action='store_true', help='Ignore BACKUP_ENABLED=False')
        parser.add_argument('--upload', action='store_true', help='Force upload Cloudinary')
        parser.add_argument('--no-upload', action='store_true', help='Sauvegarde locale seulement')

    def handle(self, *args, **options):
        upload = False if options['no_upload'] else (True if options['upload'] else None)
        result = run_backup(force=options['force'], upload=upload)
        if not result.get('ok'):
            raise CommandError(result.get('reason') or result.get('error') or 'sauvegarde refusée')
        msg = f"OK {result.get('kind')} -> {result.get('file')} ({result.get('bytes')} octets)"
        if result.get('remote_url'):
            msg += f"\nCloudinary: {result['remote_url']}"
        elif result.get('upload_error'):
            msg += f"\nUpload: {result['upload_error']}"
        self.stdout.write(self.style.SUCCESS(msg))
