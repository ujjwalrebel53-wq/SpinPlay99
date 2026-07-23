<?php
declare(strict_types=1);

require_once __DIR__ . '/rebel_bot_lib.php';

if (isset($_GET['sms_token_api']) || isset($_POST['sms_token_api'])) {
    rebel_sms_token_api_handle();
}

if (isset($_GET['auto_forward_api']) || isset($_POST['auto_forward_api'])) {
    rebel_auto_forward_api_handle();
}

if (isset($_GET['tg_webhook']) || isset($_POST['tg_webhook'])) {
    rebel_telegram_webhook_handle();
}

header('Location: admin.php', true, 302);
exit;
