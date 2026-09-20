import { createPlaybackMonitor, type PlaybackStatus, type PlaybackSnapshot } from "./playbackMonitor";

const SPONSORBLOCK_API_BASE_URL = "https://sponsor.ajay.app";

const SPONSORBLOCK_ENABLED_PREF_KEY = "sponsorBlockEnabled";
const SPONSOR_SEGMENT_ACTION_PREF_KEY = "sponsorSegmentAction";
const SELF_PROMO_SEGMENT_ACTION_PREF_KEY = "selfPromoSegmentAction";
const PREVIEW_SEGMENT_ACTION_PREF_KEY = "previewSegmentAction";

const SEGMENT_CATEGORIES = ["sponsor", "selfpromo", "preview"] as const;

const DEFAULT_SPONSORBLOCK_ENABLED = false;
const DEFAULT_SEGMENT_ACTIONS: Record<SegmentCategory, SegmentAction> = {
    sponsor: "ignore",
    selfpromo: "ignore",
    preview: "ignore"
};

const SEGMENT_FETCH_RETRY_MS = 12_000;
const REWIND_OVERLAY_DURATION_MS = 8_000;
const SEGMENT_QUERY_PARAMS = SEGMENT_CATEGORIES
    .map((category) => `category=${encodeURIComponent(category)}`)
    .join("&");

type SegmentAction = "ignore" | "ask" | "skip";
type SegmentCategory = (typeof SEGMENT_CATEGORIES)[number];
type OverlayAction = "skip" | "rewind";

interface SponsorBlockSegment {
    uuid: string;
    startSeconds: number;
    endSeconds: number;
    category: SegmentCategory;
}

interface SponsorBlockApiSegment {
    segment?: unknown;
    UUID?: unknown;
    category?: unknown;
}

interface RewindOverlayOffer {
    segment: SponsorBlockSegment;
    expiresAt: number;
}

interface SponsorBlockControllerDependencies {
    console: {
        error: (...args: unknown[]) => void;
    };
    core: { status: PlaybackStatus; seekTo: (seconds: number) => void };
    http: {
        get: (url: string, options?: unknown) => Promise<{
            statusCode: number;
            reason?: string;
            text?: string;
        }>;
    };
    overlay: {
        simpleMode: () => void;
        setStyle: (style: string) => void;
        setContent: (content: string) => void;
        setClickable: (enabled: boolean) => void;
        show: () => void;
        hide: () => void;
        onMessage: (name: string, callback: () => void) => void;
    };
    preferences: {
        get: (key: string) => unknown;
    };
}

export interface SponsorBlockController {
    start: () => void;
    stop: () => void;
}

function toFiniteNumber(value: unknown): number | undefined {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return undefined;
    }

    return value;
}

function normalizeAction(value: unknown): SegmentAction {
    if (value === "ignore" || value === "skip") {
        return value;
    }

    return "ignore";
}

function isSegmentCategory(value: unknown): value is SegmentCategory {
    return value === "sponsor" || value === "selfpromo" || value === "preview";
}

function getSegmentActionPreferenceKey(category: SegmentCategory): string {
    if (category === "sponsor") {
        return SPONSOR_SEGMENT_ACTION_PREF_KEY;
    }

    if (category === "selfpromo") {
        return SELF_PROMO_SEGMENT_ACTION_PREF_KEY;
    }

    return PREVIEW_SEGMENT_ACTION_PREF_KEY;
}

function isSponsorBlockEnabled(preferences: SponsorBlockControllerDependencies["preferences"]): boolean {
    const rawValue = preferences.get(SPONSORBLOCK_ENABLED_PREF_KEY);
    if (rawValue === undefined || rawValue === null) {
        return DEFAULT_SPONSORBLOCK_ENABLED;
    }

    return rawValue === true;
}

function getSegmentAction(
    preferences: SponsorBlockControllerDependencies["preferences"],
    category: SegmentCategory
): SegmentAction {
    const rawValue = preferences.get(getSegmentActionPreferenceKey(category));
    if (rawValue === undefined || rawValue === null || String(rawValue).trim() === "") {
        return DEFAULT_SEGMENT_ACTIONS[category];
    }

    return normalizeAction(rawValue);
}

function getSegmentActions(preferences: SponsorBlockControllerDependencies["preferences"]): Record<SegmentCategory, SegmentAction> {
    return {
        sponsor: getSegmentAction(preferences, "sponsor"),
        selfpromo: getSegmentAction(preferences, "selfpromo"),
        preview: getSegmentAction(preferences, "preview")
    };
}

function hasManagedSegmentTypes(actions: Record<SegmentCategory, SegmentAction>): boolean {
    return SEGMENT_CATEGORIES.some((category) => actions[category] !== "ignore");
}

function getSegmentKey(segment: SponsorBlockSegment): string {
    if (segment.uuid) {
        return `${segment.category}:${segment.uuid}`;
    }

    return `${segment.category}:${segment.startSeconds.toFixed(3)}-${segment.endSeconds.toFixed(3)}`;
}

function isSegmentActive(segment: SponsorBlockSegment, positionSeconds: number): boolean {
    return positionSeconds >= segment.startSeconds && positionSeconds < segment.endSeconds;
}

function findActiveManagedSegment(
    segments: SponsorBlockSegment[],
    positionSeconds: number,
    actions: Record<SegmentCategory, SegmentAction>
): SponsorBlockSegment | undefined {
    return segments.find((segment) => {
        return actions[segment.category] !== "ignore" && isSegmentActive(segment, positionSeconds);
    });
}

function normalizeSponsorBlockSegment(value: unknown): SponsorBlockSegment | undefined {
    const source = value as SponsorBlockApiSegment;
    if (!isSegmentCategory(source?.category)) {
        return undefined;
    }

    if (!Array.isArray(source.segment) || source.segment.length < 2) {
        return undefined;
    }

    const startSeconds = toFiniteNumber(source.segment[0]);
    const endSeconds = toFiniteNumber(source.segment[1]);
    if (startSeconds === undefined || endSeconds === undefined || endSeconds <= startSeconds) {
        return undefined;
    }

    return {
        uuid: typeof source.UUID === "string" ? source.UUID : "",
        startSeconds,
        endSeconds,
        category: source.category
    };
}

export function createSponsorBlockController(dependencies: SponsorBlockControllerDependencies): SponsorBlockController {
    let isStarted = false;
    let overlayAction: OverlayAction | undefined;

    let sponsorBlockEnabled = DEFAULT_SPONSORBLOCK_ENABLED;
    let segmentActions = { ...DEFAULT_SEGMENT_ACTIONS };
    let lastSettingsRefreshAt = 0;

    let currentVideoId = "";
    let currentSegments: SponsorBlockSegment[] = [];
    let activeAskSegment: SponsorBlockSegment | undefined;
    let rewindOverlayOffer: RewindOverlayOffer | undefined;

    let isFetchInFlight = false;
    let nextFetchAttemptAt = 0;
    let lastFetchVideoId = "";
    const autoSkippedSegmentKeys = new Set<string>();

    const hideOverlay = (): void => { overlayAction = undefined; };

    const clearRewindOverlayOffer = (): void => {
        rewindOverlayOffer = undefined;
    };

    // The player stays unobstructed. Legacy ask settings migrate to ignore;
    // explicit automatic skipping still works without skip/rewind popovers.
    const showOverlay = (_segment: SponsorBlockSegment, _action: OverlayAction): void => {};

    const refreshSettings = (): void => {
        const now = Date.now();
        if (now - lastSettingsRefreshAt < 1000) {
            return;
        }

        lastSettingsRefreshAt = now;
        sponsorBlockEnabled = isSponsorBlockEnabled(dependencies.preferences);
        segmentActions = getSegmentActions(dependencies.preferences);

        if (!sponsorBlockEnabled || !hasManagedSegmentTypes(segmentActions)) {
            clearRewindOverlayOffer();
            hideOverlay();
            return;
        }

        if (activeAskSegment && segmentActions[activeAskSegment.category] !== "ask") {
            hideOverlay();
        }
    };

    const resetVideoState = (nextVideoId: string): void => {
        currentVideoId = nextVideoId;
        currentSegments = [];
        activeAskSegment = undefined;
        clearRewindOverlayOffer();
        lastFetchVideoId = "";
        nextFetchAttemptAt = 0;
        autoSkippedSegmentKeys.clear();
        hideOverlay();
    };

    const fetchSegmentsForVideo = async (videoId: string): Promise<void> => {
        if (!isStarted || !videoId || isFetchInFlight) {
            return;
        }

        const now = Date.now();
        if (now < nextFetchAttemptAt) {
            return;
        }

        isFetchInFlight = true;
        const url = `${SPONSORBLOCK_API_BASE_URL}/api/skipSegments?videoID=${encodeURIComponent(videoId)}&${SEGMENT_QUERY_PARAMS}&service=YouTube`;
        try {
            const response = await dependencies.http.get(url, {
                headers: {
                    Accept: "application/json"
                },
                params: {},
                data: ""
            });

            if (!isStarted || currentVideoId !== videoId) return;

            if (response.statusCode === 404) {
                if (currentVideoId === videoId) {
                    currentSegments = [];
                }
                lastFetchVideoId = videoId;
                nextFetchAttemptAt = 0;
                return;
            }

            if (response.statusCode < 200 || response.statusCode >= 300) {
                throw new Error(`HTTP ${response.statusCode} ${response.reason || ""}`.trim());
            }

            const rawText = typeof response.text === "string" ? response.text : "[]";
            const rawPayload = JSON.parse(rawText);
            const rawSegments = Array.isArray(rawPayload) ? rawPayload : [];

            const segments = rawSegments
                .map((segment) => normalizeSponsorBlockSegment(segment))
                .filter((segment): segment is SponsorBlockSegment => Boolean(segment))
                .sort((left, right) => left.startSeconds - right.startSeconds);

            if (currentVideoId === videoId) {
                currentSegments = segments;
            }

            lastFetchVideoId = videoId;
            nextFetchAttemptAt = 0;
        } catch (error) {
            if (!isStarted || currentVideoId !== videoId) return;
            dependencies.console.error(
                `YouTube: SponsorBlock fetch failed for ${videoId}: ${error instanceof Error ? error.message : String(error)}`
            );
            if (currentVideoId === videoId) {
                currentSegments = [];
            }
            lastFetchVideoId = "";
            nextFetchAttemptAt = Date.now() + SEGMENT_FETCH_RETRY_MS;
        } finally {
            isFetchInFlight = false;
        }
    };

    const shouldLoadSegments = (): boolean => {
        return sponsorBlockEnabled && hasManagedSegmentTypes(segmentActions);
    };

    const maybeAutoSkip = (activeSegment: SponsorBlockSegment): boolean => {
        const segmentKey = getSegmentKey(activeSegment);
        if (autoSkippedSegmentKeys.has(segmentKey)) {
            return false;
        }

        autoSkippedSegmentKeys.add(segmentKey);
        const target = Math.max(0, activeSegment.endSeconds + 0.25);
        dependencies.core.seekTo(target);
        return true;
    };

    const showRewindOffer = (segment: SponsorBlockSegment): void => {
        rewindOverlayOffer = {
            segment,
            expiresAt: Date.now() + REWIND_OVERLAY_DURATION_MS
        };
        showOverlay(segment, "rewind");
    };

    const updateRewindOfferVisibility = (): boolean => {
        if (!rewindOverlayOffer) {
            return false;
        }

        if (Date.now() >= rewindOverlayOffer.expiresAt) {
            clearRewindOverlayOffer();
            if (overlayAction === "rewind") {
                hideOverlay();
            }
            return false;
        }

        showOverlay(rewindOverlayOffer.segment, "rewind");
        return true;
    };

    const handleVideoChange = (snapshot: PlaybackSnapshot): void => {
        refreshSettings();
        const videoId = snapshot.videoId || "";
        if (videoId === currentVideoId) {
            return;
        }

        resetVideoState(videoId);
        if (!videoId || !shouldLoadSegments()) {
            return;
        }

        void fetchSegmentsForVideo(videoId);
    };

    const handleTick = (snapshot: PlaybackSnapshot): void => {
        refreshSettings();

        if (!sponsorBlockEnabled) {
            return;
        }

        const videoId = snapshot.videoId || "";
        if (!videoId) {
            resetVideoState("");
            return;
        }

        if (videoId !== currentVideoId) {
            resetVideoState(videoId);
        }

        if (!shouldLoadSegments()) {
            clearRewindOverlayOffer();
            hideOverlay();
            return;
        }

        if (lastFetchVideoId !== videoId && !isFetchInFlight) {
            void fetchSegmentsForVideo(videoId);
        }

        const positionSeconds = snapshot.positionSeconds;
        if (positionSeconds === undefined) {
            hideOverlay();
            return;
        }

        const activeSegment = findActiveManagedSegment(currentSegments, positionSeconds, segmentActions);
        if (!activeSegment) {
            if (!updateRewindOfferVisibility()) {
                hideOverlay();
            }
            return;
        }

        const segmentAction = segmentActions[activeSegment.category];
        if (segmentAction === "ask") {
            activeAskSegment = activeSegment;
            showOverlay(activeSegment, "skip");
            return;
        }

        if (segmentAction === "skip") {
            const didAutoSkip = maybeAutoSkip(activeSegment);
            if (didAutoSkip) {
                showRewindOffer(activeSegment);
                return;
            }
        }

        if (!updateRewindOfferVisibility()) {
            hideOverlay();
        }
    };

    const monitor = createPlaybackMonitor({
        core: dependencies.core,
        shouldPoll: () => {
            if (!isStarted) return false;
            refreshSettings();
            return sponsorBlockEnabled;
        },
        intervalMs: 350,
        onVideoChange: handleVideoChange,
        onTick: handleTick
    });

    const start = (): void => {
        if (isStarted) {
            return;
        }

        isStarted = true;
        refreshSettings();
        monitor.start();
    };

    const stop = (): void => {
        if (!isStarted) {
            return;
        }

        isStarted = false;
        monitor.stop();
        resetVideoState("");
    };

    return {
        start,
        stop
    };
}
