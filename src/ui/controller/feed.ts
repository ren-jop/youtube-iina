import { createRefreshQueue } from "../utils/refreshQueue";
import { newestFirst, filterSubscriptions } from "./subscriptionTools";
import { requestPlayback } from "./playerUi";
import { MESSAGE_NAMES } from "../../shared/messages";
import {
    FEED_EMPTY_NO_FAVORITES_TEXT,
    FEED_FETCH_CONCURRENCY,
    FEED_ITEMS_LIMIT,
    HOME_EMPTY_TEXT,
    HOME_ITEMS_LIMIT
} from "../constants";
import { feedEmptyState, feedFavoritesList, feedStatus } from "../dom";
import {
    describeFeedFetchFailure,
    fetchChannelFeedFromInnertube,
    fetchLoggedInHomeFeed,
    fetchLoggedInSubscriptionsFeed as fetchLoggedInSubscriptionsFeedFromInnertube
} from "../innertube/feedBrowse";
import {
    buildFinalFilteredFeedItems as buildFinalFilteredFeedItemsFromMetadata,
    getVideoMetadataFromCache as getVideoMetadataFromCacheFromMetadata,
} from "../innertube/metadata";
import { renderFeed as renderFeedView } from "../render/feed";
import { state } from "../state";
import { persistVideoMetadataCacheToStorage as persistVideoMetadataMapToStorage } from "../storage/videoMetaCache";
import type {
    ChannelFeedResult,
    FeedFetchResult,
    FeedVideoItem,
    SearchVideoResult,
    VideoMetadata
} from "../types";
import {
    resolveFeedItemPresentation as resolveFeedItemPresentationFromPresentation,
    resolveSearchVideoPresentation as resolveSearchVideoPresentationFromPresentation,
    type FeedItemPresentation
} from "./feedPresentation";
import { mapWithConcurrency } from "../utils/async";

interface FeedControllerDependencies {
    updateActiveViewLoadingIndicators: () => void;
    getValidTvAccessToken: () => Promise<string>;
    refreshTvAccessToken: () => Promise<string>;
}

export interface FeedController {
    refreshFeed: (force?: boolean) => Promise<void>;
    renderFeed: () => void;
    playFeedItem: (item: FeedVideoItem) => void;
    resolveFeedItemPresentation: (item: FeedVideoItem) => FeedItemPresentation;
    resolveSearchVideoPresentation: (video: SearchVideoResult, metadata: VideoMetadata | null) => {
        thumbnailUrl: string;
        durationLabel: string;
        channelLine: string;
        statsLine: string;
    };
    getVideoMetadataFromCache: (videoId: string) => VideoMetadata | null;
    buildFinalFilteredFeedItems: (items: FeedVideoItem[], limit: number) => Promise<FeedVideoItem[]>;
    fetchLoggedInSubscriptionsFeed: () => Promise<FeedFetchResult>;
}

export function createFeedController(dependencies: FeedControllerDependencies): FeedController {
    const persistVideoMetadataCacheToStorage = (): void => {
        persistVideoMetadataMapToStorage(state.videoMetadataCacheByVideoId);
    };

    const getVideoMetadataFromCache = (videoId: string): VideoMetadata | null => {
        return getVideoMetadataFromCacheFromMetadata(state.videoMetadataCacheByVideoId, videoId);
    };

    const buildFinalFilteredFeedItems = async (items: FeedVideoItem[], limit: number): Promise<FeedVideoItem[]> => {
        return buildFinalFilteredFeedItemsFromMetadata(items, limit, state.videoMetadataCacheByVideoId, persistVideoMetadataCacheToStorage);
    };

    const toFeedStatusMessage = (
        prefix: string,
        result: Pick<FeedFetchResult, "failureReason" | "statusCode">
    ): string => {
        if (!result.failureReason) {
            return "";
        }

        const detail = describeFeedFetchFailure(result.failureReason, "Request failed.");
        const statusCodeSuffix = Number.isFinite(result.statusCode)
            ? ` (HTTP ${result.statusCode})`
            : "";
        return `${prefix}: ${detail}${statusCodeSuffix}`;
    };

    const countRejectedByParser = (channelResult: ChannelFeedResult): number => {
        return Object.values(channelResult.diagnostics.rejectedByReason)
            .reduce((total, count) => total + (count || 0), 0);
    };

    const loadChannelFeed = async (channelId: string): Promise<ChannelFeedResult> => {
        try {
            const result = await fetchChannelFeedFromInnertube(channelId);
            return {
                channelId,
                items: result.items.map(item => ({ ...item, channelId: item.channelId || channelId, channelTitle: !item.channelTitle || item.channelTitle === "Unknown channel"
                    ? state.favorites.find(channel => channel.channelId === channelId)?.title || item.channelTitle : item.channelTitle })),
                hadError: Boolean(result.failureReason),
                failureReason: result.failureReason,
                statusCode: result.statusCode,
                diagnostics: result.diagnostics
            };
        } catch {
            return {
                channelId,
                items: [],
                hadError: true,
                failureReason: "unknown_error",
                diagnostics: {
                    totalVisitedNodes: 0,
                    acceptedItems: 0,
                    rejectedByReason: {}
                }
            };
        }
    };

    const mergeFeedItems = (channelResults: ChannelFeedResult[]): FeedVideoItem[] => {
        const deduped = new Map<string, FeedVideoItem>();

        channelResults.forEach((result) => {
            result.items.forEach((item) => {
                if (!deduped.has(item.videoId)) {
                    deduped.set(item.videoId, item);
                }
            });
        });

        return newestFirst([...deduped.values()]).slice(0, FEED_ITEMS_LIMIT);
    };

    const resolveFeedItemPresentation = (itemData: FeedVideoItem): FeedItemPresentation => {
        const metadata = getVideoMetadataFromCache(itemData.videoId);
        return resolveFeedItemPresentationFromPresentation(itemData, metadata);
    };

    const resolveSearchVideoPresentation = (video: SearchVideoResult, metadata: VideoMetadata | null): {
        thumbnailUrl: string;
        durationLabel: string;
        channelLine: string;
        statsLine: string;
    } => {
        return resolveSearchVideoPresentationFromPresentation(video, metadata);
    };

    const renderFeed = (): void => {
        const filter = document.querySelector<HTMLElement>("[data-feed-filter-row]");
        if (filter) filter.hidden = state.appMode !== "anonymous";

        renderFeedView({
            appMode: state.appMode,
            favoritesCount: state.favorites.length,
            feedState: { ...state.feedState, items: state.appMode === "anonymous" ? filterSubscriptions(state.feedState.items, document.querySelector<HTMLInputElement>("[data-feed-filter]")?.value || "") : state.feedState.items },
            elements: {
                list: feedFavoritesList,
                emptyState: feedEmptyState,
                status: feedStatus
            },
            feedEmptyNoFavoritesText: FEED_EMPTY_NO_FAVORITES_TEXT,
            defaultEmptyText: document.querySelector<HTMLInputElement>("[data-feed-filter]")?.value.trim() ? "No loaded subscription videos match your search." : "No recent uploads found for your channels.",
            onUpdateLoadingIndicators: dependencies.updateActiveViewLoadingIndicators,
            onPlayItem: playFeedItem,
            resolveItemPresentation: resolveFeedItemPresentation
        });
    };

    const playFeedItem = (item: FeedVideoItem): void => {
        if (!state.iinaApi || typeof state.iinaApi.postMessage !== "function") {
            return;
        }

        requestPlayback(item);
    };

    const fetchLoggedInSubscriptionsFeed = async (): Promise<FeedFetchResult> => {
        return fetchLoggedInSubscriptionsFeedFromInnertube({
            isTvAuthAvailable: () => Boolean(state.tvAuthCache),
            getValidTvAccessToken: dependencies.getValidTvAccessToken,
            refreshTvAccessToken: dependencies.refreshTvAccessToken
        });
    };

    const refreshFeedOnce = async (): Promise<void> => {
        const refreshId = ++state.feedRefreshSequence;

        if (state.appMode === "logged_in") {
            state.feedState.isLoading = true;
            state.feedState.warning = "";
            state.feedState.status = "";
            renderFeed();

            try {
                const homeResult = await fetchLoggedInHomeFeed({
                    isTvAuthAvailable: () => Boolean(state.tvAuthCache),
                    getValidTvAccessToken: dependencies.getValidTvAccessToken,
                    refreshTvAccessToken: dependencies.refreshTvAccessToken
                });
                const items = await buildFinalFilteredFeedItems(homeResult.items, HOME_ITEMS_LIMIT);
                if (refreshId !== state.feedRefreshSequence) {
                    return;
                }

                if (items.length || !homeResult.failureReason) state.feedState.items = items;
                state.feedState.isLoading = false;
                state.feedState.warning = "";
                if (homeResult.failureReason) {
                    state.feedState.status = toFeedStatusMessage("Could not load home recommendations", homeResult);
                } else if (homeResult.items.length > 0 && items.length === 0) {
                    state.feedState.status = "No playable home recommendations available.";
                } else {
                    state.feedState.status = items.length > 0 ? "" : HOME_EMPTY_TEXT;
                }

                renderFeed();
            } catch (error) {
                if (refreshId !== state.feedRefreshSequence) {
                    return;
                }

                state.feedState.isLoading = false;
                state.feedState.warning = "";
                state.feedState.status = `Could not load home recommendations: ${error instanceof Error ? error.message : String(error)}`;
                renderFeed();
            }
            return;
        }

        const favoriteChannelIds = [...new Set<string>(
            state.favorites
                .map((favorite) => favorite.channelId.trim())
                .filter((channelId): channelId is string => channelId.length > 0)
        )];

        if (favoriteChannelIds.length === 0) {
            state.feedState.isLoading = false;
            state.feedState.items = [];
            state.feedState.status = "";
            state.feedState.warning = "";
            renderFeed();
            return;
        }

        state.feedState.isLoading = true;
        state.feedState.warning = "";
        state.feedState.status = "";
        renderFeed();

        let channelResults: ChannelFeedResult[] = [];
        try {
            const completed: ChannelFeedResult[] = [];
            const showProgressively = !state.feedState.items.length;
            channelResults = await mapWithConcurrency(favoriteChannelIds, FEED_FETCH_CONCURRENCY, async channelId => {
                const result = await loadChannelFeed(channelId);
                if (refreshId !== state.feedRefreshSequence) return result;
                completed.push(result);
                // Show usable uploads without waiting for the slowest channel.
                if (showProgressively && result.items.length) {
                    const partial = await buildFinalFilteredFeedItems(mergeFeedItems(completed), FEED_ITEMS_LIMIT);
                    if (refreshId === state.feedRefreshSequence) { state.feedState.items = partial; renderFeed(); }
                }
                return result;
            });
        } catch {
            if (refreshId !== state.feedRefreshSequence) {
                return;
            }

            state.feedState.isLoading = false;
            state.feedState.status = "Could not load latest uploads.";
            state.feedState.warning = "";
            renderFeed();
            return;
        }

        if (refreshId !== state.feedRefreshSequence) {
            return;
        }

        const mergedItems = mergeFeedItems(channelResults);
        const filteredItems = await buildFinalFilteredFeedItems(mergedItems, FEED_ITEMS_LIMIT);
        if (refreshId !== state.feedRefreshSequence) {
            return;
        }
        const failedWithoutCacheCount = channelResults.filter((result) => result.hadError && result.items.length === 0).length;
        const parseEmptyCount = channelResults.filter((result) => result.failureReason === "parse_empty").length;
        const parserRejectedChannelCount = channelResults.filter((result) => {
            return result.items.length === 0 && countRejectedByParser(result) > 0;
        }).length;

        if (filteredItems.length || !failedWithoutCacheCount) state.feedState.items = filteredItems;
        state.feedState.isLoading = false;
        if (filteredItems.length > 0) {
            state.feedState.status = "";
        } else if (parseEmptyCount > 0 || parserRejectedChannelCount > 0) {
            state.feedState.status = "Could not find playable videos in YouTube response.";
        } else if (failedWithoutCacheCount > 0) {
            state.feedState.status = "Could not load latest uploads.";
        } else {
            state.feedState.status = "No recent uploads found for your channels.";
        }

        if (failedWithoutCacheCount > 0) {
            state.feedState.warning = `Could not load ${failedWithoutCacheCount} channel${failedWithoutCacheCount === 1 ? "" : "s"}.`;
        } else {
            state.feedState.warning = "";
        }

        renderFeed();
    };

    const refreshFeed = createRefreshQueue(refreshFeedOnce);
    document.querySelector("[data-feed-filter]")?.addEventListener("input", renderFeed);

    return {
        refreshFeed,
        renderFeed,
        playFeedItem,
        resolveFeedItemPresentation,
        resolveSearchVideoPresentation,
        getVideoMetadataFromCache,
        buildFinalFilteredFeedItems,
        fetchLoggedInSubscriptionsFeed
    };
}
