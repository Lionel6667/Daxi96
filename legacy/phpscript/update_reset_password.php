<?php

if (php_sapi_name() !== 'cli') {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Accept, X-Requested-With');
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }
}
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}


define('FIREBASE_URL', 'https://julmin-taxis-default-rtdb.firebaseio.com');


$input = json_decode(file_get_contents('php://input'), true);
$email = isset($input['email']) ? trim($input['email']) : '';
$newPassword = isset($input['newPassword']) ? $input['newPassword'] : '';

error_log("Update password request for email: $email");


if (empty($email) || empty($newPassword)) {
    echo json_encode(['success' => false, 'message' => 'Email et mot de passe requis']);
    exit;
}

if (strlen($newPassword) < 6) {
    echo json_encode(['success' => false, 'message' => 'Le mot de passe doit contenir au moins 6 caractères']);
    exit;
}

try {
    
    $emailKey = str_replace(['.', '@', '#', '$', '[', ']'], '_', $email);
    $url = FIREBASE_URL . '/password_reset_codes/' . $emailKey . '.json';
    
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_TIMEOUT => 10
    ]);
    
    $response = curl_exec($ch);
    curl_close($ch);
    
    if (empty($response) || $response === 'null') {
        echo json_encode(['success' => false, 'message' => 'Session de réinitialisation invalide']);
        exit;
    }
    
    $resetData = json_decode($response, true);
    
    
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
        
        $emailKey = str_replace(['.', '@', '#', '$', '[', ']'], '_', $email);
        $url = FIREBASE_URL . '/password_reset_codes/' . $emailKey . '.json';
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => 'DELETE',
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_SSL_VERIFYPEER => false
        ]);
        curl_exec($ch);
        curl_close($ch);
        
        echo json_encode(['success' => false, 'message' => 'Session expirée']);
        exit;
    }
    
    
    $userKey = $resetData['userKey'];
    $url = FIREBASE_URL . '/save_member/' . $userKey . '.json';
    
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_TIMEOUT => 10
    ]);
    
    $response = curl_exec($ch);
    curl_close($ch);
    
    $userData = json_decode($response, true);
    
    if (!$userData) {
        echo json_encode(['success' => false, 'message' => 'Utilisateur introuvable']);
        exit;
    }
    
    
    $userData['password'] = $newPassword;
    $userData['password_updated_at'] = date('Y-m-d H:i:s');
    
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => 'PUT',
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode($userData),
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_TIMEOUT => 10
    ]);
    
    curl_exec($ch);
    curl_close($ch);
    
    error_log("Password updated successfully for email: $email");
    
    
    $resetData['used'] = true;
    
    $emailKey = str_replace(['.', '@', '#', '$', '[', ']'], '_', $email);
    $url = FIREBASE_URL . '/password_reset_codes/' . $emailKey . '.json';
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => 'PUT',
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode($resetData),
        CURLOPT_SSL_VERIFYPEER => false
    ]);
    curl_exec($ch);
    curl_close($ch);
    
    
    $userName = $userData['prenom'] . ' ' . $userData['nom'];
    $to = $email;
    $subject = 'Mot de passe réinitialisé - Julmin Taxis';
    
    $message = '<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 10px; overflow: hidden;">
                    <tr>
                        <td style="background: linear-gradient(135deg, #4ade80, #22c55e); padding: 30px; text-align: center;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 28px;">✅ Mot de passe réinitialisé</h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 40px 30px;">
                            <p style="margin: 0 0 20px; color: #333333; font-size: 16px;">Bonjour <strong>' . htmlspecialchars($userName) . '</strong>,</p>
                            <p style="margin: 0 0 20px; color: #666666; font-size: 14px;">Votre mot de passe a été réinitialisé avec succès ! Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.</p>
                            <p style="margin: 20px 0; padding: 15px; background-color: #fef3c7; border-left: 4px solid #f59e0b; color: #92400e; font-size: 14px;">⚠️ Si vous n\'avez pas effectué cette action, contactez-nous immédiatement.</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 20px; background-color: #f8f9fa; text-align: center;">
                            <p style="margin: 0; color: #999999; font-size: 12px;">© ' . date('Y') . ' Julmin Taxis</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>';
    
    $headers = "MIME-Version: 1.0\r\n";
    $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
    $headers .= "From: Julmin Taxis <noreply@julmintaxis.com>\r\n";
    
    @mail($to, $subject, $message, $headers);
    
    echo json_encode([
        'success' => true,
        'message' => 'Mot de passe réinitialisé avec succès'
    ]);
    
} catch (Exception $e) {
    error_log('Update password error: ' . $e->getMessage());
    echo json_encode([
        'success' => false,
        'message' => 'Erreur lors de la mise à jour'
    ]);
}
?>
