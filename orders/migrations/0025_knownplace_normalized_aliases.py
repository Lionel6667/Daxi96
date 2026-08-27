from django.db import migrations, models


def backfill_normalized_labels(apps, schema_editor):
    KnownPlace = apps.get_model('orders', 'KnownPlace')
    from julmin_taxis.known_places_utils import normalize_place_name
    for kp in KnownPlace.objects.all().iterator():
        kp.normalized_label = normalize_place_name(kp.label)[:500]
        kp.save(update_fields=['normalized_label'])


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0024_security_log'),
    ]

    operations = [
        migrations.AddField(
            model_name='knownplace',
            name='normalized_label',
            field=models.CharField(blank=True, db_index=True, default='', max_length=500),
        ),
        migrations.AddField(
            model_name='knownplace',
            name='aliases',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='knownplace',
            name='source',
            field=models.CharField(
                choices=[('manual', 'Placé manuellement'), ('import', 'Import'), ('osm', 'OpenStreetMap')],
                default='manual',
                max_length=12,
            ),
        ),
        migrations.AddIndex(
            model_name='knownplace',
            index=models.Index(fields=['lat', 'lng'], name='orders_knownplace_lat_lng_idx'),
        ),
        migrations.RunPython(backfill_normalized_labels, migrations.RunPython.noop),
    ]
