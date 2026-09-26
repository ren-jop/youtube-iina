# YouTube IINA Plugin

Plugin for browsing and playing YouTube videos in IINA from a sidebar UI. Includes anonymous mode (favorites-based feed + search) and logged-in mode (Home + Subscriptions).

If you like this plugin you might also be interested in [Jellyfin IINA Plugin](https://github.com/ada-bee/jellyfin-iina).

## Installation

1. Make sure you have the [online-media plugin](https://github.com/iina/plugin-online-media) (`yt-dlp`) installed and working. Before using this plugin, confirm it works by opening and playing a video directly from a URL in IINA.
2. Download `xyz.brbc.youtube.iinaplugin.iinaplgz` from the [latest release](https://github.com/ren-jop/youtube-iina/releases/latest).
3. Open the downloaded file to install it in IINA. If you have the original plugin installed, replace that copy; both use the same identifier.
4. Fully quit and reopen IINA so the previous plugin instance is unloaded.
5. Press Shift+Y. You should see the dark “YouTube for IINA” welcome image.

For future updates, the plugin's GitHub repository is `ren-jop/youtube-iina`.

## Usage

- Open the YouTube sidebar (Shift + Y).
- On next open, you can use the `Resume YouTube.png` item in Recent Items to skip straight to the sidebar.
- In anonymous mode, search and build a favorites list of channels to populate your feed.
- Search loaded subscription videos by title or channel using the subscription filter. Results update instantly without network requests. Uploads are ordered newest first; unknown publication dates appear last.
- Both Home buttons clear search and request a fresh feed. Clicking during a refresh queues one follow-up pass; existing cards remain usable while it loads.
- Click a channel name to browse its latest uploads inside the sidebar. Back restores the previous view and scroll position.
- Related includes topic matches and more uploads from the playing channel. Channel results can appear first while recommendations load, and revisiting a channel uses a shared three-minute cache. Japanese/Academic and other filters still apply; network failures or filters can leave no available results.
- Optionally, authenticate to load Home and Subscriptions (see [Disclaimer](#disclaimer) about using your Google account).

## Performance and Academic focus

Version 1.2.13 keeps the native playlist-switch path used in 1.2.6 and adds a lighter sidebar data path. Search parsing is iterative, duplicate translation requests are coalesced, and offscreen thumbnails wait until they are near the viewport before requesting/decoding. It still recovers idle players with stale playlist entries, avoids restarting the same pending video on repeated clicks, and stops discussion polling as soon as a new video is selected. Optional quality-setting failures do not prevent opening a video.

Wireframe is removed and view counts/publication labels are always shown when YouTube supplies them, including Japanese labels. Loading and slow/failure messages appear only inside the selected video card. No pause overlay or separate status banner is added.

Academic focus is optional and works together with Japanese discovery. It locally hides obvious gameplay, pranks, music videos, trailers and sports highlights while keeping uncertain titles and titles that signal educational analysis. For example, game theory, sports science, music lessons and Minecraft research stay eligible. It does not score source credibility or replace checking a source. Existing hidden-channel and excluded-phrase rules remain separate controls.

## Simple playback and Japanese immersion

Space pauses/resumes while browsing the sidebar; Enter activates a focused card. Text fields keep normal spaces. This plugin has no pause screen, playback banner or SponsorBlock skip/rewind popovers. Old SponsorBlock “ask” settings behave as “ignore”; explicit automatic skipping remains available.

The French “Reprendre / Rechercher un titre” pause/title-lookup screen is not implemented by this fork. If it appears, inspect other installed IINA plugins and disable their pause/title overlay. This plugin cannot disable another plugin’s UI.

The 日本語 switch applies Japanese filtering to video discovery, comments and live chat. Topic shortcuts and suggested subscriptions are in Feed. Suggestions open channel search; choose Favourite or Subscribe on the desired channel. Latin-script channel names stay searchable because many Japanese creators use them. Nothing is followed automatically.

Inspired by [NihongoTube’s immersion features](https://www.nihongotube.app/features/), without claiming its transcript-based JLPT estimates, subtitle detection or audio-language verification. Suggested channels: [Onomappu](https://www.youtube.com/@Onomappu), [Japanese Immersion with Asami](https://www.youtube.com/@japaneseimmersionwithasami4249), and [おさるのジョージ](https://www.youtube.com/@CuriousGeorgeJP).

## Discussion and discovery settings

Comments and Live chat open inside the YouTube sidebar for the playing video. These are read-only: no posting, threaded replies or archived chat replay. The chat integration uses an independent implementation of the live-chat protocol informed by [petamorikei/iina-youtube-chat](https://github.com/petamorikei/iina-youtube-chat); it does not require installing that plugin. Modern comment entity fields were checked against [YouTube.js](https://github.com/LuanRT/YouTube.js/blob/main/src/parser/classes/comments/CommentView.ts).

Settings & data includes a single dark appearance, surface opacity, Japanese discovery, hidden channels, excluded title phrases, clickbait-pattern filtering and minimum video length. Filters are optional local rules, not a judgement of accuracy or production quality. Unknown lengths are kept. Hidden channels match display names, which can change or collide. Japanese discovery now uses a resilient translation chain for English searches: Google translation first, MyMemory second, then a Japanese-biased YouTube query instead of failing the search. Search, signed-in Home and Related use Japanese/Japan discovery context and filter English spillover before rendering, while Subscriptions deliberately remain complete and language-neutral. Mixed Japanese titles containing Latin product names are allowed; spoken audio cannot be verified from titles. Saved channels stay unchanged. These preferences travel with your JSON backup.

## Features

- Anonymous mode with merged latest uploads from favorited channels.
- Logged-in mode with personalized Home and Subscriptions feeds.
- Related video recommendations for what to watch next.
- Channel/video search and channel favorites management.
- Playback in IINA by opening standard YouTube watch URLs.
- Optional SponsorBlock integration with per-segment controls (`ignore`, `skip`) for Sponsor, Unpaid/Self Promotion, and Preview/Recap.

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

## 1.2.2 native stability follow-up

This release removes `mpv.pause.changed` and `mpv.time-pos.changed` listeners entirely. IINA's native property-event handler can defer reading a borrowed mpv event pointer; catching JavaScript exceptions cannot protect against a native memory fault. The sidebar did not consume the position telemetry anyway.

Playback now opens through `core.open`. SponsorBlock uses IINA's guarded `core.status` reads and `core.seekTo` API rather than raw mpv reads/writes, performs no playback reads when disabled, and stops on end-of-file and window close. Shift+Y routes only through numeric managed-player handles, avoiding native string-label lookups after a plugin unload. Reused player windows can resume lifecycle reporting.

The startup PNG is now a dark welcome screen. The built-in image-generation prompt and asset location are recorded in [docs/startup-image.md](docs/startup-image.md).

Validation: 23 automated regression tests, TypeScript checks, manifest verification, and bundle compilation. Native Mac crash reproduction and live-account testing remain unverified. If the new release still crashes, share the IINA/macOS versions, the action that triggers it, and the crashed thread from the macOS crash report.

Native API references: [mpv property event handling](https://github.com/iina/iina/blob/develop/iina/MPVController.swift), [guarded core status](https://github.com/iina/iina/blob/develop/iina/JavascriptAPICore.swift), and [player routing](https://github.com/iina/iina/blob/develop/iina/JavascriptAPIGlobal.swift).

## 1.2.3 search/feed transport fix and diagnostics

YouTube responses now cross the native message bridge as encoded envelopes. This avoids a failure in IINA's template-literal message delivery when HTML or JSON contains backticks or `${…}`. Previous tests bypassed this boundary; new tests reproduce it.

To troubleshoot, expand **Diagnostics** at the bottom of the sidebar, reproduce the failed request, click **Select report**, and press Command+C. Share that report. It includes plugin version, request stages, timing, and HTTP status without tokens, search terms, or response content. Entries are bounded and kept only in memory. Native plugin logs also contain safe request categories and timing.

This update passes 36 regression tests, TypeScript checks, manifest verification, and the production build. Native Mac and live-account testing remain unverified.


## 1.2.5 playback and portable data

Video selection now inserts into the current player's playlist and uses `playlist.play`, then removes previous entries so they do not autoplay. Unlike raw `loadfile`, [IINA's native playlist switch](https://github.com/iina/iina/blob/develop/iina/PlayerCore.swift) activates the display and pauses audio until video sizing is ready. The plugin does not toggle fullscreen, reopen a playing window, or restore native mpv property observers. Rapid clicks are coalesced; closing the window cancels a pending selection. Playback timing appears in Diagnostics.

**Settings & data** at the bottom of the sidebar controls playback quality (Auto or H.264-preferred 1080p/720p), missing-channel lookups, compact cards, statistics, Related matching, and local history. If a Related chip is missing, title-topic matching filters watch-next candidates conservatively; it is not semantic matching and may return fewer results. Strict mode disables that fallback.

History records the latest visit per video (up to 5,000) after file-loaded events, not watch progress, and starts with this version. JSON backups contain saved local channels, these settings and history. CSV exports use Channel Id, Channel Url and Channel Title columns. Imports accept the versioned plugin JSON or a subscriptions CSV, validate before writing, preview counts, merge without deleting existing channels, and optionally import settings. OAuth credentials and caches are excluded. Native folder/file choosers handle transfer; saved backups are verified and revealed in Finder. Keep a backup before uninstalling the plugin. Direct import of these files into Google is not provided.

Mac checks: switch from search and feed while fullscreen, including rapid selections; verify new picture and sound belong to the same video, the sidebar remains visible, and no old video autoplays next. Export a backup, cancel an import, then import a backup and a subscriptions CSV; verify names and settings. Automated tests cannot validate the native display or file dialogs.


## 1.2.6 sidebar refinement

The dark sidebar keeps search/navigation fixed while lists scroll. Recent exposes locally recorded playback, the inline status follows video opening, `/` focuses search, and the gear opens Settings & data. Feed and Related refreshes preserve results while loading, unchanged cards retain DOM/image identity, errors keep usable previous results, and tabs remember their scroll positions. Author lookups are deferred until cards approach the viewport. Search no longer waits on subscription-state hydration to show videos.

Related uses a bounded topic search when the explicit filter is missing or returns no cards, with a three-minute cache and shared in-flight requests. It does not fill with home recommendations. This is title matching, not a semantic guarantee; strict filter-only mode remains available.

`node scripts/test-sidebar-browser.mjs` runs the interaction checks after a production build when Playwright and its Chromium browser are installed. `PLAYWRIGHT_MODULE` can point to an installed Playwright module, and `CHROMIUM_MODULE` optionally points to an installed @sparticuz/chromium module. Tests use a local HTTP server and simulated native/network messages, so they do not require account credentials or contact YouTube. Native IINA playback needs Mac testing separately.
