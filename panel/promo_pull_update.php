<?php
/**
 * Deploy promo bot files to server
 * https://rebelbhaiya.alwaysdata.net/promo_pull_update.php?owner=8432393497
 */
header('Content-Type: application/json; charset=UTF-8');

$owner = '8432393497';
if ((string)($_GET['owner'] ?? '') !== $owner) {
  http_response_code(403);
  echo json_encode(['ok' => false, 'error' => 'Forbidden']);
  exit;
}

$branch = 'cursor/apk-crack-ban-1641';
$base = 'https://raw.githubusercontent.com/ujjwalrebel53-wq/SpinPlay99/' . $branch . '/panel/';
$files = ['promo_bot_config.php', 'promo_bot_lib.php', 'promo_bot.php', 'promo_bot_admin.php', 'promo_pull_update.php'];
$updated = [];
$errors = [];
$ctx = stream_context_create(['http' => ['timeout' => 30, 'user_agent' => 'PromoBot-Updater/1.0']]);

foreach ($files as $name) {
  $data = @file_get_contents($base . rawurlencode($name), false, $ctx);
  if ($data === false || strlen($data) < 30) {
    $errors[] = $name;
    continue;
  }
  if ($name === 'promo_bot_config.php' && is_file(__DIR__ . '/promo_bot_config.php')) {
    $local = @file_get_contents(__DIR__ . '/promo_bot_config.php');
    if ($local && strpos($local, 'PASTE_NEW_BOT_TOKEN') === false) {
      $updated[] = $name . ' (kept local token)';
      continue;
    }
  }
  if (@file_put_contents(__DIR__ . '/' . $name, $data) === false) {
    $errors[] = $name . ':write';
    continue;
  }
  $updated[] = $name;
}

echo json_encode([
  'ok' => count($errors) === 0,
  'updated' => $updated,
  'errors' => $errors,
  'next' => [
    '1' => 'Edit promo_bot_config.php → PROMO_BOT_TOKEN',
    '2' => 'Open promo_bot_admin.php?owner=' . $owner,
    '3' => 'Telegram: /webhook then /admin'
  ]
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
