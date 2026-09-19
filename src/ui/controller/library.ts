import { state } from "../state";
import { loadFavoritesFromStorage } from "../storage/favorites";
import { exportBackup, exportSubscriptionsCsv, loadLibraryData, saveLibraryData, parseImport, mergeImport, type ImportedData, type LocalOptions } from "../storage/libraryData";

export function applyLocalAppearance(): void {
    const options=loadLibraryData().options;
    document.body.classList.toggle("yt-compact",options.compactCards);
    document.body.classList.toggle("yt-hide-stats",!options.showStats);
}
export function initializeLibrary(onImported: () => void): void {
    const panel=document.querySelector<HTMLElement>("[data-library]");
    const status=document.querySelector<HTMLElement>("[data-library-status]");
    const confirm=document.querySelector<HTMLButtonElement>("[data-import-confirm]");
    const settings=document.querySelector<HTMLInputElement>("[data-import-settings]");
    if(!panel || !status || !confirm || !settings) return;
    let pending: ImportedData | null=null;
    const report=(message:string)=>{status.textContent=message;};
    const refresh=()=>{
        const data=loadLibraryData();
        panel.querySelectorAll<HTMLInputElement>("input[data-option]").forEach(input=>{input.checked=data.options[input.dataset.option as keyof LocalOptions]===true;});
        panel.querySelectorAll<HTMLSelectElement>("select[data-option]").forEach(select => { select.value=String(data.options[select.dataset.option as keyof LocalOptions]); });
        applyLocalAppearance();
    };
    panel.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-option]").forEach(input=>{
        input.addEventListener("change",()=>{
            try {
                const data=loadLibraryData();
                const key=input.dataset.option as keyof LocalOptions;
                if(key==='relatedMode') data.options.relatedMode=input.value==='strict'?'strict':'topic';
                else if(key==='playbackQuality') data.options.playbackQuality=input.value==='1080'||input.value==='720'?input.value:'auto';
                else data.options[key]=(input as HTMLInputElement).checked;
                saveLibraryData(data); refresh(); report("Settings saved. Related mode applies on the next refresh.");
            } catch { report("Could not save settings. Your previous settings remain active."); refresh(); }
        });
    });
    const buttons=[...panel.querySelectorAll<HTMLButtonElement>("[data-transfer]")];
    const busy=(value:boolean)=>buttons.forEach(button=>button.disabled=value);
    state.iinaApi?.onMessage("libraryTransferResult", (wire: string)=>{
        busy(false);
        try {
            const result=JSON.parse(decodeURIComponent(wire));
            if(result.error) { report(String(result.error)); return; }
            if(result.cancelled) { report("Cancelled."); return; }
            if(result.saved) { report("Backup saved and revealed in Finder."); return; }
            pending=parseImport(result.text);
            confirm.hidden=false; settings.parentElement!.hidden=!pending.options; settings.checked=false;
            report(`Ready to merge ${pending.favorites.length} channels and ${pending.history.length} history entries. Existing channels are kept; history keeps the latest visit per video.`);
        } catch(error) { pending=null; confirm.hidden=true; report(error instanceof Error?error.message:"Invalid import."); }
    });
    buttons.forEach(button=>button.addEventListener("click",()=>{
        if(!state.iinaApi) { report("Data transfer is available inside IINA."); return; }
        try {
            pending=null; confirm.hidden=true; settings.parentElement!.hidden=true;
            const action=button.dataset.transfer;
            busy(true);
            state.iinaApi.postMessage("libraryTransfer", action==='import'?{action:'import'}:
                {action:'export',format:action==='csv'?'csv':'json',text:action==='csv'?exportSubscriptionsCsv():exportBackup()});
        } catch { busy(false); report("Could not start data transfer."); }
    }));
    confirm.addEventListener("click",()=>{
        if(!pending) return;
        try {
            const result=mergeImport(pending,settings.checked);
            pending=null; confirm.hidden=true; settings.parentElement!.hidden=true;
            state.favorites=loadFavoritesFromStorage(); refresh(); onImported();
            report(`Merged successfully. ${result.channels} saved channels and ${result.history} recent videos.`);
        } catch { report("Import could not be saved. Check available storage and try again."); }
    });
    refresh();
}
