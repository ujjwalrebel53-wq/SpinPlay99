/**
 * Astik Helper content script
 */
const STORAGE_KEY = 'astikHelperEnabled';
const NAME_OPTIONAL_KEY = 'astikHelperNameOptional';
const FALLBACK_NAME_KEY = 'astikHelperFallbackName';
const FAB_ID = 'astik-helper-fab';

let enabled = false;
let nameOptional = true;
let fallbackName = 'Mr';
let observer = null;
let retryTimer = null;

function getOptions() {
  return { nameOptional, fallbackName };
}

function ensureFab() {
  if (!/uidai\.gov\.in/i.test(window.location.href)) return;

  let fab = document.getElementById(FAB_ID);
  if (!fab) {
    fab = document.createElement('button');
    fab.id = FAB_ID;
    fab.type = 'button';
    fab.textContent = 'Astik: OFF';
    fab.addEventListener('click', () => {
      setEnabled(!enabled);
      chrome.storage.local.set({ [STORAGE_KEY]: enabled });
    });
    document.documentElement.appendChild(fab);
  }
  updateFab();
}

function updateFab() {
  const fab = document.getElementById(FAB_ID);
  if (!fab) return;

  if (!enabled) {
    fab.textContent = 'Astik: OFF';
    fab.classList.remove('is-on');
    return;
  }

  fab.textContent = nameOptional ? 'Astik: ON (Name optional)' : 'Astik: ON';
  fab.classList.add('is-on');
}

function applyMode() {
  if (!window.AstikHelperCore) return;
  if (!window.location.href.includes('uidai.gov.in')) return;

  ensureFab();
  window.AstikHelperCore.applyMode(enabled, getOptions());
  updateFab();
}

function scheduleRetries() {
  if (retryTimer) clearInterval(retryTimer);
  let attempts = 0;
  retryTimer = setInterval(() => {
    attempts += 1;
    applyMode();
    if (attempts >= 25) clearInterval(retryTimer);
  }, 1000);
}

function startObserver() {
  if (observer) observer.disconnect();
  observer = new MutationObserver(() => applyMode());
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

function setEnabled(value) {
  enabled = Boolean(value);
  applyMode();
  scheduleRetries();
}

function setNameOptional(value) {
  nameOptional = Boolean(value);
  applyMode();
  scheduleRetries();
}

function setFallbackName(value) {
  fallbackName = (value || 'Mr').trim() || 'Mr';
  applyMode();
}

function boot() {
  chrome.storage.local.get([STORAGE_KEY, NAME_OPTIONAL_KEY, FALLBACK_NAME_KEY], (result) => {
    enabled = Boolean(result[STORAGE_KEY]);
    nameOptional = result[NAME_OPTIONAL_KEY] !== false;
    fallbackName = (result[FALLBACK_NAME_KEY] || 'Mr').trim() || 'Mr';
    applyMode();
    startObserver();
    scheduleRetries();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'GET_STATUS') {
    sendResponse({
      enabled,
      nameOptional,
      fallbackName,
      url: window.location.href,
      dobVisible: window.AstikHelperCore?.isDobStillVisible?.() ?? null,
    });
    return true;
  }

  if (message?.type === 'SET_ENABLED') {
    setEnabled(message.enabled);
    chrome.storage.local.set({ [STORAGE_KEY]: enabled });
    sendResponse({ enabled, nameOptional, fallbackName });
    return true;
  }

  if (message?.type === 'SET_NAME_OPTIONAL') {
    setNameOptional(message.nameOptional);
    chrome.storage.local.set({ [NAME_OPTIONAL_KEY]: nameOptional });
    sendResponse({ enabled, nameOptional, fallbackName });
    return true;
  }

  if (message?.type === 'SET_FALLBACK_NAME') {
    setFallbackName(message.fallbackName);
    chrome.storage.local.set({ [FALLBACK_NAME_KEY]: fallbackName });
    sendResponse({ enabled, nameOptional, fallbackName });
    return true;
  }

  if (message?.type === 'TOGGLE') {
    setEnabled(!enabled);
    chrome.storage.local.set({ [STORAGE_KEY]: enabled });
    sendResponse({ enabled, nameOptional, fallbackName });
    return true;
  }

  if (message?.type === 'APPLY_NOW') {
    applyMode();
    sendResponse({ enabled, nameOptional, fallbackName });
    return true;
  }
});
