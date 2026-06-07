// ==UserScript==
// @name         Rebel Adhar
// @namespace    https://github.com/ujjwalrebel53-wq/SpinPlay99
// @version      7.0.0
// @description  UIDAI type=date fix + always hide DOB (Astik)
// @match        https://myaadhaar.uidai.gov.in/*
// @match        https://*.uidai.gov.in/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

/**
 * UIDAI Engine v7 — UIDAI prod: type=date (YYYY-MM-DD) + always hide DOB (Astik)
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

  function isDobFilled(uiSel) {
    const inputs = getDobInputs();
    if (!inputs.length) return true;
    return inputs.every((i) => {
      if (!isVisible(i, uiSel) || i.closest('[data-rebel-dob-hidden]')) {
        return !!readInputVal(i) || i.dataset.rebelDobOk === '1';
      }
      return !!readInputVal(i);
    });
  }

  function isFormReadyForOtp(uiSel) {
    const groups = collectFormGroups().filter((g) => g.controls);
    const ngOk = groups.length === 0 || groups.every((g) => g.valid || g.status === 'VALID');
    return isDobFilled(uiSel) && ngOk;
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
      dobFilled: isDobFilled(uiSel),
      dobInputs: getDobInputs().map((i) => ({
        val: readInputVal(i).slice(0, 14),
        type: i.type || '',
        hidden: !!i.closest('[data-rebel-dob-hidden]'),
        ro: i.hasAttribute('readonly'),
        ok: i.dataset.rebelDobOk === '1',
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

  function findToggleLink(uiSel, patterns) {
    for (const p of patterns) {
      const hit = findLinkByText(p, uiSel);
      if (hit) return hit;
    }
    const nodes = qAll('a, span, button, label, [role="button"], [role="link"]');
    for (const el of nodes) {
      const t = norm(el.textContent || '');
      if (t.length > 50) continue;
      if (!patterns.some((p) => p.test(t))) continue;
      if (!isVisible(el, uiSel)) continue;
      return leafClickable(el);
    }
    return null;
  }

  function findOrEmailLink(uiSel) {
    return findToggleLink(uiSel, [
      /^or\s*enter\s*e-?mail(\s*address)?$/i,
      /^enter\s*e-?mail(\s*address)?$/i,
      /or\s*e-?mail/i,
    ]);
  }

  function findOrMobileLink(uiSel) {
    return findToggleLink(uiSel, [
      /^or\s*enter\s*mobile(\s*number)?$/i,
      /^enter\s*mobile(\s*number)?$/i,
      /or\s*mobile/i,
    ]);
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
    if (!email) {
      log?.('warn', 'OR Email link not found');
      return Promise.resolve(false);
    }
    log?.('info', 'UIDAI mode: OR Enter Email', (email.textContent || '').trim().slice(0, 40));
    simulateClick(email);
    return new Promise((resolve) => {
      setTimeout(() => {
        const mobile = findOrMobileLink(uiSel);
        if (mobile) {
          log?.('info', 'UIDAI mode: OR Enter Mobile', (mobile.textContent || '').trim().slice(0, 40));
          simulateClick(mobile);
        } else {
          log?.('warn', 'OR Mobile link not found');
        }
        setTimeout(() => resolve(!!mobile), 900);
      }, 900);
    });
  }

  function runModeSwitchRetry(uiSel, log, times) {
    let chain = Promise.resolve();
    for (let i = 0; i < (times || 2); i++) {
      chain = chain.then(() => tryUidaiModeSwitch(uiSel, log)).then(() => {
        if (!getDobInputs().length) return false;
        return new Promise((r) => setTimeout(r, 600));
      });
    }
    return chain;
  }

  function startWatcher(uiSel, log, on) {
    if (dobWatcher) dobWatcher.disconnect();
    if (watchTimer) clearTimeout(watchTimer);
    if (!on) return;
    dobWatcher = new MutationObserver(() => {
      if (syncingDom || watchTimer) return;
      watchTimer = setTimeout(() => {
        watchTimer = null;
        if (!getDobInputs().length && !findDobBlocks().length) return;
        if (!isDobHidden(uiSel)) hideDob(uiSel, log);
        if (!isDobFilled(uiSel)) patchAngularForms(log);
      }, 600);
    });
    dobWatcher.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  }

  function apply(uiSel, log) {
    startWatcher(uiSel, log, true);
    return runModeSwitchRetry(uiSel, log, 2).then(() => {
      return new Promise((resolve) => {
        setTimeout(() => {
          const nativeGone = !getDobInputs().length;
          if (nativeGone) {
            log?.('info', 'UIDAI native mode — DOB removed', {});
          } else {
            hideDob(uiSel, log);
            patchAngularForms(log);
          }
          const diag = getFormDiagnostics(uiSel);
          const snap = getMatFields()
            .filter((f) => classifyField(f) !== 'dob' || isVisible(f.input, uiSel))
            .map((f) => ({
              type: classifyField(f),
              label: f.label.slice(0, 26),
              val: readInputVal(f.input).slice(0, 10),
            }));
          const state = {
            dobHidden: isDobHidden(uiSel),
            nativeGone,
            formOk: isFormReadyForOtp(uiSel),
            diag,
            snap,
          };
          log?.('info', 'Astik ON done', state);
          resolve(state);
        }, 1400);
      });
    });
  }

  /** mousedown pe patch — click se pehle Angular ko value mile */
  function prepareSubmit(uiSel, log) {
    return runModeSwitchRetry(uiSel, log, 1).then(() => {
      hideDob(uiSel, log);
      const before = getFormDiagnostics(uiSel);
      const patch = patchAngularForms(log);
      const after = getFormDiagnostics(uiSel);
      const state = {
        dobHidden: isDobHidden(uiSel),
        patch,
        before,
        after,
        formOk: isFormReadyForOtp(uiSel),
      };
      log?.('info', 'Send OTP prep', state);
      if (!state.formOk) log?.('error', 'DOB/Form not ready', after);
      return state;
    });
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
    SILENT_DOB_ISO,
    DISABLED_MARK,
    HIDDEN_MARK,
    hideDob,
    disableDob,
    patchAngularForms,
    getFormDiagnostics,
    isFormReadyForOtp,
    isDobFilled,
    readInputVal,
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


(function () {
  'use strict';
  const E = UidaiRetrieveEngine;
  const KEY = 'rebelAdharOn';
  const LOG_ID = 'rebel-adhar-log-panel';
  const LOG_BODY = 'rebel-adhar-log-body';
  const UI_SEL = '#' + LOG_ID + ',#rebel-fab,#rebel-switch-btn,#rebel-logs-btn,#rebel-debug-btn';

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
        '#rebel-logs-btn{position:fixed;right:10px;bottom:194px;z-index:2147483647;border:none;border-radius:999px;padding:10px 12px;background:#4b5563;color:#fff;font:700 11px system-ui}';
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
      b.textContent = 'Switch Mode';
      b.onclick = function () { if (on) E.apply(UI_SEL, log); };
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
        const txt = JSON.stringify({ url: location.href, on: on, diag: d, logs: logs.slice(-15) }, null, 2);
        try { navigator.clipboard.writeText(txt); log('info', 'Debug copied'); } catch (_e) { log('info', 'Debug', txt); }
      };
      document.documentElement.appendChild(b);
    }
    updateBtns();
  }

  function updateBtns() {
    const fab = document.getElementById('rebel-fab');
    if (fab) {
      fab.textContent = on ? 'Rebel Adhar: ON' : 'Rebel Adhar: OFF';
      fab.style.background = on ? '#0a7a2f' : '#b42318';
    }
  }

  function isOtpUrl(u) {
    return /otp|uidai|aadhaar|retrieve|send|verify|auth|generate/i.test(u || '');
  }

  function installNet() {
    if (window.__rebelNet5) return;
    window.__rebelNet5 = true;
    const f = window.fetch;
    window.fetch = function () {
      const u = typeof arguments[0] === 'string' ? arguments[0] : arguments[0]?.url || '';
      if (on && isOtpUrl(u)) {
        netCount += 1;
        log('req', 'fetch', u.slice(0, 100));
      }
      return f.apply(this, arguments);
    };
    const XHR = window.XMLHttpRequest;
    if (XHR && XHR.prototype) {
      const open = XHR.prototype.open;
      const send = XHR.prototype.send;
      XHR.prototype.open = function (method, url) {
        this.__rebelUrl = String(url || '');
        return open.apply(this, arguments);
      };
      XHR.prototype.send = function () {
        if (on && isOtpUrl(this.__rebelUrl)) {
          netCount += 1;
          log('req', 'xhr', (this.__rebelUrl || '').slice(0, 100));
        }
        return send.apply(this, arguments);
      };
    }
  }

  function watchOtp() {
    if (window.__rebelOtp6) return;
    window.__rebelOtp6 = true;
    document.addEventListener('mousedown', function (e) {
      if (!on) return;
      const btn = e.target?.closest?.('button,[role="button"],a,input[type="submit"]');
      if (!btn) return;
      const t = E.norm(btn.textContent || btn.value || '');
      if (!t.includes('send otp') && !t.includes('request otp')) return;
      const before = netCount;
      Promise.resolve(E.prepareSubmit(UI_SEL, log)).then(function (prep) {
        if (!prep.formOk) log('error', 'DOB/Form not ready', prep.after);
        setTimeout(function () {
          if (netCount <= before) {
            log('error', 'NO API CALL — fetch/xhr');
            if (E.getFormDiagnostics) log('info', 'Debug', E.getFormDiagnostics(UI_SEL));
          }
        }, 3500);
      });
    }, true);
  }

  async function runOn() {
    ensureUI();
    installNet();
    watchOtp();
    log('info', 'v6 ON — prod UIDAI OTP patch');
    const ready = await E.waitForForm(25000);
    if (!ready) { log('warn', 'Form timeout'); return; }
    await E.apply(UI_SEL, log);
    log('info', 'Ready', { dobVisible: E.dobFieldVisible(UI_SEL) });
  }

  ensureUI();
  installNet();
  watchOtp();
  if (on) runOn();
  else log('info', 'Rebel Adhar OFF — ON dabao');
})();
