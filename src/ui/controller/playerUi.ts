import { state } from "../state";
import { MESSAGE_NAMES } from "../../shared/messages";
import { getOptions } from "../storage/libraryData";
let selected: { videoId:string;title:string } | null = null;
export function selectedVideoTitle(videoId:string): string { return selected?.videoId===videoId ? selected.title : ""; }
export function requestPlayback(item:{videoId:string;title:string}): void {
    if(!state.iinaApi) return;
    selected=item;
    const bar=document.querySelector<HTMLElement>('[data-player-bar]');
    const title=document.querySelector<HTMLElement>('[data-player-title]');
    const status=document.querySelector<HTMLElement>('[data-player-status]');
    if(bar) bar.hidden=false;
    if(title) title.textContent=item.title;
    if(status) status.textContent='Opening video…';
    state.iinaApi.postMessage(MESSAGE_NAMES.PlayItem,{videoId:item.videoId,url:`https://www.youtube.com/watch?v=${item.videoId}`,quality:getOptions().playbackQuality});
}
export function updatePlaybackStatus(stage:string): void {
    const status=document.querySelector<HTMLElement>('[data-player-status]');
    if(status) status.textContent=stage==='loaded'?'Now playing':stage==='failed'?'Could not open video · try again':'Opening video…';
}
