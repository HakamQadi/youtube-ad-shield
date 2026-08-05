# Changelog

All notable changes to YouTube Ad Shield are documented here.

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
- No external network requests.
- Only the Chrome `storage` permission is requested.
