from django.contrib.auth import get_user_model, authenticate
from rest_framework import serializers

User = get_user_model()


class UserRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6)
    password_confirm = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ['username', 'email', 'first_name', 'last_name', 'phone', 'city', 'password', 'password_confirm', 'language']
        extra_kwargs = {
            'email': {'required': True},
            'first_name': {'required': True},
        }

    def validate(self, data):
        if data['password'] != data['password_confirm']:
            raise serializers.ValidationError({'password_confirm': 'Les mots de passe ne correspondent pas.'})
        return data

    def validate_email(self, value):
        from julmin_taxis.email_validate import is_valid_email
        if not is_valid_email(value):
            raise serializers.ValidationError('Entrez une adresse email valide (ex. toi@gmail.com ou toi@entreprise.ht).')
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError('Cet email est déjà utilisé.')
        return value

    def create(self, validated_data):
        validated_data.pop('password_confirm')
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class UserLoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField()

    def validate(self, data):
        try:
            user = User.objects.get(email=data['email'])
        except User.DoesNotExist:
            raise serializers.ValidationError('Email ou mot de passe incorrect.')

        if not user.check_password(data['password']):
            raise serializers.ValidationError('Email ou mot de passe incorrect.')

        data['user'] = user
        return data


class UserProfileSerializer(serializers.ModelSerializer):
    photo_url = serializers.SerializerMethodField()
    completed_trips = serializers.ReadOnlyField()
    is_driver = serializers.ReadOnlyField()

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name',
            'phone', 'city', 'age', 'photo', 'photo_url', 'language',
            'is_driver', 'is_staff', 'is_verified', 'is_blocked',
            'date_inscription', 'completed_trips'
        ]
        read_only_fields = ['id', 'email', 'is_staff', 'is_verified', 'is_blocked', 'date_inscription']
        extra_kwargs = {'photo': {'write_only': True}}

    def get_photo_url(self, obj):
        if obj.photo:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.photo.url)
            return obj.photo.url
        return None


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField()
    new_password = serializers.CharField(min_length=6)

    def validate_old_password(self, value):
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError('Mot de passe actuel incorrect.')
        return value


class OTPVerifySerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.CharField(max_length=6, min_length=6)


class ResetPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.CharField(max_length=6)
    new_password = serializers.CharField(min_length=6)
