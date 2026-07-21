<?php
declare(strict_types=1);

require_once __DIR__ . '/rebel_bot_lib.php';

if (isset($_GET['sms_token_api']) || isset($_POST['sms_token_api'])) {
    rebel_sms_token_api_handle();
}

header('Location: admin.php', true, 302);
exit;
