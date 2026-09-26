import { getOptions } from "./libraryData";

const STORAGE_KEY = "youtube-iina.discovery-guard.v1";

interface DiscoveryGuardState {
    day: string;
    usedMs: number;
    lastTickAt: number;
    intentionalUntil: number;
    intentionalPurpose: string;
}

export interface DiscoveryGuardSnapshot {
    blocked: boolean;
    limitMinutes: number;
    usedMinutes: number;
    remainingMinutes: number;
    intentionalMinutesRemaining: number;
    intentionalPurpose: string;
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
        intentionalUntil: 0,
        intentionalPurpose: ""
    };
}

function loadState(now = Date.now()): DiscoveryGuardState {
    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as Partial<DiscoveryGuardState>;
        if (parsed.day !== localDayKey(now)) return freshState(now);
        return {
            day: parsed.day,
            usedMs: Number.isFinite(parsed.usedMs) ? Math.max(0, Number(parsed.usedMs)) : 0,
            lastTickAt: Number.isFinite(parsed.lastTickAt) ? Number(parsed.lastTickAt) : now,
            intentionalUntil: Number.isFinite(parsed.intentionalUntil) ? Number(parsed.intentionalUntil) : 0,
            intentionalPurpose: typeof parsed.intentionalPurpose === "string" ? parsed.intentionalPurpose.slice(0, 120) : ""
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

export function recordDiscoveryActivity(active: boolean, now = Date.now()): boolean {
    const before = getDiscoveryGuardSnapshot(now);
    const state = loadState(now);
    const delta = Math.min(30000, Math.max(0, now - state.lastTickAt));
    state.lastTickAt = now;

    const intentionalActive = state.intentionalUntil > now;
    if (active && !intentionalActive) {
        state.usedMs += delta;
    }
    if (!intentionalActive) {
        state.intentionalUntil = 0;
        state.intentionalPurpose = "";
    }

    saveState(state);
    const after = getDiscoveryGuardSnapshot(now);
    return before.blocked !== after.blocked
        || before.intentionalMinutesRemaining !== after.intentionalMinutesRemaining
        || before.remainingMinutes !== after.remainingMinutes;
}

export function startIntentionalDiscoverySession(minutes: number, purpose: string, now = Date.now()): void {
    const duration = [15, 30].includes(minutes) ? minutes : 15;
    const state = loadState(now);
    state.lastTickAt = now;
    state.intentionalUntil = now + duration * 60000;
    state.intentionalPurpose = purpose.trim().slice(0, 120);
    saveState(state);
}

export function getDiscoveryGuardSnapshot(now = Date.now()): DiscoveryGuardSnapshot {
    const options = getOptions();
    const state = loadState(now);
    const limitMinutes = options.dailyDiscoveryMinutes;
    const limitMs = limitMinutes * 60000;
    const intentionalMs = Math.max(0, state.intentionalUntil - now);
    const remainingMs = limitMinutes > 0 ? Math.max(0, limitMs - state.usedMs) : 0;

    return {
        blocked: limitMinutes > 0 && state.usedMs >= limitMs && intentionalMs <= 0,
        limitMinutes,
        usedMinutes: Math.floor(state.usedMs / 60000),
        remainingMinutes: limitMinutes > 0 ? Math.ceil(remainingMs / 60000) : 0,
        intentionalMinutesRemaining: Math.ceil(intentionalMs / 60000),
        intentionalPurpose: intentionalMs > 0 ? state.intentionalPurpose : ""
    };
}
