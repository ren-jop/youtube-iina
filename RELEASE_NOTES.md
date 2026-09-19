# YouTube for IINA 1.2.5

- Switch videos through IINA’s native playlist lifecycle. This activates its display link and coordinates audio startup with the new video, addressing new audio playing over the old frame in fullscreen. The existing window and sidebar remain in place. Rapid clicks start only the final selection.
- Add optional 1080p/720p limits that prefer H.264 for easier decoding on older Macs. Auto retains highest-available selection. Streaming still depends on the installed online-media/yt-dlp setup and the network.
- Diagnostics now read the installed manifest version and include playback-switch timing.
- Resolve missing channel attribution in the background without blocking feeds or search. Use known channel names for saved-channel feeds and support single-row modern cards.
- When YouTube omits its Related filter, conservatively match title topics within watch-next candidates. No arbitrary filler. Strict filter-only mode remains available; topic matching is heuristic and can miss relevant videos.
- Add Settings & data: history recording, missing-author lookup, compact cards, video statistics, Related mode, and playback quality.
- Save the latest visit to up to 5,000 videos locally, starting with this version. Export a JSON backup of local channels, history and these settings, or a subscriptions CSV. Import plugin JSON backups or subscriptions CSV files with a preview and merge; settings import is optional. Credentials are excluded. These files do not directly import into a Google account.

Validation: 56 automated tests, TypeScript checks, manifest verification and production bundles. Native fullscreen rendering and file dialogs require confirmation on macOS; they cannot be exercised in the Linux build environment.

Install the `.iinaplgz` asset below through IINA’s plugin preferences, replacing the existing plugin, then restart IINA. For slower playback, choose Settings & data → Playback quality → Up to 1080p, prefer H.264 (or 720p). If the window still resizes between videos, check IINA’s Resize window to fit video size preference.
