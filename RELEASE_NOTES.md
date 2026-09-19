# YouTube for IINA 1.2.4

- Play clicked videos in the existing player, avoiding the general open action that can create another window or loading panel.
- Keep the sidebar, active tab, list and browsing position when playback changes. Click Related to refresh recommendations for the current video.
- Use YouTube’s explicit Related filter instead of mixed Up next recommendations. If the filter is unavailable, show an explanation rather than unrelated filler. Relevance still depends on YouTube’s filter.
- Read channel names, views and publication dates from modern YouTube cards; support those cards in search too.
- Include the previously packaged 1.2.3 HTTP transport fix for stalled search/feed requests and built-in request diagnostics.
- Retain the native crash mitigations and updated startup artwork from 1.2.2.

Validation: 43 automated regression tests, TypeScript checks and production builds. Native macOS/IINA playback could not be exercised in the build environment.

Install the `.iinaplgz` asset below through IINA’s plugin preferences, replacing the existing YouTube plugin, then restart IINA.
