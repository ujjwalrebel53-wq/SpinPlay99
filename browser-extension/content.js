/**
 * Astik Helper — myAadhaar Retrieve form modifier
 * Hides Date of Birth and switches to Mobile / Email verification mode.
 */

const STORAGE_KEY = 'astikHelperEnabled';
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

let enabled = false;
let observer = null;
let retryTimer = null;

function normalize(text) {
  return (text || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function textMatches(text, patterns) {
  const value = normalize(text);
  return patterns.some((pattern) => value.includes(pattern));
}

function isRetrievePage() {
  return /uidai\.gov\.in/i.test(window.location.href) && /retrieve|eid|uid/i.test(window.location.href);
}

function getLabelText(el) {
  if (!el) return '';

  const id = el.id;
  if (id) {
    const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (label) return label.textContent;
  }

  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    return labelledBy
      .split(/\s+/)
      .map((ref) => document.getElementById(ref)?.textContent || '')
      .join(' ');
  }

  const aria = el.getAttribute('aria-label');
  if (aria) return aria;

  const placeholder = el.getAttribute('placeholder');
  if (placeholder) return placeholder;

  const matLabel = el.closest('mat-form-field, .mat-mdc-form-field, .form-floating')?.querySelector(
    'mat-label, label, .form-label'
  );
  if (matLabel) return matLabel.textContent;

  const parentLabel = el.closest('label');
  if (parentLabel) return parentLabel.textContent;

  const prev = el.previousElementSibling;
  if (prev && /label|mat-label/i.test(prev.tagName + prev.className)) {
    return prev.textContent;
  }

  return '';
}

function findFieldContainer(el) {
  if (!el) return null;

  return (
    el.closest(
      [
        'mat-form-field',
        '.mat-mdc-form-field',
        '.mat-form-field',
        '.form-group',
        '.form-floating',
        '.input-group',
        '.field',
        '.form-field',
        '.mb-3',
        '.mb-4',
        '.row > div',
        '.col',
        '.form-row',
        '.uidai-field',
        '.input-field',
        'li',
        'p',
        'div',
      ].join(', ')
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
  el.style.removeProperty('display');
  el.style.removeProperty('visibility');
  el.style.removeProperty('height');
  el.style.removeProperty('margin');
  el.style.removeProperty('padding');
  el.style.removeProperty('overflow');
  el.style.removeProperty('pointer-events');
}

function getAllInputs() {
  return Array.from(
    document.querySelectorAll(
      'input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]), textarea, select, [contenteditable="true"]'
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
      input.getAttribute('data-testid'),
      input.className,
      getLabelText(input),
      input.closest('mat-form-field, .mat-mdc-form-field, .form-group, div')?.textContent?.slice(0, 120),
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

  if (textMatches(combined, ['mobile', 'phone', 'contact number', 'mobileno', 'mobile number', 'मोबाइल'])) {
    return 'mobile';
  }

  if (textMatches(combined, ['email', 'e-mail', 'mail id', 'emailid', 'ईमेल'])) {
    return 'email';
  }

  return 'other';
}

function hideContainerForInput(input) {
  let container = findFieldContainer(input);

  for (let depth = 0; depth < 4 && container; depth += 1) {
    const text = normalize(container.textContent || '').slice(0, 160);
    const hasDob = textMatches(text, DOB_PATTERNS);
    const hasOtherField =
      text.includes('mobile') || text.includes('captcha') || text.includes('name') || text.includes('email');

    if (hasDob && (!hasOtherField || container.matches('mat-form-field, .mat-mdc-form-field, .form-group'))) {
      hardHide(container);
      return;
    }

    container = container.parentElement;
  }

  hardHide(findFieldContainer(input));
}

function hideDobByTextScan() {
  const candidates = document.querySelectorAll(
    'mat-form-field, .mat-mdc-form-field, .form-group, .form-floating, label, mat-label, .form-label, div, span, p, li'
  );

  candidates.forEach((node) => {
    const ownText = normalize(node.childNodes.length <= 3 ? node.textContent : getLabelText(node) || node.textContent);
    if (!textMatches(ownText, DOB_PATTERNS)) return;
    if (textMatches(ownText, ['mobile number', 'captcha', 'name as per'])) return;

    const container = findFieldContainer(node) || node;
    hardHide(container);

  });
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

  document.querySelectorAll('label, mat-label, .form-label, legend, span, p').forEach((label) => {
    const text = normalize(label.textContent);
    if (textMatches(text, DOB_PATTERNS) && text.length < 80) {
      hardHide(findFieldContainer(label) || label);
    }
  });

  hideDobByTextScan();
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

function ensureMobileEmailMode() {
  clickEmailToggle();

  getAllInputs().forEach((input) => {
    const kind = classifyField(input);
    if (kind === 'mobile' || kind === 'email') {
      const container = findFieldContainer(input);
      showElement(container);
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

function ensureFab() {
  if (!isRetrievePage()) return;

  let fab = document.getElementById(FAB_ID);
  if (!fab) {
    fab = document.createElement('button');
    fab.id = FAB_ID;
    fab.type = 'button';
    fab.textContent = 'Astik: DOB Hide OFF';
    fab.addEventListener('click', () => {
      setEnabled(!enabled);
      chrome.storage.local.set({ [STORAGE_KEY]: enabled });
      updateFab();
    });
    document.documentElement.appendChild(fab);
  }

  updateFab();
}

function updateFab() {
  const fab = document.getElementById(FAB_ID);
  if (!fab) return;

  fab.textContent = enabled ? 'Astik: DOB Hide ON' : 'Astik: DOB Hide OFF';
  fab.classList.toggle('is-on', enabled);
}

function applyMode() {
  if (!window.location.href.includes('uidai.gov.in')) return;

  ensureFab();

  if (enabled) {
    document.documentElement.classList.add(ACTIVE_CLASS);
    hideDobFields();
    ensureMobileEmailMode();
  } else {
    document.documentElement.classList.remove(ACTIVE_CLASS);
    restoreForm();
  }

  updateFab();
}

function scheduleRetries() {
  if (retryTimer) clearInterval(retryTimer);

  let attempts = 0;
  retryTimer = setInterval(() => {
    attempts += 1;
    if (enabled) applyMode();
    if (attempts >= 20) clearInterval(retryTimer);
  }, 1000);
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
  scheduleRetries();
}

chrome.storage.local.get([STORAGE_KEY], (result) => {
  enabled = Boolean(result[STORAGE_KEY]);
  applyMode();
  startObserver();
  scheduleRetries();
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
