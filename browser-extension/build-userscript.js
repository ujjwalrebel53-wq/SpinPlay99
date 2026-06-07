const fs = require('fs');
const path = require('path');

const header = `// ==UserScript==
// @name         Rebel Adhar
// @namespace    https://github.com/ujjwalrebel53-wq/SpinPlay99
// @version      8.2.0
// @description  Rebel Adhar — DOB bypass + sync OTP click
// @match        https://myaadhaar.uidai.gov.in/*
// @match        https://*.uidai.gov.in/*
// @grant        none
// @run-at       document-end
// ==/UserScript==
`;

const engine = fs.readFileSync(path.join(__dirname, 'uidai-engine.js'), 'utf8');

const ui = `
(function () {
  'use strict';
  const E = UidaiRetrieveEngine;
  const KEY = 'rebelAdharOn';
  const LOG_ID = 'rebel-adhar-log-panel';
  const LOG_BODY = 'rebel-adhar-log-body';
  const UI_SEL = '#' + LOG_ID + ',#rebel-fab,#rebel-switch-btn,#rebel-logs-btn,#rebel-debug-btn';

  let on = localStorage.getItem(KEY) === '1';
  const logs = [];
  let netCount = 0;

  function log(level, msg, data) {
    logs.push({ t: new Date().toLocaleTimeString(), level, msg, data });
    if (logs.length > 100) logs.shift();
    renderLogs();
    console.log('[Rebel Adhar]', level, msg, data ?? '');
  }

  function renderLogs() {
    ensureUI();
    const b = document.getElementById(LOG_BODY);
    if (!b) return;
    b.textContent = logs.map((l) => {
      const x = l.data !== undefined ? ' | ' + (typeof l.data === 'string' ? l.data : JSON.stringify(l.data)) : '';
      return '[' + l.t + '] ' + l.level.toUpperCase() + ' ' + l.msg + x;
    }).join('\\n');
    b.scrollTop = b.scrollHeight;
  }

  function ensureUI() {
    if (!document.getElementById('rebel-adhar-style')) {
      const st = document.createElement('style');
      st.id = 'rebel-adhar-style';
      st.textContent =
        '#rebel-adhar-log-panel{position:fixed;left:6px;right:6px;bottom:6px;max-height:36vh;z-index:2147483646;background:rgba(8,12,20,.97);color:#bbf7d0;border:1px solid #334155;border-radius:10px;font:10px/1.45 monospace}' +
        '#rebel-adhar-log-header{display:flex;justify-content:space-between;padding:6px 8px;background:#111827;color:#fff;font:700 11px system-ui}' +
        '#rebel-adhar-log-header button{border:none;border-radius:5px;padding:3px 7px;margin-left:4px;background:#374151;color:#fff}' +
        '#rebel-adhar-log-body{margin:0;padding:8px;max-height:calc(36vh - 32px);overflow:auto;white-space:pre-wrap}' +
        '#rebel-fab{position:fixed;right:10px;bottom:78px;z-index:2147483647;border:none;border-radius:999px;padding:12px 14px;color:#fff;font:700 12px system-ui;box-shadow:0 6px 18px rgba(0,0,0,.35)}' +
        '#rebel-switch-btn{position:fixed;right:10px;bottom:136px;z-index:2147483647;border:none;border-radius:999px;padding:10px 12px;background:#0052a5;color:#fff;font:700 11px system-ui}' +
        '#rebel-logs-btn{position:fixed;right:10px;bottom:194px;z-index:2147483647;border:none;border-radius:999px;padding:10px 12px;background:#4b5563;color:#fff;font:700 11px system-ui}';
      document.documentElement.appendChild(st);
    }
    if (!document.getElementById(LOG_ID)) {
      const p = document.createElement('div');
      p.id = LOG_ID;
      p.innerHTML = '<div id="rebel-adhar-log-header"><strong>Rebel Adhar Logs</strong><span><button type="button" id="rebel-clr">Clear</button><button type="button" id="rebel-hid">Hide</button></span></div><pre id="' + LOG_BODY + '"></pre>';
      document.documentElement.appendChild(p);
      document.getElementById('rebel-clr').onclick = function () { logs.length = 0; renderLogs(); };
      document.getElementById('rebel-hid').onclick = function () {
        document.getElementById(LOG_BODY).style.display = document.getElementById(LOG_BODY).style.display === 'none' ? 'block' : 'none';
      };
    }
    if (!document.getElementById('rebel-fab')) {
      const fab = document.createElement('button');
      fab.id = 'rebel-fab';
      fab.onclick = function () {
        on = !on;
        localStorage.setItem(KEY, on ? '1' : '0');
        if (on) runOn(); else log('info', 'OFF — page reload karo');
        updateBtns();
      };
      document.documentElement.appendChild(fab);
    }
    if (!document.getElementById('rebel-switch-btn')) {
      const b = document.createElement('button');
      b.id = 'rebel-switch-btn';
      b.textContent = 'Switch Mode';
      b.onclick = function () { if (on) E.apply(UI_SEL, log); };
      document.documentElement.appendChild(b);
    }
    if (!document.getElementById('rebel-logs-btn')) {
      const b = document.createElement('button');
      b.id = 'rebel-logs-btn';
      b.textContent = 'Logs';
      b.onclick = function () {
        document.getElementById(LOG_ID).style.display = document.getElementById(LOG_ID).style.display === 'none' ? 'block' : 'none';
      };
      document.documentElement.appendChild(b);
    }
    if (!document.getElementById('rebel-debug-btn')) {
      const b = document.createElement('button');
      b.id = 'rebel-debug-btn';
      b.textContent = 'Copy Debug';
      b.style.cssText = 'position:fixed;right:10px;bottom:252px;z-index:2147483647;border:none;border-radius:999px;padding:10px 12px;background:#7c3aed;color:#fff;font:700 11px system-ui';
      b.onclick = function () {
        const d = E.getFormDiagnostics ? E.getFormDiagnostics(UI_SEL) : {};
        const txt = JSON.stringify({ url: location.href, on: on, diag: d, logs: logs.slice(-15) }, null, 2);
        try { navigator.clipboard.writeText(txt); log('info', 'Debug copied'); } catch (_e) { log('info', 'Debug', txt); }
      };
      document.documentElement.appendChild(b);
    }
    updateBtns();
  }

  function updateBtns() {
    const fab = document.getElementById('rebel-fab');
    if (fab) {
      fab.textContent = on ? 'Rebel Adhar ON' : 'Rebel Adhar OFF';
      fab.style.background = on ? '#0a7a2f' : '#b42318';
    }
  }

  var otpNetWatch = false;

  function isOtpUrl(u) {
    return /otp|uidai|aadhaar|retrieve|send|verify|auth|generate|myaadhaar|gov\.in/i.test(u || '');
  }

  function shouldLogNet(u, method) {
    if (!on) return false;
    if (otpNetWatch) return true;
    return isOtpUrl(u) || (method && String(method).toUpperCase() === 'POST');
  }

  function installNet() {
    if (window.__rebelNet8) return;
    window.__rebelNet8 = true;
    const f = window.fetch;
    window.fetch = function () {
      const u = typeof arguments[0] === 'string' ? arguments[0] : arguments[0]?.url || '';
      const m = (arguments[1] && arguments[1].method) || 'GET';
      if (shouldLogNet(u, m)) {
        netCount += 1;
        log('req', 'fetch ' + m, u.slice(0, 120));
      }
      return f.apply(this, arguments);
    };
    const XHR = window.XMLHttpRequest;
    if (XHR && XHR.prototype) {
      const open = XHR.prototype.open;
      const send = XHR.prototype.send;
      XHR.prototype.open = function (method, url) {
        this.__rebelUrl = String(url || '');
        this.__rebelMethod = String(method || 'GET');
        return open.apply(this, arguments);
      };
      XHR.prototype.send = function () {
        if (shouldLogNet(this.__rebelUrl, this.__rebelMethod)) {
          netCount += 1;
          log('req', 'xhr ' + this.__rebelMethod, (this.__rebelUrl || '').slice(0, 120));
        }
        return send.apply(this, arguments);
      };
    }
  }

  function watchOtp() {
    if (window.__rebelOtp81) return;
    window.__rebelOtp81 = true;
    document.addEventListener('mousedown', function (e) {
      if (!on || window.__rebelOtpReplay) return;
      const btn = e.target?.closest?.('button,[role="button"],a,input[type="submit"]');
      if (!btn) return;
      const t = E.norm(btn.textContent || btn.value || '');
      if (!t.includes('send otp') && !t.includes('request otp')) return;

      e.preventDefault();
      e.stopImmediatePropagation();

      const before = netCount;
      otpNetWatch = true;
      setTimeout(function () { otpNetWatch = false; }, 6000);

      const prep = E.prepareSubmit(UI_SEL, log);
      if (!prep.formOk) {
        log('error', 'Pehle mobile + captcha bharo', prep.after);
        return;
      }

      log('info', 'OTP send', { dobBypassed: prep.dobBypassed });
      window.__rebelOtpReplay = true;
      setTimeout(function () {
        btn.click();
        setTimeout(function () {
          window.__rebelOtpReplay = false;
          if (netCount <= before) {
            log('error', 'NO API CALL');
            if (E.getFormDiagnostics) log('info', 'Debug', E.getFormDiagnostics(UI_SEL));
          }
        }, 4000);
      }, 100);
    }, true);
  }

  async function runOn() {
    ensureUI();
    installNet();
    watchOtp();
    log('info', 'Rebel Adhar ON — DOB bypass');
    const ready = await E.waitForForm(25000);
    if (!ready) { log('warn', 'Form timeout'); return; }
    await E.apply(UI_SEL, log);
    log('info', 'Ready', { dobVisible: E.dobFieldVisible(UI_SEL) });
  }

  ensureUI();
  installNet();
  watchOtp();
  if (on) runOn();
  else log('info', 'Rebel Adhar OFF — ON dabao');
})();
`;

fs.writeFileSync(path.join(__dirname, 'rebel-adhar.user.js'), header + '\n' + engine + '\n' + ui);
console.log('Built rebel-adhar.user.js');
