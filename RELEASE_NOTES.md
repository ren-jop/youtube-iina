# YouTube for IINA 1.2.12

Subscription browsing and Home refresh fixes, preserving the minimal sidebar and native IINA playback path.

- Search loaded subscription videos instantly by title and channel name, including the local favorites-based feed. The filter is explicitly scoped to loaded videos, not a channel's entire archive.
- Subscription uploads sort newest first, with stable ties and unknown dates last. English and Japanese relative ages and supplied calendar dates are supported. The combined feed can retain up to 100 videos instead of 20.
- Both the Home tab and Home button clear searches, return to the top, and request a fresh feed. A click during a refresh queues a follow-up pass rather than being ignored or starting parallel requests. Signing in or out also queues the appropriate refresh and rejects stale results.
- Existing cards remain visible during refreshes and network failures. Empty searches explain that no loaded videos matched. Views, publication labels and channel navigation are preserved.
- Avoid unnecessary channel continuation requests when the local feed only needs five uploads per channel.
- If the preferred capped playback format is unavailable, yt-dlp can fall back to its best available combined format. This can exceed the selected resolution cap when necessary. Playlist cleanup errors no longer report a successfully selected video as failed. Native same-window switching remains unchanged.
- The update manifest now points to the renamed fork, ren-jop/youtube-iina.

Validation: 77 automated tests, TypeScript checks, production builds and root manifest verification. Browser validation covers subscription filtering, Home reset, retained cards, channel navigation, keyboard playback and existing sidebar flows.

Native macOS/IINA playback and live YouTube extraction performance could not be tested here. URL playback still depends on IINA's online-media plugin and yt-dlp; this release does not guarantee that every YouTube extraction failure is resolved.

Install the `.iinaplgz` asset and fully quit and reopen IINA.
