from rest_framework import serializers
from django.utils import timezone
from .models import Driver, DriverReview
from julmin_taxis.driver_presence import get_driver_presence

ACTIVE_ORDER_STATUSES = ['driver_assigned', 'on_way', 'arrived', 'in_progress', 'waiting_return']


class DriverSerializer(serializers.ModelSerializer):
    full_name = serializers.ReadOnlyField()
    photo_url = serializers.SerializerMethodField()
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    reviews_count = serializers.SerializerMethodField()
    wallet_balance = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    cash_owed_to_admin = serializers.SerializerMethodField()
    withdrawable_balance = serializers.SerializerMethodField()
    rating = serializers.SerializerMethodField()
    is_online = serializers.SerializerMethodField()
    presence_status = serializers.SerializerMethodField()
    availability = serializers.SerializerMethodField()
    status_since = serializers.SerializerMethodField()
    status_duration_label = serializers.SerializerMethodField()
    active_order = serializers.SerializerMethodField()
    location_updated_at = serializers.DateTimeField(read_only=True)
    status_updated_at = serializers.DateTimeField(read_only=True)
    last_seen_at = serializers.DateTimeField(read_only=True)

    class Meta:
        model = Driver
        fields = [
            'id', 'firstname', 'lastname', 'full_name', 'email', 'phone',
            'photo', 'photo_url', 'vehicle', 'plate', 'status', 'status_display',
            'latitude', 'longitude', 'location_updated_at', 'status_updated_at', 'last_seen_at',
            'is_online', 'presence_status', 'availability', 'status_since', 'status_duration_label', 'active_order',
            'rating', 'rating_count', 'reviews_count',
            'total_earnings', 'wallet_balance', 'cash_owed_to_admin', 'withdrawable_balance',
            'completed_trips', 'is_blocked', 'is_verified',
            'created_at'
        ]
        extra_kwargs = {'photo': {'write_only': True}}

    def get_cash_owed_to_admin(self, obj):
        return float(obj.cash_owed_to_admin)

    def get_withdrawable_balance(self, obj):
        return float(obj.withdrawable_balance)

    def get_rating(self, obj):
        avg = getattr(obj, 'reviews_avg', None)
        reviews_total = getattr(obj, 'reviews_total', None)
        if reviews_total:
            return round(float(avg), 1) if avg is not None else None
        if obj.reviews.exists():
            from django.db.models import Avg
            live = obj.reviews.aggregate(a=Avg('rating'))['a']
            return round(float(live), 1) if live is not None else None
        return None

    def get_photo_url(self, obj):
        from julmin_taxis.driver_display_utils import _driver_photo_url
        return _driver_photo_url(obj, request=self.context.get('request')) or None

    def get_reviews_count(self, obj):
        return obj.reviews.count()

    def _presence(self, obj):
        if not hasattr(obj, '_cached_presence'):
            obj._cached_presence = get_driver_presence(obj)
        return obj._cached_presence

    def get_is_online(self, obj):
        return self._presence(obj)['is_online']

    def get_presence_status(self, obj):
        return self._presence(obj)['presence_status']

    def get_availability(self, obj):
        return self._presence(obj)['availability']

    def get_status_since(self, obj):
        if obj.status_updated_at:
            return obj.status_updated_at.isoformat()
        return None

    def get_status_duration_label(self, obj):
        label = self._presence(obj)['status_label']
        o = self._get_active_order_obj(obj)
        if o and self._presence(obj)['is_online']:
            return f'{label} — Course #{o.pk}'
        return label

    def _get_active_order_obj(self, obj):
        pref = getattr(obj, '_prefetched_active_orders', None)
        if pref is not None:
            return pref[0] if pref else None
        return obj.orders.filter(status__in=ACTIVE_ORDER_STATUSES).order_by('-updated_at').first()

    def get_active_order(self, obj):
        o = self._get_active_order_obj(obj)
        if not o:
            return None
        return {
            'id': o.pk,
            'status': o.status,
            'status_display': o.get_status_display(),
            'pickup': o.pickup or '',
        }


class DriverCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Driver
        fields = [
            'firstname', 'lastname', 'email', 'phone',
            'photo', 'vehicle', 'plate', 'is_verified'
        ]

    def validate_email(self, value):
        qs = Driver.objects.filter(email=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('Un chauffeur avec cet email existe déjà.')
        return value


class DriverReviewSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()

    class Meta:
        model = DriverReview
        fields = ['id', 'rating', 'comment', 'user_name', 'created_at', 'order']
        read_only_fields = ['id', 'user_name', 'created_at']
        extra_kwargs = {'order': {'read_only': True}}

    def get_user_name(self, obj):
        if obj.user:
            return obj.user.get_full_name() or obj.user.username
        return 'Anonyme'

    def validate_rating(self, value):
        if not 1 <= value <= 5:
            raise serializers.ValidationError('La note doit être entre 1 et 5.')
        return value
