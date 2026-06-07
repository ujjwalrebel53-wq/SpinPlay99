/**
 * Runs inside PAGE context (injected <script>) — Angular + XHR same world.
 */
(function () {
  if (window.__rebelPageBridge) return;
  window.__rebelPageBridge = true;

  const E = window.UidaiRetrieveEngine;
  if (!E) return;

  const KEY = 'rebelAdharOn';
  const UI_SEL =
    '#rebel-adhar-log-panel,#rebel-fab,#rebel-switch-btn,#rebel-logs-btn,#rebel-debug-btn,#rebel-status-strip';

  let netCount = 0;
  let skipOtp = false;
  let otpRunning = false;

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
    onHit: function (kind, method, url) {
      if (!isOn()) return;
      netCount += 1;
      emit('req', kind + ' ' + String(method || ''), String(url || '').slice(0, 120));
    },
  });

  function isOtpBtn(el) {
    const btn = el?.closest?.('button,[role="button"],a,input[type="submit"]');
    if (!btn) return null;
    const t = E.norm(btn.textContent || btn.value || '');
    if (!t.includes('send otp') && !t.includes('request otp')) return null;
    return btn;
  }

  document.addEventListener(
    'pointerdown',
    function (e) {
      if (!isOn() || skipOtp) return;
      if (!isOtpBtn(e.target)) return;
      if (E.prepareOtpLight) E.prepareOtpLight(UI_SEL, emit);
      else E.prepareSubmit(UI_SEL, emit);
    },
    true
  );

  document.addEventListener(
    'click',
    function (e) {
      if (!isOn() || skipOtp) return;
      const btn = isOtpBtn(e.target);
      if (!btn) return;

      const prep = E.prepareOtpLight ? E.prepareOtpLight(UI_SEL, emit) : E.prepareSubmit(UI_SEL, emit);
      if (!prep.dobBypassed) {
        e.preventDefault();
        e.stopImmediatePropagation();
        emit('error', 'DOB bypass fail — Bypass DOB dabao', { dobInForm: prep.dobInForm });
        return;
      }
      if (!prep.formOk) {
        e.preventDefault();
        e.stopImmediatePropagation();
        emit('error', 'Pehle naam + mobile + captcha bharo', prep.after);
        return;
      }
      if (otpRunning) return;

      const before = netCount;
      otpRunning = true;
      emit('info', 'OTP PAGE click — Angular same world', { v: E.ENGINE_VERSION });

      setTimeout(function () {
        otpRunning = false;
        if (netCount > before) {
          emit('info', 'OTP sent', { via: 'page-angular', v: E.ENGINE_VERSION });
          return;
        }
        emit('warn', 'PAGE fallback pipeline');
        skipOtp = true;
        const run = E.invokeOtpPipeline
          ? E.invokeOtpPipeline(btn, UI_SEL, emit, function () {
              return netCount > before;
            })
          : Promise.resolve({ ok: false });
        Promise.resolve(run)
          .then(function (result) {
            if (result && result.ok) {
              emit('info', 'OTP sent', { via: result.via || 'pipeline', v: E.ENGINE_VERSION });
            } else if (netCount <= before) {
              emit('error', 'NO API CALL — v' + E.ENGINE_VERSION + ' Copy Debug bhejo');
              emit('info', 'Debug', E.getFormDiagnostics ? E.getFormDiagnostics(UI_SEL) : {});
            }
          })
          .finally(function () {
            skipOtp = false;
          });
      }, 4500);
    },
    true
  );

  function bootPage() {
    if (!isOn()) return;
    emit('info', 'Rebel PAGE v' + E.ENGINE_VERSION + ' injected — Angular world');
    E.waitForForm(30000).then(function (ready) {
      if (!ready) {
        emit('warn', 'Form timeout — page reload karo');
        return;
      }
      return E.apply(UI_SEL, emit).then(function () {
        const bypassed = E.isDobBypassed(UI_SEL);
        emit('info', bypassed ? 'DOB bypass OK — Send OTP' : 'Bypass DOB dabao', {
          dobVisible: E.dobFieldVisible(UI_SEL),
          orLinks: E.discoverOrLinks ? E.discoverOrLinks(UI_SEL).map(function (l) { return l.text; }) : [],
        });
      });
    });
  }

  window.addEventListener('message', function (e) {
    if (!e.data || e.data.rebel !== 1 || e.data.type !== 'cmd') return;
    if (e.data.cmd === 'boot') bootPage();
    if (e.data.cmd === 'apply') E.apply && E.apply(UI_SEL, emit);
    if (e.data.cmd === 'diag') {
      const d = E.getFormDiagnostics ? E.getFormDiagnostics(UI_SEL) : {};
      window.postMessage({ rebel: 1, type: 'diag', id: e.data.id, data: d }, '*');
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootPage);
  } else {
    bootPage();
  }
})();
