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

require_once __DIR__ . '/config_smtp.php';
require_once __DIR__ . '/PHPMailer/src/Exception.php';
require_once __DIR__ . '/PHPMailer/src/PHPMailer.php';
require_once __DIR__ . '/PHPMailer/src/SMTP.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

$data = json_decode(file_get_contents('php://input'), true);
$email = isset($data['email']) ? trim($data['email']) : '';
$driver = isset($data['driver']) ? trim($data['driver']) : '';
$rideId = isset($data['rideId']) ? trim($data['rideId']) : '';
$pickup = isset($data['pickup']) ? trim($data['pickup']) : '';
$destination = isset($data['destination']) ? trim($data['destination']) : '';
$estimatedDuration = isset($data['estimatedDuration']) ? trim($data['estimatedDuration']) : '15'; 
$distance = isset($data['distance']) ? trim($data['distance']) : '?'; 

if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    echo json_encode(['success' => false, 'message' => 'Email utilisateur invalide']);
    exit;
}
if (!$driver) {
    echo json_encode(['success' => false, 'message' => 'Nom du chauffeur manquant']);
    exit;
}

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
    $mail->Subject = '🚗 Votre chauffeur est arrivé - Durée: ' . $estimatedDuration . ' min';
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
                        <td style="background:linear-gradient(135deg,#10b981 0%,#059669 100%);padding:50px 40px;text-align:center">
                            <h1 style="margin:0;color:#fff;font-size:42px;font-weight:800;letter-spacing:2px;text-shadow:0 2px 10px rgba(0,0,0,0.2)">DAXI</h1>
                            <p style="margin:12px 0 0 0;color:rgba(255,255,255,0.95);font-size:17px;font-weight:500;letter-spacing:0.5px">Votre partenaire de transport en Haiti</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:50px 40px">
                            <h2 style="margin:0 0 24px 0;color:#1f2937;font-size:26px;font-weight:700;letter-spacing:-0.5px">✨ Votre chauffeur est arrivé !</h2>
                            <p style="margin:0 0 35px 0;color:#4b5563;font-size:16px;line-height:1.7">Bonjour,<br><br>Bonne nouvelle ! Votre chauffeur <strong style="color:#10b981">' . htmlspecialchars($driver) . '</strong> est arrivé à votre point de rendez-vous. Votre trajet durera environ <strong style="color:#3b82f6;font-size:18px">' . htmlspecialchars($estimatedDuration) . ' minutes</strong>.</p>
                            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:12px;overflow:hidden;margin:30px 0">
                                <tr>
                                    <td style="padding:12px;background:#f3f4f6;border-bottom:2px solid #e5e7eb"><strong style="color:#1f2937;font-size:16px">Détails de votre course</strong></td>
                                    <td style="padding:12px;background:#f3f4f6;border-bottom:2px solid #e5e7eb"></td>
                                </tr>
                                <tr>
                                    <td style="padding:12px;border-bottom:1px solid #e5e7eb"><strong style="color:#374151">Point de départ:</strong></td>
                                    <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#6b7280">' . htmlspecialchars($pickup) . '</td>
                                </tr>
                                <tr>
                                    <td style="padding:12px;border-bottom:1px solid #e5e7eb"><strong style="color:#374151">Destination:</strong></td>
                                    <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#6b7280">' . htmlspecialchars($destination) . '</td>
                                </tr>
                                <tr>
                                    <td style="padding:12px;border-bottom:1px solid #e5e7eb"><strong style="color:#374151">Distance estimée:</strong></td>
                                    <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#6b7280">' . htmlspecialchars($distance) . '</td>
                                </tr>
                                <tr>
                                    <td style="padding:12px;border-bottom:1px solid #e5e7eb"><strong style="color:#374151">Durée estimée:</strong></td>
                                    <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right"><span style="font-size:18px;font-weight:700;color:#3b82f6">' . htmlspecialchars($estimatedDuration) . ' min</span></td>
                                </tr>
                                <tr>
                                    <td style="padding:12px;border-bottom:1px solid #e5e7eb"><strong style="color:#374151">Chauffeur:</strong></td>
                                    <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#6b7280">' . htmlspecialchars($driver) . '</td>
                                </tr>
                                <tr>
                                    <td style="padding:12px;background:#f9fafb"><strong style="color:#374151">ID course:</strong></td>
                                    <td style="padding:12px;background:#f9fafb;text-align:right;color:#6b7280">' . htmlspecialchars($rideId) . '</td>
                                </tr>
                            </table>
                            <div style="background:linear-gradient(135deg,#bfdbfe 0%,#93c5fd 100%);border-left:5px solid #3b82f6;padding:20px 24px;margin:30px 0;border-radius:12px">
                                <p style="margin:0 0 8px 0;color:#1e40af;font-size:15px;line-height:1.6;font-weight:600">⏱️ En route!</p>
                                <p style="margin:0;color:#1e3a8a;font-size:14px;line-height:1.6">Un compte à rebours en direct s\'affiche dans votre application mobile. Merci d\'avoir choisi <strong style="color:#10b981">Daxi</strong> !</p>
                            </div>
                            <p style="margin:25px 0 0 0;color:#6b7280;font-size:14px;line-height:1.6">Cordialement,<br><strong style="color:#10b981">L\'équipe Daxi</strong></p>
                        </td>
                    </tr>
                    <tr>
                        <td style="background:#f9fafb;padding:30px 40px;text-align:center;border-top:1px solid #e5e7eb">
                            <p style="margin:0 0 15px 0;color:#9ca3af;font-size:12px;line-height:1.6">Besoin d\'aide? Contactez-nous</p>
                            <p style="margin:0 0 8px 0"><a href="https://wa.me/50944969696" style="color:#25D366;text-decoration:none;font-weight:600;font-size:14px">WhatsApp: +509 4496 9696</a></p>
                            <p style="margin:0 0 8px 0"><a href="https://daxipro.com" style="color:#10b981;text-decoration:none;font-weight:600;font-size:14px">Site web: daxipro.com</a></p>
                            <p style="margin:0 0 20px 0"><a href="mailto:info@daxipro.com" style="color:#3b82f6;text-decoration:none;font-weight:600;font-size:14px">Email: info@daxipro.com</a></p>
                            <p style="margin:20px 0 0 0;color:#9ca3af;font-size:12px"><strong style="color:#6b7280">Daxi</strong> &copy; ' . date('Y') . ' - Port-au-Prince, Haiti<br>Tous droits réservés</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>';
    $mail->AltBody = 'Votre chauffeur ' . $driver . ' est arrivé.';
    $mail->send();
    echo json_encode(['success' => true, 'message' => 'Email envoyé']);
} catch (Exception $e) {
    echo json_encode(['success' => false, 'message' => 'Erreur: ' . $mail->ErrorInfo]);
}
