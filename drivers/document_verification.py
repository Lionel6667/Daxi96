"""OCR + DeepSeek/Groq — vérification documents chauffeur (nom, dates, expiration)."""
from __future__ import annotations

import json
import os
from datetime import date, datetime
from io import BytesIO

import requests
from django.conf import settings

DOC_LABELS = {
    'license': 'Permis de conduire',
    'oavct': 'Assurance OAVCT',
    'dgi': 'Carte DGI',
    'tint': 'Autorisation de teinte',
}

MANUAL_REVIEW_STATUSES = frozenset({'ocr_error', 'ai_unavailable', 'manual_verification'})

REQUIRED_DOC_TYPES = frozenset({'license', 'oavct', 'dgi'})


def _doc_label(doc_type: str) -> str:
    return DOC_LABELS.get(doc_type, doc_type)


def extract_ocr_text(file_obj, ocr_reader=None) -> str:
    import numpy as np
    from PIL import Image, ImageOps

    if hasattr(file_obj, 'seek'):
        file_obj.seek(0)
    img = Image.open(file_obj)
    img = ImageOps.grayscale(img)
    if img.width > 800 or img.height > 800:
        img.thumbnail((800, 800))
    img_np = np.array(img)

    if ocr_reader is None:
        from julmin_taxis.htmx_views import get_ocr_reader
        ocr_reader = get_ocr_reader()

    ocr_result = ocr_reader.readtext(img_np, detail=0)
    return ' '.join(ocr_result).strip()


def _ai_chat_json(system_prompt: str, user_content: str) -> dict:
    """Appelle DeepSeek en priorité, puis Groq en secours."""
    deepseek_key = getattr(settings, 'DEEPSEEK_API_KEY', '') or os.environ.get('DEEPSEEK_API_KEY', '')
    groq_key = getattr(settings, 'GROQ_API_KEY', '') or os.environ.get('GROQ_API_KEY', '')

    providers = []
    if deepseek_key:
        providers.append({
            'url': 'https://api.deepseek.com/chat/completions',
            'key': deepseek_key,
            'model': 'deepseek-chat',
            'name': 'DeepSeek',
        })
    if groq_key:
        providers.append({
            'url': 'https://api.groq.com/openai/v1/chat/completions',
            'key': groq_key,
            'model': 'llama-3.3-70b-versatile',
            'name': 'Groq',
        })

    if not providers:
        raise RuntimeError('Aucune clé IA configurée (DEEPSEEK_API_KEY ou GROQ_API_KEY)')

    payload = {
        'messages': [
            {'role': 'system', 'content': system_prompt},
            {'role': 'user', 'content': user_content},
        ],
        'response_format': {'type': 'json_object'},
    }
    last_err = ''
    for p in providers:
        payload['model'] = p['model']
        try:
            resp = requests.post(
                p['url'],
                headers={
                    'Authorization': f'Bearer {p["key"]}',
                    'Content-Type': 'application/json',
                },
                json=payload,
                timeout=25,
            )
            data = resp.json()
            if resp.status_code != 200:
                last_err = data.get('error', {}).get('message', resp.text[:200])
                continue
            content = data['choices'][0]['message']['content']
            return json.loads(content)
        except Exception as exc:
            last_err = str(exc)
    raise RuntimeError(last_err or 'Analyse IA indisponible')


def analyze_ocr_text(ocr_text: str, doc_type: str, firstname: str = '', lastname: str = '') -> dict:
    identity_context = ''
    if firstname or lastname:
        identity_context = (
            f"\n\nVÉRIFICATION D'IDENTITÉ :\n"
            f"Le chauffeur s'inscrit sous le nom : {firstname} {lastname}.\n"
            f"Vérifie que le nom sur le document correspond (tolère accents, ordre prénom/nom, initiales).\n"
            f"Réponds identity_match: true si cohérent, false sinon.\n"
            f"Si identity_match est false, remplis rejection_reason avec le problème exact "
            f"(ex: « Le permis est au nom de Jean Pierre, pas {firstname} {lastname} »)."
        )

    system_prompt = (
        "Tu es un agent administratif haïtien expert en documents de transport (taxi).\n"
        f"Type de document attendu : {_doc_label(doc_type)}.\n"
        "IDENTIFIE le type réel du document.\n"
        "TROUVE la date d'expiration (fin de validité).\n"
        f"{identity_context}"
        "\n\nRÈGLES HAÏTI :\n"
        "- OAVCT/DGI : exercices fiscaux 24-25 expirent le 2025-09-30, 23-24 le 2024-09-30.\n"
        "- Cherche « Expire le », « Échéance », « Valid until ».\n"
        "\nRéponds UNIQUEMENT en JSON :\n"
        "document_type, expiry_date (AAAA-MM-JJ ou null), extracted_name, "
        "identity_match (boolean), rejection_reason (string si problème), "
        "status_hint (valide|expiré|illisible)."
    )
    return _ai_chat_json(system_prompt, f"Texte OCR :\n\n{ocr_text}")


def finalize_verification(analysis: dict, doc_type: str, firstname: str = '', lastname: str = '') -> dict:
    """Transforme la réponse IA en verdict exploitable."""
    label = _doc_label(doc_type)
    expiry_str = analysis.get('expiry_date')
    identity_match = analysis.get('identity_match')
    rejection_reason = (analysis.get('rejection_reason') or '').strip()

    if analysis.get('is_authentic') is False:
        msg = rejection_reason or (
            f"Cette image ne semble pas être un vrai {_doc_label(doc_type)} haïtien. "
            "Reprenez une photo du document original, bien éclairée."
        )
        return {
            'ok': False,
            'status': 'fake_document',
            'document_type': analysis.get('document_type') or label,
            'expiry_date': expiry_str,
            'message': msg,
            'identity_match': identity_match,
        }

    if analysis.get('is_expected_type') is False:
        found = analysis.get('document_type') or 'un autre document'
        msg = rejection_reason or (
            f"Ce n’est pas le bon document. Attendu : {label}. Détecté : {found}."
        )
        return {
            'ok': False,
            'status': 'wrong_type',
            'document_type': analysis.get('document_type') or label,
            'expiry_date': expiry_str,
            'message': msg,
            'identity_match': identity_match,
        }

    extracted_name = (analysis.get('extracted_name') or '').strip()
    if (firstname or lastname) and doc_type in ('license', 'oavct', 'dgi'):
        if identity_match is False:
            msg = rejection_reason or (
                f"Le nom sur le {label} ne correspond pas à « {firstname} {lastname} »."
            )
            if extracted_name:
                msg = rejection_reason or (
                    f"Le {label} est au nom de {extracted_name}, pas {firstname} {lastname}."
                )
            return {
                'ok': False,
                'status': 'invalid_name',
                'document_type': analysis.get('document_type') or label,
                'expiry_date': expiry_str,
                'message': msg,
                'identity_match': False,
            }
        if not extracted_name and identity_match is not True:
            return {
                'ok': False,
                'status': 'invalid_name',
                'document_type': analysis.get('document_type') or label,
                'expiry_date': expiry_str,
                'message': (
                    f"Votre nom « {firstname} {lastname} » n’apparaît pas clairement sur le {label}. "
                    "Reprenez une photo où le nom est lisible."
                ),
                'identity_match': False,
            }

    if identity_match is False:
        msg = rejection_reason or (
            f"Le nom sur le {label} ne correspond pas à « {firstname} {lastname} »."
        )
        return {
            'ok': False,
            'status': 'invalid_name',
            'document_type': analysis.get('document_type') or label,
            'expiry_date': expiry_str,
            'message': msg,
            'identity_match': False,
        }

    if not expiry_str:
        msg = f"Date d'expiration illisible sur le {label}. Reprenez une photo plus nette."
        return {
            'ok': False,
            'status': 'manual_verification',
            'document_type': analysis.get('document_type') or label,
            'expiry_date': None,
            'message': msg,
            'identity_match': identity_match,
        }

    try:
        expiry_date = datetime.strptime(str(expiry_str)[:10], '%Y-%m-%d').date()
    except ValueError:
        return {
            'ok': False,
            'status': 'manual_verification',
            'document_type': analysis.get('document_type') or label,
            'expiry_date': expiry_str,
            'message': f"Date invalide sur le {label} : {expiry_str}",
            'identity_match': identity_match,
        }

    today = date.today()
    diff = (expiry_date - today).days

    if expiry_date < today:
        return {
            'ok': False,
            'status': 'expired',
            'document_type': analysis.get('document_type') or label,
            'expiry_date': expiry_str,
            'message': f"{label} expiré depuis le {expiry_date.strftime('%d/%m/%Y')}.",
            'identity_match': identity_match,
        }

    if diff <= 90:
        return {
            'ok': True,
            'status': 'near_expiry',
            'document_type': analysis.get('document_type') or label,
            'expiry_date': expiry_str,
            'message': f"{label} valide — expire le {expiry_date.strftime('%d/%m/%Y')} (moins de 3 mois).",
            'identity_match': identity_match,
        }

    return {
        'ok': True,
        'status': 'valid',
        'document_type': analysis.get('document_type') or label,
        'expiry_date': expiry_str,
        'message': f"{label} valide jusqu'au {expiry_date.strftime('%d/%m/%Y')}.",
        'identity_match': identity_match,
    }


def _read_upload_bytes(file_obj) -> tuple[bytes, str]:
    if hasattr(file_obj, 'seek'):
        file_obj.seek(0)
    raw = file_obj.read()
    if hasattr(file_obj, 'seek'):
        file_obj.seek(0)
    name = (getattr(file_obj, 'name', '') or '').lower()
    ctype = (getattr(file_obj, 'content_type', '') or '').lower()
    if 'png' in ctype or name.endswith('.png'):
        mime = 'image/png'
    elif 'webp' in ctype or name.endswith('.webp'):
        mime = 'image/webp'
    elif 'gif' in ctype:
        mime = 'image/gif'
    else:
        mime = 'image/jpeg'
    return raw, mime


def analyze_document_image(file_obj, doc_type: str, firstname: str = '', lastname: str = '') -> dict:
    from julmin_taxis.gemini_client import gemini_generate_json

    label = _doc_label(doc_type)
    raw, mime = _read_upload_bytes(file_obj)
    if not raw:
        raise RuntimeError('Fichier vide')
    identity = ''
    if firstname or lastname:
        identity = (
            f"Le chauffeur s'inscrit sous le nom : {firstname} {lastname}. "
            "Le nom doit apparaître sur permis / OAVCT / DGI (tolère accents et ordre). "
            "identity_match true seulement si c'est la même personne."
        )
    prompt = (
        f"Document attendu : {label} (Haïti, taxi / transport).\n"
        f"{identity}\n"
        "Vérifie : 1) photo d'un VRAI document (pas screenshot WhatsApp flou, pas selfie, pas autre papier) ; "
        "2) le type correspond ; 3) date d'expiration ; 4) nom lu.\n"
        "Règles Haïti : OAVCT/DGI exercices 24-25 → expire souvent 2025-09-30 ; 23-24 → 2024-09-30.\n"
        "JSON uniquement : is_authentic (bool), is_expected_type (bool), document_type, "
        "extracted_name, identity_match (bool|null), expiry_date (AAAA-MM-JJ|null), "
        "rejection_reason (string), status_hint (valide|expiré|illisible|faux_document|mauvais_type)."
    )
    return gemini_generate_json(
        prompt,
        system="Tu es un expert des documents de transport haïtiens. Réponds uniquement en JSON.",
        image_bytes=raw,
        mime_type=mime,
        timeout=20,
    )


def verify_uploaded_file(file_obj, doc_type: str, firstname: str = '', lastname: str = '', ocr_reader=None) -> dict:
    """Gemini vision d'abord, puis OCR + texte IA en secours."""
    label = _doc_label(doc_type)
    analysis = None
    try:
        analysis = analyze_document_image(file_obj, doc_type, firstname=firstname, lastname=lastname)
    except Exception:
        analysis = None

    ocr_text = ''
    if analysis is None:
        try:
            ocr_text = extract_ocr_text(file_obj, ocr_reader=ocr_reader)
        except Exception as exc:
            return {
                'ok': False,
                'status': 'ocr_error',
                'message': f"Impossible de lire le {label} : {exc}",
            }
        if not ocr_text:
            return {
                'ok': False,
                'status': 'ocr_error',
                'message': f"Texte illisible sur le {label}. Photo plus nette et bien éclairée requise.",
            }
        try:
            analysis = analyze_ocr_text(ocr_text, doc_type, firstname=firstname, lastname=lastname)
        except RuntimeError as exc:
            return {
                'ok': False,
                'status': 'ai_unavailable',
                'message': f"Vérification IA indisponible pour le {label} : {exc}",
                'ocr_text': ocr_text[:300],
            }

    result = finalize_verification(analysis, doc_type, firstname=firstname, lastname=lastname)
    if ocr_text:
        result['ocr_text'] = ocr_text[:500]
    return result


def verify_driver_registration_files(
    files,
    firstname: str,
    lastname: str,
    ocr_reader=None,
    *,
    allow_manual_review: bool = False,
    strict: bool = True,
) -> tuple[bool, list[str], dict]:
    """
    Vérifie tous les documents obligatoires à l'inscription.
    strict=False : présence des fichiers uniquement (vérification admin ensuite).
    allow_manual_review=True : OCR/IA illisible → inscription acceptée, admin valide.
    Retourne (ok, erreurs[], notes_par_doc).
    """
    specs = [
        ('driving_license', 'license'),
        ('oavct_insurance', 'oavct'),
        ('dgi_card', 'dgi'),
    ]
    errors: list[str] = []
    notes: dict = {}

    for field, doc_type in specs:
        f = files.get(field)
        if not f:
            errors.append(f"Document manquant : {_doc_label(doc_type)}.")
            continue
        if not strict:
            notes[doc_type] = 'Fichier reçu — vérification admin en attente.'
            continue
        if hasattr(f, 'seek'):
            f.seek(0)
        verdict = verify_uploaded_file(f, doc_type, firstname, lastname, ocr_reader=ocr_reader)
        notes[doc_type] = verdict.get('message', '')
        if verdict.get('ok'):
            continue
        status = verdict.get('status', '')
        if allow_manual_review and status in MANUAL_REVIEW_STATUSES:
            notes[doc_type] = (verdict.get('message') or '') + ' [Vérification admin requise]'
            continue
        errors.append(verdict.get('message') or f"{_doc_label(doc_type)} : rejeté.")

    tint = files.get('tint_permit')
    if tint and strict:
        if hasattr(tint, 'seek'):
            tint.seek(0)
        verdict = verify_uploaded_file(tint, 'tint', firstname, lastname, ocr_reader=ocr_reader)
        notes['tint'] = verdict.get('message', '')
        if not verdict.get('ok'):
            status = verdict.get('status', '')
            if allow_manual_review and status in MANUAL_REVIEW_STATUSES:
                notes['tint'] = (verdict.get('message') or '') + ' [Vérification admin requise]'
            else:
                errors.append(verdict.get('message') or "Autorisation de teinte : rejetée.")

    return len(errors) == 0, errors, notes
