# Privacy Policy — Ad Shield for YouTube™

Ad Shield for YouTube™ is designed to perform its core ad handling locally in the user's browser.

## Data handled by the extension

The extension processes limited website content on YouTube pages in order to detect advertising states, identify available Skip Ad controls, and provide creator sponsorship skipping.

Normal YouTube ad detection and handling happens locally on the user's device.

## Creator sponsorship skipping and SponsorBlock

When **Creator sponsorships** is enabled and the user opens a YouTube video, the extension requests community-submitted sponsor-segment data from the SponsorBlock API at:

- `https://sponsor.ajay.app/`

To reduce disclosure of viewing activity, the extension does **not** send the full YouTube video ID in this request. It computes SHA-256 of the video ID locally and sends only the first four hexadecimal characters of that hash to SponsorBlock's hash-prefix endpoint. The response may contain candidate video IDs and sponsor segments, and the extension filters that response locally for the currently playing video.

As with any direct HTTPS request, SponsorBlock's server may receive standard connection information such as the user's IP address. Ad Shield for YouTube™ does not add account identifiers, cookies, names, email addresses, or other personal profile information to the SponsorBlock request.

Creator sponsorship skipping can be disabled at any time from the extension popup. When disabled, the extension does not request SponsorBlock segment data.

## Local storage

The extension uses Chrome's storage API to save:

- Whether protection is enabled or disabled
- Whether creator sponsorship skipping is enabled or disabled
- The local Ads Handled counter
- The local creator sponsorships skipped counter

This information is used only to provide extension functionality and local statistics.

## Report Ad Not Skipped

The popup includes a **Report Ad Not Skipped** button. Clicking it opens a pre-filled GitHub issue form containing limited technical diagnostics such as the extension version, whether an ad was active, whether a Skip control was visible, and whether the YouTube player was detected.

The extension does not automatically submit the report. The user can review, edit, or close the GitHub issue page before choosing whether to submit anything publicly.

The report does not automatically include the current YouTube video URL or video ID.

## Data sharing

Ad Shield for YouTube™ does not:

- Sell user data
- Use user data for advertising
- Use analytics or tracking services
- Collect names, email addresses, payment information, health information, authentication credentials, precise location, or personal communications
- Send YouTube account credentials to the developer

The only automatic third-party request added for creator sponsorship skipping is the privacy-reduced SponsorBlock hash-prefix lookup described above.

## Website access

The extension operates on:

- `https://www.youtube.com/*`
- `https://m.youtube.com/*`

It also has network access to:

- `https://sponsor.ajay.app/*`

The SponsorBlock host access is used only to retrieve creator sponsorship segment data.

## Remote code

The extension does not download or execute remote JavaScript or WebAssembly code. All executable extension code is included in the extension package. SponsorBlock responses are treated only as JSON data containing segment metadata.

## External links

The extension popup contains user-initiated links to the developer's portfolio and, through the reporting feature, GitHub. No report is automatically submitted by the extension.

## Limited Use

Information processed by the extension is used only to provide the extension's disclosed functionality.

## Contact

Developer: Hakam Qadi

Portfolio:
https://hakamportfolio.netlify.app/

GitHub:
https://github.com/HakamQadi/youtube-ad-shield
