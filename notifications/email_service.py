"""
Email service for DAXI - replaces all PHP email scripts.
Handles: OTP, password reset, and completed-trip thank-you + receipt PDF.

Policy (email channel): only trip-completion thank-you emails (with receipt PDF)
are sent for order status. Intermediate status emails (price_proposed, assigned,
on_way, arrived, started, reminder) are no-ops. WhatsApp/push are unchanged.
"""
from django.core.mail import EmailMultiAlternatives
from django.conf import settings
from django.utils import timezone

from julmin_taxis.address_utils import clean_address_display
from julmin_taxis.currency_utils import format_price


def _fmt_date(value, fmt='%d/%m/%Y', fallback='—'):
    """Safe strftime for optional date/datetime fields."""
    if value is None:
        return fallback
    try:
        return value.strftime(fmt)
    except Exception:
        return fallback


def _fmt_time(value, fmt='%H:%M', fallback='—'):
    """Safe strftime for optional time/datetime fields."""
    if value is None:
        return fallback
    try:
        return value.strftime(fmt)
    except Exception:
        return fallback


def _order_date_display(order):
    if getattr(order, 'date', None):
        return _fmt_date(order.date)
    if getattr(order, 'completed_at', None):
        return _fmt_date(order.completed_at)
    if getattr(order, 'scheduled_at', None):
        return _fmt_date(order.scheduled_at)
    if getattr(order, 'created_at', None):
        return _fmt_date(order.created_at)
    return '—'


def _order_time_display(order):
    if getattr(order, 'time', None):
        return _fmt_time(order.time)
    if getattr(order, 'scheduled_at', None):
        return _fmt_time(order.scheduled_at)
    if getattr(order, 'completed_at', None):
        return _fmt_time(order.completed_at)
    return '—'


def _admin_inbox_emails():
    """Ops inbox for admin thank-you copies."""
    emails = []
    raw = (getattr(settings, 'ADMIN_EMAIL', None) or '').strip()
    if raw:
        emails.append(raw)
    host_user = (getattr(settings, 'EMAIL_HOST_USER', None) or '').strip()
    if host_user and '@' in host_user and host_user not in emails:
        emails.append(host_user)
    if not emails:
        emails.append('info@daxipro.com')
    return emails


def _send_html_email(subject, to_email, html_content, text_content=None, attachments=None):
    """Internal helper to send HTML email, optionally with attachments."""
    if not to_email:
        return
    if text_content is None:
        import re
        text_content = re.sub(r'<[^>]+>', '', html_content)

    msg = EmailMultiAlternatives(
        subject=subject,
        body=text_content,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[to_email],
    )
    msg.attach_alternative(html_content, 'text/html')
    if attachments:
        for item in attachments:
            if not item:
                continue
            if len(item) == 3:
                filename, content, mimetype = item
                msg.attach(filename, content, mimetype)
            elif len(item) == 2:
                filename, content = item
                msg.attach(filename, content)
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
        """Disabled — status emails only at trip completion (email channel)."""
        return

    @staticmethod
    def send_driver_assigned(order):
        """Disabled — status emails only at trip completion (email channel)."""
        return

    @staticmethod
    def send_driver_on_way(order):
        """Disabled — status emails only at trip completion (email channel)."""
        return

    @staticmethod
    def send_driver_arrived(order):
        """Disabled — status emails only at trip completion (email channel)."""
        return

    @staticmethod
    def send_trip_started(order):
        """Disabled — status emails only at trip completion (email channel)."""
        return

    @staticmethod
    def send_trip_reminder(order):
        """Disabled — status emails only at trip completion (email channel)."""
        return

    @staticmethod
    def _build_completed_html(order, greeting_name, receipt_url):
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
        driver_name = ''
        if order.driver:
            driver_name = getattr(order.driver, 'full_name', None) or (
                order.driver.get_full_name() if hasattr(order.driver, 'get_full_name') else ''
            )
        content = f"""
        <h2>Course terminée avec succès !</h2>
        <p>Bonjour <strong>{greeting_name}</strong>,</p>
        <p>Merci d'avoir utilisé DAXI. Votre course est terminée. Voici le récapitulatif :</p>
        <div class="card">
          <div class="row"><span class="label">Départ</span><span class="value">{clean_address_display(order.pickup)}</span></div>
          <div class="row"><span class="label">Destination</span><span class="value">{clean_address_display(order.destination)}</span></div>
          <div class="row"><span class="label">Date</span><span class="value">{_order_date_display(order)}</span></div>
          <div class="row"><span class="label">Heure</span><span class="value">{_order_time_display(order)}</span></div>
          <div class="row"><span class="label">Durée réelle</span><span class="value">{duration_text}</span></div>
          {extras_html}
          <div class="row"><span class="label">Montant total payé</span><span class="value" style="color:#00d4ff;font-size:18px">{format_price(total)}</span></div>
          {'<div class="row"><span class="label">Chauffeur</span><span class="value">' + driver_name + '</span></div>' if driver_name else ''}
        </div>
        <p style="margin:20px 0 12px;">Votre reçu officiel PDF est joint à cet email. Vous pouvez aussi le télécharger :</p>
        <a href="{receipt_url}" class="btn" style="display:inline-block;margin-bottom:16px;">🧾 Télécharger le reçu PDF</a>
        <p>Vous avez été satisfait de votre course ? N'hésitez pas à noter votre chauffeur sur l'application !</p>
        <a href="{settings.SITE_URL}" class="btn">Réserver une nouvelle course</a>
        """
        return _base_template('Course terminée - DAXI', content)

    @staticmethod
    def _receipt_pdf_attachment(order):
        try:
            from julmin_taxis.receipt_pdf import generate_order_receipt_pdf
            pdf_bytes = generate_order_receipt_pdf(order)
            if not pdf_bytes:
                return None
            return (f'daxi-recu-{order.pk}.pdf', pdf_bytes, 'application/pdf')
        except Exception as exc:
            import logging
            logging.getLogger(__name__).warning(
                '[Email] receipt PDF failed order #%s: %s', getattr(order, 'pk', '?'), exc
            )
            return None

    @staticmethod
    def _completed_recipients(order):
        """Unique (email, greeting) for client / driver / admin / enterprise."""
        seen = set()
        recipients = []

        def _add(email, name):
            addr = (email or '').strip()
            if not addr or '@' not in addr:
                return
            key = addr.lower()
            if key in seen:
                return
            seen.add(key)
            recipients.append((addr, (name or addr.split('@')[0]).strip() or 'DAXI'))

        _add(getattr(order, 'client_email', None), getattr(order, 'client_name', None) or 'Client')

        driver = getattr(order, 'driver', None)
        if driver:
            dname = getattr(driver, 'full_name', None) or (
                driver.get_full_name() if hasattr(driver, 'get_full_name') else 'Chauffeur'
            )
            _add(getattr(driver, 'email', None), dname)

        for admin_email in _admin_inbox_emails():
            _add(admin_email, 'Équipe DAXI')

        enterprise = getattr(order, 'enterprise', None)
        if enterprise:
            _add(getattr(enterprise, 'email', None), getattr(enterprise, 'name', None) or 'Entreprise')

        return recipients

    @staticmethod
    def send_trip_completed(order):
        """Thank-you email with receipt PDF attachment — client, driver, admin, enterprise."""
        site = getattr(settings, 'SITE_URL', 'http://localhost:8000').rstrip('/')
        receipt_url = f'{site}/htmx/client/orders/{order.pk}/receipt.pdf'
        guest_id = (getattr(order, 'guest_id', None) or '').strip()
        if guest_id:
            receipt_url = f'{receipt_url}?guest_id={guest_id}'

        attachment = EmailService._receipt_pdf_attachment(order)
        attachments = [attachment] if attachment else None
        subject = 'Course DAXI terminée — Merci pour votre confiance'

        for email, name in EmailService._completed_recipients(order):
            html = EmailService._build_completed_html(order, name, receipt_url)
            _send_html_email(
                subject=subject,
                to_email=email,
                html_content=html,
                attachments=attachments,
            )
