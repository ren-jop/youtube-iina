import { isJapaneseTitle } from "../innertube/japanese";
import { getOptions, loadLibraryData, saveLibraryData, type LocalOptions } from "./libraryData";
const normalize = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase();
export function filterReason(item: { title: string; channelTitle: string; durationLabel?: string }, options: LocalOptions = getOptions()): string {
    if (options.japaneseMode && item.title && !isJapaneseTitle(item.title)) return "Not a Japanese title";
    if (options.academicMode && academicExclusion(item.title)) return "Academic focus";
    const name = normalize(item.channelTitle), title = normalize(item.title);
    if (name && options.hiddenChannels.some(value => normalize(value) === name)) return "Hidden channel";
    if (options.excludedWords.some(value => title.includes(normalize(value)))) return "Excluded title phrase";
    if (options.qualityFilter && (/you (?:won['’]?t|will not) believe|shocking truth|this changes everything|必見|衝撃の真実|[!?！？]{3,}/i.test(title))) return "Clickbait title";
    const duration = item.durationLabel?.trim();
    if (duration && /^\d+(?::\d{1,2}){1,2}$/.test(duration)) {
        const seconds = duration.split(":").reduce((n, part) => n * 60 + Number(part), 0);
        if (seconds < options.minimumMinutes * 60) return "Below minimum length";
    }
    return "";
}
export function hideChannel(name: string): void {
    if (!name || /^(Unknown channel|Channel unavailable|Loading channel…)$/.test(name)) return;
    const data = loadLibraryData();
    if (!data.options.hiddenChannels.some(value => normalize(value) === normalize(name))) data.options.hiddenChannels = [...data.options.hiddenChannels, name].slice(-500);
    saveLibraryData(data);
    document.dispatchEvent(new CustomEvent("youtube-options-changed"));
}

export function academicExclusion(title: string): boolean {
    // Exclude obvious formats, not entire subjects: game theory, film analysis,
    // sports science and music lessons can all be useful academic sources.
    const text = normalize(title);
    if (/\b(lecture|tutorial|lesson|research|analysis|history|science|theory|documentary|explained|explanation|education)\b|解説|講義|研究|分析|歴史|科学|理論|授業|学習|ドキュメンタリー/u.test(text)) return false;
    return /\b(minecraft|fortnite|roblox|genshin impact|gameplay|let['’]?s play|speedrun|prank|unboxing|haul|mukbang|official music video|official trailer|reaction video|sports highlights|match highlights)\b|マイクラ|フォートナイト|ゲーム実況|生配信.*ゲーム|歌ってみた|踊ってみた|ドッキリ|爆食い|試合ハイライト/u.test(text);
}
