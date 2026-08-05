(() => {
  'use strict';

  // YouTube Ad Shield v1.6.0
  //
  // Goal: invoke YouTube's own Skip-Ad behavior without chrome.debugger.
  //
  // Safety invariants:
  // - Never sends screen-coordinate clicks.
  // - Never targets playlist/Next controls.
  // - Never seeks a skippable ad to its end (avoids YouTube end-card stalls).
  // - Every skip attempt requires BOTH an active ad state and a currently
  //   visible Skip control inside that exact player.
  // - Synthetic-event replay is scoped to the exact Skip element and current
  //   ad session; no delayed click can survive an ad/content transition.

  const VERSION = '1.6.0';
  const AD_CLASSES = ['ad-showing', 'ad-interrupting'];
  const FAST_RATE = 16;
  const TICK_MS = 50;
  const ATTEMPT_COOLDOWN_MS = 120;
  const STRATEGY_RETRY_MS = 650;

  const SKIP_SELECTORS = [
    'button.ytp-skip-ad-button',
    'button.ytp-ad-skip-button',
    'button.ytp-ad-skip-button-modern',
    '.ytp-ad-skip-button-slot button',
    '.ytp-ad-skip-button-container button',
    '.videoAdUiSkipButton',
    'button[aria-label^="Skip ad" i]',
    'button[aria-label^="Skip ads" i]',
    'button[class*="skip-ad" i]',
    '[role="button"][class*="skip-ad" i]'
  ];

  const CLICK_EVENT_TYPES = new Set([
    'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click'
  ]);

  const REPLAY_MARK = Symbol('ytasTrustedReplay');
  const originalAddEventListener = EventTarget.prototype.addEventListener;
  const originalRemoveEventListener = EventTarget.prototype.removeEventListener;
  const nativeClick = HTMLElement.prototype.click;
  const nativeFocus = HTMLElement.prototype.focus;
  const listenerWrappers = new WeakMap();

  let enabled = true;
  let session = null;
  let observer = null;
  let mediaSessionSkipHandler = null;

  // ---------------------------------------------------------------------------
  // Trusted-event bridge
  // ---------------------------------------------------------------------------
  // Some YouTube player builds inspect clickEvent.isTrusted before accepting
  // Skip. A script-created Event can never change the browser-owned isTrusted
  // flag. Instead, because this MAIN-world script runs at document_start, we
  // transparently wrap later click listeners. Normal events are untouched. For
  // a replay event created ONLY by this extension, the YouTube listener receives
  // a proxy of that same Event whose JS-visible isTrusted value is true.
  //
  // This does not create an OS/browser physical click and does not use debugger.
  // It only affects JS listeners registered after this script, and only for the
  // extension's tagged replay events.

  function captureValue(options) {
    if (typeof options === 'boolean') return options;
    return Boolean(options && typeof options === 'object' && options.capture);
  }

  function listenerKey(type, options) {
    return `${type}|${captureValue(options) ? 1 : 0}`;
  }

  function isListenerObject(listener) {
    return typeof listener === 'function' || (listener !== null && typeof listener === 'object');
  }

  function getWrapper(listener, key) {
    let perListener = listenerWrappers.get(listener);
    if (!perListener) {
      perListener = new Map();
      listenerWrappers.set(listener, perListener);
    }
    return perListener.get(key);
  }

  function setWrapper(listener, key, wrapper) {
    let perListener = listenerWrappers.get(listener);
    if (!perListener) {
      perListener = new Map();
      listenerWrappers.set(listener, perListener);
    }
    perListener.set(key, wrapper);
  }

  function makeTrustedView(event) {
    try {
      return new Proxy(event, {
        get(target, prop) {
          if (prop === 'isTrusted') return true;
          const value = Reflect.get(target, prop, target);
          if (prop === 'constructor') return value;
          return typeof value === 'function' ? value.bind(target) : value;
        }
      });
    } catch (_) {
      return event;
    }
  }

  function callListener(listener, context, event) {
    if (typeof listener === 'function') {
      return listener.call(context, event);
    }
    if (listener && typeof listener.handleEvent === 'function') {
      return listener.handleEvent.call(listener, event);
    }
    return undefined;
  }

  EventTarget.prototype.addEventListener = function patchedAddEventListener(type, listener, options) {
    if (!isListenerObject(listener) || !CLICK_EVENT_TYPES.has(String(type))) {
      return originalAddEventListener.call(this, type, listener, options);
    }

    const key = listenerKey(String(type), options);
    let wrapper = getWrapper(listener, key);
    if (!wrapper) {
      wrapper = function ytasListenerBridge(event) {
        const delivered = event && event[REPLAY_MARK] === true
          ? makeTrustedView(event)
          : event;
        return callListener(listener, this, delivered);
      };
      setWrapper(listener, key, wrapper);
    }

    return originalAddEventListener.call(this, type, wrapper, options);
  };

  EventTarget.prototype.removeEventListener = function patchedRemoveEventListener(type, listener, options) {
    if (!isListenerObject(listener) || !CLICK_EVENT_TYPES.has(String(type))) {
      return originalRemoveEventListener.call(this, type, listener, options);
    }

    const wrapper = getWrapper(listener, listenerKey(String(type), options));
    return originalRemoveEventListener.call(this, type, wrapper || listener, options);
  };

  // ---------------------------------------------------------------------------
  // Media Session bridge
  // ---------------------------------------------------------------------------
  // Chromium exposes a 'skipad' Media Session action. If YouTube registers one,
  // capture the exact page handler and invoke it directly when Skip is visible.

  function installMediaSessionBridge() {
    try {
      const mediaSession = navigator.mediaSession;
      if (!mediaSession) return;

      const proto = Object.getPrototypeOf(mediaSession);
      if (!proto || typeof proto.setActionHandler !== 'function') return;

      const originalSetActionHandler = proto.setActionHandler;
      if (originalSetActionHandler.__ytasWrapped) return;

      function wrappedSetActionHandler(action, handler) {
        if (action === 'skipad') {
          mediaSessionSkipHandler = typeof handler === 'function' ? handler : null;
        }
        return originalSetActionHandler.call(this, action, handler);
      }

      Object.defineProperty(wrappedSetActionHandler, '__ytasWrapped', { value: true });
      proto.setActionHandler = wrappedSetActionHandler;
    } catch (_) {
      // Optional strategy only.
    }
  }

  installMediaSessionBridge();

  // ---------------------------------------------------------------------------
  // Player / DOM helpers
  // ---------------------------------------------------------------------------

  function syncEnabledFromDom() {
    const value = document.documentElement?.dataset?.ytasEnabled;
    if (value === '0') enabled = false;
    else if (value === '1') enabled = true;
  }

  function getPlayer() {
    return document.querySelector('#movie_player, .html5-video-player');
  }

  function getVideo(player = getPlayer()) {
    return player?.querySelector('video.html5-main-video, video') ||
      document.querySelector('video.html5-main-video, video');
  }

  function isAdActive(player = getPlayer()) {
    if (!(player instanceof HTMLElement) || !player.isConnected) return false;
    return AD_CLASSES.some((className) => player.classList.contains(className));
  }

  function isVisible(element) {
    if (!(element instanceof HTMLElement) || !element.isConnected) return false;

    const style = getComputedStyle(element);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      Number(style.opacity) === 0 ||
      style.pointerEvents === 'none'
    ) return false;

    const rect = element.getBoundingClientRect();
    return rect.width > 2 && rect.height > 2;
  }

  function isDisabled(element) {
    if (!(element instanceof HTMLElement)) return true;
    return element.hasAttribute('disabled') ||
      element.getAttribute('aria-disabled') === 'true';
  }

  function normalizeLabel(element) {
    if (!(element instanceof HTMLElement)) return '';
    return [
      element.getAttribute('aria-label') || '',
      element.getAttribute('title') || '',
      element.textContent || ''
    ]
      .join(' ')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isSkipLabel(element) {
    const label = normalizeLabel(element);
    return /^(?:skip|skip ad|skip ads|skip advertisement|skip advertisements)$/i.test(label);
  }

  function toActualButton(node, player) {
    if (!(node instanceof HTMLElement)) return null;

    if (node.matches('button, [role="button"]')) return node;

    const child = node.querySelector?.('button, [role="button"]');
    if (child instanceof HTMLElement && player.contains(child)) return child;

    const parent = node.closest?.('button, [role="button"]');
    if (parent instanceof HTMLElement && player.contains(parent)) return parent;

    return node;
  }

  function findSkipCandidate(player) {
    if (!(player instanceof HTMLElement) || !isAdActive(player)) return null;

    for (const selector of SKIP_SELECTORS) {
      let node = null;
      try { node = player.querySelector(selector); } catch (_) {}
      node = toActualButton(node, player);
      if (
        node instanceof HTMLElement &&
        isVisible(node) &&
        !isDisabled(node) &&
        (isSkipLabel(node) || /skip-ad/i.test(node.className || ''))
      ) return node;
    }

    const clickables = player.querySelectorAll('button, [role="button"], tp-yt-paper-button');
    for (const node of clickables) {
      if (
        node instanceof HTMLElement &&
        isVisible(node) &&
        !isDisabled(node) &&
        isSkipLabel(node)
      ) return node;
    }

    return null;
  }

  function stillSameActiveAd(player, candidate = null) {
    if (!enabled || !session || session.player !== player || !isAdActive(player)) return false;
    if (candidate) {
      return candidate.isConnected && player.contains(candidate) &&
        isVisible(candidate) && !isDisabled(candidate) &&
        (isSkipLabel(candidate) || /skip-ad/i.test(candidate.className || ''));
    }
    return true;
  }

  function savePlaybackState(video) {
    if (!(video instanceof HTMLMediaElement) || session?.savedState) return;
    session.savedState = {
      muted: video.muted,
      volume: video.volume,
      playbackRate: video.playbackRate
    };
  }

  function restorePlaybackState(video, state) {
    if (!(video instanceof HTMLMediaElement) || !state) return;
    try { video.muted = state.muted; } catch (_) {}
    try { video.volume = state.volume; } catch (_) {}
    try { video.playbackRate = state.playbackRate || 1; } catch (_) {}
  }

  function beginAd(player, video) {
    session = {
      player,
      video,
      startedAt: performance.now(),
      savedState: null,
      interventionMade: false,
      candidate: null,
      candidateSeenAt: 0,
      lastAttemptAt: 0,
      strategyIndex: 0,
      lastFullCycleAt: 0
    };
  }

  function finishSession(reason) {
    if (!session) return;
    const old = session;
    const currentVideo = getVideo(old.player) || old.video;
    restorePlaybackState(currentVideo, old.savedState);
    session = null;

    if (reason === 'ad-ended' && old.interventionMade) {
      window.dispatchEvent(new CustomEvent('ytas:ad-handled'));
    }
  }

  function prepareAdMedia(video) {
    if (!(video instanceof HTMLMediaElement) || !session) return;
    savePlaybackState(video);
    session.interventionMade = true;

    try { video.muted = true; } catch (_) {}
    try {
      if (video.playbackRate < FAST_RATE) video.playbackRate = FAST_RATE;
    } catch (_) {}
    try {
      if (video.paused) void video.play().catch(() => {});
    } catch (_) {}
  }

  // ---------------------------------------------------------------------------
  // Skip strategies
  // ---------------------------------------------------------------------------

  function tryMediaSessionSkip(player, candidate) {
    if (!stillSameActiveAd(player, candidate) || typeof mediaSessionSkipHandler !== 'function') {
      return false;
    }
    try {
      mediaSessionSkipHandler({ action: 'skipad' });
      return true;
    } catch (_) {
      return false;
    }
  }

  function namedSkipMethods(player) {
    const names = new Set([
      'skipAd', 'skipAds', 'skipCurrentAd', 'skipAdVideo', 'skipAdPod', 'onSkipAd'
    ]);

    // Include readable YouTube methods matching skip+ad if a build exposes one.
    let object = player;
    let depth = 0;
    while (object && object !== Object.prototype && depth < 5) {
      for (const name of Object.getOwnPropertyNames(object)) {
        if (/^(?:skip.*ad|ad.*skip)$/i.test(name) || /^(?:skipAd|skipAds|skipCurrentAd)$/i.test(name)) {
          names.add(name);
        }
      }
      object = Object.getPrototypeOf(object);
      depth += 1;
    }
    return [...names];
  }

  function tryPlayerInternalSkip(player, candidate) {
    if (!stillSameActiveAd(player, candidate)) return false;

    for (const name of namedSkipMethods(player)) {
      let fn;
      try { fn = player[name]; } catch (_) { continue; }
      if (typeof fn !== 'function') continue;
      try {
        fn.call(player);
        return true;
      } catch (_) {
        // Try the next readable internal method.
      }
    }
    return false;
  }

  function tagReplay(event) {
    try {
      Object.defineProperty(event, REPLAY_MARK, { value: true });
      return event;
    } catch (_) {
      return event;
    }
  }

  function dispatchReplayEvent(target, event) {
    if (!(target instanceof HTMLElement)) return false;
    try {
      target.dispatchEvent(tagReplay(event));
      return true;
    } catch (_) {
      return false;
    }
  }

  function tryTrustedListenerReplay(player, candidate) {
    if (!stillSameActiveAd(player, candidate)) return false;

    const rect = candidate.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const common = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX: x,
      clientY: y,
      screenX: x,
      screenY: y,
      button: 0,
      buttons: 1
    };

    try { nativeFocus.call(candidate, { preventScroll: true }); } catch (_) {}

    let any = false;
    if (typeof PointerEvent === 'function') {
      any = dispatchReplayEvent(candidate, new PointerEvent('pointerdown', {
        ...common,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true
      })) || any;
      any = dispatchReplayEvent(candidate, new PointerEvent('pointerup', {
        ...common,
        buttons: 0,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true
      })) || any;
    }

    any = dispatchReplayEvent(candidate, new MouseEvent('mousedown', common)) || any;
    any = dispatchReplayEvent(candidate, new MouseEvent('mouseup', { ...common, buttons: 0 })) || any;
    any = dispatchReplayEvent(candidate, new MouseEvent('click', { ...common, buttons: 0, detail: 1 })) || any;
    return any;
  }

  function tryDirectHandler(player, candidate) {
    if (!stillSameActiveAd(player, candidate)) return false;

    // Inline handlers are not routed through addEventListener, so invoke the
    // exact handler directly if YouTube attached one to the button.
    try {
      if (typeof candidate.onclick === 'function') {
        const event = new MouseEvent('click', { bubbles: true, cancelable: true, composed: true });
        candidate.onclick.call(candidate, makeTrustedView(event));
        return true;
      }
    } catch (_) {}

    return false;
  }

  function tryNativePageClick(player, candidate) {
    if (!stillSameActiveAd(player, candidate)) return false;
    try {
      nativeClick.call(candidate);
      return true;
    } catch (_) {
      return false;
    }
  }

  const STRATEGIES = [
    tryMediaSessionSkip,
    tryPlayerInternalSkip,
    tryTrustedListenerReplay,
    tryDirectHandler,
    tryNativePageClick
  ];

  function attemptSkip(player, candidate) {
    if (!session || !stillSameActiveAd(player, candidate)) return;

    const now = performance.now();
    if (now - session.lastAttemptAt < ATTEMPT_COOLDOWN_MS) return;
    session.lastAttemptAt = now;

    if (session.candidate !== candidate) {
      session.candidate = candidate;
      session.candidateSeenAt = now;
      session.strategyIndex = 0;
    }

    if (session.strategyIndex >= STRATEGIES.length) {
      if (now - session.lastFullCycleAt < STRATEGY_RETRY_MS) return;
      session.strategyIndex = 0;
    }

    const strategy = STRATEGIES[session.strategyIndex];
    session.strategyIndex += 1;
    if (session.strategyIndex >= STRATEGIES.length) session.lastFullCycleAt = now;

    if (!stillSameActiveAd(player, candidate)) return;

    let attempted = false;
    try { attempted = strategy(player, candidate) === true; } catch (_) {}
    if (attempted) session.interventionMade = true;
  }

  function accelerateUnskippableAd(player, video) {
    if (!session || !stillSameActiveAd(player)) return;
    // Only used while no Skip control is available. As soon as Skip appears,
    // seeking is never used; v1.6 relies on YouTube's own skip action instead.
    prepareAdMedia(video);
  }

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------

  function tick() {
    syncEnabledFromDom();

    const player = getPlayer();
    const video = getVideo(player);
    const adActive = isAdActive(player);

    if (!enabled) {
      if (session) finishSession('disabled');
      return;
    }

    if (!adActive) {
      if (session) finishSession('ad-ended');
      return;
    }

    if (!(player instanceof HTMLElement) || !(video instanceof HTMLMediaElement)) return;

    if (!session || session.player !== player) {
      if (session) finishSession('player-changed');
      beginAd(player, video);
    }

    const skip = findSkipCandidate(player);
    if (skip) {
      // Keep the ad quiet while the internal skip action is attempted, but do
      // NOT seek to the end. This prevents the static advertiser end-card seen
      // in v1.5.
      prepareAdMedia(video);
      attemptSkip(player, skip);
    } else {
      accelerateUnskippableAd(player, video);
    }
  }

  function startObserver() {
    if (!document.documentElement) {
      requestAnimationFrame(startObserver);
      return;
    }

    observer = new MutationObserver(tick);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'aria-label', 'aria-disabled', 'disabled', 'style']
    });
  }

  originalAddEventListener.call(window, 'ytas:enabled-changed', (event) => {
    enabled = event.detail?.enabled !== false;
    tick();
  }, true);

  originalAddEventListener.call(document, 'yt-navigate-start', () => {
    if (session) finishSession('navigation');
  }, true);
  originalAddEventListener.call(document, 'yt-navigate-finish', tick, true);
  originalAddEventListener.call(document, 'yt-page-data-updated', tick, true);
  originalAddEventListener.call(document, 'visibilitychange', tick, true);

  startObserver();
  setInterval(tick, TICK_MS);

  // Non-invasive diagnostic marker for manual verification in DevTools.
  try { document.documentElement.dataset.ytasVersion = VERSION; } catch (_) {}
})();
