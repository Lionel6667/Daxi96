from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0013_blocked_contact'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='sos_triggered_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='SOS déclenché le'),
        ),
        migrations.AddField(
            model_name='order',
            name='sos_triggered_by',
            field=models.CharField(
                blank=True,
                choices=[('client', 'Client'), ('driver', 'Chauffeur')],
                max_length=10,
                verbose_name='SOS déclenché par',
            ),
        ),
        migrations.AddField(
            model_name='lostobject',
            name='driver_handled',
            field=models.BooleanField(default=False, verbose_name='Traité par le chauffeur'),
        ),
        migrations.AddField(
            model_name='lostobject',
            name='driver_handled_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
