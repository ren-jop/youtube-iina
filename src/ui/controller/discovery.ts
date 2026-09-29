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
    const studyButton = document.querySelector<HTMLButtonElement>("[data-study-mode]");
    const distractButton = document.querySelector<HTMLButtonElement>("[data-distract-mode]");
    const focusButton = document.querySelector<HTMLButtonElement>("[data-focus-start]");
    const focusStatus = document.querySelector<HTMLElement>("[data-focus-status]");
    const homeButton = document.querySelector<HTMLButtonElement>("[data-home-refresh]");

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

    let lastDailyConsumed = getDiscoveryGuardSnapshot().dailyDistractionConsumed;

    const sync = () => {
        const options = getOptions();
        const lockRemaining = japaneseLockRemainingText(options.japaneseLockUntil);
        const guard = getDiscoveryGuardSnapshot();
        const dailyConsumed = guard.dailyDistractionConsumed;
        const forcedByDailyChoice = dailyConsumed && !options.japaneseMode;

        if (studyButton) {
            const active = options.japaneseMode || forcedByDailyChoice;
            studyButton.classList.toggle("is-active", active);
            studyButton.setAttribute("aria-pressed", String(active));
            studyButton.title = forcedByDailyChoice
                ? "Japanese discovery is locked until local midnight because today’s distraction video has been used."
                : lockRemaining
                    ? `Japanese discovery lock active for about ${lockRemaining}`
                    : "Use Japanese discovery now.";
        }
        if (distractButton) {
            const available = !dailyConsumed && !lockRemaining;
            const active = available && !options.japaneseMode;
            distractButton.disabled = !available;
            distractButton.classList.toggle("is-active", active);
            distractButton.setAttribute("aria-pressed", String(active));
            distractButton.textContent = dailyConsumed ? "Distract · used" : "Distract · 1/day";
            distractButton.title = dailyConsumed
                ? "Today’s distraction video has already been chosen. Discovery stays Japanese until local midnight."
                : lockRemaining
                    ? "Unavailable while a Japanese discovery lock is active."
                    : "Browse Home normally until you open one video; then discovery becomes Japanese until local midnight.";
        }

        const focusActive = guard.focusMinutesRemaining > 0;
        if (focusButton) {
            focusButton.classList.toggle("is-active", focusActive);
            focusButton.title = focusActive
                ? `Focus: ${guard.focusPurpose || "active"} · about ${guard.focusMinutesRemaining} min left · click to end early`
                : `Start a ${options.focusSessionMinutes}-minute focus session`;
            focusButton.setAttribute(
                "aria-label",
                focusActive
                    ? `Focus session active: about ${guard.focusMinutesRemaining} minutes left`
                    : "Start focus session"
            );
        }
        if (focusStatus) {
            focusStatus.hidden = !focusActive && !forcedByDailyChoice;
            focusStatus.textContent = focusActive
                ? `Focus · ${guard.focusMinutesRemaining} min · ${guard.focusPurpose}`
                : forcedByDailyChoice
                    ? "Daily distraction used · discovery stays Japanese until local midnight · Subscriptions stay open."
                    : "";
        }
        if (homeButton) homeButton.disabled = focusActive;

        if (lastDailyConsumed && !dailyConsumed) {
            document.dispatchEvent(new CustomEvent("youtube-daily-distraction-changed", {
                detail: { reason: "midnight-reset" }
            }));
        }
        lastDailyConsumed = dailyConsumed;
    };

    studyButton?.addEventListener("click", () => {
        try {
            const data = loadLibraryData();
            data.options.japaneseMode = true;
            saveLibraryData(data);
            document.dispatchEvent(new CustomEvent("youtube-options-changed", { detail: "japaneseMode" }));
        } catch {
            sync();
        }
    });

    distractButton?.addEventListener("click", () => {
        try {
            const guard = getDiscoveryGuardSnapshot();
            const data = loadLibraryData();
            const lockRemaining = japaneseLockRemainingText(data.options.japaneseLockUntil);
            if (guard.dailyDistractionConsumed || lockRemaining) {
                sync();
                return;
            }
            data.options.japaneseMode = false;
            saveLibraryData(data);
            document.dispatchEvent(new CustomEvent("youtube-options-changed", { detail: "japaneseMode" }));
        } catch {
            sync();
        }
    });

    focusButton?.addEventListener("click", beginFocus);
    document.addEventListener("youtube-focus-start-requested", beginFocus);
    document.addEventListener("youtube-focus-session-changed", sync);
    document.addEventListener("youtube-daily-distraction-changed", sync);
    document.addEventListener("youtube-options-changed", sync);
    window.setInterval(sync, 15000);
    sync();
}