import logging
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from django.utils import timezone
from rest_framework import status, generics

logger = logging.getLogger(__name__)
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from .serializers import (
    UserRegistrationSerializer, UserLoginSerializer,
    UserProfileSerializer, ChangePasswordSerializer,
    OTPVerifySerializer, ResetPasswordSerializer
)
from notifications.email_service import EmailService

User = get_user_model()


def find_user_by_phone(raw):
    from julmin_taxis.whatsapp_service import _normalize_phone
    from django.db.models import Q
    norm = _normalize_phone(raw or '')
    if not norm:
        return None
    tail = norm[-8:] if len(norm) >= 8 else norm
    qs = User.objects.exclude(phone='').filter(
        Q(phone=norm) | Q(phone='+' + norm) | Q(phone__endswith=tail)
    )[:40]
    for user in qs:
        if _normalize_phone(user.phone) == norm:
            return user
    return None


def get_tokens_for_user(user):
    refresh = RefreshToken.for_user(user)
    return {
        'refresh': str(refresh),
        'access': str(refresh.access_token),
    }


class RegisterView(APIView):
    """Register a new user and send OTP for email verification."""
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = UserRegistrationSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        user = serializer.save()
        otp = user.generate_otp()

        phone = (request.data.get('phone') or '').strip()
        name = user.get_full_name() or user.first_name or 'Client'
        try:
            if phone:
                from julmin_taxis.whatsapp_service import _normalize_phone, send_otp_whatsapp
                phone_norm = _normalize_phone(phone)
                if phone_norm:
                    send_otp_whatsapp(phone_norm, name, otp)
                else:
                    EmailService.send_otp(user.email, name, otp)
            else:
                EmailService.send_otp(user.email, name, otp)
        except Exception as e:
            logger.warning('OTP send failed for %s: %s', user.email, e)

        return Response({
            'message': 'Compte créé. Vérifiez WhatsApp pour le code OTP.' if phone else 'Compte créé. Vérifiez votre email pour le code OTP.',
            'user_id': user.pk,
            'email': user.email,
        }, status=status.HTTP_201_CREATED)


class VerifyOTPView(APIView):
    """Verify OTP code to activate account."""
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = OTPVerifySerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        email = serializer.validated_data['email']
        code = serializer.validated_data['code']

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return Response({'error': 'Utilisateur introuvable.'}, status=status.HTTP_404_NOT_FOUND)

        if user.verify_otp(code):
            tokens = get_tokens_for_user(user)
            return Response({
                'message': 'Email vérifié avec succès.',
                'tokens': tokens,
                'user': UserProfileSerializer(user).data
            })
        return Response({'error': 'Code OTP invalide ou expiré.'}, status=status.HTTP_400_BAD_REQUEST)


class ResendOTPView(APIView):
    """Resend OTP to user email."""
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get('email')
        if not email:
            return Response({'error': 'Email requis.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return Response({'error': 'Utilisateur introuvable.'}, status=status.HTTP_404_NOT_FOUND)

        otp = user.generate_otp()
        phone = (getattr(user, 'phone', None) or '').strip()
        name = user.get_full_name() or user.first_name or 'Client'
        try:
            if phone:
                from julmin_taxis.whatsapp_service import _normalize_phone, send_otp_whatsapp
                phone_norm = _normalize_phone(phone)
                if phone_norm:
                    send_otp_whatsapp(phone_norm, name, otp)
                else:
                    EmailService.send_otp(user.email, name, otp)
            else:
                EmailService.send_otp(user.email, name, otp)
        except Exception as e:
            logger.warning('Resend OTP failed for %s: %s', user.email, e)

        return Response({'message': 'Nouveau code OTP envoyé sur WhatsApp.' if phone else 'Nouveau code OTP envoyé.'})


class LoginView(APIView):
    """Login and return JWT tokens."""
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = UserLoginSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        user = serializer.validated_data['user']

        if user.is_blocked:
            return Response({'error': 'Compte bloqué. Contactez le support.'}, status=status.HTTP_403_FORBIDDEN)

        tokens = get_tokens_for_user(user)
        return Response({
            'tokens': tokens,
            'user': UserProfileSerializer(user).data,
        })


class LogoutView(APIView):
    """Invalidate refresh token on logout."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            refresh_token = request.data.get('refresh')
            token = RefreshToken(refresh_token)
            token.blacklist()
        except Exception:
            pass
        return Response({'message': 'Déconnecté avec succès.'})


class ProfileView(generics.RetrieveUpdateAPIView):
    """Get and update authenticated user profile."""
    permission_classes = [IsAuthenticated]
    serializer_class = UserProfileSerializer

    def get_object(self):
        return self.request.user


class ChangePasswordView(APIView):
    """Change authenticated user password."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={'request': request})
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        user = request.user
        user.set_password(serializer.validated_data['new_password'])
        user.save()
        return Response({'message': 'Mot de passe modifié avec succès.'})


class ForgotPasswordView(APIView):
    """Send password reset code via WhatsApp."""
    permission_classes = [AllowAny]

    def post(self, request):
        phone = (request.data.get('phone') or request.data.get('whatsapp') or '').strip()
        if not phone:
            return Response({'error': 'Numéro WhatsApp requis.'}, status=status.HTTP_400_BAD_REQUEST)

        user = find_user_by_phone(phone)
        if not user:
            return Response({'error': 'Aucun compte avec ce numéro WhatsApp.'}, status=status.HTTP_400_BAD_REQUEST)

        from julmin_taxis.whatsapp_service import _normalize_phone, send_otp_whatsapp
        phone_norm = _normalize_phone(user.phone or phone)
        if not phone_norm:
            return Response({'error': 'Numéro WhatsApp invalide.'}, status=status.HTTP_400_BAD_REQUEST)

        code = user.generate_reset_code()
        name = user.get_full_name() or user.first_name or 'Client'
        try:
            if not send_otp_whatsapp(phone_norm, name, code):
                return Response({'error': 'Impossible d’envoyer le code WhatsApp. Réessaie.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as e:
            logger.warning('Reset code WhatsApp failed for %s: %s', phone_norm, e)
            return Response({'error': 'Impossible d’envoyer le code WhatsApp. Réessaie.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        hint = '••••' + phone_norm[-4:] if len(phone_norm) >= 4 else 'ton WhatsApp'
        return Response({'message': 'Code envoyé sur WhatsApp.', 'phone_hint': hint})


class VerifyResetCodeView(APIView):
    """Verify password reset code."""
    permission_classes = [AllowAny]

    def post(self, request):
        phone = (request.data.get('phone') or '').strip()
        email = (request.data.get('email') or '').strip()
        code = request.data.get('code')
        if not code:
            return Response({'error': 'Code requis.'}, status=status.HTTP_400_BAD_REQUEST)

        user = find_user_by_phone(phone) if phone else None
        if not user and email:
            user = User.objects.filter(email=email).first()
        if not user:
            return Response({'error': 'Code invalide.'}, status=status.HTTP_400_BAD_REQUEST)

        if user.verify_reset_code(code):
            return Response({'message': 'Code valide.', 'valid': True})
        return Response({'error': 'Code invalide ou expiré.', 'valid': False}, status=status.HTTP_400_BAD_REQUEST)


class ResetPasswordView(APIView):
    """Reset password with valid reset code."""
    permission_classes = [AllowAny]

    def post(self, request):
        phone = (request.data.get('phone') or '').strip()
        email = (request.data.get('email') or '').strip()
        code = (request.data.get('code') or '').strip()
        new_password = (request.data.get('new_password') or '').strip()
        if not code or not new_password:
            return Response({'error': 'Code et nouveau mot de passe requis.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(new_password) < 6:
            return Response({'error': 'Le mot de passe doit contenir au moins 6 caractères.'}, status=status.HTTP_400_BAD_REQUEST)

        user = find_user_by_phone(phone) if phone else None
        if not user and email:
            user = User.objects.filter(email=email).first()
        if not user:
            return Response({'error': 'Utilisateur introuvable.'}, status=status.HTTP_404_NOT_FOUND)

        if not user.verify_reset_code(code):
            return Response({'error': 'Code invalide ou expiré.'}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(new_password)
        user.reset_code = ''
        user.reset_code_expiry = None
        user.save()
        return Response({'message': 'Mot de passe réinitialisé avec succès.'})


class UpdateFCMTokenView(APIView):
    """Update FCM push notification token."""
    permission_classes = [AllowAny]

    def post(self, request):
        from notifications.push_devices import upsert_push_device

        token = (request.data.get('token') or request.data.get('fcm_token') or '').strip()
        if not token:
            return Response({'message': 'Token manquant.'}, status=400)

        guest_id = (request.data.get('guest_id') or request.session.get('guest_id') or '').strip()
        user = request.user if request.user.is_authenticated else None
        driver = None
        if user and hasattr(user, 'driver_profile'):
            try:
                driver = user.driver_profile
            except Exception:
                pass

        upsert_push_device(
            token,
            user=user,
            guest_id=guest_id,
            driver=driver,
            platform=request.data.get('platform', 'web'),
        )
        return Response({'message': 'Token FCM mis à jour.', 'ok': True})


class SendOTPEmailView(APIView):
    """
    Generate OTP server-side, cache it, send via WhatsApp (numéro WhatsApp requis).
    """
    permission_classes = [AllowAny]

    def post(self, request):
        import random
        from django.core.cache import cache

        email = request.data.get('email', '').strip().lower()
        phone = (request.data.get('phone') or request.data.get('whatsapp') or '').strip()
        firstname = (request.data.get('firstname') or '').strip()
        raw_name = (request.data.get('name') or '').strip()
        if firstname:
            name = firstname
        elif raw_name:
            parts = [p for p in raw_name.split() if p]
            name = parts[0] if parts else raw_name
        else:
            name = (email.split('@')[0] or 'Client').strip()

        if not email:
            return Response({'success': False, 'message': 'Email requis.'}, status=400)
        if not phone:
            return Response({'success': False, 'message': 'Numéro WhatsApp requis.'}, status=400)

        otp = str(random.randint(100000, 999999))
        from julmin_taxis.whatsapp_service import _normalize_phone, send_otp_whatsapp
        phone_norm = _normalize_phone(phone)
        if not phone_norm:
            return Response({'success': False, 'message': 'Numéro WhatsApp invalide.'}, status=400)

        cache.set(f'reg_otp_{email}', otp, timeout=600)
        cache.set(f'reg_otp_phone_{email}', phone_norm, timeout=600)

        try:
            if send_otp_whatsapp(phone_norm, name, otp):
                return Response({'success': True, 'message': 'Code envoyé sur WhatsApp.'})
            return Response({'success': False, 'message': 'Échec envoi WhatsApp — vérifiez le numéro.'}, status=500)
        except Exception as e:
            logger.warning('OTP WhatsApp failed for %s: %s', email, e)
            return Response({'success': False, 'message': str(e)}, status=500)


class SendResetCodeView(APIView):
    """
    Send password reset code. Returns {success, message} format expected by vubez2.html.
    Looks up user in Firebase shim DB (save_member table) - but since we can't use Django User
    for Firebase shim accounts, we look in FirebaseNode and email the code.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get('email', '').strip()
        if not email:
            return Response({'success': False, 'message': 'Email requis.'}, status=400)

        import random
        import json
        from firebase_db.models import FirebaseNode

                                 
        code = str(random.randint(100000, 999999))

                                       
        nodes = FirebaseNode.objects.filter(path__startswith='save_member/')
        found = False
        for node in nodes:
            if isinstance(node.data, dict) and node.data.get('email', '').lower() == email.lower():
                node.data['resetCode'] = code
                node.save()
                found = True
                break

        if not found:
                                          
            try:
                user = User.objects.get(email=email)
                code = user.generate_reset_code()
                found = True
            except User.DoesNotExist:
                pass

        if not found:
            return Response({
                'success': False,
                'message': 'Aucun compte trouvé avec cet email.',
                'action': 'signup'
            })

        try:
            EmailService.send_reset_code(email, email.split('@')[0], code)
            return Response({'success': True, 'message': 'Code envoyé.', 'emailSent': True})
        except Exception as e:
            return Response({'success': True, 'message': 'Code généré.', 'emailSent': False})


class VerifyResetCodeSimpleView(APIView):
    """
    Verify reset code from Firebase shim DB. Returns {success, message}.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get('email', '').strip()
        code = str(request.data.get('code', '')).strip()
        if not email or not code:
            return Response({'success': False, 'message': 'Email et code requis.'}, status=400)

        from firebase_db.models import FirebaseNode

                                
        nodes = FirebaseNode.objects.filter(path__startswith='save_member/')
        for node in nodes:
            if isinstance(node.data, dict) and node.data.get('email', '').lower() == email.lower():
                if str(node.data.get('resetCode', '')) == code:
                    return Response({'success': True, 'valid': True, 'message': 'Code valide.'})
                else:
                    return Response({'success': False, 'valid': False, 'message': 'Code incorrect ou expiré.'})

                                     
        try:
            user = User.objects.get(email=email)
            if user.verify_reset_code(code):
                return Response({'success': True, 'valid': True, 'message': 'Code valide.'})
        except User.DoesNotExist:
            pass

        return Response({'success': False, 'valid': False, 'message': 'Code incorrect ou expiré.'})


class ResetPasswordSimpleView(APIView):
    """
    Reset password with {email, newPassword, code}. Updates Firebase shim DB and Django User.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get('email', '').strip()
        code = str(request.data.get('code') or request.data.get('resetCode') or '').strip()
        new_password = (request.data.get('new_password') or request.data.get('newPassword') or '').strip()
        if not email or not new_password or not code:
            return Response({'success': False, 'message': 'Email, code et mot de passe requis.'}, status=400)

        from firebase_db.models import FirebaseNode

        firebase_node = None
        nodes = FirebaseNode.objects.filter(path__startswith='save_member/')
        for node in nodes:
            if isinstance(node.data, dict) and node.data.get('email', '').lower() == email.lower():
                firebase_node = node
                break

        django_user = None
        try:
            django_user = User.objects.get(email=email)
        except User.DoesNotExist:
            pass

        if not firebase_node and not django_user:
            return Response({'success': False, 'message': 'Utilisateur introuvable.'}, status=404)

        code_valid = False
        if firebase_node and str(firebase_node.data.get('resetCode', '')) == code:
            code_valid = True
        if django_user and django_user.verify_reset_code(code):
            code_valid = True

        if not code_valid:
            return Response({'success': False, 'message': 'Code incorrect ou expiré.'}, status=400)

        if firebase_node:
            firebase_node.data['password'] = make_password(new_password)
            firebase_node.data.pop('resetCode', None)
            firebase_node.save()

        if django_user:
            django_user.set_password(new_password)
            django_user.reset_code = ''
            django_user.reset_code_expiry = None
            django_user.save()

        return Response({'success': True, 'message': 'Mot de passe réinitialisé.'})
