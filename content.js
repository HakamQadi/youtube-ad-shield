(() => {
  'use strict';

  const DEFAULTS = {
    enabled: true,
    blockedCount: 0,
    sponsorSkipEnabled: true,
    sponsorSkippedCount: 0
  };

  const SPONSOR_POLL_MS = 250;
  const SPONSOR_SKIP_COOLDOWN_MS = 3000;
  const SKIP_SELECTORS = [
    'button.ytp-skip-ad-button',
    'button.ytp-ad-skip-button',
    'button.ytp-ad-skip-button-modern',
    '.ytp-ad-skip-button-slot button',
    '.ytp-ad-skip-button-container button',
    'button[aria-label^="Skip ad" i]',
    'button[aria-label^="Skip ads" i]'
  ];

  let enabled = DEFAULTS.enabled;
  let sponsorSkipEnabled = DEFAULTS.sponsorSkipEnabled;
  let lastCountAt = 0;
  let lastSponsorCountAt = 0;
  let currentVideoId = null;
  let sponsorSegments = [];
  let sponsorStatus = 'idle';
  let sponsorRequestToken = 0;
  let lastSponsorSkip = { id: null, at: 0 };

  function exposeEnabledState() {
    const root = document.documentElement;
    if (!root) return;

    root.classList.toggle('ytas-enabled', enabled);
    root.dataset.ytasEnabled = enabled ? '1' : '0';
    root.dataset.ytasSponsorSkip = sponsorSkipEnabled ? '1' : '0';
    root.dataset.ytasSponsorStatus = sponsorStatus;

    window.dispatchEvent(new CustomEvent('ytas:enabled-changed', {
      detail: { enabled }
    }));
  }

  async function incrementLocalCounter(key, cooldownRef) {
    const now = Date.now();
    if (now - cooldownRef.value < 500) return;
    cooldownRef.value = now;

    try {
      const result = await chrome.storage.local.get({ [key]: 0 });
      await chrome.storage.local.set({
        [key]: (result[key] || 0) + 1
      });
    } catch (_) {
      // Statistics must never affect playback.
    }
  }

  async function incrementHandledCount() {
    const ref = { value: lastCountAt };
    await incrementLocalCounter('blockedCount', ref);
    lastCountAt = ref.value;
  }

  async function incrementSponsorSkippedCount() {
    const ref = { value: lastSponsorCountAt };
    await incrementLocalCounter('sponsorSkippedCount', ref);
    lastSponsorCountAt = ref.value;
  }

  // Counts a YouTube ad only after it has actually left the player following
  // an extension intervention. It does not increment merely on ad detection.
  window.addEventListener('ytas:ad-handled', () => {
    if (enabled) void incrementHandledCount();
  }, true);

  function getVideoId() {
    try {
      const url = new URL(location.href);
      const watchId = url.searchParams.get('v');
      if (watchId && /^[A-Za-z0-9_-]{11}$/.test(watchId)) return watchId;

      const shortMatch = url.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{11})(?:\/|$)/);
      if (shortMatch) return shortMatch[1];

      const embedMatch = url.pathname.match(/^\/embed\/([A-Za-z0-9_-]{11})(?:\/|$)/);
      if (embedMatch) return embedMatch[1];
    } catch (_) {}
    return null;
  }

  function getMainVideo() {
    return document.querySelector(
      '#movie_player video.html5-main-video, #movie_player video, ytd-shorts video, video.html5-main-video'
    );
  }

  function isAdActive() {
    const player = document.querySelector('#movie_player, .html5-video-player');
    return Boolean(player && (
      player.classList.contains('ad-showing') ||
      player.classList.contains('ad-interrupting')
    ));
  }

  function isVisible(element) {
    if (!(element instanceof HTMLElement) || !element.isConnected) return false;
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 2 && rect.height > 2;
  }

  function hasVisibleSkipControl() {
    return SKIP_SELECTORS.some((selector) => {
      const element = document.querySelector(selector);
      return isVisible(element) &&
        !element.hasAttribute('disabled') &&
        element.getAttribute('aria-disabled') !== 'true';
    });
  }

  function pageType() {
    if (/^\/shorts\//.test(location.pathname)) return 'shorts';
    if (location.pathname === '/watch') return 'watch';
    if (/^\/embed\//.test(location.pathname)) return 'embed';
    return 'other';
  }

  async function loadSponsorSegments(videoId) {
    const requestToken = ++sponsorRequestToken;
    sponsorSegments = [];
    lastSponsorSkip = { id: null, at: 0 };

    if (!enabled || !sponsorSkipEnabled || !videoId) {
      sponsorStatus = !videoId ? 'no-video' : 'disabled';
      exposeEnabledState();
      return;
    }

    sponsorStatus = 'loading';
    exposeEnabledState();

    try {
      const result = await chrome.runtime.sendMessage({
        type: 'ytas:get-sponsor-segments',
        videoId
      });

      if (requestToken !== sponsorRequestToken || videoId !== currentVideoId) return;

      sponsorSegments = Array.isArray(result?.segments) ? result.segments : [];
      sponsorStatus = result?.status || (result?.ok ? 'ready' : 'error');
    } catch (_) {
      if (requestToken !== sponsorRequestToken || videoId !== currentVideoId) return;
      sponsorSegments = [];
      sponsorStatus = 'extension-error';
    }

    exposeEnabledState();
  }

  function refreshVideoContext() {
    const videoId = getVideoId();
    if (videoId === currentVideoId) return;

    currentVideoId = videoId;
    void loadSponsorSegments(videoId);
  }

  function maybeSkipCreatorSponsor() {
    refreshVideoContext();

    if (!enabled || !sponsorSkipEnabled || !currentVideoId || !sponsorSegments.length) return;
    if (isAdActive()) return;

    const video = getMainVideo();
    if (!(video instanceof HTMLMediaElement) || !Number.isFinite(video.currentTime)) return;

    const currentTime = video.currentTime;
    const segment = sponsorSegments.find((entry) => (
      currentTime >= entry.start - 0.12 &&
      currentTime < entry.end - 0.08
    ));
    if (!segment) return;

    const now = Date.now();
    if (lastSponsorSkip.id === segment.id && now - lastSponsorSkip.at < SPONSOR_SKIP_COOLDOWN_MS) {
      return;
    }

    lastSponsorSkip = { id: segment.id, at: now };

    try {
      // A tiny offset avoids landing exactly on a boundary frame that some
      // YouTube player builds may snap backwards onto.
      video.currentTime = Math.min(segment.end + 0.05, Number.isFinite(video.duration) ? video.duration : segment.end + 0.05);
      void incrementSponsorSkippedCount();
    } catch (_) {
      // Seeking failure must not affect normal playback.
    }
  }

  async function loadSettings() {
    try {
      const result = await chrome.storage.sync.get({
        enabled: DEFAULTS.enabled,
        sponsorSkipEnabled: DEFAULTS.sponsorSkipEnabled
      });
      enabled = result.enabled !== false;
      sponsorSkipEnabled = result.sponsorSkipEnabled !== false;
    } catch (_) {
      enabled = DEFAULTS.enabled;
      sponsorSkipEnabled = DEFAULTS.sponsorSkipEnabled;
    }

    exposeEnabledState();
    refreshVideoContext();
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync') return;

    let sponsorSettingChanged = false;

    if (changes.enabled) {
      enabled = changes.enabled.newValue !== false;
    }

    if (changes.sponsorSkipEnabled) {
      sponsorSkipEnabled = changes.sponsorSkipEnabled.newValue !== false;
      sponsorSettingChanged = true;
    }

    exposeEnabledState();

    if (changes.enabled || sponsorSettingChanged) {
      void loadSponsorSegments(currentVideoId || getVideoId());
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'ytas:get-diagnostics') return undefined;

    const video = getMainVideo();
    const player = document.querySelector('#movie_player, .html5-video-player');

    sendResponse({
      pageType: pageType(),
      protectionEnabled: enabled,
      sponsorSkipEnabled,
      playerFound: Boolean(player),
      videoFound: video instanceof HTMLMediaElement,
      adActive: isAdActive(),
      skipControlVisible: hasVisibleSkipControl(),
      sponsorStatus,
      sponsorSegmentsLoaded: sponsorSegments.length,
      adEngineVersion: document.documentElement?.dataset?.ytasVersion || 'unknown'
    });

    return undefined;
  });

  function onNavigation() {
    currentVideoId = null;
    sponsorSegments = [];
    sponsorStatus = 'navigation';
    refreshVideoContext();
  }

  document.addEventListener('yt-navigate-finish', onNavigation, true);
  document.addEventListener('yt-page-data-updated', refreshVideoContext, true);
  window.addEventListener('popstate', refreshVideoContext, true);

  function start() {
    exposeEnabledState();
    void loadSettings();
    setInterval(maybeSkipCreatorSponsor, SPONSOR_POLL_MS);
  }

  if (document.documentElement) start();
  else document.addEventListener('readystatechange', start, { once: true });
})();
