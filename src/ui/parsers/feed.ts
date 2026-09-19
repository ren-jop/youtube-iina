import { readLockupMetadata } from "./lockupMetadata";
import type {
    FeedParseDiagnostics,
    FeedParseRejectReason,
    FeedParseResult,
    FeedVideoItem,
    JsonObject
} from "../types";
import { formatHumanReadableViews } from "../utils/format";
import { isValidYouTubeVideoId } from "../utils/ids";
import { asArray, asObject, asString } from "../utils/json";
import { extractText, extractThumbnailUrl } from "../utils/text";
import {
    buildFallbackThumbnailUrl,
    createEmptyFeedParseDiagnostics,
    dedupeFeedItems,
    extractTileMetadataLineTexts,
    incrementFeedRejectReason,
    isLikelyAdVideoRenderer,
    isLikelyShortOrLiveVideoRenderer,
    isLikelyVideoThumbnailUrl
} from "./common";

function rejectWithReason(
    diagnostics: FeedParseDiagnostics,
    reason: FeedParseRejectReason
): null {
    incrementFeedRejectReason(diagnostics, reason);
    return null;
}

function parseFeedVideoFromRenderer(renderer: JsonObject, diagnostics: FeedParseDiagnostics): FeedVideoItem | null {
    const lockupMetadata = asObject(asObject(renderer.metadata)?.lockupMetadataViewModel);
    const modernMetadata = readLockupMetadata(lockupMetadata);
    const contentType = asString(renderer.contentType).trim();
    if (contentType && !/VIDEO/i.test(contentType)) {
        return rejectWithReason(diagnostics, "content_type_filtered");
    }

    const tileHeaderRenderer = asObject(asObject(renderer.header)?.tileHeaderRenderer);
    const tileMetadataRenderer = asObject(asObject(renderer.metadata)?.tileMetadataRenderer);
    const watchEndpoint = asObject(asObject(renderer.navigationEndpoint)?.watchEndpoint)
        || asObject(asObject(renderer.onSelectCommand)?.watchEndpoint);
    const watchEndpointVideoId = asString(watchEndpoint?.videoId).trim();
    const tileLines = extractTileMetadataLineTexts(tileMetadataRenderer?.lines);
    const tileStatsLine = tileLines.find((line) => /views?/i.test(line)) || "";
    const tileChannelLine = tileLines.find((line) => !/views?/i.test(line) && line !== "•") || "";

    const rendererVideoId = asString(renderer.videoId).trim();
    const contentId = asString(renderer.contentId).trim();
    const videoId = rendererVideoId || watchEndpointVideoId || contentId;
    const title = extractText(renderer.title).trim()
        || extractText(renderer.headline).trim()
        || extractText(renderer.videoTitle).trim()
        || extractText(tileMetadataRenderer?.title).trim()
        || extractText(lockupMetadata?.title).trim();
    const channelTitle = extractText(renderer.longBylineText).trim()
        || extractText(renderer.shortBylineText).trim()
        || extractText(renderer.ownerText).trim()
        || extractText(renderer.subtitle).trim()
        || extractText(renderer.bylineText).trim()
        || modernMetadata.channel
        || tileChannelLine
        || "Unknown channel";
    const thumbnailSourceUrl = extractThumbnailUrl(renderer.thumbnail)
        || extractThumbnailUrl(renderer.avatar)
        || extractThumbnailUrl(asObject(renderer.thumbnailRenderer)?.thumbnail)
        || extractThumbnailUrl(tileHeaderRenderer?.thumbnail)
        || extractThumbnailUrl(asObject(asObject(renderer.contentImage)?.thumbnailViewModel)?.image);
    const thumbnailUrl = thumbnailSourceUrl || (videoId ? buildFallbackThumbnailUrl(videoId) : "");
    const rawViewCountText = extractText(renderer.shortViewCountText).trim() || extractText(renderer.viewCountText).trim();
    const viewCountText = formatHumanReadableViews(rawViewCountText || modernMetadata.views || tileStatsLine);
    const publishedText = extractText(renderer.publishedTimeText).trim()
        || extractText(renderer.publishedText).trim()
        || extractText(renderer.metadataText).trim()
        || modernMetadata.published
        || tileStatsLine;

    if (isLikelyAdVideoRenderer(renderer, title, channelTitle, [publishedText, rawViewCountText, ...tileLines])) {
        return rejectWithReason(diagnostics, "ad_marker");
    }

    if (isLikelyShortOrLiveVideoRenderer(renderer)) {
        return rejectWithReason(diagnostics, "short_or_live_marker");
    }

    if (!videoId) {
        return rejectWithReason(diagnostics, "missing_video_id");
    }

    if (!title) {
        return rejectWithReason(diagnostics, "missing_title");
    }

    if (!isValidYouTubeVideoId(videoId)) {
        return rejectWithReason(diagnostics, "invalid_video_id");
    }

    if (watchEndpointVideoId && !isValidYouTubeVideoId(watchEndpointVideoId)) {
        return rejectWithReason(diagnostics, "watch_video_id_invalid");
    }

    if (watchEndpointVideoId && watchEndpointVideoId !== videoId) {
        return rejectWithReason(diagnostics, "watch_video_id_mismatch");
    }

    const hasTrustedThumbnail = Boolean(thumbnailSourceUrl && isLikelyVideoThumbnailUrl(thumbnailSourceUrl));
    if (!hasTrustedThumbnail && !watchEndpointVideoId) {
        return rejectWithReason(diagnostics, "thumbnail_untrusted");
    }

    let confidenceScore = 1;
    if (!watchEndpointVideoId) {
        confidenceScore -= 0.2;
    }
    if (!hasTrustedThumbnail) {
        confidenceScore -= 0.25;
    }
    if (!publishedText) {
        confidenceScore -= 0.15;
    }

    const parseConfidenceLevel = confidenceScore >= 0.85
        ? "high"
        : confidenceScore >= 0.6
            ? "medium"
            : "low";

    if (parseConfidenceLevel === "low") {
        return rejectWithReason(diagnostics, "thumbnail_untrusted");
    }

    const overlayDuration = asArray(renderer.thumbnailOverlays)
        .map((overlay) => extractText(asObject(asObject(overlay)?.thumbnailOverlayTimeStatusRenderer)?.text))
        .find((text) => /^\d+(?::\d{2}){1,2}$/.test(text));
    const durationLabel = extractText(renderer.lengthText) || overlayDuration
        || extractText(asObject(tileHeaderRenderer?.thumbnailOverlayTimeStatusRenderer)?.text);

    return {
        videoId,
        title,
        published: publishedText,
        channelTitle,
        thumbnailUrl,
        viewCountText: viewCountText || undefined,
        durationLabel: durationLabel || undefined,
        parseConfidenceLevel
    };
}

function collectFeedVideoRenderers(
    node: unknown,
    videos: FeedVideoItem[],
    diagnostics: FeedParseDiagnostics
): void {
    // Walk iteratively: large/deep browse payloads must not exhaust the JS stack.
    // Only inspect video candidates; serializing every ancestor was quadratic.
    const stack: unknown[] = [node];
    while (stack.length > 0) {
        const current = stack.pop();
        if (Array.isArray(current)) {
            for (let i = current.length - 1; i >= 0; i -= 1) stack.push(current[i]);
            continue;
        }
        const objectNode = asObject(current);
        if (!objectNode) continue;
        diagnostics.totalVisitedNodes += 1;
        const candidate = objectNode.videoId || objectNode.contentId
            || asObject(objectNode.navigationEndpoint)?.watchEndpoint
            || asObject(objectNode.onSelectCommand)?.watchEndpoint;
        if (candidate) {
            const parsed = parseFeedVideoFromRenderer(objectNode, diagnostics);
            if (parsed) videos.push(parsed);
            // Do not reinterpret a rejected card's nested endpoint as a video.
            continue;
        }
        const values = Object.values(objectNode);
        for (let i = values.length - 1; i >= 0; i -= 1) {
            if (values[i] && typeof values[i] === "object") stack.push(values[i]);
        }
    }
}

export function parseFeedItemsFromBrowseResponse(payload: unknown): FeedParseResult {
    const videos: FeedVideoItem[] = [];
    const diagnostics = createEmptyFeedParseDiagnostics();
    collectFeedVideoRenderers(payload, videos, diagnostics);
    const deduped = dedupeFeedItems(videos);
    diagnostics.acceptedItems = deduped.length;
    return {
        items: deduped,
        diagnostics
    };
}
