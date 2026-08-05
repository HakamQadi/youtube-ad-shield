# YouTube Ad Shield

A lightweight Chrome Manifest V3 extension that automatically handles YouTube ads without using `chrome.debugger`, browser-coordinate clicks, analytics, or external servers.

> Current version: **1.6.0**

## Features

- Automatically activates YouTube's **Skip / Skip Ad / Skip Ads** action when available.
- Uses YouTube page/player-level skip paths instead of Chrome debugger input.
- Mutes and accelerates non-skippable ads while they remain non-skippable.
- Restores the original mute, volume, and playback-speed state after the ad.
- Removes common promoted/overlay ad UI.
- Includes an enable/disable popup and a local handled-ad counter.
- Works on desktop and mobile YouTube URLs declared in the manifest.

## Privacy and permissions

The extension requests only:

```json
"permissions": ["storage"]
```

It runs only on:

```text
https://www.youtube.com/*
https://m.youtube.com/*
```

There is no `chrome.debugger` permission, remote code, analytics, `fetch`, XMLHttpRequest, WebSocket, or external API communication. See [PRIVACY.md](PRIVACY.md).

## How v1.6 skips ads

When YouTube exposes a visible Skip control, the extension attempts the player's own skip path through page-level strategies including:

1. A Media Session `skipad` action when YouTube exposes one.
2. Readable player skip methods such as `skipAd()` when available.
3. A MAIN-world event bridge installed at `document_start` that replays the exact Skip interaction through page listeners.
4. An inline Skip handler when present.
5. A normal MAIN-world DOM click as the last fallback.

Attempts are restricted to an active YouTube ad state and a visible Skip control. There are no delayed screen-coordinate clicks that can land on playlist navigation after the ad disappears.

## Install locally

1. Download or clone this repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select this repository folder.
6. Refresh open YouTube tabs.

## Publish your own fork/repository

If you have the GitHub CLI installed and authenticated, this repository includes a helper:

```bash
./publish-to-github.sh
```

It creates a public repository named `youtube-ad-shield`, adds `origin`, and pushes the `main` branch.

## Validation

The included GitHub Actions workflow validates:

- `manifest.json` parses correctly;
- all JavaScript files pass `node --check`;
- the `debugger` permission has not been added.

For a local check:

```bash
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8'))"
node --check content.js
node --check main.js
node --check popup.js
```

## Known limitation

YouTube can change its player internals or ad markup at any time. This extension intentionally avoids the Chrome debugger API, so future YouTube changes may require updating the page-level skip integration.

## License

MIT. See [LICENSE](LICENSE).
