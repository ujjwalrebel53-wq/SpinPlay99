<?php
/**
 * OTA panel deploy (owner only). Also works via:
 * bot_pull_update.php?owner=8432393497&action=ota
 * rebel_bot.php?action=ota&owner=8432393497
 */
require_once __DIR__ . '/rebel_bot_lib.php';

header('Content-Type: application/json; charset=UTF-8');

if ((string)($_GET['owner'] ?? '') !== REBEL_OWNER_ID) {
  http_response_code(403);
  echo json_encode(['ok' => false, 'error' => 'Forbidden']);
  exit;
}

$ota = rebel_ota_deploy_panel();
echo json_encode([
  'ok' => count($ota['errors']) === 0,
  'ota_updated' => $ota['updated'],
  'errors' => $ota['errors'],
  'panel_version' => $ota['panel_version'],
  'next' => 'Restart Rebel Panel app — OTA v' . $ota['panel_version']
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
