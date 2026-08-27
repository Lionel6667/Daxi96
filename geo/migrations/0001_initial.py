

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('admin_panel', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='GeoZone',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('department_slug', models.CharField(blank=True, db_index=True, default='', max_length=30)),
                ('status', models.CharField(choices=[('not_downloaded', 'Non téléchargée'), ('downloading', 'Téléchargement en cours'), ('processing', 'Traitement'), ('available', 'Disponible'), ('update_needed', 'Mise à jour nécessaire'), ('error', 'Erreur')], default='not_downloaded', max_length=20)),
                ('version', models.CharField(blank=True, default='', max_length=20)),
                ('file_size_bytes', models.BigIntegerField(default=0)),
                ('place_count', models.PositiveIntegerField(default=0)),
                ('road_count', models.PositiveIntegerField(default=0)),
                ('tile_count', models.PositiveIntegerField(default=0)),
                ('bounds_geojson', models.JSONField(blank=True, default=dict)),
                ('last_download_at', models.DateTimeField(blank=True, null=True)),
                ('osm_dataset_version', models.CharField(blank=True, default='', max_length=40)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('department', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='geo_zones', to='admin_panel.covereddepartment')),
            ],
            options={
                'verbose_name': 'Zone géographique',
                'verbose_name_plural': 'Zones géographiques',
                'ordering': ['name'],
            },
        ),
        migrations.CreateModel(
            name='DownloadJob',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('status', models.CharField(choices=[('queued', 'En file'), ('running', 'En cours'), ('paused', 'Pause'), ('completed', 'Terminé'), ('failed', 'Échoué'), ('cancelled', 'Annulé')], default='queued', max_length=12)),
                ('stage', models.CharField(choices=[('download', 'Téléchargement Geofabrik'), ('filter', 'Filtrage osmium'), ('import', 'Import base'), ('clean', 'Nettoyage'), ('normalize', 'Normalisation'), ('validate', 'Validation DAXI'), ('publish', 'Publication'), ('mbtiles', 'Génération MBTiles')], default='download', max_length=16)),
                ('progress_pct', models.FloatField(default=0)),
                ('bytes_done', models.BigIntegerField(default=0)),
                ('bytes_total', models.BigIntegerField(default=0)),
                ('speed_bps', models.FloatField(default=0)),
                ('eta_seconds', models.PositiveIntegerField(blank=True, null=True)),
                ('files_done', models.PositiveIntegerField(default=0)),
                ('files_total', models.PositiveIntegerField(default=0)),
                ('logs', models.JSONField(blank=True, default=list)),
                ('celery_task_id', models.CharField(blank=True, default='', max_length=100)),
                ('error_message', models.TextField(blank=True, default='')),
                ('started_at', models.DateTimeField(blank=True, null=True)),
                ('finished_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('zone', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='download_jobs', to='geo.geozone')),
            ],
            options={
                'verbose_name': 'Job téléchargement',
                'verbose_name_plural': 'Jobs téléchargement',
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='MapResource',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('resource_type', models.CharField(choices=[('osm_pbf', 'OSM PBF'), ('osm_pbf_filtered', 'OSM PBF filtré'), ('mbtiles', 'MBTiles'), ('search_index', 'Index recherche')], max_length=20)),
                ('file_path', models.CharField(blank=True, default='', max_length=500)),
                ('size_bytes', models.BigIntegerField(default=0)),
                ('checksum', models.CharField(blank=True, default='', max_length=64)),
                ('version', models.CharField(blank=True, default='', max_length=20)),
                ('status', models.CharField(choices=[('pending', 'En attente'), ('downloading', 'Téléchargement'), ('ready', 'Prêt'), ('error', 'Erreur')], default='pending', max_length=16)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('zone', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='resources', to='geo.geozone')),
            ],
            options={
                'verbose_name': 'Ressource carte',
                'verbose_name_plural': 'Ressources cartes',
            },
        ),
        migrations.CreateModel(
            name='GeoRoad',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=500)),
                ('normalized_name', models.CharField(db_index=True, max_length=500)),
                ('road_type', models.CharField(choices=[('motorway', 'Autoroute'), ('trunk', 'Voie rapide'), ('primary', 'Principale'), ('secondary', 'Secondaire'), ('tertiary', 'Tertiaire'), ('residential', 'Résidentielle'), ('unclassified', 'Non classée'), ('service', 'Service'), ('track', 'Piste'), ('path', 'Sentier'), ('other', 'Autre')], default='other', max_length=20)),
                ('osm_id', models.BigIntegerField(blank=True, db_index=True, null=True)),
                ('geometry_geojson', models.JSONField(default=dict)),
                ('centroid_lat', models.FloatField(blank=True, null=True)),
                ('centroid_lng', models.FloatField(blank=True, null=True)),
                ('length_m', models.FloatField(blank=True, null=True)),
                ('publication_status', models.CharField(choices=[('draft', 'Brouillon'), ('cleaned', 'Nettoyé'), ('validated', 'Validé DAXI'), ('published', 'Publié'), ('rejected', 'Rejeté')], db_index=True, default='draft', max_length=12)),
                ('reject_reason', models.CharField(blank=True, default='', max_length=200)),
                ('raw_tags', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('zone', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='roads', to='geo.geozone')),
            ],
            options={
                'verbose_name': 'Route OSM',
                'verbose_name_plural': 'Routes OSM',
                'ordering': ['name'],
                'indexes': [models.Index(fields=['centroid_lat', 'centroid_lng'], name='geo_georoad_centroi_0a1504_idx'), models.Index(fields=['publication_status', 'normalized_name'], name='geo_georoad_publica_7183ee_idx')],
            },
        ),
        migrations.CreateModel(
            name='GeoPlace',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=500)),
                ('normalized_name', models.CharField(db_index=True, max_length=500)),
                ('category', models.CharField(choices=[('quarter', 'Quartier'), ('village', 'Village'), ('school', 'École'), ('hospital', 'Hôpital'), ('hotel', 'Hôtel'), ('restaurant', 'Restaurant'), ('fuel', 'Station-service'), ('shop', 'Commerce'), ('landmark', 'Point important'), ('other', 'Autre')], default='other', max_length=20)),
                ('lat', models.FloatField()),
                ('lng', models.FloatField()),
                ('osm_id', models.BigIntegerField(blank=True, db_index=True, null=True)),
                ('osm_type', models.CharField(blank=True, default='', max_length=16)),
                ('source', models.CharField(default='osm', max_length=12)),
                ('publication_status', models.CharField(choices=[('draft', 'Brouillon'), ('cleaned', 'Nettoyé'), ('validated', 'Validé DAXI'), ('published', 'Publié'), ('rejected', 'Rejeté')], db_index=True, default='draft', max_length=12)),
                ('reject_reason', models.CharField(blank=True, default='', max_length=200)),
                ('raw_tags', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('zone', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='places', to='geo.geozone')),
            ],
            options={
                'verbose_name': 'Lieu OSM',
                'verbose_name_plural': 'Lieux OSM',
                'ordering': ['name'],
                'indexes': [models.Index(fields=['lat', 'lng'], name='geo_geoplac_lat_2878fe_idx'), models.Index(fields=['publication_status', 'normalized_name'], name='geo_geoplac_publica_35a2eb_idx')],
            },
        ),
    ]
