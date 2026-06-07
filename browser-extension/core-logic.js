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
    if (textMatches(combined, ['mobile', 'phone', 'mobileno', 'mobile number', 'मोबाइल'])) return 'mobile';
    if (textMatches(combined, ['email', 'e-mail', 'mail id', 'emailid', 'ईमेल'])) return 'email';
    return 'other';
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
      input.disabled = true;
      input.removeAttribute('required');
      input.value = '';
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

  function applyMode(enabled) {
    if (enabled) {
      document.documentElement.classList.add(ACTIVE_CLASS);
      clickEmailToggle();
      hideDobFields();
      ensureMobileEmailMode();
      hideDobFields();
    } else {
      document.documentElement.classList.remove(ACTIVE_CLASS);
      restoreForm();
    }
    return { enabled, dobVisible: isDobStillVisible() };
  }

  return {
    HIDDEN_CLASS,
    ACTIVE_CLASS,
    FAB_ID,
    applyMode,
    isDobStillVisible,
    hideDobFields,
    clickEmailToggle,
    classifyField,
  };
});
