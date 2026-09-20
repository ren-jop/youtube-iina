# YouTube for IINA 1.2.8

- Japanese mode translates English searches through MyMemory before searching and replaces the search-box text with the Japanese query. Japanese input is kept as entered. Translations are cached in memory, time out after eight seconds and never silently fall back to an English search. Queries are sent to the translation provider only when Japanese mode is enabled.
- Japanese discovery now strictly filters Feed, Search and Related to predominantly Japanese titles containing kana, rather than merely setting the region. English, Chinese and ambiguous kanji-only titles are excluded. This is title-language filtering, not verification of the video's spoken audio. Recent history remains accessible.
- Late translations cannot overwrite a newer submitted search or text you edited while waiting.

Validation: TypeScript checks, 63 regression tests, production builds and Chromium interaction tests, including translated search-box text and request payload. Native macOS playback and the external translation service were not live-verified here.

Install the `.iinaplgz` and fully restart IINA. Keep Japanese discovery enabled under Settings & data.
