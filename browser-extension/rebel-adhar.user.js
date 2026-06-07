// ==UserScript==
// @name         Rebel Adhar
// @namespace    https://github.com/ujjwalrebel53-wq/SpinPlay99
// @version      1.3.0
// @description  DOB hide + Name optional + live logs + OTP fix
// @match        https://myaadhaar.uidai.gov.in/*
// @match        https://*.uidai.gov.in/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  const STORAGE_KEY = 'astikHelperEnabled';
  const NAME_OPTIONAL_KEY = 'astikHelperNameOptional';
  const FALLBACK_NAME_KEY = 'astikHelperFallbackName';
  const FAB_ID = 'astik-helper-fab';
  const LOG_PANEL_ID = 'rebel-adhar-log-panel';
  const LOG_BODY_ID = 'rebel-adhar-log-body';

  const DOB_PATTERNS = ['date of birth', 'enter date of birth', 'dateofbirth', 'dob', 'birth date', 'जन्म तिथि'];
  const NAME_PATTERNS = ['name as per aadhaar', 'enter name as per', 'enter name', 'full name', 'aadhaar name'];
  const DOB_API_KEYS = ['dob', 'dateOfBirth', 'date_of_birth', 'birthDate', 'birthDt', 'dobStr', 'userDob'];

  let enabled = localStorage.getItem(STORAGE_KEY) === '1';
  let nameOptional = localStorage.getItem(NAME_OPTIONAL_KEY) !== '0';
  let fallbackName = (localStorage.getItem(FALLBACK_NAME_KEY) || 'Mr').trim() || 'Mr';
  const logLines = [];
  let hooksInstalled = false;

  function normalize(text) {
    return (text || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function textMatches(text, patterns) {
    const value = normalize(text);
    return patterns.some((p) => value.includes(p));
  }

  function isUi(el) {
    return !!el?.closest(`#${FAB_ID}, #${LOG_PANEL_ID}, #astik-helper-name-btn, #astik-helper-logs-btn`);
  }

  function log(level, message, data) {
    const time = new Date().toLocaleTimeString();
    let extra = '';
    if (data !== undefined) {
      try {
        extra = typeof data === 'string' ? data : JSON.stringify(data);
      } catch (_e) {
        extra = String(data);
      }
    }
    logLines.push({ time, level, message, extra });
    if (logLines.length > 120) logLines.shift();
    updateLogPanel();
    console.log('[Rebel Adhar]', level, message, data);
  }

  function ensureLogPanel() {
    if (document.getElementById(LOG_PANEL_ID)) return;
    const panel = document.createElement('div');
    panel.id = LOG_PANEL_ID;
    panel.innerHTML =
      '<div id="rebel-adhar-log-header"><strong>Rebel Adhar Logs</strong><span><button type="button" id="rebel-adhar-log-clear">Clear</button><button type="button" id="rebel-adhar-log-min">Hide</button></span></div><pre id="' +
      LOG_BODY_ID +
      '"></pre>';
    document.documentElement.appendChild(panel);
    document.getElementById('rebel-adhar-log-clear').onclick = () => {
      logLines.length = 0;
      updateLogPanel();
    };
    document.getElementById('rebel-adhar-log-min').onclick = () => {
      const body = document.getElementById(LOG_BODY_ID);
      const hidden = body.style.display === 'none';
      body.style.display = hidden ? 'block' : 'none';
    };

    const style = document.createElement('style');
    style.textContent =
      '#rebel-adhar-log-panel{position:fixed;left:8px;right:8px;bottom:8px;max-height:42vh;z-index:2147483646;background:rgba(10,15,25,.96);color:#d1fae5;border:1px solid #334155;border-radius:12px;font:11px/1.45 monospace;overflow:hidden}' +
      '#rebel-adhar-log-header{display:flex;justify-content:space-between;padding:8px 10px;background:#111827;color:#fff;font:700 12px system-ui}' +
      '#rebel-adhar-log-header button{border:none;border-radius:6px;padding:4px 8px;margin-left:6px;background:#374151;color:#fff}' +
      '#rebel-adhar-log-body{margin:0;padding:10px;max-height:calc(42vh - 42px);overflow:auto;white-space:pre-wrap;word-break:break-word}' +
      '#astik-helper-fab{position:fixed;right:12px;bottom:88px;z-index:2147483647;border:none;border-radius:999px;padding:12px 16px;background:#b42318;color:#fff;font:700 13px system-ui}' +
      '#astik-helper-name-btn{position:fixed;right:12px;bottom:150px;z-index:2147483647;border:none;border-radius:999px;padding:12px 14px;background:#0052a5;color:#fff;font:700 12px system-ui}' +
      '#astik-helper-logs-btn{position:fixed;right:12px;bottom:212px;z-index:2147483647;border:none;border-radius:999px;padding:12px 14px;background:#4b5563;color:#fff;font:700 12px system-ui}';
    document.documentElement.appendChild(style);
  }

  function updateLogPanel() {
    ensureLogPanel();
    const body = document.getElementById(LOG_BODY_ID);
    if (!body) return;
    body.textContent = logLines.map((l) => `[${l.time}] ${l.level.toUpperCase()} ${l.message}${l.extra ? ' | ' + l.extra : ''}`).join('\n');
    body.scrollTop = body.scrollHeight;
  }

  function getAllInputs() {
    return Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]), textarea, select'));
  }

  function getLabelText(el) {
    const matLabel = el.closest('mat-form-field, .mat-mdc-form-field')?.querySelector('mat-label, label');
    return matLabel?.textContent || el.getAttribute('placeholder') || el.getAttribute('aria-label') || '';
  }

  function findContainer(el) {
    return el.closest('mat-form-field, .mat-mdc-form-field, .form-group, div') || el.parentElement;
  }

  function classify(input) {
    const info = normalize([input.name, input.id, input.placeholder, input.getAttribute('formcontrolname'), getLabelText(input)].join(' '));
    if (textMatches(info, DOB_PATTERNS) || input.type === 'date' || /dob|birth/i.test(input.getAttribute('formcontrolname') || '')) return 'dob';
    if (textMatches(info, NAME_PATTERNS) || /fullname|residentname/i.test(input.getAttribute('formcontrolname') || '')) return 'name';
    return 'other';
  }

  function hardHide(el) {
    if (!el || isUi(el)) return;
    el.setAttribute('data-astik-hidden', '1');
    el.style.cssText = 'display:none!important;visibility:hidden!important;height:0!important;margin:0!important;padding:0!important;overflow:hidden!important;pointer-events:none!important;opacity:0!important;';
  }

  function showElement(el) {
    if (!el) return;
    el.removeAttribute('data-astik-hidden');
    el.style.cssText = '';
  }

  function stripDobFromObject(obj) {
    const removed = [];
    if (!obj || typeof obj !== 'object') return removed;
    Object.keys(obj).forEach((key) => {
      if ((DOB_API_KEYS.includes(key) || /dob|birth/i.test(key)) && obj[key] != null && obj[key] !== '') {
        removed.push(key);
        delete obj[key];
      }
    });
    return removed;
  }

  function patchBody(body) {
    if (!enabled || body == null) return { body, changed: false, removed: [] };
    if (typeof body === 'string') {
      const trimmed = body.trim();
      if (trimmed.startsWith('{')) {
        try {
          const json = JSON.parse(trimmed);
          const removed = stripDobFromObject(json);
          if (!removed.length) return { body, changed: false, removed: [] };
          return { body: JSON.stringify(json), changed: true, removed };
        } catch (_e) {
          return { body, changed: false, removed: [] };
        }
      }
      if (trimmed.includes('=')) {
        const params = new URLSearchParams(trimmed);
        const removed = [];
        [...params.keys()].forEach((key) => {
          if (/dob|birth/i.test(key)) {
            removed.push(key);
            params.delete(key);
          }
        });
        if (!removed.length) return { body, changed: false, removed: [] };
        return { body: params.toString(), changed: true, removed };
      }
    }
    return { body, changed: false, removed: [] };
  }

  function installHooks() {
    if (hooksInstalled) return;
    hooksInstalled = true;

    const origFetch = window.fetch.bind(window);
    window.fetch = async function (input, init) {
      const url = String(typeof input === 'string' ? input : input?.url || '');
      let requestInit = init ? { ...init } : {};
      if (enabled && requestInit.body) {
        const patched = patchBody(requestInit.body);
        if (patched.changed) {
          requestInit.body = patched.body;
          log('patch', 'DOB removed from fetch', patched.removed);
        }
        log('req', url, String(requestInit.body).slice(0, 500));
      }
      try {
        const res = await origFetch(input, requestInit);
        if (/uidai|otp|retrieve|aadhaar/i.test(url)) {
          const text = await res.clone().text().catch(() => '');
          log(res.ok ? 'ok' : 'error', `Response ${res.status}`, text.slice(0, 400));
        }
        return res;
      } catch (e) {
        log('error', 'Fetch failed', e.message || String(e));
        throw e;
      }
    };

    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this.__rebelUrl = String(url || '');
      this.__rebelMethod = method;
      return origOpen.call(this, method, url, ...rest);
    };
    XMLHttpRequest.prototype.send = function (body) {
      let finalBody = body;
      if (enabled && body != null) {
        const patched = patchBody(body);
        if (patched.changed) {
          finalBody = patched.body;
          log('patch', 'DOB removed from XHR', patched.removed);
        }
        log('req', this.__rebelUrl, String(finalBody).slice(0, 500));
      }
      this.addEventListener('load', () => {
        if (/uidai|otp|retrieve|aadhaar/i.test(this.__rebelUrl || '')) {
          log(this.status >= 200 && this.status < 300 ? 'ok' : 'error', `XHR ${this.status}`, (this.responseText || '').slice(0, 400));
        }
      });
      return origSend.call(this, finalBody);
    };

    log('info', 'Network hooks ready');
  }

  function logFormSnapshot(label) {
    log(
      'info',
      label,
      getAllInputs().map((input) => ({
        type: classify(input),
        value: (input.value || '').slice(0, 80),
        required: input.required,
        disabled: input.disabled,
      }))
    );
  }

  function hideDobOnly() {
    getAllInputs().forEach((input) => {
      if (classify(input) !== 'dob') return;
      hardHide(findContainer(input));
      input.removeAttribute('required');
      input.setAttribute('aria-required', 'false');
      input.setCustomValidity('');
      input.disabled = false;
    });
    document.querySelectorAll('mat-form-field, .mat-mdc-form-field, label, mat-label').forEach((node) => {
      const text = normalize(node.textContent || '');
      if (textMatches(text, DOB_PATTERNS) && text.length < 100 && !text.includes('mobile')) hardHide(findContainer(node) || node);
    });
  }

  function setupNameOptional() {
    getAllInputs()
      .filter((input) => classify(input) === 'name')
      .forEach((input) => {
        if (!nameOptional) return;
        input.removeAttribute('required');
        input.setCustomValidity('');
        input.setAttribute('placeholder', 'Mr ya apna naam likho');
      });

    document.querySelectorAll('button, input[type="submit"], [role="button"]').forEach((btn) => {
      if (btn.dataset.rebelHooked) return;
      const text = normalize(btn.textContent || btn.value || '');
      if (!text.includes('send otp') && !text.includes('request otp')) return;
      btn.dataset.rebelHooked = '1';
      btn.addEventListener(
        'click',
        () => {
          log('info', 'Send OTP clicked');
          if (nameOptional) {
            getAllInputs()
              .filter((input) => classify(input) === 'name')
              .forEach((input) => {
                if (!(input.value || '').trim()) {
                  input.value = fallbackName;
                  input.dispatchEvent(new Event('input', { bubbles: true }));
                  input.dispatchEvent(new Event('change', { bubbles: true }));
                  log('warn', 'Name auto-filled', fallbackName);
                }
              });
          }
          logFormSnapshot('Before OTP request');
        },
        true
      );
    });
  }

  function restore() {
    document.querySelectorAll('[data-astik-hidden]').forEach(showElement);
    log('info', 'Extension OFF');
  }

  function ensureButtons() {
    if (!document.getElementById(FAB_ID)) {
      const fab = document.createElement('button');
      fab.id = FAB_ID;
      fab.textContent = 'Rebel Adhar: OFF';
      fab.onclick = () => {
        enabled = !enabled;
        localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
        apply();
      };
      document.documentElement.appendChild(fab);
    }
    if (!document.getElementById('astik-helper-name-btn')) {
      const btn = document.createElement('button');
      btn.id = 'astik-helper-name-btn';
      btn.textContent = 'Name: Optional';
      btn.onclick = () => {
        nameOptional = !nameOptional;
        localStorage.setItem(NAME_OPTIONAL_KEY, nameOptional ? '1' : '0');
        if (enabled) apply();
        updateButtons();
      };
      document.documentElement.appendChild(btn);
    }
    if (!document.getElementById('astik-helper-logs-btn')) {
      const btn = document.createElement('button');
      btn.id = 'astik-helper-logs-btn';
      btn.textContent = 'Logs';
      btn.onclick = () => {
        const panel = document.getElementById(LOG_PANEL_ID);
        if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
      };
      document.documentElement.appendChild(btn);
    }
    updateButtons();
  }

  function updateButtons() {
    const fab = document.getElementById(FAB_ID);
    const nameBtn = document.getElementById('astik-helper-name-btn');
    if (fab) {
      fab.textContent = enabled ? 'Rebel Adhar: ON' : 'Rebel Adhar: OFF';
      fab.style.background = enabled ? '#0a7a2f' : '#b42318';
    }
    if (nameBtn) {
      nameBtn.textContent = nameOptional ? 'Name: Optional (Mr OK)' : 'Name: Required';
      nameBtn.style.background = nameOptional ? '#0052a5' : '#6b7280';
    }
  }

  function apply() {
    if (!/uidai\.gov\.in/i.test(location.href)) return;
    ensureButtons();
    ensureLogPanel();

    if (enabled) {
      installHooks();
      hideDobOnly();
      setupNameOptional();
      log('info', 'Extension ON — DOB hidden, OTP payload patch active');
      logFormSnapshot('After ON');
    } else {
      restore();
    }
    updateButtons();
  }

  apply();
  setInterval(() => {
    if (enabled) {
      hideDobOnly();
      setupNameOptional();
    }
  }, 2000);
})();
