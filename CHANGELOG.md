# Changelog

All notable changes to Ad Shield for YouTube™ are documented here.

## Unreleased

### Changed

- Updated the “Powered By Hakam Qadi” footer link from LinkedIn to the developer's portfolio.

## 1.6.1 - 2026-08-05

- Redesigned the extension popup with a simpler dark UI.
- Added the new shield/play blocked-ad icon across Chrome icon sizes.
- Added a clickable “Powered By Hakam Qadi” footer linking to LinkedIn.
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
- No external network requests.
- Only the Chrome `storage` permission is requested.
