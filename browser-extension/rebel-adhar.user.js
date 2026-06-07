// ==UserScript==
// @name         Rebel Adhar
// @namespace    https://github.com/ujjwalrebel53-wq/SpinPlay99
// @version      2.4.0
// @description  Leaf OR Enter Email click + native DOB setter (fixes empty DOB bug)
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
  const HIDDEN = 'rebel-dob-hidden';
  const DUMMY_DOB = '01/01/1990';

  let on = localStorage.getItem(KEY) === '1';
  const logs = [];
  let netCount = 0;
  let applied = false;

  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const nativeSet = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

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
        '#rebel-switch-btn{position:fixed;right:10px;bottom:136px;z-index:2147483647;border:none;border-radius:999px;padding:10px 12px;background:#0052a5;color:#fff;font:700 11px system-ui}' +
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
        document.getElementById(LOG_BODY).style.display = document.getElementById(LOG_BODY).style.display === 'none' ? 'block' : 'none';
      };
    }
    if (!document.getElementById('rebel-fab')) {
      const fab = document.createElement('button');
      fab.id = 'rebel-fab';
      fab.onclick = () => {
        on = !on;
        localStorage.setItem(KEY, on ? '1' : '0');
        applied = false;
        if (on) { netCount = 0; applyMode(); waitForm(); }
        else log('info', 'OFF — reload');
        updateBtns();
      };
      document.documentElement.appendChild(fab);
    }
    if (!document.getElementById('rebel-switch-btn')) {
      const b = document.createElement('button');
      b.id = 'rebel-switch-btn';
      b.textContent = 'Switch Mode';
      b.onclick = () => { applied = false; applyMode(); };
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

  function qAll(sel) {
    const out = [];
    document.querySelectorAll(sel).forEach((el) => out.push(el));
    document.querySelectorAll('*').forEach((el) => { if (el.shadowRoot) el.shadowRoot.querySelectorAll(sel).forEach((x) => out.push(x)); });
    return out;
  }

  function inputs() { return qAll('input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]), textarea'); }

  function meta(el) {
    return norm([el.getAttribute('formcontrolname'), el.placeholder, el.name, el.id, el.getAttribute('aria-label')].join(' '));
  }

  function isDob(el) {
    const m = meta(el);
    const fc = (el.getAttribute('formcontrolname') || '').toLowerCase();
    return m.includes('date of birth') || m.includes('dob') || m.includes('birth') || el.type === 'date' || /dob|birth|dateofbirth/.test(fc);
  }

  function isEmail(el) {
    const m = meta(el);
    return m.includes('email') || /email|mail/.test(el.getAttribute('formcontrolname') || '');
  }

  function dobInputs() {
    const seen = new Set();
    return inputs().filter((i) => {
      if (!isDob(i)) return false;
      const k = (i.getAttribute('formcontrolname') || '') + i.placeholder;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  function dobVis() { return dobInputs().some((i) => isVisible(i.closest('mat-form-field,.mat-mdc-form-field,div') || i)); }
  function emailVis() { return inputs().some((i) => isEmail(i) && isVisible(i)); }
  function ready() { return inputs().length >= 2; }

  function setVal(input, v) {
    input.removeAttribute('readonly');
    input.disabled = false;
    if (nativeSet) nativeSet.call(input, v);
    else input.value = v;
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: v }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    const ctx = input.__ngContext__;
    if (Array.isArray(ctx)) {
      ctx.forEach((item) => {
        const c = item?.control;
        if (c?.setValue) {
          try { c.setValue(v, { emitEvent: true }); } catch (_e) { c.patchValue?.(v); }
          c.clearValidators?.(); c.setErrors(null); c.updateValueAndValidity?.({ emitEvent: true });
        }
        const form = item?.form;
        if (form?.controls) {
          Object.keys(form.controls).forEach((k) => {
            if (!/dob|birth|date/i.test(k)) return;
            const x = form.controls[k];
            try { x.setValue?.(v, { emitEvent: true }); } catch (_e) { x.patchValue?.(v); }
            x.clearValidators?.(); x.setErrors?.(null); x.updateValueAndValidity?.({ emitEvent: true });
          });
          form.updateValueAndValidity?.({ emitEvent: true });
        }
      });
    }
  }

  function isOrEmail(text) {
    const t = norm(text);
    if (!t || t.length > 40) return false;
    if (t.includes('mobile number') && t.includes('email')) return false;
    return /^or\s*enter\s*e-?mail(\s*address)?$/i.test(t) || /^or\s*e-?mail$/i.test(t);
  }

  function findOrEmail() {
    const hits = [];
    qAll('a,span,button,label,p,div').forEach((el) => {
      if (!isVisible(el)) return;
      const own = directText(el);
      if (own && isOrEmail(own)) { hits.push({ el, text: own, len: own.length }); return; }
      if (el.querySelectorAll('a,span,button,label,p').length) return;
      const full = norm(el.textContent || '');
      if (isOrEmail(full)) hits.push({ el, text: full, len: full.length });
    });
    hits.sort((a, b) => a.len - b.len);
    return hits[0]?.el;
  }

  function clickOrEmail() {
    const el = findOrEmail();
    if (!el) { log('warn', 'OR Enter Email leaf not found'); return false; }
    log('info', 'Click OR Enter Email', directText(el) || el.textContent?.trim());
    const o = { bubbles: true, cancelable: true, view: window };
    el.dispatchEvent(new MouseEvent('mousedown', o));
    el.dispatchEvent(new MouseEvent('mouseup', o));
    el.dispatchEvent(new MouseEvent('click', o));
    el.click?.();
    return true;
  }

  function fillDob() {
    let filled = 0;
    dobInputs().forEach((input) => {
      [DUMMY_DOB, '01-01-1990'].forEach((v) => setVal(input, v));
      if ((input.value || '').trim()) filled += 1;
    });
    return { total: dobInputs().length, filled, fields: dobInputs().map((i) => ({ fc: i.getAttribute('formcontrolname'), val: i.value })) };
  }

  function hideDob() {
    dobInputs().forEach((input) => {
      const box = input.closest('mat-form-field,.mat-mdc-form-field,div') || input;
      box.classList.add(HIDDEN);
    });
  }

  function dobBypass() {
    const r = fillDob();
    hideDob();
    log('info', 'DOB bypass', r);
    if (r.filled < r.total) log('warn', 'DOB inputs still empty', r.fields);
  }

  function applyMode() {
    if (!on) return;
    ensureUI();
    if (!ready()) { log('warn', 'Form loading...'); return; }
    if (applied && !dobVis()) return;
    log('info', 'Applying v2.4', { dob: dobVis(), email: emailVis() });
    if (dobVis()) clickOrEmail();
    setTimeout(() => {
      if (!dobVis() || emailVis()) log('info', 'Mode switched OK');
      else dobBypass();
      applied = true;
      log('info', 'Ready', { dob: dobVis(), email: emailVis() });
    }, 900);
  }

  function waitForm() {
    let n = 0;
    const t = setInterval(() => {
      n += 1;
      if (!on || n > 8 || applied) return clearInterval(t);
      if (!ready()) return;
      applyMode();
      if (applied) clearInterval(t);
    }, 1500);
  }

  function prepSubmit() {
    fillDob();
    hideDob();
    inputs().forEach((i) => { i.disabled = false; if (isDob(i) && !(i.value || '').trim()) setVal(i, DUMMY_DOB); });
  }

  function installNet() {
    if (window.__rebelNet24) return;
    window.__rebelNet24 = true;
    const f = window.fetch;
    window.fetch = function (...a) {
      const u = typeof a[0] === 'string' ? a[0] : a[0]?.url || '';
      if (on && /otp|uidai|aadhaar|retrieve|send|verify|auth/i.test(u)) { netCount += 1; log('req', 'fetch', u.slice(0, 100)); }
      return f.apply(this, a);
    };
  }

  function watchOtp() {
    document.addEventListener('click', (e) => {
      if (!on) return;
      const btn = e.target?.closest?.('button,[role="button"],a');
      if (!btn) return;
      const t = norm(btn.textContent || btn.value || '');
      if (!t.includes('send otp') && !t.includes('request otp')) return;
      const before = netCount;
      prepSubmit();
      const snap = inputs().map((i) => ({ fc: i.getAttribute('formcontrolname') || '', val: (i.value || '').slice(0, 14), dob: isDob(i) }));
      const emptyDob = snap.filter((x) => x.dob && !x.val).length;
      log('info', 'Send OTP prep', { emptyDob, fields: snap });
      if (emptyDob) log('error', 'DOB empty — Angular block karega');
      setTimeout(() => { if (netCount <= before) log('error', 'NO API CALL'); }, 3000);
    }, true);
  }

  ensureUI();
  installNet();
  watchOtp();
  if (on) { log('info', 'v2.4 ON'); applyMode(); waitForm(); }
  else log('info', 'Rebel Adhar OFF');
})();
