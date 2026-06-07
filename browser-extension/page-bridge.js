/**
 * Runs inside PAGE context — Angular same world, zero click block when form OK.
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
  let skipOtp = false;
  let otpWatch = null;

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

  function uidaiOkSince(before) {
    return uidaiOkCount > before;
  }

  E.installNetworkBypass({
    log: emit,
    enabled: isOn,
    onSuccess: function (kind, method, url, status) {
      if (!isOn()) return;
      uidaiOkCount += 1;
      emit('req', kind + ' ' + method + ' ' + status, String(url || '').slice(0, 120));
    },
  });

  function isOtpBtn(el) {
    const btn = el?.closest?.('button,[role="button"],a,input[type="submit"]');
    if (!btn) return null;
    const t = E.norm(btn.textContent || btn.value || '');
    if (!t.includes('send otp') && !t.includes('request otp')) return null;
    return btn;
  }

  function quickPrepCheck() {
    if (!E.isDobBypassed(UI_SEL)) return { ok: false, reason: 'dob' };
    if (!E.isFormReadyForOtp(UI_SEL)) return { ok: false, reason: 'form' };
    return { ok: true };
  }

  function armOtpWatch(btn) {
    const before = uidaiOkCount;
    if (otpWatch) clearTimeout(otpWatch.timer);
    emit('info', 'OTP armed — Angular click free', { v: E.ENGINE_VERSION });
    const timer = setTimeout(function () {
      otpWatch = null;
      if (uidaiOkSince(before)) {
        emit('info', 'OTP sent', { via: 'angular-2xx', v: E.ENGINE_VERSION });
        return;
      }
      emit('warn', 'Angular 2xx nahi — pipeline retry');
      skipOtp = true;
      const run = E.invokeOtpPipeline
        ? E.invokeOtpPipeline(btn, UI_SEL, emit, function () {
            return uidaiOkSince(before);
          }, { skipNative: true, lightPrep: true })
        : Promise.resolve({ ok: false });
      Promise.resolve(run)
        .then(function (result) {
          if (result && result.ok && uidaiOkSince(before)) {
            emit('info', 'OTP sent', { via: result.via || 'pipeline', v: E.ENGINE_VERSION });
          } else if (!uidaiOkSince(before)) {
            emit('error', 'NO UIDAI 2xx — v' + E.ENGINE_VERSION + ' Copy Debug bhejo');
            emit('info', 'Debug', E.getFormDiagnostics ? E.getFormDiagnostics(UI_SEL) : {});
          }
        })
        .finally(function () {
          skipOtp = false;
        });
    }, 6000);
    otpWatch = { before: before, btn: btn, timer: timer };
  }

  document.addEventListener(
    'pointerdown',
    function (e) {
      if (!isOn() || skipOtp) return;
      const btn = isOtpBtn(e.target);
      if (!btn) return;
      if (E.prepareOtpLight) E.prepareOtpLight(UI_SEL, emit);
      const chk = quickPrepCheck();
      if (chk.ok) armOtpWatch(btn);
    },
    true
  );

  document.addEventListener(
    'click',
    function (e) {
      if (!isOn() || skipOtp) return;
      const btn = isOtpBtn(e.target);
      if (!btn) return;
      const chk = quickPrepCheck();
      if (!chk.ok) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (otpWatch) {
          clearTimeout(otpWatch.timer);
          otpWatch = null;
        }
        if (chk.reason === 'dob') {
          emit('error', 'DOB bypass fail — Bypass DOB dabao', {});
        } else {
          emit('error', 'Pehle naam + mobile + captcha bharo', E.getFormDiagnostics?.(UI_SEL));
        }
      }
    },
    true
  );

  function bootPage() {
    if (!isOn()) return;
    emit('info', 'Rebel PAGE v' + E.ENGINE_VERSION + ' injected');
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
