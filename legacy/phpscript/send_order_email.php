<?php
error_reporting(E_ALL);
ini_set('display_errors', 0);




$__SEND_ORDER_EMAIL_DIRECT__ = (realpath(__FILE__) === realpath($_SERVER['SCRIPT_FILENAME'] ?? ''));


if ($__SEND_ORDER_EMAIL_DIRECT__) {
    if (php_sapi_name() !== 'cli') {
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
    }
}
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') exit;
}

error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);
ini_set('error_log', __DIR__ . '/order_emails.log');

require_once 'config_smtp.php';
require 'PHPMailer/src/Exception.php';
require 'PHPMailer/src/PHPMailer.php';
require 'PHPMailer/src/SMTP.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;


function sendOrderEmail($to, $subject, $htmlBody, $altBody) {
    try {
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
        $mail->addAddress($to);
        $mail->isHTML(true);
        $mail->CharSet = 'UTF-8';
        $mail->Subject = $subject;
        $mail->Body = $htmlBody;
        $mail->AltBody = $altBody;
        $mail->send();
        return true;
    } catch (Exception $e) {
        error_log("Erreur envoi email: " . $e->getMessage());
        return false;
    }
}


function generateEmailTemplate($type, $data) {
    $orderId = htmlspecialchars($data['orderId'] ?? '');
    $customerName = htmlspecialchars($data['customerName'] ?? '');
    $customerEmail = htmlspecialchars($data['customerEmail'] ?? '');
    $pickup = htmlspecialchars($data['pickup'] ?? '');
    $destination = htmlspecialchars($data['destination'] ?? '');
    $date = htmlspecialchars($data['date'] ?? '');
    $time = htmlspecialchars($data['time'] ?? '');
    
    $templates = [
        'price_proposed' => [
            'subject' => '💰 Prix propose pour votre course - Daxi',
            'title' => 'Nouveau prix propose pour votre course',
            'message' => 'Nous avons le plaisir de vous proposer un prix pour votre course. Veuillez vous connecter sur notre site pour accepter ou refuser cette offre.',
            'details' => '<tr><td style="padding:12px;border-bottom:1px solid #e5e7eb"><strong style="color:#374151">Prix propose:</strong></td><td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right"><span style="font-size:24px;font-weight:800;color:#10b981">' . htmlspecialchars($data['price']) . '</span></td></tr>',
            'action' => '<div style="background:linear-gradient(135deg,#dcfce7 0%,#bbf7d0 100%);border-left:5px solid #10b981;padding:20px 24px;margin:20px 0;border-radius:12px"><p style="margin:0 0 15px 0;color:#166534;font-size:16px;line-height:1.6;font-weight:600">⏰ Action requise</p><p style="margin:0 0 15px 0;color:#15803d;font-size:14px;line-height:1.6">Veuillez vous connecter sur notre site pour accepter ou refuser ce prix. Une fois accepte, nous vous assignerons rapidement un chauffeur.</p><a href="https://daxipro.com" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#10b981 0%,#059669 100%);color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px;margin:10px 0;box-shadow:0 4px 12px rgba(16,185,129,0.3)">✓ Accepter/Refuser sur daxipro.com</a></div>',
            'color' => '#10b981'
        ],
        'driver_accepted' => [
            'subject' => 'Un chauffeur a accepte votre course - Daxi',
            'title' => 'Votre chauffeur est en route !',
            'message' => 'Excellente nouvelle ! Un chauffeur a accepte votre course et se prepare a venir vous chercher.',
            'details' => '<tr><td style="padding:12px;border-bottom:1px solid #e5e7eb"><strong style="color:#374151">Chauffeur:</strong></td><td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#6b7280">' . htmlspecialchars($data['driverName']) . '</td></tr>
            <tr><td style="padding:12px;border-bottom:1px solid #e5e7eb"><strong style="color:#374151">Telephone:</strong></td><td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right"><a href="tel:' . htmlspecialchars($data['driverPhone']) . '" style="color:#6366f1;text-decoration:none;font-weight:600">' . htmlspecialchars($data['driverPhone']) . '</a></td></tr>
            <tr><td style="padding:12px;border-bottom:1px solid #e5e7eb"><strong style="color:#374151">Vehicule:</strong></td><td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#6b7280">' . htmlspecialchars($data['vehicle']) . '</td></tr>
            <tr><td style="padding:12px;border-bottom:1px solid #e5e7eb"><strong style="color:#374151">Plaque:</strong></td><td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#6b7280">' . htmlspecialchars($data['plate']) . '</td></tr>
            <tr><td style="padding:12px;border-bottom:1px solid #e5e7eb"><strong style="color:#374151">Prix:</strong></td><td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right"><span style="font-size:20px;font-weight:700;color:#10b981">' . htmlspecialchars($data['price']) . ' HTG</span></td></tr>',
            'action' => '<a href="tel:' . htmlspecialchars($data['driverPhone']) . '" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px;margin:20px 0">Appeler le chauffeur</a>',
            'color' => '#6366f1'
        ],
        'reminder_30min' => [
            'subject' => 'Rappel : Votre course dans 30 minutes - Daxi',
            'title' => 'Votre course commence bientot !',
            'message' => 'Votre chauffeur sera la dans environ 30 minutes. Preparez-vous !',
            'details' => '<tr><td style="padding:12px;border-bottom:1px solid #e5e7eb"><strong style="color:#374151">Chauffeur:</strong></td><td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#6b7280">' . htmlspecialchars($data['driverName']) . '</td></tr>
            <tr><td style="padding:12px;border-bottom:1px solid #e5e7eb"><strong style="color:#374151">Telephone:</strong></td><td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right"><a href="tel:' . htmlspecialchars($data['driverPhone']) . '" style="color:#6366f1;text-decoration:none;font-weight:600">' . htmlspecialchars($data['driverPhone']) . '</a></td></tr>',
            'action' => '<div style="background:linear-gradient(135deg,#fef3c7 0%,#fde68a 100%);border-left:5px solid #f59e0b;padding:20px 24px;margin:20px 0;border-radius:12px"><p style="margin:0;color:#92400e;font-size:15px;line-height:1.6"><strong>⏰ Dans 30 minutes</strong><br>Soyez pret au point de depart</p></div>',
            'color' => '#f59e0b'
        ],
        'trip_completed' => [
            'subject' => 'Course terminee - Merci d avoir choisi Daxi',
            'title' => 'Course terminee avec succes',
            'message' => 'Nous esperons que votre trajet s est bien deroule. Merci d avoir choisi Daxi !',
            'details' => '<tr><td style="padding:12px;border-bottom:1px solid #e5e7eb"><strong style="color:#374151">Montant paye:</strong></td><td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right"><span style="font-size:20px;font-weight:700;color:#10b981">' . htmlspecialchars($data['price']) . ' HTG</span></td></tr>',
            'action' => '<a href="https://daxipro.com" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#f59e0b 0%,#d97706 100%);color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px;margin:20px 0">Evaluer la course</a>',
            'color' => '#10b981'
        ],
        'trip_in_progress_with_duration' => [
            'subject' => '🚗 Votre course est en cours - Durée estimée: ' . (isset($data['estimatedDuration']) ? $data['estimatedDuration'] : '?') . ' min',
            'title' => 'Votre chauffeur est en route !',
            'message' => 'Votre course a commence. Votre chauffeur vous amène vers votre destination.',
            'details' => '<tr><td style="padding:12px;border-bottom:1px solid #e5e7eb"><strong style="color:#374151">Chauffeur:</strong></td><td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#6b7280">' . htmlspecialchars($data['driverName'] ?? '') . '</td></tr>
            <tr><td style="padding:12px;border-bottom:1px solid #e5e7eb"><strong style="color:#374151">Durée estimée:</strong></td><td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right"><span style="font-size:18px;font-weight:700;color:#3b82f6">' . htmlspecialchars($data['estimatedDuration'] ?? '?') . ' min</span></td></tr>
            <tr><td style="padding:12px;border-bottom:1px solid #e5e7eb"><strong style="color:#374151">Distance:</strong></td><td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#6b7280">' . htmlspecialchars($data['distance'] ?? '?') . ' km</td></tr>',
            'action' => '<div style="background:linear-gradient(135deg,#bfdbfe 0%,#93c5fd 100%);border-left:5px solid #3b82f6;padding:20px 24px;margin:20px 0;border-radius:12px"><p style="margin:0 0 15px 0;color:#1e40af;font-size:15px;line-height:1.6;font-weight:600">⏱️ Compte à rebours</p><p style="margin:0;color:#1e3a8a;font-size:14px;line-height:1.6">Le compte à rebours s\'affichera sur votre application dès que votre chauffeur arrivera à destination.<br><strong style="font-size:24px;color:#3b82f6">Temps restant: <span id="countdown">--:--</span></strong></p></div>',
            'color' => '#3b82f6'
        ]
    ];
    
    $template = $templates[$type];
    
    $html = '<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica Neue,Arial,sans-serif;background-color:#f0f2f5">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f2f5;padding:40px 20px">
        <tr><td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background-color:#fff;border-radius:20px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,0.12)">
                <tr><td style="background:linear-gradient(135deg,' . $template['color'] . ' 0%,#8b5cf6 100%);padding:40px;text-align:center">
                    <h1 style="margin:0;color:#fff;font-size:36px;font-weight:800;letter-spacing:1px">DAXI</h1>
                    <p style="margin:10px 0 0 0;color:rgba(255,255,255,0.95);font-size:16px">Votre service de transport</p>
                </td></tr>
                <tr><td style="padding:40px">
                    <h2 style="margin:0 0 16px 0;color:#1f2937;font-size:24px;font-weight:700">' . $template['title'] . '</h2>
                    <p style="margin:0 0 30px 0;color:#4b5563;font-size:16px;line-height:1.6">Bonjour <strong>' . $customerName . '</strong>,<br><br>' . $template['message'] . '</p>
                    
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:12px;overflow:hidden;margin:30px 0">
                        <tr><td style="padding:12px;background:#f3f4f6;border-bottom:2px solid #e5e7eb"><strong style="color:#1f2937;font-size:16px">Details de la course</strong></td><td style="padding:12px;background:#f3f4f6;border-bottom:2px solid #e5e7eb"></td></tr>
                        <tr><td style="padding:12px;border-bottom:1px solid #e5e7eb"><strong style="color:#374151">Depart:</strong></td><td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#6b7280">' . $pickup . '</td></tr>
                        <tr><td style="padding:12px;border-bottom:1px solid #e5e7eb"><strong style="color:#374151">Destination:</strong></td><td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#6b7280">' . $destination . '</td></tr>
                        <tr><td style="padding:12px;border-bottom:1px solid #e5e7eb"><strong style="color:#374151">Date:</strong></td><td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#6b7280">' . $date . '</td></tr>
                        <tr><td style="padding:12px;border-bottom:1px solid #e5e7eb"><strong style="color:#374151">Heure:</strong></td><td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#6b7280">' . $time . '</td></tr>
                        ' . $template['details'] . '
                    </table>
                    
                    ' . ($template['action'] ? '<div style="text-align:center;margin:30px 0">' . $template['action'] . '</div>' : '') . '
                </td></tr>
                <tr><td style="padding:0 40px"><div style="height:1px;background:linear-gradient(to right,transparent,#e5e7eb,transparent)"></div></td></tr>
                <tr><td style="padding:30px 40px;text-align:center">
                    <p style="margin:0 0 15px 0;color:#6b7280;font-size:14px">Besoin d aide? Contactez-nous</p>
                    <p style="margin:0 0 8px 0"><a href="https://wa.me/50944969696" style="color:#25D366;text-decoration:none;font-weight:600;font-size:14px">WhatsApp: +509 4496 9696</a></p>
                    <p style="margin:0 0 8px 0"><a href="https://daxipro.com" style="color:#6366f1;text-decoration:none;font-weight:600;font-size:14px">Site web: daxipro.com</a></p>
                    <p style="margin:0 0 20px 0"><a href="mailto:info@daxipro.com" style="color:#3b82f6;text-decoration:none;font-weight:600;font-size:14px">Email: info@daxipro.com</a></p>
                    <p style="margin:20px 0 0 0;color:#9ca3af;font-size:12px"><strong style="color:#6b7280">Daxi</strong> &copy; ' . date('Y') . ' - Port-au-Prince, Haiti</p>
                </td></tr>
            </table>
        </td></tr>
    </table>
</body></html>';

    $text = $template['title'] . "\n\n" . $template['message'] . "\n\nDepart: " . $pickup . "\nDestination: " . $destination . "\nDate: " . $date . "\nHeure: " . $time;
    
    return ['html' => $html, 'text' => $text, 'subject' => $template['subject']];
}


if ($__SEND_ORDER_EMAIL_DIRECT__) {
    try {
        error_log("=== DEBUT TRAITEMENT EMAIL ===");

        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            throw new Exception('Methode POST requise');
        }

        $rawInput = file_get_contents('php://input');
        error_log("Raw input: " . $rawInput);

        $data = json_decode($rawInput, true);
        error_log("Data decoded: " . print_r($data, true));

        if (!isset($data['type']) || !isset($data['email'])) {
            error_log("ERREUR: Type ou email manquant");
            throw new Exception('Type et email requis');
        }

        error_log("Type: " . $data['type']);
        error_log("Email destinataire: " . $data['email']);

        $emailTemplate = generateEmailTemplate($data['type'], $data);
        error_log("Template genere, envoi en cours...");

        $result = sendOrderEmail(
            $data['email'],
            $emailTemplate['subject'],
            $emailTemplate['html'],
            $emailTemplate['text']
        );

        if ($result) {
            error_log("✓ Email envoye avec succes a: " . $data['email']);
            echo json_encode(['success' => true, 'message' => 'Email envoye']);
        } else {
            error_log("✗ Echec envoi email");
            throw new Exception('Erreur lors de l envoi de l email');
        }

    } catch (Exception $e) {
        error_log("ERREUR FINALE: " . $e->getMessage());
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
}
