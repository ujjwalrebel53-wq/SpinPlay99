#!/usr/bin/env php
<?php
require_once __DIR__ . '/rebel_bot_lib.php';

if (php_sapi_name() === 'cli') {
  $cmd = strtolower(trim((string)($argv[1] ?? '')));
  if ($cmd === 'revokeall') {
    $data = rebel_keys_load();
    $res = rebel_revoke_all_keys($data);
    rebel_keys_save($data);
    echo json_encode(['ok' => true] + $res, JSON_PRETTY_PRINT) . "\n";
    exit(0);
  }
  rebel_bot_run_forever();
  exit;
}

header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store');

if ((string)($_GET['owner'] ?? '') !== REBEL_OWNER_ID) {
  http_response_code(403);
  echo json_encode(['ok' => false, 'error' => 'Forbidden — owner id required']);
  exit;
}

$action = strtolower(trim((string)($_GET['action'] ?? (isset($_GET['poll']) ? 'poll' : 'poll'))));

if ($action === 'status') {
  echo json_encode([
    'ok' => true,
    'bot' => rebel_tg_api('getMe', []),
    'webhook' => rebel_tg_api('getWebhookInfo', []),
    'hint' => 'Run poll: rebel_bot.php?poll=1&owner=' . REBEL_OWNER_ID
  ]);
  exit;
}

if ($action === 'start') {
  rebel_tg_api('deleteWebhook', ['drop_pending_updates' => false]);
  echo json_encode(['ok' => true, 'mode' => 'polling', 'message' => 'Webhook removed. Use poll action or CLI php rebel_bot.php']);
  exit;
}

if ($action === 'revokeall') {
  $data = rebel_keys_load();
  $res = rebel_revoke_all_keys($data);
  rebel_keys_save($data);
  echo json_encode(['ok' => true] + $res);
  exit;
}

if ($action === 'webhook') {
  $hook = rebel_bot_webhook_url();
  if (strpos($hook, 'https://') !== 0) {
    echo json_encode(['ok' => false, 'error' => 'HTTPS required', 'url' => $hook]);
    exit;
  }
  $res = rebel_tg_set_webhook($hook);
  echo json_encode(['ok' => !empty($res['ok']), 'webhook' => $hook, 'telegram' => $res]);
  exit;
}

if ($action === 'ota' || $action === 'otaupdate') {
  if (!function_exists('rebel_ota_deploy_panel')) {
    echo json_encode(['ok' => false, 'error' => 'Update bot first: /updatebot or bot_pull_update.php']);
    exit;
  }
  $ota = rebel_ota_deploy_panel();
  echo json_encode([
    'ok' => count($ota['errors']) === 0,
    'ota_updated' => $ota['updated'],
    'errors' => $ota['errors'],
    'panel_version' => $ota['panel_version'],
    'next' => 'Restart Rebel Panel app'
  ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
  exit;
}

$timeout = max(1, min(25, (int)($_GET['timeout'] ?? 2)));
echo json_encode(rebel_bot_poll_once($timeout));
