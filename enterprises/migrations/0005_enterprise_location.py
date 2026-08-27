from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('enterprises', '0004_enterprise_link_clicks'),
    ]

    operations = [
        migrations.AddField(
            model_name='enterprise',
            name='address_label',
            field=models.CharField(blank=True, default='', max_length=500, verbose_name='Adresse affichée'),
        ),
        migrations.AddField(
            model_name='enterprise',
            name='address_lat',
            field=models.FloatField(blank=True, null=True, verbose_name='Latitude'),
        ),
        migrations.AddField(
            model_name='enterprise',
            name='address_lng',
            field=models.FloatField(blank=True, null=True, verbose_name='Longitude'),
        ),
        migrations.AddField(
            model_name='enterprise',
            name='location_help_message',
            field=models.TextField(blank=True, default='', verbose_name='Message aide emplacement'),
        ),
        migrations.AddField(
            model_name='enterprise',
            name='location_help_requested_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='enterprise',
            name='location_set_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='enterprise',
            name='location_status',
            field=models.CharField(
                choices=[('unset', 'Non défini'), ('set', 'Défini'), ('admin_help', 'Aide admin demandée')],
                default='unset',
                max_length=20,
                verbose_name='Statut emplacement',
            ),
        ),
    ]
