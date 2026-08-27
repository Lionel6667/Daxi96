

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='customuser',
            name='firebase_uid',
            field=models.CharField(blank=True, db_index=True, max_length=100),
        ),
        migrations.AddField(
            model_name='customuser',
            name='firebase_user_id',
            field=models.CharField(blank=True, db_index=True, max_length=20),
        ),
    ]
