import { asArray, asObject, asString } from "../utils/json";
import { extractText } from "../utils/text";
import type { JsonObject } from "../types";

// Bounded traversal also tolerates partial and newly introduced renderer wrappers.
export function nodes(value: unknown): JsonObject[] {
    const result: JsonObject[] = [], queue: unknown[] = [value];
    for (let i = 0; i < queue.length && i < 30000; i++) {
        const node = asObject(queue[i]);
        if (!node) continue;
        result.push(node);
        for (const child of Object.values(node)) if (child && typeof child === "object") queue.push(child);
    }
    return result;
}
export function continuation(value: unknown): string {
    for (const n of nodes(value)) {
        const command = asObject(n.continuationCommand);
        if (command?.token) return asString(command.token);
        for (const key of ["nextContinuationData", "reloadContinuationData", "timedContinuationData", "invalidationContinuationData"]) {
            const data = asObject(n[key]);
            if (data?.continuation) return asString(data.continuation);
        }
    }
    return "";
}
export function initialCommentToken(value: unknown): string {
    for (const n of nodes(value)) {
        const section = asObject(n.itemSectionRenderer);
        if (section && (section.targetId === "comments-section" || section.sectionIdentifier === "comment-item-section")) return continuation(section);
        const entry = asObject(n.commentsEntryPointHeaderRenderer);
        if (entry) { const token = continuation(entry); if (token) return token; }
    }
    return "";
}
export interface DiscussionEntry { id: string; author: string; text: string; meta: string; channelId?: string }
export function parseComments(value: unknown): { entries: DiscussionEntry[]; next: string } {
    const all = nodes(value), entries = new Map<string, DiscussionEntry>();
    for (const n of all) {
        const r = asObject(n.commentRenderer);
        if (r && asString(r.commentId)) entries.set(asString(r.commentId), { id: asString(r.commentId), author: extractText(r.authorText) || "YouTube viewer", text: extractText(r.contentText), meta: [extractText(r.publishedTimeText), extractText(r.voteCount) ? `${extractText(r.voteCount)} likes` : ""].filter(Boolean).join(" · ") });
        const entity = asObject(n.commentEntityPayload), properties = asObject(entity?.properties), author = asObject(entity?.author), toolbar = asObject(entity?.toolbar);
        if (properties && asString(properties.commentId)) entries.set(asString(properties.commentId), { id: asString(properties.commentId), author: asString(author?.displayName) || "YouTube viewer", text: extractText(properties.content), meta: [asString(properties.publishedTime), asString(toolbar?.likeCountNotliked) ? `${toolbar!.likeCountNotliked} likes` : ""].filter(Boolean).join(" · ") });
    }
    // Only the top-level comments continuation; never silently load a reply thread.
    let next = "";
    for (const n of all) {
        const command = asObject(n.appendContinuationItemsAction) || asObject(n.reloadContinuationItemsCommand);
        if (!command || !asString(command.targetId).startsWith("comments-section")) continue;
        for (const item of asArray(command.continuationItems)) {
            const renderer = asObject(asObject(item)?.continuationItemRenderer);
            if (renderer) next = continuation(renderer);
        }
    }
    return { entries: [...entries.values()], next };
}
function chatText(value: unknown): string {
    const obj = asObject(value);
    return asArray(obj?.runs).map(raw => {
        const run = asObject(raw), emoji = asObject(run?.emoji);
        return asString(run?.text) || asString(asArray(emoji?.shortcuts)[0]) || asString(emoji?.emojiId);
    }).join("") || extractText(value);
}
export interface ChatPage { entries: DiscussionEntry[]; deleted: string[]; deletedAuthors: string[]; next: string; delay: number }
export function chatRenderer(value: unknown): JsonObject | null {
    for (const n of nodes(value)) if (asObject(n.liveChatRenderer)) return asObject(n.liveChatRenderer);
    return null;
}
export function parseChat(value: unknown): ChatPage {
    const root = asObject(asObject(asObject(value)?.continuationContents)?.liveChatContinuation);
    const result: ChatPage = { entries: [], deleted: [], deletedAuthors: [], next: continuation(root?.continuations), delay: 5000 };
    for (const n of nodes(root?.continuations)) if (typeof n.timeoutMs === "number") result.delay = Math.max(2000, Math.min(30000, n.timeoutMs));
    for (const action of asArray(root?.actions)) {
        const a = asObject(action);
        const deletion = asObject(a?.markChatItemAsDeletedAction) || asObject(a?.removeChatItemAction);
        if (deletion) result.deleted.push(asString(deletion.targetItemId));
        const authorDeletion = asObject(a?.markChatItemsByAuthorAsDeletedAction);
        if (authorDeletion) result.deletedAuthors.push(asString(authorDeletion.externalChannelId));
        const replacement = asObject(a?.replaceChatItemAction);
        if (replacement) result.deleted.push(asString(replacement.targetItemId));
        const item = asObject(asObject(a?.addChatItemAction)?.item) || asObject(replacement?.replacementItem);
        if (!item) continue;
        for (const key of ["liveChatTextMessageRenderer", "liveChatPaidMessageRenderer", "liveChatMembershipItemRenderer", "liveChatPaidStickerRenderer", "liveChatSponsorshipsGiftPurchaseAnnouncementRenderer", "liveChatViewerEngagementMessageRenderer"]) {
            const r = asObject(item[key]);
            if (!r || !asString(r.id)) continue;
            const gift = asObject(asObject(r.header)?.liveChatSponsorshipsHeaderRenderer);
            result.entries.push({ id: asString(r.id), author: extractText(r.authorName) || "YouTube", channelId: asString(r.authorExternalChannelId), text: chatText(r.message) || chatText(r.headerSubtext) || chatText(gift?.primaryText) || (key === "liveChatPaidStickerRenderer" ? "Super sticker" : ""), meta: extractText(r.purchaseAmountText) });
        }
    }
    return result;
}
