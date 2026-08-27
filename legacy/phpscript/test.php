<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Content-Type: application/json");


echo json_encode([
    "ok" => true,
    "msg" => "API InfinityFree OK"
]);
