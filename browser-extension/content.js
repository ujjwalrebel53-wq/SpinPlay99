/**
 * Astik Helper content script
 */
const STORAGE_KEY = 'astikHelperEnabled';
const NAME_OPTIONAL_KEY = 'astikHelperNameOptional';
const FALLBACK_NAME_KEY = 'astikHelperFallbackName';
const FAB_ID = 'astik-helper-fab';
const LOG_PANEL_ID = 'rebel-adhar-log-panel';

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

  if (!document.getElementById(FAB_ID)) {
    const fab = document.createElement('button');
    fab.id = FAB_ID;
    fab.type = 'button';
    fab.textContent = 'Rebel Adhar: OFF';
    fab.addEventListener('click', () => {
      setEnabled(!enabled);
      chrome.storage.local.set({ [STORAGE_KEY]: enabled });
    });
    document.documentElement.appendChild(fab);
  }

  if (!document.getElementById('astik-helper-name-btn')) {
    const nameBtn = document.createElement('button');
    nameBtn.id = 'astik-helper-name-btn';
    nameBtn.type = 'button';
    nameBtn.textContent = 'Name: Optional';
    nameBtn.addEventListener('click', () => {
      setNameOptional(!nameOptional);
      chrome.storage.local.set({ [NAME_OPTIONAL_KEY]: nameOptional });
    });
    document.documentElement.appendChild(nameBtn);
  }

  if (!document.getElementById('astik-helper-logs-btn')) {
    const logsBtn = document.createElement('button');
    logsBtn.id = 'astik-helper-logs-btn';
    logsBtn.type = 'button';
    logsBtn.textContent = 'Logs';
    logsBtn.addEventListener('click', () => {
      const panel = document.getElementById(LOG_PANEL_ID);
      if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });
    document.documentElement.appendChild(logsBtn);
  }

  updateFab();
}

function updateFab() {
  const fab = document.getElementById(FAB_ID);
  const nameBtn = document.getElementById('astik-helper-name-btn');
  if (fab) {
    fab.textContent = enabled ? 'Rebel Adhar: ON' : 'Rebel Adhar: OFF';
    fab.classList.toggle('is-on', enabled);
  }
  if (nameBtn) {
    nameBtn.textContent = nameOptional ? 'Name: Optional (Mr OK)' : 'Name: Required';
    nameBtn.style.background = nameOptional ? '#0052a5' : '#6b7280';
  }
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
    if (enabled) applyMode();
    if (attempts >= 10) clearInterval(retryTimer);
  }, 1500);
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

function setNameOptional(value) {
  nameOptional = Boolean(value);
  applyMode();
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

  if (message?.type === 'APPLY_NOW') {
    applyMode();
    sendResponse({ enabled, nameOptional, fallbackName });
    return true;
  }
});
