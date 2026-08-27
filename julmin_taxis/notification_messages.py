"""Catalogue professionnel des notifications push DAXI — titres et corps contextualisés."""
from __future__ import annotations


def _pickup_short(order) -> str:
    p = (getattr(order, 'pickup', None) or '').strip()
    return (p[:42] + '…') if len(p) > 42 else (p or 'votre départ')


def _dest_short(order) -> str:
    d = (getattr(order, 'destination', None) or '').strip()
    return (d[:42] + '…') if len(d) > 42 else (d or 'votre destination')


def _driver_name(order) -> str:
    return (getattr(order, 'driver_name', None) or '').strip() or 'Votre chauffeur'


def _price_str(order) -> str:
    try:
        from decimal import Decimal
        t = order.total_price if hasattr(order, 'total_price') else None
        if t and float(t) > 0:
            return f'{float(t):.0f} $'
    except Exception:
        pass
    if getattr(order, 'price', None):
        return f'{float(order.price):.0f} $'
    return ''


def _order_ref(order) -> str:
    return f'#{getattr(order, "pk", "?")}'


def _driver_status_admin_body(ctx) -> str:
    """Message admin pour changement de statut chauffeur (ctx = order ou dict payload)."""
    if isinstance(ctx, dict):
        name = (ctx.get('driver_name') or '').strip() or 'Un chauffeur'
        status = (ctx.get('status') or '').strip()
    else:
        name = (getattr(ctx, 'driver_name', None) or '').strip() or 'Un chauffeur'
        status = (getattr(ctx, 'status', None) or getattr(ctx, 'driver_status', None) or '').strip()
    if status == 'available':
        return f'{name} est en ligne.'
    if status == 'offline':
        return f'{name} s\'est déconnecté.'
    if status == 'busy':
        return f'{name} est occupé.'
    return f'{name} a changé de statut.'


                                                                                

CLIENT_PUSH = {
    'order_created': lambda o: (
        'Demande enregistrée',
        f'Votre course {_order_ref(o)} est bien enregistrée. Nous préparons votre tarif.',
    ),
    'pending': lambda o: (
        'Commande en attente',
        f'Course {_order_ref(o)} : nous traitons votre demande.',
    ),
    'price_proposed': lambda o: (
        'Tarif proposé',
        f'DAXI vous propose {_price_str(o) or "un tarif"} pour {_pickup_short(o)} → {_dest_short(o)}. Consultez l\'app pour accepter.',
    ),
    'price_confirmed': lambda o: (
        'Tarif confirmé',
        f'Merci ! Votre tarif {_price_str(o) or ""} est confirmé. Recherche d\'un chauffeur en cours.',
    ),
    'price_refused': lambda o: (
        'Tarif refusé',
        f'Vous avez refusé le tarif proposé pour la course {_order_ref(o)}.',
    ),
    'payment_confirmed': lambda o: (
        'Paiement reçu',
        f'Paiement confirmé pour la course {_order_ref(o)}. Un chauffeur va bientôt être assigné.',
    ),
    'payment_failed': lambda o: (
        'Paiement échoué',
        f'Le paiement de la course {_order_ref(o)} n\'a pas abouti. Réessayez depuis l\'app.',
    ),
    'driver_assigned': lambda o: (
        'Chauffeur assigné',
        f'{_driver_name(o)} a accepté votre course {_order_ref(o)}. Il se prépare au départ.',
    ),
    'driver_accepted': lambda o: (
        'Course acceptée',
        f'{_driver_name(o)} a accepté votre course {_order_ref(o)}.',
    ),
    'on_way': lambda o: (
        'Chauffeur en route',
        f'{_driver_name(o)} est en route vers {_pickup_short(o)}.',
    ),
    'driver_on_the_way': None,
    'arrived': lambda o: (
        'Chauffeur sur place',
        f'{_driver_name(o)} est arrivé au point de rendez-vous.',
    ),
    'driver_arrived': None,
    'in_progress': lambda o: (
        'Course démarrée',
        f'Bonne route ! Votre course {_order_ref(o)} vers {_dest_short(o)} est en cours.',
    ),
    'waiting_return': lambda o: (
        'Attente avant le retour',
        f'Arrivé à destination. Votre chauffeur attend pour le retour {_order_ref(o)}.',
    ),
    'sos_alert': lambda o: (
        '🆘 SOS URGENCE',
        f'Un SOS a été déclenché sur la course {_order_ref(o)}. L\'équipe DAXI intervient.',
    ),
    'completed': lambda o: (
        'Course terminée',
        f'Merci d\'avoir voyagé avec DAXI. Course {_order_ref(o)} terminée.',
    ),
    'cancelled': lambda o: (
        'Course annulée',
        f'La course {_order_ref(o)} a été annulée.',
    ),
    'order_cancelled': None,
    'coords_needed': lambda o: (
        'GPS requis',
        f'Placez le départ et l\'arrivée sur la carte pour finaliser la course {_order_ref(o)}.',
    ),
    'coords_set': lambda o: (
        'Itinéraire confirmé',
        f'Les lieux de votre course {_order_ref(o)} ont été localisés sur la carte.',
    ),
    'price_updated': lambda o: (
        'Tarif mis à jour',
        f'Le prix de votre course {_order_ref(o)} est maintenant {_price_str(o) or "mis à jour"}.',
    ),
    'trip_paused': lambda o: (
        'Course en pause',
        f'Votre course {_order_ref(o)} est en pause. Les frais d\'attente s\'appliquent.',
    ),
    'trip_resumed': lambda o: (
        'Course reprise',
        f'Votre course {_order_ref(o)} a repris. Bon voyage !',
    ),
    'trip_extended': lambda o: (
        'Trajet prolongé',
        f'Prolongation confirmée pour la course {_order_ref(o)}. Tarif ajusté.',
    ),
    'new_message': lambda o: (
        'Nouveau message',
        f'Message de {_driver_name(o)} sur la course {_order_ref(o)}.',
    ),
    'sos_ack': lambda o: (
        'SOS transmis',
        f'Votre signal d\'urgence pour la course {_order_ref(o)} a été transmis à l\'équipe DAXI.',
    ),
    'trip_reminder_7d': lambda o: (
        'Rappel — course planifiée',
        f'Votre course {_order_ref(o)} est prévue dans 7 jours ({_pickup_short(o)}).',
    ),
    'trip_reminder_3d': lambda o: (
        'Rappel — 3 jours',
        f'Votre course {_order_ref(o)} est dans 3 jours. Vérifiez l\'heure et le lieu de RDV.',
    ),
    'trip_reminder_1d': lambda o: (
        'Rappel — demain',
        f'Votre course {_order_ref(o)} est prévue demain. Préparez-vous !',
    ),
    'trip_reminder': lambda o: (
        'Rappel — 1 heure',
        f'Votre course {_order_ref(o)} commence dans moins d\'1 heure. Rendez-vous : {_pickup_short(o)}.',
    ),
    'trip_reminder_same_day': lambda o: (
        'Course aujourd\'hui',
        f'Rappel : votre course {_order_ref(o)} est prévue aujourd\'hui.',
    ),
    'gps_reminder': lambda o: (
        'Activez votre GPS',
        f'Votre course {_order_ref(o)} approche. Activez la localisation pour un suivi précis.',
    ),
    'pickup_confirm_prompt': lambda o: (
        'Confirmez le RDV',
        f'Dans 1 h, course {_order_ref(o)}. Conservez ou modifiez le lieu de rendez-vous.',
    ),
    'relocate_prompt': lambda o: (
        'Lieu de RDV',
        f'Votre position a changé pour la course {_order_ref(o)}. Confirmez le nouveau point de RDV.',
    ),
    'now_transition': lambda o: (
        'Course activée',
        f'Votre course planifiée {_order_ref(o)} est maintenant active.',
    ),
    'lost_object_ack': lambda o: (
        'Objet oublié signalé',
        f'Nous avons bien reçu votre signalement pour la course {_order_ref(o)}.',
    ),
    'driver_unassigned': lambda o: (
        'Chauffeur indisponible',
        f'Le chauffeur n\'est plus assigné à la course {_order_ref(o)}. Recherche d\'un nouveau chauffeur.',
    ),
    'enterprise_payment_link': lambda o: (
        'Lien de paiement',
        f'Un lien de paiement est disponible pour la course {_order_ref(o)}.',
    ),
    'receipt_ready': lambda o: (
        'Reçu disponible',
        f'Le reçu de votre course {_order_ref(o)} est disponible.',
    ),
    'rating_request': lambda o: (
        'Évaluez votre course',
        f'Comment s\'est passée votre course {_order_ref(o)} ? Donnez votre avis.',
    ),
    'danger_zone': lambda o: (
        'Zone sensible',
        f'Votre chauffeur traverse une zone à vigilance accrue. Restez attentif.',
    ),
    'zone_alert': lambda o: (
        'Sur la route',
        f'Attention : condition de route particulière sur la course {_order_ref(o)}.',
    ),
}
CLIENT_PUSH['driver_on_the_way'] = CLIENT_PUSH['on_way']
CLIENT_PUSH['driver_arrived'] = CLIENT_PUSH['arrived']
CLIENT_PUSH['order_cancelled'] = CLIENT_PUSH['cancelled']

                                                                              

DRIVER_PUSH = {
    'new_order': lambda o: (
        'Nouvelle course',
        f'Course disponible : {_pickup_short(o)} → {_dest_short(o)} ({_price_str(o) or "tarif à voir"}).',
    ),
    'new_order_pending_accept': None,               
    'new_order_needs_coords': lambda o: (
        'GPS à placer',
        f'Course {_order_ref(o)} : placez départ et arrivée sur la carte.',
    ),
    'order_updated': lambda o: (
        'Course mise à jour',
        f'La course {_order_ref(o)} a été modifiée.',
    ),
    'order_unavailable': lambda o: (
        'Course prise',
        f'La course {_order_ref(o)} n\'est plus disponible.',
    ),
    'payment_confirmed': lambda o: (
        'Paiement confirmé',
        f'Le client a payé la course {_order_ref(o)}. Vous pouvez l\'accepter.',
    ),
    'new_message': lambda o: (
        'Message client',
        f'Nouveau message sur la course {_order_ref(o)}.',
    ),
    'client_cancelled': lambda o: (
        'Course annulée',
        f'Le client a annulé la course {_order_ref(o)}.',
    ),
    'trip_reminder': lambda o: (
        'Rappel course planifiée',
        f'Course {_order_ref(o)} dans 1 h — {_pickup_short(o)}.',
    ),
    'trip_reminder_same_day': lambda o: (
        'Course aujourd\'hui',
        f'Vous avez une course planifiée {_order_ref(o)} aujourd\'hui.',
    ),
    'sos_alert': lambda o: (
        '🆘 SOS URGENCE',
        f'Alerte SOS sur la course {_order_ref(o)} — intervention immédiate.',
    ),
    'lost_object_reported': lambda o: (
        'Objet oublié',
        f'Objet oublié signalé sur la course {_order_ref(o)}.',
    ),
    'coords_set': lambda o: (
        'Coordonnées mises à jour',
        f'GPS mis à jour pour la course {_order_ref(o)}.',
    ),
    'danger_zone': lambda o: (
        'Zone sensible',
        f'Zone à vigilance accrue sur la course {_order_ref(o)}. Ralentissez.',
    ),
    'zone_alert': lambda o: (
        'Attention route',
        f'Condition de route particulière sur la course {_order_ref(o)}.',
    ),
    'pickup_updated': lambda o: (
        'RDV modifié',
        f'Le client a modifié le lieu de RDV pour la course {_order_ref(o)}.',
    ),
    'account_validated': lambda o: (
        'Compte validé',
        'Félicitations ! Votre compte chauffeur DAXI est actif.',
    ),
    'withdrawal_approved': lambda o: (
        'Retrait approuvé',
        'Votre demande de retrait a été approuvée.',
    ),
    'withdrawal_rejected': lambda o: (
        'Retrait refusé',
        'Votre demande de retrait nécessite une correction.',
    ),
    'round_trip_pickup_requested': lambda o: (
        '🔔 Client prêt — retour',
        f'{_order_ref(o)} : le client vous attend pour le retour à {_pickup_short(o)}. Terminez votre course en cours si besoin.',
    ),
}
DRIVER_PUSH['new_order_pending_accept'] = DRIVER_PUSH['new_order']

                                                                              

ADMIN_PUSH = {
    'new_order': lambda o: (
        '🚕 Nouvelle commande',
        f'{_order_ref(o)} — {_pickup_short(o)} → {_dest_short(o)}.',
    ),
    'new_order_pending_accept': None,
    'new_order_needs_coords': lambda o: (
        '📍 GPS manquant',
        f'{_order_ref(o)} : coordonnées à placer sur la carte.',
    ),
    'price_confirmed': lambda o: (
        'Prix confirmé',
        f'Client a confirmé le tarif pour {_order_ref(o)}.',
    ),
    'payment_confirmed': lambda o: (
        'Paiement reçu',
        f'Paiement confirmé — {_order_ref(o)}.',
    ),
    'driver_assigned': lambda o: (
        'Chauffeur assigné',
        f'{_driver_name(o)} assigné à {_order_ref(o)}.',
    ),
    'order_updated': lambda o: (
        'Commande mise à jour',
        f'{_order_ref(o)} — statut : {getattr(o, "status", "mis à jour")}.',
    ),
    'order_cancelled': lambda o: (
        'Course annulée',
        f'{_order_ref(o)} a été annulée.',
    ),
    'order_completed': lambda o: (
        'Course terminée',
        f'{_order_ref(o)} terminée avec succès.',
    ),
    'sos_alert': lambda o: (
        '🆘 SOS URGENCE',
        f'{_order_ref(o)} — intervention immédiate requise.',
    ),
    'lost_object': lambda o: (
        '📦 Objet oublié',
        f'Signalement sur {_order_ref(o)}.',
    ),
    'withdrawal': lambda o: (
        '💰 Retrait en attente',
        'Nouvelle demande de retrait à traiter.',
    ),
    'enterprise_pending': lambda o: (
        '🏢 Nouvelle entreprise',
        'Demande de partenariat en attente de validation.',
    ),
    'enterprise_location_pending': lambda o: (
        '📍 Emplacement entreprise',
        'Un partenaire demande de l\'aide pour son emplacement.',
    ),
    'chat_escalated': lambda o: (
        '💬 Support chat',
        'Un client attend une réponse humaine.',
    ),
    'driver_pending': lambda o: (
        '👤 Chauffeur en attente',
        'Nouveau chauffeur à valider.',
    ),
    'coords_needed': lambda o: (
        'GPS requis',
        f'{_order_ref(o)} — placer les coordonnées sur la carte.',
    ),
    'wa_failed': lambda o: (
        'WhatsApp échoué',
        f'Impossible d\'envoyer un WhatsApp pour {_order_ref(o)}.',
    ),
    'driver_status_changed': lambda o: (
        'Statut chauffeur',
        _driver_status_admin_body(o),
    ),
}
ADMIN_PUSH['new_order_pending_accept'] = ADMIN_PUSH['new_order']

                                                                              

ENTERPRISE_PUSH = {
    'new_order': lambda o: (
        'Nouvelle réservation',
        f'Réservation {_order_ref(o)} pour votre établissement.',
    ),
    'order_updated': lambda o: (
        'Réservation mise à jour',
        f'{_order_ref(o)} — {getattr(o, "status", "mise à jour")}.',
    ),
    'payment_confirmed': lambda o: (
        'Paiement client reçu',
        f'Le client a payé la course {_order_ref(o)}.',
    ),
    'driver_assigned': lambda o: (
        'Chauffeur assigné',
        f'Un chauffeur a été assigné à la course {_order_ref(o)}.',
    ),
    'completed': lambda o: (
        'Course terminée',
        f'La course {_order_ref(o)} est terminée.',
    ),
    'cancelled': lambda o: (
        'Réservation annulée',
        f'La réservation {_order_ref(o)} a été annulée.',
    ),
    'withdrawal_approved': lambda o: (
        'Retrait approuvé',
        'Votre demande de retrait a été approuvée.',
    ),
    'new_message': lambda o: (
        'Nouveau message',
        f'Message concernant la course {_order_ref(o)}.',
    ),
}


def push_text(role: str, event: str, order=None, fallback_title='Daxi', fallback_body='Mise à jour.'):
    """Retourne (title, body) pour un rôle et un événement."""
    catalogs = {
        'client': CLIENT_PUSH,
        'driver': DRIVER_PUSH,
        'admin': ADMIN_PUSH,
        'enterprise': ENTERPRISE_PUSH,
    }
    cat = catalogs.get(role, CLIENT_PUSH)
    fn = cat.get(event) or cat.get(event.replace('driver_on_the_way', 'on_way').replace('driver_arrived', 'arrived'))
    if fn and order is not None:
        try:
            return fn(order)
        except Exception:
            pass
    if fn and order is None:
        try:
            return fn(type('O', (), {'pk': '', 'pickup': '', 'destination': '', 'driver_name': '', 'status': ''})())
        except Exception:
            pass
    return fallback_title, fallback_body
