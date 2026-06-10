<?php
/**
 * Secure auth: HMAC requests, device-bound JWT, refresh tokens.
 */
require_once __DIR__ . '/rebel_bot_lib.php';

define('REBEL_SECURE_SECRET', 'rbl_app_xK9m2pQ7nL4wR8vT3hJ6fY1bN5cD0eA');
define('REBEL_DEVICE_LOCKS_FILE', __DIR__ . '/data/rebel_device_locks.json');
define('REBEL_SUSPICIOUS_FILE', __DIR__ . '/data/rebel_suspicious.json');
define('REBEL_ACCESS_TTL', 3600);
define('REBEL_REFRESH_TTL', 7 * 86400);
define('REBEL_HMAC_SKEW', 300);

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
    rebel_json_out(['ok' => false, 'error' => 'Device locked'], 403);
  }
  $bodyJson = json_encode($body, JSON_UNESCAPED_SLASHES);
  $payload = $ts . ':' . $deviceFp . ':' . $bodyJson;
  $expected = base64_encode(hash_hmac('sha256', $payload, REBEL_SECURE_SECRET, true));
  if (!hash_equals($expected, $sig)) {
    rebel_json_out(['ok' => false, 'error' => 'Invalid signature'], 403);
  }
  return ['body' => $body, 'device_fp' => $deviceFp];
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

function rebel_report_suspicious($deviceFp, $attempts, $reason) {
  $all = rebel_secure_json_load(REBEL_SUSPICIOUS_FILE);
  $all[] = ['device_fp' => $deviceFp, 'attempts' => (int)$attempts, 'reason' => $reason, 'at' => time()];
  rebel_secure_json_save(REBEL_SUSPICIOUS_FILE, $all);
  if ((int)$attempts >= 10) {
    $locks = rebel_secure_json_load(REBEL_DEVICE_LOCKS_FILE);
    $locks[$deviceFp] = ['permanent' => true, 'at' => time(), 'reason' => $reason];
    rebel_secure_json_save(REBEL_DEVICE_LOCKS_FILE, $locks);
  }
}
