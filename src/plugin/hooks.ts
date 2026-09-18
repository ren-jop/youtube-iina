import { MESSAGE_NAMES } from "../shared/messages";
import { extractVideoIdFromPath } from "./videoId";

interface PlaybackHookDependencies {
    event: { on: (name: string, callback: () => void) => unknown };
    core: { status: { url?: string | null } };
    sidebar: { postMessage: (name: string, payload: unknown) => void };
}

// Do not observe mpv.*.changed. Some IINA versions defer decoding mpv event
// property pointers until after the native event storage can be reused.
// The sidebar only consumes file lifecycle messages, not position telemetry.
export function installPlaybackHookScaffolding(dependencies: PlaybackHookDependencies): void {
    let closed = false;
    let path = "";
    const post = (event: "file-loaded" | "ended"): void => {
        dependencies.sidebar.postMessage(MESSAGE_NAMES.PlaybackLifecycleEvent, {
            event, path: path || undefined,
            videoId: extractVideoIdFromPath(path), observedAt: new Date().toISOString()
        });
    };
    dependencies.event.on("iina.file-loaded", () => {
        closed = false; // IINA can reuse a closed window without window-loaded.
        path = String(dependencies.core.status.url || "");
        post("file-loaded");
    });
    dependencies.event.on("mpv.end-file", () => {
        if (!closed) post("ended"); // Use cached data; never read mpv during stop.
    });
    dependencies.event.on("iina.window-will-close", () => { closed = true; });
}
