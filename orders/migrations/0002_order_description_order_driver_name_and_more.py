

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='description',
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name='order',
            name='driver_name',
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.AddField(
            model_name='order',
            name='driver_phone',
            field=models.CharField(blank=True, max_length=20),
        ),
        migrations.AddField(
            model_name='order',
            name='driver_photo_url',
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name='order',
            name='firebase_table',
            field=models.CharField(blank=True, max_length=50),
        ),
        migrations.AddField(
            model_name='order',
            name='firebase_uid',
            field=models.CharField(blank=True, db_index=True, max_length=100),
        ),
        migrations.AddField(
            model_name='order',
            name='firebase_user_id',
            field=models.CharField(blank=True, max_length=20),
        ),
        migrations.AddField(
            model_name='order',
            name='service_plan',
            field=models.CharField(blank=True, max_length=20),
        ),
        migrations.AddField(
            model_name='order',
            name='trip_type',
            field=models.CharField(blank=True, default='one_way', max_length=20),
        ),
        migrations.AlterField(
            model_name='order',
            name='client_email',
            field=models.EmailField(blank=True, max_length=254, verbose_name='Email client'),
        ),
        migrations.AlterField(
            model_name='order',
            name='client_name',
            field=models.CharField(blank=True, default='Client', max_length=200, verbose_name='Nom client'),
        ),
        migrations.AlterField(
            model_name='order',
            name='client_phone',
            field=models.CharField(blank=True, max_length=20, verbose_name='Téléphone client'),
        ),
        migrations.AlterField(
            model_name='order',
            name='date',
            field=models.DateField(blank=True, null=True, verbose_name='Date'),
        ),
        migrations.AlterField(
            model_name='order',
            name='destination',
            field=models.TextField(blank=True, verbose_name='Destination'),
        ),
        migrations.AlterField(
            model_name='order',
            name='pickup',
            field=models.TextField(blank=True, verbose_name='Lieu de départ'),
        ),
        migrations.AlterField(
            model_name='order',
            name='time',
            field=models.TimeField(blank=True, null=True, verbose_name='Heure'),
        ),
    ]
