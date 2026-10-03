import type { PlayItemPayload, PlayPlaylistPayload } from "../shared/messages";

export function playbackFormatForQuality(quality: PlayItemPayload["quality"]): string | null {
    if (quality !== "1080" && quality !== "720") return null;

    const height = quality;
    // Keep high-frame-rate streams ahead of 30 fps fallbacks, while preferring
    // codecs that are much more likely to use hardware decode on older Intel
    // Macs. AV1 is intentionally left until the generic fallbacks because a
    // software-decoded AV1 stream can look like "low FPS" even at high quality.
    return [
        `bestvideo[height<=${height}][fps>30][vcodec^=avc1]+bestaudio`,
        `bestvideo[height<=${height}][fps>30][vcodec^=vp9]+bestaudio`,
        `bestvideo[height<=${height}][fps>30][vcodec!^=av01]+bestaudio`,
        `bestvideo[height<=${height}][vcodec^=avc1]+bestaudio`,
        `bestvideo[height<=${height}][vcodec^=vp9]+bestaudio`,
        `bestvideo[height<=${height}][vcodec!^=av01]+bestaudio`,
        `bestvideo[height<=${height}][fps>30]+bestaudio`,
        `bestvideo[height<=${height}]+bestaudio`,
        `best[height<=${height}]`,
        "best"
    ].join("/");
}

function applyPlaybackQuality(quality: PlayItemPayload["quality"]): void {
    try {
        const format = playbackFormatForQuality(quality);
        if (format) iina.mpv.set("ytdl-format", format);
    } catch {
        iina.console.warn("YouTube: quality preference unavailable; using player defaults");
    }
}

export function handlePlayItem(data: PlayItemPayload): boolean {
    if (!data || typeof data.videoId !== "string" || !/^[A-Za-z0-9_-]{11}$/.test(data.videoId)) return false;
    // "auto" deliberately leaves the resolver alone. IINA's official
    // Online Media plugin runs yt-dlp with its own preference and does not
    // consume mpv's ytdl-format option, so forcing a second "best" policy
    // here is misleading and can also override native resolver settings.
    applyPlaybackQuality(data.quality);
    const url = `https://www.youtube.com/watch?v=${data.videoId}`;
    // playFileInPlaylist activates IINA's display link and pauses until the new
    // video size is ready. Raw loadfile bypasses this and can play new audio over
    // the previous frame, especially in fullscreen. Index 0 is valid even before
    // IINA refreshes its cached playlist after insertion.
    if (iina.core?.status?.idle || iina.playlist.count() === 0) {
        iina.core.open(url); // No existing media/window lifecycle to preserve.
        return true;
    }
    const added = iina.playlist.add(url, 0) as unknown;
    if (added === false) return false;
    iina.playlist.play(0);
    // Do not mutate the playlist again until IINA confirms the new file loaded.
    // Clearing immediately after play(0) can race the native playlist switch.
    return true;
}

export function handlePlayPlaylist(data: PlayPlaylistPayload): boolean {
    if (!data || typeof data.playlistId !== "string" || !/^[A-Za-z0-9_-]{10,128}$/.test(data.playlistId)) {
        return false;
    }
    applyPlaybackQuality(data.quality);
    const url = `https://www.youtube.com/playlist?list=${encodeURIComponent(data.playlistId)}`;
    // Let yt-dlp/mpv expand the playlist natively. Unlike single-video
    // switching, we intentionally do not clear IINA's playlist after load.
    iina.core.open(url);
    return true;
}
