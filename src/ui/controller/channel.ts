import { loadChannelVideos, type ChannelIdentity } from "../innertube/channels";
import { fetchChannelFeedFromInnertube } from "../innertube/feedBrowse";
import { newestFirst } from "./subscriptionTools";
import {
    executeChannelSubscriptionCommand,
    fetchChannelSubscriptionState,
    type ChannelSubscriptionState
} from "../innertube/subscription";
import { renderPlayableVideoList, type VideoListItemPresentation } from "../render/common";
import { state } from "../state";
import type { FeedState, FeedVideoItem, InnertubeCommand, ViewName } from "../types";
import type { NavigationController } from "./navigation";

interface ChannelViewDependencies {
    getValidTvAccessToken: () => Promise<string>;
    refreshTvAccessToken: () => Promise<string>;
    refreshFeed: (force?: boolean) => Promise<void>;
    refreshSubscriptions: (force?: boolean) => Promise<void>;
}

function fallbackCommand(channelId: string, subscribe: boolean): InnertubeCommand {
    return {
        apiPath: subscribe ? "subscription/subscribe" : "subscription/unsubscribe",
        payload: { channelIds: [channelId] }
    };
}

export function initializeChannelView(
    navigation: NavigationController,
    play: (item: FeedVideoItem) => void,
    presentation: (item: FeedVideoItem) => VideoListItemPresentation,
    dependencies: ChannelViewDependencies
): void {
    const list = document.querySelector<HTMLUListElement>("[data-channel-list]");
    const status = document.querySelector<HTMLElement>("[data-channel-status]");
    const title = document.querySelector<HTMLElement>("[data-channel-title]");
    const emptyState = document.querySelector<HTMLElement>("[data-channel-empty]");
    const subscriptionButton = document.querySelector<HTMLButtonElement>("[data-channel-subscription]");
    const channelFilter = document.querySelector<HTMLInputElement>("[data-channel-filter]");
    const moreButton = document.querySelector<HTMLButtonElement>("[data-channel-more]");

    let sequence = 0;
    let channelPageBudget = 3;
    let channelExhausted = false;
    let returnView: ViewName = "feed";
    let currentChannelId = "";
    let subscriptionState: ChannelSubscriptionState | null = null;
    const channel: FeedState = {items: [], isLoading: false, warning: "", status: ""};

    const renderSubscription = () => {
        if (!subscriptionButton) return;
        const available = state.appMode === "logged_in" && Boolean(currentChannelId);
        subscriptionButton.hidden = !available;
        if (!available) return;

        if (!subscriptionState || subscriptionState.isSubscribed === null) {
            subscriptionButton.textContent = "Subscribe";
            subscriptionButton.disabled = false;
            return;
        }

        subscriptionButton.textContent = subscriptionState.isSubscribed
            ? "Unsubscribe"
            : "Subscribe";
        subscriptionButton.disabled = false;
    };

    const render = () => {
        const query = channelFilter?.value.trim().toLocaleLowerCase() || "";
        const visibleChannel = query
            ? {
                ...channel,
                items: channel.items.filter((item) =>
                    item.title.toLocaleLowerCase().includes(query)
                    || item.channelTitle.toLocaleLowerCase().includes(query)
                )
            }
            : channel;
        renderPlayableVideoList({
            state: visibleChannel,
            list,
            status,
            emptyState,
            defaultEmptyText: query
                ? "No loaded videos in this channel match your search."
                : "No videos available from this channel.",
            onUpdateLoadingIndicators: () => {},
            onPlayItem: play,
            resolveItemPresentation: presentation
        });
        renderSubscription();
        if (moreButton) {
            moreButton.hidden =
                !currentChannelId
                || channel.isLoading
                || channelExhausted;
            moreButton.disabled = channel.isLoading;
        }
    };

    const authDependencies = {
        isTvAuthAvailable: () => Boolean(state.tvAuthCache),
        getValidTvAccessToken: dependencies.getValidTvAccessToken,
        refreshTvAccessToken: dependencies.refreshTvAccessToken
    };

    const hydrateSubscription = async (request: number): Promise<void> => {
        if (!currentChannelId || state.appMode !== "logged_in") return;
        try {
            const resolved = await fetchChannelSubscriptionState(currentChannelId, authDependencies);
            if (request !== sequence) return;
            subscriptionState = resolved.isSubscribed === null && subscriptionState?.isSubscribed !== null
                ? { ...subscriptionState, ...resolved, isSubscribed: subscriptionState?.isSubscribed ?? null }
                : resolved;
        } catch {
            if (request !== sequence) return;
            subscriptionState = { isSubscribed: null };
        }
        renderSubscription();
    };

    subscriptionButton?.addEventListener("click", () => {
        if (!currentChannelId) return;
        const subscribed = subscriptionState?.isSubscribed === true;
        const subscribe = !subscribed;
        const command = subscribe
            ? subscriptionState?.subscribeCommand || fallbackCommand(currentChannelId, true)
            : subscriptionState?.unsubscribeCommand || fallbackCommand(currentChannelId, false);

        subscriptionButton.disabled = true;
        subscriptionButton.textContent = subscribe ? "Subscribing…" : "Unsubscribing…";

        void executeChannelSubscriptionCommand(command, authDependencies).then(async (result) => {
            subscriptionState = {
                ...subscriptionState,
                ...result,
                isSubscribed: result.isSubscribed ?? subscribe
            };
            renderSubscription();
            await Promise.all([
                dependencies.refreshFeed(),
                dependencies.refreshSubscriptions(true)
            ]);
        }).catch((error) => {
            channel.status = `Could not update subscription: ${error instanceof Error ? error.message : String(error)}`;
            render();
        });
    });

    moreButton?.addEventListener("click", () => {
        if (!currentChannelId || channel.isLoading || channelExhausted) return;

        const request = sequence;
        const channelId = currentChannelId;
        const previousCount = channel.items.length;
        channelPageBudget = Math.min(24, channelPageBudget + 3);
        const requestedLimit = Math.min(600, channelPageBudget * 25);

        channel.isLoading = true;
        channel.status = "Loading older uploads…";
        render();

        void fetchChannelFeedFromInnertube(
            channelId,
            requestedLimit,
            channelPageBudget
        ).then((result) => {
            if (request !== sequence || currentChannelId !== channelId) return;
            if (result.items.length > 0) {
                const channelTitle = title?.textContent || "Channel";
                channel.items = newestFirst(result.items.map((item) => ({
                    ...item,
                    channelId,
                    channelTitle:
                        !item.channelTitle || item.channelTitle === "Unknown channel"
                            ? channelTitle
                            : item.channelTitle
                })));
            }
            channelExhausted =
                result.items.length <= previousCount
                || channelPageBudget >= 24;
            channel.status = channelExhausted
                ? "All available uploads loaded."
                : "";
        }).catch((error) => {
            if (request !== sequence) return;
            channel.status = "Could not load older uploads: " + (error instanceof Error ? error.message : String(error));
        }).finally(() => {
            if (request !== sequence) return;
            channel.isLoading = false;
            render();
        });
    });

    document.querySelector("[data-channel-back]")?.addEventListener("click", () => navigation.setActiveView(returnView));

    document.addEventListener("youtube-open-channel", event => {
        const source = (event as CustomEvent<ChannelIdentity>).detail;
        if (!source) return;

        const request = ++sequence;
        if (navigation.getActiveView() !== "channel") returnView = navigation.getActiveView();
        if (title) title.textContent = source.title || "Channel";

        currentChannelId = "";
        channelPageBudget = 3;
        channelExhausted = false;
        subscriptionState = source.isSubscribed === true ? { isSubscribed: true } : null;
        if (channelFilter) channelFilter.value = "";
        channel.items = [];
        channel.isLoading = true;
        channel.status = "Loading channel…";
        list?.replaceChildren();
        navigation.setActiveView("channel");
        const content = document.querySelector(".yt-content");
        if (content) content.scrollTop = 0;
        render();

        void loadChannelVideos(source).then(result => {
            if (request !== sequence) return;
            currentChannelId = result.channelId;
            channel.items = result.items;
            channelExhausted = result.items.length === 0;
            channel.status = "";
            if (title) title.textContent = result.title;
            if (
                source.isSubscribed === true
                || state.subscriptionChannels.some((entry) => entry.channelId === result.channelId)
                || state.subscriptionsState.items.some((item) => item.channelId === result.channelId)
            ) {
                subscriptionState = { isSubscribed: true };
            }
            render();
            void hydrateSubscription(request);
        }).catch(error => {
            if (request === sequence) {
                channel.status = error instanceof Error ? error.message : "Could not load channel.";
            }
        }).finally(() => {
            if (request !== sequence) return;
            channel.isLoading = false;
            render();
        });
    });

    channelFilter?.addEventListener("input", render);
    document.addEventListener("youtube-options-changed", render);
}