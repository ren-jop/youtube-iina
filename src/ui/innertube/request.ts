import { getOptions } from "../storage/libraryData";
import type { InnertubeConfig, JsonObject } from "../types";

import { USER_AGENT } from "../constants";

export function buildInnertubeUrl(endpoint: string, apiKey: string): string {
    return `https://www.youtube.com/youtubei/v1/${endpoint}?key=${encodeURIComponent(apiKey)}&prettyPrint=false`;
}

export function buildWebInnertubeHeaders(config: InnertubeConfig): Record<string, string> {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Origin": "https://www.youtube.com",
        "Referer": "https://www.youtube.com/",
        "User-Agent": USER_AGENT,
        "Accept-Language": getOptions().japaneseMode ? "ja-JP,ja;q=0.9,en;q=0.5" : "en-US,en;q=0.9",
        "X-Youtube-Client-Name": "1",
        "X-Youtube-Client-Version": config.clientVersion
    };

    if (config.visitorData) {
        headers["X-Goog-Visitor-Id"] = config.visitorData;
    }

    return headers;
}

export function buildWebClientContext(config: InnertubeConfig): JsonObject {
    return {
        clientName: "WEB",
        clientVersion: config.clientVersion,
        hl: getOptions().japaneseMode ? "ja" : "en",
        gl: getOptions().japaneseMode ? "JP" : "US"
    };
}
