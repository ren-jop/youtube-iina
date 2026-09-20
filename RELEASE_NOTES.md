# YouTube for IINA 1.2.9

- Fixed Space in the sidebar: pauses/resumes IINA instead of re-opening a focused video or scrolling. Held keys do not repeatedly toggle. Text inputs keep normal spaces; Enter still activates a card. Submitting search releases text-field focus.
- Removed the extra now-playing/opening banner, thumbnail play overlays, and SponsorBlock skip/rewind popovers. Automatic skipping remains optional. Legacy “ask” settings become “ignore”.
- Added a quick 日本語 toggle and Japanese topic shortcuts in Feed. Japanese filtering now also covers comments and live chat; toggling restores/hides existing discussion immediately without another request. Latin-script channel names remain searchable so Japanese creators can be found and followed.
- Added Suggested subscriptions in Feed: Onomappu, Japanese Immersion with Asami, and おさるのジョージ. Find channel opens search; use Favourite or Subscribe on the channel you choose. No automatic follows, difficulty labels or subscription IDs are fabricated.

The French “Reprendre / Rechercher un titre” pause screen in the report is not part of this fork. It appears to be another plugin’s title-lookup overlay. This release cannot disable another installed plugin: inspect IINA Settings → Plugins and turn off that plugin’s pause overlay. IINA’s own playback controls remain unchanged.

Validation: 63 passing regression tests, including the native pause command and closed-window guard; TypeScript checks, manifest verification, production builds and Chromium interaction tests. Browser checks exercise Space on a card, spaces in text input, absence of the banner, Japanese comment filtering, topic/suggestion navigation and existing browsing features. Native macOS interaction with other installed plugins remains unverified.

Install the `.iinaplgz` and fully restart IINA. Diagnostics should report 1.2.9.
