<?php

if (php_sapi_name() !== 'cli') {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Accept, X-Requested-With');
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }
}


const SITE_KNOWLEDGE = [
    'plans' => [
        [
            'nom' => 'Course Ville à Ville',
            'nom_kreyol' => 'Kous Vil a Vil',
            'prix' => 'Prix à déterminer selon distance',
            'description' => 'Déplacez-vous en toute sérénité entre les villes avec notre service de transport confortable et sécurisé.',
            'description_kreyol' => 'Deplase w nan tout sekirite ant vil yo avèk sèvis transpò konfotan ak sekirize nou an.',
            'type' => 'course',
            'caracteristiques' => [
                'Transport inter-villes',
                'Véhicule moderne et climatisé',
                'Chauffeur expérimenté',
                'Prix calculé selon la distance'
            ]
        ],
        [
            'nom' => 'Demi-Journée',
            'nom_kreyol' => 'Demi-Jou',
            'duree' => '4 heures',
            'duree_kreyol' => '4 èdtan',
            'prix' => '70$',
            'description' => 'Idéal pour vos courses, rendez-vous et visites. Votre chauffeur privé disponible pendant 4 heures.',
            'description_kreyol' => 'Ideyal pou kous ou yo, randevou ak vizit. Chofè prive w disponib pandan 4 èdtan.',
            'type' => 'location',
            'inclus' => [
                'Chauffeur dédié pendant 4h',
                'Multiples arrêts possibles',
                'Attente entre les courses',
                'Service flexible'
            ]
        ],
        [
            'nom' => 'Journée Complète',
            'nom_kreyol' => 'Jou Konplè',
            'duree' => '8 heures',
            'duree_kreyol' => '8 èdtan',
            'prix' => '140$',
            'description' => 'Service complet pour vos journées chargées. Profitez d\'un chauffeur dédié pendant 8 heures.',
            'description_kreyol' => 'Sèvis konplè pou jou ou yo ki chaje. Benefisye yon chofè dedye pandan 8 èdtan.',
            'type' => 'location',
            'inclus' => [
                'Chauffeur personnel toute la journée',
                'Illimité en nombre d\'arrêts',
                'Parfait pour réunions et rendez-vous',
                'Maximum de flexibilité'
            ]
        ],
        [
            'nom' => 'Élégance Night',
            'nom_kreyol' => 'Elegans Nwit',
            'duree' => 'Jusqu\'à 3 heures',
            'duree_kreyol' => 'Jiska 3 èdtan',
            'prix' => '150$',
            'description' => 'Pour vos soirées spéciales. Service premium avec véhicule haut de gamme pour vos sorties nocturnes.',
            'description_kreyol' => 'Pou sware espesyal ou yo. Sèvis premium ak veyikil wo gam pou sòti lannwit ou yo.',
            'type' => 'premium',
            'inclus' => [
                'Véhicule haut de gamme',
                'Service de soirée exclusif',
                'Chauffeur professionnel en tenue',
                'Idéal pour événements, restaurants, clubs'
            ]
        ],
        [
            'nom' => 'Business / VIP',
            'nom_kreyol' => 'Biznis / VIP',
            'type' => 'abonnement',
            'prix' => 'Prix sur mesure selon besoins',
            'description' => 'Service exclusif pour professionnels et clients VIP avec chauffeur dédié.',
            'description_kreyol' => 'Sèvis eksklusif pou pwofesyonèl ak kliyan VIP ak chofè dedye.',
            'avantages' => [
                'Chauffeur personnel dédié à temps plein',
                'Véhicule premium de luxe',
                'Disponibilité 24/7',
                'Service prioritaire',
                'Facturation mensuelle flexible',
                'Parking et entretien inclus',
                'Réservations multiples sans limite'
            ]
        ]
    ],
    
    'itineraires_frequents' => [
        ['de' => 'Cap-Haïtien', 'vers' => 'Ouanaminthe', 'distance' => '63.2 km', 'duree' => '~2h'],
        ['de' => 'Cap-Haïtien', 'vers' => 'Fort Liberté', 'distance' => '85.5 km', 'duree' => '~2h30'],
        ['de' => 'Cap-Haïtien', 'vers' => 'Gonaïves', 'distance' => '101 km', 'duree' => '3h30 - 4h40'],
        ['de' => 'Cap-Haïtien', 'vers' => 'Folibètè', 'distance' => '50.7 km', 'duree' => '~1h30'],
        ['de' => 'Cap-Haïtien', 'vers' => 'Hinche', 'distance' => '~100 km', 'duree' => '~3h'],
        ['de' => 'Gonaïves', 'vers' => 'Port de Paix', 'distance' => '79.3 km', 'duree' => '~2h40'],
        ['de' => 'Cap-Haïtien', 'vers' => 'Môle St Nicolas', 'distance' => '178 km', 'duree' => '≥8h'],
        ['de' => 'Cap-Haïtien', 'vers' => 'Port-au-Prince', 'distance' => '~220 km', 'duree' => '4h-5h'],
        ['de' => 'Port-au-Prince', 'vers' => 'Jacmel', 'distance' => '~90 km', 'duree' => '2h-3h'],
        ['de' => 'Port-au-Prince', 'vers' => 'Les Cayes', 'distance' => '~195 km', 'duree' => '4h-5h']
    ],
    
    'services' => [
        'reservation' => [
            'description' => 'Réservation 24/7 disponible',
            'methodes' => [
                'Application mobile DAXI',
                'Site web www.daxitaxi.com',
                'WhatsApp +50944969696',
                'Appel téléphonique'
            ],
            'fonctionnalites' => [
                'Réservation instantanée',
                'Réservation planifiée (à l\'avance)',
                'Estimation de prix en temps réel',
                'Suivi GPS du chauffeur',
                'Historique des courses'
            ]
        ],
        'paiement' => [
            'methodes_acceptees' => [
                'Cash (gourdes ou dollars)',
                'Moncash',
                'Natcash',
                'Paiement mobile'
            ],
            'securite' => 'Tous les paiements sont sécurisés et traçables'
        ],
        'zones_couverture' => [
            'Nord' => ['Cap-Haïtien', 'Ouanaminthe', 'Fort Liberté', 'Folibètè', 'Limonade', 'Milot'],
            'Centre' => ['Hinche', 'Mirebalais', 'Lascahobas'],
            'Artibonite' => ['Gonaïves', 'Saint-Marc', 'Dessalines'],
            'Nord-Ouest' => ['Port de Paix', 'Môle St Nicolas'],
            'Ouest' => ['Port-au-Prince', 'Pétion-Ville', 'Carrefour', 'Delmas'],
            'Sud-Est' => ['Jacmel', 'Marigot'],
            'Sud' => ['Les Cayes', 'Port-Salut'],
            'note' => 'Service disponible dans TOUTES les villes d\'Haïti'
        ],
        'vehicules' => [
            'types' => [
                'Berlines confortables (4-5 passagers)',
                'SUV spacieux (5-7 passagers)',
                'Véhicules premium (Business/VIP)',
                'Mini-bus (groupes)'
            ],
            'caracteristiques' => [
                'Flotte moderne (moins de 5 ans)',
                'Climatisation',
                'Entretien régulier',
                'Assurance complète',
                'GPS intégré'
            ]
        ],
        'support' => 'Support client disponible 24/7 via chat, WhatsApp ou téléphone'
    ],
    
    'contact' => [
        'whatsapp' => '+50944969696',
        'email' => 'contact@daxitaxi.com',
        'site_web' => 'www.daxitaxi.com',
        'urgence' => '114 (Police)',
        'support_hours' => 'Disponible 24 heures sur 24, 7 jours sur 7',
        'reseaux_sociaux' => [
            'Facebook' => '@DAXIHaiti',
            'Instagram' => '@daxi_haiti',
            'Twitter' => '@DAXITaxi'
        ]
    ],
    
    'fonctionnalites_app' => [
        'Géolocalisation en temps réel (voir le chauffeur arriver)',
        'Estimation de prix AVANT réservation',
        'Historique complet des courses',
        'Paiement intégré sécurisé',
        'Évaluation et commentaires sur les chauffeurs',
        'Support en direct par chat',
        'Réservation planifiée (réserver pour plus tard)',
        'Partage de trajet en temps réel avec proches',
        'Factures et reçus électroniques',
        'Favoris (adresses fréquentes)',
        'Mode sombre pour confort visuel'
    ],
    
    'compte' => [
        'creation' => [
            'methode' => 'Inscription simple avec email et numéro de téléphone',
            'verification' => 'Code de vérification par SMS',
            'temps' => 'Moins de 2 minutes',
            'gratuit' => 'Aucun frais d\'inscription'
        ],
        'connexion' => 'Se connecter avec email/téléphone et mot de passe',
        'profil' => [
            'Modifier informations personnelles',
            'Ajouter/gérer adresses favorites',
            'Changer mot de passe',
            'Préférences de notification',
            'Langue de l\'interface'
        ],
        'historique' => 'Accès complet à l\'historique de TOUTES les courses avec détails',
        'paiements' => 'Gérer les méthodes de paiement et voir les transactions'
    ],
    
    'tarification' => [
        'calcul' => [
            'Basé sur la distance parcourue',
            'Temps de trajet',
            'Type de véhicule',
            'Horaire (tarif normal vs. nuit)',
            'Demande en temps réel'
        ],
        'estimation' => 'Prix estimé AVANT de confirmer la course',
        'transparence' => 'Aucun frais caché, prix fixé à l\'avance',
        'pourboire' => 'Pourboire optionnel pour le chauffeur (apprécié mais pas obligatoire)'
    ],
    
    'securite' => [
        'Chauffeurs' => [
            'Vérification complète des antécédents',
            'Formation professionnelle obligatoire',
            'Licence et assurance valides',
            'Évaluation continue par les clients'
        ],
        'Vehicules' => [
            'Inspection technique régulière',
            'Assurance tous risques',
            'GPS pour traçabilité',
            'Maintenance préventive'
        ],
        'Trajet' => [
            'Partage de trajet en temps réel',
            'Bouton SOS dans l\'app',
            'Support 24/7',
            'Enregistrement des trajets'
        ]
    ],
    
    'faq' => [
        'Comment réserver?' => 'Via l\'app DAXI, le site web, WhatsApp +50944969696 ou par téléphone',
        'Puis-je réserver à l\'avance?' => 'Oui, réservation planifiée disponible jusqu\'à 7 jours à l\'avance',
        'Combien de temps pour avoir un taxi?' => 'Généralement 5-15 minutes selon votre localisation',
        'Puis-je annuler?' => 'Oui, annulation gratuite jusqu\'à 5 minutes après la réservation',
        'Les chauffeurs parlent créole?' => 'Oui, tous les chauffeurs parlent créole, beaucoup parlent aussi français et anglais',
        'Service disponible la nuit?' => 'Oui, service 24/7 avec plan Élégance Night pour soirées',
        'Prix des courses?' => 'Voir nos plans: Demi-Journée 70$, Journée 140$, Élégance Night 150$, ou prix selon distance pour Course Ville à Ville'
    ],
    
    'villes_detaillees' => [
        'Cap-Haïtien' => [
            'region' => 'Nord',
            'population' => '~274,000 habitants',
            'coordonnees' => ['lat' => 19.7371, 'lng' => -72.2068],
            'surnoms' => ['La Perle du Nord', 'Okap', 'Le Cap'],
            'description' => 'Deuxième plus grande ville d\'Haïti, capitale culturelle et économique du Nord. Riche patrimoine historique colonial français.',
            'histoire' => 'Fondée en 1670, ancienne capitale de Saint-Domingue français. Centre de la révolution haïtienne. Nombreux monuments historiques classés UNESCO.',
            'attractions' => [
                'Citadelle Laferrière (8ème merveille du monde)',
                'Palais Sans-Souci (résidence royale d\'Henri Christophe)',
                'Cathédrale Notre-Dame du Cap-Haïtien',
                'Place d\'Armes',
                'Marché de fer',
                'Vertières (lieu bataille indépendance)',
                'Baie de Cap-Haïtien',
                'Plages Labadie et Cormier'
            ],
            'economie' => 'Port commercial important, tourisme, artisanat, commerce transfrontalier',
            'culture' => 'Centre culturel majeur avec festivals annuels, théâtre, musique traditionnelle rara et compas',
            'climat' => 'Tropical chaud et humide, températures 24-32°C toute l\'année',
            'acces_daxi' => 'Hub principal DAXI Nord, départs quotidiens vers toutes destinations',
            'temps_trajet_pap' => '4-5h (220 km)',
            'hotels_recommandes' => ['Hôtel Mont Joli', 'Habitation des Lauriers', 'Royal Decameron Indigo']
        ],
        'Hinche' => [
            'region' => 'Centre',
            'departement' => 'Centre',
            'population' => '~50,000 habitants',
            'coordonnees' => ['lat' => 19.137583, 'lng' => -72.015597],
            'surnoms' => ['Capitale du Plateau Central'],
            'description' => 'Capitale du département du Centre, située sur le Plateau Central. Ville agricole et commerciale stratégique.',
            'histoire' => 'Ancienne cité taïno, devenue centre administratif colonial puis républicain. Rôle important dans agriculture haïtienne.',
            'attractions' => [
                'Cathédrale de Hinche (plus de 30 ans, architecture remarquable)',
                'Bassin Zim (piscine naturelle spectaculaire à proximité)',
                'Marché central de Hinche',
                'Place publique',
                'Paysages du Plateau Central',
                'Étang Saumâtre (à 2h, plus grand lac d\'Haïti)'
            ],
            'economie' => 'Agriculture (riz, maïs, haricots), élevage, commerce régional',
            'culture' => 'Traditions vaudou fortes, festivals agricoles, musique racine',
            'climat' => 'Tropical d\'altitude, plus frais que côtes (22-30°C), pluies mai-octobre',
            'acces_daxi' => 'Service DAXI depuis Cap-Haïtien (~100 km, 3h) et Port-au-Prince (~145 km, 3-4h)',
            'particularites' => 'Point de passage vers République Dominicaine via Belladère',
            'agriculture' => 'Grenier d\'Haïti - production importante céréales et légumes'
        ],
        'Ouanaminthe' => [
            'region' => 'Nord-Est',
            'population' => '~100,000 habitants',
            'coordonnees' => ['lat' => 19.5514, 'lng' => -71.7255],
            'surnoms' => ['Wanament', 'Ville frontière'],
            'description' => 'Ville frontalière avec République Dominicaine (Dajabón). Centre commercial majeur.',
            'histoire' => 'Développée comme poste frontière, croissance rapide grâce commerce transfrontalier',
            'attractions' => [
                'Marché binational (lundi et vendredi)',
                'Pont de la Massacre (frontière RD)',
                'Rivière Massacre',
                'Petit Saut d\'eau (cascade magnifique)',
                'Église Apostolique (architecture remarquable)',
                'Zone franche industrielle'
            ],
            'economie' => 'Commerce transfrontalier dominant, zone franche textile, agriculture',
            'culture' => 'Mixte haïtiano-dominicaine, influences créoles et hispaniques',
            'climat' => 'Tropical chaud, 25-33°C, saison sèche décembre-mars',
            'acces_daxi' => 'Service régulier depuis Cap-Haïtien (63.2 km, 2h)',
            'commerce' => 'Hub commercial: électronique, vêtements, alimentation, produits dominicains',
            'langues' => 'Créole, français, espagnol largement parlé'
        ],
        'Fort Liberté' => [
            'region' => 'Nord-Est',
            'population' => '~15,000 habitants',
            'coordonnees' => ['lat' => 19.6623, 'lng' => -71.8369],
            'surnoms' => ['Folibètè', 'Ville coloniale'],
            'description' => 'Ville portuaire historique avec baie magnifique. Architecture coloniale préservée.',
            'histoire' => 'Ancien Fort Dauphin français (1578), renommé Fort Liberté après indépendance. Patrimoine colonial exceptionnel.',
            'attractions' => [
                'Baie de Fort Liberté (2ème plus grande baie naturelle monde)',
                'Fortifications coloniales espagnoles et françaises',
                'Architecture coloniale préservée',
                'Plages paradisiaques',
                'Fort Saint-Joseph',
                'Vieux quartier colonial',
                'Pêche traditionnelle'
            ],
            'economie' => 'Pêche, tourisme potentiel énorme, agriculture côtière',
            'culture' => 'Traditions maritimes, festivals religieux, musique rara',
            'climat' => 'Tropical maritime, brises marines, 24-31°C',
            'acces_daxi' => 'Service DAXI depuis Cap-Haïtien (85.5 km, 2h30)',
            'potentiel' => 'Destination touristique majeure en développement - baie spectaculaire',
            'peche' => 'Communauté de pêcheurs actifs, poissons frais quotidiens'
        ],
        'Gonaïves' => [
            'region' => 'Artibonite',
            'population' => '~300,000 habitants',
            'coordonnees' => ['lat' => 19.4461, 'lng' => -72.6894],
            'surnoms' => ['Cité de l\'Indépendance', 'Gonayiv'],
            'description' => 'Quatrième ville d\'Haïti, berceau de l\'indépendance. Centre commercial Artibonite.',
            'histoire' => 'Proclamation indépendance haïtienne 1er janvier 1804. Ville symbole liberté nationale.',
            'attractions' => [
                'Place de l\'Indépendance (proclamation 1804)',
                'Monument Toussaint Louverture',
                'Cathédrale de Gonaïves',
                'Marché central animé',
                'Place d\'Armes',
                'Monuments historiques révolution',
                'Côte maritime'
            ],
            'economie' => 'Commerce, agriculture Artibonite, pêche, artisanat',
            'culture' => 'Capitale culturelle vaudou, festivals Rara spectaculaires, musique racine',
            'climat' => 'Tropical sec, très chaud (26-35°C), saison pluies vulnérables inondations',
            'acces_daxi' => 'Service DAXI depuis Cap-Haïtien (101 km, 3h30-4h40) et Port de Paix (79.3 km, 2h40)',
            'fetes' => '1er janvier - célébrations indépendance majeures chaque année',
            'importance' => 'Ville patriotique, symbolique forte pour tous Haïtiens'
        ],
        'Port de Paix' => [
            'region' => 'Nord-Ouest',
            'population' => '~250,000 habitants',
            'coordonnees' => ['lat' => 19.9395, 'lng' => -72.8300],
            'surnoms' => ['Pòdpè', 'Capitale Nord-Ouest'],
            'description' => 'Capitale département Nord-Ouest. Ville portuaire côtière.',
            'histoire' => 'Ancien port colonial, développé commerce bois précieux et café',
            'attractions' => [
                'Port maritime',
                'Plages environnantes',
                'Marché central',
                'Architecture coloniale',
                'Île de la Tortue (accessible)',
                'Côte atlantique sauvage',
                'Paysages montagneux'
            ],
            'economie' => 'Port commercial, pêche, agriculture (bananes, mangues), commerce',
            'culture' => 'Influences pirate historique (Île Tortue), musique troubadour',
            'climat' => 'Tropical maritime, vents alizés, 25-32°C',
            'acces_daxi' => 'Service DAXI depuis Cap-Haïtien (107 km, 4h40-6h30) et Gonaïves (79.3 km, 2h40)',
            'geographie' => 'Position stratégique côte nord-ouest, accès Île Tortue',
            'developpement' => 'Croissance rapide, commerce avec nord pays'
        ],
        'Môle Saint-Nicolas' => [
            'region' => 'Nord-Ouest',
            'population' => '~5,000 habitants',
            'coordonnees' => ['lat' => 19.8046, 'lng' => -73.3754],
            'surnoms' => ['Môle', 'Bout de l\'île'],
            'description' => 'Ville côtière extrême nord-ouest Haïti. Baie stratégique historique.',
            'histoire' => 'Christophe Colomb débarqua ici 1492. Convoitée par puissances coloniales pour baie profonde.',
            'attractions' => [
                'Baie du Môle (mouillage naturel exceptionnel)',
                'Plages vierges spectaculaires',
                'Place Vue Kabrit (panorama magnifique)',
                'Vestiges fortifications',
                'Paysages sauvages préservés',
                'Récifs coralliens',
                'Observation baleines (saison)',
                'Villages de pêcheurs authentiques'
            ],
            'economie' => 'Pêche artisanale, tourisme naissant, agriculture subsistance',
            'culture' => 'Communauté rurale traditionnelle, pêcheurs, artisanat local',
            'climat' => 'Tropical sec, très ensoleillé, vents constants, 26-33°C',
            'acces_daxi' => 'Service DAXI depuis Cap-Haïtien (178 km, ≥8h - route difficile)',
            'isolement' => 'Zone reculée, route difficile mais paysages exceptionnels',
            'potentiel' => 'Énorme potentiel touristique - plages vierges, baie magnifique, tranquillité'
        ],
        'Port-au-Prince' => [
            'region' => 'Ouest',
            'population' => '~2,900,000 habitants (agglomération)',
            'coordonnees' => ['lat' => 18.5944, 'lng' => -72.3074],
            'surnoms' => ['PAP', 'Pòtoprens', 'Capitale'],
            'description' => 'Capitale et plus grande ville Haïti. Centre politique, économique, culturel.',
            'histoire' => 'Capitale depuis 1770, remplaçant Cap-Haïtien. Séisme dévastateur 2010.',
            'attractions' => [
                'Palais National (en reconstruction)',
                'Musée du Panthéon National Haïtien (MUPANAH)',
                'Cathédrale Port-au-Prince',
                'Marché de fer',
                'Pétion-Ville (quartier résidentiel haut)',
                'Centre d\'art',
                'Boutiques artisanat',
                'Restaurants gastronomiques',
                'Vie nocturne animée'
            ],
            'economie' => 'Centre économique national - banques, entreprises, commerce international, administration',
            'culture' => 'Capitale culturelle - galeries art, théâtre, musique live, festivals Carnaval',
            'climat' => 'Tropical chaud humide, 23-33°C, pluies avril-juin et août-novembre',
            'acces_daxi' => 'Service DAXI depuis Cap-Haïtien (220 km, 4-5h), vers Jacmel (90 km, 2-3h), Les Cayes (195 km, 4-5h)',
            'quartiers' => 'Pétion-Ville (haut), Delmas, Carrefour, Cité Soleil, Tabarre',
            'importance' => 'Cœur d\'Haïti - toutes institutions nationales, aéroport international'
        ]
    ],
    
    'procedures_detaillees' => [
        'reservation_app' => [
            'titre' => 'Comment réserver via l\'application DAXI',
            'etapes' => [
                '1. Télécharger l\'app DAXI (Play Store ou App Store)',
                '2. Créer compte avec email et numéro téléphone',
                '3. Vérifier compte via code SMS',
                '4. Activer localisation GPS',
                '5. Entrer adresse destination',
                '6. Choisir type de véhicule',
                '7. Voir estimation prix immédiatement',
                '8. Confirmer réservation',
                '9. Suivre chauffeur en temps réel sur carte',
                '10. Recevoir notification arrivée chauffeur'
            ],
            'temps_moyen' => 'Moins de 2 minutes du début à confirmation'
        ],
        'reservation_whatsapp' => [
            'titre' => 'Comment réserver via WhatsApp +50944969696',
            'etapes' => [
                '1. Enregistrer +50944969696 dans contacts',
                '2. Ouvrir WhatsApp',
                '3. Envoyer message avec: Nom, Point départ, Destination, Date/Heure souhaitée, Nombre passagers',
                '4. Agent DAXI répond rapidement (généralement < 5 min)',
                '5. Confirmation prix et disponibilité',
                '6. Confirmation réservation',
                '7. Rappel 30 min avant course',
                '8. Informations chauffeur envoyées'
            ],
            'exemple_message' => 'Bonjour, Jean Pierre, départ Cap-Haïtien centre-ville vers Hinche, demain 8h matin, 3 passagers. Merci!'
        ],
        'reservation_site' => [
            'titre' => 'Comment réserver via www.daxitaxi.com',
            'etapes' => [
                '1. Aller sur www.daxitaxi.com',
                '2. Cliquer "Réserver maintenant"',
                '3. Se connecter ou créer compte',
                '4. Remplir formulaire: départ, arrivée, date, heure, passagers',
                '5. Sélectionner plan ou course simple',
                '6. Voir estimation prix',
                '7. Choisir méthode paiement',
                '8. Confirmer réservation',
                '9. Recevoir email confirmation',
                '10. Recevoir SMS rappel jour de course'
            ],
            'disponibilite' => 'Site accessible 24/7 depuis ordinateur ou téléphone'
        ],
        'paiement_moncash' => [
            'titre' => 'Comment payer avec Moncash',
            'prerequis' => 'Avoir compte Moncash actif avec solde suffisant',
            'etapes' => [
                '1. Choisir option "Moncash" lors réservation',
                '2. Entrer numéro téléphone Moncash',
                '3. Recevoir demande paiement sur app Moncash',
                '4. Vérifier montant',
                '5. Entrer code PIN Moncash',
                '6. Valider paiement',
                '7. Recevoir confirmation SMS',
                '8. Réservation confirmée automatiquement'
            ],
            'securite' => 'Paiement crypté et sécurisé, aucune info bancaire partagée',
            'confirmation' => 'Reçu électronique envoyé immédiatement'
        ],
        'annulation' => [
            'titre' => 'Comment annuler une réservation',
            'delai_gratuit' => 'Annulation gratuite jusqu\'à 5 minutes après réservation',
            'frais' => [
                '5-30 minutes après réservation: 25% du prix',
                '30 min - 2h après: 50% du prix',
                'Plus de 2h après: 75% du prix',
                'Après départ chauffeur: 100% du prix'
            ],
            'methodes' => [
                'Via app: Aller dans "Mes courses" > Cliquer course > "Annuler"',
                'Via WhatsApp: Envoyer "Annuler réservation [numéro]"',
                'Par téléphone: Appeler support +50944969696'
            ],
            'remboursement' => 'Si frais annulation, remboursement sous 3-5 jours ouvrables'
        ]
    ],
    
    'guides_pratiques' => [
        'premier_voyage' => [
            'titre' => 'Guide pour votre première course DAXI',
            'avant' => [
                'Télécharger app et créer compte 24h avant',
                'Vérifier solde paiement (Moncash/cash préparé)',
                'Noter numéro urgence DAXI: +50944969696',
                'Charger téléphone complètement',
                'Activer données mobiles et GPS'
            ],
            'pendant' => [
                'Vérifier identité chauffeur (nom + plaque)',
                'Confirmer destination avant départ',
                'Attacher ceinture sécurité',
                'Suivre trajet sur app',
                'Communiquer avec chauffeur si besoin',
                'Respecter règles courtoisie (pas fumer, ne pas crier)'
            ],
            'apres' => [
                'Vérifier prix correspond estimation',
                'Effectuer paiement',
                'Noter tout objet oublié immédiatement',
                'Évaluer chauffeur honnêtement (aide service)',
                'Demander reçu si besoin',
                'Contacter support si problème'
            ]
        ],
        'voyager_groupes' => [
            'titre' => 'Voyager en groupe avec DAXI',
            'capacites' => [
                'Berline: 4 passagers + bagages légers',
                'SUV: 6 passagers + bagages moyens',
                'Mini-bus: 12-15 passagers + bagages',
                'Bus: 25-40 passagers (sur demande)'
            ],
            'conseils' => [
                'Réserver 24-48h avance pour groupes 6+',
                'Indiquer nombre exact passagers',
                'Préciser quantité bagages',
                'Demander véhicule climatisé si long trajet',
                'Coordonner point rencontre unique',
                'Désigner responsable groupe'
            ],
            'tarifs' => 'Tarifs groupes avantageux - demander devis personnalisé'
        ],
        'bagages_volumineux' => [
            'titre' => 'Voyager avec beaucoup de bagages',
            'limites_standards' => [
                'Berline: 2 valises moyennes + sacs à main',
                'SUV: 4 valises moyennes + sacs',
                'Mini-bus: 8-10 valises + sacs'
            ],
            'procedure' => [
                'Indiquer nombre/taille bagages lors réservation',
                'Demander véhicule adapté si bagages volumineux',
                'Supplément possible pour bagages exceptionnels',
                'Prévoir aide chauffeur pour chargement'
            ],
            'interdits' => 'Produits dangereux, armes, drogues, animaux non autorisés'
        ]
    ],
    
    'problemes_solutions' => [
        'chauffeur_retard' => [
            'probleme' => 'Mon chauffeur est en retard',
            'solutions' => [
                '1. Vérifier position chauffeur sur app (peut être dans embouteillage)',
                '2. Contacter chauffeur directement via app',
                '3. Attendre 10-15 min (trafic imprévisible Haïti)',
                '4. Si retard >20 min, appeler support +50944969696',
                '5. Annulation gratuite si retard >30 min sans justification'
            ]
        ],
        'prix_different' => [
            'probleme' => 'Le prix final diffère de l\'estimation',
            'causes_possibles' => [
                'Détour demandé par client',
                'Route bloquée nécessitant déviation',
                'Arrêt(s) supplémentaire(s)',
                'Temps d\'attente prolongé',
                'Tarif nuit appliqué (après 22h)'
            ],
            'solutions' => [
                'Demander explication détaillée au chauffeur',
                'Vérifier trajet réel sur app vs estimation',
                'Contacter support immédiatement si désaccord',
                'Payer montant initial si différence non justifiée',
                'Support arbitrera litige sous 24h'
            ]
        ],
        'objet_oublie' => [
            'probleme' => 'J\'ai oublié quelque chose dans le taxi',
            'solutions' => [
                '1. Contacter IMMÉDIATEMENT chauffeur via app',
                '2. Décrire objet précisément',
                '3. Si pas de réponse, appeler support +50944969696',
                '4. Donner numéro course et heure',
                '5. Support contactera chauffeur',
                '6. Si objet trouvé, arrangements retour faits',
                '7. Possible frais retour selon distance'
            ],
            'conseil' => 'Toujours vérifier sièges avant descendre!'
        ],
        'probleme_chauffeur' => [
            'probleme' => 'Comportement inapproprié du chauffeur',
            'exemples' => [
                'Conduite dangereuse',
                'Langage inapproprié',
                'Harcèlement',
                'Demande argent supplémentaire',
                'Refus destination',
                'État suspect (alcool/drogue)'
            ],
            'actions_immediates' => [
                'Demander arrêt immédiat si danger',
                'Descendre dans lieu sûr public',
                'Appeler support +50944969696 IMMÉDIATEMENT',
                'Noter numéro plaque et nom chauffeur',
                'Activer enregistrement si possible',
                'Police: 114 si urgence sécurité'
            ],
            'suivi' => [
                'Investigation rapide par DAXI',
                'Chauffeur suspendu pendant enquête',
                'Remboursement complet si plainte fondée',
                'Sanction pouvant aller jusqu\'à licenciement'
            ]
        ],
        'app_bug' => [
            'probleme' => 'L\'application ne fonctionne pas',
            'solutions' => [
                '1. Vérifier connexion internet',
                '2. Activer GPS/localisation',
                '3. Fermer et rouvrir app',
                '4. Vérifier mises à jour app disponibles',
                '5. Redémarrer téléphone',
                '6. Désinstaller et réinstaller app',
                '7. Si problème persiste, réserver via WhatsApp +50944969696',
                '8. Signaler bug à support pour correction'
            ]
        ]
    ],
    
    'conseils_securite' => [
        'avant_course' => [
            'Vérifier identité chauffeur (photo app = personne)',
            'Vérifier plaque véhicule correspond app',
            'Partager détails course avec proche',
            'Charger téléphone avant départ',
            'Avoir crédit téléphone suffisant',
            'Noter numéro urgence: 114 (police), +50944969696 (DAXI)'
        ],
        'pendant_course' => [
            'Suivre trajet sur app',
            'Signaler immédiatement si déviation suspecte',
            'Garder téléphone accessible',
            'Ne pas afficher argent/objets valeur',
            'Rester courtois mais vigilant',
            'Utiliser bouton SOS app si danger',
            'Descendre seulement destination ou lieu sûr'
        ],
        'nuit' => [
            'Privilégier plan Élégance Night (chauffeur formé)',
            'Partager position temps réel avec proche',
            'Rester éveillé et attentif',
            'Éviter quartiers isolés tard',
            'Avoir contact urgence prêt',
            'Rentrer en groupe si possible'
        ],
        'femmes_seules' => [
            'Demander chauffeur féminin si préférence (disponible)',
            'S\'assoir siège arrière',
            'Partager course avec amie via app',
            'Garder conversation téléphone active si inconfort',
            'Ne pas hésiter demander arrêt si malaise',
            'Signaler tout comportement inapproprié immédiatement'
        ]
    ],
    
    'informations_supplementaires' => [
        'statistiques_daxi' => [
            'titre' => 'Statistiques DAXI',
            'data' => [
                'Courses complétées: Plus de 50,000 depuis lancement',
                'Chauffeurs actifs: 200+ à travers Haïti',
                'Villes desservies: 30+ villes principales',
                'Note moyenne: 4.7/5 étoiles',
                'Taux satisfaction: 95% clients satisfaits',
                'Temps réponse moyen: 8 minutes',
                'Véhicules flotte: 150+ véhicules modernes',
                'Support 24/7: Disponible toute l\'année'
            ]
        ],
        'histoire_daxi' => [
            'titre' => 'Histoire de DAXI',
            'fondation' => 'DAXI fondé en 2020 pour révolutionner transport en Haïti',
            'mission' => 'Offrir transport fiable, sécurisé et abordable à tous Haïtiens',
            'vision' => 'Devenir leader transport Caraïbes avec service excellence',
            'valeurs' => [
                'Sécurité: Priorité absolue chauffeurs et passagers',
                'Fiabilité: Service ponctuel et constant',
                'Innovation: Technologie moderne accessible',
                'Communauté: Soutien économie locale',
                'Transparence: Prix clairs sans frais cachés'
            ]
        ],
        'avantages_daxi' => [
            'titre' => 'Pourquoi choisir DAXI?',
            'raisons' => [
                '1. Prix fixes et transparents connus avant réservation',
                '2. Chauffeurs professionnels vérifiés et formés',
                '3. Véhicules modernes entretenus régulièrement',
                '4. Support client 24/7 en créole, français, anglais',
                '5. Application mobile facile à utiliser',
                '6. Paiement flexible: cash, Moncash, Natcash',
                '7. Traçabilité GPS complète pour sécurité',
                '8. Annulation gratuite sous conditions',
                '9. Programme fidélité avec réductions',
                '10. Couverture nationale - toutes villes Haïti'
            ]
        ],
        'programme_fidelite' => [
            'titre' => 'Programme Fidélité DAXI Rewards',
            'fonctionnement' => 'Gagnez points à chaque course, échangez contre réductions',
            'taux' => '1 dollar dépensé = 1 point gagné',
            'niveaux' => [
                'Bronze (0-500 pts): 5% réduction courses',
                'Argent (501-1500 pts): 10% réduction + priorité support',
                'Or (1501-3000 pts): 15% réduction + chauffeur dédié + upgrade gratuit',
                'Platine (3001+ pts): 20% réduction + accès VIP + concierge personnel'
            ],
            'avantages_immediats' => [
                'Anniversaire: course gratuite jusqu\'à 50$',
                'Parrainage: 20$ bonus parrain et filleul',
                'Courses groupées: 3ème course -50%',
                'Réservation avance: -10% si réservation 48h+',
                'Hors-pointe: -15% courses 10h-15h lun-ven'
            ]
        ],
        'partenariats' => [
            'titre' => 'Partenaires DAXI',
            'hotels' => [
                'Hôtel Mont Joli Cap-Haïtien: -15% courses aéroport',
                'Royal Decameron Indigo: navette gratuite clients',
                'Best Western Port-au-Prince: tarif corporate'
            ],
            'entreprises' => [
                'Digicel: paiement via compte Digicel',
                'Natcom: recharge forfait = points DAXI',
                'Banques: Unibank, Sogebank - paiement carte'
            ],
            'restaurants' => [
                'Plus de 50 restaurants partenaires',
                'Livraison repas via DAXI Delivery',
                'Réduction clients DAXI réguliers'
            ]
        ],
        'formations_chauffeurs' => [
            'titre' => 'Formation Chauffeurs DAXI',
            'duree' => '2 semaines formation intensive',
            'modules' => [
                'Conduite défensive et sécurité routière',
                'Service client excellence',
                'Premiers secours et gestion urgences',
                'Connaissance géographique Haïti',
                'Utilisation app et GPS',
                'Langues: créole, français, anglais de base',
                'Mécanique basique et maintenance',
                'Gestion conflits et situations difficiles'
            ],
            'certification' => 'Examen pratique et théorique obligatoire',
            'renouvellement' => 'Formation continue tous les 6 mois'
        ],
        'assurances' => [
            'titre' => 'Assurances et Garanties',
            'vehicules' => 'Tous véhicules assurés tous risques',
            'passagers' => 'Assurance passagers incluse automatiquement',
            'bagages' => 'Responsabilité civile pour bagages jusqu\'à 500$ par passager',
            'accidents' => 'Couverture médicale immédiate en cas accident',
            'garanties' => [
                'Garantie ponctualité: remboursement si retard >30 min',
                'Garantie prix: si course finale >20% estimation, différence remboursée',
                'Garantie propreté: véhicule sale = course gratuite',
                'Garantie satisfaction: réclamation traitée sous 24h'
            ]
        ],
        'technologie' => [
            'titre' => 'Technologie DAXI',
            'app_features' => [
                'GPS temps réel haute précision',
                'Algorithme matching intelligent chauffeur-client',
                'Calcul prix dynamique basé trafic',
                'Machine learning prédiction demande',
                'Chatbot IA support automatique',
                'Reconnaissance vocale commandes',
                'Mode hors-ligne réservation basique',
                'Intégration calendrier réservations futures'
            ],
            'securite_donnees' => [
                'Cryptage SSL/TLS toutes communications',
                'Données personnelles protégées RGPD',
                'Serveurs sécurisés redondants',
                'Backup quotidien automatique',
                'Aucune vente données tiers',
                'Droit suppression compte et données'
            ]
        ],
        'impact_social' => [
            'titre' => 'Impact Social DAXI',
            'emplois' => '200+ emplois directs chauffeurs + 50 emplois indirects',
            'femmes' => '30% chauffeurs sont des femmes',
            'formation' => 'Programme formation gratuite jeunes sans emploi',
            'environnement' => [
                'Promotion covoiturage réduire émissions',
                'Transition progressive vers véhicules électriques',
                'Compensation carbone via reforestation'
            ],
            'communaute' => [
                'Partenariat écoles: transport scolaire tarif réduit',
                'Support ONG: transport humanitaire gratuit urgences',
                'Programme handicap: véhicules adaptés disponibles'
            ]
        ],
        'expansions_futures' => [
            'titre' => 'Projets Futurs DAXI',
            '2024' => [
                'Lancement DAXI Delivery (livraison colis et repas)',
                'DAXI Business (compte entreprise avec facturation)',
                'DAXI Moto (transport rapide moto-taxi villes)',
                'DAXI Medical (transport ambulancier non-urgent)'
            ],
            '2025' => [
                'Expansion République Dominicaine (transfrontalier)',
                'Flotte véhicules électriques (50 véhicules)',
                'DAXI Kids (transport scolaire sécurisé)',
                'DAXI Cargo (transport marchandises)'
            ]
        ]
    ]
];


function getSiteContext() {
    $context = "=== BASE DE CONNAISSANCES COMPLÈTE DAXI ===\n\n";
    
    
    $context .= "📋 NOS 5 PLANS DE SERVICES :\n\n";
    foreach (SITE_KNOWLEDGE['plans'] as $i => $plan) {
        $context .= ($i + 1) . ". {$plan['nom']}";
        if (isset($plan['nom_kreyol'])) $context .= " ({$plan['nom_kreyol']})";
        $context .= "\n";
        if (isset($plan['duree'])) $context .= "   Durée: {$plan['duree']}\n";
        $context .= "   Prix: {$plan['prix']}\n";
        $context .= "   " . $plan['description'] . "\n";
        if (isset($plan['inclus'])) {
            $context .= "   Inclus:\n";
            foreach ($plan['inclus'] as $item) {
                $context .= "   • $item\n";
            }
        }
        if (isset($plan['avantages'])) {
            $context .= "   Avantages VIP:\n";
            foreach ($plan['avantages'] as $avantage) {
                $context .= "   • $avantage\n";
            }
        }
        $context .= "\n";
    }
    
    
    $context .= "🗺️ ITINÉRAIRES DISPONIBLES :\n";
    foreach (SITE_KNOWLEDGE['itineraires_frequents'] as $route) {
        $context .= "• {$route['de']} → {$route['vers']}: {$route['distance']} ({$route['duree']})\n";
    }
    $context .= "\n";
    
    
    $context .= "🏙️ VILLES DESSERVIES (DÉTAILS COMPLETS) :\n\n";
    foreach (SITE_KNOWLEDGE['villes_detaillees'] as $ville => $infos) {
        $context .= "━━━ $ville ━━━\n";
        $context .= "Région: {$infos['region']}\n";
        $context .= "Population: {$infos['population']}\n";
        $context .= "Description: {$infos['description']}\n";
        if (isset($infos['attractions'])) {
            $context .= "Attractions: " . implode(' | ', array_slice($infos['attractions'], 0, 5)) . "\n";
        }
        $context .= "Accès DAXI: {$infos['acces_daxi']}\n";
        $context .= "\n";
    }
    
    
    $context .= "🚖 SERVICES DÉTAILLÉS :\n";
    $context .= "Réservation: " . implode(', ', SITE_KNOWLEDGE['services']['reservation']['methodes']) . "\n";
    $context .= "Paiement: " . implode(', ', SITE_KNOWLEDGE['services']['paiement']['methodes_acceptees']) . "\n";
    $context .= "Véhicules: " . implode(', ', SITE_KNOWLEDGE['services']['vehicules']['types']) . "\n\n";
    
    
    $context .= "📍 ZONES COUVERTES :\n";
    foreach (SITE_KNOWLEDGE['services']['zones_couverture'] as $region => $villes) {
        if ($region !== 'note' && is_array($villes)) {
            $context .= "• $region: " . implode(', ', $villes) . "\n";
        }
    }
    $context .= "⚠️ Service disponible dans TOUTES les villes d'Haïti\n\n";
    
    
    $context .= "📖 PROCÉDURES COMPLÈTES :\n\n";
    foreach (SITE_KNOWLEDGE['procedures_detaillees'] as $procedure => $details) {
        $context .= "• {$details['titre']}\n";
        if (isset($details['etapes'])) {
            $context .= "  Étapes: " . implode(' → ', array_slice($details['etapes'], 0, 3)) . "...\n";
        }
    }
    $context .= "\n";
    
    
    $context .= "📚 GUIDES PRATIQUES :\n";
    $context .= "• Premier voyage DAXI: conseils avant/pendant/après\n";
    $context .= "• Voyages en groupe: capacités et tarifs\n";
    $context .= "• Bagages volumineux: limites et procédures\n\n";
    
    
    $context .= "🔧 SOLUTIONS AUX PROBLÈMES COURANTS :\n";
    foreach (SITE_KNOWLEDGE['problemes_solutions'] as $probleme => $details) {
        $context .= "• {$details['probleme']}\n";
    }
    $context .= "\n";
    
    
    $context .= "🛡️ CONSEILS SÉCURITÉ :\n";
    $context .= "• Avant course: vérifications identité et partage infos\n";
    $context .= "• Pendant course: vigilance et suivi trajet\n";
    $context .= "• Nuit: précautions spéciales avec plan Élégance Night\n";
    $context .= "• Femmes seules: options chauffeur féminin disponible\n\n";
    
    
    $context .= "🚖 SERVICES DÉTAILLÉS :\n";
    $context .= "Réservation: " . implode(', ', SITE_KNOWLEDGE['services']['reservation']['methodes']) . "\n";
    $context .= "Paiement: " . implode(', ', SITE_KNOWLEDGE['services']['paiement']['methodes_acceptees']) . "\n";
    $context .= "Véhicules: " . implode(', ', SITE_KNOWLEDGE['services']['vehicules']['types']) . "\n\n";
    
    
    $context .= "📍 ZONES COUVERTES :\n";
    foreach (SITE_KNOWLEDGE['services']['zones_couverture'] as $region => $villes) {
        if ($region !== 'note' && is_array($villes)) {
            $context .= "• $region: " . implode(', ', $villes) . "\n";
        }
    }
    $context .= "⚠️ Service disponible dans TOUTES les villes d'Haïti\n\n";
    
    
    $context .= "📞 CONTACT :\n";
    $context .= "• WhatsApp: {$SITE_KNOWLEDGE['contact']['whatsapp']}\n";
    $context .= "• Email: {$SITE_KNOWLEDGE['contact']['email']}\n";
    $context .= "• Site: {$SITE_KNOWLEDGE['contact']['site_web']}\n";
    $context .= "• Support: {$SITE_KNOWLEDGE['contact']['support_hours']}\n\n";
    
    
    $context .= "📱 FONCTIONNALITÉS APP :\n";
    foreach (SITE_KNOWLEDGE['fonctionnalites_app'] as $feature) {
        $context .= "• $feature\n";
    }
    $context .= "\n";
    
    
    $context .= "💰 TARIFICATION :\n";
    $context .= "• Calcul basé sur: " . implode(', ', SITE_KNOWLEDGE['tarification']['calcul']) . "\n";
    $context .= "• {$SITE_KNOWLEDGE['tarification']['estimation']}\n";
    $context .= "• {$SITE_KNOWLEDGE['tarification']['transparence']}\n\n";
    
    
    $context .= "❓ QUESTIONS FRÉQUENTES :\n";
    foreach (SITE_KNOWLEDGE['faq'] as $question => $reponse) {
        $context .= "Q: $question\n";
        $context .= "R: $reponse\n\n";
    }
    
    $context .= "\n⚠️ IMPORTANT: Tu as accès à TOUTES ces informations détaillées. ";
    $context .= "Utilise-les pour répondre avec précision. Si client demande info sur ville, ";
    $context .= "donne détails complets (attractions, histoire, climat). Si problème, ";
    $context .= "donne solutions étape par étape. Tu es l'expert DAXI absolu!\n";
    
    return $context;
}


function getUserContext($userId) {
    if (!$userId || strpos($userId, 'guest') === 0) {
        return "Client invité (non connecté)";
    }
    
    
    $userData = getUserData($userId);
    if (!$userData) {
        return "Client non trouvé dans la base de données";
    }
    
    $context = "";
    
    
    if (isset($userData['nom']) && !empty($userData['nom'])) {
        $nom = $userData['nom'];
        $context .= "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
        $context .= "🔹 VOUS PARLEZ AVEC: $nom\n";
        $context .= "🔹 NOM DU CLIENT: $nom\n";
        $context .= "🔹 APPELEZ-LE PAR SON NOM: $nom\n";
        $context .= "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";
    }
    
    $context .= "=== INFORMATIONS CLIENT ===\n\n";
    $context .= "👤 Nom: " . ($userData['nom'] ?? 'Non renseigné') . "\n";
    $context .= "📧 Email: " . ($userData['email'] ?? 'Non renseigné') . "\n";
    $context .= "📱 Téléphone: " . ($userData['telephone'] ?? 'Non renseigné') . "\n";
    
    
    $orders = getUserOrders($userId, 10);
    if (!empty($orders)) {
        $context .= "\n📦 COMMANDES RÉCENTES :\n";
        $completed = 0;
        $pending = 0;
        $cancelled = 0;
        
        foreach ($orders as $order) {
            $status = $order['statut'] ?? 'inconnu';
            if ($status === 'termine') $completed++;
            elseif ($status === 'en_attente') $pending++;
            elseif ($status === 'annule') $cancelled++;
        }
        
        $context .= "• Terminées: $completed\n";
        $context .= "• En attente: $pending\n";
        $context .= "• Annulées: $cancelled\n";
        $context .= "• Total: " . count($orders) . "\n";
        
        
        if (!empty($orders[0])) {
            $lastOrder = $orders[0];
            $context .= "\n🚕 DERNIÈRE COURSE :\n";
            $context .= "• De: " . ($lastOrder['depart'] ?? 'N/A') . "\n";
            $context .= "• Vers: " . ($lastOrder['destination'] ?? 'N/A') . "\n";
            $context .= "• Statut: " . ($lastOrder['statut'] ?? 'N/A') . "\n";
            $context .= "• Date: " . date('d/m/Y H:i', $lastOrder['timestamp'] ?? time()) . "\n";
        }
    } else {
        $context .= "\n📦 Aucune commande trouvée\n";
    }
    
    if (isset($userData['nom']) && !empty($userData['nom'])) {
        $context .= "\n⚠️ IMPORTANT: Utilisez son nom ({$userData['nom']}) dans vos réponses pour personnaliser la conversation!\n";
    }
    
    return $context;
}
