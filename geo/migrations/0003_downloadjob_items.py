from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('geo', '0002_geozone_city_slug'),
    ]

    operations = [
        migrations.AddField(
            model_name='downloadjob',
            name='items_done',
            field=models.BigIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='downloadjob',
            name='items_total',
            field=models.BigIntegerField(default=0),
        ),
    ]
