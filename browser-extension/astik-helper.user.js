// ==UserScript==
// @name         Astik Helper — myAadhaar DOB Hide
// @namespace    https://github.com/ujjwalrebel53-wq/SpinPlay99
// @version      1.1.0
// @description  Retrieve Aadhaar page par DOB hide + Mobile/Email mode (Kiwi friendly)
// @match        https://myaadhaar.uidai.gov.in/*
// @match        https://*.uidai.gov.in/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  const STORAGE_KEY = 'astikHelperEnabled';
  const FAB_ID = 'astik-helper-fab';

  const DOB_PATTERNS = [
    'date of birth',
    'enter date of birth',
    'dateofbirth',
    'dob',
    'birth date',
    'birthdate',
    'जन्म तिथि',
  ];

  const EMAIL_TOGGLE_PATTERNS = ['enter email', 'or enter email', 'email address', 'or email'];

  let enabled = localStorage.getItem(STORAGE_KEY) === '1';

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

  function isDobInput(input) {
    const info = normalize(
      [input.name, input.id, input.placeholder, input.getAttribute('formcontrolname'), getLabelText(input)].join(' ')
    );
    return textMatches(info, DOB_PATTERNS) || input.type === 'date' || /dob|birth/i.test(input.getAttribute('formcontrolname') || '');
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
      if (!isDobInput(input)) return;
      hardHide(findContainer(input));
      input.disabled = true;
      input.value = '';
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
      hideDob();
      setTimeout(hideDob, 500);
      setTimeout(hideDob, 1500);
      setTimeout(hideDob, 3000);
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
      'position:fixed;right:12px;bottom:88px;z-index:2147483647;border:none;border-radius:999px;padding:14px 18px;background:#b42318;color:#fff;font:700 14px system-ui;box-shadow:0 8px 24px rgba(0,0,0,.3);';
    fab.addEventListener('click', () => {
      enabled = !enabled;
      localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
      apply();
    });
    document.documentElement.appendChild(fab);
  }

  function updateFab() {
    const fab = document.getElementById(FAB_ID);
    if (!fab) return;
    fab.textContent = enabled ? 'DOB Hide: ON' : 'DOB Hide: OFF';
    fab.style.background = enabled ? '#0a7a2f' : '#b42318';
  }

  apply();
  let n = 0;
  const timer = setInterval(() => {
    n += 1;
    if (enabled) hideDob();
    if (n >= 25) clearInterval(timer);
  }, 1000);

  new MutationObserver(() => {
    if (enabled) hideDob();
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
