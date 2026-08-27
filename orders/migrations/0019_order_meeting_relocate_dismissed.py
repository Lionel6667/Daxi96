from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0018_order_meeting_prompt_acknowledged'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='meeting_relocate_dismissed',
            field=models.BooleanField(default=False, verbose_name='Alerte déplacement RDV ignorée'),
        ),
    ]
