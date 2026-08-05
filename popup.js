(() => {
  'use strict';

  const toggle = document.getElementById('enabledToggle');
  const statusCard = document.querySelector('.status-card');
  const statusTitle = document.getElementById('statusTitle');
  const statusText = document.getElementById('statusText');
  const blockedCount = document.getElementById('blockedCount');
  const resetStats = document.getElementById('resetStats');

  function renderEnabled(enabled) {
    const isEnabled = enabled !== false;

    toggle.checked = isEnabled;
    statusCard.classList.toggle('is-paused', !isEnabled);
    statusTitle.textContent = isEnabled ? 'Shield is active' : 'Shield is paused';
    statusText.textContent = isEnabled ? 'Skipping YouTube ads' : "Ads won't be skipped";
  }

  async function loadState() {
    const sync = await chrome.storage.sync.get({ enabled: true });
    const local = await chrome.storage.local.get({ blockedCount: 0 });

    renderEnabled(sync.enabled);
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
      renderEnabled(changes.enabled.newValue);
    }
  });

  void loadState();
})();
