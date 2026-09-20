import { filterReason } from "../storage/feedFilters";
import { reconcileList } from "./reconcile";
import type { SearchChannelResult, SearchState, SearchVideoResult, VideoMetadata } from "../types";
import {
    createChannelMetaLine,
    createFavoriteToggleButton,
    createPlayableVideoListItem,
    createThumbnailElement,
    setElementVisibility
} from "./common";

export interface SearchVideoPresentation {
    thumbnailUrl: string;
    durationLabel: string;
    channelLine: string;
    statsLine: string;
}

export interface SearchRenderElements {
    channelsList: HTMLUListElement | null;
    videosList: HTMLUListElement | null;
    channelsEmptyState: HTMLElement | null;
    videosEmptyState: HTMLElement | null;
}

export interface SearchRenderDependencies {
    searchState: SearchState;
    isLoggedIn: boolean;
    elements: SearchRenderElements;
    onUpdateLoadingIndicators: () => void;
    onOpenChannel: (channel: SearchChannelResult) => void;
    onToggleFavorite: (channel: SearchChannelResult) => void;
    isFavoriteChannel: (channelId: string) => boolean;
    onPlayVideo: (video: SearchVideoResult) => void;
    getVideoMetadataFromCache: (videoId: string) => VideoMetadata | null;
    resolveVideoPresentation: (video: SearchVideoResult, metadata: VideoMetadata | null) => SearchVideoPresentation;
}

export function renderSearchResults(dependencies: SearchRenderDependencies): void {
    const {
        searchState,
        isLoggedIn,
        elements,
        onUpdateLoadingIndicators,
        onOpenChannel,
        onToggleFavorite,
        isFavoriteChannel,
        onPlayVideo,
        getVideoMetadataFromCache,
        resolveVideoPresentation
    } = dependencies;

    const { channelsList, videosList, channelsEmptyState, videosEmptyState } = elements;
    if (!channelsList || !videosList || !channelsEmptyState || !videosEmptyState) {
        return;
    }

    onUpdateLoadingIndicators();

    channelsList.replaceChildren();


    if (searchState.channels.length === 0) {
        setElementVisibility(channelsEmptyState, Boolean(searchState.query) && !searchState.isLoading);
        setElementVisibility(channelsList, false);
    } else {
        setElementVisibility(channelsEmptyState, false);
        setElementVisibility(channelsList, true);

        searchState.channels.filter(channel => !filterReason({title:"",channelTitle:channel.title})).forEach((channel) => {
            const item = document.createElement("li");
            item.className = "yt-item yt-item-channel-row";

            item.append(createThumbnailElement(channel.thumbnailUrl, `${channel.title} thumbnail`));

            const content = document.createElement("div");
            content.className = "yt-item-content";

            const title = document.createElement("p");
            title.className = "yt-item-title yt-item-title-channel";
            title.textContent = channel.title;

            const meta = createChannelMetaLine({
                channelId: channel.channelId,
                channelHandle: channel.channelHandle,
                onOpenChannel: () => {
                    onOpenChannel(channel);
                }
            });

            content.append(title, meta);

            const actions = document.createElement("div");
            actions.className = "yt-item-actions";

            const alreadyFavorite = isFavoriteChannel(channel.channelId);
            const favoriteButton = createFavoriteToggleButton({
                isFavorite: alreadyFavorite,
                onToggle: () => {
                    onToggleFavorite(channel);
                },
                inactiveLabel: isLoggedIn ? "Subscribe" : "Favourite",
                activeLabel: isLoggedIn ? "Subscribed" : "Favourited"
            });

            actions.append(favoriteButton);
            item.append(content, actions);
            channelsList.append(item);
        });
    }

    const visibleVideos = searchState.videos.filter(video => !filterReason({...video,durationLabel:resolveVideoPresentation(video,getVideoMetadataFromCache(video.videoId)).durationLabel}));
    videosEmptyState.textContent = searchState.videos.length && !visibleVideos.length ? "All videos hidden by your filters. Adjust Settings & data to show more." : "No videos found.";
    if (visibleVideos.length === 0) {
        reconcileList(videosList, [], () => "", () => "", () => document.createElement("li"));
        setElementVisibility(videosEmptyState, Boolean(searchState.query) && !searchState.isLoading);
        setElementVisibility(videosList, false);
    } else {
        setElementVisibility(videosEmptyState, false);
        setElementVisibility(videosList, true);

        reconcileList(videosList, visibleVideos, video => video.videoId, video => JSON.stringify([video, getVideoMetadataFromCache(video.videoId)]), (video) => {
            const metadata = getVideoMetadataFromCache(video.videoId);
            const presentation = resolveVideoPresentation(video, metadata);

            const item = createPlayableVideoListItem({
                videoId: video.videoId,
                onChannelResolved: name => { video.channelTitle = name; },
                title: video.title,
                presentation,
                itemClassName: "yt-item-feed-layout",
                onPlay: () => {
                    onPlayVideo(video);
                }
            });
            return item;
        });
    }
}
