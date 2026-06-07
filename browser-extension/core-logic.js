/**
 * Rebel Adhar v2.2 — Astik-style UIDAI form mode switch + safe fallback
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

  const MODE_PATTERNS = [
    /or\s*enter\s*e-?mail/i,
    /or\s*enter\s*email\s*id/i,
    /or\s*e-?mail/i,
    /verify\s*(with|using)\s*e-?mail/i,
  ];

  const DOB_PATTERNS = ['date of birth', 'dob', 'birth date', 'जन्म'];

  const logs = [];
  let enabledState = false;
  let networkHooksInstalled = false;
  let otpWatcherInstalled = false;
  let networkCount = 0;

  function norm(s) {
    return (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function log(level, msg, data) {
    const line = { time: new Date().toLocaleTimeString(), level, msg, data };
    logs.push(line);
    if (logs.length > 100) logs.shift();
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
      '" style="margin:0;padding:10px;max-height:200px;overflow:auto;font:11px monospace;color:#bbf7d0;background:rgba(8,12,20,.97)"></pre>';
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

  function isVisible(el) {
    if (!el || el.closest(`#${LOG_PANEL_ID}, #${FAB_ID}`)) return false;
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

  function getInputs() {
    return Array.from(
      document.querySelectorAll('input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]), textarea')
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
    const blob = norm([labelOf(el), el.placeholder, el.getAttribute('formcontrolname'), el.name, el.id].join(' '));
    return DOB_PATTERNS.some((p) => blob.includes(p)) || el.type === 'date' || /dob|birth/i.test(el.getAttribute('formcontrolname') || '');
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
    } catch (e) {
      try {
        el.click();
        return true;
      } catch (_e) {
        return false;
      }
    }
  }

  function matchesModeText(text) {
    if (!text || text.length > 60) return false;
    if (/enter email address|email address/i.test(text) && !/or\s/i.test(text)) return false;
    return MODE_PATTERNS.some((p) => p.test(text));
  }

  function findModeSwitchCandidates() {
    const found = [];
    const selector = 'a, button, span, label, p, div[role="button"], [class*="link"], [class*="toggle"], mat-slide-toggle';

    document.querySelectorAll(selector).forEach((el) => {
      if (!isVisible(el)) return;
      const own = directText(el);
      const full = norm(el.textContent || '');
      const text = own.length >= 3 ? own : full;
      if (!matchesModeText(text)) return;
      found.push({ el, text, score: text.length });
    });

    found.sort((a, b) => a.score - b.score);
    return found;
  }

  function findToggleNearMobile() {
    const mobile = getInputs().find((i) => isMobileField(i));
    if (!mobile) return null;

    let node = mobile.closest('mat-form-field,.mat-mdc-form-field,.form-group,div');
    for (let depth = 0; depth < 8 && node; depth++) {
      const kids = node.querySelectorAll('a, span, button, label, p, div');
      for (const el of kids) {
        if (!isVisible(el)) continue;
        const text = directText(el) || norm(el.textContent || '');
        if (matchesModeText(text)) return el;
      }
      node = node.parentElement;
    }
    return null;
  }

  function clickModeSwitch() {
    const near = findToggleNearMobile();
    if (near) {
      log('info', 'Clicking toggle near mobile', directText(near) || near.textContent?.trim());
      simulateClick(near);
      return true;
    }

    const candidates = findModeSwitchCandidates();
    if (candidates.length) {
      const best = candidates[0];
      log('info', 'Clicking mode switch', best.text);
      simulateClick(best.el);
      return true;
    }

    return false;
  }

  function walkNgContext(el, visitor) {
    const ctx = el?.__ngContext__;
    if (!Array.isArray(ctx)) return;
    ctx.forEach((item) => visitor(item, el));
  }

  function patchDobValidatorsOnly() {
    let patched = 0;
    getInputs()
      .filter(isDobField)
      .forEach((input) => {
        input.removeAttribute('required');
        input.setAttribute('aria-required', 'false');
        input.setCustomValidity('');
        input.disabled = false;

        walkNgContext(input, (item) => {
          const ctrl = item?.control;
          if (ctrl && typeof ctrl.clearValidators === 'function') {
            ctrl.clearValidators();
            ctrl.setErrors(null);
            ctrl.updateValueAndValidity({ emitEvent: true });
            patched += 1;
          }
          const form = item?.form;
          if (form?.controls) {
            Object.keys(form.controls).forEach((key) => {
              if (!/dob|birth|date/i.test(key)) return;
              const c = form.controls[key];
              c.clearValidators?.();
              c.setErrors?.(null);
              c.updateValueAndValidity?.({ emitEvent: true });
              patched += 1;
            });
            form.updateValueAndValidity?.({ emitEvent: true });
          }
        });
      });
    log('info', 'DOB validator patch', { patched });
    return patched;
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
        input.removeAttribute('required');
        input.setCustomValidity('');
      });
    log('info', 'DOB hidden (CSS fallback)');
  }

  function modeSwitchSucceeded() {
    return !dobVisible() || emailVisible();
  }

  function applyFallbackIfNeeded() {
    if (modeSwitchSucceeded()) return false;
    log('warn', 'Mode switch incomplete — applying safe fallback');
    hideDobVisual();
    patchDobValidatorsOnly();
    return true;
  }

  function applyAstikMode(force) {
    if (!enabledState && !force) return { dobVisible: dobVisible(), emailVisible: emailVisible() };

    if (!formReady()) {
      log('warn', 'Form not loaded yet');
      return { dobVisible: dobVisible(), emailVisible: emailVisible(), ready: false };
    }

    if (!force && sessionStorage.getItem(SWITCHED_KEY) === '1' && modeSwitchSucceeded()) {
      log('info', 'Already in Mobile/Email mode');
      return { dobVisible: dobVisible(), emailVisible: emailVisible() };
    }

    log('info', 'Switching UIDAI form mode...', { dobVisible: dobVisible(), emailVisible: emailVisible() });

    if (dobVisible() || !emailVisible()) {
      const clicked = clickModeSwitch();
      if (!clicked) {
        log('warn', 'OR Enter Email link not found');
        applyFallbackIfNeeded();
        return { dobVisible: dobVisible(), emailVisible: emailVisible() };
      }
    }

    return new Promise((resolve) => {
      setTimeout(() => {
        const ok = modeSwitchSucceeded();
        log('info', 'After mode switch', { ok, dobVisible: dobVisible(), emailVisible: emailVisible() });
        if (!ok) applyFallbackIfNeeded();
        else sessionStorage.setItem(SWITCHED_KEY, '1');
        resolve({ dobVisible: dobVisible(), emailVisible: emailVisible(), ok });
      }, 700);
    });
  }

  function applyAstikModeSync(force) {
    if (!enabledState && !force) return { dobVisible: dobVisible() };

    if (!formReady()) {
      log('warn', 'Form not loaded yet');
      return { dobVisible: dobVisible(), ready: false };
    }

    if (!force && sessionStorage.getItem(SWITCHED_KEY) === '1' && modeSwitchSucceeded()) {
      return { dobVisible: dobVisible(), emailVisible: emailVisible() };
    }

    if (dobVisible() || !emailVisible()) clickModeSwitch();
    return { dobVisible: dobVisible(), emailVisible: emailVisible() };
  }

  function installPassiveNetworkLog() {
    if (networkHooksInstalled) return;
    networkHooksInstalled = true;

    const origFetch = window.fetch;
    if (origFetch) {
      window.fetch = function (...args) {
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
        if (enabledState && /otp|uidai|aadhaar|retrieve|genric/i.test(url)) {
          networkCount += 1;
          log('req', 'fetch', url.slice(0, 120));
        }
        return origFetch.apply(this, args);
      };
    }

    const XHR = XMLHttpRequest.prototype;
    const origOpen = XHR.open;
    const origSend = XHR.send;
    XHR.open = function (method, url) {
      this._rebelUrl = url;
      return origOpen.apply(this, arguments);
    };
    XHR.send = function () {
      if (enabledState && /otp|uidai|aadhaar|retrieve|genric/i.test(this._rebelUrl || '')) {
        networkCount += 1;
        log('req', 'xhr', (this._rebelUrl || '').slice(0, 120));
      }
      return origSend.apply(this, arguments);
    };
  }

  function installOtpWatcher() {
    if (otpWatcherInstalled) return;
    otpWatcherInstalled = true;

    document.addEventListener(
      'click',
      (e) => {
        if (!enabledState) return;
        const t = norm(e.target?.textContent || e.target?.value || '');
        if (!t.includes('send otp') && !t.includes('request otp')) return;

        const snapshot = getInputs().map((i) => ({
          lbl: labelOf(i).slice(0, 25),
          val: (i.value || '').slice(0, 20),
          dis: i.disabled,
          dob: isDobField(i),
        }));

        log('info', 'Send OTP clicked', {
          dobVisible: dobVisible(),
          emailVisible: emailVisible(),
          ngInvalid: document.querySelectorAll('.ng-invalid').length,
          fields: snapshot,
        });

        setTimeout(() => {
          if (networkCount === 0) {
            log('error', 'NO API CALL — tap Switch Mode, reload page, use asli naam + registered mobile');
          }
        }, 2500);
      },
      false
    );
  }

  function waitAndApply(retries) {
    let n = 0;
    const max = retries || 12;
    const timer = setInterval(() => {
      n += 1;
      if (!enabledState || n > max) return clearInterval(timer);
      if (!formReady()) return;
      applyAstikMode(true).then((r) => {
        if (r.ok || !dobVisible()) clearInterval(timer);
      });
    }, 1200);
  }

  function applyMode(enabled) {
    enabledState = Boolean(enabled);
    ensureLogPanel();
    installPassiveNetworkLog();
    installOtpWatcher();

    if (enabledState) {
      document.documentElement.classList.add(ACTIVE_CLASS);
      sessionStorage.removeItem(SWITCHED_KEY);
      log('info', 'v2.2 ON — Astik mode switch');
      applyAstikMode(true);
      waitAndApply(12);
    } else {
      document.documentElement.classList.remove(ACTIVE_CLASS);
      sessionStorage.removeItem(SWITCHED_KEY);
      document.querySelectorAll('.' + HIDDEN_CLASS).forEach((el) => {
        el.classList.remove(HIDDEN_CLASS);
        el.style.removeProperty('display');
        el.style.removeProperty('visibility');
        el.style.removeProperty('height');
        el.style.removeProperty('overflow');
      });
      log('info', 'OFF — reload page for normal form');
    }

    return { enabled: enabledState, dobVisible: dobVisible(), emailVisible: emailVisible() };
  }

  return {
    ACTIVE_CLASS,
    FAB_ID,
    LOG_PANEL_ID,
    applyMode,
    applyAstikMode,
    applyAstikModeSync,
    isDobStillVisible: dobVisible,
    isEmailVisible: emailVisible,
    formReady,
    clickModeSwitch,
    log,
  };
});
