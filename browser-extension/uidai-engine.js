/**
 * UIDAI Engine v9 — True DOB bypass: UIDAI mode switch only, NO fake DOB fill
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

  /** Bypass = UIDAI ne DOB field DOM se hata diya (fake date fill NAHI) */
  function isDobBypassed() {
    return getDobInputs().length === 0;
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
    if (!isDobBypassed()) return false;
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
      dobBypassed: isDobBypassed(),
      dobInForm: getDobInputs().length,
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
    const ng = patchAngularForms(log);
    log?.('info', 'DOB bypass applied', { blocks: blocks.length, inputs: getDobInputs().length, patch: ng });
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

  function kindFromOrText(text) {
    const t = norm(text);
    if (/e-?mail|email|ईमेल/i.test(t)) return 'email';
    if (/mobile|phone|मोबाइल/i.test(t)) return 'mobile';
    return 'other';
  }

  function discoverOrLinks(uiSel) {
    const found = [];
    const seen = new Set();

    function add(el, raw) {
      if (!el || seen.has(el)) return;
      const text = norm(raw || el.innerText || el.textContent || '');
      if (!isOrLinkText(text)) return;
      const click = leafClickable(el);
      if (!click || seen.has(click)) return;
      if (!isVisible(click, uiSel)) return;
      seen.add(click);
      found.push({ el: click, text, kind: kindFromOrText(text) });
    }

    const sel =
      'a, button, span, div, p, label, mat-hint, [matSuffix], [matsuffix], [role="button"], [role="link"], .uidai-or-link, .or-link, [class*="or-link"], [class*="or_link"], [class*="toggle"]';
    qAll(sel).forEach((el) => add(el));

    findDobBlocks().forEach((block) => {
      block.querySelectorAll(sel).forEach((el) => add(el));
    });

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const t = norm(node.textContent || '');
      if (!t || t.length > 50 || !/\bor\b/.test(t)) continue;
      let cur = node.parentElement;
      for (let i = 0; i < 4 && cur; i++, cur = cur.parentElement) {
        add(cur, cur.innerText || cur.textContent);
      }
    }

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

  async function tryUidaiModeSwitch(uiSel, log) {
    if (isDobBypassed()) return true;

    const links = discoverOrLinks(uiSel);
    log?.('info', 'OR links scan', links.map((l) => l.text));

    if (!links.length) {
      const sample = norm(document.body?.innerText || '').slice(0, 240);
      log?.('warn', 'OR toggle not found', { sample });
      return false;
    }

    const email = links.find((l) => l.kind === 'email');
    const mobile = links.find((l) => l.kind === 'mobile');

    if (email) {
      log?.('info', 'UIDAI mode click', email.text);
      simulateClick(email.el);
      await waitMs(1400);
      if (isDobBypassed()) return true;
    }

    const mobileAfter = discoverOrLinks(uiSel).find((l) => l.kind === 'mobile') || mobile;
    if (mobileAfter) {
      log?.('info', 'UIDAI mode click', mobileAfter.text);
      simulateClick(mobileAfter.el);
      await waitMs(1400);
      return true;
    }

    if (email) return true;

    log?.('info', 'UIDAI mode click (fallback)', links[0].text);
    simulateClick(links[0].el);
    await waitMs(1400);
    return true;
  }

  function runModeSwitchRetry(uiSel, log, times) {
    let chain = Promise.resolve();
    for (let i = 0; i < (times || 3); i++) {
      chain = chain.then(() => tryUidaiModeSwitch(uiSel, log)).then(() => {
        if (isDobBypassed()) return false;
        return new Promise((r) => setTimeout(r, 800));
      });
    }
    return chain;
  }

  function startWatcher(uiSel, log, on) {
    if (dobWatcher) dobWatcher.disconnect();
    if (watchTimer) clearTimeout(watchTimer);
    if (!on) return;
    dobWatcher = new MutationObserver(() => {
      if (watchTimer) return;
      watchTimer = setTimeout(() => {
        watchTimer = null;
        if (isDobBypassed()) return;
        quickModeSwitch(uiSel, log);
        neutralizeEmail(log);
      }, 700);
    });
    dobWatcher.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  }

  function apply(uiSel, log) {
    startWatcher(uiSel, log, true);
    return runModeSwitchRetry(uiSel, log, 4).then(() => {
      return new Promise((resolve) => {
        setTimeout(() => {
          neutralizeEmail(log);
          if (!isDobBypassed()) {
            quickModeSwitch(uiSel, log);
            log?.('warn', 'DOB abhi form me — Switch Mode dubara try', { dobCount: getDobInputs().length });
          } else {
            log?.('info', 'DOB bypass OK — UIDAI ne DOB hata diya', {});
          }
          const diag = getFormDiagnostics(uiSel);
          const state = {
            dobBypassed: isDobBypassed(),
            dobInForm: getDobInputs().length,
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
    const bypassed = isDobBypassed();
    const state = {
      dobBypassed: bypassed,
      dobInForm: getDobInputs().length,
      after,
      formOk: isFormReadyForOtp(uiSel),
    };
    log?.('info', 'Send OTP prep', state);
    if (!bypassed) {
      log?.('error', 'DOB bypass fail — Switch Mode dabao (DOB fill mat karo, fake date kaam nahi karega)', {
        dobInForm: state.dobInForm,
      });
    } else if (!state.formOk) {
      const miss = (after.fields || []).filter(
        (f) => (f.type === 'name' || f.type === 'mobile' || f.type === 'captcha') && !f.ok
      );
      log?.('error', 'Fill missing', miss.length ? miss : after.fields);
    }
    return state;
  }

  /** OTP prep — sirf mode switch + email neutralize; DOB fill KABHI NAHI */
  function prepareSubmit(uiSel, log) {
    if (!isDobBypassed()) quickModeSwitch(uiSel, log);
    neutralizeEmail(log);
    enableOtpButtons();
    return buildSubmitState(uiSel, log);
  }

  /** Mode switch ke baad wait — UIDAI DOM update async hota hai */
  async function ensureDobBypassed(uiSel, log, tries) {
    if (isDobBypassed()) return true;
    const n = tries || 4;
    for (let i = 0; i < n; i++) {
      await tryUidaiModeSwitch(uiSel, log);
      if (isDobBypassed()) return true;
      await new Promise((r) => setTimeout(r, 600));
    }
    return isDobBypassed();
  }

  async function prepareSubmitAsync(uiSel, log) {
    await ensureDobBypassed(uiSel, log, 4);
    neutralizeEmail(log);
    enableOtpButtons();
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
  };
});
