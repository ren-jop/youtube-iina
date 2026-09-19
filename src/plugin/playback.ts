import type { PlayItemPayload } from "../shared/messages";

export function handlePlayItem(data: PlayItemPayload): boolean {
    if (!data || typeof data.videoId !== "string" || !/^[A-Za-z0-9_-]{11}$/.test(data.videoId)) return false;
    // Target this sidebar’s existing player. The general open action may create
    // another window and a separate loading panel. mpv still runs its URL hooks.
    iina.mpv.command("loadfile", [`https://www.youtube.com/watch?v=${data.videoId}`, "replace"]);
    return true;
}
