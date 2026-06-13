<?php
/**
 * Rebel Panel APK — server-side attestation + OTA helpers.
 * Keep REBEL_APP_SECRET in sync with app/build.gradle BuildConfig.
 */
define('REBEL_APP_SECRET', 'rbl_app_xK9m2pQ7nL4wR8vT3hJ6fY1bN5cD0eA');
define('REBEL_APP_UPDATE_FILE', __DIR__ . '/data/rebel_app_update.json');
define('REBEL_APP_MIN_APK', 1);

function rebel_app_is_apk_request() {
  $ua = strtolower($_SERVER['HTTP_USER_AGENT'] ?? '');
  return strpos($ua, 'rebelpanel/') !== false;
}

function rebel_app_attest_header() {
  if (function_exists('getallheaders')) {
    $h = getallheaders();
    if (is_array($h)) {
      foreach ($h as $k => $v) {
        if (strtolower($k) === 'x-rebel-attest') return trim((string)$v);
      }
    }
  }
  return trim((string)($_SERVER['HTTP_X_REBEL_ATTEST'] ?? ''));
}

function rebel_app_device_header() {
  if (function_exists('getallheaders')) {
    $h = getallheaders();
    if (is_array($h)) {
      foreach ($h as $k => $v) {
        if (strtolower($k) === 'x-rebel-device') return trim((string)$v);
      }
    }
  }
  return trim((string)($_SERVER['HTTP_X_REBEL_DEVICE'] ?? ''));
}

function rebel_app_attest_valid($strict = true) {
  if (!rebel_app_is_apk_request()) return !$strict;
  $hdr = rebel_app_attest_header();
  $dev = rebel_app_device_header();
  if ($hdr === '' || !preg_match('/^(\d+):([A-Za-z0-9+\/=_-]+)$/', $hdr, $m)) return false;
  $ts = (int)$m[1];
  $sig = $m[2];
  if (abs(time() - $ts) > 180) return false;
  $apkVer = max(1, (int)($_GET['v'] ?? REBEL_APP_MIN_APK));
  for ($v = 1; $v <= max($apkVer, 10); $v++) {
    $payload = $ts . ':' . $v;
    $expected = base64_encode(hash_hmac('sha256', $payload, REBEL_APP_SECRET, true));
    if (hash_equals($expected, $sig)) return true;
  }
  return false;
}

function rebel_app_require_attest() {
  if (!rebel_app_attest_valid(true)) {
    http_response_code(403);
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode(['ok' => false, 'error' => 'APK attestation failed — login bypass blocked']);
    exit;
  }
}

function rebel_app_update_load() {
  $defaults = [
    'min_apk_version' => 1,
    'latest_apk_version' => 2,
    'apk_url' => '',
    'panel_url' => 'https://rebelbhaiya.alwaysdata.net/phone.php',
    'panel_version' => 7,
    'force_update' => false,
    'message' => 'Rebel Panel update available',
  ];
  if (!is_file(REBEL_APP_UPDATE_FILE)) return $defaults;
  $raw = @file_get_contents(REBEL_APP_UPDATE_FILE);
  $j = json_decode($raw ?: '{}', true);
  if (!is_array($j)) return $defaults;
  return array_merge($defaults, $j);
}
