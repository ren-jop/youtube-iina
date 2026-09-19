import { asArray, asObject, asString } from "../utils/json";
import { extractText } from "../utils/text";

// New WEB video cards store attribution and stats separately from the title.
export function readLockupMetadata(metadata: unknown): { channel: string; views: string; published: string } {
    const content = asObject(asObject(metadata)?.metadata)?.contentMetadataViewModel;
    const rows = asArray(asObject(content)?.metadataRows);
    let channel = "";
    const labels: string[] = [];
    for (const row of rows) {
        for (const part of asArray(asObject(row)?.metadataParts)) {
            const text = asObject(asObject(part)?.text);
            const label = extractText(text).trim();
            if (!label) continue;
            labels.push(label);
            for (const run of asArray(text?.commandRuns)) {
                const command = asObject(asObject(asObject(run)?.onTap)?.innertubeCommand);
                const browseId = asString(asObject(command?.browseEndpoint)?.browseId);
                if (browseId.startsWith("UC")) {
                    const start = Number(asObject(run)?.startIndex || 0);
                    const length = Number(asObject(run)?.length || label.length);
                    channel ||= label.slice(start, start + length).trim();
                }
            }
        }
    }
    // Some cards omit author links, but retain the dedicated first metadata row.
    const firstRow = asArray(asObject(rows[0])?.metadataParts);
    const firstLabel = extractText(asObject(firstRow[0])?.text).trim();
    if (!channel && firstLabel && !/\b(views?|ago|watching|streamed|subscribers?|recommended)\b/i.test(firstLabel)) channel = firstLabel;
    return {
        channel,
        views: labels.find(label => /\bviews?\b/i.test(label)) || "",
        published: labels.find(label => /\b(ago|streamed|premiered)\b/i.test(label)) || ""
    };
}
