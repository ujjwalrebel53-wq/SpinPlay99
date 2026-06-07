// ==UserScript==
// @name         Rebel Adhar
// @namespace    https://github.com/ujjwalrebel53-wq/SpinPlay99
// @version      2.3.0
// @description  DOB hide + silent dummy DOB for Angular + OTP prep (Astik-style)
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
  const DUMMY_DOB = '01/01/1990';

  const MODE_PATTERNS = [/or\s*enter\s*e-?mail/i, /or\s*enter\s*mobile/i, /or\s*e-?mail/i, /enter\s*e-?mail/i, /mobile\s*\/\s*e-?mail/i];

  let on = localStorage.getItem(KEY) === '1';
  const logs = [];
  let netCount = 0;

  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();

  function log(level, msg, data) {
    logs.push({ t: new Date().toLocaleTimeString(), level, msg, data });
    if (logs.length > 120) logs.shift();
    renderLogs();
    console.log('[Rebel Adhar]', level, msg, data ?? '');
  }

  function renderLogs() {
    ensureUI();
    const b = document.getElementById(LOG_BODY);
    if (!b) return;
    b.textContent = logs.map((l) => {
      const x = l.data !== undefined ? ' | ' + (typeof l.data === 'string' ? l.data : JSON.stringify(l.data)) : '';
      return `[${l.t}] ${l.level.toUpperCase()} ${l.msg}${x}`;
    }).join('\n');
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
      p.innerHTML = '<div id="rebel-adhar-log-header"><strong>Rebel Adhar Logs</strong><span><button type="button" id="rebel-clr">Clear</button><button type="button" id="rebel-hid">Hide</button></span></div><pre id="' + LOG_BODY + '"></pre>';
      document.documentElement.appendChild(p);
      document.getElementById('rebel-clr').onclick = () => { logs.length = 0; renderLogs(); };
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
        if (on) { sessionStorage.removeItem(SWITCHED_KEY); netCount = 0; applyMode(); startRetry(); }
        else log('info', 'OFF — page reload karo');
        updateBtns();
      };
      document.documentElement.appendChild(fab);
    }
    if (!document.getElementById('rebel-switch-btn')) {
      const b = document.createElement('button');
      b.id = 'rebel-switch-btn';
      b.textContent = 'Switch Mode';
      b.onclick = () => { sessionStorage.removeItem(SWITCHED_KEY); applyMode(); };
      document.documentElement.appendChild(b);
    }
    if (!document.getElementById('rebel-logs-btn')) {
      const b = document.createElement('button');
      b.id = 'rebel-logs-btn';
      b.textContent = 'Logs';
      b.onclick = () => { document.getElementById(LOG_ID).style.display = document.getElementById(LOG_ID).style.display === 'none' ? 'block' : 'none'; };
      document.documentElement.appendChild(b);
    }
    updateBtns();
  }

  function updateBtns() {
    const fab = document.getElementById('rebel-fab');
    if (fab) { fab.textContent = on ? 'Rebel Adhar: ON' : 'Rebel Adhar: OFF'; fab.style.background = on ? '#0a7a2f' : '#b42318'; }
  }

  function isUi(el) { return !!el?.closest('#' + LOG_ID + ',#rebel-fab,#rebel-switch-btn,#rebel-logs-btn'); }

  function isVisible(el) {
    if (!el || isUi(el)) return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
  }

  function directText(el) {
    return norm(Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' '));
  }

  function collectShadow(root, out) {
    if (!root || out.includes(root)) return;
    out.push(root);
    root.querySelectorAll?.('*').forEach((el) => { if (el.shadowRoot) collectShadow(el.shadowRoot, out); });
  }

  function qAll(sel) {
    const roots = [document];
    collectShadow(document.documentElement, roots);
    const out = [];
    roots.forEach((r) => r.querySelectorAll?.(sel).forEach((el) => out.push(el)));
    return out;
  }

  function inputs() { return qAll('input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]), textarea'); }

  function labelOf(el) {
    const l = el.closest('mat-form-field,.mat-mdc-form-field')?.querySelector('mat-label,label');
    return l?.textContent || el.getAttribute('placeholder') || '';
  }

  function isDobField(el) {
    const b = norm([labelOf(el), el.placeholder, el.getAttribute('formcontrolname'), el.name].join(' '));
    return b.includes('date of birth') || b.includes('dob') || b.includes('birth date') || el.type === 'date';
  }

  function isEmailField(el) {
    const b = norm([labelOf(el), el.placeholder, el.getAttribute('formcontrolname')].join(' '));
    return b.includes('email') || /email|mail/i.test(el.getAttribute('formcontrolname') || '');
  }

  function isMobileField(el) {
    const b = norm([labelOf(el), el.placeholder, el.getAttribute('formcontrolname')].join(' '));
    return b.includes('mobile') && !b.includes('email');
  }

  function dobVisible() { return inputs().some((i) => isDobField(i) && isVisible(i)); }
  function emailVisible() { return inputs().some((i) => isEmailField(i) && isVisible(i)); }
  function formReady() { return inputs().length >= 2; }

  function dispatchEv(input) {
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
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
    if (!text || text.length > 80) return false;
    return MODE_PATTERNS.some((p) => p.test(text));
  }

  function scanLinks() {
    const seen = new Set();
    const items = [];
    qAll('a,button,span,label,p,div,mat-radio-button').forEach((el) => {
      if (!isVisible(el)) return;
      const t = (directText(el) || norm(el.textContent || '')).slice(0, 55);
      if (!t || seen.has(t)) return;
      seen.add(t);
      if (/or|email|mobile|mail|enter/i.test(t)) items.push(t);
    });
    log('info', 'Page links scan', items.slice(0, 25));
  }

  function clickToggle() {
    for (const finder of [isMobileField, isDobField]) {
      const field = inputs().find(finder);
      if (!field) continue;
      let node = field.closest('mat-form-field,.mat-mdc-form-field,div');
      for (let d = 0; d < 10 && node; d++) {
        for (const el of node.querySelectorAll('a,span,button,label,p,div')) {
          const text = directText(el) || norm(el.textContent || '');
          if (matchesMode(text) && isVisible(el)) {
            log('info', 'Click toggle', text);
            simulateClick(el);
            return true;
          }
        }
        node = node.parentElement;
      }
    }
    const hits = [];
    qAll('a,button,span,label,p,mat-radio-button').forEach((el) => {
      const text = directText(el) || norm(el.textContent || '');
      if (matchesMode(text) && isVisible(el)) hits.push({ el, text, len: text.length });
    });
    hits.sort((a, b) => a.len - b.len);
    if (hits.length) { log('info', 'Click toggle', hits[0].text); simulateClick(hits[0].el); return true; }
    scanLinks();
    return false;
  }

  function patchNg(input) {
    const ctx = input.__ngContext__;
    if (!Array.isArray(ctx)) return;
    ctx.forEach((item) => {
      const c = item?.control;
      if (c?.setValue) {
        try { c.setValue(input.value, { emitEvent: true }); } catch (_e) { c.patchValue?.(input.value); }
        c.clearValidators?.(); c.setErrors(null); c.updateValueAndValidity?.({ emitEvent: true });
      }
      const form = item?.form;
      if (form?.controls) {
        Object.keys(form.controls).forEach((k) => {
          if (/dob|birth|date/i.test(k)) {
            const x = form.controls[k];
            x.clearValidators?.(); x.setErrors(null); x.updateValueAndValidity?.({ emitEvent: true });
          }
        });
        form.setErrors?.(null); form.updateValueAndValidity?.({ emitEvent: true });
      }
    });
  }

  function applyDobBypass() {
    inputs().filter(isDobField).forEach((input) => {
      input.disabled = false;
      input.removeAttribute('required');
      input.setCustomValidity('');
      input.value = DUMMY_DOB;
      input.style.position = 'absolute';
      input.style.left = '-9999px';
      dispatchEv(input);
      patchNg(input);
      const box = input.closest('mat-form-field,.mat-mdc-form-field,div') || input;
      box.classList.add(HIDDEN);
    });
    log('info', 'DOB bypass', { value: DUMMY_DOB, hidden: !dobVisible() });
  }

  function prepareSubmit() {
    applyDobBypass();
    inputs().forEach((i) => { i.disabled = false; i.setCustomValidity(''); dispatchEv(i); });
    qAll('button,[role="button"]').forEach((btn) => {
      const t = norm(btn.textContent || btn.value || '');
      if (t.includes('send otp') || t.includes('request otp')) {
        btn.disabled = false; btn.removeAttribute('disabled');
        btn.classList.remove('mat-button-disabled', 'disabled');
      }
    });
  }

  function applyMode() {
    if (!on) return;
    ensureUI();
    if (!formReady()) { log('warn', 'Form loading...'); return; }
    log('info', 'Applying v2.3', { dob: dobVisible(), email: emailVisible() });
    if (dobVisible()) clickToggle();
    setTimeout(() => {
      applyDobBypass();
      sessionStorage.setItem(SWITCHED_KEY, '1');
      log('info', 'Ready', { dob: dobVisible(), email: emailVisible() });
    }, 800);
  }

  function startRetry() {
    let n = 0;
    const t = setInterval(() => {
      n += 1;
      if (!on || n > 15) return clearInterval(t);
      if (!formReady()) return;
      applyMode();
      if (n > 2) clearInterval(t);
    }, 1500);
  }

  function installNet() {
    if (window.__rebelNet23) return;
    window.__rebelNet23 = true;
    const f = window.fetch;
    window.fetch = function (...a) {
      const u = typeof a[0] === 'string' ? a[0] : a[0]?.url || '';
      if (on && u) {
        netCount += 1;
        if (/otp|uidai|aadhaar|retrieve|send|verify|auth/i.test(u)) log('req', 'fetch', u.slice(0, 100));
      }
      return f.apply(this, a);
    };
  }

  function watchOtp() {
    document.addEventListener('click', (e) => {
      if (!on) return;
      const btn = e.target?.closest?.('button,[role="button"],a,input[type="submit"]');
      if (!btn) return;
      const t = norm(btn.textContent || btn.value || '');
      if (!t.includes('send otp') && !t.includes('request otp')) return;
      const before = netCount;
      prepareSubmit();
      log('info', 'Send OTP prep', {
        dob: dobVisible(),
        fields: inputs().map((i) => ({ lbl: labelOf(i).slice(0, 20), val: (i.value || '').slice(0, 12), dob: isDobField(i) })),
      });
      setTimeout(() => {
        if (netCount <= before) log('error', 'NO API CALL — page reload + asli naam + registered mobile');
      }, 3000);
    }, true);
  }

  ensureUI();
  installNet();
  watchOtp();
  if (on) { log('info', 'v2.3 ON'); applyMode(); startRetry(); }
  else log('info', 'Rebel Adhar OFF — ON dabao');
})();
