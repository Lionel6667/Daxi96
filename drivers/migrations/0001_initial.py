

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Driver',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('firstname', models.CharField(max_length=100, verbose_name='Prénom')),
                ('lastname', models.CharField(max_length=100, verbose_name='Nom')),
                ('email', models.EmailField(max_length=254, unique=True)),
                ('phone', models.CharField(max_length=20, verbose_name='Téléphone')),
                ('photo', models.ImageField(blank=True, null=True, upload_to='drivers/')),
                ('vehicle', models.CharField(max_length=100, verbose_name='Véhicule')),
                ('plate', models.CharField(max_length=20, verbose_name='Plaque')),
                ('status', models.CharField(choices=[('available', 'Disponible'), ('busy', 'Occupé'), ('offline', 'Hors ligne')], default='offline', max_length=20)),
                ('latitude', models.FloatField(blank=True, null=True)),
                ('longitude', models.FloatField(blank=True, null=True)),
                ('rating', models.FloatField(default=0.0)),
                ('rating_count', models.PositiveIntegerField(default=0)),
                ('total_earnings', models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ('completed_trips', models.PositiveIntegerField(default=0)),
                ('is_blocked', models.BooleanField(default=False)),
                ('is_verified', models.BooleanField(default=False)),
                ('fcm_token', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('user', models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='driver_profile', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Chauffeur',
                'verbose_name_plural': 'Chauffeurs',
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='DriverReview',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('rating', models.PositiveSmallIntegerField()),
                ('comment', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('driver', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='reviews', to='drivers.driver')),
            ],
            options={
                'verbose_name': 'Avis',
                'verbose_name_plural': 'Avis',
                'ordering': ['-created_at'],
            },
        ),
    ]
