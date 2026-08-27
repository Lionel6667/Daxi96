import re
from pathlib import Path

_DIR = Path(__file__).resolve().parent

_FORBIDDEN = (
    'panneau admin', 'back-office', 'htmx/admin',
    'staff dashboard', 'escalade interne', 'clé api',
)


def load_knowledge(audience: str) -> str:
    audience = (audience or 'client').strip().lower()
    if audience not in ('client', 'driver', 'chauffeur'):
        audience = 'client'
    if audience == 'chauffeur':
        audience = 'driver'
    name = 'daxi_driver.md' if audience == 'driver' else 'daxi_client.md'
    path = _DIR / name
    try:
        text = path.read_text(encoding='utf-8')
    except OSError:
        text = ''
    return text


def audience_system_rules(audience: str) -> str:
    audience = 'driver' if (audience or '') in ('driver', 'chauffeur') else 'client'
    if audience == 'driver':
        role = (
            "Rôle : assistant CHAUFFEUR DAXI. "
            "Ne mélange pas avec l’expérience passager. "
            "N’explique jamais l’administration interne."
        )
    else:
        role = (
            "Rôle : assistant CLIENT / PASSAGER DAXI. "
            "Ne mélange pas avec l’espace chauffeur. "
            "N’explique jamais l’administration interne."
        )
    ban = (
        "INTERDIT : détails admin, staff, validation interne, secrets, clés, "
        "chemins /htmx/admin/, comptes d’autres personnes. "
        "N’écris JAMAIS d’URL (pas de http, localhost, #/commander, liens). "
        "Pour commander, dis d’ouvrir l’onglet Nouveau trajet dans l’app. "
        "Si on insiste sur l’admin : « Je ne peux pas parler de cette partie. Contactez WhatsApp +509 4496-9696. »"
    )
    return role + '\n' + ban


def sanitize_reply(text: str) -> str:
    if not text:
        return text
    low = text.lower()
    if any(w in low for w in _FORBIDDEN):
        return (
            "Je peux t’aider sur DAXI (courses, paiement, documents chauffeur selon ton espace). "
            "Pour un sujet interne, contacte WhatsApp +509 4496-9696."
        )
    text = re.sub(r'https?://[^\s)\]>]+', 'l’onglet Nouveau trajet', text, flags=re.I)
    text = re.sub(r'(?<!\w)#/commander\b', 'l’onglet Nouveau trajet', text, flags=re.I)
    return text
