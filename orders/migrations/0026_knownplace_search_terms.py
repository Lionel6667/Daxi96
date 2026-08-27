from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0025_knownplace_normalized_aliases'),
    ]

    operations = [
        migrations.AddField(
            model_name='knownplace',
            name='search_terms',
            field=models.JSONField(
                blank=True,
                default=list,
                help_text='Termes saisis par les clients avant correction — améliore la recherche',
            ),
        ),
    ]
