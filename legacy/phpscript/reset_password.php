<?php
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


if (empty($email)) {
    echo json_encode(['success' => false, 'message' => 'Email requis']);
    exit;
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    echo json_encode(['success' => false, 'message' => 'Email invalide']);
    exit;
}

try {
    
    $url = FIREBASE_URL . '/save_member.json?orderBy="email"&equalTo="' . urlencode($email) . '"';
    
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_TIMEOUT => 10
    ]);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($httpCode !== 200) {
        echo json_encode([
            'success' => false, 
            'message' => 'Erreur de connexion à la base de données'
        ]);
        exit;
    }
    
    $users = json_decode($response, true);
    
    if (empty($users) || $users === null) {
        echo json_encode([
            'success' => false, 
            'message' => 'Aucun compte trouvé avec cet email. Veuillez créer un compte d\'abord.',
            'action' => 'signup'
        ]);
        exit;
    }
    
    
    $userData = null;
    $userKey = null;
    
    foreach ($users as $key => $user) {
        $userData = $user;
        $userKey = $key;
        break;
    }
    
    
    $code = str_pad(mt_rand(0, 999999), 6, '0', STR_PAD_LEFT);
    
    
    $resetData = [
        'code' => $code,
        'userId' => $userData['userId'],
        'userKey' => $userKey,
        'createdAt' => time() * 1000,
        'expiresAt' => (time() + 900) * 1000, 
        'attempts' => 0,
        'used' => false
    ];
    
    $url = FIREBASE_URL . '/password_reset_codes/' . urlencode($email) . '.json';
    
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => 'PUT',
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode($resetData),
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_TIMEOUT => 10
    ]);
    
    $response = curl_exec($ch);
    curl_close($ch);
    
    
    $to = $email;
    $subject = 'Code de réinitialisation - Julmin Taxis';
    $userName = $userData['prenom'] . ' ' . $userData['nom'];
    
    
    $htmlMessage = '<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; padding: 20px;">
    <div style="max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 10px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #FFD700, #FFA500); padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">🔐 Réinitialisation</h1>
        </div>
        <div style="padding: 30px; background: #f9f9f9;">
            <p>Bonjour <strong>' . htmlspecialchars($userName) . '</strong>,</p>
            <p>Votre code de réinitialisation :</p>
            <div style="background: white; border: 2px dashed #FFD700; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
                <div style="font-size: 32px; font-weight: bold; color: #FFA500; letter-spacing: 8px;">' . $code . '</div>
            </div>
            <p style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 10px;">
                ⏰ Ce code expire dans 15 minutes.
            </p>
            <p style="color: #666; font-size: 12px; margin-top: 30px;">
                Julmin Taxis © ' . date('Y') . '
            </p>
        </div>
    </div>
</body>
</html>';
    
    
    $headers = "MIME-Version: 1.0\r\n";
    $headers .= "Content-type: text/html; charset=UTF-8\r\n";
    $headers .= "From: Julmin Taxis <noreply@julmintaxis.com>\r\n";
    
    
    $mailSent = @mail($to, $subject, $htmlMessage, $headers);
    
    
    echo json_encode([
        'success' => true,
        'message' => 'Code généré avec succès',
        'emailSent' => $mailSent
    ]);
    
} catch (Exception $e) {
    error_log('Reset password error: ' . $e->getMessage());
    echo json_encode([
        'success' => false,
        'message' => 'Erreur serveur. Veuillez réessayer.'
    ]);
}
?>
