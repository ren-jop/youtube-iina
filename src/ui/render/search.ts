import { getDiscoveryGuardSnapshot } from "../storage/discoveryGuard";
import { getOptions } from "../storage/libraryData";
import {
    isJapaneseTitle,
    isLikelyJapaneseDiscoveryText
} from "../innertube/japanese";
import { filterReason } from "../storage/feedFilters";
import { reconcileList } from "./reconcile";
import type { SearchChannelResult, SearchPlaylistResult, SearchState, SearchVideoResult, VideoMetadata } from "../types";
import {
    createChannelMetaLine,
    createFavoriteToggleButton,
    createPlayableThumbnailWrapper,
    createPlayableVideoListItem,
    createThumbnailElement,
    makeCardPlayable,
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
    playlistsList: HTMLUListElement | null;
    videosList: HTMLUListElement | null;
    channelsEmptyState: HTMLElement | null;
    playlistsEmptyState: HTMLElement | null;
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
    onPlayPlaylist: (playlist: SearchPlaylistResult) => void;
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
        onPlayPlaylist,
        onPlayVideo,
        getVideoMetadataFromCache,
        resolveVideoPresentation
    } = dependencies;

    const { channelsList, playlistsList, videosList, channelsEmptyState, playlistsEmptyState, videosEmptyState } = elements;
    if (!channelsList || !playlistsList || !videosList || !channelsEmptyState || !playlistsEmptyState || !videosEmptyState) {
        return;
    }

    onUpdateLoadingIndicators();

    channelsList.replaceChildren();

    const options = getOptions();
    const guard = getDiscoveryGuardSnapshot();
    const strictJapanese = options.japaneseMode || guard.dailyDistractionConsumed;
    const visibleChannels = searchState.channels.filter(channel =>
        (!strictJapanese || isLikelyJapaneseDiscoveryText(channel.title, channel.title))
        && !filterReason({title:"",channelTitle:channel.title})
    );

    if (visibleChannels.length === 0) {
        setElementVisibility(channelsEmptyState, Boolean(searchState.query) && !searchState.isLoading);
        setElementVisibility(channelsList, false);
    } else {
        setElementVisibility(channelsEmptyState, false);
        setElementVisibility(channelsList, true);

        visibleChannels.forEach((channel) => {
            const item = document.createElement("li");
            item.className = "yt-item yt-item-channel-row";

            item.append(createThumbnailElement(channel.thumbnailUrl, `${channel.title} thumbnail`));

            const content = document.createElement("div");
            content.className = "yt-item-content";

            const title = document.createElement("button");
            title.type = "button";
            title.addEventListener("click", () => onOpenChannel(channel));
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
                activeLabel: isLoggedIn ? "Unsubscribe" : "Favourited"
            });

            actions.append(favoriteButton);
            item.append(content, actions);
            channelsList.append(item);
        });
    }

    playlistsList.replaceChildren();
    const visiblePlaylists = strictJapanese
        ? searchState.playlists.filter((playlist) =>
            isLikelyJapaneseDiscoveryText(playlist.title, playlist.channelTitle)
        )
        : searchState.playlists;
    if (visiblePlaylists.length === 0) {
        setElementVisibility(playlistsEmptyState, Boolean(searchState.query) && !searchState.isLoading);
        setElementVisibility(playlistsList, false);
    } else {
        setElementVisibility(playlistsEmptyState, false);
        setElementVisibility(playlistsList, true);
        visiblePlaylists.forEach((playlist) => {
            const item = document.createElement("li");
            item.className = "yt-item yt-item-feed-layout";
            makeCardPlayable(item, () => onPlayPlaylist(playlist));
            item.append(createPlayableThumbnailWrapper(
                playlist.thumbnailUrl,
                playlist.title + " thumbnail"
            ));

            const content = document.createElement("div");
            content.className = "yt-item-content";
            const title = document.createElement("p");
            title.className = "yt-item-title";
            title.textContent = playlist.title;
            const meta = document.createElement("p");
            meta.className = "yt-item-meta";
            meta.textContent = [playlist.channelTitle, playlist.videoCountText]
                .filter(Boolean)
                .join(" · ") || "Playlist";
            content.append(title, meta);

            const actions = document.createElement("div");
            actions.className = "yt-item-actions";
            const play = document.createElement("button");
            play.type = "button";
            play.className = "yt-favorite-toggle";
            play.textContent = "Play all";
            play.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                onPlayPlaylist(playlist);
            });
            actions.append(play);
            item.append(content, actions);
            playlistsList.append(item);
        });
    }

    const languageVisibleVideos = searchState.videos.filter(video =>
        !strictJapanese || isJapaneseTitle(video.title)
    );
    const visibleVideos = languageVisibleVideos.filter(video =>
        !filterReason({...video,durationLabel:resolveVideoPresentation(video,getVideoMetadataFromCache(video.videoId)).durationLabel})
    );
    videosEmptyState.textContent =
        strictJapanese && searchState.videos.length > 0 && languageVisibleVideos.length === 0
            ? "No Japanese videos found for this search."
            : searchState.videos.length && !visibleVideos.length
                ? "All videos hidden by your filters. Adjust Settings & data to show more."
                : "No videos found.";
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
                channelId: video.channelId,
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