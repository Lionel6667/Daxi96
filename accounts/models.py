from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone
import random
import string


class CustomUser(AbstractUser):
    """Extended user model for DAXI platform."""
    LANGUAGE_CHOICES = [
        ('fr', 'Français'),
        ('en', 'English'),
        ('ht', 'Kreyòl Ayisyen'),
        ('es', 'Español'),
    ]

    email = models.EmailField(unique=True, verbose_name='email address')
    phone = models.CharField(max_length=20, blank=True)
    city = models.CharField(max_length=100, blank=True)
    age = models.PositiveIntegerField(null=True, blank=True)
    photo = models.ImageField(upload_to='users/', blank=True, null=True)
    language = models.CharField(max_length=5, choices=LANGUAGE_CHOICES, default='fr')
    is_driver = models.BooleanField(default=False)
    is_blocked = models.BooleanField(default=False)
    is_verified = models.BooleanField(default=False)
    admin_role = models.CharField(
        max_length=32,
        blank=True,
        default='',
        help_text='Rôle admin HTMX : super_admin, finance, support, dispatch, driver_manager, enterprise_manager',
    )
    date_inscription = models.DateTimeField(auto_now_add=True)

                
    otp_code = models.CharField(max_length=6, blank=True)
    otp_expiry = models.DateTimeField(null=True, blank=True)

                    
    reset_code = models.CharField(max_length=6, blank=True)
    reset_code_expiry = models.DateTimeField(null=True, blank=True)

                                 
    fcm_token = models.TextField(blank=True)
                               
    firebase_uid = models.CharField(max_length=100, blank=True, db_index=True)
    firebase_user_id = models.CharField(max_length=20, blank=True, db_index=True)                     

    class Meta:
        verbose_name = 'Utilisateur'
        verbose_name_plural = 'Utilisateurs'

    def __str__(self):
        return f"{self.get_full_name() or self.username} ({self.email})"

    def generate_otp(self):
        """Generate a 6-digit OTP and set expiry."""
        self.otp_code = ''.join(random.choices(string.digits, k=6))
        self.otp_expiry = timezone.now() + timezone.timedelta(minutes=10)
        self.save(update_fields=['otp_code', 'otp_expiry'])
        return self.otp_code

    def verify_otp(self, code):
        """Verify OTP and mark user as verified."""
        if (self.otp_code == code and
                self.otp_expiry and
                timezone.now() < self.otp_expiry):
            self.is_verified = True
            self.otp_code = ''
            self.otp_expiry = None
            self.save(update_fields=['is_verified', 'otp_code', 'otp_expiry'])
            return True
        return False

    def generate_reset_code(self):
        """Generate a password reset code."""
        self.reset_code = ''.join(random.choices(string.digits, k=6))
        self.reset_code_expiry = timezone.now() + timezone.timedelta(minutes=30)
        self.save(update_fields=['reset_code', 'reset_code_expiry'])
        return self.reset_code

    def verify_reset_code(self, code):
        """Verify reset code validity."""
        return (self.reset_code == code and
                self.reset_code_expiry and
                timezone.now() < self.reset_code_expiry)

    @property
    def completed_trips(self):
        return self.orders.filter(status='completed').count()
