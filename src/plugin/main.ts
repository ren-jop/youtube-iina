import { installDataTransfer } from "./dataTransfer";
import type {
    HttpRequestPayload,
    OpenExternalUrlPayload,
    PlayItemPayload,
    ReportWatchStatusRequestPayload,
    RequestSettingsSyncPayload
} from "../shared/messages";

import { encodeHttpResponse, requestLabel } from "../shared/httpTransport";
import { normalizeHttpResponse } from "./httpResponse";
import { MESSAGE_NAMES } from "../shared/messages";
import { installPlaybackHookScaffolding } from "./hooks";
import { handlePlayItem } from "./playback";
import { createSponsorBlockController } from "./sponsorblock";

const { console, event, sidebar, global, http, utils, core, overlay, preferences } = iina as any;

const SHOW_SIDEBAR_DELAY_MS = 300;
const YOUTUBE_SPLASH_FILENAME = "YouTube.png";
const UI_SETTINGS_SCHEMA_VERSION = 1;

const DEFAULT_PLUGIN_FEATURE_FLAGS = {
    enableSponsorBlock: false,
    enableWatchStatusSyncSignedIn: true,
    enableWatchStatusLocalAnonymous: true,
    includeLivestreams: false
} as const;

function isSplashPath(pathValue: string): boolean {
    return pathValue.includes(YOUTUBE_SPLASH_FILENAME);
}

function postSettingsSyncResponse(requestId: string): void {
    sidebar.postMessage(MESSAGE_NAMES.SettingsSync, {
        requestId,
        schemaVersion: UI_SETTINGS_SCHEMA_VERSION,
        featureFlags: DEFAULT_PLUGIN_FEATURE_FLAGS
    });
}

console.log("YouTube: Plugin loaded");

let managedPlayerId: number | null = null;
let windowReady = false;
let windowClosed = false;
let playTimer: ReturnType<typeof setTimeout> | null = null;
let switchStartedAt = 0;
let switchVideoId = "";
installDataTransfer(() => windowClosed);
let showTimer: ReturnType<typeof setTimeout> | null = null;
let pendingShowSidebar = false;
let sidebarVisible = false;
let sponsorBlockController: ReturnType<typeof createSponsorBlockController> | null = null;

function getSidebarVisibility(): boolean {
    const sidebarWithVisibility = sidebar as typeof sidebar & { isVisible?: () => boolean };
    if (typeof sidebarWithVisibility.isVisible === "function") {
        return sidebarWithVisibility.isVisible();
    }

    return sidebarVisible;
}

function showSidebarWithNotification(): void {
    if (windowClosed) return;
    sidebar.show();
    sidebarVisible = true;
    sidebar.postMessage("discussionVisibility", true);

}

function showSidebarWithDelay(): void {
    if (showTimer !== null) clearTimeout(showTimer);
    showTimer = setTimeout(() => {
        showTimer = null;
        showSidebarWithNotification();
    }, SHOW_SIDEBAR_DELAY_MS);
}

function hideSidebar(): void {
    if (windowClosed) return;
    sidebar.hide();
    sidebarVisible = false;
    sidebar.postMessage("discussionVisibility", false);
}

function toggleSidebarFromHotkey(): void {
    if (windowClosed) return;
    if (!windowReady) {
        pendingShowSidebar = true;
        return;
    }

    if (getSidebarVisibility()) {
        console.log("YouTube: Sidebar already open, hiding it");
        hideSidebar();
        return;
    }

    showSidebarWithDelay();
}

global.onMessage("showYouTubeSidebar", (data: { playerId?: number }) => {
    const firstRequest = managedPlayerId === null;
    if (typeof data?.playerId === "number") managedPlayerId = data.playerId;
    if (firstRequest) {
        if (windowReady) showSidebarWithDelay();
        else pendingShowSidebar = true;
        return;
    }
    console.log("YouTube: Received showYouTubeSidebar message");
    toggleSidebarFromHotkey();
});

event.on("iina.window-loaded", () => {
    if (windowReady) return;
    console.log("YouTube: Window loaded");

    sidebar.loadFile("ui/sidebar.html");

    sponsorBlockController = createSponsorBlockController({
        console,
        core,
        http,
        overlay,
        preferences
    });

    installPlaybackHookScaffolding({
        event,
        core,
        sidebar
    });

    event.on("iina.file-loaded", () => {
        windowClosed = false;
        const path = String(core.status.url || "");
        if (switchStartedAt && path.includes(switchVideoId)) {
            sidebar.postMessage("playbackSwitchStatus", { stage: "loaded", elapsedMs: Date.now() - switchStartedAt });
            switchStartedAt = 0;
        }
        if (isSplashPath(path)) sponsorBlockController?.stop();
        else sponsorBlockController?.start();
        if (!isSplashPath(path)) {
            return;
        }

        console.log("YouTube: Splash loaded, showing sidebar");
        showSidebarWithNotification();
    });

    event.on("mpv.end-file", () => {
        sponsorBlockController?.stop();
    });

    event.on("iina.window-will-close", () => {
        sidebar.postMessage("discussionVisibility", false);
        windowClosed = true;
        if (playTimer !== null) clearTimeout(playTimer);
        playTimer = null;
        switchStartedAt = 0;
        if (showTimer !== null) clearTimeout(showTimer);
        sponsorBlockController?.stop();
        if (managedPlayerId !== null) global.postMessage("playerClosed", { playerId: managedPlayerId });
    });

    sidebar.onMessage("togglePlayback", () => {
        if (!windowClosed) iina.mpv.command("cycle", ["pause"]);
    });

    sidebar.onMessage(MESSAGE_NAMES.PlayItem, (data: PlayItemPayload) => {
        console.log("YouTube: Received playItem");

        if (windowClosed || !data) {
            return;
        }

        if (!/^[A-Za-z0-9_-]{11}$/.test(data.videoId || "")) return;
        if (playTimer !== null) clearTimeout(playTimer);
        // Coalesce double clicks and rapid selections: only the latest starts.
        playTimer = setTimeout(() => {
            playTimer = null;
            if (windowClosed) return;
            switchStartedAt = Date.now();
            switchVideoId = data.videoId;
            try {
                sponsorBlockController?.stop();
                if (!handlePlayItem(data)) throw new Error("Player rejected selection");
                sidebar.postMessage("playbackSwitchStatus", { stage: "loading" });
            } catch {
                switchStartedAt = 0;
                sidebar.postMessage("playbackSwitchStatus", { stage: "failed" });
            }
        }, 180);

        // Leave the sidebar and its current list visible during playback.
    });

    sidebar.onMessage(MESSAGE_NAMES.OpenExternalUrl, (data: OpenExternalUrlPayload) => {
        if (windowClosed) return;
        const url = String(data?.url || "").trim();
        if (!url) {
            return;
        }

        const opened = utils.open(url);
        if (!opened) {
            console.error(`YouTube: Failed to open external URL: ${url}`);
        }
    });

    sidebar.onMessage(MESSAGE_NAMES.HttpRequest, async (data: HttpRequestPayload) => {
        if (windowClosed || !data || !data.id || !data.url) {
            return;
        }

        const requestId = String(data.id);
        const url = String(data.url);
        const method = (data.method || "GET").toUpperCase();

        const label = requestLabel(url);
        const startedAt = Date.now();
        sidebar.postMessage(MESSAGE_NAMES.HttpProgress, { id: encodeURIComponent(requestId), stage: "received" });
        console.log(`YouTube: ${label} started`);
        const options = {
            headers: data.headers ?? {},
            params: {},
            data: data.body ?? ""
        };

        let result;
        try {
            result = method === "POST"
                ? await http.post(url, options)
                : await http.get(url, options);
        } catch (error) {
            result = error;
        }
        // A request may finish after the player window has been destroyed.
        if (!windowClosed) {
            const response = normalizeHttpResponse(requestId, result);
            console.log(`YouTube: ${label} HTTP ${response.statusCode} in ${Date.now() - startedAt}ms`);
            sidebar.postMessage(MESSAGE_NAMES.HttpProgress, {
                id: encodeURIComponent(requestId), stage: "completed", statusCode: response.statusCode
            });
            sidebar.postMessage(MESSAGE_NAMES.HttpResponse, encodeHttpResponse(response));
        }
    });

    sidebar.onMessage(MESSAGE_NAMES.ReportWatchStatusRequest, (data: ReportWatchStatusRequestPayload) => {
        if (windowClosed) return;
        const requestId = String(data?.requestId || `watch-${Date.now()}`);
        if (!data?.videoId) {
            sidebar.postMessage(MESSAGE_NAMES.ReportWatchStatusResponse, {
                requestId,
                accepted: false,
                deferred: true,
                error: "Missing videoId"
            });
            return;
        }

        sidebar.postMessage(MESSAGE_NAMES.ReportWatchStatusResponse, {
            requestId,
            accepted: false,
            deferred: true
        });
    });

    sidebar.onMessage(MESSAGE_NAMES.RequestSettingsSync, (data: RequestSettingsSyncPayload) => {
        if (windowClosed) return;
        const requestId = String(data?.requestId || `settings-${Date.now()}`);
        postSettingsSyncResponse(requestId);
    });

    windowReady = true;


    if (pendingShowSidebar) {
        console.log("YouTube: Showing sidebar (pending request)");
        showSidebarWithDelay();
        pendingShowSidebar = false;
    }

    console.log("YouTube: Ready");
});
