const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export function extractVideoIdFromPath(pathValue: string): string | undefined {
    const rawPath = pathValue.trim();
    if (!rawPath) {
        return undefined;
    }

    const hostMatch = rawPath.match(/^https?:\/\/([^/?#]+)/i);
    if (!hostMatch) {
        return undefined;
    }

    const host = hostMatch[1].toLowerCase();
    const afterHost = rawPath.slice(hostMatch[0].length);
    const pathOnly = afterHost.split("?")[0].split("#")[0] || "/";

    if (host === "youtu.be") {
        const candidate = pathOnly.replace(/^\/+/, "").split("/")[0] || "";
        return VIDEO_ID_PATTERN.test(candidate) ? candidate : undefined;
    }

    if (host !== "youtube.com" && !host.endsWith(".youtube.com")) {
        return undefined;
    }

    if (pathOnly === "/watch") {
        const videoIdMatch = rawPath.match(/[?&]v=([A-Za-z0-9_-]{11})(?:[&#]|$)/);
        const candidate = videoIdMatch?.[1] || "";
        return VIDEO_ID_PATTERN.test(candidate) ? candidate : undefined;
    }

    const shortsMatch = pathOnly.match(/^\/shorts\/([A-Za-z0-9_-]{11})(?:\/|$)/);
    if (shortsMatch?.[1] && VIDEO_ID_PATTERN.test(shortsMatch[1])) {
        return shortsMatch[1];
    }

    const embedMatch = pathOnly.match(/^\/embed\/([A-Za-z0-9_-]{11})(?:\/|$)/);
    if (embedMatch?.[1] && VIDEO_ID_PATTERN.test(embedMatch[1])) {
        return embedMatch[1];
    }

    const directIdMatch = pathOnly.match(/^\/([A-Za-z0-9_-]{11})(?:\/|$)/);
    if (directIdMatch?.[1] && VIDEO_ID_PATTERN.test(directIdMatch[1])) {
        return directIdMatch[1];
    }

    if (VIDEO_ID_PATTERN.test(rawPath)) {
        return rawPath;
    }

    if (rawPath.includes("watch?v=")) {
        const videoIdMatch = rawPath.match(/watch\?v=([A-Za-z0-9_-]{11})(?:[&#]|$)/);
        const candidate = videoIdMatch?.[1] || "";
        if (VIDEO_ID_PATTERN.test(candidate)) {
            return candidate;
        }
    }

    if (rawPath.includes("youtu.be/")) {
        const shortMatch = rawPath.match(/youtu\.be\/([A-Za-z0-9_-]{11})(?:[/?#]|$)/);
        const candidate = shortMatch?.[1] || "";
        if (VIDEO_ID_PATTERN.test(candidate)) {
            return candidate;
        }
    }

    if (rawPath.includes("shorts/")) {
        const shortIdMatch = rawPath.match(/shorts\/([A-Za-z0-9_-]{11})(?:[/?#]|$)/);
        const candidate = shortIdMatch?.[1] || "";
        if (VIDEO_ID_PATTERN.test(candidate)) {
            return candidate;
        }
    }

    if (rawPath.includes("embed/")) {
        const embedIdMatch = rawPath.match(/embed\/([A-Za-z0-9_-]{11})(?:[/?#]|$)/);
        const candidate = embedIdMatch?.[1] || "";
        if (VIDEO_ID_PATTERN.test(candidate)) {
            return candidate;
        }
    }

    if (pathOnly.endsWith(".png")) {
        return undefined;
    }

    return undefined;
}
