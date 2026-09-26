import { loadLibraryData, saveLibraryData, getOptions } from "../storage/libraryData";
import type { ViewName } from "../types";

// JP mode is discovery filtering, not a Japanese-learning onboarding flow.
export function initializeDiscovery(navigate: (view:ViewName)=>void, search:(query:string)=>Promise<void>): void {
    const toggle = document.querySelector<HTMLInputElement>("[data-japanese-toggle]")!;
    const academicToggle = document.querySelector<HTMLInputElement>("[data-academic-toggle]");
    const status = document.querySelector<HTMLElement>("[data-suggestion-status]");
    const sync = () => {
        const options = getOptions();
        toggle.checked = options.japaneseMode;
        if (academicToggle) academicToggle.checked = options.academicMode;
    };
    toggle.addEventListener("change", () => {
        try { const data=loadLibraryData(); data.options.japaneseMode=toggle.checked; saveLibraryData(data); document.dispatchEvent(new CustomEvent("youtube-options-changed", { detail: "japaneseMode" })); }
        catch { sync(); if (status) status.textContent="Could not save language setting."; }
    });
    academicToggle?.addEventListener("change", () => {
        try {
            const data = loadLibraryData();
            data.options.academicMode = academicToggle.checked;
            saveLibraryData(data);
            document.dispatchEvent(new CustomEvent("youtube-options-changed", { detail: "academicMode" }));
        } catch {
            sync();
            if (status) status.textContent = "Could not save Focus setting.";
        }
    });
    // No starter-channel suggestions: fluent users get normal Japanese
    // discovery and recommendations rather than a language-learning funnel.
    void navigate;
    void search;
    document.addEventListener("youtube-options-changed",sync); sync();
}
