"""Noms des modèles WhatsApp Meta — surchargeables via .env (WA_TPL_*)."""

from django.conf import settings

DEFAULT_TEMPLATES = {
    'nouvelle_commande': 'nouvelle_commande',
    'prix_propose': 'prix_propose',
    'chauffeur_assigne': 'chauffeur_assigne',
    'chauffeur_en_route': 'chauffeur_en_route',
    'chauffeur_arrive': 'chauffeur_arrive',
    'course_demarree': 'course_demarree',
    'course_terminee': 'course_terminee',
    'recu_course': 'recu_course',
    'pause_course': 'pause_course',
    'rappel_course': 'rappel_course',
    'otp_whatsapp': 'demande_numero_badge_de_mon_chauffeur',
    'welcome_client': 'welcome_client',
    'chauffeur_valide': 'chauffeur_valide',
    'course_terminer_chauffeur': 'course_terminer_chauffeur',
    'commande_entreprise': 'commande_entreprise',
    'demande_paiment': 'demande_paiment',
    'sos_client': 'sos_client',
    'sos_admin': 'sos_admin',
    'nouvelle_commande_admin': 'nouvelle_commande_admin',
    'objet_oublie_admin': 'objet_oublie_admin',
    'entreprise_en_attente': 'entreprise_en_attente',
    'entreprise_emplacement': 'entreprise_emplacement',
    'chat_escalade': 'chat_escalade',
    'chauffeur_a_valider': 'chauffeur_a_valider',
    'course_annulee': 'course_annulee',
    'prix_confirme': 'prix_confirme',
    'commande_attente_coords': 'commande_attente_coords',
    'client_demande_retour': 'client_demande_retour',
}

ENV_KEYS = {
    'nouvelle_commande': 'WA_TPL_NOUVELLE_COMMANDE',
    'prix_propose': 'WA_TPL_PRIX_PROPOSE',
    'chauffeur_assigne': 'WA_TPL_CHAUFFEUR_ASSIGNE',
    'chauffeur_en_route': 'WA_TPL_CHAUFFEUR_EN_ROUTE',
    'chauffeur_arrive': 'WA_TPL_CHAUFFEUR_ARRIVE',
    'course_demarree': 'WA_TPL_COURSE_DEMARREE',
    'course_terminee': 'WA_TPL_COURSE_TERMINEE',
    'recu_course': 'WA_TPL_RECU',
    'pause_course': 'WA_TPL_PAUSE',
    'rappel_course': 'WA_TPL_RAPPEL',
    'otp_whatsapp': 'WA_TPL_OTP',
    'welcome_client': 'WA_TPL_WELCOME_CLIENT',
    'chauffeur_valide': 'WA_TPL_CHAUFFEUR_VALIDE',
    'course_terminer_chauffeur': 'WA_TPL_COURSE_TERMINER_CHAUFFEUR',
    'commande_entreprise': 'WA_TPL_COMMANDE_ENTREPRISE',
    'demande_paiment': 'WA_TPL_DEMANDE_PAIMENT',
    'sos_client': 'WA_TPL_SOS_CLIENT',
    'sos_admin': 'WA_TPL_SOS_ADMIN',
    'nouvelle_commande_admin': 'WA_TPL_NOUVELLE_COMMANDE_ADMIN',
    'objet_oublie_admin': 'WA_TPL_OBJET_OUBLIE_ADMIN',
    'entreprise_en_attente': 'WA_TPL_ENTREPRISE_EN_ATTENTE',
    'entreprise_emplacement': 'WA_TPL_ENTREPRISE_EMPLACEMENT',
    'chat_escalade': 'WA_TPL_CHAT_ESCALADE',
    'chauffeur_a_valider': 'WA_TPL_CHAUFFEUR_A_VALIDER',
    'course_annulee': 'WA_TPL_COURSE_ANNULEE',
    'prix_confirme': 'WA_TPL_PRIX_CONFIRME',
    'commande_attente_coords': 'WA_TPL_COMMANDE_ATTENTE_COORDS',
    'client_demande_retour': 'WA_TPL_CLIENT_DEMANDE_RETOUR',
}


def template_name(situation: str) -> str:
    """Retourne le nom Meta du template pour une situation."""
    import os

    custom = getattr(settings, 'WHATSAPP_TEMPLATES', None) or {}
    if situation in custom and custom[situation]:
        return custom[situation]
    env_key = ENV_KEYS.get(situation)
    if env_key:
        val = os.environ.get(env_key, '').strip()
        if val:
            return val
    return DEFAULT_TEMPLATES.get(situation, situation)


def template_lang() -> str:
    return getattr(settings, 'WHATSAPP_TEMPLATE_LANG', 'fr')
