"""Assistant DAXI — Gemini + repli humain (jamais une phrase générique vide)."""
import logging
import re

from django.conf import settings

from chatbot.knowledge import audience_system_rules, load_knowledge, sanitize_reply

logger = logging.getLogger(__name__)

ESCALATION_KEYWORDS = [
    'urgent', 'urgence', 'problème grave', 'accident', 'vol', 'volé', 'stolen',
    'parler à un humain', 'agent humain', 'responsable', 'manager', 'agresion',
    'speak to human', 'human agent', 'real person', 'pale yon moun',
    'hablar con humano', 'emergencia',
]


def should_escalate(message: str) -> bool:
    message_lower = (message or '').lower()
    return any(keyword in message_lower for keyword in ESCALATION_KEYWORDS)


def _lang_instruction(language: str) -> str:
    return {
        'fr': 'Réponds en français, comme un conseiller DAXI au téléphone. Tutoiement naturel.',
        'en': 'Reply in English, like a real DAXI dispatcher. Warm and specific.',
        'ht': 'Reponn an kreyòl ayisyen, tankou yon moun DAXI sou telefòn.',
        'es': 'Responde en español, como un asesor DAXI real.',
    }.get(language or 'fr', 'Réponds en français, comme un conseiller DAXI.')


def _system_prompt(language: str, audience: str) -> str:
    knowledge = load_knowledge(audience)
    rules = audience_system_rules(audience)
    return (
        rules + '\n\n' + knowledge + '\n\n' + _lang_instruction(language)
        + '\nNe commence jamais par « Je suis l’assistant ». Va droit à la procédure, avec les vrais noms de boutons.'
        + '\nN’invente pas un tarif au km. Le devis s’affiche après COMMANDER UN TAXI.'
    )


def _is_booking_question(msg: str) -> bool:
    t = (msg or '').lower()
    keys = (
        'commande', 'commander', 'réserver', 'reserver', 'taxi', 'course',
        'départ', 'depart', 'destination', 'aller retour', 'passager',
        'comment je peux', 'comment faire', 'order', 'book',
    )
    return any(k in t for k in keys)


def _booking_walkthrough() -> str:
    return (
        "Pour commander, reste sur l’onglet **Nouveau trajet** (le panneau sur la carte) :\n\n"
        "1. **Départ** — tape ton adresse (au moins 2 lettres) et **choisis une suggestion** dans la liste. "
        "Ou appuie sur le bouton **cible verte** à droite du champ : c’est « Ma position » (GPS).\n"
        "2. **Destination** — champ « Où allez-vous ? ». Pareil : il **faut** une suggestion, sinon DAXI n’a pas les coordonnées et ne peut pas calculer le prix.\n"
        "3. Optionnel : ouvre **Ajouter un repère pour le chauffeur** (porte bleue, marché, nom du commerce).\n"
        "4. Nombre de **passagers** avec − et + (1 par défaut).\n"
        "5. **Aller simple** ou **Aller retour**. En aller-retour, tu choisis le temps d’attente au retour (15 min jusqu’à 2 h).\n"
        "6. **Maintenant**, ou **Plus tard** (là tu as date + heure).\n"
        "7. Gros bouton or **COMMANDER UN TAXI**.\n\n"
        "Ensuite tu vois le **prix**, tu confirmes, tu paies (MonCash, carte ou espèces selon ce qui est proposé), "
        "et tu suis tout dans l’onglet **Ma course**.\n\n"
        "Astuce : après GPS ou une adresse, tu peux encore **glisser l’épingle** sur la carte pour coller à la bonne porte."
    )


def get_ai_response(user_message: str, conversation_history: list = None, language: str = 'fr', audience: str = 'client') -> dict:
    if should_escalate(user_message):
        return {
            'response': (
                "OK, je te passe un humain. WhatsApp **+509 4496-9696** — dis-leur que tu viens du chat DAXI."
            ),
            'escalated': True,
            'error': None,
        }

    system = _system_prompt(language, audience)
    history = conversation_history or []
    hist_lines = []
    for msg in history[-10:]:
        role = 'Client' if msg.get('role') == 'user' else 'DAXI'
        hist_lines.append(f"{role}: {msg.get('content', '')}")
    if hist_lines and hist_lines[-1] == f"Client: {user_message}":
        conv = '\n'.join(hist_lines[:-1])
    else:
        conv = '\n'.join(hist_lines)
    user_block = (conv + '\nClient: ' + user_message).strip() if conv else ('Client: ' + user_message)

    try:
        from julmin_taxis.gemini_client import gemini_api_key, gemini_generate
        if not gemini_api_key():
            raise RuntimeError('GEMINI_API_KEY manquante (redémarrer Django après .env)')
        text = gemini_generate(user_block, system=system, timeout=28)
        text = sanitize_reply(text)
        if text:
            return {'response': text, 'escalated': False, 'error': None}
    except Exception as e:
        logger.warning('[DAXI AI] Gemini: %s', str(e)[:200])
        gemini_err = str(e)
    else:
        gemini_err = ''

    if getattr(settings, 'GROQ_API_KEY', ''):
        try:
            from groq import Groq
            client = Groq(api_key=settings.GROQ_API_KEY)
            messages = [{'role': 'system', 'content': system}]
            for msg in history[-6:]:
                role = msg.get('role', 'user')
                if role not in ('user', 'assistant'):
                    role = 'user'
                messages.append({'role': role, 'content': msg.get('content', '')})
            messages.append({'role': 'user', 'content': user_message})
            completion = client.chat.completions.create(
                model='llama-3.3-70b-versatile',
                messages=messages,
                max_tokens=800,
                temperature=0.6,
            )
            response_text = sanitize_reply(completion.choices[0].message.content)
            if response_text:
                return {'response': response_text, 'escalated': False, 'error': None}
        except Exception as e:
            logger.warning('[DAXI AI] Groq: %s', str(e)[:200])

    if audience != 'driver' and _is_booking_question(user_message):
        return {'response': _booking_walkthrough(), 'escalated': False, 'error': gemini_err}

    return {
        'response': _get_fallback_response(language, audience),
        'escalated': False,
        'error': gemini_err,
    }


def _get_fallback_response(language: str, audience: str = 'client') -> str:
    if audience in ('driver', 'chauffeur'):
        return (
            "Côté chauffeur : inscris-toi avec OTP WhatsApp, photo du véhicule, "
            "puis permis, OAVCT et carte DGI (photos nettes, ton nom dessus, documents non expirés). "
            "Le dossier reste en attente de validation DAXI avant d’accepter des courses. "
            "WhatsApp +509 4496-9696 si tu bloques."
        )
    return _booking_walkthrough()
