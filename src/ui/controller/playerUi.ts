import { state } from "../state";
import { MESSAGE_NAMES } from "../../shared/messages";
import { getOptions } from "../storage/libraryData";
import { recordDiagnostic } from "../bridge/diagnostics";
let selected: { videoId:string;title:string } | null = null;
let pending = "", slowTimer = 0, timeoutTimer = 0;
function clearTimers(): void { clearTimeout(slowTimer); clearTimeout(timeoutTimer); }
function showStatus(videoId: string, text: string): void {
    document.querySelectorAll<HTMLElement>("[data-playback-status]").forEach(el => {
        el.textContent = el.dataset.playbackStatus === videoId ? text : "";
        el.hidden = !el.textContent;
    });
}
export function playbackStatus(stage: string, videoId?: string): void {
    if (videoId && videoId !== (pending || selected?.videoId)) return;
    if (stage === "loading") return;
    clearTimers();
    showStatus(videoId || pending, stage === "failed" ? "Could not open video. Click to retry." : "");
    pending = "";
}
export function selectedVideoTitle(videoId:string): string { return selected?.videoId===videoId ? selected.title : ""; }
export function requestPlayback(item:{videoId:string;title:string}): void {
    if(!state.iinaApi || pending === item.videoId) return;
    clearTimers(); selected=item; pending=item.videoId;
    showStatus(pending,"Opening…");
    recordDiagnostic("Playback selection sent");
    document.dispatchEvent(new CustomEvent("youtube-playback-requested"));
    try {
        state.iinaApi.postMessage(MESSAGE_NAMES.PlayItem,{videoId:item.videoId,url:`https://www.youtube.com/watch?v=${item.videoId}`,quality:getOptions().playbackQuality});
        slowTimer=window.setTimeout(()=> { showStatus(pending,"Still opening in IINA…"); recordDiagnostic("Playback waiting after 12s"); },12000);
        timeoutTimer=window.setTimeout(()=> { showStatus(pending,"Taking too long. Click to retry; check IINA’s online-media/yt-dlp plugin if this persists."); recordDiagnostic("Playback did not confirm loading within 30s"); pending=""; },30000);
    } catch { playbackStatus("failed"); }
}
if(typeof window !== "undefined") window.addEventListener("pagehide",clearTimers);
