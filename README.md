# YouTube Ad Shield v1.6.1 — Internal Skip Action

A Chrome Manifest V3 extension focused on automatically skipping YouTube ads without Chrome debugger access.

## What changed in v1.6

v1.5 could fast-forward a skippable ad to the end, but some YouTube ads then stayed on a static advertiser end-card even though the ad video itself had finished.

v1.6 no longer force-seeks skippable ads. When YouTube exposes its real **Skip / Skip Ad / Skip Ads** control, v1.6 attempts the player's own skip path through several page-level strategies:

1. Reuse YouTube's Media Session `skipad` handler if the player registered one.
2. Invoke a readable player method such as `skipAd()` if the current player build exposes one.
3. Replay the exact Skip button interaction through YouTube's own event listeners. The MAIN-world bridge is installed at `document_start` and only changes the JS-visible `isTrusted` value for extension-tagged Skip replay events.
4. Invoke an inline Skip handler if one exists.
5. Fall back to a normal MAIN-world DOM click.

All attempts are restricted to the currently active YouTube ad player and a currently visible Skip control.

## Safety rules

- No `chrome.debugger` permission.
- No Chrome debugging banner.
- No screen-coordinate / DevTools mouse events.
- No clicks on playlist Next controls.
- No delayed physical click can survive an ad-to-content transition.
- Skippable ads are **not** force-seeked to the end, preventing the v1.5 end-card stall.
- Non-skippable ads are muted and accelerated to 16x while YouTube keeps them non-skippable.
- Original mute, volume, and playback speed are restored after the ad.

## Permissions

Only Chrome storage is requested:

- `storage`

Execution is limited to:

- `https://www.youtube.com/*`
- `https://m.youtube.com/*`

## Install / update

1. Extract the ZIP.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Remove the previous YouTube Ad Shield build (recommended).
5. Click **Load unpacked**.
6. Select the extracted `youtube-ad-shield` folder.
7. Confirm version **1.6.1**.
8. Refresh all open YouTube tabs.

## Expected behavior

### Skippable ad

Ad begins → Skip becomes available → extension invokes YouTube's own skip path → requested video resumes immediately.

### Non-skippable ad

Ad begins → muted + accelerated → normal playback state restored when the ad finishes.

## Technical limitation

Chrome does not expose a silent extension API for creating a guaranteed OS-level trusted mouse click. v1.6 therefore works inside YouTube's MAIN JavaScript world and targets the player's own skip handling instead of using `chrome.debugger`.
