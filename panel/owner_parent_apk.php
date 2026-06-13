<?php
/**
 * Owner-only Parent APK info / download gate
 * https://rebelbhaiya.alwaysdata.net/owner_parent_apk.php?owner=8432393497
 */
header('Content-Type: application/json; charset=utf-8');

$owner = '8432393497';
if ((string)($_GET['owner'] ?? '') !== $owner) {
  http_response_code(403);
  echo json_encode(['ok' => false, 'error' => 'Forbidden']);
  exit;
}

require_once __DIR__ . '/rebel_bot_lib.php';

$path = rebel_parent_apk_path();
$cfgFile = __DIR__ . '/data/parent_apk.json';
$cfg = is_file($cfgFile) ? json_decode(file_get_contents($cfgFile), true) : [];

if (isset($_GET['download']) && $path !== '') {
  header('Content-Type: application/vnd.android.package-archive');
  header('Content-Disposition: attachment; filename="RebelPanel-Parent.apk"');
  header('Content-Length: ' . filesize($path));
  readfile($path);
  exit;
}

echo json_encode([
  'ok' => true,
  'variant' => 'parent',
  'version' => $cfg['version'] ?? '',
  'has_local_file' => $path !== '',
  'download' => $path !== '' ? 'owner_parent_apk.php?owner=' . $owner . '&download=1' : null,
  'telegram' => '/parentapk on @Rebelpanelbot',
  'login' => '/genkeyparent',
  'note' => 'Parent APK is owner-only — users get the separate User APK via promo bot',
], JSON_UNESCAPED_SLASHES);
