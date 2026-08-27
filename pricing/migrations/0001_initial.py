from django.db import migrations, models
import django.core.validators


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='RouteTag',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=100, unique=True, verbose_name='Nom')),
                ('color', models.CharField(default='#FF0000', help_text='Couleur hexadécimale, ex: #FF5733', max_length=7, verbose_name='Couleur (hex)')),
                ('impact_percent', models.FloatField(default=0.0, help_text='Ex: 15 = +15%, -10 = -10%', validators=[django.core.validators.MinValueValidator(-50.0), django.core.validators.MaxValueValidator(200.0)], verbose_name='Impact sur le prix (%)')),
                ('time_multiplier', models.FloatField(default=1.0, help_text='Ex: 2.0 = 1 km prend 2× plus de temps. 1.0 = normal.', validators=[django.core.validators.MinValueValidator(0.1), django.core.validators.MaxValueValidator(10.0)], verbose_name='Multiplicateur de temps')),
                ('description', models.TextField(blank=True, verbose_name='Description')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Tag de condition',
                'verbose_name_plural': 'Tags de conditions',
                'ordering': ['name'],
            },
        ),
        migrations.CreateModel(
            name='PricingConfig',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(default='Configuration principale', max_length=100, verbose_name='Nom de la configuration')),
                ('base_price_per_km', models.DecimalField(decimal_places=2, default=1.5, max_digits=6, validators=[django.core.validators.MinValueValidator(0.01)], verbose_name='Prix de base par km ($)')),
                ('minimum_price', models.DecimalField(decimal_places=2, default=3.0, max_digits=6, validators=[django.core.validators.MinValueValidator(0.01)], verbose_name='Prix minimum ($)')),
                ('global_multiplier', models.FloatField(default=1.0, help_text='Appliqué en dernier sur le prix total. 1.0 = normal, 1.2 = +20%', validators=[django.core.validators.MinValueValidator(0.1), django.core.validators.MaxValueValidator(5.0)], verbose_name='Multiplicateur global')),
                ('max_zone_impact_percent', models.FloatField(default=100.0, help_text="Plafonne l'impact cumulé des tags dans une zone. Ex: 100 = max +100%", validators=[django.core.validators.MinValueValidator(0.0), django.core.validators.MaxValueValidator(300.0)], verbose_name='Impact maximal par zone (%)')),
                ('currency', models.CharField(default='USD', max_length=3, verbose_name='Devise')),
                ('is_active', models.BooleanField(default=True, verbose_name='Active')),
                ('notes', models.TextField(blank=True, verbose_name='Notes')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Configuration tarifaire',
                'verbose_name_plural': 'Configurations tarifaires',
            },
        ),
        migrations.CreateModel(
            name='PricingZone',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200, verbose_name='Nom de la zone')),
                ('polygon', models.JSONField(default=dict, verbose_name='Polygone (GeoJSON)')),
                ('display_color', models.CharField(default='#3388ff', help_text='Couleur de la zone sur la carte', max_length=7, verbose_name="Couleur d'affichage")),
                ('display_opacity', models.FloatField(default=0.3, validators=[django.core.validators.MinValueValidator(0.0), django.core.validators.MaxValueValidator(1.0)], verbose_name="Opacité d'affichage")),
                ('is_active', models.BooleanField(default=True, verbose_name='Active')),
                ('notes', models.TextField(blank=True, verbose_name='Notes')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('tags', models.ManyToManyField(blank=True, related_name='zones', to='pricing.routetag', verbose_name='Conditions associées')),
            ],
            options={
                'verbose_name': 'Zone de tarification',
                'verbose_name_plural': 'Zones de tarification',
                'ordering': ['name'],
            },
        ),
        migrations.CreateModel(
            name='PriceCalculationLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('origin_lat', models.FloatField()),
                ('origin_lng', models.FloatField()),
                ('destination_lat', models.FloatField()),
                ('destination_lng', models.FloatField()),
                ('origin_address', models.TextField(blank=True)),
                ('destination_address', models.TextField(blank=True)),
                ('total_distance_km', models.FloatField()),
                ('base_price', models.DecimalField(decimal_places=2, max_digits=8)),
                ('final_price', models.DecimalField(decimal_places=2, max_digits=8)),
                ('currency', models.CharField(default='USD', max_length=3)),
                ('zones_breakdown', models.JSONField(default=list, verbose_name='Détail par zone')),
                ('config_snapshot', models.JSONField(default=dict, verbose_name='Config au moment du calcul')),
                ('order_id', models.CharField(blank=True, db_index=True, max_length=100)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'verbose_name': 'Journal de calcul de prix',
                'verbose_name_plural': 'Journal des calculs de prix',
                'ordering': ['-created_at'],
            },
        ),
    ]
