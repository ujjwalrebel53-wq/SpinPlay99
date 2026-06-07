/**
 * UIDAI Engine v5 — Astik UI + Angular OTP fix
 * Mode switch / hide DOB + silent Angular DOB value so Send OTP API fires
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

  let dobWatcher = null;
  let watchTimer = null;

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
    qAll('mat-datepicker-toggle').forEach((t) => {
      const box = fieldContainer(t);
      if (box) blocks.add(box);
    });
    return Array.from(blocks);
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
    if (/email|e-mail/.test(l) || f.input.type === 'email') return 'email';
    if (/mobile|phone|मोबाइल/.test(l) && !/email/.test(l)) return 'mobile';
    if (/name|नाम/.test(l)) return 'name';
    if (/captcha/.test(l)) return 'captcha';
    return 'other';
  }

  function injectCss() {
    if (document.getElementById('rebel-astik-css')) return;
    const st = document.createElement('style');
    st.id = 'rebel-astik-css';
    st.textContent =
      '.' +
      HIDDEN_MARK +
      '{display:none!important;visibility:hidden!important;height:0!important;overflow:hidden!important;margin:0!important;padding:0!important;}' +
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

  /** Video/Astik: DOB field screen se hat jaye */
  function hideDob(uiSel, log) {
    injectCss();
    const blocks = findDobBlocks();
    blocks.forEach((block) => {
      block.classList.add(HIDDEN_MARK);
      block.setAttribute('data-rebel-dob-hidden', '1');
      block.style.setProperty('display', 'none', 'important');
    });
    log?.('info', 'DOB hidden (Astik)', { blocks: blocks.length });
    return blocks.length;
  }

  function walkNg(el, fn) {
    const ctx = el?.__ngContext__;
    if (!Array.isArray(ctx)) return;
    ctx.forEach((item) => fn(item, el));
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
    walkAllNg((item) => {
      [item, item?.form].forEach((form) => {
        if (!isFormGroup(form) || seen.has(form)) return;
        seen.add(form);
        groups.push(form);
      });
    });
    return groups;
  }

  function dobControlEmpty(ctrl) {
    const v = ctrl?.value;
    return v == null || v === '' || (typeof v === 'string' && !v.trim());
  }

  function patchDobControl(ctrl, key, log) {
    if (!ctrl?.setValue && !ctrl?.patchValue) return false;
    if (!isDobControlKey(key)) return false;
    try {
      if (ctrl.disabled) ctrl.enable({ emitEvent: false });
    } catch (_e) {}
    ctrl.clearValidators?.();
    ctrl.setErrors?.(null);
    if (dobControlEmpty(ctrl)) {
      try {
        ctrl.setValue(SILENT_DOB, { emitEvent: false });
      } catch (_e1) {
        try {
          ctrl.setValue(new Date(1990, 0, 1), { emitEvent: false });
        } catch (_e2) {
          ctrl.patchValue?.(SILENT_DOB, { emitEvent: false });
        }
      }
    }
    ctrl.updateValueAndValidity?.({ emitEvent: false });
    log?.('info', 'Angular DOB patch', key);
    return true;
  }

  function syncDobDom(log) {
    let n = 0;
    getDobInputs().forEach((input) => {
      if ((input.value || '').trim()) return;
      input.value = SILENT_DOB;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      n += 1;
    });
    if (n) log?.('info', 'DOB DOM sync', { count: n, val: SILENT_DOB });
    return n;
  }

  /** OTP fix: Angular form VALID + hidden DOB filled silently */
  function patchAngularForms(log) {
    let patched = 0;
    const forms = [];
    collectFormGroups().forEach((form) => {
      const before = form.status;
      const walk = (group) => {
        Object.entries(group.controls || {}).forEach(([key, ctrl]) => {
          if (isFormGroup(ctrl)) walk(ctrl);
          else if (patchDobControl(ctrl, key, log)) patched += 1;
        });
      };
      walk(form);
      form.updateValueAndValidity?.({ emitEvent: false });
      forms.push({ before, after: form.status, valid: !!form.valid });
    });
    const dom = syncDobDom(log);
    return { patched, dom, forms };
  }

  function getFormDiagnostics() {
    const groups = collectFormGroups();
    return {
      formCount: groups.length,
      invalid: groups.filter((g) => g.status === 'INVALID').length,
      statuses: groups.slice(0, 5).map((g) => g.status),
      dobInputs: getDobInputs().map((i) => ({
        val: (i.value || '').slice(0, 14),
        hidden: !!i.closest('[data-rebel-dob-hidden]'),
      })),
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

  /** Astik: DOB disable — user ko DOB fill nahi karna */
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
    const ng = patchAngularForms(log);
    log?.('info', 'DOB disabled (Astik)', { blocks: blocks.length, inputs: getDobInputs().length, patch: ng });
    return { blocks: blocks.length, patch: ng };
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
      if (tag === 'a' || tag === 'button' || cur.getAttribute('role') === 'button' || cur.onclick) return cur;
      if (cur.classList?.contains('uidai-or-link')) return cur;
      cur = cur.parentElement;
    }
    return el;
  }

  function findLinkByText(pattern, uiSel) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const t = node.textContent.trim();
        if (!t || t.length > 45) return NodeFilter.FILTER_REJECT;
        return pattern.test(t) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    const hits = [];
    let n;
    while ((n = walker.nextNode())) {
      const el = leafClickable(n.parentElement);
      if (el && isVisible(el, uiSel)) hits.push({ el, len: n.textContent.trim().length });
    }
    hits.sort((a, b) => a.len - b.len);
    return hits[0]?.el || null;
  }

  function findOrEmailLink(uiSel) {
    return findLinkByText(/^or\s*enter\s*e-?mail(\s*address)?$/i, uiSel);
  }

  function findOrMobileLink(uiSel) {
    return findLinkByText(/^or\s*enter\s*mobile(\s*number)?$/i, uiSel);
  }

  function simulateClick(el) {
    const o = { bubbles: true, cancelable: true, view: window };
    el.dispatchEvent(new MouseEvent('mousedown', o));
    el.dispatchEvent(new MouseEvent('mouseup', o));
    el.dispatchEvent(new MouseEvent('click', o));
    el.click?.();
  }

  function tryUidaiModeSwitch(uiSel, log) {
    const email = findOrEmailLink(uiSel);
    if (!email) return Promise.resolve(false);
    log?.('info', 'UIDAI mode: OR Enter Email', (email.textContent || '').trim().slice(0, 40));
    simulateClick(email);
    return new Promise((resolve) => {
      setTimeout(() => {
        const mobile = findOrMobileLink(uiSel);
        if (mobile) {
          log?.('info', 'UIDAI mode: OR Enter Mobile', (mobile.textContent || '').trim().slice(0, 40));
          simulateClick(mobile);
        }
        setTimeout(() => resolve(!!mobile || true), 700);
      }, 700);
    });
  }

  function startWatcher(uiSel, log, on) {
    if (dobWatcher) dobWatcher.disconnect();
    if (watchTimer) clearTimeout(watchTimer);
    if (!on) return;
    dobWatcher = new MutationObserver(() => {
      if (watchTimer) return;
      watchTimer = setTimeout(() => {
        watchTimer = null;
        if (getDobInputs().length && !isDobHidden(uiSel)) hideDob(uiSel, log);
        patchAngularForms(log);
      }, 350);
    });
    dobWatcher.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  }

  function apply(uiSel, log) {
    startWatcher(uiSel, log, true);
    return tryUidaiModeSwitch(uiSel, log).then(() => {
      return new Promise((resolve) => {
        setTimeout(() => {
          const nativeGone = !getDobInputs().length || !dobFieldVisible(uiSel);
          if (nativeGone) {
            log?.('info', 'UIDAI native mode — DOB removed', { dobCount: getDobInputs().length });
          } else {
            hideDob(uiSel, log);
            patchAngularForms(log);
          }
          const diag = getFormDiagnostics();
          const snap = getMatFields()
            .filter((f) => classifyField(f) !== 'dob' || isVisible(f.input, uiSel))
            .map((f) => ({
              type: classifyField(f),
              label: f.label.slice(0, 26),
              val: (f.input.value || '').slice(0, 10),
            }));
          const state = {
            dobHidden: isDobHidden(uiSel),
            nativeGone,
            formOk: diag.formCount === 0 || diag.invalid === 0,
            diag,
            snap,
          };
          log?.('info', 'Astik ON done', state);
          resolve(state);
        }, 1100);
      });
    });
  }

  /** Click pe sirf Angular patch — DOM mat karo (OTP block hota tha) */
  function prepareSubmit(uiSel, log) {
    const before = getFormDiagnostics();
    const patch = patchAngularForms(log);
    const after = getFormDiagnostics();
    const state = {
      dobHidden: isDobHidden(uiSel),
      patch,
      before,
      after,
      formOk: after.formCount === 0 || after.invalid === 0,
    };
    log?.('info', 'Send OTP prep', state);
    if (!state.formOk && after.formCount > 0) {
      log?.('warn', 'Form still INVALID — OTP may block', after);
    }
    return state;
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
  }

  function dobFieldVisible(uiSel) {
    return getDobInputs().some((i) => isVisible(i, uiSel) && !i.closest('[data-rebel-dob-hidden]'));
  }

  return {
    norm,
    SILENT_DOB,
    DISABLED_MARK,
    HIDDEN_MARK,
    hideDob,
    disableDob,
    patchAngularForms,
    getFormDiagnostics,
    isDobHidden,
    isDobDisabled,
    dobFieldVisible,
    apply,
    prepareSubmit,
    formReady,
    waitForForm,
    getMatFields,
    classifyField,
    stopWatcher,
  };
});
