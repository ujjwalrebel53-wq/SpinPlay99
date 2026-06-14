<?php
/**
 * Secure auth: HMAC requests, device-bound JWT, refresh tokens.
 */
require_once __DIR__ . '/rebel_bot_lib.php';

define('REBEL_SECURE_SECRET', 'rbl_app_xK9m2pQ7nL4wR8vT3hJ6fY1bN5cD0eA');
define('REBEL_DEVICE_LOCKS_FILE', __DIR__ . '/data/rebel_device_locks.json');
define('REBEL_SUSPICIOUS_FILE', __DIR__ . '/data/rebel_suspicious.json');
define('REBEL_ACCESS_TTL', 900);
define('REBEL_REFRESH_TTL', 7 * 86400);
define('REBEL_HMAC_SKEW', 300);
define('REBEL_KILL_SWITCH_FILE', __DIR__ . '/data/rebel_kill_switch.json');
define('REBEL_NONCE_FILE', __DIR__ . '/data/rebel_nonces.json');
define('REBEL_MIN_APK_VERSION', 17); // match app versionCode

function rebel_secure_json_load($file) {
  if (!is_file($file)) return [];
  $j = json_decode(@file_get_contents($file) ?: '{}', true);
  return is_array($j) ? $j : [];
}

function rebel_secure_json_save($file, $data) {
  $dir = dirname($file);
  if (!is_dir($dir)) @mkdir($dir, 0755, true);
  file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX);
}

function rebel_b64url_enc($data) {
  return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function rebel_b64url_dec($data) {
  $pad = 4 - (strlen($data) % 4);
  if ($pad < 4) $data .= str_repeat('=', $pad);
  return base64_decode(strtr($data, '-_', '+/'));
}

function rebel_jwt_issue($payload, $ttl) {
  $header = rebel_b64url_enc(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
  $payload['iat'] = time();
  $payload['exp'] = time() + (int)$ttl;
  $body = rebel_b64url_enc(json_encode($payload));
  $sig = rebel_b64url_enc(hash_hmac('sha256', $header . '.' . $body, REBEL_SECURE_SECRET, true));
  return $header . '.' . $body . '.' . $sig;
}

function rebel_jwt_verify($jwt) {
  $jwt = trim((string)$jwt);
  $parts = explode('.', $jwt);
  if (count($parts) !== 3) return null;
  [$h, $b, $s] = $parts;
  $expected = rebel_b64url_enc(hash_hmac('sha256', $h . '.' . $b, REBEL_SECURE_SECRET, true));
  if (!hash_equals($expected, $s)) return null;
  $payload = json_decode(rebel_b64url_dec($b), true);
  if (!is_array($payload)) return null;
  if (($payload['exp'] ?? 0) < time()) return null;
  return $payload;
}

function rebel_verify_signed_request() {
  $raw = file_get_contents('php://input') ?: '{}';
  $env = json_decode($raw, true);
  if (!is_array($env)) rebel_json_out(['ok' => false, 'error' => 'Bad request'], 400);
  $ts = (int)($env['ts'] ?? 0);
  $deviceFp = trim((string)($env['device_fp'] ?? ''));
  $sig = trim((string)($env['sig'] ?? ''));
  $body = $env['body'] ?? null;
  if ($ts < 1 || $deviceFp === '' || $sig === '' || !is_array($body)) {
    rebel_json_out(['ok' => false, 'error' => 'Bad request'], 400);
  }
  if (abs(time() - $ts) > REBEL_HMAC_SKEW) {
    rebel_json_out(['ok' => false, 'error' => 'Request expired'], 403);
  }
  $locks = rebel_secure_json_load(REBEL_DEVICE_LOCKS_FILE);
  if (!empty($locks[$deviceFp]['permanent'])) {
    $r = (string)($locks[$deviceFp]['reason'] ?? '');
    $isCrack = (strpos($r, 'crack') !== false || strpos($r, 'apk_') !== false || strpos($r, 'dex_') !== false || strpos($r, 'resign') !== false);
    rebel_json_out([
      'ok' => false,
      'banned' => true,
      'error' => $isCrack ? 'crack_banned' : 'Device locked',
      'message' => $isCrack ? 'Fuck you bitch! You have tried to crack the APK. Your device is permanently banned.' : 'Device locked'
    ], 403);
  }
  $bodyJson = trim((string)($env['body_json'] ?? ''));
  if ($bodyJson === '' || json_decode($bodyJson, true) === null) {
    $bodyJson = json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
  }
  $payload = $ts . ':' . $deviceFp . ':' . $bodyJson;
  $expected = base64_encode(hash_hmac('sha256', $payload, REBEL_SECURE_SECRET, true));
  if (!hash_equals($expected, $sig)) {
    rebel_json_out(['ok' => false, 'error' => 'Invalid signature'], 403);
  }
  $nonce = trim((string)($body['nonce'] ?? ''));
  if ($nonce !== '') {
    $nonces = rebel_secure_json_load(REBEL_NONCE_FILE);
    if (isset($nonces[$nonce])) rebel_json_out(['ok' => false, 'error' => 'Replay'], 403);
    $nonces[$nonce] = time();
    foreach ($nonces as $k => $t) if (time() - (int)$t > 600) unset($nonces[$k]);
    rebel_secure_json_save(REBEL_NONCE_FILE, $nonces);
  }
  $kill = rebel_secure_json_load(REBEL_KILL_SWITCH_FILE);
  if (!empty($kill['global_kill'])) {
    rebel_json_out(['ok' => false, 'kill' => true, 'error' => 'Disabled'], 403);
  }
  if (!empty($kill['devices'][$deviceFp])) {
    rebel_json_out(['ok' => false, 'kill' => true, 'error' => 'Device disabled'], 403);
  }
  $minApk = (int)($kill['min_apk_version'] ?? REBEL_MIN_APK_VERSION);
  $clientApk = (int)($body['apk_version'] ?? 0);
  if ($clientApk > 0 && $clientApk < $minApk) {
    rebel_json_out(['ok' => false, 'kill' => true, 'min_apk_version' => $minApk], 403);
  }
  return ['body' => $body, 'device_fp' => $deviceFp];
}

function rebel_server_env_ok($body) {
  if (!empty($body['root'])) return false;
  if (!empty($body['emulator'])) return false;
  if (!empty($body['debugger'])) return false;
  if (!empty($body['hooks'])) return false;
  return true;
}

function rebel_device_bind_key(&$data, $key, $deviceFp) {
  $row = $data['keys'][$key] ?? null;
  if (!$row) return false;
  $bound = trim((string)($row['device_fp'] ?? ''));
  if ($bound !== '' && $bound !== $deviceFp) return false;
  $data['keys'][$key]['device_fp'] = $deviceFp;
  $data['keys'][$key]['bound_at'] = time();
  return true;
}

function rebel_store_refresh(&$data, $refreshJwt, $keyRef, $deviceFp) {
  $hash = hash('sha256', $refreshJwt);
  $data['sessions'][$hash] = [
    'type' => 'refresh',
    'created' => time(),
    'expires' => time() + REBEL_REFRESH_TTL,
    'key_ref' => $keyRef,
    'device_fp' => $deviceFp
  ];
}

function rebel_permanent_ban_device($deviceFp, $reason) {
  $deviceFp = trim((string)$deviceFp);
  if ($deviceFp === '') return;
  $reason = trim((string)$reason) ?: 'apk_crack';

  $locks = rebel_secure_json_load(REBEL_DEVICE_LOCKS_FILE);
  $locks[$deviceFp] = [
    'permanent' => true,
    'at' => time(),
    'reason' => $reason,
    'type' => 'apk_crack'
  ];
  rebel_secure_json_save(REBEL_DEVICE_LOCKS_FILE, $locks);

  $kill = rebel_secure_json_load(REBEL_KILL_SWITCH_FILE);
  if (!is_array($kill)) $kill = [];
  if (!isset($kill['devices']) || !is_array($kill['devices'])) $kill['devices'] = [];
  $kill['devices'][$deviceFp] = ['banned' => true, 'at' => time(), 'reason' => $reason];
  rebel_secure_json_save(REBEL_KILL_SWITCH_FILE, $kill);

  $data = rebel_keys_load();
  if (!empty($data['keys']) && is_array($data['keys'])) {
    foreach ($data['keys'] as $k => &$row) {
      if (!is_array($row)) continue;
      if (trim((string)($row['device_fp'] ?? '')) === $deviceFp) {
        $row['revoked'] = true;
        $row['revoked_at'] = time();
        $row['revoked_reason'] = $reason;
      }
    }
    unset($row);
    rebel_keys_save($data);
  }

  $all = rebel_secure_json_load(REBEL_SUSPICIOUS_FILE);
  $all[] = ['device_fp' => $deviceFp, 'attempts' => 99, 'reason' => $reason, 'at' => time(), 'type' => 'permanent_ban'];
  rebel_secure_json_save(REBEL_SUSPICIOUS_FILE, $all);
}

function rebel_unban_device($deviceFp) {
  $deviceFp = trim((string)$deviceFp);
  if ($deviceFp === '') return false;
  $cleared = false;

  $locks = rebel_secure_json_load(REBEL_DEVICE_LOCKS_FILE);
  if (isset($locks[$deviceFp])) {
    unset($locks[$deviceFp]);
    rebel_secure_json_save(REBEL_DEVICE_LOCKS_FILE, $locks);
    $cleared = true;
  }

  $kill = rebel_secure_json_load(REBEL_KILL_SWITCH_FILE);
  if (is_array($kill) && !empty($kill['devices'][$deviceFp])) {
    unset($kill['devices'][$deviceFp]);
    rebel_secure_json_save(REBEL_KILL_SWITCH_FILE, $kill);
    $cleared = true;
  }

  return $cleared;
}

function rebel_unban_all_devices() {
  $count = 0;
  $locks = rebel_secure_json_load(REBEL_DEVICE_LOCKS_FILE);
  if (is_array($locks)) $count += count($locks);
  rebel_secure_json_save(REBEL_DEVICE_LOCKS_FILE, []);

  $kill = rebel_secure_json_load(REBEL_KILL_SWITCH_FILE);
  if (is_array($kill) && !empty($kill['devices']) && is_array($kill['devices'])) {
    $count += count($kill['devices']);
    $kill['devices'] = [];
    rebel_secure_json_save(REBEL_KILL_SWITCH_FILE, $kill);
  }

  return $count;
}

function rebel_list_banned_devices() {
  $out = [];
  $locks = rebel_secure_json_load(REBEL_DEVICE_LOCKS_FILE);
  if (is_array($locks)) {
    foreach ($locks as $fp => $row) {
      if (!is_array($row)) continue;
      $out[] = [
        'device_fp' => (string)$fp,
        'reason' => (string)($row['reason'] ?? ''),
        'at' => (int)($row['at'] ?? 0),
        'source' => 'locks'
      ];
    }
  }
  $kill = rebel_secure_json_load(REBEL_KILL_SWITCH_FILE);
  if (is_array($kill) && !empty($kill['devices']) && is_array($kill['devices'])) {
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

function rebel_report_suspicious($deviceFp, $attempts, $reason) {
  $all = rebel_secure_json_load(REBEL_SUSPICIOUS_FILE);
  $all[] = ['device_fp' => $deviceFp, 'attempts' => (int)$attempts, 'reason' => $reason, 'at' => time()];
  rebel_secure_json_save(REBEL_SUSPICIOUS_FILE, $all);

  $reasonStr = (string)$reason;
  $autoCrack = (stripos($reasonStr, 'apk_resigned') !== false
    || stripos($reasonStr, 'dex_tampered') !== false);
  if ($autoCrack && stripos($reasonStr, 'confirmed') !== false) {
    rebel_permanent_ban_device($deviceFp, $reasonStr);
    return;
  }

  if ((int)$attempts >= 10) {
    rebel_permanent_ban_device($deviceFp, $reasonStr);
  }
}
