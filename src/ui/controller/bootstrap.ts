import { initializeLibrary } from "./library";
import { recordPlayedVideo } from "../storage/libraryData";
import { recordDiagnostic } from "../bridge/diagnostics";
import { initializeDiagnostics } from "../bridge/diagnostics";
import { ensureHttpBridgeListener, setHttpBridgeApi } from "../bridge/httpBridge";
import { UI_SETTINGS_SCHEMA_VERSION } from "../constants";
import { favoritesEmptyState, favoritesList } from "../dom";
import { renderFavorites as renderFavoritesView } from "../render/favorites";
import { setUiSettings, state } from "../state";
import { createAuthController, type AuthController } from "./auth";
import { createEventsController } from "./events";
import { createFeedController } from "./feed";
import { createHookController } from "./hooks";
import { createNavigationController } from "./navigation";
import { createRelatedController } from "./related";
import { createSearchController, type SearchController } from "./search";
import { createSubscriptionsController } from "./subscriptions";

export function initializeSidebar(): void {
    initializeDiagnostics();
    state.iinaApi?.onMessage("playbackSwitchStatus", payload => {
        recordDiagnostic(`Playback ${payload.stage}${Number.isFinite(payload.elapsedMs) ? ` in ${payload.elapsedMs}ms` : ""}`);
        if (payload.stage === "failed") {
            const status = document.querySelector<HTMLElement>("[data-library-status]");
            if (status) status.textContent = "IINA could not switch videos. Try the selection again.";
        }
    });
    setHttpBridgeApi(state.iinaApi);

    const navigationController = createNavigationController();

    let authController: AuthController | null = null;

    const feedController = createFeedController({
        updateActiveViewLoadingIndicators: navigationController.updateActiveViewLoadingIndicators,
        getValidTvAccessToken: () => {
            if (!authController) {
                return Promise.reject(new Error("Auth controller unavailable."));
            }
            return authController.getValidTvAccessToken();
        },
        refreshTvAccessToken: () => {
            if (!authController) {
                return Promise.reject(new Error("Auth controller unavailable."));
            }
            return authController.refreshTvAccessToken();
        }
    });

    const subscriptionsController = createSubscriptionsController({
        updateActiveViewLoadingIndicators: navigationController.updateActiveViewLoadingIndicators,
        playFeedItem: feedController.playFeedItem,
        resolveFeedItemPresentation: feedController.resolveFeedItemPresentation,
        fetchLoggedInSubscriptionsFeed: feedController.fetchLoggedInSubscriptionsFeed,
        buildFinalFilteredFeedItems: feedController.buildFinalFilteredFeedItems
    });

    let searchController: SearchController | null = null;

    const renderFavorites = (): void => {
        renderFavoritesView({
            favorites: state.favorites,
            elements: {
                list: favoritesList,
                emptyState: favoritesEmptyState
            },
            onToggleFavorite: (channelId: string) => {
                searchController?.removeFavorite(channelId);
            },
            onOpenChannel: (favorite) => {
                searchController?.openFavoriteInExternalBrowser(favorite);
            }
        });
    };

    searchController = createSearchController({
        updateActiveViewLoadingIndicators: navigationController.updateActiveViewLoadingIndicators,
        refreshFeed: feedController.refreshFeed,
        refreshSubscriptions: subscriptionsController.refreshSubscriptions,
        getValidTvAccessToken: () => {
            if (!authController) {
                return Promise.reject(new Error("Auth controller unavailable."));
            }
            return authController.getValidTvAccessToken();
        },
        refreshTvAccessToken: () => {
            if (!authController) {
                return Promise.reject(new Error("Auth controller unavailable."));
            }
            return authController.refreshTvAccessToken();
        },
        renderFavorites,
        setActiveView: navigationController.setActiveView,
        buildFinalFilteredFeedItems: feedController.buildFinalFilteredFeedItems,
        getVideoMetadataFromCache: feedController.getVideoMetadataFromCache,
        resolveSearchVideoPresentation: feedController.resolveSearchVideoPresentation
    });

    authController = createAuthController({
        renderFeed: feedController.renderFeed,
        renderSubscriptions: subscriptionsController.renderSubscriptions,
        refreshFeed: feedController.refreshFeed,
        refreshSubscriptions: subscriptionsController.refreshSubscriptions,
        getActiveView: navigationController.getActiveView,
        setActiveView: navigationController.setActiveView
    });

    const relatedController = createRelatedController({
        updateActiveViewLoadingIndicators: navigationController.updateActiveViewLoadingIndicators,
        playFeedItem: feedController.playFeedItem,
        resolveFeedItemPresentation: feedController.resolveFeedItemPresentation,
        buildFinalFilteredFeedItems: feedController.buildFinalFilteredFeedItems,
        renderModeTabs: authController.renderModeTabs
    });

    const eventsController = createEventsController({
        setActiveView: (view) => {
            navigationController.setActiveView(view);
            if (view === "related") void relatedController.refreshRelated();
        },
        performSearch: searchController.performSearch,
        startTvLoginFlow: authController.startTvLoginFlow,
        logoutTvAuth: authController.logoutTvAuth,
        goHomeAndRefresh: searchController.goHomeAndRefresh
    });

    const hookController = createHookController({
        iinaApi: state.iinaApi,
        onPlaybackLifecycleEvent: payload => {
            relatedController.handlePlaybackLifecycleEvent(payload);
            if (payload.event === "file-loaded" && payload.videoId) {
                const item = [...state.feedState.items, ...state.searchState.videos, ...state.relatedState.items, ...state.subscriptionsState.items].find(item => item.videoId === payload.videoId);
                try { recordPlayedVideo({ videoId: payload.videoId, title: item?.title || "", channelTitle: item?.channelTitle || "" }); }
                catch { recordDiagnostic("Could not save local viewing history"); }
            }
        },
        onSettingsSync: (payload) => {
            const flags = payload.featureFlags;
            const currentFlags = state.uiSettings.featureFlags;
            const nextSettings = {
                schemaVersion: Number.isFinite(payload.schemaVersion) ? payload.schemaVersion : UI_SETTINGS_SCHEMA_VERSION,
                featureFlags: {
                    enableSponsorBlock: flags?.enableSponsorBlock === true,
                    enableWatchStatusSyncSignedIn: flags?.enableWatchStatusSyncSignedIn !== false,
                    enableWatchStatusLocalAnonymous: flags?.enableWatchStatusLocalAnonymous !== false,
                    includeLivestreams: flags?.includeLivestreams === true
                }
            };

            const didChange = JSON.stringify(currentFlags) !== JSON.stringify(nextSettings.featureFlags);
            if (!setUiSettings(nextSettings)) {
                return;
            }

            if (!didChange) {
                return;
            }

            void feedController.refreshFeed();
            void subscriptionsController.refreshSubscriptions();
        }
    });

    initializeLibrary(() => {
        renderFavorites();
        searchController?.renderSearchResults();
        void feedController.refreshFeed();
    });
    eventsController.bindTabEvents();
    eventsController.bindSearchEvents();
    ensureHttpBridgeListener();
    hookController.bind();
    hookController.requestSettingsSync();

    authController.renderAuthUi();
    authController.renderModeTabs();
    renderFavorites();
    feedController.renderFeed();
    subscriptionsController.renderSubscriptions();
    relatedController.renderRelated();
    searchController.renderSearchResults();
    searchController.setSearchStatus(state.searchState.status);

    navigationController.setActiveView(navigationController.getActiveView());
    void authController.initializeAuthState();
}
