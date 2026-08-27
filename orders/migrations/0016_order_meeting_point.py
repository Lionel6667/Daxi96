from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0015_ordermessage_audio_url'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='meeting_lat',
            field=models.FloatField(blank=True, null=True, verbose_name='Lieu RDV lat (figé)'),
        ),
        migrations.AddField(
            model_name='order',
            name='meeting_lng',
            field=models.FloatField(blank=True, null=True, verbose_name='Lieu RDV lng (figé)'),
        ),
        migrations.AddField(
            model_name='order',
            name='meeting_relocate_prompted_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='order',
            name='pickup_confirm_sent',
            field=models.BooleanField(default=False, verbose_name='Rappel RDV 1h envoyé'),
        ),
    ]
