/**
 * Shared DOM logic for Astik Helper (extension + userscript + tests)
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.AstikHelperCore = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const HIDDEN_CLASS = 'astik-helper-hidden';
  const ACTIVE_CLASS = 'astik-helper-active';
  const FAB_ID = 'astik-helper-fab';
  const TOAST_ID = 'astik-helper-toast';

  const DOB_PATTERNS = [
    'date of birth',
    'enter date of birth',
    'dateofbirth',
    'dob',
    'birth date',
    'birthdate',
    'जन्म तिथि',
    'जन्मतिथि',
  ];

  const EMAIL_TOGGLE_PATTERNS = [
    'enter email',
    'or enter email',
    'email address',
    'or email',
    'ईमेल',
  ];

  const NAME_PATTERNS = [
    'name as per aadhaar',
    'enter name as per',
    'enter name',
    'full name',
    'aadhaar name',
    'resident name',
    'नाम',
  ];

  const DEFAULT_FALLBACK_NAME = 'Mr';

  function normalize(text) {
    return (text || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function textMatches(text, patterns) {
    const value = normalize(text);
    return patterns.some((pattern) => value.includes(pattern));
  }

  function getLabelText(el) {
    if (!el) return '';
    const id = el.id;
    if (id) {
      const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (label) return label.textContent;
    }
    const aria = el.getAttribute('aria-label');
    if (aria) return aria;
    const placeholder = el.getAttribute('placeholder');
    if (placeholder) return placeholder;
    const matLabel = el.closest('mat-form-field, .mat-mdc-form-field, .form-floating')?.querySelector(
      'mat-label, label, .form-label'
    );
    if (matLabel) return matLabel.textContent;
    return '';
  }

  function findFieldContainer(el) {
    if (!el) return null;
    return (
      el.closest(
        'mat-form-field, .mat-mdc-form-field, .mat-form-field, .form-group, .form-floating, .input-group, .field, .form-field, .mb-3, .mb-4, .row > div, .col, .form-row, li, p, div'
      ) || el.parentElement
    );
  }

  function hardHide(el) {
    if (!el || el.id === FAB_ID || el.closest(`#${FAB_ID}`)) return;
    el.classList.add(HIDDEN_CLASS);
    el.setAttribute('data-astik-hidden', '1');
    el.style.setProperty('display', 'none', 'important');
    el.style.setProperty('visibility', 'hidden', 'important');
    el.style.setProperty('height', '0', 'important');
    el.style.setProperty('margin', '0', 'important');
    el.style.setProperty('padding', '0', 'important');
    el.style.setProperty('overflow', 'hidden', 'important');
    el.style.setProperty('pointer-events', 'none', 'important');
  }

  function showElement(el) {
    if (!el) return;
    el.classList.remove(HIDDEN_CLASS);
    el.removeAttribute('data-astik-hidden');
    ['display', 'visibility', 'height', 'margin', 'padding', 'overflow', 'pointer-events'].forEach((prop) => {
      el.style.removeProperty(prop);
    });
  }

  function getAllInputs() {
    return Array.from(
      document.querySelectorAll(
        'input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]), textarea, select'
      )
    );
  }

  function classifyField(input) {
    const combined = normalize(
      [
        input.name,
        input.id,
        input.type,
        input.placeholder,
        input.getAttribute('formcontrolname'),
        input.getAttribute('ng-reflect-name'),
        getLabelText(input),
      ].join(' ')
    );

    if (
      textMatches(combined, DOB_PATTERNS) ||
      input.type === 'date' ||
      /datepicker|dob|birth/i.test(input.className) ||
      /dob|birth|dateofbirth/i.test(input.getAttribute('formcontrolname') || '')
    ) {
      return 'dob';
    }
    if (textMatches(combined, NAME_PATTERNS) || /fullname|full_name|residentname|customername/i.test(input.getAttribute('formcontrolname') || '')) {
      return 'name';
    }
    if (textMatches(combined, ['mobile', 'phone', 'mobileno', 'mobile number', 'मोबाइल'])) return 'mobile';
    if (textMatches(combined, ['email', 'e-mail', 'mail id', 'emailid', 'ईमेल'])) return 'email';
    return 'other';
  }

  function getNameInputs() {
    return getAllInputs().filter((input) => classifyField(input) === 'name');
  }

  function dispatchInputEvents(input) {
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function relaxNameValidation(input) {
    input.removeAttribute('required');
    input.setAttribute('aria-required', 'false');
    input.removeAttribute('minlength');
    input.setCustomValidity('');

    const container = findFieldContainer(input);
    if (container) {
      container.querySelectorAll('mat-error, .mat-mdc-form-field-error, .error, .invalid-feedback').forEach((node) => {
        hardHide(node);
      });
      container.classList.remove('mat-form-field-invalid', 'ng-invalid', 'mat-mdc-form-field-invalid');
    }

    input.classList.remove('ng-invalid', 'is-invalid');
    if (!input.getAttribute('placeholder')?.includes('Mr')) {
      input.setAttribute('placeholder', 'Mr ya apna naam likho');
    }
    input.setAttribute('data-astik-name-optional', '1');
  }

  function fillNameIfEmpty(input, fallbackName) {
    const value = (input.value || '').trim();
    if (!value) {
      input.value = fallbackName || DEFAULT_FALLBACK_NAME;
      dispatchInputEvents(input);
    }
  }

  function hookSendOtpButtons(fallbackName) {
    document.querySelectorAll('button, input[type="submit"], a, [role="button"]').forEach((btn) => {
      if (btn.dataset.astikOtpHooked) return;

      const text = normalize(btn.textContent || btn.value || '');
      if (!text.includes('send otp') && !text.includes('otp') && !text.includes('request otp')) return;

      btn.dataset.astikOtpHooked = '1';
      btn.addEventListener(
        'click',
        () => {
          prepareForOtpSubmit(fallbackName);
        },
        true
      );
    });
  }

  function makeNameOptional(fallbackName) {
    getNameInputs().forEach((input) => {
      relaxNameValidation(input);
      showElement(findFieldContainer(input));
      showElement(input);
      input.disabled = false;
    });

    document.querySelectorAll('mat-form-field, .mat-mdc-form-field, label, mat-label').forEach((node) => {
      const text = normalize(node.textContent || '');
      if (!textMatches(text, NAME_PATTERNS)) return;
      if (text.length > 120) return;

      const label = node.querySelector('mat-label, label');
      if (label && !label.textContent.includes('(optional)')) {
        label.textContent = label.textContent.replace(/\s*\(optional\)\s*$/i, '') + ' (optional)';
      }
    });

    hookSendOtpButtons(fallbackName);
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

  function relaxHiddenDobInputs() {
    getAllInputs().forEach((input) => {
      if (classifyField(input) !== 'dob') return;
      input.disabled = false;
      input.removeAttribute('required');
      input.setAttribute('aria-required', 'false');
      input.setCustomValidity('');
      input.removeAttribute('readonly');
    });
  }

  function relaxAllVisibleInputs() {
    getAllInputs().forEach((input) => {
      input.disabled = false;
      input.setCustomValidity('');
      const container = findFieldContainer(input);
      container?.classList.remove('mat-form-field-invalid', 'ng-invalid', 'mat-mdc-form-field-invalid');
      input.classList.remove('ng-invalid', 'is-invalid');
    });
  }

  function prepareForOtpSubmit(fallbackName) {
    clickEmailToggle();
    relaxHiddenDobInputs();
    relaxAllVisibleInputs();
    getNameInputs().forEach((input) => fillNameIfEmpty(input, fallbackName));
    enableSendOtpButtons();
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
          const clone = response.clone();
          const body = await clone.text();
          if (body && body.length < 500) {
            showToast('UIDAI response: ' + body.slice(0, 180), response.ok ? 'ok' : 'error');
          } else if (!response.ok) {
            showToast('UIDAI request failed: ' + response.status, 'error');
          }
        } catch (_error) {
          // ignore parse issues
        }
      }

      return response;
    };

    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this.__astikUrl = String(url || '');
      return originalOpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function (...args) {
      this.addEventListener('load', function () {
        const url = this.__astikUrl || '';
        if (!/uidai|otp|retrieve|aadhaar/i.test(url)) return;
        const body = (this.responseText || '').slice(0, 180);
        if (body) {
          showToast('UIDAI response: ' + body, this.status >= 200 && this.status < 300 ? 'ok' : 'error');
        }
      });
      return originalSend.apply(this, args);
    };
  }

  function hideContainerForInput(input) {
    let container = findFieldContainer(input);
    for (let depth = 0; depth < 5 && container; depth += 1) {
      const text = normalize(container.textContent || '').slice(0, 180);
      const hasDob = textMatches(text, DOB_PATTERNS);
      const compact =
        container.matches('mat-form-field, .mat-mdc-form-field, .form-group, .dob-field') ||
        (hasDob && text.length < 120);
      if (compact && hasDob) {
        hardHide(container);
        return;
      }
      container = container.parentElement;
    }
    hardHide(findFieldContainer(input));
  }

  function hideDobByTextScan() {
    document
      .querySelectorAll('mat-form-field, .mat-mdc-form-field, .form-group, label, mat-label, .form-label, div, span')
      .forEach((node) => {
        const text = normalize(node.textContent || '');
        if (!textMatches(text, DOB_PATTERNS)) return;
        if (text.length > 120) return;
        if (textMatches(text, ['mobile number', 'captcha', 'name as per'])) return;
        hardHide(findFieldContainer(node) || node);
      });
  }

  function clickEmailToggle() {
    const candidates = Array.from(
      document.querySelectorAll('a, button, span, label, p, div, mat-radio-button, .mat-radio-label, input[type="radio"]')
    );

    for (const node of candidates) {
      const text = normalize(node.textContent || node.value || '');
      if (!text || text.length > 80) continue;
      if (textMatches(text, EMAIL_TOGGLE_PATTERNS)) {
        node.click();
        return true;
      }
    }
    return false;
  }

  function hideDobFields() {
    getAllInputs().forEach((input) => {
      if (classifyField(input) !== 'dob') return;
      hideContainerForInput(input);
      input.removeAttribute('required');
      input.setAttribute('aria-required', 'false');
      input.setCustomValidity('');
      input.disabled = false;
    });

    document.querySelectorAll('mat-datepicker, .mat-datepicker-toggle, .mat-mdc-datepicker-toggle').forEach(hardHide);
    hideDobByTextScan();
  }

  function ensureMobileEmailMode() {
    clickEmailToggle();
    getAllInputs().forEach((input) => {
      const kind = classifyField(input);
      if (kind === 'mobile' || kind === 'email') {
        showElement(findFieldContainer(input));
        showElement(input);
        input.disabled = false;
      }
    });
  }

  function restoreForm() {
    document.querySelectorAll('[data-astik-hidden]').forEach(showElement);
    getAllInputs().forEach((input) => {
      input.disabled = false;
    });
  }

  function isDobStillVisible() {
    return getAllInputs().some((input) => {
      if (classifyField(input) !== 'dob') return false;
      const container = findFieldContainer(input);
      if (!container) return false;
      const style = window.getComputedStyle(container);
      return style.display !== 'none' && style.visibility !== 'hidden' && !container.classList.contains(HIDDEN_CLASS);
    });
  }

  function applyMode(enabled, options) {
    const opts = options || {};
    const nameOptional = opts.nameOptional !== false;
    const fallbackName = (opts.fallbackName || DEFAULT_FALLBACK_NAME).trim() || DEFAULT_FALLBACK_NAME;

    if (enabled) {
      document.documentElement.classList.add(ACTIVE_CLASS);
      hookApiResponses();
      clickEmailToggle();
      hideDobFields();
      ensureMobileEmailMode();
      hideDobFields();
      relaxHiddenDobInputs();
      enableSendOtpButtons();
      if (nameOptional) {
        makeNameOptional(fallbackName);
      }
      hookSendOtpButtons(fallbackName);
    } else {
      document.documentElement.classList.remove(ACTIVE_CLASS);
      restoreForm();
    }

    return {
      enabled,
      nameOptional,
      fallbackName,
      dobVisible: isDobStillVisible(),
      nameInputs: getNameInputs().length,
    };
  }

  return {
    HIDDEN_CLASS,
    ACTIVE_CLASS,
    FAB_ID,
    DEFAULT_FALLBACK_NAME,
    applyMode,
    isDobStillVisible,
    hideDobFields,
    clickEmailToggle,
    classifyField,
    makeNameOptional,
    getNameInputs,
    fillNameIfEmpty,
  };
});
