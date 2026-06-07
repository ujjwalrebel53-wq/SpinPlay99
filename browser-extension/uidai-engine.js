/**
 * UIDAI Retrieve Form Engine v3 — label/mat-field based (no formcontrolname in prod)
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.UidaiRetrieveEngine = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const HIDDEN = 'rebel-uidai-hidden';
  const DUMMY_DATE = new Date(1990, 0, 1);
  const DUMMY_STR = '01/01/1990';

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
    return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
  }

  function matLabel(mff) {
    return norm(mff.querySelector('mat-label, label, .mdc-floating-label, .mat-mdc-floating-label')?.textContent || '');
  }

  function getMatFields() {
    return qAll('mat-form-field, .mat-mdc-form-field')
      .map((mff) => ({
        mff,
        label: matLabel(mff),
        input: mff.querySelector('input:not([type="hidden"]), textarea'),
        hasDatepicker: !!mff.querySelector('mat-datepicker-toggle, [matformfielddatepicker], [matDatepicker]'),
      }))
      .filter((f) => f.input);
  }

  function classifyField(f) {
    const l = f.label;
    const ph = norm(f.input.placeholder || '');
    if (/date of birth|dob|birth date|जन्म|जन्म तिथि/.test(l) || f.hasDatepicker || /dd\/mm|dob|birth/.test(ph)) return 'dob';
    if (/email|e-mail|ई-?मेल/.test(l) || f.input.type === 'email') return 'email';
    if (/mobile|phone|मोबाइल/.test(l) && !/email/.test(l)) return 'mobile';
    if (/name|नाम/.test(l)) return 'name';
    if (/captcha|security/.test(l)) return 'captcha';
    return 'other';
  }

  function findLinkByText(pattern, uiSel) {
    const hits = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const t = node.textContent.trim();
        if (!t || t.length > 45) return NodeFilter.FILTER_REJECT;
        return pattern.test(t) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    let n;
    while ((n = walker.nextNode())) {
      const el = n.parentElement;
      if (el && isVisible(el, uiSel)) hits.push({ el, text: n.textContent.trim(), len: n.textContent.trim().length });
    }
    if (hits.length) {
      hits.sort((a, b) => a.len - b.len);
      return hits[0].el;
    }
    return null;
  }

  function findOrEmailLink(uiSel) {
    return findLinkByText(/^or\s*enter\s*e-?mail(\s*address)?$/i, uiSel);
  }

  function findOrMobileLink(uiSel) {
    return findLinkByText(/^or\s*enter\s*mobile(\s*number)?$/i, uiSel);
  }

  function simulateClick(el) {
    const o = { bubbles: true, cancelable: true, view: window };
    el.dispatchEvent(new PointerEvent('pointerdown', o));
    el.dispatchEvent(new MouseEvent('mousedown', o));
    el.focus?.();
    el.dispatchEvent(new PointerEvent('pointerup', o));
    el.dispatchEvent(new MouseEvent('mouseup', o));
    el.dispatchEvent(new MouseEvent('click', o));
    el.click?.();
  }

  function walkNg(el, fn) {
    const ctx = el?.__ngContext__;
    if (!Array.isArray(ctx)) return;
    ctx.forEach((item) => fn(item, el));
  }

  function scanNgDobControls() {
    const controls = [];
    const seen = new WeakSet();
    qAll('*').forEach((el) => {
      walkNg(el, (item) => {
        const form = item?.form;
        if (!form?.controls) return;
        Object.entries(form.controls).forEach(([key, ctrl]) => {
          if (!/dob|birth|dateofbirth|date_of_birth|dateOfBirth/i.test(key)) return;
          if (seen.has(ctrl)) return;
          seen.add(ctrl);
          controls.push({ key, ctrl, el });
        });
      });
    });
    return controls;
  }

  function setInputNative(input, value) {
    input.removeAttribute('readonly');
    input.readOnly = false;
    input.disabled = false;
    if (nativeInputSet) nativeInputSet.call(input, value);
    else input.value = value;
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: String(value) }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function setDobOnControl(ctrl) {
    const tries = [DUMMY_DATE, DUMMY_STR, '01-01-1990', '1990-01-01'];
    for (const v of tries) {
      try {
        ctrl.setValue(v, { emitEvent: true });
        if (ctrl.value != null && ctrl.value !== '') return true;
      } catch (_e) {
        try {
          ctrl.patchValue(v, { emitEvent: true });
          if (ctrl.value != null && ctrl.value !== '') return true;
        } catch (_e2) {}
      }
    }
    ctrl.clearValidators?.();
    ctrl.setErrors?.(null);
    ctrl.updateValueAndValidity?.({ emitEvent: true });
    return !!(ctrl.value != null && ctrl.value !== '');
  }

  function hideMff(mff) {
    mff.classList.add(HIDDEN);
    mff.style.cssText = 'display:none!important;visibility:hidden!important;height:0!important;margin:0!important;padding:0!important;overflow:hidden!important;';
  }

  function injectHideCss() {
    if (document.getElementById('rebel-uidai-css')) return;
    const st = document.createElement('style');
    st.id = 'rebel-uidai-css';
    st.textContent =
      '.' + HIDDEN + '{display:none!important;visibility:hidden!important;height:0!important;max-height:0!important;margin:0!important;padding:0!important;overflow:hidden!important;border:0!important;}';
    (document.head || document.documentElement).appendChild(st);
  }

  function clickLink(el, label, log) {
    if (!el) return false;
    log?.('info', label, (el.textContent || '').trim());
    simulateClick(el);
    return true;
  }

  /** Mobile OTP path: Email click (hide DOB) → Mobile click (restore mobile, DOB stays hidden) */
  function activateMobileNoDobMode(uiSel, log) {
    const email = findOrEmailLink(uiSel);
    if (!email) {
      log?.('warn', 'OR Enter Email not found');
      return false;
    }
    clickLink(email, 'Click OR Enter Email', log);
    setTimeout(() => {
      const mobile = findOrMobileLink(uiSel);
      if (mobile) clickLink(mobile, 'Click OR Enter Mobile', log);
      else log?.('info', 'OR Enter Mobile not found — mobile field may already be visible');
    }, 500);
    return true;
  }

  function dobFieldVisible(uiSel) {
    const dob = getMatFields().find((f) => classifyField(f) === 'dob');
    return !!(dob && isVisible(dob.mff, uiSel));
  }

  function emailModeActive(uiSel) {
    return !dobFieldVisible(uiSel);
  }

  function fillAndHideDob(uiSel, log) {
    injectHideCss();
    const dobFields = getMatFields().filter((f) => classifyField(f) === 'dob');
    let inputFilled = 0;
    dobFields.forEach((f) => {
      [DUMMY_STR, '01-01-1990'].forEach((v) => setInputNative(f.input, v));
      if ((f.input.value || '').trim()) inputFilled += 1;
      hideMff(f.mff);
    });

    let ngFilled = 0;
    scanNgDobControls().forEach(({ key, ctrl }) => {
      if (setDobOnControl(ctrl)) ngFilled += 1;
      log?.('info', 'NG DOB set', key);
    });

    return { dobFields: dobFields.length, inputFilled, ngFilled };
  }

  function apply(uiSel, log) {
    injectHideCss();
    const before = getMatFields().map((f) => ({ type: classifyField(f), label: f.label.slice(0, 30), vis: isVisible(f.mff) }));

    if (!emailModeActive(uiSel)) activateMobileNoDobMode(uiSel, log);

    return new Promise((resolve) => {
      setTimeout(() => {
        const switched = emailModeActive(uiSel);
        let bypass = null;
        if (!switched) bypass = fillAndHideDob(uiSel, log);
        const after = getMatFields().map((f) => ({
          type: classifyField(f),
          label: f.label.slice(0, 30),
          vis: isVisible(f.mff),
          val: (f.input.value || '').slice(0, 14),
        }));
        log?.('info', 'Apply done', { switched, bypass, after });
        resolve({ switched, bypass, before, after });
      }, 1500);
    });
  }

  function prepareSubmit(uiSel, log) {
    injectHideCss();
    if (!emailModeActive(uiSel)) activateMobileNoDobMode(uiSel, log);
    const bypass = fillAndHideDob(uiSel, log);

    qAll('button, [role="button"], input[type="submit"], a.mat-mdc-button').forEach((btn) => {
      const t = norm(btn.textContent || btn.value || '');
      if (!t.includes('send otp') && !t.includes('request otp')) return;
      btn.disabled = false;
      btn.removeAttribute('disabled');
      btn.classList.remove('mat-button-disabled', 'mat-mdc-button-disabled', 'disabled');
    });

    const snap = getMatFields().map((f) => ({
      type: classifyField(f),
      label: f.label.slice(0, 24),
      val: (f.input.value || '').slice(0, 14),
      vis: isVisible(f.mff),
    }));
    const emptyDob = snap.filter((x) => x.type === 'dob' && x.vis && !x.val).length;
    const ngDob = scanNgDobControls().filter(({ ctrl }) => ctrl.value == null || ctrl.value === '').length;

    log?.('info', 'Submit prep', { emptyDob, ngDobEmpty: ngDob, snap, bypass });
    return { emptyDob, ngDobEmpty: ngDob, snap };
  }

  function formReady() {
    return getMatFields().length >= 3;
  }

  function waitForForm(timeout) {
    return new Promise((resolve) => {
      if (formReady()) return resolve(true);
      const deadline = Date.now() + (timeout || 20000);
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
      }, 500);
    });
  }

  return {
    HIDDEN,
    norm,
    qAll,
    isVisible,
    getMatFields,
    classifyField,
    findOrEmailLink,
    findOrMobileLink,
    activateMobileNoDobMode,
    emailModeActive,
    dobFieldVisible,
    fillAndHideDob,
    apply,
    prepareSubmit,
    formReady,
    waitForForm,
    scanNgDobControls,
  };
});
