import { sendHttpRequest } from "../bridge/httpBridge";
const translations = new Map<string, string>();
export function isJapaneseTitle(value: string): boolean {
    const text = value.normalize("NFKC");
    const japanese = text.match(/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/gu) || [];
    const letters = text.match(/\p{L}/gu) || [];
    // Kana distinguishes Japanese from Chinese. Ambiguous, kanji-only titles
    // are deliberately excluded in strict mode rather than guessed.
    return /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text) && japanese.length >= letters.length / 2;
}
export function parseJapaneseTranslation(value: unknown): string {
    const data = value as { responseStatus?: number; responseData?: { translatedText?: string } };
    const text = data?.responseData?.translatedText?.trim();
    if (data?.responseStatus !== 200 || !text || !/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(text)) throw new Error("Japanese translation unavailable. Retry or enter Japanese directly.");
    return text;
}
export async function translateSearchToJapanese(query: string): Promise<string> {
    if (!/[a-z]/i.test(query) || /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(query)) return query;
    if (query.length > 300) throw new Error("Keep English searches under 300 characters for translation.");
    const cached = translations.get(query); if (cached) return cached;
    const response = await sendHttpRequest({method:"GET",url:`https://api.mymemory.translated.net/get?langpair=en%7Cja&q=${encodeURIComponent(query)}`},8000);
    if (!response.ok || !response.text) throw new Error("Japanese translation unavailable. Retry or enter Japanese directly.");
    const text = parseJapaneseTranslation(JSON.parse(response.text));
    translations.set(query,text); if (translations.size > 50) translations.delete(translations.keys().next().value!);
    return text;
}
