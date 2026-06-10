<?php
/**
 * One-click server update for bot + auth files (owner only).
 * Open: https://rebelbhaiya.alwaysdata.net/bot_pull_update.php?owner=8432393497
 */
header('Content-Type: application/json; charset=UTF-8');

$owner = '8432393497';
if ((string)($_GET['owner'] ?? '') !== $owner) {
  http_response_code(403);
  echo json_encode(['ok' => false, 'error' => 'Forbidden — wrong owner param']);
  exit;
}

$branch = 'cursor/apk-crack-ban-1641';
$base = 'https://raw.githubusercontent.com/ujjwalrebel53-wq/SpinPlay99/' . $branch . '/panel/';
$files = [
  'rebel_bot_lib.php',
  'rebel_secure_lib.php',
  'rebel_secure_api.php',
  'phone.php',
  'rebel_bot.php',
];

$updated = [];
$errors = [];
foreach ($files as $name) {
  $url = $base . rawurlencode($name);
  $ctx = stream_context_create(['http' => ['timeout' => 30, 'user_agent' => 'RebelPanel-Updater/1.0']]);
  $data = @file_get_contents($url, false, $ctx);
  if ($data === false || strlen($data) < 50) {
    $errors[] = $name . ': download failed';
    continue;
  }
  $dest = __DIR__ . '/' . $name;
  if (@file_put_contents($dest, $data) === false) {
    $errors[] = $name . ': write failed';
    continue;
  }
  $updated[] = $name;
}

$ver = 'unknown';
$lib = __DIR__ . '/rebel_bot_lib.php';
if (is_file($lib)) {
  $src = @file_get_contents($lib);
  if ($src && preg_match("/define\('REBEL_BOT_VERSION',\s*'([^']+)'/", $src, $m)) {
    $ver = $m[1];
  }
}

echo json_encode([
  'ok' => count($errors) === 0,
  'updated' => $updated,
  'errors' => $errors,
  'bot_version' => $ver,
  'genkeyapk' => strpos(@file_get_contents($lib) ?: '', 'genkeyapk') !== false,
  'next' => 'Telegram bot: send /genkeyapk or /apk',
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
