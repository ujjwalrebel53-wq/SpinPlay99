/**
 * Rebel Adhar content script — injects engine into PAGE context (Angular world).
 */
const STORAGE_KEY = 'rebelAdharEnabled';
const FAB_ID = 'rebel-adhar-fab';

let enabled = false;
let pageInjected = false;

function injectPageBundle() {
  if (pageInjected) return;
  pageInjected = true;
  const s = document.createElement('script');
  s.src = chrome.runtime.getURL('page-bundle.js');
  s.onload = () => s.remove();
  (document.documentElement || document.head).appendChild(s);
}

function syncStorageToLocal() {
  try {
    localStorage.setItem('rebelAdharOn', enabled ? '1' : '0');
  } catch (_e) {}
}

function postPage(cmd, extra) {
  const msg = { rebel: 1, type: 'cmd', cmd };
  if (extra) Object.assign(msg, extra);
  window.postMessage(msg, '*');
}

function ensureFab() {
  if (!/uidai\.gov\.in/i.test(location.href)) return;
  let fab = document.getElementById(FAB_ID);
  if (!fab) {
    fab = document.createElement('button');
    fab.id = FAB_ID;
    fab.style.cssText =
      'position:fixed;right:12px;bottom:88px;z-index:2147483647;border:none;border-radius:999px;padding:12px 16px;color:#fff;font:700 13px system-ui;box-shadow:0 8px 24px rgba(0,0,0,.28)';
    fab.onclick = () => {
      enabled = !enabled;
      chrome.storage.local.set({ [STORAGE_KEY]: enabled });
      apply();
    };
    document.documentElement.appendChild(fab);
  }
  fab.textContent = enabled ? 'Rebel Adhar: ON' : 'Rebel Adhar: OFF';
  fab.style.background = enabled ? '#0a7a2f' : '#b42318';
}

function apply() {
  injectPageBundle();
  syncStorageToLocal();
  ensureFab();
  if (enabled) postPage('boot');
  if (window.RebelAdharCore) window.RebelAdharCore.applyMode(enabled);
}

function boot() {
  injectPageBundle();
  chrome.storage.local.get([STORAGE_KEY], (r) => {
    enabled = Boolean(r[STORAGE_KEY]);
    syncStorageToLocal();
    apply();
  });
}

boot();

chrome.runtime.onMessage.addListener((msg, _s, res) => {
  if (msg?.type === 'GET_STATUS') {
    res({ enabled });
    return true;
  }
  if (msg?.type === 'SET_ENABLED') {
    enabled = Boolean(msg.enabled);
    apply();
    chrome.storage.local.set({ [STORAGE_KEY]: enabled });
    res({ enabled });
    return true;
  }
  if (msg?.type === 'APPLY_NOW') {
    postPage('apply');
    res({ enabled });
    return true;
  }
});
