<?php
define('REBEL_BOT_TOKEN', '8952674967:AAGivOmzdznNBdRK2j_trdnnwv5lCDX8caA');
define('REBEL_OWNER_ID', '8432393497');
define('REBEL_BOT_USERNAME', 'Rebelpanelbot');
define('REBEL_KEYS_FILE', __DIR__ . '/data/rebel_keys.json');
define('REBEL_POLL_OFFSET_FILE', __DIR__ . '/data/rebel_bot_offset.txt');

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

function rebel_key_valid(&$data, $key) {
  $key = rebel_norm_key($key);
  if ($key === '' || !isset($data['keys'][$key])) return false;
  $row = $data['keys'][$key];
  if (empty($row['active'])) return false;
  if (!empty($row['expires']) && time() > (int)$row['expires']) {
    $data['keys'][$key]['active'] = false;
    return false;
  }
  return $key;
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
    rebel_tg_send($chatId, "🤖 <b>Rebel Panel Key Bot</b> (@Rebelpanelbot)\n\n/genkey [days] — New access key (default 30 days)\n/keys — List active keys\n/revoke RBL-XXX — Revoke key\n/status — Bot status\n/poll — Start polling mode\n/webhook — Enable webhook mode");
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
    rebel_tg_send($chatId, "✅ Polling mode ON.\n\nServer par ye command chalao:\n<code>php rebel_bot.php</code>\n\nYa cron:\n<code>curl \"YOUR_DOMAIN/panel/rebel_bot.php?poll=1&owner=8432393497\"</code>");
    return true;
  }

  if (preg_match('/^\/webhook\b/i', $text) || preg_match('/^\/setwebhook\b/i', $text)) {
    $hook = rebel_bot_webhook_url();
    if (strpos($hook, 'https://') !== 0) {
      rebel_tg_send($chatId, "❌ Webhook ke liye HTTPS domain chahiye.\nAbhi: <code>" . htmlspecialchars($hook, ENT_QUOTES, 'UTF-8') . "</code>\n\nPolling use karo: /poll");
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
      'uses' => 0,
      'label' => 'tg-' . date('dM-Hi')
    ];
    rebel_keys_save($data);
    $exp = $days > 0 ? ("\n⏳ Expires: " . date('d M Y, h:i A', $data['keys'][$key]['expires'])) : "\n♾️ No expiry";
    rebel_tg_send($chatId, "🔑 <b>New Rebel Panel Key</b>\n\n<code>" . $key . "</code>" . $exp . "\n\nPanel me yahi key paste karo.");
    return true;
  }

  if (preg_match('/^\/keys\b/i', $text)) {
    $data = rebel_keys_load();
    $lines = [];
    foreach ($data['keys'] as $k => $row) {
      if (empty($row['active'])) continue;
      if (!empty($row['expires']) && time() > (int)$row['expires']) continue;
      $mask = substr($k, 0, 8) . '••••';
      $uses = (int)($row['uses'] ?? 0);
      $lines[] = '• <code>' . $mask . '</code> · uses ' . $uses;
    }
    rebel_tg_send($chatId, $lines ? ("📋 <b>Active Keys</b>\n\n" . implode("\n", $lines)) : "📋 No active keys.");
    return true;
  }

  if (preg_match('/^\/revoke\s+(RBL-[A-Z0-9\-]+)/i', $text, $m)) {
    $key = rebel_norm_key($m[1]);
    $data = rebel_keys_load();
    if (!isset($data['keys'][$key])) {
      rebel_tg_send($chatId, "❌ Key not found.");
      return true;
    }
    $data['keys'][$key]['active'] = false;
    rebel_keys_save($data);
    rebel_tg_send($chatId, "✅ Revoked:\n<code>" . $key . "</code>");
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
    'allowed_updates' => ['message']
  ]);
  if (empty($res['ok'])) return ['ok' => false, 'error' => $res['description'] ?? 'getUpdates failed', 'handled' => 0];
  $handled = 0;
  foreach ($res['result'] ?? [] as $u) {
    $offset = (int)$u['update_id'] + 1;
    if (rebel_bot_handle($u)) $handled++;
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
