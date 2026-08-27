"""Generate premium PDF receipts for completed DAXI orders."""
from io import BytesIO
from datetime import datetime
from decimal import Decimal

from django.conf import settings

from julmin_taxis.address_utils import clean_address_display

_PLAN_LABELS = {
    'demi-journee': 'Demi-journée',
    'demi_journee': 'Demi-journée',
    'journee-complete': 'Journée complète',
    'journee_complete': 'Journée complète',
    'journee': 'Journée complète',
    'elegance-night': 'Élégance Night',
    'elegance_night': 'Élégance Night',
    'ville-a-ville': 'Course ville à ville',
    'ville_a_ville': 'Course ville à ville',
    'accueil-aeroport-cap': 'Accueil aéroport Cap-Haïtien',
    'accueil_aeroport_cap': 'Accueil aéroport Cap-Haïtien',
    'business-vip': 'Business / VIP',
    'business_vip': 'Business / VIP',
}

_FIXED_PLAN_KEYS = frozenset({
    'demi-journee', 'demi_journee', 'journee-complete', 'journee_complete', 'journee',
    'elegance-night', 'elegance_night',
})


def _fmt_usd(amount) -> str:
    return f'${float(amount or 0):.2f} USD'


def _plan_label(raw: str) -> str:
    key = (raw or '').strip().lower().replace('_', '-')
    return _PLAN_LABELS.get(key) or _PLAN_LABELS.get((raw or '').strip().lower()) or (raw or 'Course standard')


def _is_fixed_plan(order) -> bool:
    key = (order.service_plan or '').strip().lower().replace('_', '-')
    return key in _FIXED_PLAN_KEYS or key.replace('-', '_') in _FIXED_PLAN_KEYS


def _trip_duration_label(order) -> str:
    minutes = order.duration_minutes
    if minutes is None:
        return '—'
    if minutes < 60:
        return f'{minutes} min'
    hours, mins = divmod(minutes, 60)
    return f'{hours} h {mins} min' if mins else f'{hours} h'


def generate_order_receipt_pdf(order) -> bytes:
    """Return PDF bytes for a completed order — reçu officiel client."""
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=16 * mm, rightMargin=16 * mm,
        topMargin=14 * mm, bottomMargin=14 * mm,
    )
    styles = getSampleStyleSheet()
    gold = colors.HexColor('#f59e0b')
    dark = colors.HexColor('#0f172a')
    muted = colors.HexColor('#64748b')
    light_bg = colors.HexColor('#f8fafc')

    title_style = ParagraphStyle(
        'DaxiTitle', parent=styles['Title'],
        fontSize=26, textColor=gold, alignment=TA_CENTER, spaceAfter=2,
    )
    brand_style = ParagraphStyle(
        'DaxiBrand', parent=styles['Normal'],
        fontSize=11, textColor=dark, alignment=TA_CENTER, spaceAfter=2,
    )
    sub_style = ParagraphStyle(
        'DaxiSub', parent=styles['Normal'],
        fontSize=9, textColor=muted, alignment=TA_CENTER, spaceAfter=12,
    )
    h_style = ParagraphStyle(
        'DaxiH', parent=styles['Heading2'],
        fontSize=12, textColor=dark, spaceBefore=6, spaceAfter=5,
    )
    body = ParagraphStyle('DaxiBody', parent=styles['Normal'], fontSize=9, textColor=dark, leading=13)
    thank = ParagraphStyle(
        'DaxiThank', parent=styles['Normal'],
        fontSize=11, textColor=dark, alignment=TA_CENTER, leading=15, spaceBefore=10,
    )

    base_price = Decimal(str(order.price or 0))
    pause_price = Decimal(str(order.pause_price or 0))
    extra_km = Decimal(str(order.extra_km_price or 0))
    total = order.total_price
    created = order.created_at.strftime('%d/%m/%Y %H:%M') if order.created_at else '—'
    started = order.in_progress_at.strftime('%d/%m/%Y %H:%M') if order.in_progress_at else '—'
    completed = order.completed_at.strftime('%d/%m/%Y %H:%M') if getattr(order, 'completed_at', None) else created
    driver = order.driver_name or (order.driver.get_full_name() if order.driver else '—')
    client = order.client_name or 'Client DAXI'
    order_id = order.pk
    distance = order.distance_km
    payment_method = order.get_payment_method_display() if order.payment_method else '—'
    payment_status = order.get_payment_status_display() if order.payment_status else '—'
    enterprise = order.enterprise.name if getattr(order, 'enterprise_id', None) and order.enterprise else '—'
    plan_raw = (order.service_plan or '').strip()
    plan_display = _plan_label(plan_raw) if plan_raw else 'Course à la demande'
    is_plan = bool(plan_raw)
    is_fixed = _is_fixed_plan(order)
    trip_started = order.on_way_at.strftime('%d/%m/%Y %H:%M') if order.on_way_at else '—'
    driver_arrived = order.arrived_at.strftime('%d/%m/%Y %H:%M') if order.arrived_at else '—'
    paid = (order.payment_status or '') in ('paid', 'in_person')
    trip_type = 'Aller-retour' if order.trip_type == 'round_trip' else 'Aller simple'

    header_band = Table([['']], colWidths=[178 * mm], rowHeights=[4 * mm])
    header_band.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), gold)]))

    story = [
        header_band,
        Spacer(1, 10),
        Paragraph('DAXI TRANSPORT', title_style),
        Paragraph('Julmin Taxis · Haïti', brand_style),
        Paragraph('REÇU OFFICIEL DE COURSE', sub_style),
        Paragraph(
            f'<b>Reçu N° {order_id:06d}</b> · Terminée le {completed}',
            ParagraphStyle('rid', parent=body, alignment=TA_CENTER, fontSize=10, textColor=muted),
        ),
        Spacer(1, 8),
    ]

    if is_plan:
        plan_banner = Table([[f'FORFAIT DAXI — {plan_display.upper()}']], colWidths=[178 * mm])
        plan_banner.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#fef3c7')),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#92400e')),
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ]))
        story.extend([plan_banner, Spacer(1, 8)])

    if paid:
        status_tbl = Table([['✓ PAIEMENT CONFIRMÉ']], colWidths=[178 * mm])
        status_tbl.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#dcfce7')),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#166534')),
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ]))
        story.extend([status_tbl, Spacer(1, 10)])

    story.append(Paragraph('Informations client & trajet', h_style))

    rows = [
        ['Client', client],
        ['Téléphone', (order.client_phone or '—')[:30]],
        ['Email', (order.client_email or '—')[:50]],
        ['Chauffeur', driver],
        ['Tél. chauffeur', (order.driver_phone or '—')[:30]],
        ['Type de course', trip_type],
        ['Forfait / service', plan_display],
        ['Départ', clean_address_display(order.pickup or '—')[:80]],
        ['Destination', clean_address_display(order.destination or '—')[:80]],
        ['Commande créée', created],
        ['Chauffeur en route', trip_started],
        ['Chauffeur arrivé', driver_arrived],
        ['Course démarrée', started],
        ['Course terminée', completed],
        ['Durée réelle', _trip_duration_label(order)],
        ['Passagers', str(getattr(order, 'passengers', 1) or 1)],
        ['Distance', f'{distance} km' if distance else ('Incluse forfait' if is_fixed else '—')],
        ['Partenaire', enterprise if enterprise != '—' else '—'],
        ['Paiement', f'{payment_method} · {payment_status}'],
    ]
    t = Table(rows, colWidths=[42 * mm, 136 * mm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), light_bg),
        ('TEXTCOLOR', (0, 0), (0, -1), muted),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
        ('INNERGRID', (0, 0), (-1, -1), 0.25, colors.HexColor('#e2e8f0')),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(t)
    story.append(Spacer(1, 12))
    story.append(Paragraph('Détail des frais', h_style))

    base_label = f'Forfait {plan_display}' if is_fixed else 'Tarif de course'
    fee_rows = [[base_label, _fmt_usd(base_price)]]
    if pause_price > 0 or order.is_paused:
        fee_rows.append(['Frais d\'attente (pause)', _fmt_usd(pause_price)])
    if extra_km > 0 or order.is_extended:
        fee_rows.append(['Extension / km supplémentaires', _fmt_usd(extra_km)])
    if order.enterprise_commission_pct:
        ent_comm = (total * Decimal(str(order.enterprise_commission_pct)) / Decimal('100')).quantize(Decimal('0.01'))
        fee_rows.append([f'Commission partenaire ({order.enterprise_commission_pct}%)', _fmt_usd(ent_comm)])

    fee_table = Table(fee_rows, colWidths=[108 * mm, 70 * mm])
    fee_table.setStyle(TableStyle([
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica-Bold'),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('TEXTCOLOR', (0, 0), (0, -1), muted),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LINEBELOW', (0, -1), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
    ]))
    story.append(fee_table)
    story.append(Spacer(1, 8))

    total_table = Table([['MONTANT TOTAL TTC', _fmt_usd(total)]], colWidths=[108 * mm, 70 * mm])
    total_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), dark),
        ('TEXTCOLOR', (0, 0), (0, 0), colors.white),
        ('TEXTCOLOR', (1, 0), (1, 0), gold),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 13),
        ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
        ('TOPPADDING', (0, 0), (-1, -1), 11),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 11),
        ('LEFTPADDING', (0, 0), (-1, -1), 12),
        ('RIGHTPADDING', (0, 0), (-1, -1), 12),
    ]))
    story.append(total_table)
    story.append(Spacer(1, 16))
    story.append(Paragraph(
        'Merci d\'avoir voyagé avec <b>Daxi Transport</b> !<br/>'
        'Ce document atteste du paiement et de la réalisation de votre course.',
        thank,
    ))
    story.append(Spacer(1, 6))
    site = getattr(settings, 'SITE_URL', 'https://daxipro.com').rstrip('/')
    story.append(Paragraph(
        f'<font color="#64748b" size="7">'
        f'DAXI Transport · {site} · support@daxipro.com<br/>'
        f'Document généré le {datetime.now().strftime("%d/%m/%Y à %H:%M")} · Course #{order_id}<br/>'
        f'Conservez ce reçu pour vos archives personnelles ou professionnelles.'
        f'</font>',
        ParagraphStyle('foot', parent=body, alignment=TA_CENTER),
    ))

    doc.build(story)
    return buf.getvalue()
