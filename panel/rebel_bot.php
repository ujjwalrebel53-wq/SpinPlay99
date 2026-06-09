#!/usr/bin/env php
<?php
require_once __DIR__ . '/rebel_bot_lib.php';

if (php_sapi_name() === 'cli') {
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

$timeout = max(1, min(25, (int)($_GET['timeout'] ?? 2)));
echo json_encode(rebel_bot_poll_once($timeout));
