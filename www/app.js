const state = {
  sessionId: null,
  step: 'form',
  pinRequired: false,
  dobBypass: false,
  name: '',
  mobile: '',
  liveTimer: null,
  waitTimer: null,
};

const STEP_ORDER = ['form', 'captcha1', 'otp1', 'captcha2', 'otp2', 'done'];
const SECTION_MAP = {
  form: 'secForm',
  captcha1: 'secCaptcha1',
  otp1: 'secOtp1',
  captcha2: 'secCaptcha2',
  otp2: 'secOtp2',
  done: 'secDone',
};
const BADGE_MAP = {
  form: 'badgeForm',
  captcha1: 'badgeCaptcha1',
  otp1: 'badgeOtp1',
  captcha2: 'badgeCaptcha2',
  otp2: 'badgeOtp2',
  done: 'badgeDone',
};

const WAIT_MSGS = {
  start: ['Proxy connect…', 'UIDAI server reach…', 'Captcha image fetch…', 'Session create…'],
  captcha1: ['Captcha verify…', 'OTP 1 request…'],
  otp1: ['EID verify…', 'Phase 2 start…', 'Captcha 2 load…'],
  captcha2: ['Captcha 2 verify…', 'OTP 2 request…'],
  otp2: ['PDF download…', 'Password unlock…'],
};

const $ = (id) => document.getElementById(id);

function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }

function nowStr() {
  return new Date().toLocaleTimeString('hi-IN', { hour12: false });
}

function appendLive(msg, type = 'info') {
  const box = $('logBox');
  const prefix = type === 'err' ? '✗' : type === 'ok' ? '✓' : '›';
  box.textContent += `\n[${nowStr()}] ${prefix} ${msg}`;
  box.scrollTop = box.scrollHeight;
}

function setLiveStatus(text, busy = false) {
  $('liveStatusText').textContent = text;
  $('liveTime').textContent = nowStr();
  const dot = $('liveDot');
  dot.classList.toggle('busy', busy);
}

function setError(msg) {
  const box = $('flowError');
  if (!msg) {
    hide(box);
    box.textContent = '';
    return;
  }
  box.textContent = msg;
  show(box);
  appendLive(msg, 'err');
  setLiveStatus('Error — ' + msg, false);
}

function startWaitMessages(key) {
  stopWaitMessages();
  const msgs = WAIT_MSGS[key] || ['Processing…'];
  let i = 0;
  appendLive(msgs[0]);
  state.waitTimer = setInterval(() => {
    i = (i + 1) % msgs.length;
    appendLive(msgs[i]);
    setLiveStatus(msgs[i], true);
  }, 1200);
}

function stopWaitMessages() {
  if (state.waitTimer) {
    clearInterval(state.waitTimer);
    state.waitTimer = null;
  }
}

function setLoading(on, btnId = 'startBtn') {
  const btn = $(btnId);
  if (btn) btn.disabled = on;
  setLiveStatus(on ? 'Processing…' : $('liveStatusText').textContent, on);
  if (!on) stopWaitMessages();
}

function setSectionEnabled(step, enabled) {
  const fields = {
    captcha1: ['captcha1Input', 'btnCaptcha1', 'refreshCaptcha1'],
    otp1: ['otp1Input', 'btnOtp1'],
    captcha2: ['captcha2Input', 'btnCaptcha2', 'refreshCaptcha2'],
    otp2: ['otp2Input', 'btnOtp2'],
  };
  (fields[step] || []).forEach((id) => {
    const el = $(id);
    if (el) el.disabled = !enabled;
  });
}

function updateSections(currentStep) {
  const idx = STEP_ORDER.indexOf(currentStep);
  STEP_ORDER.forEach((step, i) => {
    const sec = $(SECTION_MAP[step]);
    const badge = $(BADGE_MAP[step]);
    if (!sec) return;

    sec.classList.remove('active', 'done', 'locked');
    sec.style.display = 'block';
    if (i < idx) {
      sec.classList.add('done');
      if (badge) { badge.textContent = 'Done'; badge.className = 'sec-badge done'; }
    } else if (i === idx) {
      sec.classList.add('active');
      if (badge) { badge.textContent = 'Live'; badge.className = 'sec-badge live'; }
      setSectionEnabled(step, true);
      if (step === 'form') {
        $('nameInput').readOnly = false;
        $('mobileInput').readOnly = false;
        $('dobInput').readOnly = false;
        $('startBtn').disabled = false;
      }
    } else {
      sec.classList.add('locked');
      if (badge) { badge.textContent = 'Wait'; badge.className = 'sec-badge wait'; }
      setSectionEnabled(step, false);
    }
  });

  if (idx > 0 && currentStep !== 'done') {
    $('nameInput').readOnly = true;
    $('mobileInput').readOnly = true;
    $('dobInput').readOnly = true;
    $('startBtn').disabled = true;
  }
}

function updateSummary(data) {
  show($('summaryCard'));
  if (data.name || state.name) $('sumName').textContent = data.name || state.name;
  if (data.mobile || state.mobile) $('sumMobile').textContent = data.mobile || state.mobile;
  $('sumEid').textContent = data.eid || '—';
  const labels = {
    form: 'Details', captcha1: 'Captcha 1', otp1: 'OTP 1',
    captcha2: 'Captcha 2', otp2: 'OTP 2', done: 'PDF Ready',
  };
  $('sumStep').textContent = labels[data.step] || data.step;
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  let data = {};
  const text = await res.text();
  try { data = JSON.parse(text); } catch (_) {
    data = { detail: text.slice(0, 120) || `HTTP ${res.status}` };
  }
  if (!res.ok) {
    const err = new Error(data.detail || data.message || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function fetchHealth() {
  for (const path of ['/api/health', '/health', '/ping']) {
    try {
      return await api(path);
    } catch (_) { /* try next */ }
  }
  throw new Error('API 404 — Panel mein User program site lagao (bash run.sh)');
}

function captchaUrl(sessionId) {
  return `/api/pdf/captcha/${sessionId}?t=${Date.now()}`;
}

function refreshCaptchaImages(step) {
  if (!state.sessionId) return;
  if (step === 'captcha1' || step === 'otp1') {
    const img = $('captchaImg1');
    img.src = captchaUrl(state.sessionId);
    img.classList.remove('dim');
  }
  if (step === 'captcha2' || step === 'otp2') {
    const img = $('captchaImg2');
    img.src = captchaUrl(state.sessionId);
    img.classList.remove('dim');
  }
}

function renderLogs(lines) {
  if (!lines || !lines.length) return;
  lines.forEach((line) => appendLive(line, 'info'));
}

function applySession(data) {
  state.sessionId = data.session_id;
  state.step = data.step;
  updateSections(data.step);
  updateSummary(data);

  if (data.logs && data.logs.length) {
    renderLogs(data.logs.slice(-5));
  }

  const msgs = {
    captcha1: 'msgCaptcha1',
    otp1: 'msgOtp1',
    captcha2: 'msgCaptcha2',
    otp2: 'msgOtp2',
  };
  if (data.message && msgs[data.step]) {
    $(msgs[data.step]).textContent = data.message;
    appendLive(data.message, 'ok');
  }

  if (data.has_captcha) refreshCaptchaImages(data.step);

  const statusText = {
    form: 'Details bharo',
    captcha1: 'Captcha 1 — image dekho, type karo',
    otp1: 'OTP 1 SMS mein aaya — daalo',
    captcha2: 'Captcha 2 — image dekho',
    otp2: 'OTP 2 SMS — daalo',
    done: 'PDF ready — download karo!',
  };
  setLiveStatus(statusText[data.step] || data.step, false);

  if (data.step === 'done') {
    $('doneMessage').textContent = data.message || '✅ PDF ready';
    $('pwdLine').textContent = data.pdf_password
      ? `Password: ${data.pdf_password}`
      : (data.pdf_password_hint ? `Hint: ${data.pdf_password_hint}` : '');
    const dl = $('downloadBtn');
    dl.href = `/api/pdf/download/${data.session_id}`;
    dl.classList.remove('disabled');
    dl.removeAttribute('aria-disabled');
    appendLive('PDF download ready — button dabao', 'ok');
  }
}

function setBootError(msg) {
  const box = $('bootError');
  if (!msg) {
    hide(box);
    box.textContent = '';
    return;
  }
  box.textContent = '⚠ ' + msg;
  show(box);
}

function initPanel() {
  show($('mainPanel'));
  updateSections('form');
  setLiveStatus('Loading…');
  if ($('liveTime')) $('liveTime').textContent = nowStr();
}

async function boot() {
  initPanel();
  try {
    const health = await fetchHealth();
    setBootError('');
    let badge = `v${health.version}`;
    if (health.engine) badge += ' · LIVE';
    $('versionBadge').textContent = badge;
    state.pinRequired = health.pin_required;
    state.dobBypass = health.dob_bypass;

    if (health.proxy_set === false && health.role === 'alwaysdata-http') {
      setBootError('UIDAI_PROXY .env mein set karo — Indian proxy zaroori');
      appendLive('UIDAI_PROXY missing', 'err');
    }

    if (state.dobBypass) {
      hide($('dobLabel'));
      $('dobInput').removeAttribute('required');
    }

    if (!state.liveTimer) {
      state.liveTimer = setInterval(() => {
        if ($('liveTime')) $('liveTime').textContent = nowStr();
      }, 1000);
    }

    if (state.pinRequired) {
      show($('loginCard'));
      setLiveStatus('PIN login karo — default: 1234');
    } else {
      hide($('loginCard'));
      setLiveStatus('Ready — naam aur mobile bharo');
    }
    appendLive('Server connected', 'ok');
  } catch (e) {
    setBootError('Panel fix: Web → Sites → User program → bash ~/www/run.sh');
    appendLive('API 404 — static HTML chal raha, Python nahi. bash fix_web.sh', 'err');
    setLiveStatus('Offline mode — form dikhega, submit tab kaam karega jab app start ho');
    hide($('loginCard'));
  }
}

$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pin = $('pinInput').value.trim();
  try {
    await api('/api/login', { method: 'POST', body: JSON.stringify({ pin }) });
    hide($('loginCard'));
    setBootError('');
    updateSections('form');
    setLiveStatus('Ready — naam aur mobile bharo');
    appendLive('Login OK', 'ok');
  } catch (err) {
    $('loginError').textContent = err.message;
    show($('loginError'));
  }
});

$('startForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  setError('');
  state.name = $('nameInput').value.trim();
  state.mobile = $('mobileInput').value.trim();
  setLoading(true);
  startWaitMessages('start');
  setLiveStatus('UIDAI connect — captcha la raha hai…', true);
  try {
    const data = await api('/api/pdf/start', {
      method: 'POST',
      body: JSON.stringify({
        name: state.name,
        mobile: state.mobile,
        dob: $('dobInput').value.trim() || null,
      }),
    });
    appendLive(`Session start — ${state.name} / ${state.mobile}`, 'ok');
    applySession(data);
  } catch (err) {
    setError(err.message);
  } finally {
    setLoading(false);
  }
});

$('captcha1Form').addEventListener('submit', async (e) => {
  e.preventDefault();
  setError('');
  setLoading(true, 'btnCaptcha1');
  startWaitMessages('captcha1');
  try {
    const data = await api('/api/pdf/captcha1', {
      method: 'POST',
      body: JSON.stringify({ session_id: state.sessionId, captcha: $('captcha1Input').value.trim() }),
    });
    $('captcha1Input').value = '';
    applySession(data);
  } catch (err) {
    setError(err.message);
    refreshCaptchaImages('captcha1');
  } finally {
    setLoading(false, 'btnCaptcha1');
  }
});

$('otp1Form').addEventListener('submit', async (e) => {
  e.preventDefault();
  setError('');
  setLoading(true, 'btnOtp1');
  startWaitMessages('otp1');
  try {
    const data = await api('/api/pdf/otp1', {
      method: 'POST',
      body: JSON.stringify({ session_id: state.sessionId, otp: $('otp1Input').value.trim() }),
    });
    $('otp1Input').value = '';
    if (data.eid) appendLive(`EID: ${data.eid}`, 'ok');
    applySession(data);
  } catch (err) {
    setError(err.message);
  } finally {
    setLoading(false, 'btnOtp1');
  }
});

$('captcha2Form').addEventListener('submit', async (e) => {
  e.preventDefault();
  setError('');
  setLoading(true, 'btnCaptcha2');
  startWaitMessages('captcha2');
  try {
    const data = await api('/api/pdf/captcha2', {
      method: 'POST',
      body: JSON.stringify({ session_id: state.sessionId, captcha: $('captcha2Input').value.trim() }),
    });
    $('captcha2Input').value = '';
    applySession(data);
  } catch (err) {
    setError(err.message);
    refreshCaptchaImages('captcha2');
  } finally {
    setLoading(false, 'btnCaptcha2');
  }
});

$('otp2Form').addEventListener('submit', async (e) => {
  e.preventDefault();
  setError('');
  setLoading(true, 'btnOtp2');
  startWaitMessages('otp2');
  try {
    const data = await api('/api/pdf/otp2', {
      method: 'POST',
      body: JSON.stringify({ session_id: state.sessionId, otp: $('otp2Input').value.trim() }),
    });
    $('otp2Input').value = '';
    applySession(data);
  } catch (err) {
    setError(err.message);
  } finally {
    setLoading(false, 'btnOtp2');
  }
});

async function refreshCaptcha() {
  if (!state.sessionId) return;
  setError('');
  appendLive('Naya captcha load…');
  try {
    const data = await api('/api/pdf/refresh-captcha', {
      method: 'POST',
      body: JSON.stringify({ session_id: state.sessionId }),
    });
    applySession(data);
    refreshCaptchaImages(data.step);
  } catch (err) {
    setError(err.message);
  }
}

$('refreshCaptcha1').addEventListener('click', refreshCaptcha);
$('refreshCaptcha2').addEventListener('click', refreshCaptcha);

$('newFlowBtn').addEventListener('click', () => {
  state.sessionId = null;
  state.step = 'form';
  state.name = '';
  state.mobile = '';
  setError('');
  $('logBox').textContent = '[system] Naya session — details bharo…';
  $('nameInput').readOnly = false;
  $('mobileInput').readOnly = false;
  $('dobInput').readOnly = false;
  $('startBtn').disabled = false;
  $('captchaImg1').classList.add('dim');
  $('captchaImg2').classList.add('dim');
  $('downloadBtn').classList.add('disabled');
  $('downloadBtn').href = '#';
  updateSections('form');
  setLiveStatus('Ready — naam aur mobile bharo');
});

boot();

// Panel turant dikhao — API se pehle
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPanel);
} else {
  initPanel();
}
