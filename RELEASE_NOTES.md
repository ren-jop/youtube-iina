## 1.2.20 — Strict Japanese Search and cleaner Focus control

- **JP mode applies to Search again.** English or mixed-language results no longer leak through while the Japanese filter is active.
- Latin-script queries keep the text you typed in the UI, but the backend query gets a small Japanese discovery hint and returned video titles are still strictly validated as Japanese.
- Japanese queries are sent unchanged.
- Search channels are also filtered toward Japanese discovery while JP mode is active.
- The Focus control is now a fixed **32×32 target icon** matching the other header controls instead of a text pill that changes width with the remaining time.
- Focus time and purpose remain available through the status text and button tooltip without shifting the toolbar.
- Removed a stale translation-parser test left over from the older external-translation implementation.

## 1.2.19 — Intentional learning without the rabbit hole

- Reworked Japanese mode around **passive discovery instead of a global language ban**. Home and Subscriptions stay Japanese while JP mode is active, but deliberate Search is all-language.
- Search now sends the **exact query you typed**. The unused Google/MyMemory translation path and network permissions were removed.
- Related follows the language of the video you intentionally opened: Japanese videos keep Japanese follow-ups, while an English tutorial can keep useful English follow-ups.
- English subscription uploads are no longer visible during Japanese mode.
- Added **Focus sessions** from 15 minutes to 3 hours. You name what you are there to do; the plugin searches that purpose and pauses Home + Subscriptions for the session.
- The daily 15/30/45/60 minute limit now covers **Home + Subscriptions together** instead of Home alone.
- The passive-browsing timer now counts recent browsing interaction such as scrolling/clicking, rather than burning time merely because a feed is left open while a useful video plays.
- Saved channels, History and channel pages remain deliberate all-language tools.
- Existing Japanese discovery locks still support durations up to **three calendar months**.

## 1.2.18 — Longer Japanese locks and English isolation

- Japanese-only blocks can now run for **3 days, 1 week, 2 weeks, 1 month, 2 months or 3 months**, in addition to the existing shorter choices and until-midnight option.
- Month-long locks use calendar months and preserve the day where possible, instead of approximating three months as a fixed number of days.
- While JP mode is active, English video cards are hidden from Home, Search, Related, History and channel browsing, and English saved-channel cards are hidden too.
- **Subscriptions are the deliberate English exception**: the signed-in Subscriptions feed stays language-neutral, so existing English subscriptions remain accessible during a long Japanese-only block.
- Added regression coverage for the three-month duration and the Subscriptions-only English exception.

## 1.2.17 — Japanese Home, subscription truth and intentional browsing

- Japanese Home now targets about **50 videos** instead of 36, while keeping strict original-title filtering so English-titled uploads are not presented as Japanese.
- Home topic chips are available in both Japanese and English. Sparse categories can fetch extra topic-specific results instead of showing only one matching card.
- Removed the old **Academic / Focus** filter entirely.
- Added **Japanese-only blocks** for 1, 3, 6, 12 or 24 hours, or until local midnight. While a block is active, JP mode cannot be switched off.
- Added a configurable **daily Home discovery budget** (off / 15 / 30 / 45 / 60 minutes). Only general Home browsing counts; Search, Subscriptions, Related and channel pages remain usable.
- When the Home budget is exhausted, a deliberate 15- or 30-minute intentional session can be opened by naming what you are there to watch.
- Channel pages now include a real **Subscribe / Unsubscribe** control.
- Subscription-feed items are checked against current channel subscription state so confirmed unsubscribed channels are removed.
- Existing same-window IINA playback, comments, live chat, local history, hidden-channel rules and related-video behavior are unchanged.

## 1.2.16 — Unsubscribe fix

- Fixed subscribed channels being misread as unsubscribed when YouTube nests the channel ID inside the button command.
- Search results now show **Unsubscribe** for subscribed channels and preserve known subscription state if a refresh fails.
- Successful subscribe/unsubscribe calls now keep the intended state even when YouTube's mutation response omits the updated button state.
- Includes the 1.2.15 JP discovery changes: unlocalized original titles, strict Japanese-title filtering, populated JP Home fallback recommendations, restored topic chips, and removal of Japanese-learning subscription suggestions.

## 1.2.15 — Japanese discovery cleanup

- JP mode keeps YouTube titles unlocalized while still using Japan for discovery, so English originals do not masquerade as Japanese titles.
- English search text stays unchanged in the UI. Translation is used only internally to improve discovery, then video results are filtered by the title itself.
- Signed-in JP Home now walks deeper into recommendations and falls back to broad native-Japanese discovery when strict filtering would otherwise leave Home nearly empty.
- Home category chips remain available with a single genuine matching recommendation instead of disappearing on smaller JP feeds.
- Removed the Japanese-learning “Suggested subscriptions” onboarding panel; JP mode is now just Japanese content discovery.
- Subscriptions remain language-neutral.

# YouTube for IINA 1.2.14

Personalized Japanese Home expansion and YouTube-style topic chips.

- Signed-in Home remains YouTube's own personalized `FEwhat_to_watch` feed rather than replacing recommendations with searches.
- Japanese Home now keeps walking recommendation continuations until it has a useful number of Japanese-language candidates, instead of filtering a small first page down to only a handful of videos.
- Home now keeps up to 36 recommendations.
- Local recent viewing history gently re-ranks YouTube's recommendations toward niches and channels you actually watch. Loaded subscribed/favourite channel names receive a small additional boost; YouTube's own ordering remains the primary signal.
- The Home feed now shows YouTube-style topic chips derived from the content that is actually present in your personalized Home plus your recent interests. Examples include Philosophy, Chemistry, Science, Mathematics, Football technique, Programming and Study & learning.
- In Japanese mode those chips use Japanese labels such as 哲学, 化学 and サッカー技術.
- Clicking a topic chip never starts a search. It filters the already-loaded personalized Home feed locally, and All / すべて restores the full feed.
- The old fixed Japanese shortcut chips that launched searches were removed.
- Japanese-mode changes trigger a real Home refresh so switching JP on or off immediately updates the recommendation locale.
- Existing 1.2.13 translation resilience, Japanese search filtering, iterative parsing and viewport-based thumbnail loading remain intact.

Validation adds regression coverage for topic derivation, local topic filtering and history/channel-aware ranking, alongside the existing TypeScript, test and production package checks.

Install the `.iinaplgz` release asset and fully quit and reopen IINA.

# YouTube for IINA 1.2.13

Japanese-mode reliability, Japanese discovery quality and sidebar performance fixes.

- Japanese search no longer fails when one translation service is unavailable. It tries a fast Google translation endpoint, falls back to MyMemory, then falls back to a Japanese-biased YouTube query instead of aborting the search.
- Japanese Search now filters English spillover before rendering. Mixed Japanese titles with Latin product names remain valid.
- Signed-in Home uses a Japanese/Japan client locale in Japanese mode and filters recommendations toward Japanese-language videos. Subscriptions deliberately remain language-neutral so English subscriptions are never hidden.
- Related results follow Japanese discovery mode as well.
- Search response parsing is iterative rather than recursive, avoiding deep-response stack pressure.
- Offscreen thumbnails wait until they are near the viewport before requesting/decoding, reducing WKWebView work during large feed refreshes.
- Translation requests are cached and concurrent duplicate translation requests are coalesced.

Validation includes Japanese response parsing/filter tests in addition to the existing automated suite, TypeScript checks and production builds.

Install the `.iinaplgz` release asset and fully quit and reopen IINA.

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
