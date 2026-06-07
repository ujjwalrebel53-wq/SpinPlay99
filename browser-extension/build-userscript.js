const fs = require('fs');
const path = require('path');

const header = `// ==UserScript==
// @name         Rebel Adhar
// @namespace    https://github.com/ujjwalrebel53-wq/SpinPlay99
// @version      12.0.0
// @description  Rebel Adhar v12 — PAGE context injection (Angular same world)
// @match        https://myaadhaar.uidai.gov.in/*
// @match        https://*.uidai.gov.in/*
// @grant        none
// @run-at       document-start
// ==/UserScript==
`;

const engine = fs
  .readFileSync(path.join(__dirname, 'uidai-engine.js'), 'utf8')
  .replace(/<\/script>/gi, '<\\/script>');

const pageBridge = fs
  .readFileSync(path.join(__dirname, 'page-bridge.js'), 'utf8')
  .replace(/<\/script>/gi, '<\\/script>');

const pageBundle = engine + '\n' + pageBridge;

const ui = `
(function () {
  'use strict';
  var KEY = 'rebelAdharOn';
  var LOG_ID = 'rebel-adhar-log-panel';
  var LOG_BODY = 'rebel-adhar-log-body';

  function injectPage() {
    if (window.__rebelPageInjectDone) return;
    window.__rebelPageInjectDone = true;
    var code = ${JSON.stringify(pageBundle)};
    var s = document.createElement('script');
    s.textContent = code;
    (document.documentElement || document.head || document).appendChild(s);
    s.remove();
  }

  injectPage();

  var on = false;
  try { on = localStorage.getItem(KEY) === '1'; } catch (_e) {}
  var logs = [];
  var lastDiag = null;

  function log(level, msg, data) {
    logs.push({ t: new Date().toLocaleTimeString(), level: level, msg: msg, data: data });
    if (logs.length > 100) logs.shift();
    renderLogs();
    console.log('[Rebel Adhar UI]', level, msg, data ?? '');
  }

  window.addEventListener('message', function (e) {
    if (!e.data || e.data.rebel !== 1) return;
    if (e.data.type === 'log') {
      log(e.data.level || 'info', e.data.msg || '', e.data.data);
    }
    if (e.data.type === 'diag') {
      lastDiag = e.data.data;
    }
  });

  function renderLogs() {
    ensureUI();
    var b = document.getElementById(LOG_BODY);
    if (!b) return;
    b.textContent = logs.map(function (l) {
      var x = l.data !== undefined ? ' | ' + (typeof l.data === 'string' ? l.data : JSON.stringify(l.data)) : '';
      return '[' + l.t + '] ' + l.level.toUpperCase() + ' ' + l.msg + x;
    }).join('\\n');
    b.scrollTop = b.scrollHeight;
  }

  function postCmd(cmd, extra) {
    var msg = { rebel: 1, type: 'cmd', cmd: cmd };
    if (extra) Object.keys(extra).forEach(function (k) { msg[k] = extra[k]; });
    window.postMessage(msg, '*');
  }

  function requestDiag(cb) {
    var id = 'd' + Date.now();
    function handler(e) {
      if (!e.data || e.data.rebel !== 1 || e.data.type !== 'diag' || e.data.id !== id) return;
      window.removeEventListener('message', handler);
      cb(e.data.data || {});
    }
    window.addEventListener('message', handler);
    postCmd('diag', { id: id });
    setTimeout(function () {
      window.removeEventListener('message', handler);
      cb(lastDiag || {});
    }, 800);
  }

  function ensureUI() {
    if (!document.getElementById('rebel-adhar-style')) {
      var st = document.createElement('style');
      st.id = 'rebel-adhar-style';
      st.textContent =
        '#rebel-adhar-log-panel{position:fixed;left:6px;right:6px;bottom:6px;max-height:36vh;z-index:2147483646;background:rgba(8,12,20,.97);color:#bbf7d0;border:1px solid #334155;border-radius:10px;font:10px/1.45 monospace}' +
        '#rebel-adhar-log-header{display:flex;justify-content:space-between;padding:6px 8px;background:#111827;color:#fff;font:700 11px system-ui}' +
        '#rebel-adhar-log-header button{border:none;border-radius:5px;padding:3px 7px;margin-left:4px;background:#374151;color:#fff}' +
        '#rebel-adhar-log-body{margin:0;padding:8px;max-height:calc(36vh - 32px);overflow:auto;white-space:pre-wrap}' +
        '#rebel-fab{position:fixed;right:10px;bottom:78px;z-index:2147483647;border:none;border-radius:999px;padding:12px 14px;color:#fff;font:700 12px system-ui;box-shadow:0 6px 18px rgba(0,0,0,.35)}' +
        '#rebel-switch-btn{position:fixed;right:10px;bottom:136px;z-index:2147483647;border:none;border-radius:999px;padding:10px 12px;background:#0052a5;color:#fff;font:700 11px system-ui}' +
        '#rebel-logs-btn{position:fixed;right:10px;bottom:194px;z-index:2147483647;border:none;border-radius:999px;padding:10px 12px;background:#4b5563;color:#fff;font:700 11px system-ui}' +
        '#rebel-status-strip{position:fixed;top:0;left:0;right:0;z-index:2147483645;padding:6px 10px;text-align:center;font:700 12px system-ui;color:#fff;display:none}';
      document.documentElement.appendChild(st);
    }
    if (!document.getElementById(LOG_ID)) {
      var p = document.createElement('div');
      p.id = LOG_ID;
      p.innerHTML = '<div id="rebel-adhar-log-header"><strong>Rebel Adhar v12 PAGE</strong><span><button type="button" id="rebel-clr">Clear</button><button type="button" id="rebel-hid">Hide</button></span></div><pre id="' + LOG_BODY + '"></pre>';
      document.documentElement.appendChild(p);
      document.getElementById('rebel-clr').onclick = function () { logs.length = 0; renderLogs(); };
      document.getElementById('rebel-hid').onclick = function () {
        document.getElementById(LOG_BODY).style.display = document.getElementById(LOG_BODY).style.display === 'none' ? 'block' : 'none';
      };
    }
    if (!document.getElementById('rebel-status-strip')) {
      var s = document.createElement('div');
      s.id = 'rebel-status-strip';
      document.documentElement.appendChild(s);
    }
    if (!document.getElementById('rebel-fab')) {
      var fab = document.createElement('button');
      fab.id = 'rebel-fab';
      fab.onclick = function () {
        on = !on;
        try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (_e) {}
        if (on) {
          log('info', 'Rebel Adhar v12 ON — PAGE world');
          postCmd('boot');
        } else {
          log('info', 'OFF — page reload karo');
        }
        updateBtns();
      };
      document.documentElement.appendChild(fab);
    }
    if (!document.getElementById('rebel-switch-btn')) {
      var b = document.createElement('button');
      b.id = 'rebel-switch-btn';
      b.textContent = 'Bypass DOB';
      b.onclick = function () {
        if (!on) return;
        log('info', 'Bypass DOB — PAGE retry');
        postCmd('apply');
      };
      document.documentElement.appendChild(b);
    }
    if (!document.getElementById('rebel-logs-btn')) {
      var lb = document.createElement('button');
      lb.id = 'rebel-logs-btn';
      lb.textContent = 'Logs';
      lb.onclick = function () {
        document.getElementById(LOG_ID).style.display = document.getElementById(LOG_ID).style.display === 'none' ? 'block' : 'none';
      };
      document.documentElement.appendChild(lb);
    }
    if (!document.getElementById('rebel-debug-btn')) {
      var db = document.createElement('button');
      db.id = 'rebel-debug-btn';
      db.textContent = 'Copy Debug';
      db.style.cssText = 'position:fixed;right:10px;bottom:252px;z-index:2147483647;border:none;border-radius:999px;padding:10px 12px;background:#7c3aed;color:#fff;font:700 11px system-ui';
      db.onclick = function () {
        requestDiag(function (d) {
          var txt = JSON.stringify({ url: location.href, on: on, diag: d, logs: logs.slice(-15) }, null, 2);
          try { navigator.clipboard.writeText(txt); log('info', 'Debug copied'); } catch (_e2) { log('info', 'Debug', txt); }
        });
      };
      document.documentElement.appendChild(db);
    }
    updateBtns();
  }

  function updateBtns() {
    var fab = document.getElementById('rebel-fab');
    if (fab) {
      fab.textContent = on ? 'Rebel ON v12' : 'Rebel Adhar OFF';
      fab.style.background = on ? '#0a7a2f' : '#b42318';
    }
    var strip = document.getElementById('rebel-status-strip');
    if (strip) {
      strip.style.display = on ? 'block' : 'none';
      if (on) {
        strip.textContent = 'Rebel v12 PAGE mode — DOB bypass + Send OTP';
        strip.style.background = '#0a7a2f';
      }
    }
  }

  ensureUI();
  if (on) {
    log('info', 'Rebel Adhar v12 ON — PAGE injected');
    postCmd('boot');
  } else {
    log('info', 'Rebel Adhar OFF — ON dabao');
  }
})();
`;

fs.writeFileSync(path.join(__dirname, 'rebel-adhar.user.js'), header + '\n' + ui);
fs.writeFileSync(path.join(__dirname, 'page-bundle.js'), pageBundle);
console.log('Built rebel-adhar.user.js (v12 page injection, ' + Math.round(pageBundle.length / 1024) + 'KB page bundle)');
