from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('drivers', '0001_initial'),
        ('orders', '0016_order_meeting_point'),
    ]

    operations = [
        migrations.CreateModel(
            name='KnownPlace',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('label', models.CharField(max_length=500, verbose_name='Nom affiché')),
                ('lat', models.FloatField()),
                ('lng', models.FloatField()),
                ('kind', models.CharField(
                    choices=[('pickup', 'Départ'), ('dest', 'Destination'), ('both', 'Les deux')],
                    default='both', max_length=8,
                )),
                ('use_count', models.PositiveIntegerField(default=0)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('source_order', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='known_places_created', to='orders.order',
                )),
                ('validated_by', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='validated_places', to='drivers.driver',
                )),
            ],
            options={
                'verbose_name': 'Lieu connu',
                'verbose_name_plural': 'Lieux connus',
                'ordering': ['-updated_at'],
            },
        ),
        migrations.AddConstraint(
            model_name='knownplace',
            constraint=models.UniqueConstraint(fields=('lat', 'lng'), name='orders_knownplace_unique_coords'),
        ),
    ]
