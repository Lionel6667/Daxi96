from rest_framework import serializers
from .models import RouteTag, PricingZone, PricingConfig, PriceCalculationLog


class RouteTagSerializer(serializers.ModelSerializer):
    class Meta:
        model = RouteTag
        fields = [
            'id', 'name', 'color', 'impact_percent',
            'time_multiplier', 'affects_time', 'seconds_per_km',
            'is_danger', 'notify_on_approach', 'is_system', 'alert_message', 'description',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class PricingZoneSerializer(serializers.ModelSerializer):
    tags = RouteTagSerializer(many=True, read_only=True)
    tag_ids = serializers.PrimaryKeyRelatedField(
        many=True, queryset=RouteTag.objects.all(),
        source='tags', write_only=True, required=False
    )
    total_impact_percent = serializers.ReadOnlyField()
    combined_time_multiplier = serializers.ReadOnlyField()

    class Meta:
        model = PricingZone
        fields = [
            'id', 'name', 'polygon', 'tags', 'tag_ids',
            'display_color', 'display_opacity',
            'total_impact_percent', 'combined_time_multiplier',
            'is_active', 'notes',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class PricingZoneListSerializer(serializers.ModelSerializer):
    """Version allégée pour la liste (sans polygon complet)."""
    tags = RouteTagSerializer(many=True, read_only=True)
    total_impact_percent = serializers.ReadOnlyField()

    class Meta:
        model = PricingZone
        fields = [
            'id', 'name', 'tags', 'display_color', 'display_opacity',
            'total_impact_percent', 'is_active',
            'created_at', 'updated_at',
        ]


class PricingConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = PricingConfig
        fields = [
            'id', 'name',
            'base_price_per_km', 'minimum_price',
            'global_multiplier', 'max_zone_impact_percent',
            'round_trip_multiplier', 'passenger_price_percent',
            'wait_price_per_30min', 'pause_price_per_5min',
            'default_driver_commission_rate',
            'currency', 'is_active', 'notes',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class PriceCalculationLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = PriceCalculationLog
        fields = '__all__'


                                                                             
                                         
                                                                             

class CalculatePriceRequestSerializer(serializers.Serializer):
    origin_lat = serializers.FloatField(
        help_text='Latitude du point de départ'
    )
    origin_lng = serializers.FloatField(
        help_text='Longitude du point de départ'
    )
    dest_lat = serializers.FloatField(
        help_text='Latitude de la destination'
    )
    dest_lng = serializers.FloatField(
        help_text='Longitude de la destination'
    )
    origin_address = serializers.CharField(required=False, default='', allow_blank=True)
    destination_address = serializers.CharField(required=False, default='', allow_blank=True)
    order_id = serializers.CharField(required=False, default='', allow_blank=True)
    save_log = serializers.BooleanField(required=False, default=True)
    google_duration_s = serializers.FloatField(required=False, allow_null=True)
    google_distance_km = serializers.FloatField(required=False, allow_null=True)

    def validate(self, data):
        for field in ['origin_lat', 'origin_lng', 'dest_lat', 'dest_lng']:
            val = data.get(field)
            if val is None:
                raise serializers.ValidationError(f'{field} est requis.')
                                        
        if not (-90 <= data['origin_lat'] <= 90):
            raise serializers.ValidationError('origin_lat doit être entre -90 et 90.')
        if not (-180 <= data['origin_lng'] <= 180):
            raise serializers.ValidationError('origin_lng doit être entre -180 et 180.')
        if not (-90 <= data['dest_lat'] <= 90):
            raise serializers.ValidationError('dest_lat doit être entre -90 et 90.')
        if not (-180 <= data['dest_lng'] <= 180):
            raise serializers.ValidationError('dest_lng doit être entre -180 et 180.')
        return data


class CalculatePriceResponseSerializer(serializers.Serializer):
    final_price = serializers.DecimalField(max_digits=8, decimal_places=2)
    base_price = serializers.DecimalField(max_digits=8, decimal_places=2)
    total_distance_km = serializers.FloatField()
    duration_s = serializers.FloatField()
    currency = serializers.CharField()
    zones_breakdown = serializers.ListField()
    route_source = serializers.CharField()
    config = serializers.DictField()
    route_coordinates = serializers.ListField(required=False)
