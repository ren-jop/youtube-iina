import { getOptions } from "./libraryData";

const STORAGE_KEY = "youtube-iina.discovery-guard.v1";

interface DiscoveryGuardState {
    day: string;
    usedMs: number;
    lastTickAt: number;
    focusUntil: number;
    focusPurpose: string;
}

export interface DiscoveryGuardSnapshot {
    blocked: boolean;
    dailyLimitReached: boolean;
    limitMinutes: number;
    usedMinutes: number;
    remainingMinutes: number;
    focusMinutesRemaining: number;
    focusPurpose: string;
}

function localDayKey(now: number): string {
    const date = new Date(now);
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
    ].join("-");
}

function freshState(now: number): DiscoveryGuardState {
    return {
        day: localDayKey(now),
        usedMs: 0,
        lastTickAt: now,
        focusUntil: 0,
        focusPurpose: ""
    };
}

function loadState(now = Date.now()): DiscoveryGuardState {
    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as Partial<DiscoveryGuardState> & {
            intentionalUntil?: number;
            intentionalPurpose?: string;
        };
        if (parsed.day !== localDayKey(now)) return freshState(now);

        const focusUntil = Number.isFinite(parsed.focusUntil)
            ? Number(parsed.focusUntil)
            : Number.isFinite(parsed.intentionalUntil)
                ? Number(parsed.intentionalUntil)
                : 0;
        const focusPurpose = typeof parsed.focusPurpose === "string"
            ? parsed.focusPurpose
            : typeof parsed.intentionalPurpose === "string"
                ? parsed.intentionalPurpose
                : "";

        return {
            day: parsed.day,
            usedMs: Number.isFinite(parsed.usedMs) ? Math.max(0, Number(parsed.usedMs)) : 0,
            lastTickAt: Number.isFinite(parsed.lastTickAt) ? Number(parsed.lastTickAt) : now,
            focusUntil,
            focusPurpose: focusPurpose.slice(0, 160)
        };
    } catch {
        return freshState(now);
    }
}

function saveState(value: DiscoveryGuardState): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
        // Browsing should still work when local storage is unavailable.
    }
}

export function recordPassiveBrowsingActivity(active: boolean, now = Date.now()): boolean {
    const before = getDiscoveryGuardSnapshot(now);
    const state = loadState(now);
    const delta = Math.min(30000, Math.max(0, now - state.lastTickAt));
    state.lastTickAt = now;

    const focusActive = state.focusUntil > now;
    if (active && !focusActive) {
        state.usedMs += delta;
    }
    if (!focusActive) {
        state.focusUntil = 0;
        state.focusPurpose = "";
    }

    saveState(state);
    const after = getDiscoveryGuardSnapshot(now);
    return before.blocked !== after.blocked
        || before.focusMinutesRemaining !== after.focusMinutesRemaining
        || before.remainingMinutes !== after.remainingMinutes;
}

// Kept as an alias for older call sites/backups while the guard moves from
// "Home discovery" to passive browsing across Home + Subscriptions.
export const recordDiscoveryActivity = recordPassiveBrowsingActivity;

export function startFocusSession(minutes: number, purpose: string, now = Date.now()): void {
    const duration = [15, 30, 60, 90, 120, 180].includes(minutes)
        ? minutes
        : 60;
    const normalizedPurpose = purpose.trim().slice(0, 160);
    if (!normalizedPurpose) return;

    const state = loadState(now);
    state.lastTickAt = now;
    state.focusUntil = now + duration * 60000;
    state.focusPurpose = normalizedPurpose;
    saveState(state);
}

export function stopFocusSession(now = Date.now()): void {
    const state = loadState(now);
    state.lastTickAt = now;
    state.focusUntil = 0;
    state.focusPurpose = "";
    saveState(state);
}

export function getDiscoveryGuardSnapshot(now = Date.now()): DiscoveryGuardSnapshot {
    const options = getOptions();
    const state = loadState(now);
    const limitMinutes = options.dailyDiscoveryMinutes;
    const limitMs = limitMinutes * 60000;
    const focusMs = Math.max(0, state.focusUntil - now);
    const remainingMs = limitMinutes > 0 ? Math.max(0, limitMs - state.usedMs) : 0;
    const dailyLimitReached = limitMinutes > 0 && state.usedMs >= limitMs;

    return {
        blocked: dailyLimitReached || focusMs > 0,
        dailyLimitReached,
        limitMinutes,
        usedMinutes: Math.floor(state.usedMs / 60000),
        remainingMinutes: limitMinutes > 0 ? Math.ceil(remainingMs / 60000) : 0,
        focusMinutesRemaining: Math.ceil(focusMs / 60000),
        focusPurpose: focusMs > 0 ? state.focusPurpose : ""
    };
}
