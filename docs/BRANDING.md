# Margin branding

Margin's mark combines three product ideas in one small icon:

- the violet rule is the page margin;
- the cyan tab is the note being captured at the moment it matters;
- the white lowercase `m` is the Margin monogram.

The dark background is `#242433`, which is also the Slack app background color in `manifest.json`.

## Assets

| Asset | Use |
| --- | --- |
| `assets/margin-app-icon.png` | 512 × 512 upload-ready Slack app icon |
| `assets/margin-app-icon.svg` | Editable vector source for the app icon |
| `assets/margin-logo.svg` | Horizontal wordmark for the README, Devpost, slides, and demo materials |

Keep clear space around the icon and do not place extra text inside the square app icon. The monogram is designed to remain recognizable at Slack's small avatar sizes.

## Apply the icon to the Slack app

The repository manifest keeps the app name, descriptions, and matching background color under version control. Upload the image itself through Slack's app settings:

1. Open the Margin app at `api.slack.com/apps`.
2. Open **Basic Information**.
3. Scroll to **Display Information** and **App icon & Preview**.
4. Upload `assets/margin-app-icon.png`.
5. Confirm the preview uses the dark `#242433` background and save the changes.

Reinstall the app only if Slack indicates that the changed configuration requires it. The icon is visual metadata and does not add scopes or change Margin's runtime behavior.

## Submission use

Use `assets/margin-logo.svg` as the primary horizontal logo. Use the PNG icon for square placements such as Slack, Devpost thumbnails, and social cards. Prefer the SVG sources for any resized export so edges remain sharp.
