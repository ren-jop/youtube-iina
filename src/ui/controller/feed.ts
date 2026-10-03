import { createRefreshQueue } from "../utils/refreshQueue";
import { newestFirst } from "./subscriptionTools";
import { requestPlayback } from "./playerUi";
import { MESSAGE_NAMES } from "../../shared/messages";
import {
    FEED_FETCH_CONCURRENCY,
    FEED_ITEMS_LIMIT,
    HOME_EMPTY_TEXT,
    HOME_ITEMS_LIMIT,
    JAPANESE_HOME_ITEMS_LIMIT
} from "../constants";
import { feedEmptyState, feedFavoritesList, feedStatus } from "../dom";
import {
    describeFeedFetchFailure,
    fetchChannelFeedFromInnertube,
    fetchHomeTopicRecommendations,
    fetchLoggedInHomeFeed,
    fetchRelatedFeed,
    fetchLoggedInSubscriptionChannels as fetchLoggedInSubscriptionChannelsFromInnertube,
    fetchLoggedInSubscriptionsFeed as fetchLoggedInSubscriptionsFeedFromInnertube
} from "../innertube/feedBrowse";
import {
    buildFinalFilteredFeedItems as buildFinalFilteredFeedItemsFromMetadata,
    getVideoMetadataFromCache as getVideoMetadataFromCacheFromMetadata,
} from "../innertube/metadata";
import { renderFeed as renderFeedView } from "../render/feed";
import { state } from "../state";
import { persistVideoMetadataCacheToStorage as persistVideoMetadataMapToStorage } from "../storage/videoMetaCache";
import { isJapaneseTitle } from "../innertube/japanese";
import type {
    ChannelFeedResult,
    FeedFetchResult,
    FeedVideoItem,
    SearchChannelResult,
    SearchVideoResult,
    VideoMetadata
} from "../types";
import {
    resolveFeedItemPresentation as resolveFeedItemPresentationFromPresentation,
    resolveSearchVideoPresentation as resolveSearchVideoPresentationFromPresentation,
    type FeedItemPresentation
} from "./feedPresentation";
import { mapWithConcurrency } from "../utils/async";
import { getOptions, loadLibraryData } from "../storage/libraryData";
import {
    consumeDailyDistraction,
    getDiscoveryGuardSnapshot,
    isJapaneseDiscoveryActive
} from "../storage/discoveryGuard";
import {
    deriveHomeTopics,
    derivePersonalizedInterestQueries,
    fillHomeTopics,
    filterHomeItemsByTopic,
    homeTopicLabel,
    isEducationalContent,
    rankPersonalizedHomeItems,
    type HomeTopic
} from "./feedTopics";

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
    fetchLoggedInSubscriptionChannels: () => Promise<SearchChannelResult[]>;
}

export function createFeedController(dependencies: FeedControllerDependencies): FeedController {
    let forceFeedRefreshRequested = false;
    let homeRefreshRotation = 0;
    let activeHomeTopicId = "all";
    let availableHomeTopics: HomeTopic[] = [];
    const topicSupplementalItems = new Map<string, FeedVideoItem[]>();
    let topicSupplementRequest = 0;
    const discoveryGuardElement =
        document.querySelector<HTMLElement>("[data-discovery-guard]");
    const feedTopicsElement =
        document.querySelector<HTMLElement>("[data-feed-topics]");
    const persistVideoMetadataCacheToStorage = (): void => {
        persistVideoMetadataMapToStorage(state.videoMetadataCacheByVideoId);
    };

    const filterPassiveDiscoveryLanguage = (items: FeedVideoItem[]): FeedVideoItem[] => {
        const options = getOptions();
        const guard = getDiscoveryGuardSnapshot();
        if (!options.japaneseMode && !guard.dailyDistractionConsumed) return items;

        return items.filter((item) =>
            isJapaneseTitle(item.title)
            || (!options.japaneseMode && isEducationalContent(item.title, item.channelTitle))
            || (guard.dailyDistractionVideoId && item.videoId === guard.dailyDistractionVideoId)
        );
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

    const renderHomeTopics = (): void => {
        if (!feedTopicsElement) return;

        // Categories are part of For You itself, not a side effect of a
        // successful Home request. Keep the chips available while Home is
        // loading or temporarily empty so a category can bootstrap its own
        // recommendations.
        availableHomeTopics = fillHomeTopics(
            availableHomeTopics,
            7
        );

        const validIds = new Set(
            availableHomeTopics.map((topic) => topic.id)
        );
        if (
            activeHomeTopicId !== "all"
            && !validIds.has(activeHomeTopicId)
        ) {
            activeHomeTopicId = "all";
        }

        const japaneseMode = isJapaneseDiscoveryActive();
        const buttons: HTMLButtonElement[] = [];

        const makeButton = (
            id: string,
            label: string
        ): HTMLButtonElement => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "yt-feed-topic-chip";
            button.classList.toggle(
                "is-active",
                activeHomeTopicId === id
            );
            button.textContent = label;
            button.setAttribute(
                "aria-pressed",
                activeHomeTopicId === id
                    ? "true"
                    : "false"
            );
            button.addEventListener("click", () => {
                if (activeHomeTopicId === id) return;
                activeHomeTopicId = id;
                renderFeed();

                if (id === "all") return;
                const topic = availableHomeTopics.find((candidate) => candidate.id === id);
                if (!topic) return;
                const loaded = filterHomeItemsByTopic(state.feedState.items, id);
                const cached = topicSupplementalItems.get(id) || [];
                if (loaded.length + cached.length >= 8) return;

                const request = ++topicSupplementRequest;
                void fetchHomeTopicRecommendations(
                    homeTopicLabel(topic, japaneseMode),
                    japaneseMode,
                    16
                ).then((items) => {
                    if (request !== topicSupplementRequest || activeHomeTopicId !== id) return;
                    topicSupplementalItems.set(id, items);
                    renderFeed();
                });
            });
            return button;
        };

        buttons.push(
            makeButton(
                "all",
                japaneseMode ? "すべて" : "All"
            )
        );

        for (const topic of availableHomeTopics) {
            buttons.push(
                makeButton(
                    topic.id,
                    homeTopicLabel(
                        topic,
                        japaneseMode
                    )
                )
            );
        }

        feedTopicsElement.replaceChildren(...buttons);
        feedTopicsElement.hidden = buttons.length <= 1;
    };

    const updateHomePersonalization = (
        items: FeedVideoItem[]
    ): FeedVideoItem[] => {
        const history = loadLibraryData().history;
        const japaneseMode = isJapaneseDiscoveryActive();
        // Subscribing to a channel should not make For You collapse into the
        // subscriptions feed. Repeatedly watched channels already earn affinity
        // from local history; favorites are only a small explicit preference.
        const preferredChannels = state.favorites.map(
            (channel) => channel.title
        );
        const ranked = rankPersonalizedHomeItems(
            items,
            history,
            preferredChannels,
            {
                strength: japaneseMode ? 1.8 : 1.15,
                demoteWatched: true
            }
        );
        availableHomeTopics = fillHomeTopics(
            deriveHomeTopics(
                ranked,
                history
            ),
            7
        );

        if (
            activeHomeTopicId !== "all"
            && !availableHomeTopics.some(
                (topic) => topic.id === activeHomeTopicId
            )
        ) {
            activeHomeTopicId = "all";
        }

        return ranked;
    };

    const renderDiscoveryGuard = (): boolean => {
        if (!discoveryGuardElement) return false;

        const snapshot = getDiscoveryGuardSnapshot();
        const line = document.createElement("p");
        line.className = "yt-empty";

        if (snapshot.focusMinutesRemaining > 0) {
            line.textContent =
                `Focus · about ${snapshot.focusMinutesRemaining} min left`
                + (snapshot.focusPurpose ? ` · ${snapshot.focusPurpose}` : "")
                + ". Home is paused; Subscriptions stay available.";
            discoveryGuardElement.replaceChildren(line);
            discoveryGuardElement.hidden = false;
            return true;
        }

        if (snapshot.limitMinutes <= 0) {
            discoveryGuardElement.hidden = true;
            discoveryGuardElement.replaceChildren();
            return false;
        }

        if (!snapshot.dailyLimitReached) {
            if (snapshot.remainingMinutes <= 5) {
                line.textContent = `About ${snapshot.remainingMinutes} min of passive browsing left today.`;
                discoveryGuardElement.replaceChildren(line);
                discoveryGuardElement.hidden = false;
            } else {
                discoveryGuardElement.hidden = true;
                discoveryGuardElement.replaceChildren();
            }
            return false;
        }

        const controls = document.createElement("div");
        controls.className = "yt-discussion-toolbar";
        const focus = document.createElement("button");
        focus.type = "button";
        focus.textContent = "Focus on something";
        focus.addEventListener("click", () => {
            document.dispatchEvent(new CustomEvent("youtube-focus-start-requested"));
        });
        controls.append(focus);

        line.textContent =
            `Daily passive browsing limit reached (${snapshot.limitMinutes} min). `
            + "Search, Related, channels and Recent still work.";
        discoveryGuardElement.replaceChildren(line, controls);
        discoveryGuardElement.hidden = false;
        return true;
    };

    const renderFeed = (): void => {
        const filter = document.querySelector<HTMLElement>(
            "[data-feed-filter-row]"
        );
        if (filter) {
            // For You is recommendation-driven in both signed-in and anonymous
            // modes. Subscription searching belongs in the Subscriptions view.
            filter.hidden = true;
        }

        const discoveryBlocked = renderDiscoveryGuard();
        if (discoveryBlocked && feedTopicsElement) {
            feedTopicsElement.hidden = true;
        } else {
            renderHomeTopics();
        }

        const baseVisibleItems = filterHomeItemsByTopic(
            state.feedState.items,
            activeHomeTopicId
        );
        const supplementalItems = activeHomeTopicId !== "all"
            ? topicSupplementalItems.get(activeHomeTopicId) || []
            : [];
        const visibleItems = discoveryBlocked
            ? []
            : filterPassiveDiscoveryLanguage(
                [...new Map(
                    [...baseVisibleItems, ...supplementalItems]
                        .map((item) => [item.videoId, item] as const)
                ).values()]
            );

        renderFeedView({
            feedState: {
                ...state.feedState,
                items: visibleItems
            },
            elements: {
                list: feedFavoritesList,
                emptyState: feedEmptyState,
                status: feedStatus
            },
            defaultEmptyText:
                discoveryBlocked
                    ? "Passive browsing is paused. Use Search, Related, channels or Recent for something deliberate."
                    : activeHomeTopicId !== "all"
                        ? "No recommendations in this topic."
                        : HOME_EMPTY_TEXT,
            onUpdateLoadingIndicators:
                dependencies.updateActiveViewLoadingIndicators,
            onPlayItem: playFeedItem,
            resolveItemPresentation:
                resolveFeedItemPresentation
        });
    };

    const playFeedItem = (item: FeedVideoItem): void => {
        if (!state.iinaApi || typeof state.iinaApi.postMessage !== "function") {
            return;
        }

        if (state.activeView === "feed" && !isJapaneseDiscoveryActive()) {
            const consumed = consumeDailyDistraction(item.videoId);
            if (consumed) {
                document.dispatchEvent(new CustomEvent("youtube-daily-distraction-changed", {
                    detail: { reason: "consumed", videoId: item.videoId }
                }));
            }
        }

        requestPlayback(item);
    };

    const fetchLoggedInSubscriptionChannels = async (): Promise<SearchChannelResult[]> => {
        return fetchLoggedInSubscriptionChannelsFromInnertube({
            isTvAuthAvailable: () => Boolean(state.tvAuthCache),
            getValidTvAccessToken: dependencies.getValidTvAccessToken,
            refreshTvAccessToken: dependencies.refreshTvAccessToken
        });
    };

    const fetchLoggedInSubscriptionsFeed = async (): Promise<FeedFetchResult> => {
        return fetchLoggedInSubscriptionsFeedFromInnertube({
            isTvAuthAvailable: () => Boolean(state.tvAuthCache),
            getValidTvAccessToken: dependencies.getValidTvAccessToken,
            refreshTvAccessToken: dependencies.refreshTvAccessToken
        });
    };

    const refreshFeedOnce = async (): Promise<void> => {
        const forceRefresh = forceFeedRefreshRequested;
        forceFeedRefreshRequested = false;
        if (forceRefresh) {
            homeRefreshRotation += 1;
            activeHomeTopicId = "all";
            availableHomeTopics = [];
            topicSupplementRequest += 1;
            topicSupplementalItems.clear();
        }

        const refreshId = ++state.feedRefreshSequence;
        state.feedState.isLoading = true;
        state.feedState.warning = "";
        state.feedState.status = "";
        renderFeed();

        try {
            const previousVideoIds = new Set(
                state.feedState.items.map((item) => item.videoId)
            );
            const japaneseMode = isJapaneseDiscoveryActive();
            const history = loadLibraryData().history;

            // The first few history rows are the current viewing session in
            // practice because history is normalized newest-first. Use several
            // distinct recent videos so one accidental click cannot define the
            // whole feed, while repeated recent topics/channels still compound.
            const recentHistorySeeds: typeof history = [];
            const perChannelSeedCount = new Map<string, number>();
            for (const item of history.slice(0, 24)) {
                if (!item.title.trim()) continue;
                const channelKey = item.channelTitle.trim().toLocaleLowerCase();
                const count = channelKey
                    ? (perChannelSeedCount.get(channelKey) || 0)
                    : 0;
                if (channelKey && count >= 2) continue;
                recentHistorySeeds.push(item);
                if (channelKey) {
                    perChannelSeedCount.set(channelKey, count + 1);
                }
                if (recentHistorySeeds.length >= (forceRefresh ? 6 : 4)) break;
            }

            const interestQueries = derivePersonalizedInterestQueries(
                history,
                forceRefresh
                    ? (japaneseMode ? 5 : 5)
                    : (japaneseMode ? 4 : 4),
                japaneseMode
            );

            const favoriteChannelIds = [...new Set(
                state.favorites
                    .map((favorite) => favorite.channelId.trim())
                    .filter(Boolean)
            )].slice(0, history.length < 8 ? 8 : 4);

            const emptyHomeResult: FeedFetchResult = {
                items: [],
                diagnostics: {
                    totalVisitedNodes: 0,
                    acceptedItems: 0,
                    rejectedByReason: {}
                }
            };

            const homePromise = state.appMode === "logged_in"
                ? fetchLoggedInHomeFeed({
                    isTvAuthAvailable: () => Boolean(state.tvAuthCache),
                    getValidTvAccessToken: dependencies.getValidTvAccessToken,
                    refreshTvAccessToken: dependencies.refreshTvAccessToken
                }, forceRefresh).catch(() => ({
                    ...emptyHomeResult,
                    failureReason: "unknown_error" as const
                }))
                : Promise.resolve(emptyHomeResult);

            const relatedPromise = mapWithConcurrency(
                recentHistorySeeds,
                2,
                async (seed) => {
                    try {
                        const result = await fetchRelatedFeed(
                            seed.videoId,
                            seed.title
                        );
                        return result.items.slice(0, 10);
                    } catch {
                        return [];
                    }
                }
            );

            const interestPromise = mapWithConcurrency(
                interestQueries,
                2,
                (query) => fetchHomeTopicRecommendations(
                    query,
                    japaneseMode,
                    12
                )
            );

            const favoritesPromise = favoriteChannelIds.length
                ? mapWithConcurrency(
                    favoriteChannelIds,
                    FEED_FETCH_CONCURRENCY,
                    loadChannelFeed
                ).then(mergeFeedItems).catch(() => [])
                : Promise.resolve<FeedVideoItem[]>([]);

            const [
                homeResult,
                relatedBatches,
                interestBatches,
                favoriteItems
            ] = await Promise.all([
                homePromise,
                relatedPromise,
                interestPromise,
                favoritesPromise
            ]);

            if (refreshId !== state.feedRefreshSequence) return;

            const orderedHomeItems = forceRefresh && previousVideoIds.size > 0
                ? [
                    ...homeResult.items.filter(
                        (item) => !previousVideoIds.has(item.videoId)
                    ),
                    ...homeResult.items.filter(
                        (item) => previousVideoIds.has(item.videoId)
                    )
                ]
                : homeResult.items;

            const candidates = [...new Map(
                [
                    ...orderedHomeItems,
                    ...relatedBatches.flat(),
                    ...interestBatches.flat(),
                    ...favoriteItems
                ].map((item) => [item.videoId, item] as const)
            ).values()];

            const homeDisplayLimit = japaneseMode
                ? JAPANESE_HOME_ITEMS_LIMIT
                : HOME_ITEMS_LIMIT;
            const candidateLimit = homeDisplayLimit
                + (japaneseMode ? 60 : 50);
            const items = await buildFinalFilteredFeedItems(
                filterPassiveDiscoveryLanguage(candidates),
                candidateLimit
            );

            if (refreshId !== state.feedRefreshSequence) return;

            let ranked = updateHomePersonalization(items);

            if (forceRefresh && previousVideoIds.size > 0) {
                const unseen = ranked.filter(
                    (item) => !previousVideoIds.has(item.videoId)
                );
                const repeated = ranked.filter(
                    (item) => previousVideoIds.has(item.videoId)
                );
                ranked = [...unseen, ...repeated];
            }

            if (forceRefresh && ranked.length > homeDisplayLimit) {
                const rotationPool = Math.min(
                    ranked.length,
                    Math.max(homeDisplayLimit + 8, 24)
                );
                const offset = rotationPool > 0
                    ? (homeRefreshRotation * 11) % rotationPool
                    : 0;
                if (offset > 0) {
                    ranked = [
                        ...ranked.slice(offset, rotationPool),
                        ...ranked.slice(0, offset),
                        ...ranked.slice(rotationPool)
                    ];
                }
            }

            state.feedState.items = ranked.slice(0, homeDisplayLimit);
            state.feedState.isLoading = false;

            if (state.feedState.items.length > 0) {
                state.feedState.status = "";
                state.feedState.warning =
                    state.appMode === "logged_in"
                    && Boolean(homeResult.failureReason)
                        ? "Using your local watch history because YouTube Home could not load."
                        : "";
            } else {
                state.feedState.warning = "";
                state.feedState.status = history.length > 0
                    ? "Could not build recommendations from your recent watch history. Try Home again."
                    : "Watch a few videos or choose a category to start shaping For You.";
            }

            renderFeed();
        } catch (error) {
            if (refreshId !== state.feedRefreshSequence) return;

            state.feedState.isLoading = false;
            state.feedState.warning = "";
            state.feedState.status =
                `Could not build For You recommendations: ${error instanceof Error ? error.message : String(error)}`;
            renderFeed();
        }
    };

    const queuedRefreshFeed = createRefreshQueue(refreshFeedOnce);
    const refreshFeed = (force = false): Promise<void> => {
        forceFeedRefreshRequested ||= force;
        return queuedRefreshFeed(force);
    };
    document.querySelector("[data-feed-filter]")?.addEventListener("input", renderFeed);

    return {
        refreshFeed,
        renderFeed,
        playFeedItem,
        resolveFeedItemPresentation,
        resolveSearchVideoPresentation,
        getVideoMetadataFromCache,
        buildFinalFilteredFeedItems,
        fetchLoggedInSubscriptionsFeed,
        fetchLoggedInSubscriptionChannels
    };
}