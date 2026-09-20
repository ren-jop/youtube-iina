import { loadChannelVideos, type ChannelIdentity } from "../innertube/channels";
import { renderPlayableVideoList, type VideoListItemPresentation } from "../render/common";
import type { FeedState, FeedVideoItem, ViewName } from "../types";
import type { NavigationController } from "./navigation";

export function initializeChannelView(navigation: NavigationController, play: (item: FeedVideoItem) => void, presentation: (item: FeedVideoItem) => VideoListItemPresentation): void {
    const list = document.querySelector<HTMLUListElement>("[data-channel-list]");
    const status = document.querySelector<HTMLElement>("[data-channel-status]");
    const title = document.querySelector<HTMLElement>("[data-channel-title]");
    const emptyState = document.querySelector<HTMLElement>("[data-channel-empty]");
    let sequence = 0;
    let returnView: ViewName = "feed";
    const channel: FeedState = {items: [], isLoading: false, warning: "", status: ""};
    const render = () => renderPlayableVideoList({state: channel, list, status, emptyState, defaultEmptyText: "No videos available from this channel.", onUpdateLoadingIndicators: () => {}, onPlayItem: play, resolveItemPresentation: presentation});
    document.querySelector("[data-channel-back]")?.addEventListener("click", () => navigation.setActiveView(returnView));
    document.addEventListener("youtube-open-channel", event => {
        const source = (event as CustomEvent<ChannelIdentity>).detail;
        if (!source) return;
        const request = ++sequence;
        if (navigation.getActiveView() !== "channel") returnView = navigation.getActiveView();
        if (title) title.textContent = source.title || "Channel";
        channel.items = []; channel.isLoading = true; channel.status = "Loading channel…";
        list?.replaceChildren();
        navigation.setActiveView("channel");
        const content = document.querySelector(".yt-content"); if (content) content.scrollTop = 0;
        render();
        void loadChannelVideos(source).then(result => {
            if (request !== sequence) return;
            channel.items = result.items; channel.status = "";
            if (title) title.textContent = result.title;
        }).catch(error => {
            if (request === sequence) channel.status = error instanceof Error ? error.message : "Could not load channel.";
        }).finally(() => {
            if (request !== sequence) return;
            channel.isLoading = false; render();
        });
    });
    document.addEventListener("youtube-options-changed", render);
}
