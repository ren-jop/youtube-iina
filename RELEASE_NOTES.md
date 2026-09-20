# YouTube for IINA 1.2.10

This pass prioritizes simple browsing and playback recovery.

- Keeps the native playlist-switch path from 1.2.6. Recovers idle players that still report stale playlist entries; an optional quality-setting failure no longer prevents opening a video.
- Repeated clicks no longer restart the same pending video. Discussion polling stops immediately when another video is selected. Loading/slow/error feedback stays inside the selected card, with retry available after 30 seconds and timing diagnostics. No automatic reload loop or video overlay.
- Defaults to 1080p with an H.264 preference instead of unlimited highest quality. Existing 720p settings remain; highest available can still be selected explicitly. This reduces potential decode load, not network or yt-dlp extraction time.
- Removed Wireframe and its selector. Restored always-visible statistics, preserved views through search parsing, and fixed Japanese view-count/publication labels being discarded. Missing values are not invented.
- Added optional Academic focus, compatible with Japanese mode. Uses local title rules to exclude obvious gaming/entertainment formats while keeping uncertain titles and educational analysis. No extra API calls, strict subject whitelist, difficulty ratings or credibility claims.

Validation: 67 regression tests, TypeScript checks, manifest verification, production builds and headless browser interaction checks. Tests cover idle recovery, quality-option failures, pending-selection deduplication, visible search/feed statistics, Japanese metadata, removed theme controls, and Academic/Japanese coexistence.

Native macOS playback and current YouTube/yt-dlp performance could not be exercised here. The original playback failure is not fully reproduced, so this release does not claim every loading problem is resolved. If videos still fail, the new playback timing diagnostics and IINA's online-media/yt-dlp log are needed to locate the remaining failure.

Install the `.iinaplgz` and fully restart IINA. Academic focus is in Settings & data and defaults off.
