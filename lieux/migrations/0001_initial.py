from django.db import migrations, models
import django.db.models.deletion


def seed_categories(apps, schema_editor):
    Cat = apps.get_model('lieux', 'LieuxCategory')
    rows = [
        ('restaurant', 'Restaurants', 'ri-restaurant-2-line', '#ea580c', 1),
        ('hotel', 'Hôtels', 'ri-hotel-bed-line', '#7c3aed', 2),
        ('market', 'Supermarchés', 'ri-store-2-line', '#059669', 3),
        ('cafe', 'Cafés', 'ri-cup-line', '#b45309', 4),
        ('nightlife', 'Vie nocturne', 'ri-moon-clear-line', '#db2777', 5),
        ('beach', 'Plages', 'ri-sun-line', '#0284c7', 6),
        ('culture', 'Culture', 'ri-ancient-gate-line', '#c27803', 7),
        ('shopping', 'Shopping', 'ri-shopping-bag-3-line', '#4f46e5', 8),
    ]
    for slug, name, icon, color, order in rows:
        Cat.objects.get_or_create(slug=slug, defaults={'name': name, 'icon': icon, 'color': color, 'order': order})


class Migration(migrations.Migration):
    initial = True
    dependencies = [
        ('enterprises', '0001_initial'),
    ]
    operations = [
        migrations.CreateModel(
            name='LieuxCategory',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('slug', models.SlugField(max_length=40, unique=True)),
                ('name', models.CharField(max_length=80)),
                ('icon', models.CharField(default='ri-map-pin-line', max_length=60)),
                ('color', models.CharField(default='#c27803', max_length=20)),
                ('order', models.PositiveIntegerField(default=0)),
                ('is_active', models.BooleanField(default=True)),
            ],
            options={'ordering': ['order', 'name']},
        ),
        migrations.CreateModel(
            name='LieuxPlace',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('address', models.CharField(blank=True, default='', max_length=400)),
                ('hours', models.CharField(blank=True, default='', max_length=240, verbose_name='Horaires')),
                ('description', models.TextField(blank=True, default='')),
                ('cover', models.ImageField(blank=True, null=True, upload_to='lieux/covers/')),
                ('latitude', models.FloatField(blank=True, null=True)),
                ('longitude', models.FloatField(blank=True, null=True)),
                ('is_published', models.BooleanField(default=True)),
                ('featured', models.BooleanField(default=False)),
                ('order', models.PositiveIntegerField(default=0)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('category', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='places', to='lieux.lieuxcategory')),
                ('enterprise', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='visit_places', to='enterprises.enterprise')),
            ],
            options={'ordering': ['-featured', 'order', 'name']},
        ),
        migrations.CreateModel(
            name='LieuxPhoto',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('image', models.ImageField(upload_to='lieux/gallery/')),
                ('caption', models.CharField(blank=True, default='', max_length=160)),
                ('order', models.PositiveIntegerField(default=0)),
                ('place', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='photos', to='lieux.lieuxplace')),
            ],
            options={'ordering': ['order', 'id']},
        ),
        migrations.RunPython(seed_categories, migrations.RunPython.noop),
    ]
