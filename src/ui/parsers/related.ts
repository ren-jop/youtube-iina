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
