"""Catalogue des templates WhatsApp Meta — compte Daxi Transport."""

                                                            
                                                                                               
                                                                                 
                                                     
                                                                                          
                                                                            
                                                                                     
                                         
                                                            
                                                        
                                                       
                                                          
                                                      
                                                   
                                                                               
                                                                                    
                                             
                                         
                                                                   

                                                                 
META_TEMPLATES = {
    'nouvelle_commande': {
        'name': 'nouvelle_commande',
        'params': 5,
        'labels': ['prénom chauffeur', 'départ', 'destination', 'prix', 'distance'],
        'status': 'active',
    },
    'otp_whatsapp': {
        'name': 'demande_numero_badge_de_mon_chauffeur',
        'params': 2,
        'labels': ['prénom', 'information (code)'],
        'status': 'active',
    },
    'demande_paiment': {
        'name': 'demande_paiment',
        'params': 5,
        'labels': ['type compte', 'nom', 'méthode retrait', 'numéro', 'montant'],
        'status': 'active',
    },
    'commande_entreprise': {
        'name': 'commande_entreprise',
        'params': 3,
        'labels': ['nom entreprise', 'commission', 'solde'],
        'status': 'active',
    },
    'course_terminer_chauffeur': {
        'name': 'course_terminer_chauffeur',
        'params': 3,
        'labels': ['prénom chauffeur', 'montant gagné', 'solde'],
        'status': 'active',
    },
    'chauffeur_valide': {
        'name': 'chauffeur_valide',
        'params': 1,
        'labels': ['prénom chauffeur'],
        'status': 'active',
    },
    'sos_client': {
        'name': 'sos_client',
        'params': 1,
        'labels': ['prénom client'],
        'status': 'active',
    },
    'chauffeur_en_route': {
        'name': 'chauffeur_en_route',
        'params': 3,
        'labels': ['prénom client', 'nom chauffeur', 'ETA minutes'],
        'status': 'active',
        'category': 'marketing',
    },
    'welcome_client': {
        'name': 'welcome_client',
        'params': 1,
        'header_params': ['DAXI'],
        'labels': ['prénom client'],
        'status': 'active',
    },
    'course_terminee': {
        'name': 'course_terminee',
        'params': 3,
        'labels': ['prénom client', 'départ', 'destination'],
        'status': 'active',
        'category': 'utility',
    },
    'chauffeur_arrive': {
        'name': 'chauffeur_arrive',
        'params': 5,
        'labels': ['prénom client', 'départ', 'destination', 'nom chauffeur', 'véhicule'],
        'status': 'active',
        'category': 'utility',
    },
                                       
    'prix_propose': {
        'name': 'prix_propose',
        'params': 4,
        'labels': ['prénom client', 'départ', 'destination', 'prix'],
        'status': 'active',
    },
    'chauffeur_assigne': {
        'name': 'chauffeur_assigne',
        'params': 6,
        'labels': ['prénom', 'chauffeur', 'véhicule', 'départ', 'destination', 'prix'],
        'status': 'active',
    },
    'pause_course': {
        'name': 'pause_course',
        'params': 2,
        'labels': ['prénom client', 'tarif / 5 min'],
        'status': 'active',
    },
    'rappel_course': {
        'name': 'rappel_course',
        'params': 4,
        'labels': ['prénom', 'départ', 'destination', 'heure prévue'],
        'status': 'active',
    },
    'recu_course': {
        'name': 'recu_course',
        'params': 3,
        'labels': ['prénom', 'montant', 'n° course'],
        'status': 'active',
    },
    'sos_admin': {
        'name': 'sos_admin',
        'params': 6,
        'labels': ['n° course', 'signalé par', 'client', 'chauffeur', 'départ', 'destination'],
        'status': 'active',
    },
                              
    'nouvelle_commande_admin': {
        'name': 'nouvelle_commande_admin',
        'params': 5,
        'labels': ['n° course', 'client', 'départ', 'destination', 'prix'],
        'status': 'active',
    },
    'objet_oublie_admin': {
        'name': 'objet_oublie_admin',
        'params': 4,
        'labels': ['n° course', 'client', 'chauffeur', 'description objet'],
        'status': 'active',
    },
    'entreprise_en_attente': {
        'name': 'entreprise_en_attente',
        'params': 4,
        'labels': ['nom entreprise', 'téléphone', 'email', 'mode partenariat'],
        'status': 'active',
    },
    'entreprise_emplacement': {
        'name': 'entreprise_emplacement',
        'params': 2,
        'labels': ['nom entreprise', 'message aide'],
        'status': 'active',
    },
    'chauffeur_a_valider': {
        'name': 'chauffeur_a_valider',
        'params': 4,
        'labels': ['nom complet', 'véhicule', 'téléphone', 'ville'],
        'status': 'active',
    },
    'commande_attente_coords': {
        'name': 'commande_attente_coords',
        'params': 5,
        'header_static': 'En attente de localisation.',
        'labels': [
            'prénom destinataire', 'n° course', 'client',
            'départ texte', 'destination texte',
        ],
        'status': 'active',
    },
}

                                                     
META_NOT_CREATED = (
    'course_demarree',
    'course_annulee',
    'prix_confirme',
    'chat_escalade',
)

META_APPROVED = {k: v for k, v in META_TEMPLATES.items() if v.get('status') == 'active'}
META_PENDING = {k: v for k, v in META_TEMPLATES.items() if v.get('status') == 'pending'}
META_MISSING_SITUATIONS = tuple(META_NOT_CREATED)
