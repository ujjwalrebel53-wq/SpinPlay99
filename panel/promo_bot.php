#!/usr/bin/env php
<?php
/**
 * Rebel Promo Bot — webhook + polling
 * Webhook: https://rebelbhaiya.alwaysdata.net/promo_bot.php?promo_webhook=1
 * Poll:    promo_bot.php?owner=8432393497&action=poll
 */
require_once __DIR__ . '/promo_bot_lib.php';

if (php_sapi_name() === 'cli') {
  promo_run_forever();
  exit;
}

header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store');

if (isset($_GET['promo_webhook'])) {
  $raw = file_get_contents('php://input');
  $update = json_decode($raw ?: '{}', true);
  if (is_array($update)) promo_handle_update($update);
  echo json_encode(['ok' => true]);
  exit;
}

if ((string)($_GET['owner'] ?? '') !== PROMO_OWNER_ID) {
  http_response_code(403);
  echo json_encode(['ok' => false, 'error' => 'Forbidden — owner id required']);
  exit;
}

$action = strtolower(trim((string)($_GET['action'] ?? 'status')));

if ($action === 'status') {
  echo json_encode([
    'ok' => true,
    'version' => PROMO_BOT_VERSION,
    'bot' => promo_tg_api('getMe', []),
    'webhook' => promo_tg_api('getWebhookInfo', []),
    'users' => promo_user_count(),
    'pack' => promo_pack_load(),
    'admin_url' => 'promo_bot_admin.php?owner=' . PROMO_OWNER_ID
  ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
  exit;
}

if ($action === 'webhook') {
  $r = promo_set_webhook();
  echo json_encode(['ok' => !empty($r['ok']), 'webhook' => promo_webhook_url(), 'telegram' => $r], JSON_PRETTY_PRINT);
  exit;
}

if ($action === 'start') {
  promo_tg_api('deleteWebhook', ['drop_pending_updates' => false]);
  echo json_encode(['ok' => true, 'mode' => 'polling']);
  exit;
}

$timeout = max(1, min(25, (int)($_GET['timeout'] ?? 2)));
echo json_encode(promo_poll_once($timeout), JSON_PRETTY_PRINT);
