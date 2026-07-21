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
$projects = rebel_firebase_list();
$data = rebel_firebase_load();

function rebel_avatar_url_admin(): string
{
    if (is_file(__DIR__ . '/assets/rebel-avatar.jpg')) {
        return 'assets/rebel-avatar.jpg';
    }
    if (is_file(__DIR__ . '/rebel-avatar.jpg')) {
        return 'rebel-avatar.jpg';
    }
    return 'https://raw.githubusercontent.com/ujjwalrebel53-wq/SpinPlay99/main/IMG_20260609_231734_741.jpg';
}

$REBEL_AVATAR_URL = rebel_avatar_url_admin();

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

.login-screen{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;padding:24px;padding-top:calc(24px + var(--safe-t))}
.login-card{width:100%;max-width:360px;padding:28px 22px;border-radius:24px;background:linear-gradient(160deg,rgba(20,20,30,0.95),rgba(10,10,16,0.98));border:1px solid rgba(255,60,60,0.2);box-shadow:0 24px 60px rgba(0,0,0,0.5)}
.login-logo{display:flex;align-items:center;gap:12px;margin-bottom:24px}
.login-logo .mark{width:44px;height:44px;border-radius:14px;background:rgba(255,60,60,0.12);border:1.5px solid var(--accent);display:flex;align-items:center;justify-content:center;font-weight:800;color:var(--accent);font-size:20px}
.login-logo h1{font-size:22px;font-weight:800}
.login-logo em{color:var(--accent);font-style:normal}
.login-sub{color:var(--muted);font-size:12px;margin:-16px 0 20px;line-height:1.5}
.key-input{width:100%;padding:16px 14px;border-radius:14px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-family:'Space Mono',monospace;font-size:14px;letter-spacing:1px;outline:none}
.key-input:focus{border-color:var(--accent)}
.login-err{color:var(--error);font-size:12px;margin:10px 0}
.btn-primary{width:100%;margin-top:16px;padding:16px;border:none;border-radius:14px;background:linear-gradient(135deg,var(--accent),#cc2020);color:#fff;font-family:'Syne',sans-serif;font-weight:800;font-size:15px;cursor:pointer}
.btn-primary:disabled{opacity:0.6}

.avatar-stage{width:180px;height:215px;margin:0 auto 10px;position:relative}
.avatar-face-ring{width:132px;height:132px;margin:0 auto;border-radius:50%;overflow:hidden;border:2px solid var(--border);background:#0a0a10;box-shadow:0 8px 24px rgba(0,0,0,.45);position:relative;z-index:2}
.avatar-img-wrap{width:100%;height:100%;animation:rebelImgLook 9s ease-in-out infinite;-webkit-animation:rebelImgLook 9s ease-in-out infinite}
.avatar-face{width:145%;height:145%;max-width:none;object-fit:cover;object-position:50% 30%;display:block;margin:-22.5%}
.avatar-laptop{position:absolute;left:50%;bottom:0;width:120px;z-index:5;pointer-events:none;animation:rebelLaptop 9s ease-in-out infinite;-webkit-animation:rebelLaptop 9s ease-in-out infinite}
@keyframes rebelImgLook{0%,10%{transform:translate(0,0)}14%,26%{transform:translate(-26px,0)}30%,42%{transform:translate(26px,0)}46%,50%{transform:translate(0,0)}54%,76%{transform:translate(0,20px)}80%,100%{transform:translate(0,0)}}
@-webkit-keyframes rebelImgLook{0%,10%{-webkit-transform:translate(0,0)}14%,26%{-webkit-transform:translate(-26px,0)}30%,42%{-webkit-transform:translate(26px,0)}46%,50%{-webkit-transform:translate(0,0)}54%,76%{-webkit-transform:translate(0,20px)}80%,100%{-webkit-transform:translate(0,0)}}
@keyframes rebelLaptop{0%,50%{opacity:0;transform:translate3d(-50%,48px,0) scale(.45)}54%,58%{opacity:1;transform:translate3d(-50%,0,0) scale(1.08)}62%,76%{opacity:1;transform:translate3d(-50%,0,0) scale(1)}80%,100%{opacity:0;transform:translate3d(-50%,48px,0) scale(.45)}}
@-webkit-keyframes rebelLaptop{0%,50%{opacity:0;-webkit-transform:translate3d(-50%,48px,0) scale(.45)}54%,58%{opacity:1;-webkit-transform:translate3d(-50%,0,0) scale(1.08)}62%,76%{opacity:1;-webkit-transform:translate3d(-50%,0,0) scale(1)}80%,100%{opacity:0;-webkit-transform:translate3d(-50%,48px,0) scale(.45)}}
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

.hdr{flex-shrink:0;height:calc(var(--hdr-h) + var(--safe-t));padding-top:var(--safe-t);padding-left:16px;padding-right:16px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,0.06);backdrop-filter:blur(12px);background:rgba(5,5,8,0.85);z-index:10}
.hdr-left{display:flex;align-items:center;gap:10px;min-width:0}
.hdr-title{font-size:15px;font-weight:800;white-space:nowrap}
.hdr-sub{font-size:9px;color:var(--muted);font-family:'Space Mono',monospace;letter-spacing:1px}
.hdr-actions{display:flex;gap:8px;flex-shrink:0}
.icon-btn{width:38px;height:38px;border-radius:12px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center}
.fb-chip{max-width:130px;padding:8px 12px;border-radius:100px;border:1px solid rgba(255,149,0,0.3);background:rgba(255,149,0,0.1);color:var(--accent2);font-family:'Space Mono',monospace;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

.screens{flex:1;overflow:hidden;position:relative}
.screen{position:absolute;inset:0;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:12px 14px calc(var(--nav-h) + var(--safe-b) + 16px);opacity:0;pointer-events:none;transform:translateX(12px);transition:opacity .22s ease,transform .22s ease}
.screen.active{opacity:1;pointer-events:auto;transform:none}

.stats-row{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px}
.stat-card{padding:12px 10px;border-radius:14px;background:var(--card);border:1px solid var(--border);text-align:center}
.stat-val{font-size:20px;font-weight:800;font-family:'Space Mono',monospace}
.stat-val.on{color:var(--success)}.stat-val.off{color:var(--error)}
.stat-lbl{font-size:8px;color:var(--muted);letter-spacing:1px;margin-top:2px}

.search-wrap{margin-bottom:12px}
.search{width:100%;padding:12px 14px;border-radius:14px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:14px;outline:none}
.search:focus{border-color:var(--accent)}

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
.chip.fb{background:rgba(255,149,0,0.15);color:var(--accent2);font-size:9px}
.chip.del{color:var(--error);border-color:rgba(255,68,102,0.35);cursor:pointer}
.empty-state{text-align:center;padding:48px 20px;color:var(--muted)}
.empty-state .ico{font-size:40px;margin-bottom:12px;opacity:0.5}

.hero-card{padding:18px;border-radius:20px;background:linear-gradient(145deg,rgba(255,60,60,0.12),rgba(20,20,30,0.95));border:1px solid rgba(255,60,60,0.2);margin-bottom:14px}
.hero-phone{font-size:22px;font-weight:800;margin-bottom:4px}
.hero-model{font-size:12px;color:var(--muted);margin-bottom:12px;word-break:break-all;font-family:'Space Mono',monospace}
.hero-badge{display:inline-block;padding:5px 12px;border-radius:100px;font-size:10px;font-weight:800;font-family:'Space Mono',monospace;margin-bottom:14px}
.hero-badge.online{background:rgba(0,255,157,0.15);color:var(--success)}
.hero-badge.offline{background:rgba(107,107,136,0.15);color:var(--muted)}
.hero-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
.hero-cell{padding:10px;border-radius:12px;background:rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.05)}
.hero-lbl{font-size:8px;color:var(--muted);letter-spacing:1px;margin-bottom:4px}
.hero-val{font-size:14px;font-weight:700;font-family:'Space Mono',monospace;word-break:break-all}

.form-card{padding:16px;border-radius:18px;background:var(--card);border:1px solid var(--border)}
.form-label{display:block;font-size:11px;color:var(--muted);margin-bottom:6px;font-weight:600}
.form-input,.form-textarea{width:100%;padding:14px;border-radius:12px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:15px;outline:none;margin-bottom:14px}
.form-textarea{min-height:80px;resize:none;font-family:inherit}
.btn-send{width:100%;padding:16px;border:none;border-radius:14px;background:linear-gradient(135deg,var(--accent2),#cc7700);color:#111;font-weight:800;font-size:15px;cursor:pointer}
.btn-ping{width:100%;padding:16px;border:none;border-radius:14px;background:linear-gradient(135deg,var(--success),#00cc7a);color:#050508;font-weight:800;font-size:15px;cursor:pointer;margin-top:8px}
.send-status{margin-top:10px;font-size:11px;font-family:'Space Mono',monospace;text-align:center}

.menu-list{display:flex;flex-direction:column;gap:8px}
.menu-item{display:flex;align-items:center;justify-content:space-between;padding:16px;border-radius:14px;background:var(--card);border:1px solid var(--border);cursor:pointer;font-size:14px;font-weight:600;text-decoration:none;color:inherit}
.menu-item span{color:var(--muted);font-size:12px;font-weight:400}
.menu-item.danger{border-color:rgba(255,68,102,0.3);color:var(--error)}
.proto-tag{display:inline-block;padding:4px 10px;border-radius:8px;background:rgba(123,47,255,0.15);color:#b388ff;font-size:9px;font-family:'Space Mono',monospace;margin-bottom:14px}

.bottom-nav{flex-shrink:0;height:calc(var(--nav-h) + var(--safe-b));padding-bottom:var(--safe-b);display:flex;background:rgba(8,8,12,0.95);border-top:1px solid rgba(255,255,255,0.06);backdrop-filter:blur(16px)}
.nav-item{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;border:none;background:transparent;color:var(--muted);font-size:9px;font-family:'Space Mono',monospace;cursor:pointer;padding:8px 4px}
.nav-item .ico{font-size:20px;line-height:1}
.nav-item.active{color:var(--accent)}
.nav-item.active .ico{filter:drop-shadow(0 0 6px var(--accent))}

.sheet-bg{position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:50;opacity:0;pointer-events:none;transition:opacity .25s}
.sheet-bg.open{opacity:1;pointer-events:auto}
.sheet{position:fixed;left:0;right:0;bottom:0;z-index:51;background:var(--surface);border-radius:20px 20px 0 0;padding:12px 16px calc(20px + var(--safe-b));max-height:70vh;overflow-y:auto;transform:translateY(100%);transition:transform .28s cubic-bezier(.32,.72,0,1)}
.sheet.open{transform:translateY(0)}
.sheet-handle{width:36px;height:4px;border-radius:4px;background:var(--border);margin:0 auto 16px}
.sheet-title{font-size:13px;font-weight:800;margin-bottom:12px}
.fb-option{display:flex;align-items:center;justify-content:space-between;padding:14px;border-radius:12px;border:1px solid var(--border);background:var(--card);margin-bottom:8px;cursor:pointer}
.fb-option .cnt{font-size:10px;color:var(--muted);font-family:'Space Mono',monospace}
.fb-add-form{padding:12px 0 8px;border-top:1px solid var(--border);margin-top:8px}
.fb-add-form input{width:100%;padding:12px 14px;margin-bottom:8px;border-radius:12px;border:1px solid var(--border);background:var(--card);color:var(--text);font-size:13px;outline:none}
.fb-add-form input:focus{border-color:var(--accent)}
.btn-add-fb{width:100%;padding:14px;border:none;border-radius:12px;background:linear-gradient(135deg,var(--accent2),#cc7700);color:#111;font-weight:800;font-size:14px;cursor:pointer;margin-top:4px}

.sync-card{padding:16px;border-radius:16px;background:var(--card);border:1px solid var(--border);margin-bottom:10px;font-size:12px;line-height:1.6;color:var(--muted)}
.sync-card strong{color:var(--text)}

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
            <img class="avatar-face" src="<?= htmlspecialchars($REBEL_AVATAR_URL, ENT_QUOTES, 'UTF-8') ?>" alt="Rebel" onerror="this.onerror=null;this.src='https://raw.githubusercontent.com/ujjwalrebel53-wq/SpinPlay99/main/IMG_20260609_231734_741.jpg'"/>
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
    <p class="login-sub">Firebase projects yahan add karo — <strong>mobile.php</strong> mein auto sync ho jayenge.</p>
    <?php if ($loginError !== ''): ?><div class="login-err"><?= htmlspecialchars($loginError, ENT_QUOTES, 'UTF-8') ?></div><?php endif; ?>
    <form method="post">
      <input type="hidden" name="rebel_admin_login" value="1"/>
      <input class="key-input" type="password" name="password" placeholder="Admin password" required autofocus/>
      <button class="btn-primary" type="submit">Login</button>
    </form>
    <p class="login-sub" style="margin-top:14px;margin-bottom:0">Default: <span class="mono">rebeladmin</span></p>
  </div>
</div>
<?php else: ?>

<div class="app" id="appShell">
  <header class="hdr">
    <div class="hdr-left">
      <div class="rebel-avatar-sm">
        <img src="<?= htmlspecialchars($REBEL_AVATAR_URL, ENT_QUOTES, 'UTF-8') ?>" alt="Rebel" onerror="this.onerror=null;this.src='https://raw.githubusercontent.com/ujjwalrebel53-wq/SpinPlay99/main/IMG_20260609_231734_741.jpg'"/>
      </div>
      <div>
        <div class="hdr-title">Rebel Admin</div>
        <div class="hdr-sub" id="hdrSub"><?= count($projects) ?> projects · mobile sync ON</div>
      </div>
    </div>
    <div class="hdr-actions">
      <button class="fb-chip" id="fbChip" onclick="openFbSheet()">Firebase ▾</button>
      <button class="icon-btn" onclick="refreshList()" title="Refresh">↻</button>
    </div>
  </header>

  <div class="screens">
    <section class="screen active" id="screen-home">
      <div class="stats-row">
        <div class="stat-card"><div class="stat-val" id="stTotal"><?= count($projects) ?></div><div class="stat-lbl">PROJECTS</div></div>
        <div class="stat-card"><div class="stat-val on" id="stLive">●</div><div class="stat-lbl">SYNC</div></div>
        <div class="stat-card"><div class="stat-val" id="stUpdated"><?= (int)($data['updated'] ?? 0) ?></div><div class="stat-lbl">UPDATED</div></div>
      </div>
      <div class="search-wrap"><input class="search" id="projSearch" placeholder="Search project or URL..." oninput="renderProjects()"/></div>
      <div id="projList"></div>
    </section>

    <section class="screen" id="screen-device">
      <div id="projEmpty" class="empty-state"><div class="ico">🔥</div>Home se koi Firebase project select karo</div>
      <div id="projHero" class="hidden"></div>
    </section>

    <section class="screen" id="screen-sms">
      <span class="proto-tag">📡 MOBILE SYNC</span>
      <div class="sync-card">
        <strong>mobile.php</strong> har ~20 sec <span class="mono">admin.php?rebel_firebase_api=1</span> se projects load karta hai.<br/><br/>
        Yahan jo bhi add/delete karoge, mobile panel mein automatically update ho jayega — refresh ki zaroorat nahi.
      </div>
      <div class="sync-card">
        <strong>Last sync timestamp</strong><br/>
        <span class="mono" id="syncUpdated"><?= (int)($data['updated'] ?? 0) ?></span>
      </div>
      <div class="sync-card">
        <strong>API endpoint</strong><br/>
        <span class="mono">admin.php?rebel_firebase_api=1</span>
      </div>
    </section>

    <section class="screen" id="screen-send">
      <div class="form-card">
        <label class="form-label">Project Name</label>
        <input class="form-input" id="fbName" placeholder="Panel 1 / Client ABC"/>
        <label class="form-label">Firebase Database URL</label>
        <input class="form-input" id="fbUrl" placeholder="https://xxx-default-rtdb.firebaseio.com"/>
        <label class="form-label">Database Secret / Auth Key (optional)</label>
        <input class="form-input" id="fbSecret" placeholder="Firebase legacy secret"/>
        <label class="form-label">Web API Key (optional — live updates)</label>
        <input class="form-input" id="fbApiKey" placeholder="AIza..."/>
        <button class="btn-send" type="button" onclick="addProject()">+ Add Firebase Project</button>
        <div class="send-status" id="addStatus"></div>
      </div>
    </section>

    <section class="screen" id="screen-bank">
      <div class="empty-state"><div class="ico">👑</div>Admin Panel<br><span style="font-size:11px;opacity:.6">Firebase manage — mobile auto sync</span></div>
      <div class="sync-card" style="margin-top:8px">
        <strong>Quick tip</strong><br/>
        Send tab se naya Firebase add karo. Home tab par list dikhegi. Tap karke detail dekho.
      </div>
    </section>

    <section class="screen" id="screen-more">
      <span class="proto-tag">👑 ADMIN PANEL</span>
      <div class="menu-list">
        <div class="menu-item" onclick="openFbSheet()">Firebase Projects <span id="moreFbName"><?= count($projects) ?> projects</span></div>
        <a class="menu-item" href="mobile.php">Mobile Panel <span>mobile.php →</span></a>
        <div class="menu-item" onclick="refreshList()">Refresh List <span>↻ Sync</span></div>
        <a class="menu-item danger" href="admin.php?logout=1">Logout <span>Exit admin</span></a>
      </div>
    </section>
  </div>

  <nav class="bottom-nav">
    <button class="nav-item active" data-tab="home" onclick="switchTab('home',this)"><span class="ico">🏠</span>Home</button>
    <button class="nav-item" data-tab="device" onclick="switchTab('device',this)"><span class="ico">📱</span>Project</button>
    <button class="nav-item" data-tab="sms" onclick="switchTab('sms',this)"><span class="ico">💬</span>Sync</button>
    <button class="nav-item" data-tab="send" onclick="switchTab('send',this)"><span class="ico">📤</span>Add</button>
    <button class="nav-item" data-tab="bank" onclick="switchTab('bank',this)"><span class="ico">🏦</span>Info</button>
    <button class="nav-item" data-tab="more" onclick="switchTab('more',this)"><span class="ico">⚙️</span>More</button>
  </nav>
</div>

<div class="sheet-bg" id="sheetBg" onclick="closeFbSheet()"></div>
<div class="sheet" id="fbSheet">
  <div class="sheet-handle"></div>
  <div class="sheet-title">Firebase Projects — Admin</div>
  <div id="fbSheetList"></div>
  <div class="fb-add-form">
    <p style="font-size:12px;color:var(--muted);line-height:1.5;margin-bottom:12px">Naya project <strong>Add</strong> tab se add karo — mobile panel mein auto sync.</p>
    <button class="btn-add-fb" type="button" onclick="closeFbSheet();switchTab('send',document.querySelector('[data-tab=send]'))">+ Add Firebase Project</button>
  </div>
</div>
<div class="toast-wrap" id="toasts"></div>

<script>
var API_URL='admin.php?rebel_firebase_api=1';
var allProjects=<?= json_encode(array_values($projects), JSON_UNESCAPED_UNICODE) ?>;
var selProj='';

function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function toast(msg,ok){
  var w=document.getElementById('toasts'),d=document.createElement('div');
  d.className='toast '+(ok?'ok':'err');d.textContent=msg;w.appendChild(d);
  setTimeout(function(){d.remove();},2800);
}
function switchTab(name,btn){
  document.querySelectorAll('.screen').forEach(function(s){s.classList.remove('active');});
  document.getElementById('screen-'+name).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(function(n){n.classList.remove('active');});
  if(btn)btn.classList.add('active');
  if(name==='device')renderProjectView();
}
function openFbSheet(){document.getElementById('sheetBg').classList.add('open');document.getElementById('fbSheet').classList.add('open');updateFbUi();}
function closeFbSheet(){document.getElementById('sheetBg').classList.remove('open');document.getElementById('fbSheet').classList.remove('open');}
function getSelProject(){return allProjects.find(function(p){return p.id===selProj;})||null;}
function shortHost(url){return String(url||'').replace(/^https?:\/\//,'').split('/')[0];}

function updateFbUi(){
  var total=allProjects.length;
  document.getElementById('fbChip').textContent=total+' FB ▾';
  document.getElementById('hdrSub').textContent=total+' projects · mobile sync ON';
  document.getElementById('stTotal').textContent=total;
  document.getElementById('moreFbName').textContent=total+' projects';
  var html=allProjects.map(function(p){
    return '<div class="fb-option'+(p.id===selProj?' active':'')+'" onclick="selectProject(\''+esc(p.id)+'\');closeFbSheet();">'+
      '<div><div>'+esc(p.name)+'</div><div class="cnt">'+esc(shortHost(p.databaseURL))+' · '+esc(p.schema||'auto')+'</div></div></div>';
  }).join('');
  document.getElementById('fbSheetList').innerHTML=html||'<div class="empty-state" style="padding:20px"><div class="ico">🔥</div>No Firebase yet — Add tab se add karo</div>';
}

function renderProjects(){
  var q=(document.getElementById('projSearch').value||'').toLowerCase();
  var list=allProjects.filter(function(p){
    if(!q)return true;
    return (p.name+p.databaseURL+(p.schema||'')).toLowerCase().includes(q);
  });
  var el=document.getElementById('projList');
  if(!list.length){
    el.innerHTML='<div class="empty-state"><div class="ico">🔥</div>No Firebase projects<br><span style="font-size:11px;opacity:.6">Add tab se naya project add karo</span></div>';
    updateFbUi();
    return;
  }
  el.innerHTML=list.map(function(p){
    return '<div class="dev-card online'+(p.id===selProj?' active':'')+'" onclick="selectProject(\''+esc(p.id)+'\')">'+
      '<div class="dev-bar"></div><div class="dev-body">'+
      '<div class="dev-phone">'+esc(p.name)+'</div>'+
      '<div class="dev-meta">'+esc(shortHost(p.databaseURL))+'</div>'+
      '<div class="dev-chips">'+
        '<span class="chip fb">'+esc(p.schema||'auto')+'</span>'+
        '<span class="chip" onclick="event.stopPropagation();copyText(\''+esc(p.databaseURL)+'\')">Copy URL</span>'+
        '<span class="chip del" onclick="event.stopPropagation();deleteProject(\''+esc(p.id)+'\')">Delete</span>'+
      '</div></div></div>';
  }).join('');
  updateFbUi();
}

function selectProject(id){
  selProj=id;
  renderProjects();
  renderProjectView();
  switchTab('device',document.querySelector('[data-tab=device]'));
}

function renderProjectView(){
  var p=getSelProject();
  var emptyEl=document.getElementById('projEmpty');
  var heroEl=document.getElementById('projHero');
  if(!p){
    emptyEl.classList.remove('hidden');
    heroEl.classList.add('hidden');
    heroEl.innerHTML='';
    return;
  }
  emptyEl.classList.add('hidden');
  heroEl.classList.remove('hidden');
  heroEl.innerHTML=
    '<div class="hero-card">'+
      '<div class="hero-phone">'+esc(p.name)+'</div>'+
      '<div class="hero-model">'+esc(p.databaseURL)+'</div>'+
      '<span class="hero-badge online">ACTIVE · '+esc(p.schema||'auto')+'</span>'+
      '<div class="hero-grid">'+
        '<div class="hero-cell"><div class="hero-lbl">PROJECT ID</div><div class="hero-val">'+esc(p.id)+'</div></div>'+
        '<div class="hero-cell"><div class="hero-lbl">SCHEMA</div><div class="hero-val">'+esc(p.schema||'auto')+'</div></div>'+
        '<div class="hero-cell"><div class="hero-lbl">SECRET</div><div class="hero-val">'+(p.secret?'••••••':'—')+'</div></div>'+
        '<div class="hero-cell"><div class="hero-lbl">API KEY</div><div class="hero-val">'+(p.apiKey?'••••••':'—')+'</div></div>'+
      '</div>'+
    '</div>'+
    '<button class="btn-ping" type="button" onclick="copyText(\''+esc(p.databaseURL)+'\')">Copy Firebase URL</button>'+
    '<button class="btn-send" type="button" style="margin-top:8px;background:linear-gradient(135deg,var(--error),#cc2244);color:#fff" onclick="deleteProject(\''+esc(p.id)+'\')">Delete Project</button>';
}

function copyText(txt){
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(txt).then(function(){toast('Copied',true);}).catch(function(){toast('Copy failed',false);});
  }else{
    toast(txt,true);
  }
}

function apiPost(body){
  return fetch(API_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{}),credentials:'same-origin'})
    .then(function(r){return r.json().then(function(j){return{ok:r.ok,data:j};});});
}

function addProject(){
  var name=document.getElementById('fbName').value.trim();
  var url=document.getElementById('fbUrl').value.trim().replace(/\/$/,'');
  var secret=document.getElementById('fbSecret').value.trim();
  var apiKey=document.getElementById('fbApiKey').value.trim();
  if(!name||!url){toast('Name aur Firebase URL zaroori hai',false);return;}
  document.getElementById('addStatus').textContent='Adding...';
  apiPost({action:'add',name:name,databaseURL:url,secret:secret,apiKey:apiKey}).then(function(res){
    if(res.data&&res.data.ok){
      document.getElementById('addStatus').textContent='✅ Added — mobile panel sync ho jayega';
      document.getElementById('fbName').value='';
      document.getElementById('fbUrl').value='';
      document.getElementById('fbSecret').value='';
      document.getElementById('fbApiKey').value='';
      toast('Added: '+name,true);
      refreshList();
      switchTab('home',document.querySelector('[data-tab=home]'));
    }else{
      document.getElementById('addStatus').textContent='❌ '+(res.data&&res.data.error||'Failed');
      toast((res.data&&res.data.error)||'Add failed',false);
    }
  }).catch(function(){
    document.getElementById('addStatus').textContent='❌ Network error';
    toast('Network error',false);
  });
}

function deleteProject(id){
  if(!confirm('Delete this Firebase project? Mobile panel se bhi hat jayega.'))return;
  apiPost({action:'delete',id:id}).then(function(res){
    if(res.data&&res.data.ok){
      if(selProj===id){selProj='';renderProjectView();}
      toast('Project removed',true);
      refreshList();
    }else toast((res.data&&res.data.error)||'Delete failed',false);
  }).catch(function(){toast('Network error',false);});
}

function refreshList(){
  fetch(API_URL,{cache:'no-store',credentials:'same-origin'}).then(function(r){return r.json();}).then(function(d){
    if(d&&d.ok){
      allProjects=d.projects||[];
      if(d.updated){
        document.getElementById('stUpdated').textContent=d.updated;
        document.getElementById('syncUpdated').textContent=d.updated;
      }
      renderProjects();
      renderProjectView();
      toast('List refreshed',true);
    }
  }).catch(function(){toast('Refresh failed',false);});
}

renderProjects();
</script>
<?php endif; ?>
</body>
</html>
