/**
 * Astik Helper — myAadhaar Retrieve form modifier
 * Hides Date of Birth and switches to Mobile / Email verification mode.
 */

const STORAGE_KEY = 'astikHelperEnabled';
const HIDDEN_CLASS = 'astik-helper-hidden';
const ACTIVE_CLASS = 'astik-helper-active';

let enabled = false;
let observer = null;

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
  const matLabel = el.closest('mat-form-field, .mat-mdc-form-field')?.querySelector('mat-label, label');
  if (matLabel) return matLabel.textContent;
  const parentLabel = el.closest('label');
  if (parentLabel) return parentLabel.textContent;
  return '';
}

function findFieldContainer(el) {
  return (
    el.closest(
      'mat-form-field, .mat-mdc-form-field, .form-group, .form-floating, .input-group, .field, .mb-3, .mb-4, .row > div, .col, .form-row'
    ) || el.parentElement
  );
}

function hideElement(el) {
  if (!el || el.classList.contains(HIDDEN_CLASS)) return;
  el.classList.add(HIDDEN_CLASS);
  el.setAttribute('data-astik-hidden', '1');
}

function showElement(el) {
  if (!el) return;
  el.classList.remove(HIDDEN_CLASS);
  el.removeAttribute('data-astik-hidden');
}

function findInputs() {
  const inputs = Array.from(
    document.querySelectorAll('input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]), textarea, select')
  );
  return inputs.filter((input) => input.offsetParent !== null || input.type === 'date');
}

function classifyField(input) {
  const combined = normalize(
    [
      input.name,
      input.id,
      input.type,
      input.placeholder,
      input.getAttribute('formcontrolname'),
      getLabelText(input),
    ].join(' ')
  );

  if (textMatches(combined, ['date of birth', 'dateofbirth', 'dob', 'birth date', 'birthdate']) || input.type === 'date') {
    return 'dob';
  }
  if (textMatches(combined, ['mobile', 'phone', 'contact number', 'mobileno', 'mobile number'])) {
    return 'mobile';
  }
  if (textMatches(combined, ['email', 'e-mail', 'mail id', 'emailid'])) {
    return 'email';
  }
  if (textMatches(combined, ['name as per aadhaar', 'enter name', 'full name', 'aadhaar name', 'name'])) {
    return 'name';
  }
  if (textMatches(combined, ['captcha', 'security code'])) {
    return 'captcha';
  }
  return 'other';
}

function clickEmailToggle() {
  const candidates = Array.from(
    document.querySelectorAll('a, button, span, label, p, div, mat-radio-button, .mat-radio-label')
  );

  for (const node of candidates) {
    const text = normalize(node.textContent);
    if (!text || text.length > 80) continue;

    const isEmailToggle =
      text.includes('enter email') ||
      text.includes('or enter email') ||
      text.includes('email address') ||
      text === 'email' ||
      (text.includes('email') && text.includes('or'));

    if (isEmailToggle && node.offsetParent !== null) {
      node.click();
      return true;
    }
  }
  return false;
}

function revealEmailField(emailInput) {
  if (!emailInput) return;
  showElement(emailInput);
  const container = findFieldContainer(emailInput);
  showElement(container);
  container?.querySelectorAll('[data-astik-hidden]').forEach(showElement);
}

function hideDobFields() {
  const inputs = findInputs();
  inputs.forEach((input) => {
    if (classifyField(input) === 'dob') {
      hideElement(findFieldContainer(input));
      input.disabled = true;
      input.removeAttribute('required');
    }
  });

  document.querySelectorAll('label, mat-label, .form-label, legend').forEach((label) => {
    if (textMatches(label.textContent, ['date of birth', 'dob', 'birth date'])) {
      hideElement(findFieldContainer(label) || label);
    }
  });
}

function ensureMobileEmailMode() {
  clickEmailToggle();

  const inputs = findInputs();
  let emailInput = null;

  inputs.forEach((input) => {
    const kind = classifyField(input);
    if (kind === 'email') emailInput = input;
  });

  if (emailInput) {
    revealEmailField(emailInput);
  }

  inputs.forEach((input) => {
    const kind = classifyField(input);
    if (kind === 'mobile' || kind === 'email') {
      showElement(findFieldContainer(input));
      input.disabled = false;
    }
  });
}

function restoreForm() {
  document.querySelectorAll('[data-astik-hidden]').forEach((el) => {
    showElement(el);
  });

  findInputs().forEach((input) => {
    input.disabled = false;
  });
}

function applyMode() {
  if (!window.location.href.includes('uidai.gov.in')) return;

  if (enabled) {
    document.documentElement.classList.add(ACTIVE_CLASS);
    hideDobFields();
    ensureMobileEmailMode();
  } else {
    document.documentElement.classList.remove(ACTIVE_CLASS);
    restoreForm();
  }
}

function startObserver() {
  if (observer) observer.disconnect();
  observer = new MutationObserver(() => {
    if (enabled) applyMode();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

function setEnabled(value) {
  enabled = Boolean(value);
  applyMode();
}

chrome.storage.local.get([STORAGE_KEY], (result) => {
  enabled = Boolean(result[STORAGE_KEY]);
  applyMode();
  startObserver();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'GET_STATUS') {
    sendResponse({ enabled, url: window.location.href });
    return true;
  }

  if (message?.type === 'SET_ENABLED') {
    setEnabled(message.enabled);
    chrome.storage.local.set({ [STORAGE_KEY]: enabled });
    sendResponse({ enabled });
    return true;
  }

  if (message?.type === 'TOGGLE') {
    setEnabled(!enabled);
    chrome.storage.local.set({ [STORAGE_KEY]: enabled });
    sendResponse({ enabled });
    return true;
  }

  if (message?.type === 'APPLY_NOW') {
    applyMode();
    sendResponse({ enabled });
    return true;
  }
});
