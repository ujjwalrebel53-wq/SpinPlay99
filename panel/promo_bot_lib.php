<?php
require_once __DIR__ . '/promo_bot_config.php';

define('PROMO_USERS_FILE', __DIR__ . '/data/promo_bot_users.json');
define('PROMO_PACK_FILE', __DIR__ . '/data/promo_bot_pack.json');
define('PROMO_OFFSET_FILE', __DIR__ . '/data/promo_bot_offset.txt');
define('PROMO_BROADCAST_LOG', __DIR__ . '/data/promo_bot_broadcast.log');

function promo_json_load($file) {
  if (!is_file($file)) return [];
  $j = json_decode(@file_get_contents($file) ?: '{}', true);
  return is_array($j) ? $j : [];
}

function promo_json_save($file, $data) {
  $dir = dirname($file);
  if (!is_dir($dir)) @mkdir($dir, 0755, true);
  file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX);
}

function promo_default_pack() {
  return [
    'welcome_text' => "🔥 <b>Rebel Panel</b>\n\nLatest APK neeche hai.\nVideo dekho → install karo → enjoy!",
    'video_file_id' => '',
    'video_note' => '',
    'apk_file_id' => '',
    'apk_url' => 'https://github.com/ujjwalrebel53-wq/SpinPlay99/releases/download/rebel-panel-v4.1.3/RebelPanel-v4.1.3.apk',
    'apk_filename' => 'RebelPanel.apk',
    'updated_at' => time(),
    'updated_by' => PROMO_OWNER_ID
  ];
}

function promo_pack_load() {
  $data = promo_json_load(PROMO_PACK_FILE);
  if (!$data) $data = promo_default_pack();
  return array_merge(promo_default_pack(), $data);
}

function promo_pack_save($pack) {
  $pack['updated_at'] = time();
  promo_json_save(PROMO_PACK_FILE, $pack);
}

function promo_users_load() {
  $data = promo_json_load(PROMO_USERS_FILE);
  if (!isset($data['users']) || !is_array($data['users'])) $data['users'] = [];
  return $data;
}

function promo_users_save($data) {
  promo_json_save(PROMO_USERS_FILE, $data);
}

function promo_user_count() {
  return count(promo_users_load()['users']);
}

function promo_register_user($from) {
  if (!is_array($from)) return;
  $id = (string)($from['id'] ?? '');
  if ($id === '') return;
  $data = promo_users_load();
  $now = time();
  $row = [
    'id' => $id,
    'username' => (string)($from['username'] ?? ''),
    'first_name' => (string)($from['first_name'] ?? ''),
    'last_name' => (string)($from['last_name'] ?? ''),
    'joined' => (int)($data['users'][$id]['joined'] ?? $now),
    'last_seen' => $now
  ];
  $data['users'][$id] = $row;
  promo_users_save($data);
}

function promo_is_owner($fromId) {
  return (string)$fromId === (string)PROMO_OWNER_ID;
}

function promo_tg_api($method, $params = []) {
  $url = 'https://api.telegram.org/bot' . PROMO_BOT_TOKEN . '/' . $method;
  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 60,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    CURLOPT_POSTFIELDS => json_encode($params)
  ]);
  $raw = curl_exec($ch);
  curl_close($ch);
  $j = json_decode($raw ?: '{}', true);
  return is_array($j) ? $j : ['ok' => false, 'description' => 'bad response'];
}

function promo_tg_send($chatId, $text, $extra = []) {
  $params = array_merge([
    'chat_id' => $chatId,
    'text' => $text,
    'parse_mode' => 'HTML',
    'disable_web_page_preview' => false
  ], $extra);
  return promo_tg_api('sendMessage', $params);
}

function promo_webhook_url() {
  $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'https';
  $host = $_SERVER['HTTP_HOST'] ?? 'rebelbhaiya.alwaysdata.net';
  return $scheme . '://' . $host . '/promo_bot.php?promo_webhook=1';
}

function promo_set_webhook() {
  $url = promo_webhook_url();
  if (strpos($url, 'https://') !== 0) {
    return ['ok' => false, 'description' => 'HTTPS required'];
  }
  return promo_tg_api('setWebhook', ['url' => $url, 'drop_pending_updates' => false]);
}

function promo_norm_cmd($text) {
  $text = trim((string)$text);
  if ($text === '') return '';
  $text = preg_replace('/@\w+/u', '', $text);
  return trim($text);
}

function promo_send_welcome_pack($chatId) {
  $pack = promo_pack_load();
  $sent = 0;
  $errors = [];

  if (!empty($pack['welcome_text'])) {
    $r = promo_tg_send($chatId, $pack['welcome_text']);
    if (!empty($r['ok'])) $sent++; else $errors[] = 'text';
  }

  if (!empty($pack['video_file_id'])) {
    $r = promo_tg_api('sendVideo', [
      'chat_id' => $chatId,
      'video' => $pack['video_file_id'],
      'caption' => (string)($pack['video_note'] ?? ''),
      'parse_mode' => 'HTML'
    ]);
    if (!empty($r['ok'])) $sent++; else $errors[] = 'video';
  }

  $apkSent = false;
  if (!empty($pack['apk_file_id'])) {
    $r = promo_tg_api('sendDocument', [
      'chat_id' => $chatId,
      'document' => $pack['apk_file_id'],
      'caption' => '📱 ' . ($pack['apk_filename'] ?? 'RebelPanel.apk')
    ]);
    if (!empty($r['ok'])) { $sent++; $apkSent = true; }
    else $errors[] = 'apk_file';
  }
  if (!$apkSent && !empty($pack['apk_url'])) {
    $r = promo_tg_api('sendDocument', [
      'chat_id' => $chatId,
      'document' => $pack['apk_url'],
      'caption' => '📱 ' . ($pack['apk_filename'] ?? 'RebelPanel.apk')
    ]);
    if (!empty($r['ok'])) $sent++;
    else {
      $r2 = promo_tg_send($chatId, "📱 <b>Download APK</b>\n" . $pack['apk_url']);
      if (!empty($r2['ok'])) $sent++; else $errors[] = 'apk_url';
    }
  }

  return ['sent' => $sent, 'errors' => $errors];
}

function promo_admin_panel_text() {
  $pack = promo_pack_load();
  $n = promo_user_count();
  $txt = !empty($pack['welcome_text']) ? '✅' : '❌';
  $vid = !empty($pack['video_file_id']) ? '✅' : '❌';
  $apk = (!empty($pack['apk_file_id']) || !empty($pack['apk_url'])) ? '✅' : '❌';
  return "🛠 <b>Promo Bot Admin</b>\n\n"
    . "👥 Users: <b>" . $n . "</b>\n"
    . "📝 Text: $txt\n"
    . "🎬 Video: $vid\n"
    . "📱 APK: $apk\n"
    . "🕐 Updated: " . date('d M Y, h:i A', (int)($pack['updated_at'] ?? 0)) . "\n\n"
    . "<b>Edit commands</b>\n"
    . "/settext message — welcome text (HTML ok)\n"
    . "/setvideo — video par reply karke bhejo\n"
    . "/setapk — APK file par reply karke bhejo\n"
    . "/setapkurl URL — APK download link\n"
    . "/setapkname RebelPanel.apk — file name\n"
    . "/preview — /start pack test karo\n\n"
    . "<b>Broadcast</b>\n"
    . "/broadcast message — sab users ko text\n"
    . "/broadcastmedia — photo/video/doc par reply\n"
    . "/users — user count + recent\n"
    . "/webhook — webhook set\n"
    . "/poll — polling mode";
}

function promo_broadcast_text($text) {
  $users = promo_users_load()['users'];
  $ok = 0; $fail = 0;
  foreach ($users as $uid => $row) {
    $r = promo_tg_send($uid, $text);
    if (!empty($r['ok'])) $ok++; else $fail++;
    usleep(35000);
  }
  @file_put_contents(PROMO_BROADCAST_LOG, date('c') . " text ok=$ok fail=$fail\n", FILE_APPEND);
  return ['ok' => $ok, 'fail' => $fail, 'total' => count($users)];
}

function promo_broadcast_media($fromMsg, $caption) {
  $users = promo_users_load()['users'];
  $method = '';
  $field = '';
  $fileId = '';
  if (!empty($fromMsg['video'])) {
    $method = 'sendVideo'; $field = 'video'; $fileId = $fromMsg['video']['file_id'];
  } elseif (!empty($fromMsg['document'])) {
    $method = 'sendDocument'; $field = 'document'; $fileId = $fromMsg['document']['file_id'];
  } elseif (!empty($fromMsg['photo'])) {
    $method = 'sendPhoto'; $field = 'photo';
    $photos = $fromMsg['photo'];
    $fileId = $photos[count($photos) - 1]['file_id'];
  }
  if ($method === '' || $fileId === '') return ['ok' => 0, 'fail' => 0, 'total' => 0, 'error' => 'no_media'];

  $ok = 0; $fail = 0;
  foreach ($users as $uid => $row) {
    $params = ['chat_id' => $uid, $field => $fileId];
    if ($caption !== '') {
      $params['caption'] = $caption;
      $params['parse_mode'] = 'HTML';
    }
    $r = promo_tg_api($method, $params);
    if (!empty($r['ok'])) $ok++; else $fail++;
    usleep(50000);
  }
  @file_put_contents(PROMO_BROADCAST_LOG, date('c') . " media ok=$ok fail=$fail\n", FILE_APPEND);
  return ['ok' => $ok, 'fail' => $fail, 'total' => count($users)];
}

function promo_handle_update($update) {
  $msg = $update['message'] ?? null;
  if (!$msg) return false;

  $chatId = (string)($msg['chat']['id'] ?? '');
  $fromId = (string)($msg['from']['id'] ?? '');
  $text = promo_norm_cmd($msg['text'] ?? $msg['caption'] ?? '');
  if ($chatId === '' || $fromId === '') return false;

  $isOwner = promo_is_owner($fromId);

  if (preg_match('/^\/start\b/i', $text)) {
    promo_register_user($msg['from'] ?? []);
    promo_send_welcome_pack($chatId);
    return true;
  }

  if (!$isOwner) {
    promo_register_user($msg['from'] ?? []);
    promo_tg_send($chatId, "👋 /start bhejo — video + APK milega.");
    return true;
  }

  if (preg_match('/^\/admin\b/i', $text)) {
    promo_tg_send($chatId, promo_admin_panel_text());
    return true;
  }

  if (preg_match('/^\/users\b/i', $text) || preg_match('/^\/stats\b/i', $text)) {
    $users = promo_users_load()['users'];
    $lines = [];
    $i = 0;
    foreach ($users as $u) {
      if ($i++ >= 15) break;
      $name = trim(($u['first_name'] ?? '') . ' ' . ($u['last_name'] ?? ''));
      $un = !empty($u['username']) ? '@' . $u['username'] : $u['id'];
      $lines[] = '• ' . htmlspecialchars($un, ENT_QUOTES, 'UTF-8') . ' · ' . htmlspecialchars($name ?: '—', ENT_QUOTES, 'UTF-8');
    }
    promo_tg_send($chatId, "👥 <b>Users: " . count($users) . "</b>\n\n" . ($lines ? implode("\n", $lines) : 'Koi user nahi abhi.') . (count($users) > 15 ? "\n\n…+" . (count($users) - 15) . " more" : ''));
    return true;
  }

  if (preg_match('/^\/preview\b/i', $text)) {
    promo_send_welcome_pack($chatId);
    return true;
  }

  if (preg_match('/^\/settext\s+(.+)/is', $text, $m)) {
    $pack = promo_pack_load();
    $pack['welcome_text'] = trim($m[1]);
    $pack['updated_by'] = $fromId;
    promo_pack_save($pack);
    promo_tg_send($chatId, "✅ Welcome text saved.\n/preview se check karo.");
    return true;
  }

  if (preg_match('/^\/setapkurl\s+(\S+)/i', $text, $m)) {
    $pack = promo_pack_load();
    $pack['apk_url'] = trim($m[1]);
    $pack['updated_by'] = $fromId;
    promo_pack_save($pack);
    promo_tg_send($chatId, "✅ APK URL saved:\n<code>" . htmlspecialchars($pack['apk_url'], ENT_QUOTES, 'UTF-8') . "</code>");
    return true;
  }

  if (preg_match('/^\/setapkname\s+(.+)/i', $text, $m)) {
    $pack = promo_pack_load();
    $pack['apk_filename'] = trim($m[1]);
    promo_pack_save($pack);
    promo_tg_send($chatId, "✅ APK filename: <code>" . htmlspecialchars($pack['apk_filename'], ENT_QUOTES, 'UTF-8') . "</code>");
    return true;
  }

  if (preg_match('/^\/setvideo\b/i', $text)) {
    $reply = $msg['reply_to_message'] ?? null;
    if (!$reply || empty($reply['video']['file_id'])) {
      promo_tg_send($chatId, "🎬 Video message par <b>reply</b> karke /setvideo bhejo.");
      return true;
    }
    $pack = promo_pack_load();
    $pack['video_file_id'] = $reply['video']['file_id'];
    promo_pack_save($pack);
    promo_tg_send($chatId, "✅ Promo video saved.");
    return true;
  }

  if (preg_match('/^\/setapk\b/i', $text)) {
    $reply = $msg['reply_to_message'] ?? null;
    if (!$reply || empty($reply['document']['file_id'])) {
      promo_tg_send($chatId, "📱 APK file (document) par <b>reply</b> karke /setapk bhejo.");
      return true;
    }
    $pack = promo_pack_load();
    $pack['apk_file_id'] = $reply['document']['file_id'];
    if (!empty($reply['document']['file_name'])) $pack['apk_filename'] = $reply['document']['file_name'];
    promo_pack_save($pack);
    promo_tg_send($chatId, "✅ APK file saved on Telegram.");
    return true;
  }

  if (preg_match('/^\/broadcast\s+(.+)/is', $text, $m)) {
    $body = trim($m[1]);
    if ($body === '') {
      promo_tg_send($chatId, "Usage: /broadcast your message");
      return true;
    }
    promo_tg_send($chatId, "📡 Broadcasting to " . promo_user_count() . " users...");
    $res = promo_broadcast_text($body);
    promo_tg_send($chatId, "✅ Done\nSent: " . $res['ok'] . "\nFailed: " . $res['fail'] . "\nTotal: " . $res['total']);
    return true;
  }

  if (preg_match('/^\/broadcastmedia\b/i', $text)) {
    $reply = $msg['reply_to_message'] ?? null;
    if (!$reply) {
      promo_tg_send($chatId, "Photo/video/document par reply karke /broadcastmedia [caption] bhejo.");
      return true;
    }
    $caption = trim(preg_replace('/^\/broadcastmedia\s*/i', '', $text));
    promo_tg_send($chatId, "📡 Media broadcast → " . promo_user_count() . " users...");
    $res = promo_broadcast_media($reply, $caption);
    if (!empty($res['error'])) {
      promo_tg_send($chatId, "❌ Media not found in reply.");
      return true;
    }
    promo_tg_send($chatId, "✅ Done\nSent: " . $res['ok'] . "\nFailed: " . $res['fail']);
    return true;
  }

  if (preg_match('/^\/webhook\b/i', $text)) {
    $r = promo_set_webhook();
    promo_tg_send($chatId, !empty($r['ok']) ? "✅ Webhook set:\n<code>" . htmlspecialchars(promo_webhook_url(), ENT_QUOTES, 'UTF-8') . "</code>" : ("❌ " . ($r['description'] ?? 'failed')));
    return true;
  }

  if (preg_match('/^\/poll\b/i', $text)) {
    promo_tg_api('deleteWebhook', ['drop_pending_updates' => false]);
    promo_tg_send($chatId, "✅ Polling ON.\nCron:\n<code>curl \"" . htmlspecialchars(promo_webhook_url(), ENT_QUOTES, 'UTF-8') . "&owner=" . PROMO_OWNER_ID . "&action=poll\"</code>");
    return true;
  }

  promo_tg_send($chatId, "Unknown.\n/admin — control panel");
  return true;
}

function promo_poll_once($timeout = 2) {
  $offset = 0;
  if (is_file(PROMO_OFFSET_FILE)) $offset = (int)trim((string)@file_get_contents(PROMO_OFFSET_FILE));
  $res = promo_tg_api('getUpdates', [
    'offset' => $offset,
    'timeout' => max(1, min(25, (int)$timeout)),
    'allowed_updates' => ['message']
  ]);
  if (empty($res['ok'])) return ['ok' => false, 'error' => $res['description'] ?? 'getUpdates failed'];
  $handled = 0;
  foreach ($res['result'] ?? [] as $u) {
    $uid = (int)($u['update_id'] ?? 0);
    if ($uid >= $offset) $offset = $uid + 1;
    if (promo_handle_update($u)) $handled++;
  }
  @file_put_contents(PROMO_OFFSET_FILE, (string)$offset);
  return ['ok' => true, 'handled' => $handled, 'offset' => $offset];
}

function promo_run_forever() {
  echo "Promo bot polling... Ctrl+C to stop\n";
  while (true) {
    promo_poll_once(25);
    usleep(200000);
  }
}
