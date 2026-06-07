// ==UserScript==
// @name         Rebel Adhar
// @namespace    https://github.com/ujjwalrebel53-wq/SpinPlay99
// @version      1.2.1
// @description  DOB hide + Name optional (Mr) + Mobile/Email mode
// @match        https://myaadhaar.uidai.gov.in/*
// @match        https://*.uidai.gov.in/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  const STORAGE_KEY = 'astikHelperEnabled';
  const NAME_OPTIONAL_KEY = 'astikHelperNameOptional';
  const FALLBACK_NAME_KEY = 'astikHelperFallbackName';
  const FAB_ID = 'astik-helper-fab';
  const TOAST_ID = 'astik-helper-toast';

  const DOB_PATTERNS = ['date of birth', 'enter date of birth', 'dateofbirth', 'dob', 'birth date', 'जन्म तिथि'];
  const NAME_PATTERNS = ['name as per aadhaar', 'enter name as per', 'enter name', 'full name', 'aadhaar name'];
  const EMAIL_TOGGLE_PATTERNS = ['enter email', 'or enter email', 'email address', 'or email'];

  let enabled = localStorage.getItem(STORAGE_KEY) === '1';
  let nameOptional = localStorage.getItem(NAME_OPTIONAL_KEY) !== '0';
  let fallbackName = (localStorage.getItem(FALLBACK_NAME_KEY) || 'Mr').trim() || 'Mr';

  function normalize(text) {
    return (text || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function textMatches(text, patterns) {
    const value = normalize(text);
    return patterns.some((p) => value.includes(p));
  }

  function hardHide(el) {
    if (!el || el.id === FAB_ID) return;
    el.setAttribute('data-astik-hidden', '1');
    el.style.cssText =
      'display:none!important;visibility:hidden!important;height:0!important;margin:0!important;padding:0!important;overflow:hidden!important;pointer-events:none!important;opacity:0!important;';
  }

  function showElement(el) {
    if (!el) return;
    el.removeAttribute('data-astik-hidden');
    el.style.cssText = '';
  }

  function getAllInputs() {
    return Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]), textarea, select'));
  }

  function getLabelText(el) {
    const matLabel = el.closest('mat-form-field, .mat-mdc-form-field')?.querySelector('mat-label, label');
    return matLabel?.textContent || el.getAttribute('placeholder') || el.getAttribute('aria-label') || '';
  }

  function findContainer(el) {
    return el.closest('mat-form-field, .mat-mdc-form-field, .form-group, .mb-3, .mb-4, div') || el.parentElement;
  }

  function classify(input) {
    const info = normalize(
      [input.name, input.id, input.placeholder, input.getAttribute('formcontrolname'), getLabelText(input)].join(' ')
    );
    if (textMatches(info, DOB_PATTERNS) || input.type === 'date' || /dob|birth/i.test(input.getAttribute('formcontrolname') || '')) return 'dob';
    if (textMatches(info, NAME_PATTERNS) || /fullname|residentname/i.test(input.getAttribute('formcontrolname') || '')) return 'name';
    return 'other';
  }

  function showToast(message, kind) {
    let toast = document.getElementById(TOAST_ID);
    if (!toast) {
      toast = document.createElement('div');
      toast.id = TOAST_ID;
      toast.style.cssText =
        'position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483647;padding:12px 14px;border-radius:10px;font:600 12px/1.4 system-ui;color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.25);';
      document.documentElement.appendChild(toast);
    }
    toast.style.background = kind === 'error' ? '#b42318' : kind === 'ok' ? '#0a7a2f' : '#0052a5';
    toast.textContent = message;
  }

  function enableSendOtpButtons() {
    document.querySelectorAll('button, input[type="submit"], a, [role="button"]').forEach((btn) => {
      const text = normalize(btn.textContent || btn.value || '');
      if (!text.includes('send otp') && !text.includes('request otp') && !text.includes('otp')) return;
      btn.disabled = false;
      btn.removeAttribute('disabled');
      btn.classList.remove('mat-button-disabled', 'mat-mdc-button-disabled', 'disabled');
      btn.style.pointerEvents = 'auto';
      btn.style.opacity = '1';
    });
  }

  function hookApiResponses() {
    if (window.__astikApiHooked) return;
    window.__astikApiHooked = true;

    const originalFetch = window.fetch.bind(window);
    window.fetch = async function (...args) {
      const response = await originalFetch(...args);
      const url = String(args[0] || '');
      if (/uidai|otp|retrieve|aadhaar/i.test(url)) {
        try {
          const body = await response.clone().text();
          if (body) showToast('UIDAI: ' + body.slice(0, 180), response.ok ? 'ok' : 'error');
        } catch (_e) {}
      }
      return response;
    };
  }

  function dispatchInputEvents(input) {
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function prepareForOtpSubmit() {
    clickEmailToggle();
    getAllInputs().forEach((input) => {
      input.disabled = false;
      input.setCustomValidity('');
      if (classify(input) === 'dob') {
        input.removeAttribute('required');
        input.setAttribute('aria-required', 'false');
      }
      if (classify(input) === 'name' && nameOptional) {
        input.removeAttribute('required');
        input.setCustomValidity('');
        if (!(input.value || '').trim()) {
          input.value = fallbackName;
          dispatchInputEvents(input);
        }
      }
    });
    enableSendOtpButtons();
  }

  function makeNameOptional() {
    getAllInputs()
      .filter((input) => classify(input) === 'name')
      .forEach((input) => {
        input.removeAttribute('required');
        input.setAttribute('aria-required', 'false');
        input.removeAttribute('minlength');
        input.setCustomValidity('');
        input.setAttribute('placeholder', 'Mr ya apna naam likho');
        showElement(findContainer(input));
        showElement(input);

        const container = findContainer(input);
        container?.querySelectorAll('mat-error, .mat-mdc-form-field-error').forEach(hardHide);
      });

    document.querySelectorAll('button, input[type="submit"], a, [role="button"]').forEach((btn) => {
      if (btn.dataset.astikOtpHooked) return;
      const text = normalize(btn.textContent || btn.value || '');
      if (!text.includes('send otp') && !text.includes('otp')) return;
      btn.dataset.astikOtpHooked = '1';
      btn.addEventListener('click', () => prepareForOtpSubmit(), true);
    });
  }

  function clickEmailToggle() {
    for (const node of document.querySelectorAll('a, button, span, label, p, div')) {
      const text = normalize(node.textContent || '');
      if (text.length > 80) continue;
      if (textMatches(text, EMAIL_TOGGLE_PATTERNS)) {
        node.click();
        return true;
      }
    }
    return false;
  }

  function hideDob() {
    clickEmailToggle();
    getAllInputs().forEach((input) => {
      if (classify(input) !== 'dob') return;
      hardHide(findContainer(input));
      input.removeAttribute('required');
      input.setAttribute('aria-required', 'false');
      input.setCustomValidity('');
      input.disabled = false;
    });

    document.querySelectorAll('mat-form-field, .mat-mdc-form-field, label, mat-label, span, div').forEach((node) => {
      const text = normalize(node.textContent || '');
      if (textMatches(text, DOB_PATTERNS) && text.length < 100 && !text.includes('mobile')) {
        hardHide(findContainer(node));
      }
    });
  }

  function restore() {
    document.querySelectorAll('[data-astik-hidden]').forEach(showElement);
    getAllInputs().forEach((input) => {
      input.disabled = false;
    });
  }

  function apply() {
    if (!/uidai\.gov\.in/i.test(location.href)) return;
    ensureFab();

    if (enabled) {
      document.documentElement.classList.add('astik-helper-active');
      hookApiResponses();
      hideDob();
      if (nameOptional) makeNameOptional();
      enableSendOtpButtons();
    } else {
      document.documentElement.classList.remove('astik-helper-active');
      restore();
    }
    updateFab();
  }

  function ensureFab() {
    if (document.getElementById(FAB_ID)) return;

    const fab = document.createElement('button');
    fab.id = FAB_ID;
    fab.type = 'button';
    fab.style.cssText =
      'position:fixed;right:12px;bottom:88px;z-index:2147483647;border:none;border-radius:999px;padding:14px 18px;background:#b42318;color:#fff;font:700 13px system-ui;box-shadow:0 8px 24px rgba(0,0,0,.3);max-width:70vw;';
    fab.addEventListener('click', () => {
      enabled = !enabled;
      localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
      apply();
    });
    document.documentElement.appendChild(fab);

    const nameBtn = document.createElement('button');
    nameBtn.id = 'astik-helper-name-btn';
    nameBtn.type = 'button';
    nameBtn.style.cssText =
      'position:fixed;right:12px;bottom:150px;z-index:2147483647;border:none;border-radius:999px;padding:12px 14px;background:#0052a5;color:#fff;font:700 12px system-ui;box-shadow:0 8px 24px rgba(0,0,0,.3);';
    nameBtn.addEventListener('click', () => {
      nameOptional = !nameOptional;
      localStorage.setItem(NAME_OPTIONAL_KEY, nameOptional ? '1' : '0');
      if (enabled) apply();
      updateNameBtn();
    });
    document.documentElement.appendChild(nameBtn);
    updateNameBtn();
  }

  function updateNameBtn() {
    const btn = document.getElementById('astik-helper-name-btn');
    if (!btn) return;
    btn.textContent = nameOptional ? 'Name: Optional (Mr OK)' : 'Name: Required';
    btn.style.background = nameOptional ? '#0052a5' : '#6b7280';
  }

  function updateFab() {
    const fab = document.getElementById(FAB_ID);
    if (!fab) return;
    fab.textContent = enabled ? 'Rebel Adhar: ON' : 'Rebel Adhar: OFF';
    fab.style.background = enabled ? '#0a7a2f' : '#b42318';
  }

  apply();
  let n = 0;
  const timer = setInterval(() => {
    n += 1;
    if (enabled) {
      hideDob();
      if (nameOptional) makeNameOptional();
    }
    if (n >= 25) clearInterval(timer);
  }, 1000);

  new MutationObserver(() => {
    if (enabled) {
      hideDob();
      if (nameOptional) makeNameOptional();
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
