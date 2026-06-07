/**
 * Rebel Adhar v2.4 — leaf toggle click + native DOB setter + verify
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.AstikHelperCore = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const ACTIVE_CLASS = 'astik-helper-active';
  const FAB_ID = 'astik-helper-fab';
  const LOG_PANEL_ID = 'rebel-adhar-log-panel';
  const LOG_BODY_ID = 'rebel-adhar-log-body';
  const SWITCHED_KEY = 'rebelAdharModeSwitched';
  const HIDDEN_CLASS = 'astik-helper-hidden';
  const DUMMY_DOB = '01/01/1990';

  const logs = [];
  let enabledState = false;
  let networkHooksInstalled = false;
  let otpPrepInstalled = false;
  let networkCount = 0;
  let lastOtpClickNet = 0;
  let modeApplied = false;

  function norm(s) {
    return (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function log(level, msg, data) {
    const line = { time: new Date().toLocaleTimeString(), level, msg, data };
    logs.push(line);
    if (logs.length > 120) logs.shift();
    renderLogs();
    console.log('[Rebel Adhar]', level, msg, data ?? '');
  }

  function ensureLogPanel() {
    if (document.getElementById(LOG_PANEL_ID)) return;
    const panel = document.createElement('div');
    panel.id = LOG_PANEL_ID;
    panel.innerHTML =
      '<div id="rebel-adhar-log-header" style="display:flex;justify-content:space-between;padding:8px;background:#111827;color:#fff;font:700 12px system-ui">' +
      '<strong>Rebel Adhar Logs</strong>' +
      '<span><button type="button" id="rebel-log-clear" style="border:none;border-radius:5px;padding:3px 8px;background:#374151;color:#fff">Clear</button></span>' +
      '</div><pre id="' +
      LOG_BODY_ID +
      '" style="margin:0;padding:10px;max-height:220px;overflow:auto;font:11px monospace;color:#bbf7d0;background:rgba(8,12,20,.97)"></pre>';
    document.documentElement.appendChild(panel);
    document.getElementById('rebel-log-clear').onclick = () => {
      logs.length = 0;
      renderLogs();
    };
  }

  function renderLogs() {
    ensureLogPanel();
    const body = document.getElementById(LOG_BODY_ID);
    if (!body) return;
    body.textContent = logs
      .map((l) => {
        const x = l.data !== undefined ? ' | ' + (typeof l.data === 'string' ? l.data : JSON.stringify(l.data)) : '';
        return `[${l.time}] ${l.level.toUpperCase()} ${l.msg}${x}`;
      })
      .join('\n');
    body.scrollTop = body.scrollHeight;
  }

  function isUi(el) {
    return !!el?.closest(`#${LOG_PANEL_ID}, #${FAB_ID}, #rebel-fab, #rebel-switch-btn, #rebel-logs-btn`);
  }

  function isVisible(el) {
    if (!el || isUi(el)) return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
  }

  function directText(el) {
    if (!el) return '';
    return norm(
      Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent)
        .join(' ')
    );
  }

  function collectRoots(root, out) {
    if (!root || out.includes(root)) return;
    out.push(root);
    root.querySelectorAll?.('*').forEach((el) => {
      if (el.shadowRoot) collectRoots(el.shadowRoot, out);
    });
  }

  function queryAll(selector) {
    const roots = [document];
    collectRoots(document.documentElement, roots);
    const out = [];
    roots.forEach((root) => root.querySelectorAll?.(selector).forEach((el) => out.push(el)));
    return out;
  }

  const nativeSet = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  const nativeTextSet = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;

  function getInputs() {
    return queryAll('input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]), textarea');
  }

  function fieldMeta(el) {
    return norm(
      [
        labelOf(el),
        el.placeholder,
        el.getAttribute('formcontrolname'),
        el.getAttribute('ng-reflect-name'),
        el.name,
        el.id,
        el.getAttribute('aria-label'),
      ].join(' ')
    );
  }

  function labelOf(el) {
    const id = el?.id;
    if (id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (lbl) return lbl.textContent || '';
    }
    const l = el?.closest('mat-form-field,.mat-mdc-form-field')?.querySelector('mat-label,label,.form-label');
    return l?.textContent || el?.getAttribute('placeholder') || el?.getAttribute('aria-label') || '';
  }

  function isDobField(el) {
    const blob = fieldMeta(el);
    const fc = (el.getAttribute('formcontrolname') || '').toLowerCase();
    return (
      blob.includes('date of birth') ||
      blob.includes('dob') ||
      blob.includes('birth date') ||
      el.type === 'date' ||
      /dob|birth|dateofbirth|date_of_birth/.test(fc)
    );
  }

  function isEmailField(el) {
    const blob = fieldMeta(el);
    const fc = (el.getAttribute('formcontrolname') || '').toLowerCase();
    return blob.includes('email') || /email|mailid|mail_id/.test(fc);
  }

  function isMobileField(el) {
    const blob = fieldMeta(el);
    const fc = (el.getAttribute('formcontrolname') || '').toLowerCase();
    return (blob.includes('mobile') || /mobile|phone|mob/.test(fc)) && !blob.includes('email');
  }

  function dobVisible() {
    return getDobInputs().some((i) => isVisible(i.closest('mat-form-field,.mat-mdc-form-field,div') || i));
  }

  function emailVisible() {
    return getInputs().some((i) => isEmailField(i) && isVisible(i));
  }

  function formReady() {
    return getInputs().length >= 2;
  }

  function getDobInputs() {
    const seen = new Set();
    const out = [];
    getInputs().forEach((input) => {
      if (!isDobField(input)) return;
      const key = input.getAttribute('formcontrolname') + '|' + input.placeholder + '|' + input.type;
      if (seen.has(key) && !(input.value || '').trim()) return;
      seen.add(key);
      out.push(input);
    });
    return out;
  }

  function dispatchInputEvents(input) {
    input.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: input.value }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function setNativeValue(input, value) {
    input.removeAttribute('readonly');
    input.disabled = false;
    if (input.tagName === 'TEXTAREA' && nativeTextSet) nativeTextSet.call(input, value);
    else if (nativeSet) nativeSet.call(input, value);
    else input.value = value;
  }

  function simulateClick(el) {
    if (!el) return false;
    const opts = { bubbles: true, cancelable: true, view: window };
    try {
      el.dispatchEvent(new PointerEvent('pointerdown', opts));
      el.dispatchEvent(new MouseEvent('mousedown', opts));
      el.focus?.();
      el.dispatchEvent(new PointerEvent('pointerup', opts));
      el.dispatchEvent(new MouseEvent('mouseup', opts));
      el.dispatchEvent(new MouseEvent('click', opts));
      el.click?.();
      return true;
    } catch (_e) {
      try {
        el.click();
        return true;
      } catch (_e2) {
        return false;
      }
    }
  }

  /** Only leaf "OR Enter Email" — NOT parent with mobile+email combined text */
  function isOrEmailToggle(text) {
    const t = norm(text).replace(/\s+/g, ' ');
    if (!t || t.length > 40) return false;
    if (t.includes('mobile number') && t.includes('email')) return false;
    if (t.includes('enter name') || t.includes('captcha')) return false;
    return /^or\s*enter\s*e-?mail(\s*address)?$/i.test(t) || /^or\s*e-?mail$/i.test(t) || t === 'or enter email address';
  }

  function findOrEmailToggle() {
    const hits = [];
    queryAll('a, span, button, label, p, div').forEach((el) => {
      if (!isVisible(el)) return;
      const own = directText(el);
      if (own && isOrEmailToggle(own)) {
        hits.push({ el, text: own, score: own.length });
        return;
      }
      const kids = el.querySelectorAll('a, span, button, label, p');
      if (kids.length) return;
      const full = norm(el.textContent || '');
      if (isOrEmailToggle(full)) hits.push({ el, text: full, score: full.length });
    });
    hits.sort((a, b) => a.score - b.score);
    return hits[0]?.el || null;
  }

  function clickOrEmailToggle() {
    const el = findOrEmailToggle();
    if (!el) {
      log('warn', 'OR Enter Email leaf not found');
      return false;
    }
    log('info', 'Click OR Enter Email', directText(el) || el.textContent?.trim());
    simulateClick(el);
    return true;
  }

  function walkNgContext(el, visitor) {
    const ctx = el?.__ngContext__;
    if (!Array.isArray(ctx)) return;
    ctx.forEach((item) => visitor(item, el));
  }

  function syncToAngular(input, value) {
    walkNgContext(input, (item) => {
      const ctrl = item?.control;
      if (ctrl?.setValue) {
        try {
          ctrl.setValue(value, { emitEvent: true });
        } catch (_e) {
          ctrl.patchValue?.(value, { emitEvent: true });
        }
        ctrl.clearValidators?.();
        ctrl.setErrors(null);
        ctrl.updateValueAndValidity?.({ emitEvent: true });
      }
      const form = item?.form;
      if (form?.controls) {
        Object.keys(form.controls).forEach((key) => {
          if (!/dob|birth|date/i.test(key)) return;
          const c = form.controls[key];
          try {
            c.setValue?.(value, { emitEvent: true });
          } catch (_e) {
            c.patchValue?.(value);
          }
          c.clearValidators?.();
          c.setErrors?.(null);
          c.updateValueAndValidity?.({ emitEvent: true });
        });
        form.setErrors?.(null);
        form.updateValueAndValidity?.({ emitEvent: true });
      }
    });
  }

  function fillAllDob(value) {
    const formats = [value, '01-01-1990', '1990-01-01'];
    let filled = 0;
    getDobInputs().forEach((input) => {
      formats.forEach((f) => {
        setNativeValue(input, f);
        dispatchInputEvents(input);
        syncToAngular(input, f);
      });
      if ((input.value || '').trim()) filled += 1;
    });
    return { total: getDobInputs().length, filled };
  }

  function hideDobVisual() {
    getDobInputs().forEach((input) => {
      const box = input.closest('mat-form-field,.mat-mdc-form-field,.form-group,div') || input;
      box.classList.add(HIDDEN_CLASS);
      box.style.setProperty('display', 'none', 'important');
      box.style.setProperty('visibility', 'hidden', 'important');
      box.style.setProperty('height', '0', 'important');
      box.style.setProperty('overflow', 'hidden', 'important');
    });
  }

  function applyDobBypass() {
    const before = fillAllDob(DUMMY_DOB);
    hideDobVisual();
    const after = getDobInputs().map((i) => ({
      fc: i.getAttribute('formcontrolname') || '',
      val: (i.value || '').slice(0, 12),
    }));
    const empty = after.filter((x) => !x.val).length;
    log('info', 'DOB bypass', { ...before, empty, fields: after });
    if (empty > 0) log('warn', 'Some DOB inputs still empty after set');
    return empty === 0;
  }

  function modeOk() {
    return !dobVisible() || emailVisible();
  }

  function patchAllForms() {
    queryAll('input, textarea, form, mat-form-field, button').forEach((el) => {
      walkNgContext(el, (item) => {
        const form = item?.form;
        if (!form?.controls) return;
        Object.keys(form.controls).forEach((key) => {
          const c = form.controls[key];
          if (/dob|birth|date/i.test(key)) {
            if (!(c.value || '').trim()) {
              try {
                c.setValue(DUMMY_DOB, { emitEvent: true });
              } catch (_e) {
                c.patchValue?.(DUMMY_DOB);
              }
            }
            c.clearValidators?.();
            c.setErrors?.(null);
            c.updateValueAndValidity?.({ emitEvent: true });
          }
        });
        form.setErrors?.(null);
        form.updateValueAndValidity?.({ emitEvent: true });
      });
    });
  }

  function prepareFormForSubmit() {
    if (!enabledState) return;
    fillAllDob(DUMMY_DOB);
    patchAllForms();
    hideDobVisual();
    getInputs().forEach((input) => {
      input.disabled = false;
      input.setCustomValidity('');
      if (isDobField(input) && !(input.value || '').trim()) {
        setNativeValue(input, DUMMY_DOB);
        dispatchInputEvents(input);
        syncToAngular(input, DUMMY_DOB);
      }
    });
    queryAll('button, [role="button"]').forEach((btn) => {
      const text = norm(btn.textContent || btn.value || '');
      if (text.includes('send otp') || text.includes('request otp')) {
        btn.disabled = false;
        btn.removeAttribute('disabled');
        btn.classList.remove('mat-button-disabled', 'mat-mdc-button-disabled', 'disabled');
      }
    });
  }

  function logFormState(label) {
    const fields = getInputs().map((i) => ({
      fc: i.getAttribute('formcontrolname') || '',
      val: (i.value || '').slice(0, 16),
      dob: isDobField(i),
    }));
    log('info', label, { fields, ngInv: document.querySelectorAll('.ng-invalid').length });
  }

  function applyAstikMode(force) {
    if (!enabledState && !force) return Promise.resolve({ ok: false });
    if (!formReady()) {
      log('warn', 'Form loading...');
      return Promise.resolve({ ready: false });
    }
    if (modeApplied && !force && modeOk()) return Promise.resolve({ ok: true });

    log('info', 'Applying v2.4', { dob: dobVisible(), email: emailVisible() });

    if (dobVisible()) clickOrEmailToggle();

    return new Promise((resolve) => {
      setTimeout(() => {
        const toggled = modeOk();
        if (!toggled) applyDobBypass();
        else {
          log('info', 'Mode switched — no DOB needed');
          sessionStorage.setItem(SWITCHED_KEY, '1');
        }
        modeApplied = true;
        log('info', 'Ready', { toggled, dob: dobVisible(), email: emailVisible() });
        resolve({ ok: true, toggled });
      }, 900);
    });
  }

  function installNetworkLog() {
    if (networkHooksInstalled) return;
    networkHooksInstalled = true;
    const origFetch = window.fetch;
    if (origFetch) {
      window.fetch = function (...args) {
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
        if (enabledState && url && /otp|uidai|aadhaar|retrieve|send|verify|auth|genric/i.test(url)) {
          networkCount += 1;
          log('req', 'fetch', url.slice(0, 100));
        }
        return origFetch.apply(this, args);
      };
    }
    const XHR = XMLHttpRequest.prototype;
    const origOpen = XHR.open;
    const origSend = XHR.send;
    XHR.open = function (_m, url) {
      this._rebelUrl = url;
      return origOpen.apply(this, arguments);
    };
    XHR.send = function () {
      const url = this._rebelUrl || '';
      if (enabledState && url && /otp|uidai|aadhaar|retrieve|send|verify|auth|genric/i.test(url)) {
        networkCount += 1;
        log('req', 'xhr', url.slice(0, 100));
      }
      return origSend.apply(this, arguments);
    };
  }

  function isOtpButton(el) {
    const btn = el?.closest?.('button, input[type="submit"], [role="button"], a');
    if (!btn) return null;
    const text = norm(btn.textContent || btn.value || '');
    if (text.includes('send otp') || text.includes('request otp')) return btn;
    return null;
  }

  function installOtpPrep() {
    if (otpPrepInstalled) return;
    otpPrepInstalled = true;
    document.addEventListener(
      'click',
      (e) => {
        if (!enabledState) return;
        const btn = isOtpButton(e.target);
        if (!btn) return;
        lastOtpClickNet = networkCount;
        prepareFormForSubmit();
        logFormState('Send OTP prep');
        const emptyDob = getDobInputs().filter((i) => !(i.value || '').trim()).length;
        if (emptyDob) log('error', 'DOB still empty — Angular will block');
      },
      true
    );
  }

  function waitAndApply() {
    let n = 0;
    const timer = setInterval(() => {
      n += 1;
      if (!enabledState || n > 8 || modeApplied) return clearInterval(timer);
      if (!formReady()) return;
      applyAstikMode(false).then((r) => {
        if (r.ok) clearInterval(timer);
      });
    }, 1500);
  }

  function applyMode(enabled) {
    enabledState = Boolean(enabled);
    ensureLogPanel();
    installNetworkLog();
    installOtpPrep();

    if (enabledState) {
      document.documentElement.classList.add(ACTIVE_CLASS);
      sessionStorage.removeItem(SWITCHED_KEY);
      modeApplied = false;
      log('info', 'v2.4 ON');
      applyAstikMode(true);
      waitAndApply();
    } else {
      document.documentElement.classList.remove(ACTIVE_CLASS);
      modeApplied = false;
      sessionStorage.removeItem(SWITCHED_KEY);
      log('info', 'OFF — reload page');
    }

    return { enabled: enabledState, dobVisible: dobVisible(), emailVisible: emailVisible() };
  }

  return {
    ACTIVE_CLASS,
    FAB_ID,
    LOG_PANEL_ID,
    applyMode,
    applyAstikMode,
    isDobStillVisible: dobVisible,
    isEmailVisible: emailVisible,
    formReady,
    prepareFormForSubmit,
    log,
  };
});
