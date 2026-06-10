<?php
/**
 * Web admin for Promo Bot (owner only)
 * https://rebelbhaiya.alwaysdata.net/promo_bot_admin.php?owner=8432393497
 */
require_once __DIR__ . '/promo_bot_lib.php';

if ((string)($_GET['owner'] ?? '') !== PROMO_OWNER_ID) {
  http_response_code(403);
  header('Content-Type: text/plain; charset=UTF-8');
  echo 'Forbidden';
  exit;
}

$msg = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  $pack = promo_pack_load();
  $pack['welcome_text'] = trim((string)($_POST['welcome_text'] ?? $pack['welcome_text']));
  $pack['apk_url'] = trim((string)($_POST['apk_url'] ?? $pack['apk_url']));
  $pack['apk_filename'] = trim((string)($_POST['apk_filename'] ?? $pack['apk_filename']));
  $pack['video_note'] = trim((string)($_POST['video_note'] ?? $pack['video_note']));
  $pack['updated_by'] = PROMO_OWNER_ID;
  promo_pack_save($pack);
  $msg = 'Saved ✓';
}

if (isset($_GET['set_webhook'])) {
  $r = promo_set_webhook();
  $msg = !empty($r['ok']) ? 'Webhook set ✓' : ('Webhook failed: ' . ($r['description'] ?? ''));
}

$pack = promo_pack_load();
$users = promo_users_load()['users'];
$count = count($users);
?><!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Promo Bot Admin</title>
<style>
:root{--bg:#050508;--card:#14141f;--border:#2a2a3a;--accent:#ff3c3c;--text:#e8e8f0;--muted:#6b6b88;--ok:#00ff9d}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:var(--bg);color:var(--text);padding:20px;line-height:1.5}
.wrap{max-width:720px;margin:0 auto}
h1{font-size:22px;margin-bottom:4px}
.sub{color:var(--muted);font-size:13px;margin-bottom:20px}
.card{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:18px;margin-bottom:16px}
.stat{font-size:28px;font-weight:800;color:var(--ok)}
label{display:block;font-size:12px;color:var(--muted);margin:12px 0 6px;text-transform:uppercase;letter-spacing:.5px}
textarea,input{width:100%;padding:12px;border-radius:10px;border:1px solid var(--border);background:#0d0d14;color:var(--text);font-size:14px}
textarea{min-height:120px;resize:vertical}
.btn{display:inline-block;margin-top:14px;padding:12px 18px;border:none;border-radius:10px;background:var(--accent);color:#fff;font-weight:700;cursor:pointer;text-decoration:none;font-size:14px}
.btn2{background:#333;margin-left:8px}
.ok{background:rgba(0,255,157,.12);border:1px solid rgba(0,255,157,.3);color:var(--ok);padding:10px 14px;border-radius:10px;margin-bottom:14px}
.hint{font-size:12px;color:var(--muted);margin-top:8px}
code{background:#0d0d14;padding:2px 6px;border-radius:4px;font-size:12px}
ul{font-size:13px;color:var(--muted);padding-left:18px}
ul li{margin:4px 0}
</style>
</head>
<body>
<div class="wrap">
  <h1>📡 Promo Bot Admin</h1>
  <p class="sub">Version <?= htmlspecialchars(PROMO_BOT_VERSION, ENT_QUOTES, 'UTF-8') ?> · Owner <?= htmlspecialchars(PROMO_OWNER_ID, ENT_QUOTES, 'UTF-8') ?></p>

  <?php if ($msg): ?><div class="ok"><?= htmlspecialchars($msg, ENT_QUOTES, 'UTF-8') ?></div><?php endif; ?>

  <div class="card">
    <div class="stat"><?= (int)$count ?></div>
    <div style="color:var(--muted);font-size:13px">Registered users (/start)</div>
  </div>

  <form method="post" class="card">
    <h2 style="font-size:16px;margin-bottom:8px">Welcome pack</h2>
    <label>Text message (HTML ok)</label>
    <textarea name="welcome_text"><?= htmlspecialchars($pack['welcome_text'] ?? '', ENT_QUOTES, 'UTF-8') ?></textarea>
    <label>APK download URL</label>
    <input name="apk_url" value="<?= htmlspecialchars($pack['apk_url'] ?? '', ENT_QUOTES, 'UTF-8') ?>" placeholder="https://...apk"/>
    <label>APK filename</label>
    <input name="apk_filename" value="<?= htmlspecialchars($pack['apk_filename'] ?? 'RebelPanel.apk', ENT_QUOTES, 'UTF-8') ?>"/>
    <label>Video caption (optional)</label>
    <input name="video_note" value="<?= htmlspecialchars($pack['video_note'] ?? '', ENT_QUOTES, 'UTF-8') ?>"/>
    <p class="hint">Video & APK file: Telegram bot par <code>/admin</code> → video/APK reply karke <code>/setvideo</code> / <code>/setapk</code></p>
    <p class="hint">Video file_id: <code><?= htmlspecialchars($pack['video_file_id'] ?: 'not set', ENT_QUOTES, 'UTF-8') ?></code></p>
    <p class="hint">APK file_id: <code><?= htmlspecialchars($pack['apk_file_id'] ?: 'not set', ENT_QUOTES, 'UTF-8') ?></code></p>
    <button type="submit" class="btn">Save pack</button>
    <a class="btn btn2" href="?owner=<?= urlencode(PROMO_OWNER_ID) ?>&set_webhook=1">Set webhook</a>
  </form>

  <div class="card">
    <h2 style="font-size:16px;margin-bottom:8px">Telegram commands</h2>
    <ul>
      <li><code>/start</code> — user ko video + APK + text</li>
      <li><code>/admin</code> — owner control panel</li>
      <li><code>/broadcast message</code> — sabko text</li>
      <li><code>/users</code> — kitne users</li>
      <li><code>/preview</code> — test welcome pack</li>
    </ul>
  </div>
</div>
</body>
</html>
