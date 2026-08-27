

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('drivers', '0003_driver_city_driver_firebase_uid_driver_full_name_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='driver',
            name='car_brand',
            field=models.CharField(blank=True, max_length=50, verbose_name='Marque'),
        ),
        migrations.AddField(
            model_name='driver',
            name='car_image_url',
            field=models.TextField(blank=True, verbose_name='Image voiture'),
        ),
        migrations.AddField(
            model_name='driver',
            name='car_model',
            field=models.CharField(blank=True, max_length=50, verbose_name='Modèle'),
        ),
        migrations.AddField(
            model_name='driver',
            name='car_year',
            field=models.CharField(blank=True, max_length=4, verbose_name='Année'),
        ),
        migrations.AddField(
            model_name='driver',
            name='driving_license',
            field=models.ImageField(blank=True, null=True, upload_to='licenses/', verbose_name='Permis de conduire'),
        ),
    ]
