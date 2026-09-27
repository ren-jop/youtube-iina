import { createRefreshQueue } from "../utils/refreshQueue";
import { newestFirst, filterSubscriptions } from "./subscriptionTools";
import { SUBSCRIPTIONS_EMPTY_TEXT, SUBSCRIPTIONS_ITEMS_LIMIT } from "../constants";
import { subscriptionsEmptyState, subscriptionsList, subscriptionsStatus } from "../dom";
import { describeFeedFetchFailure } from "../innertube/feedBrowse";
import { isJapaneseTitle } from "../innertube/japanese";
import { fetchChannelSubscriptionState } from "../innertube/subscription";
import { mapWithConcurrency } from "../utils/async";
import { renderSubscriptions as renderSubscriptionsView } from "../render/subscriptions";
import { state } from "../state";
import { getOptions } from "../storage/libraryData";
import { getDiscoveryGuardSnapshot } from "../storage/discoveryGuard";
import type { FeedFetchResult, FeedVideoItem } from "../types";

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
    buildFinalFilteredFeedItems: (items: FeedVideoItem[], limit: number) => Promise<FeedVideoItem[]>;
    getValidTvAccessToken: () => Promise<string>;
    refreshTvAccessToken: () => Promise<string>;
}

export interface SubscriptionsController {
    renderSubscriptions: () => void;
    refreshSubscriptions: (force?: boolean) => Promise<void>;
}

export function createSubscriptionsController(dependencies: SubscriptionsControllerDependencies): SubscriptionsController {
    const subscriptionTruthCache = new Map<string, { subscribed: boolean; checkedAt: number }>();
    const guardElement = document.querySelector<HTMLElement>("[data-subscriptions-guard]");

    const passiveLanguageItems = (items: FeedVideoItem[]): FeedVideoItem[] => {
        return getOptions().japaneseMode
            ? items.filter((item) => isJapaneseTitle(item.title))
            : items;
    };

    const renderGuard = (): boolean => {
        if (!guardElement) return getDiscoveryGuardSnapshot().blocked;
        const snapshot = getDiscoveryGuardSnapshot();

        if (!snapshot.blocked) {
            guardElement.hidden = true;
            guardElement.replaceChildren();
            return false;
        }

        const line = document.createElement("p");
        line.className = "yt-empty";
        if (snapshot.focusMinutesRemaining > 0) {
            line.textContent =
                `Focus · about ${snapshot.focusMinutesRemaining} min left`
                + (snapshot.focusPurpose ? ` · ${snapshot.focusPurpose}` : "")
                + ". Home and Subscriptions are paused.";
            guardElement.replaceChildren(line);
            guardElement.hidden = false;
            return true;
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
        guardElement.replaceChildren(line, controls);
        guardElement.hidden = false;
        return true;
    };

    const filterConfirmedSubscriptions = async (items: FeedVideoItem[]): Promise<FeedVideoItem[]> => {
        const channelIds = [...new Set(
            items.map((item) => item.channelId?.trim() || "").filter(Boolean)
        )];
        if (!channelIds.length) return items;

        const truth = new Map<string, boolean>();
        await mapWithConcurrency(channelIds, 4, async (channelId) => {
            const cached = subscriptionTruthCache.get(channelId);
            if (cached && Date.now() - cached.checkedAt < 10 * 60 * 1000) {
                truth.set(channelId, cached.subscribed);
                return;
            }

            try {
                const result = await fetchChannelSubscriptionState(channelId, {
                    isTvAuthAvailable: () => Boolean(state.tvAuthCache),
                    getValidTvAccessToken: dependencies.getValidTvAccessToken,
                    refreshTvAccessToken: dependencies.refreshTvAccessToken
                });
                if (result.isSubscribed !== null) {
                    subscriptionTruthCache.set(channelId, {
                        subscribed: result.isSubscribed,
                        checkedAt: Date.now()
                    });
                    truth.set(channelId, result.isSubscribed);
                }
            } catch {
                // Unknown state keeps the item; only confirmed non-subscriptions are removed.
            }
        });

        return items.filter((item) => {
            const channelId = item.channelId?.trim();
            return !channelId || truth.get(channelId) !== false;
        });
    };

    const renderSubscriptions = (): void => {
        const query = document.querySelector<HTMLInputElement>("[data-subscriptions-filter]")?.value || "";
        const languageItems = passiveLanguageItems(state.subscriptionsState.items);
        const browsingBlocked = renderGuard();
        const visibleItems = browsingBlocked
            ? []
            : filterSubscriptions(languageItems, query);
        const japaneseOnlyEmpty =
            getOptions().japaneseMode
            && state.subscriptionsState.items.length > 0
            && languageItems.length === 0;

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
            subscriptionsEmptyText: browsingBlocked
                ? "Passive browsing is paused. Search directly for what you want to watch."
                : query.trim()
                    ? "No loaded subscription videos match your search."
                    : japaneseOnlyEmpty
                        ? "No Japanese subscription videos are in the loaded feed."
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
            const subscriptionsResult = await dependencies.fetchLoggedInSubscriptionsFeed();
            const languageCandidates = passiveLanguageItems(subscriptionsResult.items);
            const confirmedItems = await filterConfirmedSubscriptions(languageCandidates);
            const items = await dependencies.buildFinalFilteredFeedItems(newestFirst(confirmedItems), SUBSCRIPTIONS_ITEMS_LIMIT);
            if (refreshId !== state.subscriptionsRefreshSequence) {
                return;
            }

            state.subscriptionsState.isLoading = false;
            if (!subscriptionsResult.failureReason || items.length > 0) {
                state.subscriptionsState.items = items;
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
