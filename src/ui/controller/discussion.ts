import { isJapaneseTitle } from "../innertube/japanese";
import { getOptions } from "../storage/libraryData";
import { sendHttpRequest } from "../bridge/httpBridge";
import { getInnertubeConfig } from "../innertube/config";
import { buildInnertubeUrl, buildWebClientContext, buildWebInnertubeHeaders } from "../innertube/request";
import { chatRenderer, continuation, initialCommentToken, parseChat, parseComments, type DiscussionEntry } from "../parsers/discussion";
import { state } from "../state";
import type { JsonObject } from "../types";

async function request(endpoint: string, body: JsonObject): Promise<unknown> {
    const config = await getInnertubeConfig();
    const response = await sendHttpRequest({ method: "POST", url: buildInnertubeUrl(endpoint, config.apiKey), headers: buildWebInnertubeHeaders(config), body: { context: { client: buildWebClientContext(config) }, ...body } }, 12000);
    if (!response.ok || !response.text) throw new Error(`YouTube returned HTTP ${response.statusCode}.`);
    return JSON.parse(response.text);
}
export function createDiscussionController(): { update: () => void; suspend: () => void } {
    let generation = 0, timer = 0, active = "", videoId = "", token = "", loading = false, ready = false;
    let failures = 0, nativeVisible = true;
    const entries = new Map<string, DiscussionEntry>();
    const content = document.querySelector<HTMLElement>(".yt-content")!;
    const panel = () => document.querySelector<HTMLElement>(`section[data-view="${active}"]`)!;
    const status = (text: string) => { panel().querySelector<HTMLElement>("[data-discussion-status]")!.textContent = text; };
    const render = () => {
        const list = panel().querySelector<HTMLElement>("[data-discussion-list]")!;
        const nearBottom = content.scrollHeight - content.scrollTop - content.clientHeight < 100;
        const visible = new Map([...entries].filter(([, entry]) => !getOptions().japaneseMode || isJapaneseTitle(entry.text)));
        const existing = new Map([...list.children].map(el => [(el as HTMLElement).dataset.id, el]));
        for (const [id, element] of existing) if (!visible.has(id!)) element.remove();
        for (const item of visible.values()) {
            let row = existing.get(item.id) as HTMLElement | undefined;
            if (row && row.dataset.signature === JSON.stringify(item)) continue;
            const replacement = document.createElement("li");
            replacement.className = "yt-discussion-entry";
            replacement.dataset.id = item.id; replacement.dataset.signature = JSON.stringify(item);
            for (const [tag, text] of [["strong", item.author], ["p", item.text], ["small", item.meta]]) {
                if (!text) continue;
                const el = document.createElement(tag); el.textContent = text; replacement.append(el);
            }
            if (row) row.replaceWith(replacement); else list.append(replacement);
        }
        if (active === "chat" && nearBottom) content.scrollTop = content.scrollHeight;
    };
    const controls = () => {
        const button = panel().querySelector<HTMLButtonElement>("[data-discussion-more]")!;
        button.hidden = active === "chat" ? ready : ready && !token;
        button.disabled = loading;
        button.textContent = ready ? "Load more" : "Retry";
    };
    const load = async () => {
        if (loading || !active || !videoId || document.hidden || !nativeVisible) return;
        const mine = generation, chat = active === "chat";
        loading = true; controls(); status(chat ? "Connecting…" : "Loading comments…");
        try {
            if (!ready) {
                const initial = await request("next", { videoId });
                if (mine !== generation) return;
                const renderer = chatRenderer(initial);
                token = chat ? (renderer?.isReplay ? "" : continuation(renderer?.continuations)) : initialCommentToken(initial);
                if (!token) {
                    status(chat ? "No live chat available. Chat replay is not supported yet." : "Comments are disabled or unavailable for this video.");
                    ready = true; return;
                }
            }
            const response = await request(chat ? "live_chat/get_live_chat" : "next", { continuation: token });
            if (mine !== generation) return;
            const chatPage = chat ? parseChat(response) : null;
            const page = chatPage || parseComments(response);
            if (chatPage) {
                for (const id of chatPage.deleted) entries.delete(id);
                for (const [id, entry] of entries) if (entry.channelId && chatPage.deletedAuthors.includes(entry.channelId)) entries.delete(id);
            }
            for (const entry of page.entries) entries.set(entry.id, entry);
            while (entries.size > (chat ? 200 : 500)) entries.delete(entries.keys().next().value!);
            const previousToken = token;
            token = !chat && page.next === previousToken ? "" : page.next;
            ready = true; failures = 0; render();
            status(chat ? (token ? "Live · read only" : "Chat ended or is unavailable.") : entries.size ? "" : "No comments available.");
            if (chatPage && token) timer = window.setTimeout(() => void load(), chatPage.delay);
        } catch (error) {
            if (mine !== generation) return;
            failures++;
            status(`${error instanceof Error ? error.message : "Could not load discussion."}${chat && failures < 3 ? " Reconnecting…" : " Select Retry to try again."}`);
            if (chat && failures < 3) timer = window.setTimeout(() => void load(), 5000 * failures);
            else ready = false;
        } finally { if (mine === generation) { loading = false; controls(); } }
    };
    const suspend = () => { generation++; clearTimeout(timer); loading = false; active = ""; };
    const update = () => {
        const next = state.activeView === "comments" || state.activeView === "chat" ? state.activeView : "";
        if (next === active && videoId === state.currentPlaybackVideoId) return;
        suspend(); active = next; videoId = state.currentPlaybackVideoId;
        ready = false; token = ""; failures = 0; entries.clear();
        if (!active) return;
        panel().querySelector("[data-discussion-list]")!.replaceChildren();
        controls();
        if (!videoId) { status("Play a YouTube video to open its discussion."); panel().querySelector<HTMLButtonElement>("[data-discussion-more]")!.hidden = true; return; }
        void load();
    };
    state.iinaApi?.onMessage("discussionVisibility", (visible: boolean) => { nativeVisible = visible; if (visible) update(); else suspend(); });
    document.querySelectorAll("[data-discussion-more]").forEach(button => button.addEventListener("click", () => void load()));
    document.querySelectorAll("[data-discussion-refresh]").forEach(button => button.addEventListener("click", () => { suspend(); update(); }));
    document.addEventListener("visibilitychange", () => { if (document.hidden) suspend(); else update(); });
    document.addEventListener("youtube-options-changed", () => { if (active) render(); });
    window.addEventListener("pagehide", suspend);
    return { update, suspend };
}
