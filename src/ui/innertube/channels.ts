import { sendHttpRequest } from "../bridge/httpBridge";
import { getOptions } from "../storage/libraryData";
import type { FeedVideoItem } from "../types";
import { getInnertubeConfig } from "./config";
import { fetchChannelFeedFromInnertube } from "./feedBrowse";
import { buildInnertubeUrl, buildWebClientContext, buildWebInnertubeHeaders } from "./request";

export interface ChannelIdentity { channelId?: string; videoId?: string; title?: string }
interface ChannelVideos { channelId: string; title: string; items: FeedVideoItem[] }
const cache = new Map<string, {at: number; result: ChannelVideos}>();
const pending = new Map<string, Promise<ChannelVideos>>();
const identities = new Map<string, Promise<{channelId: string; title: string}>>();
const validId = (id: string | undefined): id is string => /^UC[\w-]{22}$/.test(id || "");

async function resolveIdentity(source: ChannelIdentity): Promise<{channelId: string; title: string}> {
    if (validId(source.channelId)) return {channelId: source.channelId, title: source.title || "Channel"};
    const videoId = source.videoId || "";
    if (!/^[\w-]{11}$/.test(videoId)) throw new Error("Channel information is unavailable for this video.");
    const existing = identities.get(videoId); if (existing) return existing;
    const request = (async () => {
        const response = await sendHttpRequest({method: "GET", url: `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`}, 6000);
        if (!response.ok || !response.text) throw new Error("Could not look up this channel. Try again.");
        const data = JSON.parse(response.text);
        const url = new URL(String(data.author_url || ""));
        if (!/^https?:$/.test(url.protocol) || !/^(www\.)?youtube\.com$/.test(url.hostname)) throw new Error("Channel link unavailable.");
        let channelId = url.pathname.match(/^\/channel\/(UC[\w-]{22})\/?$/)?.[1];
        if (!channelId) {
            if (!/^\/@[^/]+\/?$/.test(url.pathname)) throw new Error("Channel link unavailable.");
            const config = await getInnertubeConfig();
            const resolved = await sendHttpRequest({method: "POST", url: buildInnertubeUrl("navigation/resolve_url", config.apiKey), headers: buildWebInnertubeHeaders(config), body: {context: {client: buildWebClientContext(config)}, url: `https://www.youtube.com${url.pathname}`}}, 6000);
            if (resolved.ok && resolved.text) channelId = JSON.parse(resolved.text)?.endpoint?.browseEndpoint?.browseId;
        }
        if (!validId(channelId)) throw new Error("Could not identify this channel. Try again.");
        return {channelId, title: typeof data.author_name === "string" ? data.author_name : source.title || "Channel"};
    })();
    identities.set(videoId, request);
    if (identities.size > 100) identities.delete(identities.keys().next().value!);
    void request.catch(() => { if (identities.get(videoId) === request) identities.delete(videoId); });
    return request;
}

export async function loadChannelVideos(source: ChannelIdentity): Promise<ChannelVideos> {
    const identity = await resolveIdentity(source);
    const key = `${identity.channelId}:${getOptions().japaneseMode}`;
    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < 180000) return cached.result;
    const existing = pending.get(key); if (existing) return existing;
    const request = (async () => {
        // One page returns the latest uploads without waiting for pagination.
        const response = await fetchChannelFeedFromInnertube(identity.channelId, 24, 1);
        if (response.failureReason && !response.items.length) {
            if (cached) return cached.result;
            throw new Error("Could not load channel videos. Open the channel again to retry.");
        }
        const items = response.items.filter(item => !item.channelId || item.channelId === identity.channelId).map(item => ({...item, channelId: identity.channelId, channelTitle: !item.channelTitle || item.channelTitle === "Unknown channel" ? identity.title : item.channelTitle}));
        const result = {...identity, items};
        if (items.length) cache.set(key, {at: Date.now(), result});
        if (cache.size > 12) cache.delete(cache.keys().next().value!);
        return result;
    })();
    pending.set(key, request);
    try { return await request; } finally { pending.delete(key); }
}
