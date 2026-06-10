<?php
/**
 * Browser unban tool (owner only). No bot/lib dependency.
 * https://rebelbhaiya.alwaysdata.net/owner_unban.php?owner=8432393497&action=bans
 * https://rebelbhaiya.alwaysdata.net/owner_unban.php?owner=8432393497&action=unbanall
 */
header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store');

$owner = '8432393497';
if ((string)($_GET['owner'] ?? '') !== $owner) {
  http_response_code(403);
  echo json_encode(['ok' => false, 'error' => 'Forbidden — wrong owner param']);
  exit;
}

$dataDir = __DIR__ . '/data';
$locksFile = $dataDir . '/rebel_device_locks.json';
$killFile = $dataDir . '/rebel_kill_switch.json';

function owner_unban_json_load($file) {
  if (!is_file($file)) return [];
  $j = json_decode(@file_get_contents($file) ?: '{}', true);
  return is_array($j) ? $j : [];
}

function owner_unban_json_save($file, $data) {
  $dir = dirname($file);
  if (!is_dir($dir)) @mkdir($dir, 0755, true);
  file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX);
}

function owner_unban_list($locksFile, $killFile) {
  $out = [];
  foreach (owner_unban_json_load($locksFile) as $fp => $row) {
    if (!is_array($row)) continue;
    $out[] = ['device_fp' => (string)$fp, 'reason' => (string)($row['reason'] ?? ''), 'source' => 'locks'];
  }
  $kill = owner_unban_json_load($killFile);
  if (!empty($kill['devices']) && is_array($kill['devices'])) {
    foreach ($kill['devices'] as $fp => $row) {
      if (!is_array($row)) continue;
      $found = false;
      foreach ($out as $o) {
        if ($o['device_fp'] === (string)$fp) { $found = true; break; }
      }
      if (!$found) {
        $out[] = ['device_fp' => (string)$fp, 'reason' => (string)($row['reason'] ?? ''), 'source' => 'kill_switch'];
      }
    }
  }
  return $out;
}

function owner_unban_all($locksFile, $killFile) {
  $count = 0;
  $locks = owner_unban_json_load($locksFile);
  if (is_array($locks)) $count += count($locks);
  owner_unban_json_save($locksFile, []);
  $kill = owner_unban_json_load($killFile);
  if (!empty($kill['devices']) && is_array($kill['devices'])) {
    $count += count($kill['devices']);
    $kill['devices'] = [];
    owner_unban_json_save($killFile, $kill);
  }
  return $count;
}

$action = strtolower(trim((string)($_GET['action'] ?? 'bans')));

if ($action === 'unbanall') {
  $n = owner_unban_all($locksFile, $killFile);
  echo json_encode(['ok' => true, 'action' => 'unbanall', 'cleared' => $n], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
  exit;
}

if ($action === 'unban') {
  $fp = trim((string)($_GET['fp'] ?? ''));
  if ($fp === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'fp param required']);
    exit;
  }
  $cleared = false;
  $locks = owner_unban_json_load($locksFile);
  if (isset($locks[$fp])) {
    unset($locks[$fp]);
    owner_unban_json_save($locksFile, $locks);
    $cleared = true;
  }
  $kill = owner_unban_json_load($killFile);
  if (!empty($kill['devices'][$fp])) {
    unset($kill['devices'][$fp]);
    owner_unban_json_save($killFile, $kill);
    $cleared = true;
  }
  echo json_encode(['ok' => $cleared, 'action' => 'unban', 'device_fp' => $fp], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
  exit;
}

$list = owner_unban_list($locksFile, $killFile);
echo json_encode([
  'ok' => true,
  'action' => 'bans',
  'count' => count($list),
  'devices' => $list,
  'unbanall_url' => '?owner=' . $owner . '&action=unbanall'
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
