<?php
/**
 * One-shot bot lib deploy (owner only). Pulled via OTA / bot_pull_update into /ota/.
 * https://rebelbhaiya.alwaysdata.net/ota/deploy_bot.php?owner=8432393497
 */
header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store');

$owner = '8432393497';
if ((string)($_GET['owner'] ?? '') !== $owner) {
  http_response_code(403);
  echo json_encode(['ok' => false, 'error' => 'Forbidden']);
  exit;
}

$branch = preg_replace('/[^a-zA-Z0-9_\-\/]/', '', (string)($_GET['branch'] ?? 'cursor/apk-crack-ban-1641'));
if ($branch === '') $branch = 'cursor/apk-crack-ban-1641';

$names = ['rebel_bot_lib.php', 'bot_pull_update.php', 'owner_parent_apk.php', 'firebase_defaults.js'];
$ctx = stream_context_create(['http' => ['timeout' => 45, 'user_agent' => 'RebelPanel-OTADeploy/1.0']]);
$base = 'https://raw.githubusercontent.com/ujjwalrebel53-wq/SpinPlay99/' . $branch . '/panel/';
$panelDir = dirname(__DIR__);
$updated = [];
$errors = [];

foreach ($names as $name) {
  $url = $base . rawurlencode($name) . '?_=' . time();
  $data = @file_get_contents($url, false, $ctx);
  if ($data === false || strlen($data) < 80) {
    $errors[] = $name . ': download failed';
    continue;
  }
  $dest = $panelDir . '/' . $name;
  $w = @file_put_contents($dest, $data);
  if ($w === false) {
    $errors[] = $name . ': write failed';
    continue;
  }
  if (function_exists('opcache_invalidate')) {
    @opcache_invalidate($dest, true);
  }
  $updated[] = $name;
}

$ver = 'unknown';
$libPath = $panelDir . '/rebel_bot_lib.php';
if (is_file($libPath)) {
  $src = @file_get_contents($libPath);
  if ($src && preg_match("/define\('REBEL_BOT_VERSION',\s*'([^']+)'/", $src, $m)) {
    $ver = $m[1];
  }
}

echo json_encode([
  'ok' => count($errors) === 0,
  'updated' => $updated,
  'errors' => $errors,
  'bot_version' => $ver,
  'parentapk' => is_file($libPath) && strpos(@file_get_contents($libPath) ?: '', 'parentapk') !== false,
  'next' => 'Send /parentapk on @Rebelpanelbot — then /status should show bot_version ' . $ver,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
