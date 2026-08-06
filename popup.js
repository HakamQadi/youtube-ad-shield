(() => {
  'use strict';

  const ISSUE_URL = 'https://github.com/HakamQadi/youtube-ad-shield/issues/new';

  const toggle = document.getElementById('enabledToggle');
  const sponsorToggle = document.getElementById('sponsorToggle');
  const statusCard = document.querySelector('.status-card');
  const statusTitle = document.getElementById('statusTitle');
  const statusText = document.getElementById('statusText');
  const blockedCount = document.getElementById('blockedCount');
  const resetStats = document.getElementById('resetStats');
  const reportAd = document.getElementById('reportAd');

  function renderEnabled(enabled) {
    const isEnabled = enabled !== false;

    toggle.checked = isEnabled;
    statusCard.classList.toggle('is-paused', !isEnabled);
    statusTitle.textContent = isEnabled ? 'Shield is active' : 'Shield is paused';
    statusText.textContent = isEnabled ? 'Skipping YouTube ads' : "Protection is paused";
  }

  function renderSponsorEnabled(enabled) {
    sponsorToggle.checked = enabled !== false;
  }

  async function loadState() {
    const sync = await chrome.storage.sync.get({
      enabled: true,
      sponsorSkipEnabled: true
    });
    const local = await chrome.storage.local.get({ blockedCount: 0 });

    renderEnabled(sync.enabled);
    renderSponsorEnabled(sync.sponsorSkipEnabled);
    blockedCount.textContent = String(local.blockedCount || 0);
  }

  toggle.addEventListener('change', async () => {
    await chrome.storage.sync.set({ enabled: toggle.checked });
    renderEnabled(toggle.checked);
  });

  sponsorToggle.addEventListener('change', async () => {
    await chrome.storage.sync.set({ sponsorSkipEnabled: sponsorToggle.checked });
    renderSponsorEnabled(sponsorToggle.checked);
  });

  resetStats.addEventListener('click', async () => {
    await chrome.storage.local.set({ blockedCount: 0 });
    blockedCount.textContent = '0';
  });

  async function getActiveTabDiagnostics() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      return { contentScriptAvailable: false };
    }

    try {
      const diagnostics = await chrome.tabs.sendMessage(tab.id, {
        type: 'ytas:get-diagnostics'
      });
      return { contentScriptAvailable: true, ...(diagnostics || {}) };
    } catch (_) {
      return { contentScriptAvailable: false };
    }
  }

  function yesNo(value) {
    if (value === true) return 'Yes';
    if (value === false) return 'No';
    return 'Unknown';
  }

  function buildIssueBody(diagnostics) {
    const manifest = chrome.runtime.getManifest();

    return [
      '## What happened?',
      '',
      'Please describe the ad that was not skipped and what you expected to happen.',
      '',
      '## Steps to reproduce',
      '',
      '1. Open a YouTube video',
      '2. Wait for the ad to appear',
      '3. Describe what happened here',
      '',
      '> If useful, paste the YouTube video URL here. Remove anything you do not want to share publicly.',
      '',
      '## Auto-generated diagnostics',
      '',
      `- Extension version: ${manifest.version}`,
      `- Content script detected: ${yesNo(diagnostics.contentScriptAvailable)}`,
      `- YouTube page type: ${diagnostics.pageType || 'unknown'}`,
      `- Protection enabled: ${yesNo(diagnostics.protectionEnabled)}`,
      `- Player detected: ${yesNo(diagnostics.playerFound)}`,
      `- Video detected: ${yesNo(diagnostics.videoFound)}`,
      `- Ad active when report opened: ${yesNo(diagnostics.adActive)}`,
      `- Skip control visible: ${yesNo(diagnostics.skipControlVisible)}`,
      `- Ad engine version: ${diagnostics.adEngineVersion || 'unknown'}`,
      `- Creator sponsor skipping enabled: ${yesNo(diagnostics.sponsorSkipEnabled)}`,
      `- Sponsor data status: ${diagnostics.sponsorStatus || 'unknown'}`,
      `- Sponsor segments loaded: ${Number.isFinite(diagnostics.sponsorSegmentsLoaded) ? diagnostics.sponsorSegmentsLoaded : 'unknown'}`,
      '',
      '## Extra notes',
      '',
      'Add screenshots or a screen recording if possible.'
    ].join('\n');
  }

  reportAd.addEventListener('click', async () => {
    if (reportAd.disabled) return;

    reportAd.disabled = true;
    reportAd.classList.add('is-loading');

    try {
      const diagnostics = await getActiveTabDiagnostics();
      const params = new URLSearchParams({
        title: '[Bug] Ad not skipped',
        body: buildIssueBody(diagnostics)
      });

      await chrome.tabs.create({ url: `${ISSUE_URL}?${params.toString()}` });
    } finally {
      reportAd.disabled = false;
      reportAd.classList.remove('is-loading');
    }
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.blockedCount) {
      blockedCount.textContent = String(changes.blockedCount.newValue || 0);
    }

    if (areaName === 'sync' && changes.enabled) {
      renderEnabled(changes.enabled.newValue);
    }

    if (areaName === 'sync' && changes.sponsorSkipEnabled) {
      renderSponsorEnabled(changes.sponsorSkipEnabled.newValue);
    }
  });

  void loadState();
})();
