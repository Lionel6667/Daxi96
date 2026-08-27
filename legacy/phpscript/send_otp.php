<?php
error_reporting(E_ALL);
ini_set('display_errors', 0);


header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Accept, X-Requested-With, Authorization');
header('Access-Control-Max-Age: 3600');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');


if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}


if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method Not Allowed. Only POST is accepted.', 'method' => $_SERVER['REQUEST_METHOD']]);
    exit;
}

require_once 'config_smtp.php';
require 'PHPMailer/src/Exception.php';
require 'PHPMailer/src/PHPMailer.php';
require 'PHPMailer/src/SMTP.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

try {
    $data = json_decode(file_get_contents('php://input'), true);
    if (!isset($data['email']) || !isset($data['otp'])) {
        throw new Exception('Email and OTP required');
    }
    $email = filter_var($data['email'], FILTER_VALIDATE_EMAIL);
    if (!$email) throw new Exception('Invalid email');
    
    $otp = $data['otp'];
    $mail = new PHPMailer(true);
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
    $mail->Subject = 'Votre code de verification - Daxi';
    
    
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
                            <h2 style="margin:0 0 24px 0;color:#1f2937;font-size:26px;font-weight:700;letter-spacing:-0.5px">Verification de votre compte</h2>
                            <p style="margin:0 0 35px 0;color:#4b5563;font-size:16px;line-height:1.7">Bonjour,<br><br>Nous sommes ravis de vous accueillir chez <strong style="color:#6366f1">Daxi</strong>! Pour finaliser la creation de votre compte, veuillez utiliser le code de verification ci-dessous:</p>
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td align="center" style="padding:35px 0">
                                        <table cellpadding="0" cellspacing="0" style="background:#fff;border:3px solid #6366f1;border-radius:16px;padding:35px 50px;box-shadow:0 8px 24px rgba(99,102,241,0.15)">
                                            <tr>
                                                <td align="center">
                                                    <p style="margin:0 0 12px 0;color:#6b7280;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:1.5px">Code de verification</p>
                                                    <div style="font-size:52px;font-weight:800;color:#6366f1;letter-spacing:12px;font-family:Courier New,Consolas,monospace;text-shadow:0 2px 4px rgba(99,102,241,0.1)">' . htmlspecialchars($otp) . '</div>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                            <div style="background:linear-gradient(135deg,#fef3c7 0%,#fde68a 100%);border-left:5px solid #f59e0b;padding:20px 24px;margin:35px 0;border-radius:12px;box-shadow:0 4px 12px rgba(245,158,11,0.1)">
                                <p style="margin:0;color:#92400e;font-size:15px;line-height:1.6"><strong style="font-size:16px">Validite du code:</strong><br>Ce code expire dans <strong>10 minutes</strong>. Pour votre securite, ne le partagez avec personne.</p>
                            </div>
                            <div style="background-color:#f9fafb;padding:20px 24px;margin:30px 0;border-radius:12px;border:1px solid #e5e7eb">
                                <p style="margin:0;color:#6b7280;font-size:14px;line-height:1.6"><strong style="color:#374151">Vous n avez pas demande ce code?</strong><br>Si ce n est pas vous, ignorez simplement cet email. Votre compte reste securise.</p>
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:0 40px">
                            <div style="height:1px;background:linear-gradient(to right,transparent,#e5e7eb,transparent)"></div>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:40px 40px 50px 40px;text-align:center">
                            <p style="margin:0 0 20px 0;color:#1f2937;font-size:18px;font-weight:700">Merci de choisir Daxi!</p>
                            <p style="margin:0 0 30px 0;color:#6b7280;font-size:15px;line-height:1.6">Besoin d aide? Contactez-nous</p>
                            <p style="margin:0 0 10px 0">
                                <a href="https://wa.me/50944969696" style="color:#25D366;text-decoration:none;font-weight:600;font-size:15px">WhatsApp: +509 4496 9696</a>
                            </p>
                            <p style="margin:0 0 10px 0">
                                <a href="https://daxipro.com" style="color:#6366f1;text-decoration:none;font-weight:600;font-size:15px">Site web: daxipro.com</a>
                            </p>
                            <p style="margin:0 0 30px 0">
                                <a href="mailto:info@daxipro.com" style="color:#3b82f6;text-decoration:none;font-weight:600;font-size:15px">Email: info@daxipro.com</a>
                            </p>
                            <p style="margin:30px 0 0 0;color:#9ca3af;font-size:13px;line-height:1.6"><strong style="color:#6b7280">Daxi</strong> &copy; ' . date('Y') . ' - Port-au-Prince, Haiti<br>Tous droits reserves<br><br><span style="color:#d1d5db">Email envoye a</span> <strong style="color:#6b7280">' . htmlspecialchars($email) . '</strong></p>
                        </td>
                    </tr>
                </table>
                <p style="margin:30px 0 0 0;padding:0 20px;color:#9ca3af;font-size:12px;text-align:center;line-height:1.5">Cet email contient des informations confidentielles destinees uniquement au destinataire mentionne ci-dessus.</p>
            </td>
        </tr>
    </table>
</body>
</html>';
    
    $mail->AltBody = "Code de verification Daxi\n\nBonjour,\n\nVotre code OTP : " . $otp . "\n\nCe code est valable pendant 10 minutes.\nNe le partagez avec personne.\n\nMerci de choisir Daxi!\n\nL'equipe Daxi\nWebsite: daxipro.com\nEmail: info@daxipro.com\nWhatsApp: +509 4496 9696";
    $mail->send();
    echo json_encode(['success' => true, 'message' => 'Email sent']);
} catch (Exception $e) {
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}