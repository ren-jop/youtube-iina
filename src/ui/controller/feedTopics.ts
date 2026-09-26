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

function topicAffinityFromHistory(
    history: HistoryItem[]
): Map<string, number> {
    const scores = new Map<string, number>();

    history.slice(0, 160).forEach((item, index) => {
        const recency = 1 / (1 + index / 18);
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

export function rankPersonalizedHomeItems(
    items: FeedVideoItem[],
    history: HistoryItem[],
    preferredChannelTitles: string[] = []
): FeedVideoItem[] {
    if (items.length < 2 || history.length === 0) {
        return items;
    }

    const topicAffinity =
        topicAffinityFromHistory(history);
    const channelAffinity =
        new Map<string, number>();
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
        if (!channel) return;

        const recency = 1 / (1 + index / 20);
        channelAffinity.set(
            channel,
            (channelAffinity.get(channel) || 0)
            + recency
        );
    });

    return items
        .map((item, index) => {
            const channel = item.channelTitle
                .trim()
                .toLocaleLowerCase();
            let score =
                (channelAffinity.get(channel) || 0)
                * 2.4;

            if (
                channel
                && preferredChannels.has(channel)
            ) {
                score += 1.8;
            }

            for (const topic of HOME_TOPICS) {
                if (homeTopicMatches(
                    topic,
                    item.title,
                    item.channelTitle
                )) {
                    score +=
                        (topicAffinity.get(topic.id) || 0)
                        * 0.85;
                }
            }

            // Preserve YouTube's own personalized ordering as the primary
            // signal; local history is only a gentle re-rank.
            score +=
                (items.length - index)
                / Math.max(1, items.length)
                * 0.35;

            return { item, score, index };
        })
        .sort((a, b) =>
            b.score - a.score
            || a.index - b.index
        )
        .map((entry) => entry.item);
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
        // Never show a chip that would produce an empty/tiny fake category.
        .filter((entry) => entry.matches >= 2)
        .sort((a, b) =>
            b.score - a.score
            || b.matches - a.matches
            || a.topic.label.localeCompare(b.topic.label)
        )
        .slice(0, Math.max(0, maxTopics))
        .map((entry) => entry.topic);
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
