// ==UserScript==
// @name         Rebel Adhar
// @namespace    https://github.com/ujjwalrebel53-wq/SpinPlay99
// @version      2.2.0
// @description  Astik jaisa — UIDAI OR Enter Email mode switch + safe fallback
// @match        https://myaadhaar.uidai.gov.in/*
// @match        https://*.uidai.gov.in/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  const KEY = 'rebelAdharOn';
  const LOG_ID = 'rebel-adhar-log-panel';
  const LOG_BODY = 'rebel-adhar-log-body';
  const SWITCHED_KEY = 'rebelAdharModeSwitched';
  const HIDDEN = 'rebel-dob-hidden';

  const MODE_PATTERNS = [/or\s*enter\s*e-?mail/i, /or\s*enter\s*email\s*id/i, /or\s*e-?mail/i];

  let on = localStorage.getItem(KEY) === '1';
  const logs = [];
  let netCount = 0;

  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();

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
    b.textContent = logs
      .map((l) => {
        const x = l.data !== undefined ? ' | ' + (typeof l.data === 'string' ? l.data : JSON.stringify(l.data)) : '';
        return `[${l.t}] ${l.level.toUpperCase()} ${l.msg}${x}`;
      })
      .join('\n');
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
        '#rebel-switch-btn{position:fixed;right:10px;bottom:136px;z-index:2147483647;border:none;border-radius:999px;padding:10px 12px;background:#0052a5;color:#fff;font:700 11px system-ui;box-shadow:0 6px 18px rgba(0,0,0,.35)}' +
        '#rebel-logs-btn{position:fixed;right:10px;bottom:194px;z-index:2147483647;border:none;border-radius:999px;padding:10px 12px;background:#4b5563;color:#fff;font:700 11px system-ui}' +
        '.' + HIDDEN + '{display:none!important;visibility:hidden!important;height:0!important;overflow:hidden!important}';
      document.documentElement.appendChild(st);
    }
    if (!document.getElementById(LOG_ID)) {
      const p = document.createElement('div');
      p.id = LOG_ID;
      p.innerHTML =
        '<div id="rebel-adhar-log-header"><strong>Rebel Adhar Logs</strong><span><button type="button" id="rebel-clr">Clear</button><button type="button" id="rebel-hid">Hide</button></span></div><pre id="' +
        LOG_BODY +
        '"></pre>';
      document.documentElement.appendChild(p);
      document.getElementById('rebel-clr').onclick = () => {
        logs.length = 0;
        renderLogs();
      };
      document.getElementById('rebel-hid').onclick = () => {
        const b = document.getElementById(LOG_BODY);
        b.style.display = b.style.display === 'none' ? 'block' : 'none';
      };
    }
    if (!document.getElementById('rebel-fab')) {
      const fab = document.createElement('button');
      fab.id = 'rebel-fab';
      fab.onclick = () => {
        on = !on;
        localStorage.setItem(KEY, on ? '1' : '0');
        if (on) {
          sessionStorage.removeItem(SWITCHED_KEY);
          netCount = 0;
          applyAstikMode(true);
          startRetryLoop();
        } else {
          log('info', 'OFF — page reload recommended');
        }
        updateBtns();
      };
      document.documentElement.appendChild(fab);
    }
    if (!document.getElementById('rebel-switch-btn')) {
      const b = document.createElement('button');
      b.id = 'rebel-switch-btn';
      b.textContent = 'Switch Mode';
      b.onclick = () => {
        sessionStorage.removeItem(SWITCHED_KEY);
        applyAstikMode(true);
      };
      document.documentElement.appendChild(b);
    }
    if (!document.getElementById('rebel-logs-btn')) {
      const b = document.createElement('button');
      b.id = 'rebel-logs-btn';
      b.textContent = 'Logs';
      b.onclick = () => {
        const p = document.getElementById(LOG_ID);
        p.style.display = p.style.display === 'none' ? 'block' : 'none';
      };
      document.documentElement.appendChild(b);
    }
    updateBtns();
  }

  function updateBtns() {
    const fab = document.getElementById('rebel-fab');
    if (fab) {
      fab.textContent = on ? 'Rebel Adhar: ON' : 'Rebel Adhar: OFF';
      fab.style.background = on ? '#0a7a2f' : '#b42318';
    }
  }

  function isVisible(el) {
    if (!el || el.closest('#' + LOG_ID + ',#rebel-fab,#rebel-switch-btn,#rebel-logs-btn')) return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
  }

  function directText(el) {
    return norm(
      Array.from(el.childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent)
        .join(' ')
    );
  }

  function inputs() {
    return Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]), textarea'));
  }

  function labelOf(el) {
    const l = el.closest('mat-form-field,.mat-mdc-form-field')?.querySelector('mat-label,label');
    return l?.textContent || el.getAttribute('placeholder') || '';
  }

  function isDobField(el) {
    const blob = norm([labelOf(el), el.placeholder, el.getAttribute('formcontrolname'), el.name].join(' '));
    return blob.includes('date of birth') || blob.includes('dob') || blob.includes('birth date') || el.type === 'date';
  }

  function isEmailField(el) {
    const blob = norm([labelOf(el), el.placeholder, el.getAttribute('formcontrolname')].join(' '));
    return blob.includes('email') || /email|mail/i.test(el.getAttribute('formcontrolname') || '');
  }

  function isMobileField(el) {
    const blob = norm([labelOf(el), el.placeholder, el.getAttribute('formcontrolname')].join(' '));
    return blob.includes('mobile') && !blob.includes('email');
  }

  function dobVisible() {
    return inputs().some((i) => isDobField(i) && isVisible(i));
  }

  function emailVisible() {
    return inputs().some((i) => isEmailField(i) && isVisible(i));
  }

  function formReady() {
    return inputs().length >= 2;
  }

  function modeOk() {
    return !dobVisible() || emailVisible();
  }

  function simulateClick(el) {
    const o = { bubbles: true, cancelable: true, view: window };
    el.dispatchEvent(new PointerEvent('pointerdown', o));
    el.dispatchEvent(new MouseEvent('mousedown', o));
    el.dispatchEvent(new PointerEvent('pointerup', o));
    el.dispatchEvent(new MouseEvent('mouseup', o));
    el.dispatchEvent(new MouseEvent('click', o));
    el.click?.();
  }

  function matchesMode(text) {
    if (!text || text.length > 60) return false;
    if (/enter email address/i.test(text) && !/or\s/i.test(text)) return false;
    return MODE_PATTERNS.some((p) => p.test(text));
  }

  function clickModeSwitch() {
    const mobile = inputs().find(isMobileField);
    if (mobile) {
      let node = mobile.closest('mat-form-field,.mat-mdc-form-field,div');
      for (let d = 0; d < 8 && node; d++) {
        for (const el of node.querySelectorAll('a,span,button,label,p')) {
          const text = directText(el) || norm(el.textContent || '');
          if (matchesMode(text) && isVisible(el)) {
            log('info', 'Click near mobile', text);
            simulateClick(el);
            return true;
          }
        }
        node = node.parentElement;
      }
    }

    const hits = [];
    document.querySelectorAll('a,button,span,label,p').forEach((el) => {
      const text = directText(el) || norm(el.textContent || '');
      if (matchesMode(text) && isVisible(el)) hits.push({ el, text, len: text.length });
    });
    hits.sort((a, b) => a.len - b.len);
    if (hits.length) {
      log('info', 'Click mode switch', hits[0].text);
      simulateClick(hits[0].el);
      return true;
    }
    return false;
  }

  function patchDobOnly() {
    inputs()
      .filter(isDobField)
      .forEach((input) => {
        const box = input.closest('mat-form-field,.mat-mdc-form-field,div') || input;
        box.classList.add(HIDDEN);
        input.removeAttribute('required');
        input.setCustomValidity('');
        input.disabled = false;
        const ctx = input.__ngContext__;
        if (Array.isArray(ctx)) {
          ctx.forEach((item) => {
            const c = item?.control;
            if (c?.clearValidators) {
              c.clearValidators();
              c.setErrors(null);
              c.updateValueAndValidity({ emitEvent: true });
            }
          });
        }
      });
    log('warn', 'Fallback: DOB hidden + validator cleared');
  }

  function applyAstikMode(force) {
    if (!on && !force) return;
    ensureUI();

    if (!formReady()) {
      log('warn', 'Form loading... wait');
      return;
    }

    if (!force && sessionStorage.getItem(SWITCHED_KEY) === '1' && modeOk()) {
      log('info', 'Already Mobile/Email mode');
      return;
    }

    log('info', 'Applying mode switch', { dob: dobVisible(), email: emailVisible() });

    if (dobVisible() || !emailVisible()) {
      if (!clickModeSwitch()) {
        log('warn', 'OR Enter Email not found — fallback');
        patchDobOnly();
        return;
      }
    }

    setTimeout(() => {
      const ok = modeOk();
      log('info', 'After switch', { ok, dob: dobVisible(), email: emailVisible() });
      if (!ok) patchDobOnly();
      else sessionStorage.setItem(SWITCHED_KEY, '1');
    }, 700);
  }

  function startRetryLoop() {
    let n = 0;
    const t = setInterval(() => {
      n += 1;
      if (!on || n > 12) return clearInterval(t);
      if (!formReady()) return;
      if (!modeOk()) applyAstikMode(true);
      else clearInterval(t);
    }, 1200);
  }

  function installNetLog() {
    if (window.__rebelNet) return;
    window.__rebelNet = true;
    const f = window.fetch;
    window.fetch = function (...a) {
      const u = typeof a[0] === 'string' ? a[0] : a[0]?.url || '';
      if (on && /otp|uidai|aadhaar|retrieve/i.test(u)) {
        netCount += 1;
        log('req', 'fetch', u.slice(0, 100));
      }
      return f.apply(this, a);
    };
  }

  function watchOtp() {
    document.addEventListener(
      'click',
      (e) => {
        if (!on) return;
        const t = norm(e.target?.textContent || e.target?.value || '');
        if (!t.includes('send otp') && !t.includes('request otp')) return;
        const before = netCount;
        log('info', 'Send OTP', { dob: dobVisible(), email: emailVisible(), ngInv: document.querySelectorAll('.ng-invalid').length });
        setTimeout(() => {
          if (netCount === before) log('error', 'NO API CALL — Switch Mode dabao, asli naam + registered mobile use karo');
        }, 2500);
      },
      false
    );
  }

  ensureUI();
  installNetLog();
  watchOtp();

  if (on) {
    log('info', 'v2.2 — Astik mode switch');
    applyAstikMode(true);
    startRetryLoop();
  } else {
    log('info', 'Rebel Adhar OFF — ON button dabao');
  }
})();
