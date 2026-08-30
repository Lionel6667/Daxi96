

from django.db import migrations, models


def backfill_public_codes(apps, schema_editor):
    from django.db.models import Q
    Order = apps.get_model('orders', 'Order')
    import secrets
    alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
    used = set(
        Order.objects.exclude(public_code__isnull=True)
        .exclude(public_code='')
        .values_list('public_code', flat=True)
    )
    for order in Order.objects.filter(Q(public_code__isnull=True) | Q(public_code='')).iterator():
        for _ in range(40):
            code = 'DX-' + ''.join(secrets.choice(alphabet) for _ in range(7))
            if code not in used:
                used.add(code)
                order.public_code = code
                order.save(update_fields=['public_code'])
                break


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0029_order_round_trip_pickup_request'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='public_code',
            field=models.CharField(
                blank=True,
                db_index=True,
                help_text='Référence non séquentielle affichée client/entreprise (ex. DX-7K4M2Q9)',
                max_length=16,
                null=True,
                unique=True,
                verbose_name='Code public',
            ),
        ),
        migrations.RunPython(backfill_public_codes, noop_reverse),
    ]
