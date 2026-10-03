import { createRefreshQueue } from "../utils/refreshQueue";
import { newestFirst, filterSubscriptions } from "./subscriptionTools";
import { SUBSCRIPTIONS_EMPTY_TEXT, SUBSCRIPTIONS_ITEMS_LIMIT } from "../constants";
import { subscriptionsEmptyState, subscriptionsList, subscriptionsStatus } from "../dom";
import { describeFeedFetchFailure } from "../innertube/feedBrowse";
import { renderSubscriptions as renderSubscriptionsView } from "../render/subscriptions";
import { state } from "../state";
import type { FeedFetchResult, FeedVideoItem, SearchChannelResult } from "../types";

interface SubscriptionsControllerDependencies {
    updateActiveViewLoadingIndicators: () => void;
    playFeedItem: (item: FeedVideoItem) => void;
    resolveFeedItemPresentation: (item: FeedVideoItem) => {
        title: string;
        thumbnailUrl: string;
        durationLabel: string;
        channelLine: string;
        statsLine: string;
    };
    fetchLoggedInSubscriptionsFeed: () => Promise<FeedFetchResult>;
    fetchLoggedInSubscriptionChannels?: () => Promise<SearchChannelResult[]>;
    buildFinalFilteredFeedItems: (items: FeedVideoItem[], limit: number) => Promise<FeedVideoItem[]>;
    getValidTvAccessToken: () => Promise<string>;
    refreshTvAccessToken: () => Promise<string>;
}

export interface SubscriptionsController {
    renderSubscriptions: () => void;
    refreshSubscriptions: (force?: boolean) => Promise<void>;
}

export function createSubscriptionsController(dependencies: SubscriptionsControllerDependencies): SubscriptionsController {
    const channelsFromItems = (items: FeedVideoItem[]): SearchChannelResult[] => {
        const channels = new Map<string, SearchChannelResult>();
        for (const item of items) {
            const channelId = item.channelId?.trim();
            if (!channelId || channels.has(channelId)) continue;
            channels.set(channelId, {
                channelId,
                title: item.channelTitle || "Channel",
                thumbnailUrl: "",
                channelHandle: "",
                isSubscribed: true
            });
        }
        return [...channels.values()];
    };

    const mergeSubscriptionChannels = (
        primary: SearchChannelResult[],
        items: FeedVideoItem[],
        fallback: SearchChannelResult[] = []
    ): SearchChannelResult[] => {
        const merged = new Map<string, SearchChannelResult>();
        for (const channel of primary) {
            if (!channel.channelId) continue;
            merged.set(channel.channelId, { ...channel, isSubscribed: true });
        }
        for (const channel of channelsFromItems(items)) {
            if (!merged.has(channel.channelId)) merged.set(channel.channelId, channel);
        }
        if (primary.length === 0) {
            for (const channel of fallback) {
                if (!merged.has(channel.channelId)) merged.set(channel.channelId, channel);
            }
        }
        return [...merged.values()].sort((a, b) => a.title.localeCompare(b.title));
    };

    const renderSubscriptionChannels = (query: string): void => {
        const container = document.querySelector<HTMLElement>("[data-subscription-channels]");
        if (!container) return;

        if (state.appMode !== "logged_in") {
            container.replaceChildren();
            container.hidden = true;
            return;
        }

        const normalized = query.trim().toLocaleLowerCase();
        const channels = state.subscriptionChannels.filter((channel) =>
            !normalized
            || channel.title.toLocaleLowerCase().includes(normalized)
            || channel.channelHandle.toLocaleLowerCase().includes(normalized)
        );

        const buttons = channels.map((channel) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "yt-subscription-channel";
            button.title = channel.title;

            if (channel.thumbnailUrl) {
                const image = document.createElement("img");
                image.className = "yt-subscription-channel-avatar";
                image.src = channel.thumbnailUrl;
                image.alt = "";
                image.loading = "lazy";
                image.decoding = "async";
                button.append(image);
            } else {
                const fallback = document.createElement("span");
                fallback.className = "yt-subscription-channel-avatar yt-subscription-channel-fallback";
                fallback.textContent = channel.title.slice(0, 1).toUpperCase();
                button.append(fallback);
            }

            const label = document.createElement("span");
            label.className = "yt-subscription-channel-label";
            label.textContent = channel.title;
            button.append(label);
            button.addEventListener("click", () => {
                document.dispatchEvent(new CustomEvent("youtube-open-channel", {
                    detail: { ...channel, isSubscribed: true }
                }));
            });
            return button;
        });

        container.replaceChildren(...buttons);
        container.hidden = buttons.length === 0;
    };

    const renderSubscriptions = (): void => {
        const query = document.querySelector<HTMLInputElement>("[data-subscriptions-filter]")?.value || "";
        const visibleItems = filterSubscriptions(state.subscriptionsState.items, query);
        renderSubscriptionChannels(query);

        renderSubscriptionsView({
            appMode: state.appMode,
            subscriptionsState: {
                ...state.subscriptionsState,
                items: visibleItems
            },
            elements: {
                list: subscriptionsList,
                emptyState: subscriptionsEmptyState,
                status: subscriptionsStatus
            },
            subscriptionsEmptyText: query.trim()
                ? "No loaded subscription videos match your search."
                : SUBSCRIPTIONS_EMPTY_TEXT,
            signInEmptyText: "Sign in to load subscriptions.",
            onUpdateLoadingIndicators: dependencies.updateActiveViewLoadingIndicators,
            onPlayItem: dependencies.playFeedItem,
            resolveItemPresentation: dependencies.resolveFeedItemPresentation
        });
    };

    const refreshSubscriptionsOnce = async (): Promise<void> => {
        if (state.subscriptionsState.isLoading) return;
        const refreshId = ++state.subscriptionsRefreshSequence;

        if (state.appMode !== "logged_in") {
            state.subscriptionsState.isLoading = false;
            state.subscriptionsState.items = [];
            state.subscriptionChannels = [];
            state.subscriptionsState.status = "Sign in to load subscriptions.";
            state.subscriptionsState.warning = "";
            renderSubscriptions();
            return;
        }

        state.subscriptionsState.isLoading = true;
        state.subscriptionsState.warning = "";
        state.subscriptionsState.status = "";
        renderSubscriptions();

        try {
            const channelResultsPromise = dependencies.fetchLoggedInSubscriptionChannels
                ? dependencies.fetchLoggedInSubscriptionChannels().catch(() => [])
                : Promise.resolve<SearchChannelResult[]>([]);
            const subscriptionsResult = await dependencies.fetchLoggedInSubscriptionsFeed();
            const items = await dependencies.buildFinalFilteredFeedItems(
                newestFirst(subscriptionsResult.items),
                SUBSCRIPTIONS_ITEMS_LIMIT
            );
            if (refreshId !== state.subscriptionsRefreshSequence) {
                return;
            }

            state.subscriptionsState.isLoading = false;
            if (!subscriptionsResult.failureReason || items.length > 0) {
                state.subscriptionsState.items = items;
            }
            if (state.subscriptionChannels.length === 0) {
                state.subscriptionChannels = mergeSubscriptionChannels([], items);
            }
            if (subscriptionsResult.failureReason) {
                const statusCodeSuffix = Number.isFinite(subscriptionsResult.statusCode)
                    ? ` (HTTP ${subscriptionsResult.statusCode})`
                    : "";
                state.subscriptionsState.status = `Could not load subscriptions: ${describeFeedFetchFailure(subscriptionsResult.failureReason, "Request failed.")}${statusCodeSuffix}`;
            } else if (subscriptionsResult.items.length > 0 && items.length === 0) {
                state.subscriptionsState.status = "No playable subscription videos available.";
            } else {
                state.subscriptionsState.status = items.length > 0 ? "" : SUBSCRIPTIONS_EMPTY_TEXT;
            }
            state.subscriptionsState.warning = "";
            renderSubscriptions();

            void channelResultsPromise.then((channelResults) => {
                if (refreshId !== state.subscriptionsRefreshSequence) return;
                state.subscriptionChannels = mergeSubscriptionChannels(
                    channelResults,
                    state.subscriptionsState.items,
                    state.subscriptionChannels
                );
                renderSubscriptionChannels(
                    document.querySelector<HTMLInputElement>("[data-subscriptions-filter]")?.value || ""
                );
            });
        } catch (error) {
            if (refreshId !== state.subscriptionsRefreshSequence) {
                return;
            }

            state.subscriptionsState.isLoading = false;
            state.subscriptionsState.warning = "";
            state.subscriptionsState.status = `Could not load subscriptions: ${error instanceof Error ? error.message : String(error)}`;
            renderSubscriptions();
        }
    };

    const refreshSubscriptions = createRefreshQueue(refreshSubscriptionsOnce);
    document.querySelector("[data-subscriptions-filter]")?.addEventListener("input", renderSubscriptions);

    return {
        renderSubscriptions,
        refreshSubscriptions
    };
}