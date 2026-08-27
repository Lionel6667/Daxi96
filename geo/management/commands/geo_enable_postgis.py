from django.core.management.base import BaseCommand, CommandError
from django.db import connection


class Command(BaseCommand):
    help = 'Active PostGIS et crée les colonnes geom (production PostgreSQL)'

    def handle(self, *args, **options):
        from django.conf import settings
        if not getattr(settings, 'USE_POSTGIS', False):
            raise CommandError('DATABASE_ENGINE doit être postgis ou postgresql')

        with connection.cursor() as cursor:
            cursor.execute('CREATE EXTENSION IF NOT EXISTS postgis;')

            cursor.execute("""
                ALTER TABLE geo_geoplace
                ADD COLUMN IF NOT EXISTS geom geometry(Point, 4326);
            """)
            cursor.execute("""
                UPDATE geo_geoplace SET geom = ST_SetSRID(ST_MakePoint(lng, lat), 4326)
                WHERE geom IS NULL AND lat IS NOT NULL AND lng IS NOT NULL;
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS geo_geoplace_geom_idx
                ON geo_geoplace USING GIST (geom);
            """)

            cursor.execute("""
                ALTER TABLE geo_georoad
                ADD COLUMN IF NOT EXISTS geom geometry(LineString, 4326);
            """)
            cursor.execute("""
                UPDATE geo_georoad SET geom = ST_SetSRID(ST_GeomFromGeoJSON(geometry_geojson::text), 4326)
                WHERE geom IS NULL AND geometry_geojson IS NOT NULL
                  AND geometry_geojson::text != '{}';
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS geo_georoad_geom_idx
                ON geo_georoad USING GIST (geom);
            """)

        self.stdout.write(self.style.SUCCESS('PostGIS activé — colonnes geom créées et indexées'))
