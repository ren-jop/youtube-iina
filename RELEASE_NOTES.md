## YouTube for IINA 1.2.2

### Fixes
- Remove native mpv property observers that expose a crash-prone deferred event-data path.
- Use IINA's core playback APIs and guarded status reads; stop SponsorBlock polling at end-of-file and window close, and skip playback reads while disabled.
- Use numeric player handles for Shift+Y and prevent the first activation from toggling the sidebar closed.
- Include the subscription authentication, token refresh, feed parsing, and loading fixes from the previous development pass.
- Replace the red startup gradient with a dark YouTube for IINA welcome screen.

### Install
Download `xyz.brbc.youtube.iinaplugin.iinaplgz`, open it in IINA, then fully quit and reopen IINA. Replace the existing YouTube plugin rather than keeping two copies. The online-media/yt-dlp plugin is still required for playback.

### Verification
23 automated regression tests, TypeScript checks, manifest verification, and the production build pass. Tests use mocked IINA APIs and synthetic YouTube responses. Native Mac crash reproduction and live Google-account testing remain unverified; this release addresses identified crash risks, not every possible IINA or yt-dlp failure. If a crash persists, share the IINA/macOS versions, the triggering action, and the crashed-thread section of the macOS report.
