const STORAGE_KEY = 'astikHelperEnabled';

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ [STORAGE_KEY]: false });
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== 'BADGE_UPDATE') return;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0]?.id;
    if (tabId) updateBadge(tabId, message.enabled);
  });
});

function updateBadge(tabId, enabled) {
  chrome.action.setBadgeText({
    tabId,
    text: enabled ? 'ON' : '',
  });
  chrome.action.setBadgeBackgroundColor({
    tabId,
    color: enabled ? '#0a7a2f' : '#666666',
  });
}
