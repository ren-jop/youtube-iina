import { isJapaneseTitle, isLikelyJapaneseDiscoveryText } from "../innertube/japanese";

export function shouldShowVideoInJapaneseMode(
    title: string,
    japaneseMode: boolean,
    allowEnglish = false
): boolean {
    return allowEnglish || !japaneseMode || isJapaneseTitle(title);
}

export function shouldShowChannelInJapaneseMode(
    title: string,
    japaneseMode: boolean,
    allowEnglish = false
): boolean {
    return allowEnglish
        || !japaneseMode
        || isLikelyJapaneseDiscoveryText(title, title);
}
