"""Prompt Gemini manuel pour photo véhicule pro (sans appel API)."""
from __future__ import annotations


def extract_vehicle_color(driver) -> str:
    notes = (getattr(driver, 'verification_notes', None) or '').strip()
    for line in notes.splitlines():
        if 'couleur' in line.lower():
            return line.split(':', 1)[-1].strip() if ':' in line else line.strip()
    return ''


def build_vehicle_pro_prompt(driver) -> str:
    """
    Prompt à copier dans Gemini (gemini.google.com / AI Studio).
    L'admin télécharge la photo référence et colle ce texte.
    """
    lines = [
        'Contexte : application de taxi premium DAXI (Haïti).',
        'J\'ai attaché la photo de référence envoyée par le chauffeur.',
        '',
        'Génère UNE image professionnelle de CE véhicule exact (même modèle, couleur et forme).',
        '',
        'Exigences visuelles :',
        '- Photo automobile professionnelle, angle 3/4 avant, nette et réaliste.',
        '- Éclairage studio ou lumière naturelle premium, reflets contrôlés.',
        '- Fond neutre élégant ou urbain discret.',
        '- Pas de texte, pas de watermark, pas de logo ajouté.',
        '- Ne pas inventer un autre modèle de voiture.',
        '',
        'Informations officielles du véhicule (à respecter strictement) :',
    ]
    if driver.car_brand:
        lines.append(f'- Marque : {driver.car_brand}')
    if driver.car_model:
        lines.append(f'- Modèle : {driver.car_model}')
    if driver.car_year:
        lines.append(f'- Année : {driver.car_year}')
    color = extract_vehicle_color(driver)
    if color:
        lines.append(f'- Couleur : {color}')
    if driver.plate:
        lines.append(f'- Plaque d\'immatriculation : {driver.plate}')
    if driver.vehicle:
        lines.append(f'- Description complète : {driver.vehicle}')
    if driver.city:
        lines.append(f'- Ville d\'exploitation : {driver.city}')
    if driver.firstname or driver.lastname:
        lines.append(f'- Chauffeur : {driver.get_full_name()}')
    lines.extend([
        '',
        'Après génération, je uploaderai l\'image résultat comme photo publique du véhicule sur le dashboard admin.',
    ])
    return '\n'.join(lines)
