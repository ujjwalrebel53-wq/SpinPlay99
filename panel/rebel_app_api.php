<?php
require_once __DIR__ . '/rebel_app_lib.php';

header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store, no-cache, must-revalidate');

$action = strtolower(trim((string)($_GET['action'] ?? $_POST['action'] ?? 'manifest')));

if ($action === 'manifest') {
  if (rebel_app_is_apk_request() && !rebel_app_attest_valid(false)) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Invalid APK signature']);
    exit;
  }
  $cfg = rebel_app_update_load();
  echo json_encode([
    'ok' => true,
    'min_apk_version' => (int)$cfg['min_apk_version'],
    'latest_apk_version' => (int)$cfg['latest_apk_version'],
    'apk_url' => (string)$cfg['apk_url'],
    'panel_url' => (string)$cfg['panel_url'],
    'panel_version' => (int)$cfg['panel_version'],
    'force_update' => !empty($cfg['force_update']),
    'message' => (string)$cfg['message'],
    'server_time' => time(),
  ]);
  exit;
}

http_response_code(400);
echo json_encode(['ok' => false, 'error' => 'Unknown action']);
