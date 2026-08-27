from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0010_alter_lostobject_user_nullable'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='round_trip_wait_minutes',
            field=models.PositiveIntegerField(default=0, verbose_name='Attente aller-retour (minutes)'),
        ),
        migrations.AddField(
            model_name='order',
            name='round_trip_allow_driver_other_rides',
            field=models.BooleanField(
                default=False,
                verbose_name='Chauffeur autorisé autres courses si attente ≥ 30 min',
            ),
        ),
    ]
