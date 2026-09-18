import type { PlayItemPayload } from "../shared/messages";

export function handlePlayItem(data: PlayItemPayload): boolean {
    if (!data || typeof data.videoId !== "string" || !/^[A-Za-z0-9_-]{11}$/.test(data.videoId)) return false;
    // Let IINA coordinate its own playback lifecycle and online-media hooks.
    iina.core.open(`https://www.youtube.com/watch?v=${data.videoId}`);
    return true;
}
