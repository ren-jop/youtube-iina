import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
    consumeDailyDistraction,
    getDiscoveryGuardSnapshot,
    isJapaneseDiscoveryActive
} from "../src/ui/storage/discoveryGuard";
import {
    DATA_KEY,
    defaultOptions
} from "../src/ui/storage/libraryData";
import { buildWebClientContext } from "../src/ui/innertube/request";

let originalStorage: Storage | undefined;
let memory: Map<string, string>;

beforeEach(() => {
    originalStorage = globalThis.localStorage;
    memory = new Map<string, string>();
    globalThis.localStorage = {
        getItem: (key: string) => memory.get(key) ?? null,
        setItem: (key: string, value: string) => { memory.set(key, value); },
        removeItem: (key: string) => { memory.delete(key); }
    } as Storage;
    localStorage.setItem(DATA_KEY, JSON.stringify({
        options: { ...defaultOptions, japaneseMode: false },
        history: []
    }));
});

afterEach(() => {
    globalThis.localStorage = originalStorage as Storage;
});

describe("daily distraction allowance", () => {
    test("persists the first chosen Home video and rejects a second one", () => {
        const now = new Date(2026, 8, 30, 12, 0, 0).getTime();
        expect(consumeDailyDistraction("abcdefghijk", now)).toBe(true);
        expect(consumeDailyDistraction("zyxwvutsrqp", now + 1000)).toBe(false);

        const snapshot = getDiscoveryGuardSnapshot(now + 2000);
        expect(snapshot.dailyDistractionConsumed).toBe(true);
        expect(snapshot.dailyDistractionVideoId).toBe("abcdefghijk");
        expect(snapshot.japaneseDiscoveryActive).toBe(true);
        expect(isJapaneseDiscoveryActive(now + 2000)).toBe(true);
    });

    test("resets automatically at the next local calendar day", () => {
        const beforeMidnight = new Date(2026, 8, 30, 23, 59, 0).getTime();
        const afterMidnight = new Date(2026, 9, 1, 0, 1, 0).getTime();

        expect(consumeDailyDistraction("abcdefghijk", beforeMidnight)).toBe(true);
        expect(getDiscoveryGuardSnapshot(beforeMidnight).dailyDistractionConsumed).toBe(true);
        expect(getDiscoveryGuardSnapshot(afterMidnight).dailyDistractionConsumed).toBe(false);
        expect(isJapaneseDiscoveryActive(afterMidnight)).toBe(false);
        expect(consumeDailyDistraction("zyxwvutsrqp", afterMidnight)).toBe(true);
    });

    test("consuming the distraction immediately biases Innertube discovery to Japan", () => {
        const now = Date.now();
        expect(buildWebClientContext({ apiKey: "key", clientVersion: "1" }).gl).toBe("US");
        expect(consumeDailyDistraction("abcdefghijk", now)).toBe(true);
        expect(buildWebClientContext({ apiKey: "key", clientVersion: "1" }).gl).toBe("JP");
    });

    test("Study / JP mode does not spend the distraction allowance", () => {
        localStorage.setItem(DATA_KEY, JSON.stringify({
            options: { ...defaultOptions, japaneseMode: true },
            history: []
        }));
        const now = new Date(2026, 8, 30, 9, 0, 0).getTime();

        expect(consumeDailyDistraction("abcdefghijk", now)).toBe(false);
        const snapshot = getDiscoveryGuardSnapshot(now);
        expect(snapshot.dailyDistractionConsumed).toBe(false);
        expect(snapshot.japaneseDiscoveryActive).toBe(true);
    });
});