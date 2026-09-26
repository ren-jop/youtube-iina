import { sendHttpRequest } from "../bridge/httpBridge";

const translations = new Map<string, string>();
const pendingTranslations = new Map<string, Promise<string>>();

const japaneseCharacterPattern = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/gu;
const kanaPattern = /[\p{Script=Hiragana}\p{Script=Katakana}]/gu;
const anyJapanesePattern = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;

function japaneseTextStats(value: string): {
    letters: number;
    japanese: number;
    kana: number;
} {
    const text = value.normalize("NFKC");
    return {
        letters: (text.match(/\p{L}/gu) || []).length,
        japanese: (text.match(japaneseCharacterPattern) || []).length,
        kana: (text.match(kanaPattern) || []).length
    };
}

export function isJapaneseTitle(value: string): boolean {
    const text = value.trim();
    if (!text) return false;

    const stats = japaneseTextStats(text);
    if (stats.kana === 0) return false;

    const ratio = stats.letters > 0
        ? stats.japanese / stats.letters
        : 0;

    // Real Japanese YouTube titles often mix Latin product names, numbers and
    // English acronyms. Requiring half the letters to be Japanese was too
    // strict and let Japanese mode collapse to mostly English recommendations.
    return stats.japanese >= 2
        && (ratio >= 0.18 || stats.kana >= 4);
}

export function isLikelyJapaneseDiscoveryText(
    title: string,
    channelTitle = ""
): boolean {
    if (isJapaneseTitle(title)) return true;

    const combined = `${title} ${channelTitle}`.trim();
    if (!combined) return false;

    const stats = japaneseTextStats(combined);
    if (stats.kana === 0) return false;

    const ratio = stats.letters > 0
        ? stats.japanese / stats.letters
        : 0;

    return stats.kana >= 3
        && stats.japanese >= 4
        && ratio >= 0.14;
}

export function parseJapaneseTranslation(value: unknown): string {
    const data = value as {
        responseStatus?: number;
        responseData?: { translatedText?: string };
    };
    const text = data?.responseData?.translatedText?.trim();

    if (
        data?.responseStatus !== 200
        || !text
        || !anyJapanesePattern.test(text)
    ) {
        throw new Error("MyMemory did not return a Japanese translation.");
    }

    return text;
}

export function parseGoogleJapaneseTranslation(value: unknown): string {
    if (!Array.isArray(value) || !Array.isArray(value[0])) {
        throw new Error("Google Translate returned an unexpected response.");
    }

    const text = (value[0] as unknown[])
        .map((segment) => Array.isArray(segment) && typeof segment[0] === "string"
            ? segment[0]
            : "")
        .join("")
        .trim();

    if (!text || !anyJapanesePattern.test(text)) {
        throw new Error("Google Translate did not return Japanese text.");
    }

    return text;
}

function rememberTranslation(key: string, value: string): string {
    translations.set(key, value);
    while (translations.size > 100) {
        const oldest = translations.keys().next().value as string | undefined;
        if (!oldest) break;
        translations.delete(oldest);
    }
    return value;
}

async function translateWithGoogle(query: string): Promise<string> {
    const response = await sendHttpRequest({
        method: "GET",
        url: "https://translate.googleapis.com/translate_a/single"
            + "?client=gtx&sl=auto&tl=ja&dt=t&q="
            + encodeURIComponent(query)
    }, 5000);

    if (!response.ok || !response.text) {
        throw new Error(`Google Translate HTTP ${response.statusCode}`);
    }

    return parseGoogleJapaneseTranslation(JSON.parse(response.text));
}

async function translateWithMyMemory(query: string): Promise<string> {
    const response = await sendHttpRequest({
        method: "GET",
        url: "https://api.mymemory.translated.net/get"
            + "?langpair=en%7Cja&q="
            + encodeURIComponent(query)
    }, 6500);

    if (!response.ok || !response.text) {
        throw new Error(`MyMemory HTTP ${response.statusCode}`);
    }

    return parseJapaneseTranslation(JSON.parse(response.text));
}

async function resolveJapaneseSearch(query: string): Promise<string> {
    try {
        return await translateWithGoogle(query);
    } catch {
        try {
            return await translateWithMyMemory(query);
        } catch {
            // Translation must never make search unusable. YouTube handles
            // mixed-language queries well, and 日本語 strongly biases Japanese
            // results while the strict result filter removes English spillover.
            return `${query} 日本語`;
        }
    }
}

export async function translateSearchToJapanese(query: string): Promise<string> {
    const normalized = query.trim();
    if (!normalized) return normalized;

    if (
        !/[a-z]/i.test(normalized)
        || anyJapanesePattern.test(normalized)
    ) {
        return normalized;
    }

    const bounded = normalized.slice(0, 300);
    const cacheKey = bounded.toLocaleLowerCase("en-US");

    const cached = translations.get(cacheKey);
    if (cached) return cached;

    const pending = pendingTranslations.get(cacheKey);
    if (pending) return pending;

    const request = resolveJapaneseSearch(bounded)
        .then((translated) => rememberTranslation(cacheKey, translated))
        .finally(() => pendingTranslations.delete(cacheKey));

    pendingTranslations.set(cacheKey, request);
    return request;
}
