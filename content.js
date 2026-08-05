(() => {
  'use strict';

  const DEFAULTS = { enabled: true, blockedCount: 0 };
  let enabled = DEFAULTS.enabled;
  let lastCountAt = 0;

  function exposeEnabledState() {
    const root = document.documentElement;
    if (!root) return;

    root.classList.toggle('ytas-enabled', enabled);
    root.dataset.ytasEnabled = enabled ? '1' : '0';
    window.dispatchEvent(new CustomEvent('ytas:enabled-changed', {
      detail: { enabled }
    }));
  }

  async function incrementHandledCount() {
    const now = Date.now();
    if (now - lastCountAt < 500) return;
    lastCountAt = now;

    try {
      const result = await chrome.storage.local.get({ blockedCount: 0 });
      await chrome.storage.local.set({
        blockedCount: (result.blockedCount || 0) + 1
      });
    } catch (_) {
      // Statistics must never affect playback.
    }
  }

  // Counts an ad only after the ad has actually left the player following
  // an extension intervention. It does not increment merely on ad detection.
  window.addEventListener('ytas:ad-handled', () => {
    if (enabled) void incrementHandledCount();
  }, true);

  async function loadSettings() {
    try {
      const result = await chrome.storage.sync.get({ enabled: DEFAULTS.enabled });
      enabled = result.enabled !== false;
    } catch (_) {
      enabled = DEFAULTS.enabled;
    }
    exposeEnabledState();
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync' || !changes.enabled) return;
    enabled = changes.enabled.newValue !== false;
    exposeEnabledState();
  });

  function start() {
    exposeEnabledState();
    void loadSettings();
  }

  if (document.documentElement) start();
  else document.addEventListener('readystatechange', start, { once: true });
})();
