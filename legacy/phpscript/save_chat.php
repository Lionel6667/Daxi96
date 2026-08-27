<?php

if (php_sapi_name() !== 'cli') {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Accept, X-Requested-With');
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }
}


require_once __DIR__ . '/db_config.php';

error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);
ini_set('error_log', __DIR__ . '/error.log');


header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}


if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit();
}


$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data || !isset($data['userId']) || !isset($data['history'])) {
    echo json_encode(['success' => false, 'error' => 'Missing userId or history']);
    exit();
}

$userId = $data['userId'];
$history = $data['history'];

try {
    
    foreach ($history as $msg) {
        if (isset($msg['role']) && isset($msg['content'])) {
            saveChatMessage(
                $userId, 
                $msg['content'], 
                $msg['role'], 
                ['timestamp' => time()]
            );
        }
    }
    
    echo json_encode([
        'success' => true,
        'message' => 'Chat history saved',
        'count' => count($history)
    ]);
    
} catch (Exception $e) {
    error_log("Error saving chat history: " . $e->getMessage());
    echo json_encode([
        'success' => false,
        'error' => 'Failed to save chat history'
    ]);
}
