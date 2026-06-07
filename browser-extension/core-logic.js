/**
 * Rebel Adhar — extension core
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.RebelAdharCore = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const ACTIVE_CLASS = 'rebel-adhar-active';
  const FAB_ID = 'rebel-adhar-fab';
  const LOG_PANEL_ID = 'rebel-adhar-log-panel';
  const LOG_BODY_ID = 'rebel-adhar-log-body';
  const UI_SEL = `#${LOG_PANEL_ID}, #${FAB_ID}, #rebel-fab, #rebel-switch-btn, #rebel-logs-btn`;

  const logs = [];
  let enabledState = false;
  let networkHooksInstalled = false;
  let otpPrepInstalled = false;
  let networkCount = 0;

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

  function isOtpUrl(url) {
    return /otp|uidai|aadhaar|retrieve|send|verify|auth|generate/i.test(url || '');
  }

  function installNetworkLog() {
    if (networkHooksInstalled) return;
    networkHooksInstalled = true;
    const origFetch = window.fetch;
    if (origFetch) {
      window.fetch = function (...args) {
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
        if (enabledState && isOtpUrl(url)) {
          networkCount += 1;
          log('req', 'fetch', url.slice(0, 100));
        }
        return origFetch.apply(this, args);
      };
    }
    const XHR = window.XMLHttpRequest;
    if (XHR?.prototype) {
      const open = XHR.prototype.open;
      const send = XHR.prototype.send;
      XHR.prototype.open = function (method, url) {
        this.__rebelUrl = String(url || '');
        return open.apply(this, arguments);
      };
      XHR.prototype.send = function () {
        if (enabledState && isOtpUrl(this.__rebelUrl)) {
          networkCount += 1;
          log('req', 'xhr', (this.__rebelUrl || '').slice(0, 100));
        }
        return send.apply(this, arguments);
      };
    }
  }

  function installOtpPrep() {
    if (otpPrepInstalled || !engine) return;
    otpPrepInstalled = true;
    document.addEventListener(
      'mousedown',
      (e) => {
        if (!enabledState) return;
        const btn = e.target?.closest?.('button, [role="button"], input[type="submit"], a');
        if (!btn) return;
        const t = (btn.textContent || btn.value || '').toLowerCase();
        if (!t.includes('send otp') && !t.includes('request otp')) return;
        if (window.__rebelOtpReplay) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        const before = networkCount;
        const prep = engine.prepareSubmit(UI_SEL, engLog);
        if (!prep?.formOk) {
          log('error', 'Pehle mobile + captcha bharo', prep?.after);
          return;
        }
        window.__rebelOtpReplay = true;
        setTimeout(() => {
          btn.click();
          setTimeout(() => {
            window.__rebelOtpReplay = false;
            if (networkCount <= before) {
              log('error', 'NO API CALL');
              log('info', 'Debug', engine.getFormDiagnostics?.(UI_SEL));
            }
          }, 4000);
        }, 100);
      },
      true
    );
  }

  async function applyRebelMode() {
    if (!engine) return { ok: false };
    ensureLogPanel();
    await engine.waitForForm(25000);
    return engine.apply(UI_SEL, engLog);
  }

  function applyMode(enabled) {
    enabledState = Boolean(enabled);
    ensureLogPanel();
    installNetworkLog();
    installOtpPrep();

    if (enabledState) {
      document.documentElement.classList.add(ACTIVE_CLASS);
      log('info', 'Rebel Adhar ON — DOB bypass');
      applyRebelMode();
    } else {
      document.documentElement.classList.remove(ACTIVE_CLASS);
      engine?.stopWatcher?.();
      log('info', 'OFF — page reload');
    }

    return { enabled: enabledState, dobDisabled: engine?.isDobDisabled?.() };
  }

  return {
    ACTIVE_CLASS,
    FAB_ID,
    LOG_PANEL_ID,
    applyMode,
    applyRebelMode,
    isDobStillVisible: () => engine?.dobFieldVisible?.(UI_SEL) ?? false,
    isDobDisabled: () => engine?.isDobDisabled?.() ?? false,
    formReady: () => engine?.formReady?.() ?? false,
    log,
  };
});
