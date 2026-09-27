import { loadLibraryData, saveLibraryData, getOptions } from "../storage/libraryData";
import {
    getDiscoveryGuardSnapshot,
    startFocusSession,
    stopFocusSession
} from "../storage/discoveryGuard";
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

export function initializeDiscovery(navigate: (view:ViewName)=>void, search:(query:string)=>Promise<void>): void {
    const toggle = document.querySelector<HTMLInputElement>("[data-japanese-toggle]")!;
    const focusButton = document.querySelector<HTMLButtonElement>("[data-focus-start]");
    const focusStatus = document.querySelector<HTMLElement>("[data-focus-status]");
    const homeButton = document.querySelector<HTMLButtonElement>("[data-home-refresh]");
    const subscriptionsTab = document.querySelector<HTMLButtonElement>('.yt-tab[data-view="subscriptions"]');

    const beginFocus = () => {
        const snapshot = getDiscoveryGuardSnapshot();
        if (snapshot.focusMinutesRemaining > 0) {
            if (window.confirm("End the current focus session early?")) {
                stopFocusSession();
                document.dispatchEvent(new CustomEvent("youtube-focus-session-changed"));
            }
            return;
        }

        const purpose = window.prompt("What are you here to learn or do?");
        if (!purpose?.trim()) return;
        const minutes = getOptions().focusSessionMinutes;
        startFocusSession(minutes, purpose);
        document.dispatchEvent(new CustomEvent("youtube-focus-session-changed"));
        const input = document.querySelector<HTMLInputElement>("[data-search-input]");
        if (input) input.value = purpose.trim();
        navigate("search");
        void search(purpose.trim());
    };

    const sync = () => {
        const options = getOptions();
        const lockRemaining = japaneseLockRemainingText(options.japaneseLockUntil);
        toggle.checked = options.japaneseMode;
        toggle.disabled = Boolean(lockRemaining);
        toggle.parentElement?.setAttribute(
            "title",
            lockRemaining
                ? `Japanese discovery lock active for about ${lockRemaining}`
                : "Japanese discovery"
        );

        const focus = getDiscoveryGuardSnapshot();
        const focusActive = focus.focusMinutesRemaining > 0;
        if (focusButton) {
            focusButton.classList.toggle("is-active", focusActive);
            focusButton.textContent = focusActive ? `Focus ${focus.focusMinutesRemaining}m` : "Focus";
            focusButton.title = focusActive
                ? `Focus: ${focus.focusPurpose || "active"} · click to end early`
                : `Start a ${options.focusSessionMinutes}-minute focus session`;
        }
        if (focusStatus) {
            focusStatus.hidden = !focusActive;
            focusStatus.textContent = focusActive
                ? `Focus · ${focus.focusMinutesRemaining} min · ${focus.focusPurpose}`
                : "";
        }
        if (homeButton) homeButton.disabled = focusActive;
        if (subscriptionsTab) subscriptionsTab.disabled = focusActive;
    };

    toggle.addEventListener("change", () => {
        try {
            const data=loadLibraryData();
            const lockRemaining = japaneseLockRemainingText(data.options.japaneseLockUntil);
            if (lockRemaining && !toggle.checked) {
                toggle.checked = true;
                return;
            }
            data.options.japaneseMode=toggle.checked;
            saveLibraryData(data);
            document.dispatchEvent(new CustomEvent("youtube-options-changed", { detail: "japaneseMode" }));
        } catch { sync(); }
    });

    focusButton?.addEventListener("click", beginFocus);
    document.addEventListener("youtube-focus-start-requested", beginFocus);
    document.addEventListener("youtube-focus-session-changed", sync);
    document.addEventListener("youtube-options-changed",sync);
    window.setInterval(sync, 15000);
    sync();
}
