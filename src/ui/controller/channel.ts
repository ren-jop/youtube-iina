import { loadChannelVideos, type ChannelIdentity } from "../innertube/channels";
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

    let sequence = 0;
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
            subscriptionButton.textContent = "Checking…";
            subscriptionButton.disabled = true;
            return;
        }

        subscriptionButton.textContent = subscriptionState.isSubscribed
            ? "Unsubscribe"
            : "Subscribe";
        subscriptionButton.disabled = false;
    };

    const render = () => {
        renderPlayableVideoList({
            state: channel,
            list,
            status,
            emptyState,
            defaultEmptyText: "No videos available from this channel.",
            onUpdateLoadingIndicators: () => {},
            onPlayItem: play,
            resolveItemPresentation: presentation
        });
        renderSubscription();
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
        if (!currentChannelId || !subscriptionState || subscriptionState.isSubscribed === null) return;
        const subscribed = subscriptionState.isSubscribed;
        const subscribe = !subscribed;
        const command = subscribe
            ? subscriptionState.subscribeCommand || fallbackCommand(currentChannelId, true)
            : subscriptionState.unsubscribeCommand || fallbackCommand(currentChannelId, false);

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

    document.querySelector("[data-channel-back]")?.addEventListener("click", () => navigation.setActiveView(returnView));

    document.addEventListener("youtube-open-channel", event => {
        const source = (event as CustomEvent<ChannelIdentity>).detail;
        if (!source) return;

        const request = ++sequence;
        if (navigation.getActiveView() !== "channel") returnView = navigation.getActiveView();
        if (title) title.textContent = source.title || "Channel";

        currentChannelId = "";
        subscriptionState = null;
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
            channel.status = "";
            if (title) title.textContent = result.title;
            if (state.subscriptionsState.items.some((item) => item.channelId === result.channelId)) {
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

    document.addEventListener("youtube-options-changed", render);
}
