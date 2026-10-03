import type { FeedVideoItem } from "../types";
import type { HistoryItem } from "../storage/libraryData";

export interface HomeTopic {
    id: string;
    label: string;
    labelJa: string;
    keywords: string[];
}

const HOME_TOPICS: HomeTopic[] = [
    {
        id: "philosophy",
        label: "Philosophy",
        labelJa: "哲学",
        keywords: [
            "philosophy", "philosophical", "ethics", "stoicism", "stoic",
            "existential", "metaphysics", "epistemology", "plato", "aristotle",
            "nietzsche", "kant", "哲学", "倫理", "思想", "人生論", "存在"
        ]
    },
    {
        id: "chemistry",
        label: "Chemistry",
        labelJa: "化学",
        keywords: [
            "chemistry", "chemical", "molecule", "molecular", "organic chemistry",
            "reaction", "periodic table", "compound", "化学", "分子", "有機化学",
            "化学反応", "元素", "周期表"
        ]
    },
    {
        id: "football",
        label: "Football technique",
        labelJa: "サッカー技術",
        keywords: [
            "football", "soccer", "dribbling", "dribble", "passing", "shooting",
            "first touch", "ball control", "football training", "soccer training",
            "tactics", "サッカー", "ドリブル", "パス", "シュート", "トラップ",
            "ボールコントロール", "戦術", "練習", "トレーニング"
        ]
    },
    {
        id: "science",
        label: "Science",
        labelJa: "科学",
        keywords: [
            "science", "scientific", "physics", "biology", "astronomy",
            "experiment", "research", "科学", "物理", "生物", "宇宙", "実験",
            "研究", "量子", "進化"
        ]
    },
    {
        id: "math",
        label: "Mathematics",
        labelJa: "数学",
        keywords: [
            "math", "mathematics", "algebra", "calculus", "geometry",
            "trigonometry", "statistics", "probability", "数学", "代数", "微積分",
            "幾何", "三角関数", "統計", "確率"
        ]
    },
    {
        id: "history",
        label: "History",
        labelJa: "歴史",
        keywords: [
            "history", "historical", "ancient", "empire", "war history",
            "civilization", "歴史", "世界史", "日本史", "古代", "帝国", "文明"
        ]
    },
    {
        id: "psychology",
        label: "Psychology",
        labelJa: "心理学",
        keywords: [
            "psychology", "psychological", "cognitive", "behavior", "behaviour",
            "neuroscience", "brain", "心理学", "認知", "行動", "脳科学", "脳"
        ]
    },
    {
        id: "programming",
        label: "Programming",
        labelJa: "プログラミング",
        keywords: [
            "programming", "coding", "software", "developer", "rust", "python",
            "javascript", "computer science", "プログラミング", "コード", "開発",
            "ソフトウェア", "コンピュータ"
        ]
    },
    {
        id: "engineering",
        label: "Engineering",
        labelJa: "工学",
        keywords: [
            "engineering", "electronics", "embedded", "firmware", "robotics",
            "circuit", "pcb", "mechanical", "工学", "電子工作", "組み込み",
            "回路", "ロボット", "機械"
        ]
    },
    {
        id: "study",
        label: "Study & learning",
        labelJa: "勉強・学習",
        keywords: [
            "study", "learning", "learn", "lecture", "lesson", "tutorial",
            "education", "educational", "explain", "explained", "勉強", "学習",
            "講義", "授業", "解説", "教育", "入門"
        ]
    },
    {
        id: "language",
        label: "Language",
        labelJa: "言語",
        keywords: [
            "language", "linguistics", "japanese", "english", "grammar",
            "vocabulary", "pronunciation", "日本語", "英語", "言語", "文法",
            "単語", "発音", "会話"
        ]
    },
    {
        id: "productivity",
        label: "Productivity",
        labelJa: "生産性",
        keywords: [
            "productivity", "focus", "deep work", "time management", "habit",
            "study routine", "集中", "生産性", "時間管理", "習慣", "ルーティン"
        ]
    }
];

const EDUCATIONAL_TOPIC_IDS = new Set([
    "philosophy", "chemistry", "science", "math", "history", "psychology",
    "programming", "engineering", "study", "language", "productivity"
]);

// Personal seed interests provide a useful cold-start before local watch history
// is large enough to steer Home. History still dominates as it accumulates.
const PERSONAL_HOME_TOPIC_PRIORS = new Map<string, number>([
    ["engineering", 2.0],
    ["programming", 1.8],
    ["science", 1.25],
    ["chemistry", 1.2],
    ["philosophy", 1.1],
    ["football", 1.0],
    ["math", 0.8],
    ["study", 0.7]
]);

export function isEducationalContent(
    title: string,
    channelTitle = ""
): boolean {
    return HOME_TOPICS.some((topic) =>
        EDUCATIONAL_TOPIC_IDS.has(topic.id)
        && homeTopicMatches(topic, title, channelTitle)
    );
}

function normalizedText(
    title: string,
    channelTitle = ""
): string {
    return `${title} ${channelTitle}`
        .normalize("NFKC")
        .toLocaleLowerCase();
}

export function homeTopicMatches(
    topic: HomeTopic,
    title: string,
    channelTitle = ""
): boolean {
    const text = normalizedText(title, channelTitle);
    return topic.keywords.some((keyword) =>
        text.includes(keyword.toLocaleLowerCase())
    );
}

const INTEREST_STOP_WORDS = new Set([
    "about", "after", "again", "best", "build", "building", "course",
    "explained", "from", "guide", "into", "learn", "learning", "make",
    "making", "more", "most", "new", "part", "review", "the", "this",
    "tutorial", "using", "video", "watch", "what", "when", "where", "with",
    "your", "youtube"
]);

function interestTokens(value: string): string[] {
    const matches = value
        .normalize("NFKC")
        .toLocaleLowerCase()
        .match(/[a-z][a-z0-9+#.-]{2,}/g) || [];

    return [...new Set(
        matches
            .map((token) => token.replace(/^[.+-]+|[.+-]+$/g, ""))
            .filter((token) =>
                token.length >= 3
                && !INTEREST_STOP_WORDS.has(token)
                && !/^\d+$/.test(token)
            )
    )].slice(0, 8);
}

function topicAffinityFromHistory(
    history: HistoryItem[]
): Map<string, number> {
    const scores = new Map<string, number>();

    history.slice(0, 160).forEach((item, index) => {
        const recency =
            1 / (1 + index / 8)
            * (index < 12 ? 1.6 : 1);
        for (const topic of HOME_TOPICS) {
            if (homeTopicMatches(
                topic,
                item.title,
                item.channelTitle
            )) {
                scores.set(
                    topic.id,
                    (scores.get(topic.id) || 0)
                    + recency
                );
            }
        }
    });

    return scores;
}

export interface HomeRankingOptions {
    strength?: number;
    demoteWatched?: boolean;
}

export function derivePersonalizedInterestQueries(
    history: HistoryItem[],
    maxQueries = 3,
    japaneseMode = false
): string[] {
    if (maxQueries <= 0) return [];

    const topicAffinity = topicAffinityFromHistory(history);
    const topicQueries = HOME_TOPICS
        .map((topic) => ({
            query: japaneseMode ? topic.labelJa : topic.label,
            score:
                (topicAffinity.get(topic.id) || 0) * 1.5
                + (PERSONAL_HOME_TOPIC_PRIORS.get(topic.id) || 0)
        }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((entry) => entry.query);

    const tokenScores = new Map<string, number>();
    history.slice(0, 100).forEach((item, index) => {
        const recency =
            1 / (1 + index / 7)
            * (index < 10 ? 1.7 : 1);
        for (const token of interestTokens(item.title)) {
            tokenScores.set(
                token,
                (tokenScores.get(token) || 0) + recency
            );
        }
    });

    const tokenQueries = [...tokenScores.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, Math.max(2, maxQueries))
        .map(([token]) => japaneseMode ? `${token} 日本語` : token);

    const topicBudget = Math.min(
        topicQueries.length,
        Math.max(1, Math.ceil(maxQueries * 0.67))
    );
    const tokenBudget = Math.max(0, maxQueries - topicBudget);

    return [...new Set([
        ...topicQueries.slice(0, topicBudget),
        ...tokenQueries.slice(0, tokenBudget),
        // If history is sparse there may be no useful free-text tokens yet.
        // Fill the remaining budget with the next strongest seeded topics so
        // cold-start For You still has enough independent discovery sources.
        ...topicQueries.slice(topicBudget)
    ])].slice(0, Math.max(0, maxQueries));
}

export function deriveJapaneseInterestQueries(
    history: HistoryItem[],
    maxQueries = 4
): string[] {
    return derivePersonalizedInterestQueries(history, maxQueries, true);
}

export function rankPersonalizedHomeItems(
    items: FeedVideoItem[],
    history: HistoryItem[],
    preferredChannelTitles: string[] = [],
    options: HomeRankingOptions = {}
): FeedVideoItem[] {
    if (items.length < 2) {
        return items;
    }

    const strength = Math.max(
        0.5,
        Math.min(3, Number(options.strength) || 1)
    );
    const topicAffinity =
        topicAffinityFromHistory(history);
    const channelAffinity =
        new Map<string, number>();
    const tokenAffinity =
        new Map<string, number>();
    const watchedVideoIds = new Set(
        options.demoteWatched
            ? history.slice(0, 120).map((item) => item.videoId)
            : []
    );
    const preferredChannels = new Set(
        preferredChannelTitles
            .map((title) =>
                title.trim().toLocaleLowerCase()
            )
            .filter(Boolean)
    );

    history.slice(0, 160).forEach((item, index) => {
        const channel = item.channelTitle
            .trim()
            .toLocaleLowerCase();
        const recency =
            1 / (1 + index / 8)
            * (index < 12 ? 1.8 : 1);

        if (channel) {
            channelAffinity.set(
                channel,
                (channelAffinity.get(channel) || 0)
                + recency
            );
        }

        for (const token of interestTokens(item.title)) {
            tokenAffinity.set(
                token,
                (tokenAffinity.get(token) || 0)
                + recency
            );
        }
    });

    const ranked = items
        .map((item, index) => {
            const channel = item.channelTitle
                .trim()
                .toLocaleLowerCase();
            let score =
                (channelAffinity.get(channel) || 0)
                * 1.9
                * strength;

            if (
                channel
                && preferredChannels.has(channel)
            ) {
                score += 0.6;
            }

            for (const token of interestTokens(item.title)) {
                score +=
                    (tokenAffinity.get(token) || 0)
                    * 0.62
                    * strength;
            }

            for (const topic of HOME_TOPICS) {
                if (homeTopicMatches(
                    topic,
                    item.title,
                    item.channelTitle
                )) {
                    score +=
                        (topicAffinity.get(topic.id) || 0)
                        * 0.78
                        * strength;
                    score +=
                        (PERSONAL_HOME_TOPIC_PRIORS.get(topic.id) || 0)
                        * 0.62;
                }
            }

            if (watchedVideoIds.has(item.videoId)) {
                // Watching something should teach the recommender about its
                // topic/channel, not immediately recommend the same video again.
                score -= 20 * strength;
            }

            // Preserve source ordering as an exploration signal, but let
            // repeated and very recent watch-history interests dominate enough
            // for For You to visibly adapt within the current viewing session.
            score +=
                (items.length - index)
                / Math.max(1, items.length)
                * 0.7;

            return { item, score, index };
        })
        .sort((a, b) =>
            b.score - a.score
            || a.index - b.index
        );

    // Keep the top of Home varied like YouTube instead of letting one heavily
    // watched/subscribed channel occupy most of the first screen.
    const headTarget = Math.min(24, ranked.length);
    const head: FeedVideoItem[] = [];
    const tail: FeedVideoItem[] = [];
    const channelCounts = new Map<string, number>();

    for (const entry of ranked) {
        if (head.length >= headTarget) {
            tail.push(entry.item);
            continue;
        }

        const channel = entry.item.channelTitle.trim().toLocaleLowerCase();
        const count = channel ? (channelCounts.get(channel) || 0) : 0;
        if (channel && count >= 2) {
            tail.push(entry.item);
            continue;
        }

        head.push(entry.item);
        if (channel) channelCounts.set(channel, count + 1);
    }

    return [...head, ...tail];
}

export function deriveHomeTopics(
    items: FeedVideoItem[],
    history: HistoryItem[],
    maxTopics = 7
): HomeTopic[] {
    const historyAffinity =
        topicAffinityFromHistory(history);

    return HOME_TOPICS
        .map((topic) => {
            const matches = items.reduce(
                (count, item) =>
                    count + (
                        homeTopicMatches(
                            topic,
                            item.title,
                            item.channelTitle
                        )
                        ? 1
                        : 0
                    ),
                0
            );

            return {
                topic,
                matches,
                score:
                    matches * 1.4
                    + (historyAffinity.get(topic.id) || 0)
            };
        })
        // Strict JP feeds can be smaller; one real match is enough to keep a
        // useful category visible instead of hiding the whole topic row.
        .filter((entry) => entry.matches >= 1)
        .sort((a, b) =>
            b.score - a.score
            || b.matches - a.matches
            || a.topic.label.localeCompare(b.topic.label)
        )
        .slice(0, Math.max(0, maxTopics))
        .map((entry) => entry.topic);
}

export function fillHomeTopics(
    topics: HomeTopic[],
    maxTopics = 7
): HomeTopic[] {
    const seen = new Set(topics.map((topic) => topic.id));
    const filled = [...topics];
    for (const topic of HOME_TOPICS) {
        if (filled.length >= maxTopics) break;
        if (seen.has(topic.id)) continue;
        seen.add(topic.id);
        filled.push(topic);
    }
    return filled.slice(0, Math.max(0, maxTopics));
}

export function filterHomeItemsByTopic(
    items: FeedVideoItem[],
    topicId: string
): FeedVideoItem[] {
    if (!topicId || topicId === "all") {
        return items;
    }

    const topic = HOME_TOPICS.find(
        (candidate) => candidate.id === topicId
    );
    if (!topic) return items;

    return items.filter((item) =>
        homeTopicMatches(
            topic,
            item.title,
            item.channelTitle
        )
    );
}

export function homeTopicLabel(
    topic: HomeTopic,
    japaneseMode: boolean
): string {
    return japaneseMode
        ? topic.labelJa
        : topic.label;
}