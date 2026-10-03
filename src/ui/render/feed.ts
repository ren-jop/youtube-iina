import type { FeedState, FeedVideoItem } from "../types";
import {
    renderPlayableVideoList,
    setElementVisibility,
    type VideoListItemPresentation
} from "./common";

export type FeedItemPresentation = VideoListItemPresentation;

export interface FeedRenderElements {
    list: HTMLUListElement | null;
    emptyState: HTMLElement | null;
    status: HTMLElement | null;
}

export interface FeedRenderDependencies {
    feedState: FeedState;
    elements: FeedRenderElements;
    defaultEmptyText: string;
    onUpdateLoadingIndicators: () => void;
    onPlayItem: (item: FeedVideoItem) => void;
    resolveItemPresentation: (item: FeedVideoItem) => FeedItemPresentation;
}

export function renderFeed(dependencies: FeedRenderDependencies): void {
    const {
        feedState,
        elements,
        defaultEmptyText,
        onUpdateLoadingIndicators,
        onPlayItem,
        resolveItemPresentation
    } = dependencies;

    const { list, emptyState, status } = elements;
    if (!list || !emptyState) {
        return;
    }


    renderPlayableVideoList({
        state: feedState,
        list,
        emptyState,
        status,
        defaultEmptyText,
        onUpdateLoadingIndicators,
        onPlayItem,
        resolveItemPresentation
    });
}