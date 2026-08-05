(() => {
  'use strict';

  const toggle = document.getElementById('enabledToggle');
  const statusText = document.getElementById('statusText');
  const blockedCount = document.getElementById('blockedCount');
  const resetStats = document.getElementById('resetStats');

  function renderEnabled(enabled) {
    toggle.checked = enabled;
    statusText.textContent = enabled ? 'Enabled' : 'Paused';
  }

  async function loadState() {
    const sync = await chrome.storage.sync.get({ enabled: true });
    const local = await chrome.storage.local.get({ blockedCount: 0 });

    renderEnabled(sync.enabled !== false);
    blockedCount.textContent = String(local.blockedCount || 0);
  }

  toggle.addEventListener('change', async () => {
    await chrome.storage.sync.set({ enabled: toggle.checked });
    renderEnabled(toggle.checked);
  });

  resetStats.addEventListener('click', async () => {
    await chrome.storage.local.set({ blockedCount: 0 });
    blockedCount.textContent = '0';
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.blockedCount) {
      blockedCount.textContent = String(changes.blockedCount.newValue || 0);
    }
    if (areaName === 'sync' && changes.enabled) {
      renderEnabled(changes.enabled.newValue !== false);
    }
  });

  void loadState();
})();
