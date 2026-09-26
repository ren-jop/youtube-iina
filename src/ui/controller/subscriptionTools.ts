import type { FeedVideoItem } from "../types";

export function publicationTime(value: string, now = Date.now()): number {
    const text = value.normalize("NFKC").trim().toLowerCase();
    if (!text) return 0;
    if (/^\d{4}-\d{2}-\d{2}(?:t|$|\s)/i.test(text)) return Number.isFinite(Date.parse(text)) ? Date.parse(text) : 0;
    if (/^(today|just now|今日|たった今)$/.test(text)) return now;
    if (/^(yesterday|昨日)$/.test(text)) return now - 86400000;
    const match = text.match(/(\d+(?:\.\d+)?)\s*(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|months?|mos?|mo|years?|yrs?|y)\s*ago\b/)
        || text.match(/(\d+(?:\.\d+)?)\s*(秒|分|時間|日|週間|週|か月|ヶ月|カ月|月|年)前/);
    if (match) {
        const unit = match[2];
        const seconds = /^(s|sec|second|秒)/.test(unit) ? 1
            : /^(mo|month|か月|ヶ月|カ月|月)/.test(unit) ? 2592000
            : /^(m|min|minute|分)/.test(unit) ? 60
            : /^(h|hour|hr|時間)/.test(unit) ? 3600
            : /^(d|day|日)/.test(unit) ? 86400
            : /^(w|week|週)/.test(unit) ? 604800 : 31536000;
        return now - Number(match[1]) * seconds * 1000;
    }
    // YouTube can supply a written calendar date. Do not parse view counts as dates.
    if (!/views?|回視聴|回再生/.test(text) && /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/.test(text)) {
        const parsed = Date.parse(text); if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
}

export function newestFirst(items: FeedVideoItem[], now = Date.now()): FeedVideoItem[] {
    // Compute relative dates once, so equal ages have stable ordering.
    return items.map((item, index) => ({item, index, time: publicationTime(item.published, now)}))
        .sort((a, b) => b.time - a.time || a.index - b.index).map(entry => entry.item);
}

export function filterSubscriptions(items: FeedVideoItem[], query: string): FeedVideoItem[] {
    const words = query.normalize("NFKC").toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    return items.filter(item => {
        const text = `${item.title} ${item.channelTitle}`.normalize("NFKC").toLocaleLowerCase();
        return words.every(word => text.includes(word));
    });
}
