# YouTube for IINA 1.2.11

Channel browsing stays inside IINA, with the same minimal sidebar UI.

- Click a video's channel name or a channel in Search/Channels to see its latest uploads in the sidebar. Back returns to the previous view and its scroll position, without starting playback.
- Related also loads the current channel's uploads. These can appear while slower recommendations/search are still running. Topic matches have reserved space; if none arrive, more channel uploads fill the list. The playing video and duplicate videos are excluded.
- Channel browsing and Related share a bounded three-minute cache and concurrent requests. One page of channel uploads is fetched, without waiting for additional pages. Late results append instead of moving the card under the pointer.
- Channel IDs now survive classic/modern parsing and search conversion. When missing, an explicit channel visit can resolve the video's author. Missing channel labels on that channel's own uploads use its known name.
- Views and publication text remain below the channel name and wrap instead of clipping. Actual dates are preserved when YouTube supplies them; relative ages stay relative. Missing values are not invented, and cards do not wait for individual metadata requests.
- Japanese, Academic focus, hidden-channel and other local filters also apply to channel uploads and the Related fallback. Existing playback switching behavior is preserved.

Validation: 72 automated tests, TypeScript checks, manifest verification, production builds, and headless browser checks covering channel navigation, cache reuse, non-playing channel clicks, early channel fallback, stable late results, visible statistics, and the existing UI flows.

Related can still be empty when both YouTube requests fail, a channel has no other public videos, or your filters exclude every result. Native macOS/IINA playback and live YouTube response performance could not be tested in this environment.

Install the `.iinaplgz` asset and fully restart IINA.
