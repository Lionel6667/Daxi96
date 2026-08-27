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
    echo json_encode(['success' => false, 'error' => 'Method not allowed. Only POST is accepted.']);
    exit;
}


$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON']);
    exit();
}


$token = $data['token'] ?? null;
$notification = $data['notification'] ?? null;

if (!$token || !$notification) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing token or notification']);
    exit();
}




$fcmServerKey = 'bsbz7Ka_42ueOlLp2D_RjSaUwyKWb-TiO6vhGncMlpo';


$fcmPayload = [
    'to' => $token,
    'notification' => [
        'title' => $notification['title'] ?? 'Notification',
        'body' => $notification['body'] ?? '',
        'icon' => $notification['icon'] ?? '/img/logo.png',
        'badge' => $notification['badge'] ?? '/img/badge.png',
        'sound' => 'default',
        'click_action' => $notification['url'] ?? '/',
    ],
    'data' => array_merge([
        'tag' => $notification['tag'] ?? 'julmin-taxis',
        'url' => $notification['url'] ?? '/',
    ], $notification['data'] ?? []),
    'priority' => 'high',
    'time_to_live' => 86400 
];


$ch = curl_init('https://fcm.googleapis.com/fcm/send');
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
        'Authorization: key=' . $fcmServerKey,
        'Content-Type: application/json'
    ],
    CURLOPT_POSTFIELDS => json_encode($fcmPayload),
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_TIMEOUT => 10
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);


if ($curlError) {
    http_response_code(500);
    echo json_encode([
        'error' => 'Curl error',
        'message' => $curlError
    ]);
    exit();
}

if ($httpCode !== 200) {
    http_response_code($httpCode);
    echo json_encode([
        'error' => 'FCM error',
        'http_code' => $httpCode,
        'response' => json_decode($response, true)
    ]);
    exit();
}


$fcmResponse = json_decode($response, true);
echo json_encode([
    'success' => true,
    'message_id' => $fcmResponse['results'][0]['message_id'] ?? null,
    'fcm_response' => $fcmResponse
]);
?>
