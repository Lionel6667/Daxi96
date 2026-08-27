

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('drivers', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Order',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('guest_id', models.CharField(blank=True, max_length=100)),
                ('client_name', models.CharField(max_length=200, verbose_name='Nom client')),
                ('client_email', models.EmailField(max_length=254, verbose_name='Email client')),
                ('client_phone', models.CharField(max_length=20, verbose_name='Téléphone client')),
                ('pickup', models.TextField(verbose_name='Lieu de départ')),
                ('destination', models.TextField(verbose_name='Destination')),
                ('pickup_lat', models.FloatField(blank=True, null=True)),
                ('pickup_lng', models.FloatField(blank=True, null=True)),
                ('destination_lat', models.FloatField(blank=True, null=True)),
                ('destination_lng', models.FloatField(blank=True, null=True)),
                ('date', models.DateField(verbose_name='Date')),
                ('time', models.TimeField(verbose_name='Heure')),
                ('vehicle_type', models.CharField(choices=[('economy', 'Économique'), ('premium', 'Premium'), ('suv', 'SUV'), ('van', 'Van')], default='economy', max_length=20)),
                ('notes', models.TextField(blank=True, verbose_name='Notes')),
                ('status', models.CharField(choices=[('pending', 'En attente'), ('price_proposed', 'Prix proposé'), ('price_confirmed', 'Prix confirmé'), ('driver_assigned', 'Chauffeur assigné'), ('on_way', 'En route'), ('arrived', 'Arrivé'), ('in_progress', 'Course en cours'), ('completed', 'Terminé'), ('cancelled', 'Annulé')], default='pending', max_length=20)),
                ('price', models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True)),
                ('price_confirmed', models.BooleanField(default=False)),
                ('price_email_sent', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('price_proposed_at', models.DateTimeField(blank=True, null=True)),
                ('driver_assigned_at', models.DateTimeField(blank=True, null=True)),
                ('on_way_at', models.DateTimeField(blank=True, null=True)),
                ('arrived_at', models.DateTimeField(blank=True, null=True)),
                ('in_progress_at', models.DateTimeField(blank=True, null=True)),
                ('completed_at', models.DateTimeField(blank=True, null=True)),
                ('cancelled_at', models.DateTimeField(blank=True, null=True)),
                ('reminder_sent', models.BooleanField(default=False)),
                ('completion_email_sent', models.BooleanField(default=False)),
                ('driver', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='orders', to='drivers.driver')),
                ('user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='orders', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Commande',
                'verbose_name_plural': 'Commandes',
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='OrderMessage',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('sender_type', models.CharField(choices=[('user', 'Client'), ('driver', 'Chauffeur'), ('admin', 'Admin'), ('system', 'Système')], max_length=10)),
                ('sender_name', models.CharField(blank=True, max_length=200)),
                ('content', models.TextField()),
                ('is_read', models.BooleanField(default=False)),
                ('timestamp', models.DateTimeField(auto_now_add=True)),
                ('order', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='messages', to='orders.order')),
                ('sender', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Message de commande',
                'verbose_name_plural': 'Messages de commande',
                'ordering': ['timestamp'],
            },
        ),
    ]
