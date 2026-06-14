<?php
/**
 * One-click server update: bot + auth + OTA panel (owner only).
 * Open: https://rebelbhaiya.alwaysdata.net/bot_pull_update.php?owner=8432393497
 * OTA only: ?owner=8432393497&action=ota
 */
header('Content-Type: application/json; charset=UTF-8');

$owner = '8432393497';
if ((string)($_GET['owner'] ?? '') !== $owner) {
  http_response_code(403);
  echo json_encode(['ok' => false, 'error' => 'Forbidden — wrong owner param']);
  exit;
}

$branch = preg_replace('/[^a-zA-Z0-9_\-\/]/', '', (string)($_GET['branch'] ?? 'cursor/final-encrypted-apk-1641'));
if ($branch === '') $branch = 'cursor/final-encrypted-apk-1641';
$base = 'https://raw.githubusercontent.com/ujjwalrebel53-wq/SpinPlay99/' . $branch . '/panel/';
$action = strtolower(trim((string)($_GET['action'] ?? 'all')));
$ctx = stream_context_create(['http' => ['timeout' => 30, 'user_agent' => 'RebelPanel-Updater/1.0']]);

function rebel_standalone_ota_deploy($base, $panelDir, $ctx) {
  $otaDir = $panelDir . '/ota';
  if (!is_dir($otaDir)) @mkdir($otaDir, 0755, true);
  $files = ['index.html', 'style.css', 'app.js', 'avatar.jpg', 'deploy_bot.php', 'firebase_defaults.js'];
  $updated = [];
  $errors = [];
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
    $updated[] = 'ota/' . $name;
  }
  $manifest = @file_get_contents($base . 'panel_ota.json', false, $ctx);
  $ver = 0;
  if ($manifest && @file_put_contents($panelDir . '/panel_ota.json', $manifest) !== false) {
    $updated[] = 'panel_ota.json';
    $j = json_decode($manifest, true);
    if (is_array($j)) $ver = (int)($j['panel_version'] ?? 0);
  } else {
    $errors[] = 'panel_ota.json: failed';
  }
  return ['updated' => $updated, 'errors' => $errors, 'panel_version' => $ver];
}

if ($action === 'ota') {
  $ota = rebel_standalone_ota_deploy($base, __DIR__, $ctx);
  echo json_encode([
    'ok' => count($ota['errors']) === 0,
    'action' => 'ota',
    'ota_updated' => $ota['updated'],
    'errors' => $ota['errors'],
    'panel_version' => $ota['panel_version'],
    'next' => 'Restart Rebel Panel app — OTA v' . $ota['panel_version'] . ' loads automatically'
  ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
  exit;
}

$files = [
  'rebel_bot_lib.php',
  'rebel_secure_lib.php',
  'rebel_secure_api.php',
  'phone.php',
  'sex.php',
  'laptop.php',
  'firebase_defaults.js',
  'rebel_bot.php',
  'owner_unban.php',
  'owner_parent_apk.php',
  'bot_pull_update.php',
  'ota_pull_update.php',
];

$updated = [];
$errors = [];
foreach ($files as $name) {
  $url = $base . rawurlencode($name);
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

$ota = rebel_standalone_ota_deploy($base, __DIR__, $ctx);

$ver = 'unknown';
$lib = __DIR__ . '/rebel_bot_lib.php';
if (is_file($lib)) {
  $src = @file_get_contents($lib);
  if ($src && preg_match("/define\('REBEL_BOT_VERSION',\s*'([^']+)'/", $src, $m)) {
    $ver = $m[1];
  }
}

echo json_encode([
  'ok' => count($errors) === 0 && count($ota['errors']) === 0,
  'updated' => $updated,
  'ota_updated' => $ota['updated'],
  'errors' => array_merge($errors, $ota['errors']),
  'bot_version' => $ver,
  'panel_version' => $ota['panel_version'],
  'genkeyapk' => strpos(@file_get_contents($lib) ?: '', 'genkeyapk') !== false,
  'next' => 'Restart Rebel Panel app for OTA v' . $ota['panel_version'] . ' (hamburger menu, solid UI)'
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
