/**
 * Rebel Adhar v2.3 — dummy DOB sync + expanded toggle search + OTP prep
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

  const MODE_PATTERNS = [
    /or\s*enter\s*e-?mail/i,
    /or\s*enter\s*email\s*id/i,
    /or\s*e-?mail/i,
    /or\s*enter\s*mobile/i,
    /enter\s*e-?mail/i,
    /verify\s*(with|using)\s*(e-?mail|mobile)/i,
    /mobile\s*\/\s*e-?mail/i,
    /ई-?मेल/i,
    /मोबाइल/i,
  ];

  const DOB_PATTERNS = ['date of birth', 'dob', 'birth date', 'जन्म'];

  const logs = [];
  let enabledState = false;
  let networkHooksInstalled = false;
  let otpPrepInstalled = false;
  let networkCount = 0;
  let lastOtpClickNet = 0;

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

  function allRoots() {
    const roots = [document];
    collectRoots(document.documentElement, roots);
    return roots;
  }

  function queryAll(selector) {
    const out = [];
    allRoots().forEach((root) => {
      root.querySelectorAll?.(selector).forEach((el) => out.push(el));
    });
    return out;
  }

  function getInputs() {
    return queryAll('input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]), textarea');
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
    const blob = norm([labelOf(el), el.placeholder, el.getAttribute('formcontrolname'), el.name, el.id].join(' '));
    return DOB_PATTERNS.some((p) => blob.includes(p)) || el.type === 'date' || /dob|birth|dateofbirth/i.test(el.getAttribute('formcontrolname') || '');
  }

  function isEmailField(el) {
    const blob = norm([labelOf(el), el.placeholder, el.getAttribute('formcontrolname')].join(' '));
    return blob.includes('email') || /email|mail/i.test(el.getAttribute('formcontrolname') || '');
  }

  function isMobileField(el) {
    const blob = norm([labelOf(el), el.placeholder, el.getAttribute('formcontrolname')].join(' '));
    return (blob.includes('mobile') || /mobile|phone|mob/i.test(el.getAttribute('formcontrolname') || '')) && !blob.includes('email');
  }

  function dobVisible() {
    return getInputs().some((i) => isDobField(i) && isVisible(i));
  }

  function emailVisible() {
    return getInputs().some((i) => isEmailField(i) && isVisible(i));
  }

  function formReady() {
    return getInputs().length >= 2;
  }

  function dispatchInputEvents(input) {
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
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
      if (typeof el.click === 'function') el.click();
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

  function matchesModeText(text) {
    if (!text || text.length > 80) return false;
    if (/enter email address|email address/i.test(text) && !/or\s/i.test(text)) return false;
    return MODE_PATTERNS.some((p) => p.test(text));
  }

  function scanPageLinks() {
    const seen = new Set();
    const items = [];
    queryAll('a, button, span, label, p, div, mat-radio-button, mat-slide-toggle, [role="button"], [style*="cursor: pointer"]').forEach((el) => {
      if (!isVisible(el)) return;
      const text = (directText(el) || norm(el.textContent || '')).slice(0, 60);
      if (!text || text.length < 2 || seen.has(text)) return;
      seen.add(text);
      if (/or|email|mobile|mail|verify|enter/i.test(text)) items.push(text);
    });
    log('info', 'Page links scan', items.slice(0, 25));
    return items;
  }

  function findModeSwitchCandidates() {
    const found = [];
    queryAll('a, button, span, label, p, div[role="button"], mat-radio-button, mat-slide-toggle, [class*="link"], [class*="toggle"]').forEach((el) => {
      if (!isVisible(el)) return;
      const own = directText(el);
      const full = norm(el.textContent || '');
      const text = own.length >= 2 ? own : full;
      if (!matchesModeText(text)) return;
      found.push({ el, text, score: text.length });
    });
    found.sort((a, b) => a.score - b.score);
    return found;
  }

  function findToggleNearField(matcher) {
    const field = getInputs().find(matcher);
    if (!field) return null;
    let node = field.closest('mat-form-field,.mat-mdc-form-field,.form-group,div');
    for (let depth = 0; depth < 10 && node; depth++) {
      for (const el of node.querySelectorAll('a, span, button, label, p, div, mat-radio-button')) {
        if (!isVisible(el)) continue;
        const text = directText(el) || norm(el.textContent || '');
        if (matchesModeText(text)) return el;
      }
      node = node.parentElement;
    }
    return null;
  }

  function clickModeSwitch() {
    const nearMobile = findToggleNearField(isMobileField);
    if (nearMobile) {
      log('info', 'Click near mobile', directText(nearMobile) || nearMobile.textContent?.trim());
      simulateClick(nearMobile);
      return true;
    }

    const nearDob = findToggleNearField(isDobField);
    if (nearDob) {
      log('info', 'Click near DOB', directText(nearDob) || nearDob.textContent?.trim());
      simulateClick(nearDob);
      return true;
    }

    const candidates = findModeSwitchCandidates();
    if (candidates.length) {
      log('info', 'Click mode switch', candidates[0].text);
      simulateClick(candidates[0].el);
      return true;
    }

    scanPageLinks();
    return false;
  }

  function walkNgContext(el, visitor) {
    const ctx = el?.__ngContext__;
    if (!Array.isArray(ctx)) return;
    ctx.forEach((item) => visitor(item, el));
  }

  function patchAngularForms(aggressive) {
    let patched = 0;
    queryAll('input, textarea, select, form, mat-form-field, .mat-mdc-form-field, button').forEach((el) => {
      walkNgContext(el, (item) => {
        const ctrl = item?.control;
        if (ctrl && typeof ctrl.setErrors === 'function' && /FormControl/i.test(ctrl.constructor?.name || '')) {
          const host =
            item.valueAccessor?._elementRef?.nativeElement ||
            item.valueAccessor?.element?.nativeElement ||
            (el.matches?.('input, textarea, select') ? el : null);
          const kind = host ? (isDobField(host) ? 'dob' : '') : '';
          if (aggressive || kind === 'dob') {
            ctrl.clearValidators?.();
            ctrl.setErrors(null);
            ctrl.updateValueAndValidity?.({ emitEvent: true });
            patched += 1;
          }
        }
        const form = item?.form;
        if (form?.controls) {
          Object.keys(form.controls).forEach((key) => {
            if (!aggressive && !/dob|birth|date/i.test(key)) return;
            const c = form.controls[key];
            c.clearValidators?.();
            c.setErrors?.(null);
            c.updateValueAndValidity?.({ emitEvent: true });
            patched += 1;
          });
          form.setErrors?.(null);
          form.updateValueAndValidity?.({ emitEvent: true });
        }
      });
    });
    return patched;
  }

  function setDobValue(value) {
    let set = 0;
    getInputs()
      .filter(isDobField)
      .forEach((input) => {
        input.disabled = false;
        input.removeAttribute('readonly');
        input.removeAttribute('required');
        input.setCustomValidity('');
        input.value = value;
        dispatchInputEvents(input);

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
            set += 1;
          }
        });
        set += 1;
      });
    return set;
  }

  function hideDobVisual() {
    getInputs()
      .filter(isDobField)
      .forEach((input) => {
        const box = input.closest('mat-form-field,.mat-mdc-form-field,.form-group,div') || input;
        box.classList.add(HIDDEN_CLASS);
        box.style.setProperty('display', 'none', 'important');
        box.style.setProperty('visibility', 'hidden', 'important');
        box.style.setProperty('height', '0', 'important');
        box.style.setProperty('overflow', 'hidden', 'important');
        input.style.setProperty('position', 'absolute', 'important');
        input.style.setProperty('left', '-9999px', 'important');
        input.disabled = false;
      });
  }

  function applyDobBypass() {
    const formats = [DUMMY_DOB, '01-01-1990', '1990-01-01'];
    let n = 0;
    formats.forEach((f) => {
      n += setDobValue(f);
    });
    hideDobVisual();
    const patched = patchAngularForms(true);
    log('info', 'DOB bypass', { dobSet: n, patched, dobValue: formats[0] });
  }

  function modeSwitchSucceeded() {
    return !dobVisible() || emailVisible();
  }

  function syncAllInputs() {
    getInputs().forEach((input) => {
      input.disabled = false;
      input.setCustomValidity('');
      dispatchInputEvents(input);
    });
  }

  function enableOtpButtons() {
    queryAll('button, input[type="submit"], [role="button"], a.mat-mdc-button, a.mat-button').forEach((btn) => {
      const text = norm(btn.textContent || btn.value || '');
      if (!text.includes('send otp') && !text.includes('request otp')) return;
      btn.disabled = false;
      btn.removeAttribute('disabled');
      btn.classList.remove('mat-button-disabled', 'mat-mdc-button-disabled', 'disabled');
      btn.style.pointerEvents = 'auto';
      btn.style.opacity = '1';
    });
  }

  function prepareFormForSubmit() {
    if (!enabledState) return;
    const dobInputs = getInputs().filter(isDobField);
    const emptyDob = dobInputs.some((i) => !(i.value || '').trim());
    if (emptyDob || dobInputs.length) applyDobBypass();
    syncAllInputs();
    patchAngularForms(true);
    enableOtpButtons();
  }

  function logFormState(label) {
    const fields = getInputs().map((i) => ({
      lbl: labelOf(i).slice(0, 22),
      fc: i.getAttribute('formcontrolname') || '',
      val: (i.value || '').slice(0, 16),
      dis: i.disabled,
    }));
    log('info', label, { fields, ngInv: document.querySelectorAll('.ng-invalid').length });
  }

  function applyFallbackIfNeeded() {
    if (modeSwitchSucceeded()) return false;
    log('warn', 'Toggle not found — DOB bypass mode');
    applyDobBypass();
    return true;
  }

  function applyAstikMode(force) {
    if (!enabledState && !force) return Promise.resolve({ dobVisible: dobVisible(), emailVisible: emailVisible() });

    if (!formReady()) {
      log('warn', 'Form not loaded yet');
      return Promise.resolve({ dobVisible: dobVisible(), ready: false });
    }

    if (!force && sessionStorage.getItem(SWITCHED_KEY) === '1') {
      applyDobBypass();
      return Promise.resolve({ dobVisible: dobVisible(), emailVisible: emailVisible(), ok: true });
    }

    log('info', 'Applying mode...', { dob: dobVisible(), email: emailVisible() });

    if (dobVisible()) clickModeSwitch();

    return new Promise((resolve) => {
      setTimeout(() => {
        const toggled = modeSwitchSucceeded();
        if (!toggled) applyFallbackIfNeeded();
        else sessionStorage.setItem(SWITCHED_KEY, '1');
        applyDobBypass();
        log('info', 'Ready', { toggled, dob: dobVisible(), email: emailVisible() });
        resolve({ ok: true, toggled, dobVisible: dobVisible(), emailVisible: emailVisible() });
      }, 800);
    });
  }

  function installNetworkLog() {
    if (networkHooksInstalled) return;
    networkHooksInstalled = true;

    const origFetch = window.fetch;
    if (origFetch) {
      window.fetch = function (...args) {
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
        if (enabledState && url && !/google|gstatic|analytics/i.test(url)) {
          networkCount += 1;
          if (/otp|uidai|aadhaar|retrieve|genric|eid|send|verify|auth/i.test(url)) {
            log('req', 'fetch', url.slice(0, 100));
          }
        }
        return origFetch.apply(this, args);
      };
    }

    const XHR = XMLHttpRequest.prototype;
    const origOpen = XHR.open;
    const origSend = XHR.send;
    XHR.open = function (_method, url) {
      this._rebelUrl = url;
      return origOpen.apply(this, arguments);
    };
    XHR.send = function () {
      const url = this._rebelUrl || '';
      if (enabledState && url && !/google|gstatic|analytics/i.test(url)) {
        networkCount += 1;
        if (/otp|uidai|aadhaar|retrieve|genric|eid|send|verify|auth/i.test(url)) {
          log('req', 'xhr', url.slice(0, 100));
        }
      }
      return origSend.apply(this, arguments);
    };

    if (navigator.sendBeacon) {
      const origBeacon = navigator.sendBeacon.bind(navigator);
      navigator.sendBeacon = function (url, data) {
        if (enabledState && url) {
          networkCount += 1;
          log('req', 'beacon', String(url).slice(0, 100));
        }
        return origBeacon(url, data);
      };
    }
  }

  function isOtpButton(el) {
    if (!el) return null;
    const btn = el.closest?.('button, input[type="submit"], [role="button"], a');
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

        setTimeout(() => {
          if (networkCount <= lastOtpClickNet) {
            log('error', 'NO API CALL — extension ne DOB bypass try kiya. Page reload + asli naam + registered mobile.');
            logFormState('After fail');
          }
        }, 3000);
      },
      true
    );
  }

  function waitAndApply(retries) {
    let n = 0;
    const max = retries || 15;
    const timer = setInterval(() => {
      n += 1;
      if (!enabledState || n > max) return clearInterval(timer);
      if (!formReady()) return;
      applyAstikMode(true).then(() => {
        if (n > 3) clearInterval(timer);
      });
    }, 1200);
  }

  function applyMode(enabled) {
    enabledState = Boolean(enabled);
    ensureLogPanel();
    installNetworkLog();
    installOtpPrep();

    if (enabledState) {
      document.documentElement.classList.add(ACTIVE_CLASS);
      sessionStorage.removeItem(SWITCHED_KEY);
      log('info', 'v2.3 ON — DOB bypass + toggle search');
      applyAstikMode(true);
      waitAndApply(15);
    } else {
      document.documentElement.classList.remove(ACTIVE_CLASS);
      sessionStorage.removeItem(SWITCHED_KEY);
      document.querySelectorAll('.' + HIDDEN_CLASS).forEach((el) => {
        el.classList.remove(HIDDEN_CLASS);
        ['display', 'visibility', 'height', 'overflow', 'position', 'left'].forEach((p) => el.style.removeProperty(p));
      });
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
    clickModeSwitch,
    prepareFormForSubmit,
    log,
  };
});
