import type { FavoriteChannel } from "../types";
import { FAVORITES_STORAGE_KEY } from "../constants";
import { loadFavoritesFromStorage } from "./favorites";
import { asObject } from "../utils/json";

export const DATA_KEY = "youtube-iina.library.v1";
export const MAX_HISTORY = 5000;
export interface LocalOptions {
    japaneseMode: boolean;
    qualityFilter: boolean;
    minimumMinutes: number;
    hiddenChannels: string[];
    excludedWords: string[];
    academicMode: boolean;
    performanceVersion: number;
    opacity: number;
    playbackQuality: "auto" | "1080" | "720";
    rememberHistory: boolean;
    resolveChannels: boolean;
    compactCards: boolean;
    showStats: boolean;
    relatedMode: "topic" | "strict";
}
export interface HistoryItem { videoId: string; title: string; channelTitle: string; playedAt: string }
export interface LibraryData { options: LocalOptions; history: HistoryItem[] }
export const defaultOptions: LocalOptions = { japaneseMode: false, qualityFilter: false, minimumMinutes: 0, hiddenChannels: [], excludedWords: [], academicMode: false, performanceVersion: 1, opacity: 90, playbackQuality: "1080", rememberHistory: true, resolveChannels: true, compactCards: false, showStats: true, relatedMode: "topic" };
export function normalizeLines(value: unknown): string[] { return Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === "string").map(v => v.trim().slice(0,200)).filter(Boolean))].slice(0,500) : []; }
export function normalizeOptions(value: unknown): LocalOptions {
    const o = asObject(value);
    return { japaneseMode: o?.japaneseMode === true, qualityFilter: o?.qualityFilter === true, minimumMinutes: typeof o?.minimumMinutes === "number" && [0,3,5,10].includes(o.minimumMinutes) ? o.minimumMinutes : 0, hiddenChannels: normalizeLines(o?.hiddenChannels), excludedWords: normalizeLines(o?.excludedWords), academicMode: o?.academicMode === true, performanceVersion: 1, opacity: typeof o?.opacity === "number" && [60,75,90,100].includes(o.opacity) ? o.opacity : 90, playbackQuality: o?.playbackQuality === "720" ? "720" : o?.performanceVersion === 1 && o?.playbackQuality === "auto" ? "auto" : "1080", rememberHistory: o?.rememberHistory !== false, resolveChannels: o?.resolveChannels !== false,
        compactCards: o?.compactCards === true, showStats: true, relatedMode: o?.relatedMode === "strict" ? "strict" : "topic" };
}
function normalizeHistory(value: unknown): HistoryItem[] {
    if (!Array.isArray(value) || value.length > 20000) throw new Error("Invalid history list (maximum 20,000 imported entries).");
    const entries = new Map<string, HistoryItem>();
    for (const raw of value) {
        const h = asObject(raw);
        if (!h || typeof h.videoId !== "string" || !/^[\w-]{11}$/.test(h.videoId) || typeof h.playedAt !== "string" || !Number.isFinite(Date.parse(h.playedAt))) throw new Error("Invalid history entry.");
        const item = { videoId: h.videoId, title: String(h.title || "").slice(0,500), channelTitle: String(h.channelTitle || "").slice(0,200), playedAt: new Date(h.playedAt).toISOString() };
        const previous = entries.get(item.videoId);
        if (!previous || previous.playedAt < item.playedAt) entries.set(item.videoId,item);
    }
    return [...entries.values()].sort((a,b)=>b.playedAt.localeCompare(a.playedAt)).slice(0,MAX_HISTORY);
}
export function loadLibraryData(): LibraryData {
    try {
        const raw = asObject(JSON.parse(localStorage.getItem(DATA_KEY) || "{}"));
        return { options: normalizeOptions(raw?.options), history: normalizeHistory(raw?.history || []) };
    } catch { return { options: { ...defaultOptions }, history: [] }; }
}
export function saveLibraryData(data: LibraryData): void { localStorage.setItem(DATA_KEY, JSON.stringify(data)); }
export function recordPlayedVideo(item: Omit<HistoryItem,"playedAt">): void {
    const data = loadLibraryData();
    if (!data.options.rememberHistory) return;
    data.history = normalizeHistory([{ ...item, playedAt: new Date().toISOString() }, ...data.history]);
    saveLibraryData(data);
}
export interface ImportedData { favorites: FavoriteChannel[]; history: HistoryItem[]; options?: LocalOptions }
function channel(raw: unknown): FavoriteChannel {
    const o = asObject(raw);
    if (!o || typeof o.channelId !== "string" || !/^UC[\w-]{22}$/.test(o.channelId) || typeof o.title !== "string" || !o.title.trim()) throw new Error("Invalid channel ID or name.");
    return { channelId: o.channelId, title: o.title.trim().slice(0,200), thumbnailUrl: "", addedAt: typeof o.addedAt === "string" && Number.isFinite(Date.parse(o.addedAt)) ? new Date(o.addedAt).toISOString() : new Date().toISOString(),
        channelHandle: typeof o.channelHandle === "string" && /^@[\w.-]+$/.test(o.channelHandle) ? o.channelHandle : undefined };
}
export function parseCsv(text: string): string[][] {
    const rows: string[][] = []; let row: string[] = [], field = "", quoted = false;
    for (let i=0;i<text.length;i++) {
        const c=text[i];
        if (c==='"') { if (quoted && text[i+1]==='"') { field+='"'; i++; } else quoted=!quoted; }
        else if (c===',' && !quoted) { row.push(field); field=""; }
        else if ((c==='\n' || c==='\r') && !quoted) { if(c==='\r' && text[i+1]==='\n') i++; row.push(field); if(row.some(Boolean)) rows.push(row); row=[]; field=""; }
        else field+=c;
    }
    if(quoted) throw new Error("Unclosed CSV quote.");
    row.push(field); if(row.some(Boolean)) rows.push(row); return rows;
}
export function parseImport(text: string): ImportedData {
    if (text.length > 5_000_000) throw new Error("Import exceeds 5 MB.");
    const trimmed = text.replace(/^\uFEFF/, "").trim();
    if (!trimmed.startsWith("{")) {
        const rows=parseCsv(trimmed), header=rows.shift()?.map(v=>v.trim().toLowerCase()) || [];
        const id=header.indexOf("channel id"), title=header.indexOf("channel title");
        if(id<0 || title<0) throw new Error("Choose a plugin JSON backup or a subscriptions CSV with Channel Id and Channel Title columns.");
        if(rows.length>10000) throw new Error("Too many channels.");
        return { favorites: [...new Map(rows.map(r=>{const c=channel({channelId:r[id]?.trim(),title:r[title]});return [c.channelId,c] as const;})).values()], history: [] };
    }
    const value=asObject(JSON.parse(trimmed));
    if(value?.format!=="youtube-iina" || value.schemaVersion!==1 || !Array.isArray(value.favorites) || value.favorites.length>10000) throw new Error("Unsupported or invalid backup format.");
    return { favorites: [...new Map(value.favorites.map(raw=>{const c=channel(raw);return [c.channelId,c] as const;})).values()], history: normalizeHistory(value.history), options: normalizeOptions(value.options) };
}
export function exportBackup(): string {
    const data=loadLibraryData();
    // Explicit allowlist: OAuth credentials, caches and other localStorage entries never leave the app.
    return JSON.stringify({ format:"youtube-iina", schemaVersion:1, exportedAt:new Date().toISOString(), favorites:loadFavoritesFromStorage(), options:data.options, history:data.history },null,2);
}
export function exportSubscriptionsCsv(): string {
    const quote=(value:string)=>'"'+value.replace(/"/g,'""')+'"';
    return ["Channel Id,Channel Url,Channel Title",...loadFavoritesFromStorage().map(c=>[c.channelId,`https://www.youtube.com/channel/${c.channelId}`,c.title].map(quote).join(','))].join('\r\n');
}
export function mergeImport(incoming: ImportedData, importSettings: boolean): { channels: number; history: number } {
    const current=loadLibraryData();
    const favorites=[...new Map([...incoming.favorites,...loadFavoritesFromStorage()].map(c=>[c.channelId,c])).values()];
    const merged={ options: importSettings && incoming.options ? incoming.options : current.options, history: normalizeHistory([...incoming.history,...current.history]) };
    const oldData=localStorage.getItem(DATA_KEY), oldFavorites=localStorage.getItem(FAVORITES_STORAGE_KEY);
    try { saveLibraryData(merged); localStorage.setItem(FAVORITES_STORAGE_KEY,JSON.stringify(favorites)); }
    catch(error) {
        if(oldData===null) localStorage.removeItem(DATA_KEY); else localStorage.setItem(DATA_KEY,oldData);
        if(oldFavorites===null) localStorage.removeItem(FAVORITES_STORAGE_KEY); else localStorage.setItem(FAVORITES_STORAGE_KEY,oldFavorites);
        throw error;
    }
    return { channels:favorites.length, history:merged.history.length };
}
let cachedRaw: string | null | undefined;
let cachedOptions: LocalOptions = { ...defaultOptions };
export function getOptions(): LocalOptions {
    try {
        const raw=localStorage.getItem(DATA_KEY);
        if(raw!==cachedRaw) { cachedOptions=normalizeOptions(asObject(JSON.parse(raw || "{}"))?.options); cachedRaw=raw; }
    } catch { return { ...defaultOptions }; }
    return cachedOptions;
}
