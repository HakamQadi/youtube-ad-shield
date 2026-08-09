(() => {
  'use strict';

  const SPONSORBLOCK_API = 'https://sponsor.ajay.app';
  const CACHE_TTL_MS = 15 * 60 * 1000;
  const cache = new Map();

  function isValidVideoId(videoId) {
    return typeof videoId === 'string' && /^[A-Za-z0-9_-]{11}$/.test(videoId);
  }

  async function sha256Hex(value) {
    const bytes = new TextEncoder().encode(value);
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function normalizeSegments(payload, videoId) {
    if (!Array.isArray(payload)) return [];

    const candidates = [];

    for (const item of payload) {
      // Privacy-preserving hash-prefix endpoint returns groups keyed by videoID.
      if (item && item.videoID && Array.isArray(item.segments)) {
        if (item.videoID === videoId) candidates.push(...item.segments);
        continue;
      }

      // Keep compatibility with the direct endpoint response shape.
      if (item && Array.isArray(item.segment)) candidates.push(item);
    }

    return candidates
      .filter((entry) => {
        const segment = entry?.segment;
        return Array.isArray(segment) &&
          segment.length >= 2 &&
          Number.isFinite(Number(segment[0])) &&
          Number.isFinite(Number(segment[1])) &&
          Number(segment[1]) > Number(segment[0]) &&
          (!entry.category || entry.category === 'sponsor') &&
          (!entry.actionType || entry.actionType === 'skip');
      })
      .map((entry, index) => ({
        id: String(entry.UUID || entry.uuid || `${videoId}:${index}:${entry.segment[0]}:${entry.segment[1]}`),
        start: Number(entry.segment[0]),
        end: Number(entry.segment[1]),
        category: 'sponsor'
      }))
      .sort((a, b) => a.start - b.start);
  }

  async function fetchSponsorSegments(videoId) {
    if (!isValidVideoId(videoId)) {
      return { ok: false, status: 'invalid-video-id', segments: [] };
    }

    const cached = cache.get(videoId);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      return { ...cached.value, cached: true };
    }

    // Send only the first 4 hex characters of SHA-256(videoId), not the exact
    // YouTube video ID, then filter the candidate response locally.
    const hash = await sha256Hex(videoId);
    const hashPrefix = hash.slice(0, 4);
    const query = new URLSearchParams({
      service: 'YouTube',
      categories: JSON.stringify(['sponsor']),
      actionTypes: JSON.stringify(['skip'])
    });
    const url = `${SPONSORBLOCK_API}/api/skipSegments/${hashPrefix}?${query.toString()}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'omit',
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      });

      if (response.status === 404) {
        const value = { ok: true, status: 'no-segments', segments: [] };
        cache.set(videoId, { cachedAt: Date.now(), value });
        return value;
      }

      if (!response.ok) {
        return {
          ok: false,
          status: `http-${response.status}`,
          segments: []
        };
      }

      const payload = await response.json();
      const segments = normalizeSegments(payload, videoId);
      const value = {
        ok: true,
        status: segments.length ? 'ready' : 'no-segments',
        segments
      };
      cache.set(videoId, { cachedAt: Date.now(), value });
      return value;
    } catch (_) {
      return { ok: false, status: 'network-error', segments: [] };
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'ytas:get-sponsor-segments') return undefined;

    void fetchSponsorSegments(message.videoId)
      .then(sendResponse)
      .catch(() => sendResponse({ ok: false, status: 'unexpected-error', segments: [] }));

    return true;
  });
})();
