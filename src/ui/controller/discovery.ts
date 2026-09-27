import { loadLibraryData, saveLibraryData, getOptions } from "../storage/libraryData";
import type { ViewName } from "../types";

function japaneseLockRemainingText(until: string): string {
    const remaining = Date.parse(until) - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0) return "";
    const minutes = Math.max(1, Math.ceil(remaining / 60000));
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.ceil(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.ceil(hours / 24);
    if (days < 28) return `${days}d`;
    return `${Math.max(1, Math.round(days / 30))}mo`;
}

// JP mode is discovery filtering, not a Japanese-learning onboarding flow.
export function initializeDiscovery(navigate: (view:ViewName)=>void, search:(query:string)=>Promise<void>): void {
    const toggle = document.querySelector<HTMLInputElement>("[data-japanese-toggle]")!;
    const status = document.querySelector<HTMLElement>("[data-suggestion-status]");
    const sync = () => {
        const options = getOptions();
        const lockRemaining = japaneseLockRemainingText(options.japaneseLockUntil);
        toggle.checked = options.japaneseMode;
        toggle.disabled = Boolean(lockRemaining);
        toggle.parentElement?.setAttribute(
            "title",
            lockRemaining
                ? `Japanese-only block active for about ${lockRemaining}`
                : "Japanese immersion"
        );
    };
    toggle.addEventListener("change", () => {
        try {
            const data=loadLibraryData();
            const lockRemaining = japaneseLockRemainingText(data.options.japaneseLockUntil);
            if (lockRemaining && !toggle.checked) {
                toggle.checked = true;
                if (status) status.textContent=`Japanese-only block is still active for about ${lockRemaining}.`;
                return;
            }
            data.options.japaneseMode=toggle.checked;
            saveLibraryData(data);
            document.dispatchEvent(new CustomEvent("youtube-options-changed", { detail: "japaneseMode" }));
        }
        catch { sync(); if (status) status.textContent="Could not save language setting."; }
    });
    // No starter-channel suggestions: fluent users get normal Japanese
    // discovery and recommendations rather than a language-learning funnel.
    void navigate;
    void search;
    document.addEventListener("youtube-options-changed",sync);
    window.setInterval(sync, 30000);
    sync();
}
