from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('drivers', '0012_driver_last_seen_at'),
    ]

    operations = [
        migrations.AddField(
            model_name='driver',
            name='vehicle_reference_photo',
            field=models.ImageField(
                blank=True,
                null=True,
                upload_to='drivers/vehicle_reference/',
                verbose_name='Photo référence véhicule (chauffeur)',
                help_text="Photo envoyée par le chauffeur à l'inscription — admin uniquement",
            ),
        ),
        migrations.AddField(
            model_name='driver',
            name='vehicle_professional_photo',
            field=models.ImageField(
                blank=True,
                null=True,
                upload_to='drivers/vehicle_professional/',
                verbose_name='Photo professionnelle véhicule (public)',
                help_text="Photo officielle uploadée par l'admin — affichée publiquement",
            ),
        ),
        migrations.AlterField(
            model_name='driver',
            name='car_image_url',
            field=models.TextField(
                blank=True,
                verbose_name='Image voiture (URL legacy)',
                help_text='URL publique legacy — préférer vehicle_professional_photo',
            ),
        ),
    ]
