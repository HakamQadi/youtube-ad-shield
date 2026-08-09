# Changelog

All notable changes to Ad Shield for YouTube™ are documented here.

## 1.7.0 - 2026-08-06

### Added

- Creator sponsorship auto-skip using SponsorBlock community `sponsor` segment data.
- Privacy-reduced SponsorBlock hash-prefix lookups instead of sending the full YouTube video ID.
- Popup toggle to enable or disable creator sponsorship skipping.
- Local creator sponsorship skip counter for diagnostics/future statistics.
- **Report Ad Not Skipped** popup action that opens a pre-filled GitHub issue.
- Automatic local diagnostics for ad reports without automatically including the video URL or video ID.
- Background service worker for SponsorBlock API requests.

### Changed

- Extension version bumped to 1.7.0.
- Privacy policy updated to disclose SponsorBlock network access and user-initiated GitHub reports.
- Popup subtitle now reflects both YouTube ad handling and creator sponsor skipping.

### Unchanged

- The validated v1.6 YouTube ad-skipping engine in `main.js` remains unchanged.
- No `chrome.debugger` permission or remote executable code.

## 1.6.1 - 2026-08-05

- Redesigned the extension popup with a simpler dark UI.
- Added the new shield/play blocked-ad icon across Chrome icon sizes.
- Added a clickable “Powered By Hakam Qadi” footer.
- Kept the validated v1.6 ad-skipping engine unchanged.

## 1.6.0 - 2026-08-05

### Added
- MAIN-world YouTube skip-action bridge installed at `document_start`.
- Media Session `skipad` fallback when exposed by the player.
- Internal player skip-method fallback when available.

### Changed
- Skippable ads are no longer force-seeked to the end.
- Skip handling is restricted to the active YouTube ad player and visible Skip controls.

### Security / privacy
- No `chrome.debugger` permission.
- No remote code or analytics.
- Only the Chrome `storage` permission is requested.
