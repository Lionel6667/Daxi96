<?php

if (php_sapi_name() !== 'cli') {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Accept, X-Requested-With');
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }
}
require_once __DIR__ . '/api_queue.php';

echo "Testing processQueue() with debug...\n\n";

$queue = loadQueue();
echo "Queue size: " . count($queue) . "\n\n";

foreach ($queue as $msgId => $item) {
    echo "Message: $msgId\n";
    echo "  status: " . $item['status'] . "\n";
    echo "  pending? " . ($item['status'] === 'pending' ? 'YES' : 'NO') . "\n";
    echo "  retries: " . $item['retries'] . "\n";
    echo "  max retries: " . MAX_RETRIES . "\n";
    echo "  retries >= max? " . ($item['retries'] >= MAX_RETRIES ? 'YES' : 'NO') . "\n";
    echo "  lastAttempt: " . $item['lastAttempt'] . "\n";
    echo "  time since: " . (time() - $item['lastAttempt']) . "\n";
    echo "  retry delay: " . RETRY_DELAY . "\n";
    
    if ($item['lastAttempt']) {
        echo "  time check: " . ((time() - $item['lastAttempt']) < RETRY_DELAY ? 'TOO SOON' : 'OK') . "\n";
    } else {
        echo "  time check: SKIP (lastAttempt is 0)\n";
    }
    echo "\n";
    break;
}
