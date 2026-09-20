import type { JsonObject } from "../types";

// Only inspect attribution fields, never unrelated channel recommendations.
export function readVideoChannelId(renderer: JsonObject): string | undefined {
    const find = (node: unknown, depth = 0): string | undefined => {
        if (!node || typeof node !== "object" || depth > 14) return;
        const object = node as JsonObject;
        if (typeof object.browseId === "string" && /^UC[\w-]{22}$/.test(object.browseId)) return object.browseId;
        for (const value of Object.values(object)) { const id = find(value, depth + 1); if (id) return id; }
    };
    for (const key of ["longBylineText", "shortBylineText", "ownerText", "bylineText", "channelThumbnailSupportedRenderers", "metadata"]) {
        const id = find(renderer[key]); if (id) return id;
    }
}
