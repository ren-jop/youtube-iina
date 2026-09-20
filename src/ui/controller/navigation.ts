import {
    feedLoadingIndicator,
    relatedLoadingIndicator,
    searchInput,
    searchLoadingIndicator,
    subscriptionsLoadingIndicator,
    tabs,
    views
} from "../dom";
import {
    updateActiveViewLoadingIndicators as updateActiveViewLoadingIndicatorsView
} from "../render/common";
import { state } from "../state";
import type { ViewName } from "../types";

export interface NavigationController {
    getActiveView: () => ViewName;
    setActiveView: (view: ViewName) => void;
    updateActiveViewLoadingIndicators: () => void;
}

export function createNavigationController(onViewChanged?: () => void): NavigationController {
    const scrollPositions = new Map<ViewName, number>();
    const getActiveView = (): ViewName => {
        return state.activeView;
    };

    const updateActiveViewLoadingIndicators = (): void => {
        updateActiveViewLoadingIndicatorsView(
            {
                activeView: getActiveView(),
                isFeedLoading: state.feedState.isLoading,
                isSubscriptionsLoading: state.subscriptionsState.isLoading,
                isRelatedLoading: state.relatedState.isLoading,
                isSearchLoading: state.searchState.isLoading
            },
            {
                feedLoadingIndicator,
                subscriptionsLoadingIndicator,
                relatedLoadingIndicator,
                searchLoadingIndicator
            }
        );
    };

    const setActiveView = (viewName: ViewName): void => {
        let normalizedViewName = viewName;
        if (viewName === "subscriptions" && state.appMode !== "logged_in") {
            normalizedViewName = "feed";
        }
        if (viewName === "favorites" && state.appMode === "logged_in") {
            normalizedViewName = "feed";
        }
        if (viewName === "related" && !state.currentPlaybackVideoId) {
            normalizedViewName = "feed";
        }

        const content = document.querySelector<HTMLElement>(".yt-content");
        const changed = state.activeView !== normalizedViewName;
        if (changed && content) scrollPositions.set(state.activeView, content.scrollTop);
        state.activeView = normalizedViewName;

        tabs.forEach((tab) => {
            const isActive = tab.dataset.view === normalizedViewName;
            tab.classList.toggle("is-active", isActive);
            tab.setAttribute("aria-pressed", String(isActive));
        });

        views.forEach((view) => {
            const isActive = view.dataset.view === normalizedViewName;
            view.classList.toggle("is-active", isActive);
        });

        if (changed && content) content.scrollTop = scrollPositions.get(normalizedViewName) || 0;

        if (normalizedViewName === "search" && searchInput) {
            searchInput.focus();
        }

        updateActiveViewLoadingIndicators();
        onViewChanged?.();
    };

    return {
        getActiveView,
        setActiveView,
        updateActiveViewLoadingIndicators
    };
}
