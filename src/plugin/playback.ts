import type { PlayItemPayload } from "../shared/messages";

export function handlePlayItem(data: PlayItemPayload): boolean {
    if (!data || typeof data.videoId !== "string" || !/^[A-Za-z0-9_-]{11}$/.test(data.videoId)) return false;
    try {
        if (data.quality === "1080" || data.quality === "720") {
            const height = data.quality;
            iina.mpv.set("ytdl-format", `bestvideo[height<=${height}][vcodec^=avc1]+bestaudio/best[height<=${height}]/bestvideo[height<=${height}]+bestaudio/best[height<=${height}]`);
        } else if (data.quality === "auto") {
            iina.mpv.set("ytdl-format", "bestvideo+bestaudio/best");
        }
    } catch {
        // An optional quality preference must not prevent opening a video.
        iina.console.warn("YouTube: quality preference unavailable; using player defaults");
    }
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
    // Match the old replace behavior: don't autoplay the previous video at EOF.
    iina.mpv.command("playlist-clear", []);
    return true;
}
