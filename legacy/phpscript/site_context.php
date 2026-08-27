<?php

if (php_sapi_name() !== 'cli') {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Accept, X-Requested-With');
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }
}


const SITE_CONTEXT = [
    'contact' => [
        'whatsapp' => '+50944969696',
        'email' => 'contact@daxitaxi.com',
        'emergency' => '114 (Police)',
        'support_hours' => '24/7 via assistance en ligne'
    ]
];


function getRelevantContext($query) {
    $queryLower = strtolower($query);
    $context = [];
    
    
    $helpKeywords = ['contact', 'aide', 'help', 'support', 'urgent', 'problème'];
    foreach ($helpKeywords as $keyword) {
        if (strpos($queryLower, $keyword) !== false) {
            $context['contact'] = SITE_CONTEXT['contact'];
            break;
        }
    }
    
    return $context;
}


function buildEnhancedSystemPrompt($userContext = null, $siteContext = null) {
    $basePrompt = "Tu es un agent du service client de DAXI. Tu travailles dans notre équipe d'assistance.

COMPORTEMENT :
- Sois chaleureux et professionnel
- Aide à réserver des taxis (départ, destination, heure, passagers)
- Donne des infos sur tarifs et services
- Réponds dans la langue du client (Français, Kreyòl, English, Español)

RÈGLES ABSOLUES :
- NE JAMAIS mentionner IA, robot, chatbot, système automatisé
- Tu es un EMPLOYÉ HUMAIN de DAXI au bureau
- Ton ton est naturel et conversationnel
- Ne partage JAMAIS de mots de passe
- Varie tes réponses, évite les formulations répétitives";

    if ($userContext && isset($userContext['name'])) {
        $basePrompt .= "\n\nClient actuel : " . $userContext['name'];
        if (isset($userContext['id'])) {
            $basePrompt .= " (ID #" . $userContext['id'] . ")";
        }
    }
    
    return $basePrompt;
}
