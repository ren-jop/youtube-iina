import { loadChannelVideos } from "../innertube/channels";
import { filterReason } from "../storage/feedFilters";
import { selectedVideo, selectedVideoTitle } from "./playerUi";
import type { PlaybackLifecycleEventPayload } from "../../shared/messages";
import {
    RELATED_EMPTY_TEXT,
    RELATED_IDLE_TEXT,
    RELATED_ITEMS_LIMIT
} from "../constants";
import {
    relatedEmptyState,
    relatedList,
    relatedStatus
} from "../dom";
import {
    fetchRelatedFeed
} from "../innertube/feedBrowse";
import { renderRelated as renderRelatedView } from "../render/related";
import { state } from "../state";
import type {
    FeedVideoItem
} from "../types";

interface RelatedControllerDependencies {
    updateActiveViewLoadingIndicators: () => void;
    playFeedItem: (item: FeedVideoItem) => void;
    resolveFeedItemPresentation: (item: FeedVideoItem) => {
        title: string;
        thumbnailUrl: string;
        durationLabel: string;
        channelLine: string;
        statsLine: string;
    };
    buildFinalFilteredFeedItems: (items: FeedVideoItem[], limit: number) => Promise<FeedVideoItem[]>;
    renderModeTabs: () => void;
}

export interface RelatedController {
    renderRelated: () => void;
    refreshRelated: () => Promise<void>;
    handlePlaybackLifecycleEvent: (payload: PlaybackLifecycleEventPayload) => void;
}

export function createRelatedController(dependencies: RelatedControllerDependencies): RelatedController {
    const renderRelated = (): void => {
        renderRelatedView({
            relatedState: state.relatedState,
            elements: {
                list: relatedList,
                emptyState: relatedEmptyState,
                status: relatedStatus
            },
            relatedIdleText: RELATED_IDLE_TEXT,
            relatedEmptyText: RELATED_EMPTY_TEXT,
            onUpdateLoadingIndicators: dependencies.updateActiveViewLoadingIndicators,
            onPlayItem: dependencies.playFeedItem,
            resolveItemPresentation: dependencies.resolveFeedItemPresentation
        });
    };

    let displayedVideoId = "";
    const refreshRelated = async (): Promise<void> => {
        if (state.relatedState.isLoading) return;
        const videoId = state.currentPlaybackVideoId.trim();
        const refreshId = ++state.relatedRefreshSequence;
        const source = [...state.feedState.items, ...state.searchState.videos, ...state.relatedState.items, ...state.subscriptionsState.items].find(item => item.videoId === videoId) || selectedVideo(videoId);
        if (!videoId) {
            state.relatedState.items = []; state.relatedState.status = RELATED_IDLE_TEXT; renderRelated(); return;
        }
        if (displayedVideoId !== videoId) state.relatedState.items = [];
        displayedVideoId = videoId;
        state.relatedState.isLoading = true;
        state.relatedState.warning = ""; state.relatedState.status = "";
        renderRelated();
        let channelAdded = false, relatedAdded = false;
        let channelItems: FeedVideoItem[] = [];
        const accept = async (incoming: FeedVideoItem[], fromChannel: boolean, limit = RELATED_ITEMS_LIMIT): Promise<void> => {
            const filtered = incoming.filter(item => item.videoId !== videoId && !filterReason({...item, durationLabel: dependencies.resolveFeedItemPresentation(item).durationLabel}));
            const items = await dependencies.buildFinalFilteredFeedItems(filtered, limit);
            if (refreshId !== state.relatedRefreshSequence) return;
            if (fromChannel) channelAdded = items.length > 0; else relatedAdded = items.length > 0;
            // Append late arrivals so the video under the pointer never changes.
            const merged = new Map(state.relatedState.items.map(item => [item.videoId, item]));
            items.forEach(item => merged.set(item.videoId, item));
            state.relatedState.items = [...merged.values()].slice(0, RELATED_ITEMS_LIMIT);
            state.relatedState.warning = channelAdded ? (relatedAdded ? "Related videos and more from this channel." : "More from this channel.") : "";
            renderRelated();
        };
        // Channel uploads can appear while YouTube's slower Related/search request runs.
        await Promise.all([
            fetchRelatedFeed(videoId, source?.title || selectedVideoTitle(videoId)).then(result => accept(result.items, false)).catch(() => {}),
            loadChannelVideos({channelId: source?.channelId, videoId, title: source?.channelTitle}).then(result => { channelItems = result.items; return accept(channelItems, true, 8); }).catch(() => {})
        ]);
        if (refreshId !== state.relatedRefreshSequence) return;
        if (!relatedAdded && channelItems.length) await accept(channelItems, true);
        if (refreshId !== state.relatedRefreshSequence) return;
        state.relatedState.isLoading = false;
        state.relatedState.status = state.relatedState.items.length ? "" : "No videos available from Related or this channel. Try again, or check your filters.";
        renderRelated();
    };

    const handlePlaybackLifecycleEvent = (payload: PlaybackLifecycleEventPayload): void => {
        const videoId = String(payload?.videoId || "").trim();
        if (!videoId) {
            return;
        }

        if (videoId === state.currentPlaybackVideoId) {
            return;
        }

        state.currentPlaybackVideoId = videoId;
        ++state.relatedRefreshSequence;
        state.relatedState.isLoading = false;
        dependencies.updateActiveViewLoadingIndicators();
        dependencies.renderModeTabs();
        // Playback must not navigate or replace the list under the pointer.
        // The Related tab explicitly refreshes for the current video.
    };

    return {
        renderRelated,
        refreshRelated,
        handlePlaybackLifecycleEvent
    };
}
