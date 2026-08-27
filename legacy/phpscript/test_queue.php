<?php

if (php_sapi_name() !== 'cli') {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Accept, X-Requested-With');
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }
}
require_once __DIR__ . '/api_queue.php';

echo "Testing processQueue() directly...\n\n";

$processed = processQueue();

echo "\nProcessed: $processed messages\n";


$queue = loadQueue();
foreach ($queue as $msgId => $item) {
    echo "\n$msgId:\n";
    echo "  Status: " . $item['status'] . "\n";
    echo "  Retries: " . $item['retries'] . "\n";
    echo "  Message: " . substr($item['message'], 0, 30) . "\n";
}
