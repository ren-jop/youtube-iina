import type {
    HttpRequestPayload,
    OpenExternalUrlPayload,
    PlayItemPayload,
    ReportWatchStatusRequestPayload,
    RequestSettingsSyncPayload
} from "../shared/messages";

import { normalizeHttpResponse } from "./httpResponse";
import { MESSAGE_NAMES } from "../shared/messages";
import { installPlaybackHookScaffolding } from "./hooks";
import { handlePlayItem } from "./playback";
import { createSponsorBlockController } from "./sponsorblock";

const { console, event, sidebar, global, http, utils, mpv, overlay, preferences } = iina as any;

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

let windowReady = false;
let windowClosed = false;
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
    global.postMessage("sidebarShown", {});
}

function showSidebarWithDelay(): void {
    if (showTimer !== null) clearTimeout(showTimer);
    showTimer = setTimeout(() => {
        showTimer = null;
        showSidebarWithNotification();
    }, SHOW_SIDEBAR_DELAY_MS);
}

function hideSidebar(): void {
    sidebar.hide();
    sidebarVisible = false;
}

function toggleSidebarFromHotkey(): void {
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

global.onMessage("showYouTubeSidebar", () => {
    console.log("YouTube: Received showYouTubeSidebar message");
    toggleSidebarFromHotkey();
});

event.on("iina.window-loaded", () => {
    if (windowReady) return;
    console.log("YouTube: Window loaded");

    sidebar.loadFile("ui/sidebar.html");

    sponsorBlockController = createSponsorBlockController({
        console,
        mpv,
        http,
        overlay,
        preferences
    });
    sponsorBlockController.start();

    installPlaybackHookScaffolding({
        event,
        mpv,
        sidebar
    });

    event.on("mpv.file-loaded", () => {
        const path = String(mpv.getString("path") || "");
        if (!isSplashPath(path)) {
            return;
        }

        console.log("YouTube: Splash loaded, showing sidebar");
        showSidebarWithNotification();
    });

    event.on("iina.window-will-close", () => {
        windowClosed = true;
        if (showTimer !== null) clearTimeout(showTimer);
        sponsorBlockController?.stop();
        global.postMessage("playerClosed", {});
    });

    sidebar.onMessage(MESSAGE_NAMES.PlayItem, (data: PlayItemPayload) => {
        console.log("YouTube: Received playItem");

        if (!data) {
            return;
        }

        const played = handlePlayItem(data);
        if (!played) {
            return;
        }

        hideSidebar();
    });

    sidebar.onMessage(MESSAGE_NAMES.OpenExternalUrl, (data: OpenExternalUrlPayload) => {
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
            sidebar.postMessage(MESSAGE_NAMES.HttpResponse, normalizeHttpResponse(requestId, result));
        }
    });

    sidebar.onMessage(MESSAGE_NAMES.ReportWatchStatusRequest, (data: ReportWatchStatusRequestPayload) => {
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
        const requestId = String(data?.requestId || `settings-${Date.now()}`);
        postSettingsSyncResponse(requestId);
    });

    windowReady = true;
    global.postMessage("playerReady", {});

    if (pendingShowSidebar) {
        console.log("YouTube: Showing sidebar (pending request)");
        showSidebarWithDelay();
        pendingShowSidebar = false;
    }

    console.log("YouTube: Ready");
});
