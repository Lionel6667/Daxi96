"""Zones, lieux OSM, routes et jobs d'import cartographique DAXI."""
from __future__ import annotations

from django.db import models


class GeoZone(models.Model):
  """Zone couverte (ville / département) avec ressources cartographiques."""

  STATUS_CHOICES = [
      ('not_downloaded', 'Non téléchargée'),
      ('downloading', 'Téléchargement en cours'),
      ('processing', 'Traitement'),
      ('available', 'Disponible'),
      ('update_needed', 'Mise à jour nécessaire'),
      ('error', 'Erreur'),
  ]

  name = models.CharField(max_length=200)
  department_slug = models.CharField(max_length=30, blank=True, default='', db_index=True)
  city_slug = models.CharField(max_length=40, blank=True, default='', db_index=True)
  scope = models.CharField(
      max_length=12,
      choices=[('department', 'Département entier'), ('city', 'Ville / commune')],
      default='department',
  )
  department = models.ForeignKey(
      'admin_panel.CoveredDepartment',
      null=True,
      blank=True,
      on_delete=models.SET_NULL,
      related_name='geo_zones',
  )
  status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='not_downloaded')
  version = models.CharField(max_length=20, blank=True, default='')
  file_size_bytes = models.BigIntegerField(default=0)
  place_count = models.PositiveIntegerField(default=0)
  road_count = models.PositiveIntegerField(default=0)
  tile_count = models.PositiveIntegerField(default=0)
  bounds_geojson = models.JSONField(default=dict, blank=True)
  last_download_at = models.DateTimeField(null=True, blank=True)
  osm_dataset_version = models.CharField(max_length=40, blank=True, default='')
  created_at = models.DateTimeField(auto_now_add=True)
  updated_at = models.DateTimeField(auto_now=True)

  class Meta:
    verbose_name = 'Zone géographique'
    verbose_name_plural = 'Zones géographiques'
    ordering = ['name']
    constraints = [
        models.UniqueConstraint(
            fields=['department_slug', 'city_slug'],
            name='geo_zone_dept_city_uniq',
        ),
    ]

  def __str__(self):
    return self.name


class PublicationStatus(models.TextChoices):
  DRAFT = 'draft', 'Brouillon'
  CLEANED = 'cleaned', 'Nettoyé'
  VALIDATED = 'validated', 'Validé DAXI'
  PUBLISHED = 'published', 'Publié'
  REJECTED = 'rejected', 'Rejeté'


class GeoPlace(models.Model):
  """Point d'intérêt importé OSM (publié après nettoyage + validation)."""

  CATEGORY_CHOICES = [
      ('quarter', 'Quartier'),
      ('village', 'Village'),
      ('school', 'École'),
      ('hospital', 'Hôpital'),
      ('hotel', 'Hôtel'),
      ('restaurant', 'Restaurant'),
      ('fuel', 'Station-service'),
      ('shop', 'Commerce'),
      ('landmark', 'Point important'),
      ('other', 'Autre'),
  ]

  zone = models.ForeignKey(GeoZone, on_delete=models.CASCADE, related_name='places')
  name = models.CharField(max_length=500)
  normalized_name = models.CharField(max_length=500, db_index=True)
  category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='other')
  lat = models.FloatField()
  lng = models.FloatField()
  osm_id = models.BigIntegerField(null=True, blank=True, db_index=True)
  osm_type = models.CharField(max_length=16, blank=True, default='')
  source = models.CharField(max_length=12, default='osm')
  publication_status = models.CharField(
      max_length=12,
      choices=PublicationStatus.choices,
      default=PublicationStatus.DRAFT,
      db_index=True,
  )
  reject_reason = models.CharField(max_length=200, blank=True, default='')
  raw_tags = models.JSONField(default=dict, blank=True)
  created_at = models.DateTimeField(auto_now_add=True)
  updated_at = models.DateTimeField(auto_now=True)

  class Meta:
    verbose_name = 'Lieu OSM'
    verbose_name_plural = 'Lieux OSM'
    ordering = ['name']
    indexes = [
        models.Index(fields=['lat', 'lng']),
        models.Index(fields=['publication_status', 'normalized_name']),
    ]

  def __str__(self):
    return self.name


class GeoRoad(models.Model):
  """Rue / route — destination linéaire (ex. « Rue 5 Cap-Haïtien »)."""

  ROAD_TYPES = [
      ('motorway', 'Autoroute'),
      ('trunk', 'Voie rapide'),
      ('primary', 'Principale'),
      ('secondary', 'Secondaire'),
      ('tertiary', 'Tertiaire'),
      ('residential', 'Résidentielle'),
      ('unclassified', 'Non classée'),
      ('service', 'Service'),
      ('track', 'Piste'),
      ('path', 'Sentier'),
      ('other', 'Autre'),
  ]

  zone = models.ForeignKey(GeoZone, on_delete=models.CASCADE, related_name='roads')
  name = models.CharField(max_length=500)
  normalized_name = models.CharField(max_length=500, db_index=True)
  road_type = models.CharField(max_length=20, choices=ROAD_TYPES, default='other')
  osm_id = models.BigIntegerField(null=True, blank=True, db_index=True)
  geometry_geojson = models.JSONField(default=dict)
  centroid_lat = models.FloatField(null=True, blank=True)
  centroid_lng = models.FloatField(null=True, blank=True)
  length_m = models.FloatField(null=True, blank=True)
  publication_status = models.CharField(
      max_length=12,
      choices=PublicationStatus.choices,
      default=PublicationStatus.DRAFT,
      db_index=True,
  )
  reject_reason = models.CharField(max_length=200, blank=True, default='')
  raw_tags = models.JSONField(default=dict, blank=True)
  created_at = models.DateTimeField(auto_now_add=True)
  updated_at = models.DateTimeField(auto_now=True)

  class Meta:
    verbose_name = 'Route OSM'
    verbose_name_plural = 'Routes OSM'
    ordering = ['name']
    indexes = [
        models.Index(fields=['centroid_lat', 'centroid_lng']),
        models.Index(fields=['publication_status', 'normalized_name']),
    ]

  def save(self, *args, **kwargs):
    from geo.services.geometry import linestring_centroid, linestring_length_m
    from geo.services.osm_cleaner import normalize_record_name
    if self.name:
      self.normalized_name = normalize_record_name(self.name)[:500]
    if self.geometry_geojson and self.geometry_geojson.get('coordinates'):
      clat, clng = linestring_centroid(self.geometry_geojson)
      if clat is not None:
        self.centroid_lat, self.centroid_lng = clat, clng
      if self.length_m is None:
        self.length_m = linestring_length_m(self.geometry_geojson)
    super().save(*args, **kwargs)

  def __str__(self):
    return self.name


class MapResource(models.Model):
  """Fichier cartographique local (PBF, MBTiles, index)."""

  RESOURCE_TYPES = [
      ('osm_pbf', 'OSM PBF'),
      ('osm_pbf_filtered', 'OSM PBF filtré'),
      ('mbtiles', 'MBTiles'),
      ('search_index', 'Index recherche'),
  ]
  STATUS_CHOICES = [
      ('pending', 'En attente'),
      ('downloading', 'Téléchargement'),
      ('ready', 'Prêt'),
      ('error', 'Erreur'),
  ]

  zone = models.ForeignKey(GeoZone, on_delete=models.CASCADE, related_name='resources')
  resource_type = models.CharField(max_length=20, choices=RESOURCE_TYPES)
  file_path = models.CharField(max_length=500, blank=True, default='')
  size_bytes = models.BigIntegerField(default=0)
  checksum = models.CharField(max_length=64, blank=True, default='')
  version = models.CharField(max_length=20, blank=True, default='')
  status = models.CharField(max_length=16, choices=STATUS_CHOICES, default='pending')
  created_at = models.DateTimeField(auto_now_add=True)
  updated_at = models.DateTimeField(auto_now=True)

  class Meta:
    verbose_name = 'Ressource carte'
    verbose_name_plural = 'Ressources cartes'

  def __str__(self):
    return f'{self.zone.name} — {self.resource_type}'


class DownloadJob(models.Model):
  """Job de téléchargement / import (continue en arrière-plan)."""

  STATUS_CHOICES = [
      ('queued', 'En file'),
      ('running', 'En cours'),
      ('paused', 'Pause'),
      ('completed', 'Terminé'),
      ('failed', 'Échoué'),
      ('cancelled', 'Annulé'),
  ]
  STAGE_CHOICES = [
      ('download', 'Téléchargement Geofabrik'),
      ('filter', 'Lecture & extraction PBF'),
      ('import', 'Import base'),
      ('clean', 'Nettoyage'),
      ('normalize', 'Normalisation'),
      ('validate', 'Validation DAXI'),
      ('publish', 'Publication'),
      ('mbtiles', 'Génération MBTiles'),
  ]

  zone = models.ForeignKey(GeoZone, on_delete=models.CASCADE, related_name='download_jobs')
  status = models.CharField(max_length=12, choices=STATUS_CHOICES, default='queued')
  stage = models.CharField(max_length=16, choices=STAGE_CHOICES, default='download')
  progress_pct = models.FloatField(default=0)
  bytes_done = models.BigIntegerField(default=0)
  bytes_total = models.BigIntegerField(default=0)
  items_done = models.BigIntegerField(default=0)
  items_total = models.BigIntegerField(default=0)
  speed_bps = models.FloatField(default=0)
  eta_seconds = models.PositiveIntegerField(null=True, blank=True)
  files_done = models.PositiveIntegerField(default=0)
  files_total = models.PositiveIntegerField(default=0)
  logs = models.JSONField(default=list, blank=True)
  celery_task_id = models.CharField(max_length=100, blank=True, default='')
  error_message = models.TextField(blank=True, default='')
  started_at = models.DateTimeField(null=True, blank=True)
  finished_at = models.DateTimeField(null=True, blank=True)
  created_at = models.DateTimeField(auto_now_add=True)
  updated_at = models.DateTimeField(auto_now=True)

  class Meta:
    verbose_name = 'Job téléchargement'
    verbose_name_plural = 'Jobs téléchargement'
    ordering = ['-created_at']

  def append_log(self, message: str, level: str = 'info') -> None:
    from django.utils import timezone
    from geo.job_utils import save_with_retry
    logs = list(self.logs or [])
    logs.append({
        'ts': timezone.now().isoformat(),
        'level': level,
        'message': message,
    })
    self.logs = logs[-500:]
    save_with_retry(self, update_fields=['logs', 'updated_at'])

  def __str__(self):
    return f'Job #{self.pk} — {self.zone.name} ({self.status})'
