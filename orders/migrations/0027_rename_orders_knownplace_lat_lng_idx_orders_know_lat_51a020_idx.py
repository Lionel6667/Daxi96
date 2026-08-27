

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0026_knownplace_search_terms'),
    ]

    operations = [
        migrations.RenameIndex(
            model_name='knownplace',
            new_name='orders_know_lat_51a020_idx',
            old_name='orders_knownplace_lat_lng_idx',
        ),
    ]
