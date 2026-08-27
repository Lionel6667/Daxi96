<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

require_once 'firebase_config.php';


$input = json_decode(file_get_contents('php://input'), true);
$email = isset($input['email']) ? trim($input['email']) : '';
$newPassword = isset($input['newPassword']) ? $input['newPassword'] : '';


if (empty($email) || empty($newPassword)) {
    echo json_encode(['success' => false, 'message' => 'Email et mot de passe requis']);
    exit;
}

if (strlen($newPassword) < 6) {
    echo json_encode(['success' => false, 'message' => 'Le mot de passe doit contenir au moins 6 caractères']);
    exit;
}

try {
    
    $resetData = firebase_get('password_reset_codes/' . $email);
    if (!$resetData) {
        echo json_encode(['success' => false, 'message' => 'Session de réinitialisation invalide']);
        exit;
    }
    
    if (!isset($resetData['verified']) || $resetData['verified'] !== true) {
        echo json_encode(['success' => false, 'message' => 'Code non vérifié']);
        exit;
    }
    
    
    if (isset($resetData['used']) && $resetData['used'] === true) {
        echo json_encode(['success' => false, 'message' => 'Ce code a déjà été utilisé']);
        exit;
    }
    
    $currentTime = time() * 1000;
    if ($currentTime > $resetData['expiresAt']) {
        firebase_delete('password_reset_codes/' . $email);
        echo json_encode(['success' => false, 'message' => 'Session expirée']);
        exit;
    }
    
    $userKey = $resetData['userKey'];
    $userData = firebase_get('save_member/' . $userKey);
    
    if (!$userData) {
        echo json_encode(['success' => false, 'message' => 'Utilisateur introuvable']);
        exit;
    }
    
    firebase_update('save_member/' . $userKey, [
        'password' => $newPassword,
        'password_updated_at' => date('Y-m-d H:i:s')
    ]);
    
    firebase_update('password_reset_codes/' . $email, ['used' => true]);
    
    
    
    
    
    $to = $email;
    $subject = 'Mot de passe réinitialisé - Julmin Taxis';
    
    $htmlMessage = '
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #4ade80, #22c55e); padding: 30px; text-align: center; }
            .header h1 { color: white; margin: 0; font-size: 24px; }
            .content { padding: 40px 30px; }
            .success-icon { text-align: center; font-size: 64px; color: #22c55e; margin: 20px 0; }
            .info { background: #d1fae5; border-left: 4px solid #22c55e; padding: 15px; margin: 20px 0; }
            .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; }
            .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>✅ Mot de passe réinitialisé</h1>
            </div>
            <div class="content">
                <div class="success-icon">🎉</div>
                
                <p>Bonjour <strong>' . htmlspecialchars($userData['prenom'] . ' ' . $userData['nom']) . '</strong>,</p>
                
                <div class="info">
                    ✅ Votre mot de passe a été réinitialisé avec succès !
                </div>
                
                <p>Vous pouvez maintenant vous connecter à votre compte Julmin Taxis avec votre nouveau mot de passe.</p>
                
                <div class="warning">
                    ⚠️ <strong>Si vous n\'avez pas effectué cette action,</strong> contactez-nous immédiatement. Votre compte pourrait être compromis.
                </div>
                
                <p><strong>Conseils de sécurité :</strong></p>
                <ul>
                    <li>Utilisez un mot de passe unique pour chaque service</li>
                    <li>Changez votre mot de passe régulièrement</li>
                    <li>Ne partagez jamais votre mot de passe</li>
                    <li>Activez la vérification en deux étapes si disponible</li>
                </ul>
                
                <p>Date de réinitialisation : <strong>' . date('d/m/Y à H:i') . '</strong></p>
            </div>
            <div class="footer">
                <p>Cet email a été envoyé automatiquement par Julmin Taxis</p>
                <p>© ' . date('Y') . ' Julmin Taxis - Tous droits réservés</p>
            </div>
        </div>
    </body>
    </html>
    ';
    
    $headers = "MIME-Version: 1.0\r\n";
    $headers .= "Content-type: text/html; charset=utf-8\r\n";
    $headers .= "From: Julmin Taxis <noreply@julmintaxis.com>\r\n";
    
    mail($to, $subject, $htmlMessage, $headers);
    
    echo json_encode([
        'success' => true,
        'message' => 'Mot de passe réinitialisé avec succès'
    ]);
    
} catch (Exception $e) {
    error_log('Update password error: ' . $e->getMessage());
    echo json_encode([
        'success' => false,
        'message' => 'Erreur lors de la mise à jour. Veuillez réessayer.'
    ]);
}
?>
