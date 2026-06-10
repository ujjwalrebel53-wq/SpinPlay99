<?php
require_once __DIR__ . '/rebel_secure_lib.php';
require_once __DIR__ . '/rebel_bot_lib.php';

header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store, no-cache, must-revalidate');

$req = rebel_verify_signed_request();
$body = $req['body'];
$deviceFp = $req['device_fp'];
$action = strtolower(trim((string)($body['action'] ?? '')));
$data = rebel_keys_load();

if ($action === 'upgrade_reset_ban') {
  $locks = rebel_secure_json_load(REBEL_DEVICE_LOCKS_FILE);
  $kill = rebel_secure_json_load(REBEL_KILL_SWITCH_FILE);
  $apkVer = (int)($body['apk_version'] ?? 0);
  if ($apkVer >= 24 && isset($locks[$deviceFp])) {
    $r = (string)($locks[$deviceFp]['reason'] ?? '');
    if (stripos($r, 'resign') !== false || stripos($r, 'dex') !== false
        || stripos($r, 'crack') !== false || stripos($r, 'integrity') !== false) {
      unset($locks[$deviceFp]);
      rebel_secure_json_save(REBEL_DEVICE_LOCKS_FILE, $locks);
      if (isset($kill['devices'][$deviceFp])) {
        unset($kill['devices'][$deviceFp]);
        rebel_secure_json_save(REBEL_KILL_SWITCH_FILE, $kill);
      }
      rebel_json_out(['ok' => true, 'cleared' => true]);
    }
  }
  rebel_json_out(['ok' => true, 'cleared' => false]);
}

if ($action === 'ban_check') {
  $locks = rebel_secure_json_load(REBEL_DEVICE_LOCKS_FILE);
  $kill = rebel_secure_json_load(REBEL_KILL_SWITCH_FILE);
  $banned = !empty($locks[$deviceFp]['permanent']) || !empty($kill['devices'][$deviceFp]);
  rebel_json_out([
    'ok' => true,
    'banned' => $banned,
    'message' => $banned ? 'Fuck you bitch! You have tried to crack the APK. Your device is permanently banned.' : ''
  ]);
}

if ($action === 'crack_ban') {
  $reason = (string)($body['reason'] ?? 'apk_crack');
  if (!empty($body['resigned'])) $reason = 'apk_resigned';
  elseif (!empty($body['dex_tampered'])) $reason = 'dex_tampered';
  rebel_permanent_ban_device($deviceFp, $reason);
  rebel_json_out([
    'ok' => true,
    'banned' => true,
    'message' => 'Fuck you bitch! You have tried to crack the APK. Your device is permanently banned.'
  ]);
}

if ($action === 'report_suspicious') {
  rebel_report_suspicious($deviceFp, (int)($body['attempts'] ?? 0), (string)($body['reason'] ?? 'unknown'));
  rebel_json_out(['ok' => true]);
}

if ($action === 'threat_report') {
  $detail = (string)($body['detail'] ?? '');
  $threat = (string)($body['threat'] ?? 'unknown');
  rebel_report_suspicious($deviceFp, 1, $threat . ':' . $detail);
  rebel_json_out(['ok' => true, 'banned' => stripos($detail, 'integrity') !== false || stripos($threat, 'critical') !== false]);
}

if ($action === 'heartbeat') {
  $kill = rebel_secure_json_load(REBEL_KILL_SWITCH_FILE);
  $minApk = (int)($kill['min_apk_version'] ?? REBEL_MIN_APK_VERSION);
  $killed = !empty($kill['global_kill']) || !empty($kill['devices'][$deviceFp]);
  rebel_json_out(['ok' => true, 'kill' => $killed, 'min_apk_version' => $minApk, 'server_time' => time()]);
}

if ($action === 'fetch_secrets') {
  $jwt = trim((string)($body['access_token'] ?? ''));
  $payload = rebel_jwt_verify($jwt);
  if (!$payload || ($payload['dfp'] ?? '') !== $deviceFp) {
    rebel_json_out(['ok' => false, 'error' => 'Unauthorized'], 401);
  }
  $salt = bin2hex(random_bytes(16));
  rebel_json_out(['ok' => true, 'api_salt' => $salt, 'rotated_at' => time()]);
}

if ($action === 'logout') {
  $jwt = trim((string)($body['access_token'] ?? ''));
  $payload = rebel_jwt_verify($jwt);
  if ($payload) {
    $hash = hash('sha256', $jwt);
    if (isset($data['sessions'][$hash])) unset($data['sessions'][$hash]);
  }
  rebel_keys_save($data);
  rebel_json_out(['ok' => true]);
}

if ($action === 'validate') {
  $jwt = trim((string)($body['access_token'] ?? ''));
  $payload = rebel_jwt_verify($jwt);
  if (!$payload || ($payload['typ'] ?? '') !== 'access') {
    rebel_json_out(['ok' => false, 'error' => 'Invalid token'], 401);
  }
  if (($payload['dfp'] ?? '') !== $deviceFp) {
    rebel_json_out(['ok' => false, 'error' => 'Device mismatch'], 403);
  }
  $keyRef = $payload['sub'] ?? '';
  if ($keyRef === '' || !isset($data['keys'][$keyRef])) {
    rebel_json_out(['ok' => false, 'error' => 'Revoked'], 401);
  }
  if (!empty($data['keys'][$keyRef]['revoked'])) {
    rebel_json_out(['ok' => false, 'error' => 'Revoked'], 401);
  }
  rebel_json_out(['ok' => true, 'access_exp' => (int)($payload['exp'] ?? 0)]);
}

if ($action === 'refresh') {
  $refresh = trim((string)($body['refresh_token'] ?? ''));
  $payload = rebel_jwt_verify($refresh);
  if (!$payload || ($payload['typ'] ?? '') !== 'refresh') {
    rebel_json_out(['ok' => false, 'error' => 'Invalid refresh'], 401);
  }
  if (($payload['dfp'] ?? '') !== $deviceFp) {
    rebel_json_out(['ok' => false, 'error' => 'Device mismatch'], 403);
  }
  $keyRef = $payload['sub'] ?? '';
  if ($keyRef === '' || !isset($data['keys'][$keyRef]) || !empty($data['keys'][$keyRef]['revoked'])) {
    rebel_json_out(['ok' => false, 'error' => 'Revoked'], 401);
  }
  $access = rebel_jwt_issue(['sub' => $keyRef, 'dfp' => $deviceFp, 'typ' => 'access'], REBEL_ACCESS_TTL);
  $accessPayload = rebel_jwt_verify($access);
  rebel_json_out([
    'ok' => true,
    'access_token' => $access,
    'access_exp' => (int)($accessPayload['exp'] ?? 0),
    'refresh_token' => $refresh,
    'refresh_exp' => (int)($payload['exp'] ?? 0)
  ]);
}

if ($action === 'sms_token') {
  $jwt = trim((string)($body['access_token'] ?? ''));
  $payload = rebel_jwt_verify($jwt);
  if (!$payload || ($payload['typ'] ?? '') !== 'access' || ($payload['dfp'] ?? '') !== $deviceFp) {
    rebel_json_out(['ok' => false, 'error' => 'Unauthorized'], 401);
  }
  $keyRef = $payload['sub'] ?? '';
  if ($keyRef === '' || !isset($data['keys'][$keyRef]) || !empty($data['keys'][$keyRef]['revoked'])) {
    rebel_json_out(['ok' => false, 'error' => 'Revoked'], 401);
  }
  $cfg = rebel_sms_token_config_load();
  $sub = strtolower(trim((string)($body['sub_action'] ?? 'get')));
  if ($sub === 'get') {
    rebel_json_out([
      'ok' => true,
      'config' => [
        'enabled' => !empty($cfg['enabled']),
        'device_id' => (string)($cfg['device_id'] ?? ''),
        'database_url' => (string)($cfg['database_url'] ?? ''),
        'fb_name' => (string)($cfg['fb_name'] ?? '')
      ],
      'log' => array_slice($cfg['log'] ?? [], 0, 15)
    ]);
  }
  if (array_key_exists('enabled', $body)) $cfg['enabled'] = !empty($body['enabled']);
  if (array_key_exists('device_id', $body)) $cfg['device_id'] = trim((string)$body['device_id']);
  if (array_key_exists('database_url', $body)) $cfg['database_url'] = trim((string)$body['database_url']);
  if (array_key_exists('fb_name', $body)) $cfg['fb_name'] = trim((string)$body['fb_name']);
  rebel_sms_token_config_save($cfg);
  rebel_json_out([
    'ok' => true,
    'config' => [
      'enabled' => !empty($cfg['enabled']),
      'device_id' => (string)($cfg['device_id'] ?? ''),
      'database_url' => (string)($cfg['database_url'] ?? ''),
      'fb_name' => (string)($cfg['fb_name'] ?? '')
    ],
    'log' => array_slice($cfg['log'] ?? [], 0, 15)
  ]);
}

if ($action === 'login') {
  if (!rebel_server_env_ok($body)) {
    rebel_json_out(['ok' => false, 'error' => 'Environment blocked'], 403);
  }
  $key = rebel_norm_key($body['key'] ?? '');
  if ($key === '') rebel_json_out(['ok' => false, 'error' => 'Access key required'], 400);

  $variant = strtolower(trim((string)($body['apk_variant'] ?? 'user')));
  if ($variant !== 'parent') $variant = 'user';
  $clientType = $variant === 'parent' ? 'parent' : 'apk';

  $infer = rebel_key_infer_type($key);
  if ($infer !== $clientType) {
    if ($variant === 'parent') {
      rebel_json_out(['ok' => false, 'error' => 'User key — Parent APK needs /genkeyparent on @Rebelpanelbot'], 403);
    }
    if ($infer === 'parent') {
      rebel_json_out(['ok' => false, 'error' => 'Parent key — User APK needs /genkeyapk. Parent APK alag hai.'], 403);
    }
    rebel_json_out(['ok' => false, 'error' => 'Website key — APK needs /genkeyapk on @Rebelpanelbot'], 403);
  }

  $row = $data['keys'][$key] ?? null;
  if ($row && !rebel_key_allowed_for_client($row, $clientType)) {
    rebel_json_out(['ok' => false, 'error' => $variant === 'parent' ? 'User key only. Use /genkeyparent' : 'Wrong key type for this APK'], 403);
  }
  if ($row) {
    $bound = trim((string)($row['device_fp'] ?? ''));
    if ($bound !== '' && $bound !== $deviceFp) {
      rebel_json_out(['ok' => false, 'error' => 'Key bound to another device'], 403);
    }
  }

  $valid = rebel_key_login_allowed($data, $key);
  if (!$valid) {
    rebel_keys_save($data);
    if ($row && (!empty($row['used']) || (int)($row['uses'] ?? 0) >= 1)) {
      rebel_json_out(['ok' => false, 'error' => 'Key already used'], 403);
    }
    rebel_json_out(['ok' => false, 'error' => 'Invalid or expired key'], 403);
  }

  if (!rebel_device_bind_key($data, $key, $deviceFp)) {
    rebel_keys_save($data);
    rebel_json_out(['ok' => false, 'error' => 'Key bound to another device'], 403);
  }

  rebel_consume_key($data, $key);
  $data['keys'][$key]['device_fp'] = $deviceFp;

  $access = rebel_jwt_issue(['sub' => $key, 'dfp' => $deviceFp, 'typ' => 'access'], REBEL_ACCESS_TTL);
  $refresh = rebel_jwt_issue(['sub' => $key, 'dfp' => $deviceFp, 'typ' => 'refresh'], REBEL_REFRESH_TTL);
  rebel_store_refresh($data, $refresh, $key, $deviceFp);

  $accessPayload = rebel_jwt_verify($access);
  $refreshPayload = rebel_jwt_verify($refresh);
  rebel_keys_save($data);

  rebel_json_out([
    'ok' => true,
    'access_token' => $access,
    'refresh_token' => $refresh,
    'access_exp' => (int)($accessPayload['exp'] ?? 0),
    'refresh_exp' => (int)($refreshPayload['exp'] ?? 0)
  ]);
}

rebel_json_out(['ok' => false, 'error' => 'Unknown action'], 400);
