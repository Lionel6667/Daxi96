from rest_framework import generics
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from .models import Notification
from .serializers import NotificationSerializer
from .email_service import EmailService
from julmin_taxis.currency_utils import format_price


class NotificationListView(generics.ListAPIView):
    """List notifications for the authenticated user."""
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = Notification.objects.filter(user=user)
        if hasattr(user, 'driver_profile'):
            qs = Notification.objects.filter(driver=user.driver_profile)
        return qs.order_by('-created_at')[:50]


class MarkNotificationReadView(APIView):
    """Mark a notification as read."""
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        try:
            notif = Notification.objects.get(pk=pk, user=request.user)
            notif.is_read = True
            notif.save(update_fields=['is_read'])
            return Response({'message': 'Notification marquée comme lue.'})
        except Notification.DoesNotExist:
            return Response({'error': 'Notification introuvable.'}, status=404)


class MarkAllReadView(APIView):
    """Mark all notifications as read."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        Notification.objects.filter(user=request.user, is_read=False).update(is_read=True)
        return Response({'message': 'Toutes les notifications marquées comme lues.'})


class UnreadCountView(APIView):
    """Get count of unread notifications."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        count = Notification.objects.filter(user=request.user, is_read=False).count()
        return Response({'unread_count': count})


class RegisterPushDeviceView(APIView):
    """Enregistre un token FCM — utilisateur connecté, invité (guest_id) ou chauffeur."""
    permission_classes = [AllowAny]

    def post(self, request):
        from .push_devices import upsert_push_device

        token = (request.data.get('token') or request.data.get('fcm_token') or '').strip()
        if not token or len(token) < 32 or len(token) > 512:
            return Response({'ok': False, 'error': 'Token invalide'}, status=400)

        guest_id = (request.data.get('guest_id') or request.session.get('guest_id') or '').strip()[:64]
        platform = (request.data.get('platform') or request.META.get('HTTP_X_DAXI_PLATFORM') or '')[:20].lower()
        if platform not in ('android', 'ios', 'web', ''):
            platform = ''
        device_id = (request.data.get('device_id') or '')[:80]
        user = request.user if request.user.is_authenticated else None
        driver = None
        enterprise = None

        if user and getattr(user, 'is_staff', False):
            guest_id = ''

        driver_id = request.session.get('driver_id')
        if driver_id:
            try:
                from drivers.models import Driver
                driver = Driver.objects.get(pk=driver_id)
                if getattr(driver, 'is_blocked', False):
                    driver = None
            except Exception:
                driver = None

        eid = request.session.get('current_enterprise_id') or request.session.get('enterprise_id')
        if eid:
            try:
                from enterprises.models import Enterprise
                enterprise = Enterprise.objects.get(pk=eid)
            except Exception:
                enterprise = None

        if not driver and user and hasattr(user, 'driver_profile'):
            try:
                driver = user.driver_profile
            except Exception:
                driver = None

        if guest_id:
            request.session['guest_id'] = guest_id

        upsert_push_device(
            token, user=user, guest_id=guest_id, driver=driver,
            enterprise=enterprise, platform=platform, device_id=device_id,
        )
        return Response({'ok': True, 'message': 'Appareil enregistré pour les notifications push.'})


class SendPushNotificationView(APIView):
    """
    Send a push notification via FCM token.
    Called by all three pages (vubez2.html, adm.html, driver.html).
    Replaces /phpscript/send-notification.php
    """
    permission_classes = [AllowAny]

    def post(self, request):
        from julmin_taxis.staff_auth import user_is_staff
        if not user_is_staff(request):
            return Response({'success': False, 'error': 'Accès refusé'}, status=403)

        from .fcm_service import send_push

        token = request.data.get('token', '')
        notification = request.data.get('notification', {})
        extra_data = notification.get('data') if isinstance(notification.get('data'), dict) else {}
        data = {
            'tag': notification.get('tag', 'julmin-taxis'),
            'url': notification.get('url', '/'),
            **extra_data,
        }

        if not token or not notification:
            return Response({'success': False, 'error': 'Missing token or notification'}, status=400)

        ok, result = send_push(token, notification, data)
        if ok:
            return Response({'success': True, 'result': result})
        return Response({'success': False, 'error': str(result)}, status=502)


class SendOrderEmailView(APIView):
    """
    Send order status emails directly using data dict (no ORM model needed).
    Replaces /phpscript/send_order_email.php, send_on_the_way_email.php, send_arrived_email.php
    Expected body: { type, email, ... }
    """
    permission_classes = [AllowAny]

    def post(self, request):
        from julmin_taxis.staff_auth import user_is_staff
        if not user_is_staff(request):
            return Response({'success': False, 'message': 'Accès refusé.'}, status=403)

        from django.core.mail import EmailMultiAlternatives
        from django.conf import settings
        from django.utils import timezone

        data = request.data
        email_type = data.get('type', '')
        recipient = data.get('email') or data.get('customerEmail', '')

        if not recipient:
            return Response({'success': False, 'message': 'Email destinataire requis.'}, status=400)

        d = {
            'orderId': data.get('orderId') or data.get('rideId', 'N/A'),
            'name': data.get('customerName') or data.get('name', recipient.split('@')[0]),
            'pickup': data.get('pickup', ''),
            'destination': data.get('destination', ''),
            'date': data.get('date', ''),
            'time': data.get('time', ''),
            'driver': data.get('driverName') or data.get('driver', ''),
            'driverPhone': data.get('driverPhone', ''),
            'vehicle': data.get('vehicle', ''),
            'plate': data.get('plate', ''),
            'price': data.get('price', ''),
            'duration': data.get('estimatedDuration', ''),
            'distance': data.get('distance', ''),
        }

        subjects = {
            'price_proposed': 'Prix proposé pour votre course DAXI',
            'driver_assigned': 'Chauffeur assigné — DAXI',
            'driver_on_way': 'Votre chauffeur est en route — DAXI',
            'driver_arrived': 'Votre chauffeur est arrivé — DAXI',
            'trip_started': 'Votre course a démarré — DAXI',
            'trip_completed': 'Course terminée — DAXI',
        }

        status_labels = {
            'price_proposed': 'Prix proposé',
            'driver_assigned': 'Chauffeur assigné',
            'driver_on_way': 'Chauffeur en route',
            'driver_arrived': 'Chauffeur arrivé',
            'trip_started': 'Course démarrée',
            'trip_completed': 'Course terminée',
        }

        aliases = {
            'accepted': 'driver_assigned',
            'on_the_way': 'driver_on_way',
            'arrived': 'driver_arrived',
            'in_progress': 'trip_started',
            'completed': 'trip_completed',
        }
        email_type = aliases.get(email_type, email_type)

        subject = subjects.get(email_type, f'Mise à jour DAXI - {email_type}')
        status_label = status_labels.get(email_type, email_type)

        details_html = ''
        if d['pickup']:
            details_html += f'<div class="row"><span class="label">Départ</span><span class="value">{d["pickup"]}</span></div>'
        if d['destination']:
            details_html += f'<div class="row"><span class="label">Destination</span><span class="value">{d["destination"]}</span></div>'
        if d['driver']:
            details_html += f'<div class="row"><span class="label">Chauffeur</span><span class="value">{d["driver"]}</span></div>'
        if d['driverPhone']:
            details_html += f'<div class="row"><span class="label">Téléphone</span><span class="value">{d["driverPhone"]}</span></div>'
        if d['vehicle']:
            details_html += f'<div class="row"><span class="label">Véhicule</span><span class="value">{d["vehicle"]}</span></div>'
        if d['plate']:
            details_html += f'<div class="row"><span class="label">Plaque</span><span class="value">{d["plate"]}</span></div>'
        if d['price']:
            price_txt = format_price(d['price']) if not str(d['price']).strip().endswith('$') else str(d['price'])
            details_html += f'<div class="row"><span class="label">Prix</span><span class="value" style="color:#00d4ff">{price_txt}</span></div>'
        if d['duration']:
            details_html += f'<div class="row"><span class="label">Durée estimée</span><span class="value">{d["duration"]} min</span></div>'
        if d['distance']:
            details_html += f'<div class="row"><span class="label">Distance</span><span class="value">{d["distance"]}</span></div>'

        html = f"""<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8">
<style>
body{{margin:0;padding:0;background:#f4f6f9;font-family:'Segoe UI',Arial,sans-serif}}
.w{{max-width:600px;margin:30px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.1)}}
.h{{background:linear-gradient(135deg,#1a1a2e,#16213e);padding:32px;text-align:center}}
.h h1{{margin:0;color:#00d4ff;font-size:32px;letter-spacing:4px;font-weight:900}}
.h p{{color:#aaa;margin:6px 0 0;font-size:13px}}
.b{{padding:32px}}
.b h2{{color:#1a1a2e;font-size:20px;margin:0 0 16px}}
.b p{{color:#555;line-height:1.7;font-size:15px;margin:0 0 12px}}
.card{{background:#f8faff;border-left:4px solid #00d4ff;border-radius:8px;padding:20px;margin:20px 0}}
.row{{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee;font-size:14px}}
.row:last-child{{border-bottom:none}}
.label{{color:#888;font-weight:600}}
.value{{color:#1a1a2e;font-weight:700;text-align:right;max-width:60%}}
.f{{background:#f8f8f8;padding:20px 32px;text-align:center;color:#aaa;font-size:12px;border-top:1px solid #eee}}
</style></head>
<body><div class="w">
<div class="h"><h1>DAXI</h1><p>Service de Transport Premium</p></div>
<div class="b">
<h2>{status_label}</h2>
<p>Bonjour <strong>{d['name']}</strong>,</p>
<p>Voici les détails de votre course :</p>
<div class="card">{details_html}</div>
<p>Merci de faire confiance à DAXI pour vos déplacements.</p>
</div>
<div class="f"><p>© {timezone.now().year} DAXI - Julmin Taxis | <a href="mailto:info@daxipro.com" style="color:#00d4ff">info@daxipro.com</a></p></div>
</div></body></html>"""

        try:
            import re
            text = re.sub(r'<[^>]+>', '', html)
            msg = EmailMultiAlternatives(
                subject=subject,
                body=text,
                from_email=settings.DEFAULT_FROM_EMAIL,
                to=[recipient]
            )
            msg.attach_alternative(html, 'text/html')
            msg.send(fail_silently=False)
            return Response({'success': True, 'message': 'Email envoyé.'})
        except Exception as e:
            return Response({'success': False, 'message': str(e)}, status=500)


class PresenceHeartbeatView(APIView):
    """POST — le client signale qu'il est actif sur le site (onglet visible)."""
    permission_classes = [AllowAny]

    def post(self, request):
        from julmin_taxis.presence import mark_presence_context

        def _truthy(val):
            return str(val or '').strip().lower() in ('1', 'true', 'yes', 'on')

        ctx = {}
        for field in ('viewing_order_id', 'viewing_chat_order_id', 'view'):
            val = request.data.get(field) or request.POST.get(field)
            if val not in (None, ''):
                ctx[field] = str(val).strip()
        if _truthy(request.data.get('viewing_price_proposal') or request.POST.get('viewing_price_proposal')):
            ctx['viewing_price_proposal'] = True

        if request.user.is_authenticated:
            mark_presence_context('user', request.user.pk, **ctx)

        gid = (
            request.data.get('guest_id')
            or request.POST.get('guest_id')
            or request.session.get('guest_id', '')
        )
        gid = (gid or '').strip()
        if gid:
            request.session['guest_id'] = gid
            if not request.user.is_authenticated:
                mark_presence_context('guest', gid, **ctx)

        driver_id = request.session.get('driver_id')
        if driver_id:
            mark_presence_context('driver', driver_id, **ctx)

        eid = request.session.get('current_enterprise_id') or request.session.get('enterprise_id')
        if eid:
            mark_presence_context('enterprise', eid, **ctx)

        return Response({'ok': True})
