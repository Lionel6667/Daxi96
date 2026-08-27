<?php


echo "\n";
echo "╔════════════════════════════════════════════════════════════════╗\n";
echo "║    TEST COMPLET - TOUS LES TYPES D'EMAILS DAXI                ║\n";
echo "╚════════════════════════════════════════════════════════════════╝\n\n";


define('TEST_EMAIL', 'flaymiwanito@gmail.com');
define('TEST_TIMESTAMP', date('Y-m-d H:i:s'));


require_once __DIR__ . '/phpscript/config_smtp.php';
require_once __DIR__ . '/phpscript/PHPMailer/src/Exception.php';
require_once __DIR__ . '/phpscript/PHPMailer/src/PHPMailer.php';
require_once __DIR__ . '/phpscript/PHPMailer/src/SMTP.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

$testsResults = [];
$emailsSent = 0;

function createMailer() {
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
    $mail->CharSet = 'UTF-8';
    $mail->isHTML(true);
    return $mail;
}

function sendTestEmail($subject, $body, $testName) {
    global $emailsSent, $testsResults;
    
    try {
        $mail = createMailer();
        $mail->addAddress(TEST_EMAIL);
        $mail->Subject = $subject;
        $mail->Body = $body;
        
        if ($mail->send()) {
            $emailsSent++;
            $testsResults[] = ['✅', $testName, 'SUCCÈS'];
            echo "✅ $testName\n";
            return true;
        } else {
            $testsResults[] = ['❌', $testName, 'Erreur: ' . $mail->ErrorInfo];
            echo "❌ $testName - " . $mail->ErrorInfo . "\n";
            return false;
        }
    } catch (Exception $e) {
        $testsResults[] = ['❌', $testName, 'Exception: ' . $e->getMessage()];
        echo "❌ $testName - " . $e->getMessage() . "\n";
        return false;
    }
}




echo "[1/9] OTP Registration Email\n";
$otp = '654321';
$body1 = '
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial; background: #f0f2f5; padding: 20px;">
    <div style="background: white; border-radius: 10px; padding: 30px; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #6366f1; text-align: center;">🔐 Code OTP Daxi</h2>
        <p style="text-align: center; color: #666;">Votre code de vérification est:</p>
        <div style="background: linear-gradient(135deg, #6366f1, #d946ef); padding: 20px; border-radius: 5px; text-align: center; margin: 20px 0;">
            <h1 style="color: white; font-size: 36px; margin: 0; letter-spacing: 5px;">' . $otp . '</h1>
        </div>
        <p style="color: #666; text-align: center;">Ce code expire dans <strong>10 minutes</strong></p>
        <p style="color: #999; font-size: 12px; text-align: center;">TEST - ' . TEST_TIMESTAMP . '</p>
    </div>
</body>
</html>';
sendTestEmail('[TEST] Code OTP Daxi - ' . $otp, $body1, 'OTP Registration');
echo "\n";




echo "[2/9] Price Proposed Email\n";
$body2 = '
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial; background: #f0f2f5; padding: 20px;">
    <div style="background: white; border-radius: 10px; padding: 30px; max-width: 600px; margin: 0 auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 20px; border-radius: 10px; color: white; text-align: center; margin-bottom: 30px;">
            <h1 style="margin: 0; font-size: 28px;">💰 Prix Proposé</h1>
        </div>
        
        <h2 style="color: #1f2937; margin-top: 0;">Commande #TEST-001</h2>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px; font-weight: bold; color: #374151;">📍 Départ:</td>
                <td style="padding: 12px; text-align: right; color: #6b7280;">Port-au-Prince, Haiti</td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px; font-weight: bold; color: #374151;">🏁 Destination:</td>
                <td style="padding: 12px; text-align: right; color: #6b7280;">Pétionville, Haiti</td>
            </tr>
            <tr style="background: #f3f4f6; border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px; font-weight: bold; color: #374151;">📅 Date:</td>
                <td style="padding: 12px; text-align: right; color: #6b7280;">08/02/2026</td>
            </tr>
            <tr style="background: linear-gradient(135deg, #dbeafe, #bfdbfe);">
                <td style="padding: 15px; font-weight: bold; font-size: 18px; color: #1e40af;">💵 Prix Proposé:</td>
                <td style="padding: 15px; text-align: right; font-size: 24px; font-weight: bold; color: #d946ef;">500 $</td>
            </tr>
        </table>
        
        <div style="background: #fef3c7; border-left: 5px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 5px;">
            <p style="margin: 0; color: #92400e;"><strong>⚠️ Action Requise:</strong> Acceptez ou refusez ce prix dans l\'application</p>
        </div>
        
        <p style="color: #666; margin-top: 20px;">Cordialement,<br><strong style="color: #6366f1;">L\'équipe Daxi</strong></p>
        <p style="color: #999; font-size: 12px;">TEST - ' . TEST_TIMESTAMP . '</p>
    </div>
</body>
</html>';
sendTestEmail('[TEST] Prix Proposé - Daxi', $body2, 'Price Proposed');
echo "\n";




echo "[3/9] Driver Assigned Email\n";
$body3 = '
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial; background: #f0f2f5; padding: 20px;">
    <div style="background: white; border-radius: 10px; padding: 30px; max-width: 600px; margin: 0 auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <div style="background: linear-gradient(135deg, #10b981, #059669); padding: 20px; border-radius: 10px; color: white; text-align: center; margin-bottom: 30px;">
            <h1 style="margin: 0; font-size: 28px;">✅ Chauffeur Assigné</h1>
        </div>
        
        <h2 style="color: #1f2937; margin-top: 0;">Commande #TEST-002</h2>
        
        <div style="background: #f0fdf4; border: 2px solid #10b981; padding: 20px; border-radius: 10px; margin: 20px 0;">
            <p style="margin: 0 0 15px 0; color: #047857;"><strong>👤 Votre Chauffeur:</strong></p>
            <h3 style="margin: 0 0 10px 0; color: #1f2937; font-size: 20px;">Jean-Pierre Dupont</h3>
            <p style="margin: 0 0 5px 0; color: #6b7280;">⭐ Rating: 4.8/5 (127 courses)</p>
            <p style="margin: 0; color: #6b7280;">📱 Contact: +509-9876-5432</p>
        </div>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px; font-weight: bold; color: #374151;">📍 Départ:</td>
                <td style="padding: 12px; text-align: right; color: #6b7280;">Port-au-Prince</td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px; font-weight: bold; color: #374151;">🏁 Destination:</td>
                <td style="padding: 12px; text-align: right; color: #6b7280;">Pétionville</td>
            </tr>
            <tr style="background: #f3f4f6;">
                <td style="padding: 12px; font-weight: bold; color: #374151;">⏱️ Arrivée estimée:</td>
                <td style="padding: 12px; text-align: right; color: #10b981; font-weight: bold;">8 minutes</td>
            </tr>
        </table>
        
        <p style="color: #666; margin-top: 20px;">Cordialement,<br><strong style="color: #6366f1;">L\'équipe Daxi</strong></p>
        <p style="color: #999; font-size: 12px;">TEST - ' . TEST_TIMESTAMP . '</p>
    </div>
</body>
</html>';
sendTestEmail('[TEST] Chauffeur Assigné - Daxi', $body3, 'Driver Assigned');
echo "\n";




echo "[4/9] Driver Arrived Email\n";
$body4 = '
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial; background: #f0f2f5; padding: 20px;">
    <div style="background: white; border-radius: 10px; padding: 30px; max-width: 600px; margin: 0 auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <div style="background: linear-gradient(135deg, #f59e0b, #d97706); padding: 20px; border-radius: 10px; color: white; text-align: center; margin-bottom: 30px;">
            <h1 style="margin: 0; font-size: 28px;">🚗 Chauffeur Arrivé</h1>
        </div>
        
        <p style="color: #1f2937; font-size: 16px; text-align: center;">Votre chauffeur <strong>Jean-Pierre Dupont</strong> est arrivé à votre position!</p>
        
        <div style="background: #fef3c7; border-left: 5px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 5px;">
            <p style="margin: 0; color: #92400e;"><strong>⏱️ Veuillez vous présenter immédiatement</strong><br>Votre chauffeur vous attend!</p>
        </div>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background: #f3f4f6; border-radius: 5px;">
            <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px; font-weight: bold; color: #374151;">👤 Chauffeur:</td>
                <td style="padding: 12px; text-align: right; color: #6b7280;">Jean-Pierre Dupont</td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px; font-weight: bold; color: #374151;">🚗 Véhicule:</td>
                <td style="padding: 12px; text-align: right; color: #6b7280;">Toyota Corolla - Plaque: TAX-123</td>
            </tr>
            <tr>
                <td style="padding: 12px; font-weight: bold; color: #374151;">📞 Contact:</td>
                <td style="padding: 12px; text-align: right; color: #6b7280;">+509-9876-5432</td>
            </tr>
        </table>
        
        <p style="color: #666; margin-top: 20px;">Cordialement,<br><strong style="color: #6366f1;">L\'équipe Daxi</strong></p>
        <p style="color: #999; font-size: 12px;">TEST - ' . TEST_TIMESTAMP . '</p>
    </div>
</body>
</html>';
sendTestEmail('[TEST] Chauffeur Arrivé - Daxi', $body4, 'Driver Arrived');
echo "\n";




echo "[5/9] Trip Started (On the Way) Email\n";
$body5 = '
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial; background: #f0f2f5; padding: 20px;">
    <div style="background: white; border-radius: 10px; padding: 30px; max-width: 600px; margin: 0 auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <div style="background: linear-gradient(135deg, #3b82f6, #1d4ed8); padding: 20px; border-radius: 10px; color: white; text-align: center; margin-bottom: 30px;">
            <h1 style="margin: 0; font-size: 28px;">🚀 Voyage Commencé</h1>
        </div>
        
        <p style="color: #1f2937; font-size: 16px;">Votre chauffeur <strong>Jean-Pierre Dupont</strong> est en route vers votre destination!</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px; font-weight: bold; color: #374151;">📍 Départ:</td>
                <td style="padding: 12px; text-align: right; color: #6b7280;">Port-au-Prince</td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px; font-weight: bold; color: #374151;">🏁 Destination:</td>
                <td style="padding: 12px; text-align: right; color: #6b7280;">Pétionville</td>
            </tr>
            <tr style="background: linear-gradient(135deg, #dbeafe, #bfdbfe);">
                <td style="padding: 12px; font-weight: bold; color: #1e40af;">⏱️ Durée estimée:</td>
                <td style="padding: 12px; text-align: right; color: #1e40af; font-weight: bold;">15 minutes</td>
            </tr>
        </table>
        
        <div style="background: #e0f2fe; border-left: 5px solid #0284c7; padding: 15px; margin: 20px 0; border-radius: 5px;">
            <p style="margin: 0; color: #0c4a6e;"><strong>💡 Info:</strong> Vous recevrez une notification à l\'arrivée</p>
        </div>
        
        <p style="color: #666; margin-top: 20px;">Cordialement,<br><strong style="color: #6366f1;">L\'équipe Daxi</strong></p>
        <p style="color: #999; font-size: 12px;">TEST - ' . TEST_TIMESTAMP . '</p>
    </div>
</body>
</html>';
sendTestEmail('[TEST] Voyage Commencé - Daxi', $body5, 'Trip Started');
echo "\n";




echo "[6/9] Trip Completed Email\n";
$body6 = '
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial; background: #f0f2f5; padding: 20px;">
    <div style="background: white; border-radius: 10px; padding: 30px; max-width: 600px; margin: 0 auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <div style="background: linear-gradient(135deg, #10b981, #059669); padding: 20px; border-radius: 10px; color: white; text-align: center; margin-bottom: 30px;">
            <h1 style="margin: 0; font-size: 28px;">✅ Voyage Terminé</h1>
        </div>
        
        <p style="color: #1f2937; font-size: 16px;">Merci d\'avoir utilisé Daxi!</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background: #f3f4f6; border-radius: 5px;">
            <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px; font-weight: bold; color: #374151;">👤 Chauffeur:</td>
                <td style="padding: 12px; text-align: right; color: #6b7280;">Jean-Pierre Dupont</td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px; font-weight: bold; color: #374151;">⏱️ Durée:</td>
                <td style="padding: 12px; text-align: right; color: #6b7280;">18 minutes 45 secondes</td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px; font-weight: bold; color: #374151;">📏 Distance:</td>
                <td style="padding: 12px; text-align: right; color: #6b7280;">12.5 km</td>
            </tr>
            <tr style="background: linear-gradient(135deg, #fef3c7, #fde68a);">
                <td style="padding: 12px; font-weight: bold; color: #92400e;">💵 Montant Total:</td>
                <td style="padding: 12px; text-align: right; color: #b45309; font-weight: bold; font-size: 16px;">500 $</td>
            </tr>
        </table>
        
        <div style="background: #f0fdf4; border-left: 5px solid #10b981; padding: 15px; margin: 20px 0; border-radius: 5px;">
            <p style="margin: 0; color: #166534;"><strong>⭐ Évaluez votre voyage:</strong> Cliquez sur le lien ci-dessous pour noter votre expérience</p>
        </div>
        
        <p style="color: #666; margin-top: 20px;">Cordialement,<br><strong style="color: #6366f1;">L\'équipe Daxi</strong></p>
        <p style="color: #999; font-size: 12px;">TEST - ' . TEST_TIMESTAMP . '</p>
    </div>
</body>
</html>';
sendTestEmail('[TEST] Voyage Terminé - Daxi', $body6, 'Trip Completed');
echo "\n";




echo "[7/9] Password Reset Email\n";
$resetCode = 'RESET-' . strtoupper(bin2hex(random_bytes(4)));
$body7 = '
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial; background: #f0f2f5; padding: 20px;">
    <div style="background: white; border-radius: 10px; padding: 30px; max-width: 600px; margin: 0 auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <div style="background: linear-gradient(135deg, #ef4444, #dc2626); padding: 20px; border-radius: 10px; color: white; text-align: center; margin-bottom: 30px;">
            <h1 style="margin: 0; font-size: 28px;">🔐 Réinitialisation de Mot de Passe</h1>
        </div>
        
        <p style="color: #1f2937; font-size: 16px;">Vous avez demandé une réinitialisation de mot de passe. Voici votre code:</p>
        
        <div style="background: linear-gradient(135deg, #fee2e2, #fecaca); padding: 20px; border-radius: 5px; text-align: center; margin: 20px 0;">
            <h2 style="color: #7f1d1d; margin: 0; font-size: 32px; letter-spacing: 3px;">' . $resetCode . '</h2>
        </div>
        
        <div style="background: #fee2e2; border-left: 5px solid #ef4444; padding: 15px; margin: 20px 0; border-radius: 5px;">
            <p style="margin: 0; color: #7f1d1d;"><strong>⚠️ Important:</strong></p>
            <ul style="margin: 10px 0 0 20px; color: #991b1b;">
                <li>Ce code expire dans <strong>30 minutes</strong></li>
                <li>Ne partagez jamais ce code</li>
                <li>Si vous ne l\'avez pas demandé, ignorez cet email</li>
            </ul>
        </div>
        
        <p style="color: #666; margin-top: 20px;">Cordialement,<br><strong style="color: #6366f1;">L\'équipe Daxi</strong></p>
        <p style="color: #999; font-size: 12px;">TEST - ' . TEST_TIMESTAMP . '</p>
    </div>
</body>
</html>';
sendTestEmail('[TEST] Réinitialisation de Mot de Passe - Daxi', $body7, 'Password Reset');
echo "\n";




echo "[8/9] Driver Notification - New Order Alert\n";
$body8 = '
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial; background: #f0f2f5; padding: 20px;">
    <div style="background: white; border-radius: 10px; padding: 30px; max-width: 600px; margin: 0 auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <div style="background: linear-gradient(135deg, #8b5cf6, #7c3aed); padding: 20px; border-radius: 10px; color: white; text-align: center; margin-bottom: 30px;">
            <h1 style="margin: 0; font-size: 28px;">📋 Nouvelle Commande</h1>
        </div>
        
        <p style="color: #1f2937; font-size: 16px;">Une nouvelle commande vous attend!</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background: #f3f4f6; border-radius: 5px;">
            <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px; font-weight: bold; color: #374151;">📍 Départ:</td>
                <td style="padding: 12px; text-align: right; color: #6b7280;">Port-au-Prince</td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px; font-weight: bold; color: #374151;">🏁 Destination:</td>
                <td style="padding: 12px; text-align: right; color: #6b7280;">Pétionville</td>
            </tr>
            <tr style="background: linear-gradient(135deg, #ede9fe, #ddd6fe);">
                <td style="padding: 12px; font-weight: bold; color: #5b21b6;">💰 Gain Estimé:</td>
                <td style="padding: 12px; text-align: right; color: #6d28d9; font-weight: bold;">150 $</td>
            </tr>
        </table>
        
        <div style="background: #f3e8ff; border-left: 5px solid #8b5cf6; padding: 15px; margin: 20px 0; border-radius: 5px;">
            <p style="margin: 0; color: #5b21b6;"><strong>⚡ Acceptez cette commande rapidement!</strong><br>D\'autres chauffeurs l\'ont déjà vue</p>
        </div>
        
        <p style="color: #666; margin-top: 20px;">Cordialement,<br><strong style="color: #6366f1;">L\'équipe Daxi</strong></p>
        <p style="color: #999; font-size: 12px;">TEST - ' . TEST_TIMESTAMP . '</p>
    </div>
</body>
</html>';
sendTestEmail('[TEST] Nouvelle Commande - Daxi Drivers', $body8, 'New Order Alert (Driver)');
echo "\n";




echo "[9/9] Weekly Summary Email\n";
$body9 = '
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial; background: #f0f2f5; padding: 20px;">
    <div style="background: white; border-radius: 10px; padding: 30px; max-width: 600px; margin: 0 auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 20px; border-radius: 10px; color: white; text-align: center; margin-bottom: 30px;">
            <h1 style="margin: 0; font-size: 28px;">📊 Résumé Hebdomadaire</h1>
        </div>
        
        <p style="color: #1f2937; font-size: 16px;">Voici votre résumé d\'activité cette semaine:</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background: #f3f4f6; border-radius: 5px;">
            <tr style="border-bottom: 1px solid #e5e7eb; background: linear-gradient(135deg, #ede9fe, #ddd6fe);">
                <td style="padding: 12px; font-weight: bold; color: #5b21b6;">🚗 Trajets Complétés:</td>
                <td style="padding: 12px; text-align: right; font-weight: bold; color: #6d28d9; font-size: 18px;">24</td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px; font-weight: bold; color: #374151;">⏱️ Temps Total:</td>
                <td style="padding: 12px; text-align: right; color: #6b7280;">12h 45m</td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px; font-weight: bold; color: #374151;">📏 Distance Total:</td>
                <td style="padding: 12px; text-align: right; color: #6b7280;">287 km</td>
            </tr>
            <tr style="background: linear-gradient(135deg, #fef3c7, #fde68a);">
                <td style="padding: 12px; font-weight: bold; color: #92400e;">💰 Gains Total:</td>
                <td style="padding: 12px; text-align: right; color: #b45309; font-weight: bold; font-size: 16px;">3,600 $</td>
            </tr>
        </table>
        
        <div style="background: #e0f2fe; border-left: 5px solid #0284c7; padding: 15px; margin: 20px 0; border-radius: 5px;">
            <p style="margin: 0; color: #0c4a6e;"><strong>⭐ Évaluation Moyenne:</strong> 4.9/5 (23 avis)</p>
        </div>
        
        <p style="color: #666; margin-top: 20px;">Merci de votre engagement!<br><strong style="color: #6366f1;">L\'équipe Daxi</strong></p>
        <p style="color: #999; font-size: 12px;">TEST - ' . TEST_TIMESTAMP . '</p>
    </div>
</body>
</html>';
sendTestEmail('[TEST] Résumé Hebdomadaire - Daxi', $body9, 'Weekly Summary');
echo "\n";




echo "\n";
echo "╔════════════════════════════════════════════════════════════════╗\n";
echo "║                      RÉSUMÉ DES TESTS                         ║\n";
echo "╚════════════════════════════════════════════════════════════════╝\n\n";

foreach ($testsResults as $result) {
    echo $result[0] . " " . $result[1] . "\n";
}

echo "\n";
echo "════════════════════════════════════════════════════════════════\n";
echo "TOTAL: " . $emailsSent . "/9 emails envoyés avec succès ✅\n";
echo "════════════════════════════════════════════════════════════════\n";
echo "\n";
echo "📧 Vérifie ton email: flaymiwanito@gmail.com\n";
echo "   Tu devrais recevoir 9 emails de test!\n\n";
?>
