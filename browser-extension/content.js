/**
 * Astik Helper content script
 */
const STORAGE_KEY = 'astikHelperEnabled';
const FAB_ID = 'astik-helper-fab';

let enabled = false;
let observer = null;
let retryTimer = null;

function ensureFab() {
  if (!/uidai\.gov\.in/i.test(window.location.href)) return;

  let fab = document.getElementById(FAB_ID);
  if (!fab) {
    fab = document.createElement('button');
    fab.id = FAB_ID;
    fab.type = 'button';
    fab.textContent = 'Astik: DOB Hide OFF';
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
  fab.textContent = enabled ? 'Astik: DOB Hide ON' : 'Astik: DOB Hide OFF';
  fab.classList.toggle('is-on', enabled);
}

function applyMode() {
  if (!window.AstikHelperCore) return;
  if (!window.location.href.includes('uidai.gov.in')) return;

  ensureFab();
  window.AstikHelperCore.applyMode(enabled);
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

function boot() {
  chrome.storage.local.get([STORAGE_KEY], (result) => {
    enabled = Boolean(result[STORAGE_KEY]);
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
      url: window.location.href,
      dobVisible: window.AstikHelperCore?.isDobStillVisible?.() ?? null,
    });
    return true;
  }

  if (message?.type === 'SET_ENABLED') {
    setEnabled(message.enabled);
    chrome.storage.local.set({ [STORAGE_KEY]: enabled });
    sendResponse({ enabled, dobVisible: window.AstikHelperCore?.isDobStillVisible?.() });
    return true;
  }

  if (message?.type === 'TOGGLE') {
    setEnabled(!enabled);
    chrome.storage.local.set({ [STORAGE_KEY]: enabled });
    sendResponse({ enabled, dobVisible: window.AstikHelperCore?.isDobStillVisible?.() });
    return true;
  }

  if (message?.type === 'APPLY_NOW') {
    applyMode();
    sendResponse({ enabled, dobVisible: window.AstikHelperCore?.isDobStillVisible?.() });
    return true;
  }
});
