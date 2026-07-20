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
