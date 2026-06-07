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
    if (engine?.installNetworkBypass) {
      engine.installNetworkBypass({
        log: engLog,
        enabled: () => enabledState,
        onHit: (_kind, _method, url) => {
          if (enabledState && isOtpUrl(url)) networkCount += 1;
        },
      });
    }
  }

  let skipOtpHook = false;
  let otpRunning = false;
  let otpFallbackTimer = null;

  function installOtpPrep() {
    if (otpPrepInstalled || !engine) return;
    otpPrepInstalled = true;

    document.addEventListener(
      'pointerdown',
      (e) => {
        if (!enabledState || skipOtpHook) return;
        const btn = e.target?.closest?.('button, [role="button"], input[type="submit"], a');
        if (!btn) return;
        const t = (btn.textContent || btn.value || '').toLowerCase();
        if (!t.includes('send otp') && !t.includes('request otp')) return;
        if (engine.prepareOtpLight) engine.prepareOtpLight(UI_SEL, engLog);
        else engine.prepareSubmit(UI_SEL, engLog);
      },
      true
    );

    document.addEventListener(
      'click',
      (e) => {
        if (!enabledState || skipOtpHook) return;
        const btn = e.target?.closest?.('button, [role="button"], input[type="submit"], a');
        if (!btn) return;
        const t = (btn.textContent || btn.value || '').toLowerCase();
        if (!t.includes('send otp') && !t.includes('request otp')) return;

        const prep = engine.prepareOtpLight
          ? engine.prepareOtpLight(UI_SEL, engLog)
          : engine.prepareSubmit(UI_SEL, engLog);
        if (!prep?.dobBypassed) {
          e.preventDefault();
          e.stopImmediatePropagation();
          log('error', 'DOB bypass nahi hua — Bypass DOB dabao', { dobInForm: prep?.dobInForm });
          return;
        }
        if (!prep?.formOk) {
          e.preventDefault();
          e.stopImmediatePropagation();
          log('error', 'Pehle naam + mobile + captcha bharo', prep?.after);
          return;
        }
        if (otpRunning) return;

        const before = networkCount;
        log('info', 'OTP native — Angular ko click jayega', { v: engine.ENGINE_VERSION });
        otpRunning = true;
        if (otpFallbackTimer) clearTimeout(otpFallbackTimer);
        otpFallbackTimer = setTimeout(() => {
          otpFallbackTimer = null;
          if (networkCount > before) {
            otpRunning = false;
            return;
          }
          skipOtpHook = true;
          const run = engine.invokeOtpPipeline
            ? engine.invokeOtpPipeline(btn, UI_SEL, engLog, () => networkCount > before, { skipNative: true })
            : Promise.resolve({ ok: false });
          Promise.resolve(run)
            .then((result) => {
              if (result?.ok) {
                log('info', 'OTP sent', { via: result.via || 'pipeline', v: engine.ENGINE_VERSION });
                return;
              }
              if (networkCount <= before) {
                log('error', 'NO API CALL');
                log('info', 'Debug', engine.getFormDiagnostics?.(UI_SEL));
              }
            })
            .finally(() => {
              otpRunning = false;
              setTimeout(() => {
                skipOtpHook = false;
              }, 400);
            });
        }, 4500);

        setTimeout(() => {
          if (networkCount > before) {
            if (otpFallbackTimer) clearTimeout(otpFallbackTimer);
            otpRunning = false;
            log('info', 'OTP sent', { via: 'native', v: engine.ENGINE_VERSION });
          }
        }, 5000);
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
