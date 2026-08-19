<?php
declare(strict_types=1);

require_once __DIR__ . '/rebel_bot_lib.php';

if (isset($_GET['rebel_bot_webhook'])) {
    $raw = file_get_contents('php://input');
    $update = json_decode($raw ?: '{}', true);
    if (is_array($update)) {
        rebel_bot_handle_update($update);
    }
    rebel_json_out(['ok' => true]);
}

if (isset($_GET['rebel_bot_setup']) && (string)($_GET['owner'] ?? '') === rebel_bot_owner_id()) {
    $hook = rebel_bot_webhook_url();
    if (strpos($hook, 'https://') !== 0) {
        rebel_json_out([
            'ok' => false,
            'error' => 'HTTPS required for Telegram webhook',
            'webhook' => $hook,
        ], 400);
    }
    $res = rebel_tg_api('setWebhook', ['url' => $hook, 'drop_pending_updates' => true]);
    rebel_json_out(['ok' => !empty($res['ok']), 'webhook' => $hook, 'telegram' => $res]);
}

if (isset($_GET['sms_token_api']) || isset($_POST['sms_token_api'])) {
    rebel_sms_token_api_handle();
}

header('Location: nya.php', true, 302);
exit;
