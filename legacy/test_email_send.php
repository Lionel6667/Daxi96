<?php


echo "========================================\n";
echo "TEST D'ENVOI D'EMAILS - DIRECT CLI\n";
echo "========================================\n\n";


define('TEST_EMAIL', 'flaymiwanito@gmail.com');
define('TEST_OTP', '123456');


require_once __DIR__ . '/phpscript/config_smtp.php';
require_once __DIR__ . '/phpscript/PHPMailer/src/Exception.php';
require_once __DIR__ . '/phpscript/PHPMailer/src/PHPMailer.php';
require_once __DIR__ . '/phpscript/PHPMailer/src/SMTP.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;


echo "[TEST 1] Envoi email OTP...\n";
echo "Email: " . TEST_EMAIL . "\n";
echo "OTP: " . TEST_OTP . "\n";

try {
    $mail = new PHPMailer(true);
    $mail->isSMTP();
    $mail->Host = SMTP_HOST;
    $mail->SMTPAuth = true;
    $mail->Username = SMTP_USERNAME;
    $mail->Password = SMTP_PASSWORD;
    $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
    $mail->Port = SMTP_PORT;
    $mail->SMTPOptions = array('ssl' => array(
        'verify_peer' => false,
        'verify_peer_name' => false,
        'allow_self_signed' => true
    ));
    
    $mail->setFrom(FROM_EMAIL, FROM_NAME);
    $mail->addAddress(TEST_EMAIL);
    $mail->isHTML(true);
    $mail->CharSet = 'UTF-8';
    $mail->Subject = '[TEST] Code OTP Daxi - ' . TEST_OTP;
    $mail->Body = '
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="font-family: Arial; background: #f0f2f5; padding: 20px;">
        <div style="background: white; border-radius: 10px; padding: 30px; max-width: 500px; margin: 0 auto;">
            <h2 style="color: #6366f1;">Code OTP Daxi</h2>
            <p>Votre code de vérification est:</p>
            <div style="background: #f3f4f6; padding: 20px; border-radius: 5px; text-align: center; margin: 20px 0;">
                <h1 style="color: #d946ef; font-size: 36px; margin: 0; letter-spacing: 5px;">' . TEST_OTP . '</h1>
            </div>
            <p style="color: #666;">Ce code expire dans 10 minutes.</p>
            <p style="color: #999; font-size: 12px;">TEST - ' . date('Y-m-d H:i:s') . '</p>
        </div>
    </body>
    </html>
    ';
    
    if ($mail->send()) {
        echo "✅ EMAIL OTP ENVOYÉ AVEC SUCCÈS!\n";
        echo "   Destinataire: " . TEST_EMAIL . "\n";
        echo "   Objet: " . $mail->Subject . "\n";
        echo "   ID Message: " . $mail->getLastMessageID() . "\n\n";
    } else {
        echo "❌ Erreur: " . $mail->ErrorInfo . "\n\n";
    }
} catch (Exception $e) {
    echo "❌ EXCEPTION: " . $e->getMessage() . "\n\n";
}


echo "[TEST 2] Envoi email commande (price_proposed)...\n";

try {
    $mail2 = new PHPMailer(true);
    $mail2->isSMTP();
    $mail2->Host = SMTP_HOST;
    $mail2->SMTPAuth = true;
    $mail2->Username = SMTP_USERNAME;
    $mail2->Password = SMTP_PASSWORD;
    $mail2->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
    $mail2->Port = SMTP_PORT;
    $mail2->SMTPOptions = array('ssl' => array(
        'verify_peer' => false,
        'verify_peer_name' => false,
        'allow_self_signed' => true
    ));
    
    $mail2->setFrom(FROM_EMAIL, FROM_NAME);
    $mail2->addAddress(TEST_EMAIL);
    $mail2->isHTML(true);
    $mail2->CharSet = 'UTF-8';
    $mail2->Subject = '[TEST] Prix proposé - Daxi';
    $mail2->Body = '
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="font-family: Arial; background: #f0f2f5; padding: 20px;">
        <div style="background: white; border-radius: 10px; padding: 30px; max-width: 500px; margin: 0 auto;">
            <h2 style="color: #6366f1;">Prix proposé pour votre commande</h2>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                <tr style="border-bottom: 1px solid #e5e7eb;">
                    <td style="padding: 10px; font-weight: bold;">Départ:</td>
                    <td style="padding: 10px; text-align: right;">Test Pickup Location</td>
                </tr>
                <tr style="border-bottom: 1px solid #e5e7eb;">
                    <td style="padding: 10px; font-weight: bold;">Destination:</td>
                    <td style="padding: 10px; text-align: right;">Test Destination Location</td>
                </tr>
                <tr style="background: #f3f4f6;">
                    <td style="padding: 10px; font-weight: bold;">Prix proposé:</td>
                    <td style="padding: 10px; text-align: right; font-size: 20px; color: #d946ef; font-weight: bold;">500 $</td>
                </tr>
            </table>
            <p style="color: #666;">Acceptez-vous ce prix?</p>
            <p style="color: #999; font-size: 12px;">TEST - ' . date('Y-m-d H:i:s') . '</p>
        </div>
    </body>
    </html>
    ';
    
    if ($mail2->send()) {
        echo "✅ EMAIL COMMANDE ENVOYÉ AVEC SUCCÈS!\n";
        echo "   Destinataire: " . TEST_EMAIL . "\n";
        echo "   Objet: " . $mail2->Subject . "\n";
        echo "   ID Message: " . $mail2->getLastMessageID() . "\n\n";
    } else {
        echo "❌ Erreur: " . $mail2->ErrorInfo . "\n\n";
    }
} catch (Exception $e) {
    echo "❌ EXCEPTION: " . $e->getMessage() . "\n\n";
}

echo "========================================\n";
echo "TESTS TERMINES\n";
echo "========================================\n";
echo "\n✅ Vérifie ton email: flaymiwanito@gmail.com\n";
echo "   Tu devrais recevoir 2 emails de test (OTP + Commande)\n";
?>
