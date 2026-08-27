

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('chatbot', '0001_initial'),
    ]

    operations = [
        migrations.RenameIndex(
            model_name='sitetranslation',
            new_name='chatbot_sit_languag_fdc087_idx',
            old_name='chatbot_sit_languag_idx',
        ),
    ]
