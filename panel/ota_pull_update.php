<?php
/**
 * One-click OTA panel deploy (owner only).
 * Open: https://rebelbhaiya.alwaysdata.net/ota_pull_update.php?owner=8432393497
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
$otaDir = __DIR__ . '/ota';
if (!is_dir($otaDir)) @mkdir($otaDir, 0755, true);

$files = ['index.html', 'style.css', 'app.js', 'avatar.jpg'];
$updated = [];
$errors = [];
$ctx = stream_context_create(['http' => ['timeout' => 30, 'user_agent' => 'RebelPanel-OTA/1.0']]);

foreach ($files as $name) {
  $data = @file_get_contents($base . 'ota/' . rawurlencode($name), false, $ctx);
  if ($data === false || strlen($data) < 20) {
    $errors[] = $name . ': download failed';
    continue;
  }
  if (@file_put_contents($otaDir . '/' . $name, $data) === false) {
    $errors[] = $name . ': write failed';
    continue;
  }
  $updated[] = $name;
}

$manifest = @file_get_contents($base . 'panel_ota.json', false, $ctx);
$ver = 0;
if ($manifest) {
  @file_put_contents(__DIR__ . '/panel_ota.json', $manifest);
  $j = json_decode($manifest, true);
  if (is_array($j)) $ver = (int)($j['panel_version'] ?? 0);
}

echo json_encode([
  'ok' => count($errors) === 0,
  'updated' => $updated,
  'errors' => $errors,
  'panel_version' => $ver,
  'manifest' => 'panel_ota.json',
  'next' => 'Restart Rebel Panel app — OTA v' . $ver . ' will load automatically'
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
