const statusEl = document.getElementById('status');
const toggleEl = document.getElementById('toggle');
const nameToggleEl = document.getElementById('nameToggle');
const fallbackNameEl = document.getElementById('fallbackName');
const applyBtn = document.getElementById('applyBtn');

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = `status ${kind}`;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function sendToTab(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (_error) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['core-logic.js', 'content.js'],
    });
    return await chrome.tabs.sendMessage(tabId, message);
  }
}

async function refreshState() {
  const tab = await getActiveTab();
  if (!tab?.id) {
    setStatus('Active tab nahi mili.', 'error');
    toggleEl.disabled = true;
    nameToggleEl.disabled = true;
    applyBtn.disabled = true;
    return;
  }

  if (!tab.url?.includes('uidai.gov.in')) {
    setStatus('UIDAI page par nahi ho. Retrieve page kholo.', 'error');
    toggleEl.disabled = true;
    nameToggleEl.disabled = true;
    applyBtn.disabled = true;
    return;
  }

  toggleEl.disabled = false;
  nameToggleEl.disabled = false;
  applyBtn.disabled = false;

  const response = await sendToTab(tab.id, { type: 'GET_STATUS' });
  toggleEl.checked = Boolean(response?.enabled);
  nameToggleEl.checked = response?.nameOptional !== false;
  fallbackNameEl.value = response?.fallbackName || 'Mr';

  const on = Boolean(response?.enabled);
  setStatus(
    on
      ? `ON — DOB hidden${response?.nameOptional !== false ? ', Name optional (Mr OK)' : ''}`
      : 'OFF — normal form',
    on ? 'on' : 'off'
  );

  chrome.runtime.sendMessage({ type: 'BADGE_UPDATE', enabled: on });
}

toggleEl.addEventListener('change', async () => {
  const tab = await getActiveTab();
  if (!tab?.id) return;
  await sendToTab(tab.id, { type: 'SET_ENABLED', enabled: toggleEl.checked });
  await refreshState();
});

nameToggleEl.addEventListener('change', async () => {
  const tab = await getActiveTab();
  if (!tab?.id) return;
  await sendToTab(tab.id, { type: 'SET_NAME_OPTIONAL', nameOptional: nameToggleEl.checked });
  await refreshState();
});

fallbackNameEl.addEventListener('change', async () => {
  const tab = await getActiveTab();
  if (!tab?.id) return;
  await sendToTab(tab.id, { type: 'SET_FALLBACK_NAME', fallbackName: fallbackNameEl.value || 'Mr' });
  await refreshState();
});

applyBtn.addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (!tab?.id) return;
  await sendToTab(tab.id, { type: 'APPLY_NOW' });
  setStatus('Form dubara apply ho gaya.', toggleEl.checked ? 'on' : 'off');
});

refreshState();
