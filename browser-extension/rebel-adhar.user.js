// ==UserScript==
// @name         Rebel Adhar
// @namespace    https://github.com/ujjwalrebel53-wq/SpinPlay99
// @version      1.4.0
// @description  Minimal DOB hide + API patch — Angular ko disturb nahi karta
// @match        https://myaadhaar.uidai.gov.in/*
// @match        https://*.uidai.gov.in/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  const STORAGE_KEY = 'rebelAdharEnabled';
  const NAME_OPTIONAL_KEY = 'rebelAdharNameOptional';
  const FALLBACK_NAME_KEY = 'rebelAdharFallbackName';
  const FAB_ID = 'rebel-adhar-fab';
  const LOG_PANEL_ID = 'rebel-adhar-log-panel';
  const LOG_BODY_ID = 'rebel-adhar-log-body';
  const STYLE_ID = 'rebel-adhar-style';

  const DOB_KEYS = ['dob', 'dateOfBirth', 'date_of_birth', 'birthDate', 'birthDt', 'dobStr', 'userDob'];
  const DOB_TEXT = ['date of birth', 'enter date of birth', 'dob', 'birth date', 'जन्म तिथि'];
  const NAME_TEXT = ['name as per aadhaar', 'enter name', 'full name', 'aadhaar name'];

  let enabled = localStorage.getItem(STORAGE_KEY) === '1';
  let nameOptional = localStorage.getItem(NAME_OPTIONAL_KEY) !== '0';
  let fallbackName = (localStorage.getItem(FALLBACK_NAME_KEY) || 'Mr').trim() || 'Mr';
  const logLines = [];
  let networkCount = 0;
  let hooksReady = false;
  let applyTimer = null;

  function log(level, msg, data) {
    const time = new Date().toLocaleTimeString();
    let extra = '';
    if (data !== undefined) {
      try {
        extra = typeof data === 'string' ? data : JSON.stringify(data);
      } catch (_e) {
        extra = String(data);
      }
    }
    logLines.push({ time, level, msg, extra });
    if (logLines.length > 100) logLines.shift();
    updateLogs();
    console.log('[Rebel Adhar]', level, msg, data ?? '');
  }

  function norm(s) {
    return (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function matchText(text, list) {
    const v = norm(text);
    return list.some((x) => v.includes(x));
  }

  function inputs() {
    return Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]), textarea'));
  }

  function labelOf(el) {
    const l = el.closest('mat-form-field, .mat-mdc-form-field')?.querySelector('mat-label, label');
    return l?.textContent || el.getAttribute('placeholder') || el.getAttribute('aria-label') || '';
  }

  function kindOf(input) {
    const blob = norm([input.id, input.name, input.placeholder, input.getAttribute('formcontrolname'), labelOf(input)].join(' '));
    if (matchText(blob, DOB_TEXT) || input.type === 'date' || /dob|birth/i.test(input.getAttribute('formcontrolname') || '')) return 'dob';
    if (matchText(blob, NAME_TEXT) || /name|full|resident/i.test(input.getAttribute('formcontrolname') || '')) return 'name';
    if (/mobile|phone|mob|contact/i.test(blob)) return 'mobile';
    if (/email|mail/i.test(blob)) return 'email';
    if (/captcha|security/i.test(blob)) return 'captcha';
    return 'other';
  }

  function containerOf(el) {
    return el.closest('mat-form-field, .mat-mdc-form-field, .form-group, div') || el.parentElement;
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent =
      '.rebel-dob-hidden{display:none!important;height:0!important;overflow:hidden!important;margin:0!important;padding:0!important}' +
      '#rebel-adhar-log-panel{position:fixed;left:6px;right:6px;bottom:6px;max-height:38vh;z-index:2147483646;background:rgba(8,12,20,.97);color:#bbf7d0;border:1px solid #334155;border-radius:10px;font:10px/1.4 monospace;overflow:hidden}' +
      '#rebel-adhar-log-header{display:flex;justify-content:space-between;align-items:center;padding:6px 8px;background:#111827;color:#fff;font:700 11px system-ui}' +
      '#rebel-adhar-log-header button{border:none;border-radius:5px;padding:3px 7px;margin-left:4px;background:#374151;color:#fff;font:600 10px system-ui}' +
      '#rebel-adhar-log-body{margin:0;padding:8px;max-height:calc(38vh - 34px);overflow:auto;white-space:pre-wrap;word-break:break-word}' +
      '#rebel-adhar-fab{position:fixed;right:10px;bottom:80px;z-index:2147483647;border:none;border-radius:999px;padding:12px 14px;color:#fff;font:700 12px system-ui;box-shadow:0 6px 20px rgba(0,0,0,.3)}' +
      '#rebel-adhar-name-btn{position:fixed;right:10px;bottom:138px;z-index:2147483647;border:none;border-radius:999px;padding:10px 12px;color:#fff;font:700 11px system-ui;box-shadow:0 6px 20px rgba(0,0,0,.3)}' +
      '#rebel-adhar-logs-btn{position:fixed;right:10px;bottom:196px;z-index:2147483647;border:none;border-radius:999px;padding:10px 12px;background:#4b5563;color:#fff;font:700 11px system-ui}';
    document.documentElement.appendChild(s);
  }

  function ensureLogs() {
    if (document.getElementById(LOG_PANEL_ID)) return;
    const p = document.createElement('div');
    p.id = LOG_PANEL_ID;
    p.innerHTML =
      '<div id="rebel-adhar-log-header"><strong>Rebel Adhar Logs</strong><span><button type="button" id="rebel-log-clear">Clear</button><button type="button" id="rebel-log-hide">Hide</button></span></div><pre id="' +
      LOG_BODY_ID +
      '"></pre>';
    document.documentElement.appendChild(p);
    document.getElementById('rebel-log-clear').onclick = () => {
      logLines.length = 0;
      updateLogs();
    };
    document.getElementById('rebel-log-hide').onclick = () => {
      const b = document.getElementById(LOG_BODY_ID);
      b.style.display = b.style.display === 'none' ? 'block' : 'none';
    };
  }

  function updateLogs() {
    ensureLogs();
    const b = document.getElementById(LOG_BODY_ID);
    if (!b) return;
    b.textContent = logLines.map((l) => `[${l.time}] ${l.level.toUpperCase()} ${l.msg}${l.extra ? ' | ' + l.extra : ''}`).join('\n');
    b.scrollTop = b.scrollHeight;
  }

  function stripDobFromPayload(body) {
    if (body == null) return { body, changed: false, removed: [] };
    if (typeof body === 'string') {
      const t = body.trim();
      if (t.startsWith('{')) {
        try {
          const j = JSON.parse(t);
          const removed = [];
          const walk = (obj) => {
            if (!obj || typeof obj !== 'object') return;
            Object.keys(obj).forEach((k) => {
              if (DOB_KEYS.includes(k) || /dob|birth|dateofbirth/i.test(k)) {
                removed.push(k);
                delete obj[k];
              } else if (typeof obj[k] === 'object') walk(obj[k]);
            });
          };
          walk(j);
          if (!removed.length) return { body, changed: false, removed: [] };
          return { body: JSON.stringify(j), changed: true, removed };
        } catch (_e) {
          return { body, changed: false, removed: [] };
        }
      }
      if (t.includes('=')) {
        const p = new URLSearchParams(t);
        const removed = [];
        [...p.keys()].forEach((k) => {
          if (/dob|birth|date/i.test(k)) {
            removed.push(k);
            p.delete(k);
          }
        });
        if (!removed.length) return { body, changed: false, removed: [] };
        return { body: p.toString(), changed: true, removed };
      }
    }
    return { body, changed: false, removed: [] };
  }

  function installNetworkHooks() {
    if (hooksReady) return;
    hooksReady = true;

    const origFetch = window.fetch.bind(window);
    window.fetch = async function (input, init) {
      const url = String(typeof input === 'string' ? input : input?.url || '');
      const method = (init?.method || 'GET').toUpperCase();
      let req = init ? { ...init } : {};
      if (enabled && req.body) {
        const patched = stripDobFromPayload(req.body);
        if (patched.changed) {
          req.body = patched.body;
          log('patch', 'DOB stripped from fetch', patched.removed);
        }
      }
      if (enabled && method !== 'GET') {
        networkCount += 1;
        log('req', `FETCH ${method} ${url}`, String(req.body || '').slice(0, 400));
      }
      const res = await origFetch(input, req);
      if (enabled && method !== 'GET') {
        const txt = await res.clone().text().catch(() => '');
        log(res.ok ? 'ok' : 'error', `FETCH ${res.status}`, txt.slice(0, 350));
      }
      return res;
    };

    const oOpen = XMLHttpRequest.prototype.open;
    const oSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u, ...r) {
      this.__ru = String(u || '');
      this.__rm = m;
      return oOpen.call(this, m, u, ...r);
    };
    XMLHttpRequest.prototype.send = function (body) {
      let final = body;
      if (enabled && body != null) {
        const patched = stripDobFromPayload(body);
        if (patched.changed) {
          final = patched.body;
          log('patch', 'DOB stripped from XHR', patched.removed);
        }
      }
      if (enabled) {
        networkCount += 1;
        log('req', `XHR ${this.__rm || 'POST'} ${this.__ru}`, String(final || '').slice(0, 400));
      }
      this.addEventListener('load', () => {
        if (!enabled) return;
        log(this.status >= 200 && this.status < 300 ? 'ok' : 'error', `XHR ${this.status}`, (this.responseText || '').slice(0, 350));
      });
      return oSend.call(this, final);
    };

    log('info', 'Network hooks ready (minimal mode)');
  }

  /** CSS hide + hidden dummy DOB for Angular (stripped from API) */
  function hideDobOnly() {
    inputs().forEach((input) => {
      if (kindOf(input) !== 'dob') return;
      if (!input.value) {
        input.value = '01/01/1990';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        log('info', 'Hidden DOB filled for Angular only (stripped from API)');
      }
      const box = containerOf(input);
      if (box) box.classList.add('rebel-dob-hidden');
      input.classList.add('rebel-dob-hidden');
      input.setAttribute('tabindex', '-1');
    });
  }

  function showDob() {
    document.querySelectorAll('.rebel-dob-hidden').forEach((el) => {
      el.classList.remove('rebel-dob-hidden');
      el.removeAttribute('tabindex');
    });
  }

  function relaxNameOnly() {
    if (!nameOptional) return;
    inputs().forEach((input) => {
      if (kindOf(input) !== 'name' && kindOf(input) !== 'other') return;
      const blob = norm(labelOf(input));
      if (kindOf(input) === 'other' && !matchText(blob, NAME_TEXT) && inputs().indexOf(input) !== 0) return;
      input.setAttribute('placeholder', 'Mr ya apna naam likho');
    });
  }

  function ensureButtons() {
    injectStyles();
    if (!document.getElementById(FAB_ID)) {
      const fab = document.createElement('button');
      fab.id = FAB_ID;
      fab.onclick = () => {
        enabled = !enabled;
        localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
        apply();
      };
      document.documentElement.appendChild(fab);
    }
    if (!document.getElementById('rebel-adhar-name-btn')) {
      const b = document.createElement('button');
      b.id = 'rebel-adhar-name-btn';
      b.onclick = () => {
        nameOptional = !nameOptional;
        localStorage.setItem(NAME_OPTIONAL_KEY, nameOptional ? '1' : '0');
        apply();
      };
      document.documentElement.appendChild(b);
    }
    if (!document.getElementById('rebel-adhar-logs-btn')) {
      const b = document.createElement('button');
      b.id = 'rebel-adhar-logs-btn';
      b.textContent = 'Logs';
      b.onclick = () => {
        const p = document.getElementById(LOG_PANEL_ID);
        if (p) p.style.display = p.style.display === 'none' ? 'block' : 'none';
      };
      document.documentElement.appendChild(b);
    }
    const fab = document.getElementById(FAB_ID);
    const nameBtn = document.getElementById('rebel-adhar-name-btn');
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
    ensureLogs();

    if (enabled) {
      installNetworkHooks();
      hideDobOnly();
      relaxNameOnly();
      log('info', 'MINIMAL mode ON — no click intercept, no validity bypass');
      log('info', 'Fields', inputs().map((i) => ({ k: kindOf(i), v: (i.value || '').slice(0, 40), dis: i.disabled })));
    } else {
      showDob();
      log('info', 'Extension OFF');
    }
  }

  function scheduleApply() {
    if (applyTimer) clearTimeout(applyTimer);
    applyTimer = setTimeout(() => {
      if (enabled) hideDobOnly();
    }, 800);
  }

  apply();

  const obs = new MutationObserver(scheduleApply);
  obs.observe(document.documentElement, { childList: true, subtree: true });
})();
