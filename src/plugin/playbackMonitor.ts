import { extractVideoIdFromPath } from "./videoId";

export interface PlaybackStatus {
    url?: string | null;
    position?: number | null;
    duration?: number | null;
    paused?: boolean;
    idle?: boolean;
}

export interface PlaybackSnapshot {
    path: string;
    videoId?: string;
    positionSeconds?: number;
    durationSeconds?: number;
    isPaused?: boolean;
    observedAt: string;
}

interface PlaybackMonitorDependencies {
    core: { status: PlaybackStatus };
    shouldPoll?: () => boolean;
    intervalMs?: number;
    onTick?: (snapshot: PlaybackSnapshot) => void;
    onVideoChange?: (snapshot: PlaybackSnapshot, previousVideoId?: string) => void;
}

export interface PlaybackMonitor {
    start: () => void;
    stop: () => void;
    getLatestSnapshot: () => PlaybackSnapshot;
}

function finite(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function createPlaybackMonitor(dependencies: PlaybackMonitorDependencies): PlaybackMonitor {
    let timer: ReturnType<typeof setInterval> | null = null;
    let running = false;
    let previousVideoId: string | undefined;
    let latestSnapshot: PlaybackSnapshot = { path: "", observedAt: new Date().toISOString() };
    const poll = (): void => {
        if (!running || dependencies.shouldPoll?.() === false) return;
        // core.status reads IINA's cached info. Position/duration synchronize only
        // when PlayerCore is active, unlike unguarded mpv.getNumber calls.
        const status = dependencies.core.status;
        const path = status.idle ? "" : String(status.url || "");
        latestSnapshot = {
            path, videoId: extractVideoIdFromPath(path),
            positionSeconds: path ? finite(status.position) : undefined,
            durationSeconds: path ? finite(status.duration) : undefined,
            isPaused: status.paused, observedAt: new Date().toISOString()
        };
        dependencies.onTick?.(latestSnapshot);
        if (latestSnapshot.videoId !== previousVideoId) {
            const previous = previousVideoId;
            previousVideoId = latestSnapshot.videoId;
            dependencies.onVideoChange?.(latestSnapshot, previous);
        }
    };
    return {
        start() {
            if (running) return;
            running = true;
            timer = setInterval(poll, Math.max(100, dependencies.intervalMs || 350));
            poll();
        },
        stop() {
            running = false; // Also guards a callback queued before clearInterval.
            if (timer !== null) clearInterval(timer);
            timer = null;
            previousVideoId = undefined;
        },
        getLatestSnapshot: () => latestSnapshot
    };
}
