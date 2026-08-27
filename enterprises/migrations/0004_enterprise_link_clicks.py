from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('enterprises', '0003_enterprisewithdrawal'),
    ]

    operations = [
        migrations.AddField(
            model_name='enterprise',
            name='link_clicks',
            field=models.PositiveIntegerField(default=0, verbose_name='Clics sur le lien affilié'),
        ),
    ]
