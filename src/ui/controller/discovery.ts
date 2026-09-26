import { loadLibraryData, saveLibraryData, getOptions } from "../storage/libraryData";
import type { ViewName } from "../types";

// Public channel names are search suggestions, not unverifiable subscription IDs.
export const suggestedChannels = [
    {name:"Onomappu",query:"Onomappu オノマップ",description:"Everyday Japanese"},
    {name:"Japanese Immersion with Asami",query:"Japanese Immersion with Asami 日本語",description:"Stories and listening"},
    {name:"おさるのジョージ",query:"おさるのジョージ 公式",description:"Animated stories"}
];
export function initializeDiscovery(navigate: (view:ViewName)=>void, search:(query:string)=>Promise<void>): void {
    const toggle = document.querySelector<HTMLInputElement>("[data-japanese-toggle]")!;
    const academicToggle = document.querySelector<HTMLInputElement>("[data-academic-toggle]");
    const topics = document.querySelector<HTMLElement>("[data-japanese-topics]")!;
    const status = document.querySelector<HTMLElement>("[data-suggestion-status]")!;
    const sync = () => {
        const options = getOptions();
        toggle.checked = options.japaneseMode;
        if (academicToggle) academicToggle.checked = options.academicMode;
        topics.hidden = !toggle.checked;
    };
    toggle.addEventListener("change", () => {
        try { const data=loadLibraryData(); data.options.japaneseMode=toggle.checked; saveLibraryData(data); document.dispatchEvent(new CustomEvent("youtube-options-changed")); }
        catch { sync(); status.textContent="Could not save language setting."; }
    });
    academicToggle?.addEventListener("change", () => {
        try {
            const data = loadLibraryData();
            data.options.academicMode = academicToggle.checked;
            saveLibraryData(data);
            document.dispatchEvent(new CustomEvent("youtube-options-changed"));
        } catch {
            sync();
            status.textContent = "Could not save Focus setting.";
        }
    });
    const run = (query:string) => {
        const input=document.querySelector<HTMLInputElement>("[data-search-input]");
        if(input) input.value=query;
        navigate("search"); input?.blur(); void search(query);
    };
    for (const [name,query] of [["日常","日常 vlog 日本語"],["料理","料理 作り方"],["科学","科学 解説"],["旅","日本 旅行"],["会話","日本語 日常会話"]]) {
        const button=document.createElement("button"); button.type="button"; button.textContent=name;
        button.addEventListener("click",()=>run(query)); topics.append(button);
    }
    const list=document.querySelector<HTMLElement>("[data-channel-suggestions]")!;
    for(const channel of suggestedChannels) {
        const row=document.createElement("div"); row.className="yt-suggested-channel";
        const text=document.createElement("span"); text.textContent=`${channel.name} · ${channel.description}`;
        const button=document.createElement("button"); button.type="button"; button.textContent="Find channel";
        button.addEventListener("click",()=>run(channel.query)); row.append(text,button); list.append(row);
    }
    status.textContent="Find a channel, then use Favourite or Subscribe in the results. Nothing is followed automatically.";
    document.addEventListener("youtube-options-changed",sync); sync();
}
