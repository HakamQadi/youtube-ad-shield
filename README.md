# Ad Shield for YouTube™ v1.8.0

A cross-browser Manifest V3 extension for Chrome and Firefox that automatically handles YouTube ads and can skip creator sponsorship segments inside videos.

## Features

- Automatically activates YouTube's available **Skip Ad** action.
- Mutes and accelerates non-skippable YouTube ads.
- Removes common promoted and overlay ad elements.
- Restores the user's mute, volume, and playback speed after an ad.
- **Creator sponsorship skipping** using SponsorBlock community segment data.
- Creator sponsorship skipping can be enabled or disabled from the popup.
- **Report Ad Not Skipped** opens a pre-filled GitHub issue with local diagnostics for easier bug reporting.
- Local Ads Handled statistics.
- Chrome and Firefox support from the same codebase and manifest.
- No `chrome.debugger` permission and no Chrome debugging banner.
- No remote executable code.

## Browser support

- Chrome / Chromium browsers using Manifest V3.
- Firefox 128 or newer. Firefox 128 added support for Manifest V3 content scripts running in the `MAIN` world, which the ad engine needs.

The manifest declares both background implementations:

- Chrome uses `background.service_worker`.
- Firefox uses `background.scripts`.

The extension JavaScript uses the Promise-based `browser` namespace when Firefox provides it and falls back to `chrome` on Chromium browsers.

## Creator sponsorship skipping

When enabled, the extension checks SponsorBlock for community-submitted `sponsor` segments for the current YouTube video and automatically seeks past matching sponsor segments.

For privacy, the extension uses SponsorBlock's hash-prefix lookup: it hashes the current video ID locally and sends only the first four hexadecimal characters of the SHA-256 hash. The response is filtered locally for the current video.

SponsorBlock network access is used only for segment metadata. See `PRIVACY.md` for details.

## Report Ad Not Skipped

The popup contains a **Report Ad Not Skipped** button. It gathers a small set of diagnostics from the current YouTube tab and opens a GitHub issue form. Nothing is submitted automatically; the user reviews and submits the report manually.

Auto-generated diagnostics include:

- Extension version
- Whether the content script/player/video were detected
- Whether an ad was active when the report was opened
- Whether a Skip control was visible
- Ad engine version
- Creator sponsor feature status

The current video URL and video ID are not automatically added to the public report.

## Permissions

Extension permission:

- `storage` — stores enabled/disabled preferences and local counters.

External host access:

- `https://sponsor.ajay.app/*` — retrieves SponsorBlock sponsor-segment metadata.

YouTube execution is limited to:

- `https://www.youtube.com/*`
- `https://m.youtube.com/*`

Firefox-specific manifest metadata declares a stable Gecko extension ID and `data_collection_permissions.required: ["none"]` for AMO signing/submission.

## Install / update on Chrome

1. Extract the ZIP.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Remove the previous Ad Shield build if needed.
5. Click **Load unpacked**.
6. Select the extracted extension folder.
7. Confirm version **1.8.0**.
8. Refresh all open YouTube tabs.

## Install temporarily on Firefox

1. Extract the ZIP or clone the repository.
2. Open `about:debugging` in Firefox.
3. Select **This Firefox**.
4. Click **Load Temporary Add-on**.
5. Select `manifest.json` from the extension folder.
6. Confirm version **1.8.0**.
7. Refresh all open YouTube tabs.

Temporary Firefox installations are removed when Firefox restarts. Distribution builds should be signed through Mozilla Add-ons (AMO) or Mozilla's self-distribution signing flow.

## Ad engine safety rules

The validated v1.6 YouTube ad engine remains unchanged:

- No `chrome.debugger` permission.
- No screen-coordinate / DevTools mouse events.
- No clicks on playlist Next controls.
- Skippable ads are not force-seeked to the end.
- Non-skippable ads are muted and accelerated while they remain non-skippable.
- Original playback state is restored after the ad.
