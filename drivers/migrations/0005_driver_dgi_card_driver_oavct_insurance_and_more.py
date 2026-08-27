

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('drivers', '0004_driver_car_brand_driver_car_image_url_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='driver',
            name='dgi_card',
            field=models.ImageField(blank=True, null=True, upload_to='licenses/', verbose_name='Carte DGI'),
        ),
        migrations.AddField(
            model_name='driver',
            name='oavct_insurance',
            field=models.ImageField(blank=True, null=True, upload_to='licenses/', verbose_name='OAVCT'),
        ),
        migrations.AddField(
            model_name='driver',
            name='tint_permit',
            field=models.ImageField(blank=True, null=True, upload_to='licenses/', verbose_name='Permis Teinte'),
        ),
        migrations.AddField(
            model_name='driver',
            name='verification_notes',
            field=models.TextField(blank=True, verbose_name='Notes de vérification'),
        ),
    ]
