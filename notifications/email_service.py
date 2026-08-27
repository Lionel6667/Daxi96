"""
Email service for DAXI - replaces all PHP email scripts.
Handles: OTP, price proposals, driver assignment, trip updates, password reset.
"""
from django.core.mail import send_mail, EmailMultiAlternatives
from django.conf import settings
from django.utils import timezone

from julmin_taxis.address_utils import clean_address_display
from julmin_taxis.currency_utils import format_price


def _send_html_email(subject, to_email, html_content, text_content=None):
    """Internal helper to send HTML email."""
    if text_content is None:
                                           
        import re
        text_content = re.sub(r'<[^>]+>', '', html_content)

    msg = EmailMultiAlternatives(
        subject=subject,
        body=text_content,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[to_email]
    )
    msg.attach_alternative(html_content, 'text/html')
    try:
        msg.send(fail_silently=False)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).error('[Email] send failed to %s: %s', to_email, exc)
        raise


def _base_template(title, content, footer_note=''):
    """Base email HTML template with DAXI branding."""
    return f"""
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>{title}</title>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:linear-gradient(160deg,#0f172a 0%,#1e1b4b 50%,#0f172a 100%);padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.45);">
<tr><td style="background:linear-gradient(135deg,#0f172a,#1e293b);padding:36px 32px;text-align:center;">
  <div style="font-size:36px;font-weight:900;letter-spacing:6px;color:#f59e0b;">DAXI</div>
  <div style="color:rgba(255,255,255,.55);font-size:12px;margin-top:6px;letter-spacing:1px;text-transform:uppercase;">Transport Premium · Haïti</div>
</td></tr>
<tr><td style="padding:32px 28px;color:#334155;font-size:15px;line-height:1.7;">
  {content}
</td></tr>
<tr><td style="background:#f8fafc;padding:20px 28px;text-align:center;border-top:1px solid #e2e8f0;">
  <p style="margin:0 0 6px;font-size:11px;color:#94a3b8;">© {timezone.now().year} DAXI · Julmin Taxis</p>
  <p style="margin:0;font-size:11px;"><a href="mailto:info@daxipro.com" style="color:#f59e0b;text-decoration:none;">info@daxipro.com</a></p>
  {f'<p style="color:#cbd5e1;font-size:10px;margin-top:8px;">{footer_note}</p>' if footer_note else ''}
</td></tr>
</table>
</td></tr></table>
</body>
</html>
"""


class EmailService:
    """Centralized email service - replaces all PHP email scripts."""

    @staticmethod
    def send_otp(email, name, otp_code):
        """Send OTP verification code (replaces send_otp.php)."""
        content = f"""
        <h2 style="margin:0 0 12px;color:#0f172a;font-size:22px;">Vérification de votre compte</h2>
        <p>Bonjour <strong>{name}</strong>,</p>
        <p>Voici votre code de vérification DAXI :</p>
        <div style="text-align:center;background:linear-gradient(135deg,#0f172a,#1e293b);color:#f59e0b;font-size:40px;font-weight:900;letter-spacing:14px;padding:22px;border-radius:14px;margin:20px 0;font-family:monospace;">{otp_code}</div>
        <p>Ce code est valable <strong>10 minutes</strong>. Ne le partagez avec personne.</p>
        """
        html = _base_template('Code de vérification DAXI', content)
        _send_html_email(
            subject='Votre code de vérification DAXI',
            to_email=email,
            html_content=html
        )

    @staticmethod
    def send_reset_code(email, name, reset_code):
        """Send password reset code (replaces send_reset_code.php)."""
        content = f"""
        <h2>Réinitialisation de mot de passe</h2>
        <p>Bonjour <strong>{name}</strong>,</p>
        <p>Vous avez demandé à réinitialiser votre mot de passe. Voici votre code :</p>
        <div class="otp-box">{reset_code}</div>
        <p>Ce code est valable <strong>30 minutes</strong>.</p>
        <p>Si vous n'avez pas fait cette demande, ignorez cet email et votre mot de passe reste inchangé.</p>
        """
        html = _base_template('Réinitialisation mot de passe DAXI', content)
        _send_html_email(
            subject='Réinitialisation de votre mot de passe DAXI',
            to_email=email,
            html_content=html
        )

    @staticmethod
    def send_price_proposed(order):
        """Send price proposal email to client (replaces send_order_email.php type=price_proposed)."""
        content = f"""
        <h2>Prix proposé pour votre course</h2>
        <p>Bonjour <strong>{order.client_name}</strong>,</p>
        <p>Nous avons évalué votre demande de transport et vous proposons le tarif suivant :</p>
        <div class="card">
          <div class="row"><span class="label">Départ</span><span class="value">{clean_address_display(order.pickup)}</span></div>
          <div class="row"><span class="label">Destination</span><span class="value">{clean_address_display(order.destination)}</span></div>
          <div class="row"><span class="label">Date</span><span class="value">{order.date.strftime('%d/%m/%Y')}</span></div>
          <div class="row"><span class="label">Heure</span><span class="value">{order.time.strftime('%H:%M')}</span></div>
          <div class="row"><span class="label">Prix proposé</span><span class="value" style="color:#00d4ff;font-size:20px">{format_price(order.price)}</span></div>
        </div>
        <p>Connectez-vous à votre espace DAXI pour <strong>accepter ou refuser</strong> ce prix.</p>
        <a href="{settings.SITE_URL}" class="btn">Voir ma commande</a>
        """
        html = _base_template('Prix proposé - DAXI', content)
        _send_html_email(
            subject=f'Prix proposé pour votre course DAXI — {format_price(order.price)}',
            to_email=order.client_email,
            html_content=html
        )

    @staticmethod
    def send_driver_assigned(order):
        """Send driver assignment notification (replaces send_order_email.php type=driver_accepted)."""
        driver = order.driver
        if not driver:
            return

        content = f"""
        <h2>Un chauffeur a été assigné à votre course !</h2>
        <p>Bonjour <strong>{order.client_name}</strong>,</p>
        <p>Excellente nouvelle ! Un chauffeur a été assigné à votre course :</p>
        <div class="card">
          <div class="row"><span class="label">Chauffeur</span><span class="value">{driver.full_name}</span></div>
          <div class="row"><span class="label">Téléphone</span><span class="value">{driver.phone}</span></div>
          <div class="row"><span class="label">Véhicule</span><span class="value">{driver.vehicle}</span></div>
          <div class="row"><span class="label">Plaque</span><span class="value">{driver.plate}</span></div>
          <div class="row"><span class="label">Note</span><span class="value">{driver.rating}/5</span></div>
        </div>
        <div class="card">
          <div class="row"><span class="label">Départ</span><span class="value">{clean_address_display(order.pickup)}</span></div>
          <div class="row"><span class="label">Destination</span><span class="value">{clean_address_display(order.destination)}</span></div>
          <div class="row"><span class="label">Date & Heure</span><span class="value">{order.date.strftime('%d/%m/%Y')} à {order.time.strftime('%H:%M')}</span></div>
          <div class="row"><span class="label">Prix</span><span class="value">{format_price(order.price)}</span></div>
        </div>
        <a href="{settings.SITE_URL}" class="btn">Suivre ma course</a>
        """
        html = _base_template('Chauffeur assigné - DAXI', content)
        _send_html_email(
            subject=f'Votre chauffeur DAXI est assigné — {driver.full_name}',
            to_email=order.client_email,
            html_content=html
        )

    @staticmethod
    def send_driver_on_way(order):
        """Send driver on the way notification (replaces send_on_the_way_email.php)."""
        driver = order.driver
        content = f"""
        <h2>Votre chauffeur est en route !</h2>
        <p>Bonjour <strong>{order.client_name}</strong>,</p>
        <p>Votre chauffeur <strong>{driver.full_name if driver else 'DAXI'}</strong> est en route vers votre lieu de départ.</p>
        <div class="card">
          <div class="row"><span class="label">Lieu de prise en charge</span><span class="value">{clean_address_display(order.pickup)}</span></div>
          <div class="row"><span class="label">Heure prévue</span><span class="value">{order.time.strftime('%H:%M')}</span></div>
          {'<div class="row"><span class="label">Contact</span><span class="value">' + driver.phone + '</span></div>' if driver else ''}
        </div>
        <p>Préparez-vous, votre chauffeur arrive bientôt !</p>
        <a href="{settings.SITE_URL}" class="btn">Suivre en temps réel</a>
        """
        html = _base_template('Chauffeur en route - DAXI', content)
        _send_html_email(
            subject='Votre chauffeur DAXI est en route',
            to_email=order.client_email,
            html_content=html
        )

    @staticmethod
    def send_driver_arrived(order):
        """Send driver arrived notification (replaces send_arrived_email.php)."""
        driver = order.driver
        content = f"""
        <h2>Votre chauffeur est arrivé !</h2>
        <p>Bonjour <strong>{order.client_name}</strong>,</p>
        <p>Votre chauffeur <strong>{driver.full_name if driver else 'DAXI'}</strong> vous attend au lieu de départ.</p>
        <div class="card">
          <div class="row"><span class="label">Lieu de prise en charge</span><span class="value">{clean_address_display(order.pickup)}</span></div>
          {'<div class="row"><span class="label">Véhicule</span><span class="value">' + (driver.vehicle + ' - ' + driver.plate if driver else '') + '</span></div>' if driver else ''}
          {'<div class="row"><span class="label">Contact</span><span class="value">' + driver.phone + '</span></div>' if driver else ''}
        </div>
        <p><strong>Votre chauffeur vous attend. Rejoignez-le dès que possible !</strong></p>
        """
        html = _base_template('Chauffeur arrivé - DAXI', content)
        _send_html_email(
            subject='Votre chauffeur DAXI est arrivé',
            to_email=order.client_email,
            html_content=html
        )

    @staticmethod
    def send_trip_started(order):
        """Send trip started notification."""
        content = f"""
        <h2>Votre course a démarré !</h2>
        <p>Bonjour <strong>{order.client_name}</strong>,</p>
        <p>Votre course est en cours. Bon voyage !</p>
        <div class="card">
          <div class="row"><span class="label">Départ</span><span class="value">{clean_address_display(order.pickup)}</span></div>
          <div class="row"><span class="label">Destination</span><span class="value">{clean_address_display(order.destination)}</span></div>
          {'<div class="row"><span class="label">Chauffeur</span><span class="value">' + order.driver.full_name + '</span></div>' if order.driver else ''}
        </div>
        """
        html = _base_template('Course démarrée - DAXI', content)
        _send_html_email(
            subject='Votre course DAXI a démarré',
            to_email=order.client_email,
            html_content=html
        )

    @staticmethod
    def send_trip_completed(order):
        """Email de remerciement avec récapitulatif et lien vers le reçu PDF."""
        site = getattr(settings, 'SITE_URL', 'http://localhost:8000').rstrip('/')
        receipt_url = f'{site}/htmx/client/orders/{order.pk}/receipt.pdf'
        guest_id = (getattr(order, 'guest_id', None) or '').strip()
        if guest_id:
            receipt_url = f'{receipt_url}?guest_id={guest_id}'
        duration = order.duration_minutes
        duration_text = f"{duration} minutes" if duration else "N/A"
        total = order.total_price
        base = order.price or 0
        pause = order.pause_price or 0
        extra = order.extra_km_price or 0
        extras_html = ''
        if float(pause or 0) > 0 or float(extra or 0) > 0:
            extras_html = f"""
          <div class="row"><span class="label">Tarif de base</span><span class="value">{format_price(base)}</span></div>
          {'<div class="row"><span class="label">Frais d\'attente</span><span class="value">' + format_price(pause) + '</span></div>' if float(pause or 0) > 0 else ''}
          {'<div class="row"><span class="label">Extension</span><span class="value">' + format_price(extra) + '</span></div>' if float(extra or 0) > 0 else ''}
            """
        content = f"""
        <h2>Course terminée avec succès !</h2>
        <p>Bonjour <strong>{order.client_name}</strong>,</p>
        <p>Merci d'avoir utilisé DAXI. Votre course est terminée. Voici le récapitulatif :</p>
        <div class="card">
          <div class="row"><span class="label">Départ</span><span class="value">{clean_address_display(order.pickup)}</span></div>
          <div class="row"><span class="label">Destination</span><span class="value">{clean_address_display(order.destination)}</span></div>
          <div class="row"><span class="label">Date</span><span class="value">{order.date.strftime('%d/%m/%Y') if order.date else (order.completed_at.strftime('%d/%m/%Y') if order.completed_at else '—')}</span></div>
          <div class="row"><span class="label">Durée réelle</span><span class="value">{duration_text}</span></div>
          {extras_html}
          <div class="row"><span class="label">Montant total payé</span><span class="value" style="color:#00d4ff;font-size:18px">{format_price(total)}</span></div>
          {'<div class="row"><span class="label">Chauffeur</span><span class="value">' + order.driver.full_name + '</span></div>' if order.driver else ''}
        </div>
        <p style="margin:20px 0 12px;">Téléchargez votre reçu officiel au format PDF :</p>
        <a href="{receipt_url}" class="btn" style="display:inline-block;margin-bottom:16px;">🧾 Télécharger le reçu PDF</a>
        <p>Vous avez été satisfait de votre course ? N'hésitez pas à noter votre chauffeur sur l'application !</p>
        <a href="{settings.SITE_URL}" class="btn">Réserver une nouvelle course</a>
        """
        html = _base_template('Course terminée - DAXI', content)
        _send_html_email(
            subject='Course DAXI terminée — Merci pour votre confiance',
            to_email=order.client_email,
            html_content=html
        )

    @staticmethod
    def send_trip_reminder(order):
        """Send 30-minute reminder before trip (replaces firebase_order_watcher.php reminder logic)."""
        content = f"""
        <h2>Rappel : Votre course dans 30 minutes !</h2>
        <p>Bonjour <strong>{order.client_name}</strong>,</p>
        <p>Ceci est un rappel pour votre course prévue dans <strong>30 minutes</strong>.</p>
        <div class="card">
          <div class="row"><span class="label">Départ</span><span class="value">{clean_address_display(order.pickup)}</span></div>
          <div class="row"><span class="label">Destination</span><span class="value">{clean_address_display(order.destination)}</span></div>
          <div class="row"><span class="label">Date</span><span class="value">{order.date.strftime('%d/%m/%Y')}</span></div>
          <div class="row"><span class="label">Heure</span><span class="value">{order.time.strftime('%H:%M')}</span></div>
          {'<div class="row"><span class="label">Chauffeur</span><span class="value">' + order.driver.full_name + '</span></div>' if order.driver else ''}
        </div>
        <p>Préparez-vous ! Votre chauffeur sera bientôt chez vous.</p>
        """
        html = _base_template('Rappel course - DAXI', content)
        _send_html_email(
            subject='Rappel : Votre course DAXI dans 30 minutes',
            to_email=order.client_email,
            html_content=html
        )
