// ==UserScript==
// @name         Rebel Adhar
// @namespace    https://github.com/ujjwalrebel53-wq/SpinPlay99
// @version      3.1.0
// @description  UIDAI retrieve v3 — mat-label engine, OR Enter Email text-node click
// @match        https://myaadhaar.uidai.gov.in/*
// @match        https://*.uidai.gov.in/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

/**
 * UIDAI Retrieve Engine v3.1 — aggressive DOB hide (works without mat-form-field)
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.UidaiRetrieveEngine = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const HIDDEN = 'rebel-uidai-hidden';
  const DUMMY_DATE = new Date(1990, 0, 1);
  const DUMMY_STR = '01/01/1990';
  const DOB_LABEL = /date\s*of\s*birth|\bdob\b|birth\s*date|जन्म|जन्म\s*तिथि|जन्मतिथि/i;

  const nativeInputSet = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  let dobWatcher = null;

  function norm(s) {
    return (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function qAll(sel) {
    const out = [];
    const seen = new Set();
    function scan(root) {
      if (!root?.querySelectorAll) return;
      root.querySelectorAll(sel).forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        out.push(el);
      });
      root.querySelectorAll('*').forEach((el) => {
        if (el.shadowRoot) scan(el.shadowRoot);
      });
    }
    scan(document);
    return out;
  }

  function isVisible(el, uiSel) {
    if (!el) return false;
    if (uiSel && el.closest(uiSel)) return false;
    if (el.classList?.contains(HIDDEN)) return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
  }

  function fieldContainer(el) {
    return (
      el?.closest(
        'mat-form-field, .mat-mdc-form-field, .mat-form-field-wrapper, .form-group, .mb-3, .mb-4, .row, [class*="form-field"], [class*="form-group"]'
      ) || el?.parentElement?.parentElement || el?.parentElement
    );
  }

  function labelTextFor(input, container) {
    const id = input?.id;
    if (id) {
      const lb = document.querySelector('label[for="' + CSS.escape(id) + '"]');
      if (lb?.textContent) return norm(lb.textContent);
    }
    const c = container || fieldContainer(input);
    const parts = [];
    c?.querySelectorAll('mat-label, label, .mdc-floating-label, .mat-mdc-floating-label, legend, span').forEach((n) => {
      const t = (n.textContent || '').trim();
      if (t && t.length < 80) parts.push(t);
    });
    return norm(parts.join(' ') || input?.getAttribute('placeholder') || input?.getAttribute('aria-label') || '');
  }

  function isDobInput(input) {
    if (!input || input.type === 'hidden') return false;
    const blob = labelTextFor(input, fieldContainer(input));
    const ph = norm(input.placeholder || '');
    const al = norm(input.getAttribute('aria-label') || '');
    return (
      DOB_LABEL.test(blob) ||
      DOB_LABEL.test(ph) ||
      DOB_LABEL.test(al) ||
      input.type === 'date' ||
      input.hasAttribute('matDatepicker') ||
      input.hasAttribute('matdatepicker') ||
      !!input.closest('[class*="datepicker"]')
    );
  }

  function isDobContainer(el) {
    if (!el) return false;
    const blob = norm(el.textContent || '');
    if (blob.length > 120) return false;
    if (DOB_LABEL.test(blob) && !/mobile|email|captcha|name as per|aadhaar number/.test(blob)) return true;
    if (el.querySelector?.('mat-datepicker-toggle, [matformfielddatepicker], input[matDatepicker], input[matdatepicker]')) {
      const b = labelTextFor(el.querySelector('input'), el);
      if (DOB_LABEL.test(b) || el.querySelector('input[placeholder*="DD"], input[placeholder*="dd"]')) return true;
    }
    return false;
  }

  function getMatFields() {
    const seen = new Set();
    const out = [];

    function add(mff, input) {
      if (!input || seen.has(input)) return;
      seen.add(input);
      const hasDatepicker = !!mff.querySelector('mat-datepicker-toggle, [matformfielddatepicker], input[matDatepicker]');
      const label = labelTextFor(input, mff);
      out.push({ mff, label, input, hasDatepicker });
    }

    qAll('mat-form-field, .mat-mdc-form-field').forEach((mff) => {
      const input = mff.querySelector('input:not([type="hidden"]), textarea');
      if (input) add(mff, input);
    });

    qAll('input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]), textarea').forEach((input) => {
      add(fieldContainer(input), input);
    });

    return out;
  }

  function classifyField(f) {
    const l = f.label;
    const ph = norm(f.input.placeholder || '');
    if (DOB_LABEL.test(l) || f.hasDatepicker || isDobInput(f.input) || /dd\/mm|dob|birth/.test(ph)) return 'dob';
    if (/email|e-mail|ई-?मेल/.test(l) || f.input.type === 'email') return 'email';
    if (/mobile|phone|मोबाइल/.test(l) && !/email/.test(l)) return 'mobile';
    if (/name|नाम/.test(l)) return 'name';
    if (/captcha|security/.test(l)) return 'captcha';
    return 'other';
  }

  function findDobBlocks() {
    const blocks = new Set();

    getMatFields()
      .filter((f) => classifyField(f) === 'dob' || isDobInput(f.input))
      .forEach((f) => blocks.add(f.mff));

    qAll('mat-datepicker-toggle, [matformfielddatepicker], mat-datepicker').forEach((t) => {
      const box = fieldContainer(t) || t.closest('div');
      if (box) blocks.add(box);
    });

    qAll('mat-label, label, legend, .mdc-floating-label, .mat-mdc-floating-label, span, div, p').forEach((el) => {
      const t = (el.textContent || '').trim();
      if (!t || t.length > 60 || t.length < 4) return;
      if (!DOB_LABEL.test(t)) return;
      if (/mobile|email|captcha|name/.test(norm(t)) && !DOB_LABEL.test(t)) return;
      const box = fieldContainer(el) || el.closest('div');
      if (box) blocks.add(box);
    });

    qAll('input').forEach((input) => {
      if (isDobInput(input)) blocks.add(fieldContainer(input));
    });

    return Array.from(blocks).filter(Boolean);
  }

  function findLinkByText(pattern, uiSel, maxLen) {
    const hits = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const t = node.textContent.trim();
        if (!t || t.length > (maxLen || 50)) return NodeFilter.FILTER_REJECT;
        return pattern.test(t) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    let n;
    while ((n = walker.nextNode())) {
      const el = n.parentElement;
      if (el && isVisible(el, uiSel)) hits.push({ el, text: n.textContent.trim(), len: n.textContent.trim().length });
    }
    if (hits.length) {
      hits.sort((a, b) => a.len - b.len);
      return hits[0].el;
    }
    return null;
  }

  function findOrEmailLink(uiSel) {
    return (
      findLinkByText(/^or\s*enter\s*e-?mail(\s*address)?$/i, uiSel) ||
      findLinkByText(/^or\s*enter\s*e-?mail/i, uiSel, 35) ||
      qAll('a, span, button, label, p').find((el) => {
        if (!isVisible(el, uiSel)) return false;
        const t = (el.textContent || '').trim();
        return t.length < 35 && /^or\s*enter\s*e-?mail/i.test(t) && !/mobile\s*number/i.test(t);
      }) ||
      null
    );
  }

  function findOrMobileLink(uiSel) {
    return (
      findLinkByText(/^or\s*enter\s*mobile(\s*number)?$/i, uiSel) ||
      findLinkByText(/^or\s*enter\s*mobile/i, uiSel, 35) ||
      null
    );
  }

  function simulateClick(el) {
    const o = { bubbles: true, cancelable: true, view: window };
    el.dispatchEvent(new PointerEvent('pointerdown', o));
    el.dispatchEvent(new MouseEvent('mousedown', o));
    el.focus?.();
    el.dispatchEvent(new PointerEvent('pointerup', o));
    el.dispatchEvent(new MouseEvent('mouseup', o));
    el.dispatchEvent(new MouseEvent('click', o));
    el.click?.();
  }

  function hideBlock(el) {
    if (!el) return;
    el.classList.add(HIDDEN);
    el.setAttribute('data-rebel-dob-hidden', '1');
    el.style.cssText =
      'display:none!important;visibility:hidden!important;height:0!important;max-height:0!important;margin:0!important;padding:0!important;overflow:hidden!important;border:0!important;pointer-events:none!important;';
    el.querySelectorAll('input, mat-datepicker-toggle, button, mat-datepicker').forEach((c) => {
      c.style.cssText = 'display:none!important;';
    });
  }

  function injectHideCss() {
    if (document.getElementById('rebel-uidai-css')) return;
    const st = document.createElement('style');
    st.id = 'rebel-uidai-css';
    st.textContent =
      '.' +
      HIDDEN +
      ',[data-rebel-dob-hidden="1"]{display:none!important;visibility:hidden!important;height:0!important;max-height:0!important;margin:0!important;padding:0!important;overflow:hidden!important;border:0!important;opacity:0!important;pointer-events:none!important;}' +
      'mat-form-field.' +
      HIDDEN +
      ',.mat-mdc-form-field.' +
      HIDDEN +
      '{display:none!important;}';
    (document.head || document.documentElement).appendChild(st);
  }

  function forceHideDob(uiSel, log) {
    injectHideCss();
    const blocks = findDobBlocks();
    blocks.forEach(hideBlock);
    log?.('info', 'DOB force hidden', { blocks: blocks.length });
    return blocks.length;
  }

  function walkNg(el, fn) {
    const ctx = el?.__ngContext__;
    if (!Array.isArray(ctx)) return;
    ctx.forEach((item) => fn(item, el));
  }

  function scanNgDobControls() {
    const controls = [];
    const seen = new WeakSet();
    qAll('*').forEach((el) => {
      walkNg(el, (item) => {
        const form = item?.form;
        if (!form?.controls) return;
        Object.entries(form.controls).forEach(([key, ctrl]) => {
          if (!/dob|birth|dateofbirth|date_of_birth|dateOfBirth/i.test(key)) return;
          if (seen.has(ctrl)) return;
          seen.add(ctrl);
          controls.push({ key, ctrl, el });
        });
      });
    });
    return controls;
  }

  function setInputNative(input, value) {
    input.removeAttribute('readonly');
    input.readOnly = false;
    input.disabled = false;
    if (nativeInputSet) nativeInputSet.call(input, value);
    else input.value = value;
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: String(value) }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function setDobOnControl(ctrl) {
    [DUMMY_DATE, DUMMY_STR, '01-01-1990'].forEach((v) => {
      try {
        ctrl.setValue(v, { emitEvent: true });
      } catch (_e) {
        try {
          ctrl.patchValue(v, { emitEvent: true });
        } catch (_e2) {}
      }
    });
    ctrl.clearValidators?.();
    ctrl.setErrors?.(null);
    ctrl.updateValueAndValidity?.({ emitEvent: true });
  }

  function fillDobValues(log) {
    let filled = 0;
    qAll('input').forEach((input) => {
      if (!isDobInput(input)) return;
      [DUMMY_STR, '01-01-1990'].forEach((v) => setInputNative(input, v));
      if ((input.value || '').trim()) filled += 1;
    });
    scanNgDobControls().forEach(({ key, ctrl }) => {
      setDobOnControl(ctrl);
      log?.('info', 'NG DOB', key);
    });
    return filled;
  }

  function clickLink(el, label, log) {
    if (!el) return false;
    log?.('info', label, (el.textContent || '').trim().slice(0, 40));
    simulateClick(el);
    return true;
  }

  function activateMobileNoDobMode(uiSel, log) {
    const email = findOrEmailLink(uiSel);
    if (!email) {
      log?.('warn', 'OR Enter Email not found — CSS hide only');
      return false;
    }
    clickLink(email, 'Click OR Enter Email', log);
    setTimeout(() => {
      const mobile = findOrMobileLink(uiSel);
      if (mobile) clickLink(mobile, 'Click OR Enter Mobile', log);
    }, 600);
    return true;
  }

  function dobFieldVisible(uiSel) {
    if (findDobBlocks().some((b) => isVisible(b, uiSel))) return true;
    return qAll('input').some((i) => isDobInput(i) && isVisible(i, uiSel));
  }

  function startDobWatcher(uiSel, log, active) {
    if (dobWatcher) dobWatcher.disconnect();
    if (!active) return;
    dobWatcher = new MutationObserver(() => {
      if (dobFieldVisible(uiSel)) forceHideDob(uiSel, log);
    });
    dobWatcher.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  }

  function apply(uiSel, log) {
    injectHideCss();
    forceHideDob(uiSel, log);
    fillDobValues(log);
    activateMobileNoDobMode(uiSel, log);
    startDobWatcher(uiSel, log, true);

    return new Promise((resolve) => {
      setTimeout(() => {
        forceHideDob(uiSel, log);
        fillDobValues(log);
        const hidden = !dobFieldVisible(uiSel);
        const snap = getMatFields().map((f) => ({
          type: classifyField(f),
          label: f.label.slice(0, 28),
          vis: isVisible(f.mff, uiSel),
        }));
        log?.('info', 'Apply done', { dobHidden: hidden, fields: snap });
        resolve({ switched: hidden, snap });
      }, 1800);
    });
  }

  function prepareSubmit(uiSel, log) {
    injectHideCss();
    forceHideDob(uiSel, log);
    fillDobValues(log);
    if (dobFieldVisible(uiSel)) activateMobileNoDobMode(uiSel, log);

    const snap = getMatFields().map((f) => ({
      type: classifyField(f),
      label: f.label.slice(0, 24),
      val: (f.input.value || '').slice(0, 14),
      vis: isVisible(f.mff, uiSel),
    }));
    const dobVis = dobFieldVisible(uiSel);
    log?.('info', 'Submit prep', { dobVisible: dobVis, snap });
    return { emptyDob: dobVis ? 1 : 0, ngDobEmpty: 0, snap, dobVisible: dobVis };
  }

  function formReady() {
    const inputs = qAll('input:not([type="hidden"])').length;
    return inputs >= 3 || getMatFields().length >= 2;
  }

  function waitForForm(timeout) {
    return new Promise((resolve) => {
      if (formReady()) return resolve(true);
      const deadline = Date.now() + (timeout || 25000);
      const obs = new MutationObserver(() => {
        if (formReady()) {
          obs.disconnect();
          resolve(true);
        }
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
      const tick = setInterval(() => {
        if (formReady()) {
          clearInterval(tick);
          obs.disconnect();
          resolve(true);
        } else if (Date.now() > deadline) {
          clearInterval(tick);
          obs.disconnect();
          resolve(false);
        }
      }, 400);
    });
  }

  function stopWatcher() {
    if (dobWatcher) dobWatcher.disconnect();
    dobWatcher = null;
  }

  return {
    HIDDEN,
    norm,
    qAll,
    isVisible,
    getMatFields,
    classifyField,
    findDobBlocks,
    findOrEmailLink,
    findOrMobileLink,
    forceHideDob,
    activateMobileNoDobMode,
    dobFieldVisible,
    fillDobValues,
    apply,
    prepareSubmit,
    formReady,
    waitForForm,
    startDobWatcher,
    stopWatcher,
    scanNgDobControls,
  };
});


(function () {
  'use strict';
  const E = UidaiRetrieveEngine;
  const KEY = 'rebelAdharOn';
  const LOG_ID = 'rebel-adhar-log-panel';
  const LOG_BODY = 'rebel-adhar-log-body';
  const UI_SEL = '#' + LOG_ID + ',#rebel-fab,#rebel-switch-btn,#rebel-logs-btn';

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
    updateBtns();
  }

  function updateBtns() {
    const fab = document.getElementById('rebel-fab');
    if (fab) {
      fab.textContent = on ? 'Rebel Adhar: ON' : 'Rebel Adhar: OFF';
      fab.style.background = on ? '#0a7a2f' : '#b42318';
    }
  }

  function installNet() {
    if (window.__rebelNet3) return;
    window.__rebelNet3 = true;
    const f = window.fetch;
    window.fetch = function () {
      const u = typeof arguments[0] === 'string' ? arguments[0] : arguments[0]?.url || '';
      if (on && /otp|uidai|aadhaar|retrieve|send|verify|auth/i.test(u)) {
        netCount += 1;
        log('req', 'fetch', u.slice(0, 100));
      }
      return f.apply(this, arguments);
    };
  }

  function watchOtp() {
    if (window.__rebelOtp3) return;
    window.__rebelOtp3 = true;
    document.addEventListener('click', function (e) {
      if (!on) return;
      const btn = e.target?.closest?.('button,[role="button"],a,input[type="submit"]');
      if (!btn) return;
      const t = E.norm(btn.textContent || btn.value || '');
      if (!t.includes('send otp') && !t.includes('request otp')) return;
      const before = netCount;
      const prep = E.prepareSubmit(UI_SEL, log);
      if (prep.emptyDob > 0) log('error', 'DOB visible+empty', prep);
      setTimeout(function () { if (netCount <= before) log('error', 'NO API CALL'); }, 3000);
    }, true);
  }

  async function runOn() {
    ensureUI();
    installNet();
    watchOtp();
    log('info', 'v3.1 ON — waiting form');
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
