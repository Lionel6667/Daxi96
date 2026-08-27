

from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
    ]

    operations = [
        migrations.CreateModel(
            name='CoveredDepartment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('slug', models.CharField(choices=[('nord', 'Nord'), ('nord_est', 'Nord-Est'), ('nord_ouest', 'Nord-Ouest'), ('artibonite', 'Artibonite'), ('centre', 'Centre'), ('ouest', 'Ouest'), ('sud', 'Sud'), ('sud_est', 'Sud-Est'), ('grande_anse', 'Grande-Anse'), ('nippes', 'Nippes')], max_length=30, unique=True)),
                ('name', models.CharField(max_length=60)),
                ('is_active', models.BooleanField(default=False, verbose_name='Couvert par DAXI')),
                ('lat_min', models.FloatField(blank=True, null=True)),
                ('lat_max', models.FloatField(blank=True, null=True)),
                ('lng_min', models.FloatField(blank=True, null=True)),
                ('lng_max', models.FloatField(blank=True, null=True)),
            ],
            options={
                'verbose_name': 'Département couvert',
                'verbose_name_plural': 'Départements couverts',
                'ordering': ['name'],
            },
        ),
    ]
