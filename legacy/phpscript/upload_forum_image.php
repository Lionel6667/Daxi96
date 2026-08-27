<?php


header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit();
}


if (!isset($_FILES['image'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'No image file provided']);
    exit();
}

$file = $_FILES['image'];


$allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
$maxSize = 5 * 1024 * 1024; 

if (!in_array($file['type'], $allowedTypes)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed']);
    exit();
}

if ($file['size'] > $maxSize) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'File size exceeds 5MB limit']);
    exit();
}

if ($file['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Upload error: ' . $file['error']]);
    exit();
}


$imgurClientId = getenv('IMGUR_CLIENT_ID') ?: $_POST['imgur_client_id'] ?? null;

if ($imgurClientId && $imgurClientId !== 'YOUR_IMGUR_CLIENT_ID') {
    $imageUrl = uploadToImgur($file['tmp_name'], $imgurClientId);
    if ($imageUrl) {
        http_response_code(200);
        echo json_encode(['success' => true, 'url' => $imageUrl]);
        exit();
    }
}


$uploadDir = __DIR__ . '/uploads/forum/';
if (!is_dir($uploadDir)) {
    mkdir($uploadDir, 0755, true);
}

$filename = uniqid('forum_') . '_' . time() . '.' . pathinfo($file['name'], PATHINFO_EXTENSION);
$filepath = $uploadDir . $filename;

if (move_uploaded_file($file['tmp_name'], $filepath)) {
    $imageUrl = 'phpscript/uploads/forum/' . $filename;
    http_response_code(200);
    echo json_encode(['success' => true, 'url' => $imageUrl]);
    exit();
} else {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Failed to save image']);
    exit();
}


function uploadToImgur($filePath, $clientId) {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, 'https://api.imgur.com/3/image');
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Authorization: Client-ID ' . $clientId]);
    curl_setopt($ch, CURLOPT_POSTFIELDS, ['image' => new CURLFile($filePath)]);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200) {
        return null;
    }

    $data = json_decode($response, true);
    return $data['success'] && isset($data['data']['link']) ? $data['data']['link'] : null;
}
?>
