import { state } from "../state";
import { loadLibraryData } from "../storage/libraryData";
import { renderPlayableVideoList } from "../render/common";
import type { FeedVideoItem, ViewName } from "../types";
export function renderHistory(play:(item:FeedVideoItem)=>void): void {
    renderPlayableVideoList({
        state:{items:loadLibraryData().history.slice(0,30).map(item=>({...item,title:item.title||"YouTube video",published:item.playedAt,thumbnailUrl:`https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`})),isLoading:false,status:"",warning:""},
        list:document.querySelector('[data-history-list]'), emptyState:document.querySelector('[data-history-empty]'),status:null,
        defaultEmptyText:'Your recently played videos will appear here.',onUpdateLoadingIndicators(){},onPlayItem:play,
        resolveItemPresentation:item=>({title:item.title,channelLine:item.channelTitle,thumbnailUrl:item.thumbnailUrl,durationLabel:'',statsLine:new Date(item.published).toLocaleDateString()})
    });
}
export function initializePolish(navigate:(view:ViewName)=>void): void {
    document.querySelector('[data-settings-open]')?.addEventListener('click',()=>{
        const panel=document.querySelector<HTMLDetailsElement>('[data-library]');
        if(panel){panel.open=!panel.open;if(panel.open){panel.scrollIntoView({block:'start'});panel.querySelector<HTMLElement>('summary')?.focus();}}
    });
    document.addEventListener('keydown',event=>{
        if (event.key !== ' ' || event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return;
        const target=event.target as HTMLElement;
        if(target?.closest('input,textarea,select,[contenteditable]')) return;
        event.preventDefault(); event.stopImmediatePropagation();
        if (!event.repeat) state.iinaApi?.postMessage('togglePlayback', {});
    }, true);
    document.addEventListener('keydown',event=>{
        const target=event.target as HTMLElement;
        if(target?.closest('input,textarea,select,[contenteditable]')) return;
        if(event.key==='/'&&!event.metaKey&&!event.ctrlKey){event.preventDefault();navigate('search');document.querySelector<HTMLInputElement>('[data-search-input]')?.focus();}
    });
}
