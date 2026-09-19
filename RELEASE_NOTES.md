# YouTube for IINA 1.2.6

- Refined dark sidebar: compact cards, quieter tabs, fixed search/navigation, accessible keyboard focus, reduced-motion support and a settings shortcut. Existing features remain available.
- Added an inline opening/now-playing status and a Recent tab for locally recorded videos. Press `/` outside text fields to focus search. Tabs remember their scroll positions.
- Refreshes preserve unchanged cards and decoded thumbnails instead of rebuilding them. Failed feed/search refreshes keep previous usable results.
- Search displays videos before optional subscription-state lookups finish. Repeated identical pending searches and refresh clicks avoid duplicate work. Missing-author lookups start near the visible viewport.
- Reduced initial browse prefetch to the number of videos displayed.
- Related recovers missing or empty filter results through a bounded topic search, deduplicates results, excludes the playing video, and caches successful results for three minutes. Supports additional watch-next card wrappers. Strict filter-only mode is still available. Topic matching remains heuristic and can return fewer results.

Validation: 57 passing regression tests, TypeScript checks, manifest verification and production builds. Headless Chromium interaction tests exercised initial feed, unchanged-card identity during refresh, offline feed/search recovery, playback-status messages, Related search/cache, Recent, keyboard search, settings and 320px layout. The rendered 400px dark sidebar was visually inspected. Browser tests use simulated IINA/YouTube responses; native macOS video rendering and live YouTube behavior cannot be verified in this environment. This release addresses sidebar flicker and unnecessary work, but does not establish that every native playback flash is fixed.

Install the `.iinaplgz` asset and restart IINA. Settings & data remains available at the bottom, or from the gear button beside search.
