from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0003_alter_customuser_email'),
    ]

    operations = [
        migrations.AddField(
            model_name='customuser',
            name='admin_role',
            field=models.CharField(
                blank=True,
                default='',
                help_text='Rôle admin HTMX : super_admin, finance, support, dispatch, driver_manager, enterprise_manager',
                max_length=32,
            ),
        ),
    ]
