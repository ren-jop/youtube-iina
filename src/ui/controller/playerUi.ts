import { state } from "../state";
import { MESSAGE_NAMES } from "../../shared/messages";
import { getOptions } from "../storage/libraryData";
let selected: { videoId:string;title:string } | null = null;
export function selectedVideoTitle(videoId:string): string { return selected?.videoId===videoId ? selected.title : ""; }
export function requestPlayback(item:{videoId:string;title:string}): void {
    if(!state.iinaApi) return;
    selected=item;
    state.iinaApi.postMessage(MESSAGE_NAMES.PlayItem,{videoId:item.videoId,url:`https://www.youtube.com/watch?v=${item.videoId}`,quality:getOptions().playbackQuality});
}
