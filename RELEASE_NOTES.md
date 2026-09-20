# YouTube for IINA 1.2.7

- Added integrated read-only Comments and Live chat tabs for the playing video. Comments support legacy and modern responses and a Load more button. Live chat handles text, emoji text, Super Chat amounts, membership notices and message moderation, keeps at most 200 messages, and follows new messages only when you are near the bottom. No extra chat window or Google login is required.
- Live-chat integration is an independent lightweight implementation informed by petamorikei/iina-youtube-chat, using this plugin’s encoded HTTP bridge. Chat replay, posting, threaded replies and rich sticker images are not included.
- Chat stops polling on tab changes, document hiding, the plugin’s hide shortcut, playback end and window close. Stale responses cannot populate a different video’s discussion. Transient failures retry with bounded backoff.
- Flatter neutral dark styling, adjustable surface opacity and an optional Wireframe theme under Settings & data. Tabs wrap on narrow sidebars. Transparency depends on IINA’s native sidebar background.
- Japanese discovery / 日本語 requests Japanese results with Japan as the region. It does not translate content, guarantee Japanese-only results or replace saved channels. Related recognizes Japanese filter labels.
- Hide channel on video cards removes matching display names from Feed, Search and Related. Edit the hidden-channel list to undo. Names are not unique and may change. Recent history stays available.
- Optional Reduce clickbait, excluded title phrases and minimum video length filters work locally. Clickbait filtering uses explicit title patterns, not an AI-quality detector; unknown durations are retained. All new settings are included in existing JSON backups.
- Initial feeds show uploads as saved channels finish instead of waiting for the slowest channel. Feed requests time out after 12 seconds and searches after 15 seconds. Channel browsing stops retrying alternate layouts after transport/HTTP failures. Existing results remain usable during refresh.

Validation: 62 passing regression tests, TypeScript checks, manifest verification and production builds. Headless Chromium tests cover feed retention, offline recovery, simulated playback, Related, comments/chat rendering, stale response rejection, chat polling cancellation, Japanese requests, hide/unhide, appearance settings and a 320px sidebar. Dark and wireframe layouts were visually inspected. Tests use simulated IINA/YouTube responses; live YouTube behavior and native macOS playback cannot be verified here.

Install the `.iinaplgz` asset and fully quit/reopen IINA. Diagnostics should report 1.2.7. New discovery and filter settings are off by default.
