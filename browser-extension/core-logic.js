/**
 * Rebel Adhar v3 — uses UidaiRetrieveEngine (mat-label based, prod Angular)
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
  const UI_SEL = `#${LOG_PANEL_ID}, #${FAB_ID}, #rebel-fab, #rebel-switch-btn, #rebel-logs-btn`;

  const logs = [];
  let enabledState = false;
  let networkHooksInstalled = false;
  let otpPrepInstalled = false;
  let networkCount = 0;
  let applied = false;

  const engine = typeof UidaiRetrieveEngine !== 'undefined' ? UidaiRetrieveEngine : null;

  function log(level, msg, data) {
    const line = { time: new Date().toLocaleTimeString(), level, msg, data };
    logs.push(line);
    if (logs.length > 100) logs.shift();
    renderLogs();
    console.log('[Rebel Adhar]', level, msg, data ?? '');
  }

  function engLog(level, msg, data) {
    log(level, msg, data);
  }

  function ensureLogPanel() {
    if (document.getElementById(LOG_PANEL_ID)) return;
    const panel = document.createElement('div');
    panel.id = LOG_PANEL_ID;
    panel.innerHTML =
      '<div style="display:flex;justify-content:space-between;padding:8px;background:#111827;color:#fff;font:700 12px system-ui">' +
      '<strong>Rebel Adhar Logs</strong>' +
      '<button type="button" id="rebel-log-clear" style="border:none;border-radius:5px;padding:3px 8px;background:#374151;color:#fff">Clear</button>' +
      '</div><pre id="' + LOG_BODY_ID + '" style="margin:0;padding:10px;max-height:220px;overflow:auto;font:11px monospace;color:#bbf7d0;background:rgba(8,12,20,.97)"></pre>';
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
    body.textContent = logs.map((l) => {
      const x = l.data !== undefined ? ' | ' + (typeof l.data === 'string' ? l.data : JSON.stringify(l.data)) : '';
      return `[${l.time}] ${l.level.toUpperCase()} ${l.msg}${x}`;
    }).join('\n');
    body.scrollTop = body.scrollHeight;
  }

  function installNetworkLog() {
    if (networkHooksInstalled) return;
    networkHooksInstalled = true;
    const origFetch = window.fetch;
    if (origFetch) {
      window.fetch = function (...args) {
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
        if (enabledState && /otp|uidai|aadhaar|retrieve|send|verify|auth|genric/i.test(url)) {
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
      if (enabledState && /otp|uidai|aadhaar|retrieve|send|verify|auth|genric/i.test(url)) {
        networkCount += 1;
        log('req', 'xhr', url.slice(0, 100));
      }
      return origSend.apply(this, arguments);
    };
  }

  function installOtpPrep() {
    if (otpPrepInstalled || !engine) return;
    otpPrepInstalled = true;
    document.addEventListener(
      'click',
      (e) => {
        if (!enabledState) return;
        const btn = e.target?.closest?.('button, [role="button"], input[type="submit"], a');
        if (!btn) return;
        const t = engine.norm(btn.textContent || btn.value || '');
        if (!t.includes('send otp') && !t.includes('request otp')) return;
        const before = networkCount;
        const prep = engine.prepareSubmit(UI_SEL, engLog);
        if (prep.emptyDob > 0 || prep.ngDobEmpty > 0) log('error', 'DOB abhi bhi empty', prep);
        setTimeout(() => {
          if (networkCount <= before) log('error', 'NO API CALL');
        }, 3000);
      },
      true
    );
  }

  async function applyAstikMode(force) {
    if (!engine) return { ok: false, error: 'engine missing' };
    if (!enabledState && !force) return { ok: false };
    ensureLogPanel();
    const ready = await engine.waitForForm(20000);
    if (!ready) {
      log('warn', 'Form load timeout');
      return { ok: false };
    }
    if (applied && !force && engine.emailModeActive()) return { ok: true };
    log('info', 'v3 apply start');
    const result = await engine.apply(UI_SEL, engLog);
    applied = true;
    return result;
  }

  function applyMode(enabled) {
    enabledState = Boolean(enabled);
    ensureLogPanel();
    installNetworkLog();
    installOtpPrep();

    if (enabledState) {
      document.documentElement.classList.add(ACTIVE_CLASS);
      applied = false;
      log('info', 'v3.0 ON');
      applyAstikMode(true);
    } else {
      document.documentElement.classList.remove(ACTIVE_CLASS);
      applied = false;
      log('info', 'OFF — reload page');
    }

    return {
      enabled: enabledState,
      dobVisible: engine ? engine.getMatFields().some((f) => engine.classifyField(f) === 'dob' && engine.isVisible(f.mff, UI_SEL)) : false,
    };
  }

  return {
    ACTIVE_CLASS,
    FAB_ID,
    LOG_PANEL_ID,
    applyMode,
    applyAstikMode,
    isDobStillVisible: () =>
      engine
        ? engine.getMatFields().some((f) => engine.classifyField(f) === 'dob' && engine.isVisible(f.mff, UI_SEL))
        : false,
    isEmailVisible: () =>
      engine ? engine.getMatFields().some((f) => engine.classifyField(f) === 'email' && engine.isVisible(f.mff, UI_SEL)) : false,
    formReady: () => (engine ? engine.formReady() : false),
    log,
  };
});
