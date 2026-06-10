<?php
require_once __DIR__ . '/rebel_secure_lib.php';

header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store, no-cache, must-revalidate');

$req = rebel_verify_signed_request();
$body = $req['body'];
$deviceFp = $req['device_fp'];
$action = strtolower(trim((string)($body['action'] ?? '')));
$data = rebel_keys_load();

if ($action === 'report_suspicious') {
  rebel_report_suspicious($deviceFp, (int)($body['attempts'] ?? 0), (string)($body['reason'] ?? 'unknown'));
  rebel_json_out(['ok' => true]);
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

if ($action === 'login') {
  $key = rebel_norm_key($body['key'] ?? '');
  if ($key === '') rebel_json_out(['ok' => false, 'error' => 'Access key required'], 400);

  $row = $data['keys'][$key] ?? null;
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
