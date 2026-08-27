<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

require_once 'firebase_config.php';


$input = json_decode(file_get_contents('php://input'), true);
$email = isset($input['email']) ? trim($input['email']) : '';
$code = isset($input['code']) ? trim($input['code']) : '';


if (empty($email) || empty($code)) {
    echo json_encode(['success' => false, 'message' => 'Email et code requis']);
    exit;
}

    
    if (isset($resetData['used']) && $resetData['used'] === true) {
        echo json_encode(['success' => false, 'message' => 'Ce code a déjà été utilisé']);
        exit;
    }
    
    
    if (!isset($resetData['code']) || $resetData['code'] !== $code) {
        echo json_encode(['success' => false, 'message' => 'Code incorrect']);
        exit;
    }
    
    
    $currentTime = time() * 1000;
    if ($currentTime > $resetData['expiresAt']) {
        firebase_delete('password_reset_codes/' . $email);
        echo json_encode(['success' => false, 'message' => 'Code expiré']);
        exit;
    }
    
    
    firebase_update('password_reset_codes/' . $email, ['verified' => true]);
    
    
    $currentTime = time() * 1000;
    if ($currentTime > $resetData['expiresAt']) {
        
        $resetCodesRef->remove();
        echo json_encode(['success' => false, 'message' => 'Code expiré. Demandez un nouveau code.']);
        exit;
    }
    
    
    $attempts = isset($resetData['attempts']) ? $resetData['attempts'] : 0;
    if ($attempts >= 3) {
        
        $resetCodesRef->remove();
        echo json_encode(['success' => false, 'message' => 'Trop de tentatives. Demandez un nouveau code.']);
        exit;
    }
    
    
    if ($code !== $resetData['code']) {
        
        $resetCodesRef->update(['attempts' => $attempts + 1]);
        
        $remainingAttempts = 2 - $attempts;
        echo json_encode([
            'success' => false, 
            'message' => 'Code incorrect. ' . $remainingAttempts . ' tentative(s) restante(s)'
        ]);
        exit;
    }
    
    
    $resetCodesRef->update(['verified' => true]);
    
    echo json_encode([
        'success' => true,
        'message' => 'Code vérifié avec succès',
        'userId' => $resetData['userId']
    ]);
    
} catch (Exception $e) {
    error_log('Verify reset code error: ' . $e->getMessage());
    echo json_encode([
        'success' => false,
        'message' => 'Erreur serveur. Veuillez réessayer.'
    ]);
}
?>
