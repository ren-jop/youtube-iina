# YouTube IINA Plugin

Plugin for browsing and playing YouTube videos in IINA from a sidebar UI. Includes anonymous mode (favorites-based feed + search) and logged-in mode (Home + Subscriptions).

If you like this plugin you might also be interested in [Jellyfin IINA Plugin](https://github.com/ada-bee/jellyfin-iina).

## Installation

1. Make sure you have the [online-media plugin](https://github.com/iina/plugin-online-media) (`yt-dlp`) installed and working. Before using this plugin, confirm it works by opening and playing a video directly from a URL in IINA.
2. Open IINA Settings > Plugins.
3. Select Install from GitHub.
4. Enter `rin677/youtube-iina`.
5. Restart IINA if it does not appear immediately.

## Usage

- Open the YouTube sidebar (Shift + Y).
- On next open, you can use the `Resume YouTube.png` item in Recent Items to skip straight to the sidebar.
- In anonymous mode, search and build a favorites list of channels to populate your feed.
- Optionally, authenticate to load Home and Subscriptions (see [Disclaimer](#disclaimer) about using your Google account).

## Features

- Anonymous mode with merged latest uploads from favorited channels.
- Logged-in mode with personalized Home and Subscriptions feeds.
- Related video recommendations for what to watch next.
- Channel/video search and channel favorites management.
- Playback in IINA by opening standard YouTube watch URLs.
- Optional SponsorBlock integration with per-segment controls (`ignore`, `ask`, `skip`) for Sponsor, Unpaid/Self Promotion, and Preview/Recap.

## Screenshot

![YouTube IINA Plugin screenshot](images/screenshot.png)

## Planned features

- Watch state/progress display and reporting
- Channel view

## Disclaimer

- This project is in an **early development stage** and may break as YouTube changes response formats.
- It uses YouTube InnerTube and other unofficial/private APIs, which may violate YouTube Terms of Service.
- Google account sign-in is optional but risky; use at your own discretion.

## Stability fixes in this fork

- Preserve HTTP error responses so expired sessions can refresh and device login can keep waiting for approval. Respect OAuth polling backoff.
- Load feeds without waiting on a separate anonymous player request for every video.
- Parse video cards iteratively, support lockup cards, and avoid hiding ordinary videos just because their title contains “shorts”, “ad”, or “sponsored”.
- Retain subscription results on refresh failure and invalidate pending results on sign-out.
- Stop delayed sidebar work when a player closes, and allow the YouTube menu to create a new player afterwards.
- Read complete configuration responses instead of silently cutting them at 120 KB.

### Build and verify

```sh
bun install --frozen-lockfile
bun test
bun run typecheck
bun run verify:root-info
bun run build
```

CI uploads a built `.iinaplgz` archive for each push and pull request. Download the artifact from the Actions run, unzip it, and open the `.iinaplgz` file to install it in IINA. The source checkout alone does not contain compiled JavaScript.

### Mac smoke test

1. Install the built fork and restart IINA. Open the sidebar with Shift+Y.
2. Sign in, leave the activation screen open for at least one polling interval, then approve it. Check Home and Subscriptions.
3. Refresh Subscriptions, temporarily disconnect the network, and retry. Previously loaded items should remain visible with an error message.
4. Sign out while a refresh is pending; signed-in videos must not return afterwards.
5. Close the player while loading a feed, then reopen YouTube from the menu. Repeat with SponsorBlock enabled.
6. Play a public video directly by URL and from the feed. Playback uses the separate online-media/yt-dlp plugin. This sidebar's OAuth sign-in does not transfer credentials to yt-dlp; members-only playback still requires authentication in that playback setup.

Automated tests use synthetic response fixtures and mocked IINA APIs. They do not verify a live Google account or native macOS crash behavior. If IINA still quits, include its version, the action immediately before the crash, and the macOS crash report (remove personal paths/tokens before sharing).
