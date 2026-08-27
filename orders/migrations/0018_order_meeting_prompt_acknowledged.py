from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0017_knownplace'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='meeting_prompt_acknowledged',
            field=models.BooleanField(
                default=False,
                verbose_name='Client a répondu au rappel lieu de RDV',
            ),
        ),
    ]
