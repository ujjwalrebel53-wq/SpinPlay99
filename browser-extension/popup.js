const statusEl = document.getElementById('status');
const toggleEl = document.getElementById('toggle');
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
      files: ['content.js'],
    });
    return await chrome.tabs.sendMessage(tabId, message);
  }
}

async function refreshState() {
  const tab = await getActiveTab();
  if (!tab?.id) {
    setStatus('Active tab nahi mili.', 'error');
    toggleEl.disabled = true;
    applyBtn.disabled = true;
    return;
  }

  if (!tab.url?.includes('uidai.gov.in')) {
    setStatus('UIDAI page par nahi ho. Retrieve page kholo.', 'error');
    toggleEl.disabled = true;
    applyBtn.disabled = true;
    return;
  }

  toggleEl.disabled = false;
  applyBtn.disabled = false;

  const response = await sendToTab(tab.id, { type: 'GET_STATUS' });
  toggleEl.checked = Boolean(response?.enabled);
  setStatus(
    response?.enabled ? 'ON — DOB hidden, Mobile/Email mode active' : 'OFF — normal form',
    response?.enabled ? 'on' : 'off'
  );

  chrome.runtime.sendMessage({
    type: 'BADGE_UPDATE',
    enabled: Boolean(response?.enabled),
  });
}

toggleEl.addEventListener('change', async () => {
  const tab = await getActiveTab();
  if (!tab?.id) return;

  const response = await sendToTab(tab.id, {
    type: 'SET_ENABLED',
    enabled: toggleEl.checked,
  });

  setStatus(
    response?.enabled ? 'ON — DOB hidden, Mobile/Email mode active' : 'OFF — normal form',
    response?.enabled ? 'on' : 'off'
  );

  chrome.runtime.sendMessage({
    type: 'BADGE_UPDATE',
    enabled: Boolean(response?.enabled),
  });
});

applyBtn.addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (!tab?.id) return;
  await sendToTab(tab.id, { type: 'APPLY_NOW' });
  setStatus('Form dubara apply ho gaya.', toggleEl.checked ? 'on' : 'off');
});

refreshState();
