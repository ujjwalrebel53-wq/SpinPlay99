const state = {
  sessionId: null,
  step: 'form',
  pinRequired: false,
  dobBypass: false,
};

const $ = (id) => document.getElementById(id);

function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }

function setError(msg) {
  const box = $('flowError');
  if (!msg) {
    hide(box);
    box.textContent = '';
    return;
  }
  box.textContent = msg;
  show(box);
}

function setLoading(on) {
  $('startBtn').disabled = on;
  on ? show($('loader')) : hide($('loader'));
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  let data = {};
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) {
    const err = new Error(data.detail || data.message || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function updateSteps(step) {
  const order = ['form', 'captcha1', 'otp1', 'captcha2', 'otp2', 'done'];
  const idx = order.indexOf(step);
  document.querySelectorAll('.step').forEach((el) => {
    const s = el.dataset.step;
    const i = order.indexOf(s);
    el.classList.toggle('active', s === step);
    el.classList.toggle('done', i >= 0 && i < idx);
  });
}

function showPanel(step) {
  const panels = {
    form: 'panelForm',
    captcha1: 'panelCaptcha1',
    otp1: 'panelOtp1',
    captcha2: 'panelCaptcha2',
    otp2: 'panelOtp2',
    done: 'panelDone',
  };
  Object.values(panels).forEach((id) => hide($(id)));
  if (panels[step]) show($(panels[step]));
  updateSteps(step);
}

function captchaUrl(sessionId) {
  return `/api/pdf/captcha/${sessionId}?t=${Date.now()}`;
}

function refreshCaptchaImages() {
  if (!state.sessionId) return;
  if (state.step === 'captcha1' || state.step === 'otp1') {
    $('captchaImg1').src = captchaUrl(state.sessionId);
  }
  if (state.step === 'captcha2' || state.step === 'otp2') {
    $('captchaImg2').src = captchaUrl(state.sessionId);
  }
}

function renderLogs(lines) {
  if (!lines || !lines.length) return;
  show($('logsCard'));
  $('logBox').textContent = lines.join('\n');
}

function applySession(data) {
  state.sessionId = data.session_id;
  state.step = data.step;
  showPanel(data.step);
  renderLogs(data.logs);

  if (data.message) {
    if (data.step === 'captcha1') $('msgCaptcha1').textContent = data.message;
    if (data.step === 'otp1') $('msgOtp1').textContent = data.message;
    if (data.step === 'captcha2') $('msgCaptcha2').textContent = data.message;
    if (data.step === 'otp2') $('msgOtp2').textContent = data.message;
  }

  if (data.has_captcha) refreshCaptchaImages();

  if (data.step === 'done') {
    $('doneMessage').textContent = data.message || 'PDF ready';
    $('eidLine').textContent = data.eid ? `EID: ${data.eid}` : '';
    $('pwdLine').textContent = data.pdf_password
      ? `PDF Password: ${data.pdf_password}`
      : (data.pdf_password_hint ? `Hint: ${data.pdf_password_hint}` : '');
    $('downloadBtn').href = `/api/pdf/download/${data.session_id}`;
  }
}

async function boot() {
  try {
    const health = await api('/api/health');
    $('versionBadge').textContent = `v${health.version}`;
    state.pinRequired = health.pin_required;
    state.dobBypass = health.dob_bypass;

    if (state.dobBypass) {
      $('dobLabel').classList.add('hidden');
      $('dobInput').removeAttribute('required');
    } else {
      $('dobInput').setAttribute('required', 'required');
    }

    if (state.pinRequired) {
      show($('loginCard'));
      hide($('flowCard'));
    } else {
      hide($('loginCard'));
      show($('flowCard'));
      showPanel('form');
    }
  } catch (e) {
    setError('Server connect nahi ho raha — start_web.sh chalao');
  }
}

$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  setError('');
  const pin = $('pinInput').value.trim();
  try {
    await api('/api/login', { method: 'POST', body: JSON.stringify({ pin }) });
    hide($('loginCard'));
    show($('flowCard'));
    showPanel('form');
  } catch (err) {
    $('loginError').textContent = err.message || 'Login fail';
    show($('loginError'));
  }
});

$('startForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  setError('');
  setLoading(true);
  try {
    const body = {
      name: $('nameInput').value.trim(),
      mobile: $('mobileInput').value.trim(),
      dob: $('dobInput').value.trim() || null,
    };
    const data = await api('/api/pdf/start', {
      method: 'POST',
      body: JSON.stringify(body),
    });
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
  setLoading(true);
  try {
    const data = await api('/api/pdf/captcha1', {
      method: 'POST',
      body: JSON.stringify({
        session_id: state.sessionId,
        captcha: $('captcha1Input').value.trim(),
      }),
    });
    $('captcha1Input').value = '';
    applySession(data);
  } catch (err) {
    setError(err.message);
    refreshCaptchaImages();
  } finally {
    setLoading(false);
  }
});

$('otp1Form').addEventListener('submit', async (e) => {
  e.preventDefault();
  setError('');
  setLoading(true);
  try {
    const data = await api('/api/pdf/otp1', {
      method: 'POST',
      body: JSON.stringify({
        session_id: state.sessionId,
        otp: $('otp1Input').value.trim(),
      }),
    });
    $('otp1Input').value = '';
    applySession(data);
  } catch (err) {
    setError(err.message);
  } finally {
    setLoading(false);
  }
});

$('captcha2Form').addEventListener('submit', async (e) => {
  e.preventDefault();
  setError('');
  setLoading(true);
  try {
    const data = await api('/api/pdf/captcha2', {
      method: 'POST',
      body: JSON.stringify({
        session_id: state.sessionId,
        captcha: $('captcha2Input').value.trim(),
      }),
    });
    $('captcha2Input').value = '';
    applySession(data);
  } catch (err) {
    setError(err.message);
    refreshCaptchaImages();
  } finally {
    setLoading(false);
  }
});

$('otp2Form').addEventListener('submit', async (e) => {
  e.preventDefault();
  setError('');
  setLoading(true);
  try {
    const data = await api('/api/pdf/otp2', {
      method: 'POST',
      body: JSON.stringify({
        session_id: state.sessionId,
        otp: $('otp2Input').value.trim(),
      }),
    });
    $('otp2Input').value = '';
    applySession(data);
  } catch (err) {
    setError(err.message);
  } finally {
    setLoading(false);
  }
});

async function refreshCaptcha() {
  if (!state.sessionId) return;
  setError('');
  setLoading(true);
  try {
    const data = await api('/api/pdf/refresh-captcha', {
      method: 'POST',
      body: JSON.stringify({ session_id: state.sessionId }),
    });
    applySession(data);
    refreshCaptchaImages();
  } catch (err) {
    setError(err.message);
  } finally {
    setLoading(false);
  }
}

$('refreshCaptcha1').addEventListener('click', refreshCaptcha);
$('refreshCaptcha2').addEventListener('click', refreshCaptcha);

$('newFlowBtn').addEventListener('click', () => {
  state.sessionId = null;
  state.step = 'form';
  setError('');
  showPanel('form');
});

boot();
