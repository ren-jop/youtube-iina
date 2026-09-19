import type { JsonObject } from "../types";
import { asArray, asObject, asString } from "../utils/json";
import { extractText } from "../utils/text";

export function watchNextResults(payload: unknown): unknown[] {
    const contents = asObject(asObject(payload)?.contents);
    const twoColumn = asObject(contents?.twoColumnWatchNextResults);
    return asArray(asObject(asObject(twoColumn?.secondaryResults)?.secondaryResults)?.results);
}

export function relatedFilter(payload: unknown): { selected: boolean; token: string } | null {
    const stack: unknown[] = [...watchNextResults(payload)];
    while (stack.length) {
        const current = stack.pop();
        if (Array.isArray(current)) { stack.push(...current); continue; }
        const object = asObject(current);
        if (!object) continue;
        const chip = asObject(object.chipCloudChipRenderer);
        if (chip && extractText(chip.text).trim().toLowerCase() === "related") {
            const endpoint = asObject(chip.navigationEndpoint);
            return { selected: chip.isSelected === true,
                token: asString(asObject(endpoint?.continuationCommand)?.token) };
        }
        for (const value of Object.values(object)) if (value && typeof value === "object") stack.push(value);
    }
    return null;
}

// Scope both cards and pagination to the watch-next feed. Never traverse comments,
// autoplay, playlists or the other filter chips to select a continuation.
export function relatedCards(payload: unknown, initial = false): unknown[] {
    const results: unknown[] = [];
    const append = (nodes: unknown[]): void => {
        for (const node of nodes) {
            const object = asObject(node);
            if (!object) continue;
            if (object.compactVideoRenderer || object.videoRenderer || object.lockupViewModel || object.continuationItemRenderer) results.push(node);
            const section = asObject(object.itemSectionRenderer);
            if (section && (!section.targetId || section.targetId === "watch-next-feed")) append(asArray(section.contents));
        }
    };
    if (initial) append(watchNextResults(payload));
    const root = asObject(payload);
    for (const key of ["onResponseReceivedEndpoints", "onResponseReceivedActions"]) {
        for (const action of asArray(root?.[key])) {
            const object = asObject(action);
            const command: JsonObject | null = asObject(object?.reloadContinuationItemsCommand) || asObject(object?.appendContinuationItemsAction);
            if (command?.targetId === "watch-next-feed") append(asArray(command.continuationItems));
        }
    }
    return results;
}

const TOPIC_STOP_WORDS = new Set("a an the and or but how why what when where who which this that these those with without from your you yours our their for are was were have has had not all any can could should would will does dont doesn't into about just more most best video videos watch watching make making get gets new really very only some its it's they them his her than then now part episode official full review explained levels level things tips ways challenge day days minutes minute hours hour life world people time biggest greatest top stop start actually".split(" "));
export function topicWords(title: string): Set<string> {
    return new Set((title.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter(word=>word.length>=3 && !/^\d+$/.test(word) && !TOPIC_STOP_WORDS.has(word)).map(word=>word.length>5 ? word.replace(/(ing|ies|s)$/, match=>match==='ies'?'y':'') : word));
}
export function currentVideoTitle(payload: unknown): string {
    const contents=asObject(asObject(payload)?.contents);
    const results=asObject(asObject(asObject(contents?.twoColumnWatchNextResults)?.results)?.results);
    for(const item of asArray(results?.contents)) {
        const title=extractText(asObject(asObject(item)?.videoPrimaryInfoRenderer)?.title);
        if(title) return title;
    }
    return extractText(asObject(asObject(payload)?.videoDetails)?.title);
}
export function filterByTopic<T extends { title: string }>(items: T[], title: string): T[] {
    const source=topicWords(title);
    if(!source.size) return [];
    return items.filter(item=>{
        const shared=[...topicWords(item.title)].filter(word=>source.has(word));
        return shared.length>=2 || shared.some(word=>word.length>=5);
    });
}
