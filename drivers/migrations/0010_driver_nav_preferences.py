from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('drivers', '0009_driver_location_status_timestamps'),
    ]

    operations = [
        migrations.AddField(
            model_name='driver',
            name='nav_pref_mode',
            field=models.CharField(
                choices=[
                    ('ask', 'Demander à chaque trajet'),
                    ('site', 'Navigation DAXI'),
                    ('external', 'Application externe'),
                ],
                default='ask',
                max_length=20,
                verbose_name='Préférence navigation',
            ),
        ),
        migrations.AddField(
            model_name='driver',
            name='nav_pref_app',
            field=models.CharField(
                choices=[
                    ('google', 'Google Maps'),
                    ('waze', 'Waze'),
                    ('apple', 'Apple Plans'),
                ],
                default='google',
                max_length=20,
                verbose_name='Application GPS externe',
            ),
        ),
    ]
