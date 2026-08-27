from rest_framework import serializers
from .models import Order, OrderMessage, LostObject


class OrderMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderMessage
        fields = ['id', 'sender_type', 'sender_name', 'content', 'is_read', 'timestamp']
        read_only_fields = ['id', 'timestamp']


class OrderSerializer(serializers.ModelSerializer):
    messages = OrderMessageSerializer(many=True, read_only=True)
    driver_name = serializers.SerializerMethodField()
    driver_phone = serializers.SerializerMethodField()
    driver_photo = serializers.SerializerMethodField()
    driver_vehicle = serializers.SerializerMethodField()
    driver_plate = serializers.SerializerMethodField()
    driver_rating = serializers.SerializerMethodField()
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = Order
        fields = [
            'id', 'client_name', 'client_email', 'client_phone',
            'pickup', 'destination',
            'pickup_lat', 'pickup_lng', 'destination_lat', 'destination_lng',
            'date', 'time', 'vehicle_type', 'notes',
            'trip_type', 'is_later', 'scheduled_at', 'passengers',
            'is_paused', 'pause_price', 'pause_accumulated_seconds',
            'is_extended', 'extra_km_price',
            'payment_method', 'payment_status',
            'status', 'status_display', 'price', 'price_confirmed',
            'driver', 'driver_name', 'driver_phone', 'driver_photo',
            'driver_vehicle', 'driver_plate', 'driver_rating',
            'created_at', 'updated_at',
            'price_proposed_at', 'driver_assigned_at', 'on_way_at',
            'arrived_at', 'in_progress_at', 'completed_at',
            'messages', 'guest_id', 'user',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'status']

    def get_driver_name(self, obj):
        return obj.driver.full_name if obj.driver else None

    def get_driver_phone(self, obj):
        return obj.driver.phone if obj.driver else None

    def get_driver_photo(self, obj):
        if obj.driver and obj.driver.photo:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.driver.photo.url)
            return obj.driver.photo.url
        return None

    def get_driver_vehicle(self, obj):
        return obj.driver.vehicle if obj.driver else None

    def get_driver_plate(self, obj):
        return obj.driver.plate if obj.driver else None

    def get_driver_rating(self, obj):
        return obj.driver.rating if obj.driver else None


class OrderCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Order
        fields = [
            'client_name', 'client_email', 'client_phone',
            'pickup', 'destination',
            'pickup_lat', 'pickup_lng', 'destination_lat', 'destination_lng',
            'date', 'time', 'vehicle_type', 'notes', 'guest_id'
        ]
        extra_kwargs = {
            'client_name': {'required': True},
            'client_email': {'required': True},
            'pickup': {'required': True},
            'destination': {'required': True},
            'date': {'required': True},
            'time': {'required': True},
        }


class LostObjectSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    order_pickup = serializers.CharField(source='order.pickup', read_only=True)
    order_destination = serializers.CharField(source='order.destination', read_only=True)

    class Meta:
        model = LostObject
        fields = [
            'id', 'order', 'user', 'description', 'status', 'status_display',
            'order_pickup', 'order_destination', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'status']
