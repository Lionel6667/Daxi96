
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('geo', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='geozone',
            name='city_slug',
            field=models.CharField(blank=True, db_index=True, default='', max_length=40),
        ),
        migrations.AddField(
            model_name='geozone',
            name='scope',
            field=models.CharField(
                choices=[('department', 'Département entier'), ('city', 'Ville / commune')],
                default='department',
                max_length=12,
            ),
        ),
        migrations.AddConstraint(
            model_name='geozone',
            constraint=models.UniqueConstraint(
                fields=('department_slug', 'city_slug'),
                name='geo_zone_dept_city_uniq',
            ),
        ),
    ]
