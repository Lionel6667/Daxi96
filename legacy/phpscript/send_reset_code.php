<?php
error_reporting(E_ALL);
ini_set('display_errors', 0);


header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Accept, X-Requested-With, Authorization');
header('Access-Control-Max-Age: 3600');
header('Cache-Control: no-cache, no-store, must-revalidate');


if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}


if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method Not Allowed. Only POST is accepted.']);
    exit;
}

require_once 'config_smtp.php';
require 'PHPMailer/src/Exception.php';
require 'PHPMailer/src/PHPMailer.php';
require 'PHPMailer/src/SMTP.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;


define('FIREBASE_URL', 'https://julmin-taxis-default-rtdb.firebaseio.com');


$input = json_decode(file_get_contents('php://input'), true);
$email = isset($input['email']) ? trim($input['email']) : '';


error_log("Reset code request for email: " . $email);


if (empty($email)) {
    echo json_encode(['success' => false, 'message' => 'Email requis']);
    exit;
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    echo json_encode(['success' => false, 'message' => 'Email invalide']);
    exit;
}

try {
    
    $url = FIREBASE_URL . '/save_member.json';
    
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_TIMEOUT => 10
    ]);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($httpCode !== 200 || empty($response)) {
        echo json_encode([
            'success' => false, 
            'message' => 'Erreur de connexion à la base de données'
        ]);
        exit;
    }
    
    $allUsers = json_decode($response, true);
    
    if (empty($allUsers)) {
        echo json_encode([
            'success' => false, 
            'message' => 'Base de données vide'
        ]);
        exit;
    }
    
    
    $userData = null;
    $userKey = null;
    
    foreach ($allUsers as $key => $user) {
        if (isset($user['email']) && $user['email'] === $email) {
            $userData = $user;
            $userKey = $key;
            break;
        }
    }
    
    if (!$userData) {
        echo json_encode([
            'success' => false, 
            'message' => 'Aucun compte trouvé avec cet email. Veuillez créer un compte d\'abord.',
            'action' => 'signup'
        ]);
        exit;
    }
    
    error_log("User found: " . $userData['userId']);
    
    
    $code = str_pad(mt_rand(0, 999999), 6, '0', STR_PAD_LEFT);
    error_log("Generated code: " . $code);
    
    
    $resetData = [
        'code' => $code,
        'userId' => $userData['userId'],
        'userKey' => $userKey,
        'createdAt' => time() * 1000,
        'expiresAt' => (time() + 900) * 1000, 
        'attempts' => 0,
        'used' => false
    ];
    
    $emailKey = str_replace(['.', '@', '#', '$', '[', ']'], '_', $email);
    $url = FIREBASE_URL . '/password_reset_codes/' . $emailKey . '.json';
    
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => 'PUT',
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode($resetData),
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_TIMEOUT => 10
    ]);
    
    $saveResponse = curl_exec($ch);
    curl_close($ch);
    
    error_log("Code saved to Firebase");
    
    
    $mail = new PHPMailer(true);
    
    try {
        
        $mail->isSMTP();
        $mail->Host = SMTP_HOST;
        $mail->SMTPAuth = true;
        $mail->Username = SMTP_USERNAME;
        $mail->Password = SMTP_PASSWORD;
        $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Port = SMTP_PORT;
        $mail->SMTPOptions = array('ssl' => array('verify_peer' => false, 'verify_peer_name' => false, 'allow_self_signed' => true));
        
        
        $mail->setFrom(FROM_EMAIL, FROM_NAME);
        $mail->addAddress($email);
        $mail->isHTML(true);
        $mail->CharSet = 'UTF-8';
        $mail->Subject = 'Code de réinitialisation - Daxi';
        
        $userName = $userData['prenom'] . ' ' . $userData['nom'];
        
        
        $mail->Body = '<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica Neue,Arial,sans-serif;background-color:#f0f2f5">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f2f5;padding:50px 20px">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color:#fff;border-radius:20px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,0.12)">
                    <tr>
                        <td style="background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 50%,#d946ef 100%);padding:50px 40px;text-align:center">
                            <h1 style="margin:0;color:#fff;font-size:42px;font-weight:800;letter-spacing:2px;text-shadow:0 2px 10px rgba(0,0,0,0.2)">DAXI</h1>
                            <p style="margin:12px 0 0 0;color:rgba(255,255,255,0.95);font-size:17px;font-weight:500;letter-spacing:0.5px">Votre partenaire de transport en Haiti</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:50px 40px">
                            <h2 style="margin:0 0 24px 0;color:#1f2937;font-size:26px;font-weight:700;letter-spacing:-0.5px">Réinitialisation de mot de passe</h2>
                            <p style="margin:0 0 35px 0;color:#4b5563;font-size:16px;line-height:1.7">Bonjour <strong>' . htmlspecialchars($userName) . '</strong>,<br><br>Nous avons reçu une demande de réinitialisation de mot de passe pour votre compte <strong style="color:#6366f1">Daxi</strong>. Utilisez le code ci-dessous pour continuer:</p>
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td align="center" style="padding:35px 0">
                                        <table cellpadding="0" cellspacing="0" style="background:#fff;border:3px solid #6366f1;border-radius:16px;padding:35px 50px;box-shadow:0 8px 24px rgba(99,102,241,0.15)">
                                            <tr>
                                                <td align="center">
                                                    <p style="margin:0 0 12px 0;color:#6b7280;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:1.5px">Code de réinitialisation</p>
                                                    <div style="font-size:52px;font-weight:800;color:#6366f1;letter-spacing:12px;font-family:Courier New,Consolas,monospace;text-shadow:0 2px 4px rgba(99,102,241,0.1)">' . htmlspecialchars($code) . '</div>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                            <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:20px;border-radius:8px;margin:30px 0">
                                <p style="margin:0;color:#92400e;font-size:14px;line-height:1.6"><strong style="color:#b45309">⚠️ Important:</strong><br>Ce code expire dans <strong>15 minutes</strong>. Si vous n\'avez pas demandé cette réinitialisation, ignorez cet email.</p>
                            </div>
                            <p style="margin:25px 0 0 0;color:#6b7280;font-size:14px;line-height:1.6">Cordialement,<br><strong style="color:#6366f1">L\'équipe Daxi</strong></p>
                        </td>
                    </tr>
                    <tr>
                        <td style="background:#f9fafb;padding:30px 40px;text-align:center;border-top:1px solid #e5e7eb">
                            <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.6">Cet email a été envoyé automatiquement, merci de ne pas y répondre.<br>© 2024 Daxi - Tous droits réservés</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>';
        
        
        $mail->send();
        error_log("Email sent successfully via PHPMailer");
        
        
        echo json_encode([
            'success' => true,
            'message' => 'Code envoyé avec succès'
        ]);
        
    } catch (Exception $e) {
        error_log("PHPMailer error: " . $mail->ErrorInfo);
        echo json_encode([
            'success' => false,
            'message' => 'Erreur lors de l\'envoi de l\'email: ' . $mail->ErrorInfo
        ]);
    }
    
} catch (Exception $e) {
    error_log('Reset code error: ' . $e->getMessage());
    echo json_encode([
        'success' => false,
        'message' => 'Erreur lors de l\'envoi du code'
    ]);
}
?>
