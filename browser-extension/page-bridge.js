/**
 * PAGE context — DOB bypass only. OTP = user khud dabata hai, zero interference.
 */
(function () {
  if (window.__rebelPageBridge) return;
  window.__rebelPageBridge = true;

  const E = window.UidaiRetrieveEngine;
  if (!E) return;

  const KEY = 'rebelAdharOn';
  const UI_SEL =
    '#rebel-adhar-log-panel,#rebel-fab,#rebel-switch-btn,#rebel-logs-btn,#rebel-debug-btn,#rebel-status-strip';

  let uidaiOkCount = 0;
  let prepTimer = null;

  function isOn() {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch (_e) {
      return false;
    }
  }

  function emit(level, msg, data) {
    try {
      window.postMessage({ rebel: 1, type: 'log', level: level, msg: msg, data: data }, '*');
    } catch (_e) {}
    console.log('[Rebel Adhar PAGE]', level, msg, data ?? '');
  }

  E.installNetworkBypass({
    log: emit,
    enabled: isOn,
    onSuccess: function (kind, method, url, status) {
      if (!isOn()) return;
      uidaiOkCount += 1;
      emit('req', kind + ' ' + method + ' ' + status, String(url || '').slice(0, 120));
      emit('info', 'OTP sent — UIDAI ' + status, { url: String(url || '').slice(0, 80) });
    },
  });

  function runPrep() {
    if (!isOn() || !E.isDobBypassed?.(UI_SEL)) return;
    if (E.prepForUserOtp) E.prepForUserOtp(UI_SEL, emit);
    else if (E.prepareOtpLight) E.prepareOtpLight(UI_SEL, emit);
  }

  function onFieldInput(e) {
    if (!isOn() || !E.isDobBypassed?.(UI_SEL)) return;
    const input = e.target?.closest?.('input, textarea');
    if (!input || input.type === 'hidden') return;
    if (E.syncNgControlsFromDom) E.syncNgControlsFromDom(emit);
  }

  function startPrepLoop() {
    if (prepTimer) clearInterval(prepTimer);
    prepTimer = setInterval(runPrep, 2500);
    runPrep();
  }

  function stopPrepLoop() {
    if (prepTimer) clearInterval(prepTimer);
    prepTimer = null;
  }

  function bootPage() {
    if (!isOn()) {
      stopPrepLoop();
      return;
    }
    emit('info', 'Rebel PAGE v' + E.ENGINE_VERSION + ' — ' + (E.detectFramework ? E.detectFramework() : 'page') + ' — khud Send OTP dabao');
    E.waitForForm(30000).then(function (ready) {
      if (!ready) {
        emit('warn', 'Form timeout — page reload karo');
        return;
      }
      return E.apply(UI_SEL, emit).then(function () {
        const bypassed = E.isDobBypassed(UI_SEL);
        emit('info', bypassed ? 'DOB bypass OK — ab khud Send OTP dabao' : 'Bypass DOB dabao', {
          dobVisible: E.dobFieldVisible(UI_SEL),
          orLinks: E.discoverOrLinks ? E.discoverOrLinks(UI_SEL).map(function (l) { return l.text; }) : [],
        });
        if (bypassed) startPrepLoop();
      });
    });
  }

  window.addEventListener('message', function (e) {
    if (!e.data || e.data.rebel !== 1 || e.data.type !== 'cmd') return;
    if (e.data.cmd === 'boot') bootPage();
    if (e.data.cmd === 'apply') {
      E.apply && E.apply(UI_SEL, emit);
      runPrep();
    }
    if (e.data.cmd === 'diag') {
      const d = E.getFormDiagnostics ? E.getFormDiagnostics(UI_SEL) : {};
      window.postMessage({ rebel: 1, type: 'diag', id: e.data.id, data: d }, '*');
    }
  });

  document.addEventListener('input', onFieldInput, true);
  document.addEventListener('change', onFieldInput, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootPage);
  } else {
    bootPage();
  }
})();
