const { menu, global, console } = iina;

const YOUTUBE_SPLASH_URL =
    "~/Library/Application Support/com.colliderli.iina/plugins/xyz.brbc.youtube.iinaplugin/assets/YouTube.png";

// Use only numeric handles returned by createPlayerInstance. IINA's string-label
// routing force-unwraps a player's plugin instance, which can be absent on unload.
let activePlayerId: number | null = null;
let creatingPlayer = false;

global.onMessage("playerClosed", (data) => {
    if (typeof data?.playerId === "number" && data.playerId === activePlayerId) {
        activePlayerId = null;
    }
});

function handleMenuAction(): void {
    if (creatingPlayer) return;
    if (activePlayerId !== null) {
        global.postMessage(activePlayerId, "showYouTubeSidebar", { playerId: activePlayerId });
        return;
    }
    creatingPlayer = true;
    try {
        const playerId = global.createPlayerInstance({
            url: YOUTUBE_SPLASH_URL,
            enablePlugins: true
        });
        if (typeof playerId !== "number" || !Number.isFinite(playerId)) {
            throw new Error("IINA could not create the YouTube player.");
        }
        activePlayerId = playerId;
        global.postMessage(playerId, "showYouTubeSidebar", { playerId });
    } finally {
        creatingPlayer = false;
    }
}

menu.addItem(menu.item("YouTube", () => {
    try { handleMenuAction(); }
    catch (error) {
        console.error(`YouTube: Could not open sidebar: ${error instanceof Error ? error.message : String(error)}`);
    }
}, { keyBinding: "Shift+Y" }));
