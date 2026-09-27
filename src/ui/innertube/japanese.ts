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

export function buildJapaneseSearchQuery(query: string): string {
    const normalized = query.trim();
    if (!normalized) return "";
    if (anyJapanesePattern.test(normalized)) return normalized;

    // Keep the user's visible text untouched. Adding Japanese discovery terms
    // gives YouTube a strong locale/language hint without relying on a separate
    // translation service, and the returned titles are still strictly filtered.
    return `${normalized} 日本語 解説`;
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
