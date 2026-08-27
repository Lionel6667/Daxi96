from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('enterprises', '0001_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='enterprise',
            name='email',
            field=models.EmailField(verbose_name='Email'),
        ),
        migrations.AlterUniqueTogether(
            name='enterprise',
            unique_together={('email', 'name')},
        ),
    ]
