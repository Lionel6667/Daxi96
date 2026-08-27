

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('drivers', '0002_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='driver',
            name='city',
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name='driver',
            name='firebase_uid',
            field=models.CharField(blank=True, db_index=True, max_length=100),
        ),
        migrations.AddField(
            model_name='driver',
            name='full_name',
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.AddField(
            model_name='driver',
            name='password_hash',
            field=models.CharField(blank=True, max_length=64),
        ),
        migrations.AddField(
            model_name='driver',
            name='photo_base64',
            field=models.TextField(blank=True),
        ),
        migrations.AlterField(
            model_name='driver',
            name='email',
            field=models.EmailField(blank=True, max_length=254, null=True, unique=True),
        ),
        migrations.AlterField(
            model_name='driver',
            name='firstname',
            field=models.CharField(blank=True, max_length=100, verbose_name='Prénom'),
        ),
        migrations.AlterField(
            model_name='driver',
            name='lastname',
            field=models.CharField(blank=True, max_length=100, verbose_name='Nom'),
        ),
        migrations.AlterField(
            model_name='driver',
            name='phone',
            field=models.CharField(blank=True, max_length=20, verbose_name='Téléphone'),
        ),
        migrations.AlterField(
            model_name='driver',
            name='plate',
            field=models.CharField(blank=True, max_length=20, verbose_name='Plaque'),
        ),
        migrations.AlterField(
            model_name='driver',
            name='vehicle',
            field=models.CharField(blank=True, max_length=100, verbose_name='Véhicule'),
        ),
    ]
