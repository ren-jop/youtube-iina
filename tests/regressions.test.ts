import { describe, expect, test } from 'bun:test';
import { runInNewContext } from 'node:vm';
import { normalizeHttpResponse } from '../src/plugin/httpResponse';
import { parseFeedItemsFromBrowseResponse } from '../src/ui/parsers/feed';
import { parseChannelSubscriptionDetails } from '../src/ui/parsers/subscription';
import { parseInnertubeConfig } from '../src/ui/innertube/config';
import { buildFinalFilteredFeedItems } from '../src/ui/innertube/metadata';
import { exchangeTvDeviceCode, OAuthSlowDownError } from '../src/ui/auth/tvOAuth';
import { ensureHttpBridgeListener, setHttpBridgeApi } from '../src/ui/bridge/httpBridge';
import { fetchLoggedInSubscriptionsFeed } from '../src/ui/innertube/feedBrowse';

const videoId = 'abcdefghijk';
function video(title = 'A normal upload') {
    return { videoRenderer: { videoId, title: { simpleText: title },
        navigationEndpoint: { watchEndpoint: { videoId } },
        thumbnail: { thumbnails: [{ url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` }] } } };
}

describe('HTTP bridge response handling', () => {
    test('preserves rejected HTTP responses for auth recovery', () => {
        const response = normalizeHttpResponse('1', { statusCode: 401, text: '{"error":"expired"}', reason: 'Unauthorized' });
        expect(response.statusCode).toBe(401);
        expect(response.text).toBe('{"error":"expired"}');
        expect(response.ok).toBe(false);
    });
    test('does not truncate configuration after 120 KB', () => {
        const text = ' '.repeat(150000) + '"INNERTUBE_API_KEY": "key", "INNERTUBE_CONTEXT_CLIENT_VERSION": "version"';
        const result = normalizeHttpResponse('2', { statusCode: 200, text });
        expect(parseInnertubeConfig(result.text!).apiKey).toBe('key');
    });
    test('fails explicitly on oversized responses and transport errors', () => {
        expect(normalizeHttpResponse('3', { statusCode: 200, text: 'x'.repeat(8 * 1024 * 1024 + 1) }).ok).toBe(false);
        expect(normalizeHttpResponse('4', new Error('offline')).error).toBe('offline');
    });
});

describe('feed parsing', () => {
    test.each(['Shorts explained', 'How to make an ad', 'Sponsored video production'])('keeps ordinary title: %s', (title) => {
        expect(parseFeedItemsFromBrowseResponse(video(title)).items).toHaveLength(1);
    });
    test('rejects actual shorts and advertisements', () => {
        const ad = video(); ad.videoRenderer.adBadge = { simpleText: 'Ad' };
        const short = video(); short.videoRenderer.navigationEndpoint = { reelWatchEndpoint: { videoId } };
        expect(parseFeedItemsFromBrowseResponse({ contents: [ad, short] }).items).toHaveLength(0);
    });
    test('supports TV tile cards, lockups and duplicate cards', () => {
        const tv = { tileRenderer: { contentId: videoId, contentType: 'TILE_CONTENT_TYPE_VIDEO',
            onSelectCommand: { watchEndpoint: { videoId } }, metadata: { tileMetadataRenderer: { title: { simpleText: 'TV video' } } },
            header: { tileHeaderRenderer: { thumbnail: { thumbnails: [{ url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` }] } } } } };
        const modern = { lockupViewModel: { contentId: '12345678901', contentType: 'LOCKUP_CONTENT_TYPE_VIDEO',
            metadata: { lockupMetadataViewModel: { title: { content: 'Modern video' } } },
            contentImage: { thumbnailViewModel: { image: { sources: [{ url: 'https://i.ytimg.com/vi/12345678901/hqdefault.jpg' }] } } } } };
        expect(parseFeedItemsFromBrowseResponse([tv, modern, video()]).items.map(v => v.title)).toEqual(['TV video', 'Modern video']);
    });
    test('handles deeply nested responses without recursion overflow', () => {
        let payload: unknown = video();
        for (let i = 0; i < 12000; i++) payload = { content: payload };
        expect(parseFeedItemsFromBrowseResponse(payload).items).toHaveLength(1);
    });
    test('empty feeds do not report parser failures for container nodes', () => {
        expect(parseFeedItemsFromBrowseResponse({ contents: [] }).diagnostics.rejectedByReason).toEqual({});
    });
    test('does not wait for player metadata requests', async () => {
        const items = parseFeedItemsFromBrowseResponse(video()).items;
        expect(await buildFinalFilteredFeedItems(items, 20, {}, () => { throw new Error('Unexpected write'); })).toEqual(items);
    });
    test('does not choose another channel subscription command or state', () => {
        const result = parseChannelSubscriptionDetails({ contents: [
            { subscribeButtonRenderer: { channelId: 'target', subscribed: false, onSubscribeEndpoints: [{ subscribeEndpoint: { channelIds: ['target'] } }] } },
            { subscribeButtonRenderer: { channelId: 'other', subscribed: true, unsubscribeEndpoint: { channelIds: ['other'] } } }
        ] }, 'target');
        expect(result.isSubscribed).toBe(false);
        expect(result.subscribeCommand?.payload.channelIds).toEqual(['target']);
        expect(result.unsubscribeCommand).toBeUndefined();
    });
});

// Exercise the real sidebar bridge, OAuth decoder and signed-in browse path.
let respond: (request: any) => any;
let listener: (response: any) => void;
globalThis.window = globalThis as any;
setHttpBridgeApi({ onMessage(_name: string, callback: any) { listener = callback; },
    postMessage(_name: string, request: any) { listener(normalizeHttpResponse(request.id, respond(request))); } } as any);
ensureHttpBridgeListener();
const identity = { clientId: 'test', clientSecret: 'test' };

describe('authentication and subscriptions integration', () => {
    test('HTTP 400 authorization_pending keeps login waiting', async () => {
        respond = () => ({ statusCode: 400, text: '{"error":"authorization_pending"}' });
        expect(await exchangeTvDeviceCode(identity, 'device')).toBeNull();
    });
    test('HTTP 400 slow_down requests polling backoff', async () => {
        respond = () => ({ statusCode: 400, text: '{"error":"slow_down"}' });
        await expect(exchangeTvDeviceCode(identity, 'device')).rejects.toBeInstanceOf(OAuthSlowDownError);
    });
    test('denied login remains a terminal error', async () => {
        respond = () => ({ statusCode: 403, text: '{"error":"access_denied"}' });
        await expect(exchangeTvDeviceCode(identity, 'device')).rejects.toThrow('Login was denied');
    });
    test('refreshes a rejected access token and loads continuation videos', async () => {
        const calls: any[] = [];
        let refreshed = 0;
        respond = request => {
            calls.push(request);
            if (request.method === 'GET') return { statusCode: 200, text: '"INNERTUBE_API_KEY":"key","INNERTUBE_CONTEXT_CLIENT_VERSION":"version"' };
            if (request.headers.Authorization === 'Bearer old') return { statusCode: 401, text: '{}' };
            return { statusCode: 200, text: JSON.stringify(request.body.continuation ? video() : { continuationContents: { nextContinuationData: { continuation: 'page2' } } }) };
        };
        const result = await fetchLoggedInSubscriptionsFeed({ isTvAuthAvailable: () => true,
            getValidTvAccessToken: async () => refreshed ? 'new' : 'old',
            refreshTvAccessToken: async () => { refreshed++; return 'new'; } });
        expect(refreshed).toBe(1);
        expect(result.failureReason).toBeUndefined();
        expect(result.items).toHaveLength(1);
        expect(calls.find(c => c.body?.browseId)?.body.browseId).toBe('FEsubscriptions');
        expect(calls.some(c => c.body?.continuation === 'page2')).toBe(true);
    });
});

test('closing a player allows the menu to create a new one', async () => {
    const result = await Bun.build({ entrypoints: ['src/plugin/global.ts'], target: 'browser', format: 'iife' });
    const callbacks: Record<string, Function> = {};
    let action: Function;
    let created = 0;
    const messages: any[] = [];
    runInNewContext(await result.outputs[0].text(), { iina: {
        console: { log() {}, error() {} },
        menu: { item(_name: string, handler: Function) { action = handler; }, addItem() {} },
        global: { onMessage(name: string, handler: Function) { callbacks[name] = handler; },
            postMessage(...args: any[]) { messages.push(args); }, createPlayerInstance() { return ++created; } }
    } });
    action!();
    callbacks.playerReady({}, '1-xyz.brbc.youtube');
    callbacks.playerClosed({}, '1-xyz.brbc.youtube');
    action!();
    expect(created).toBe(2);
    expect(messages.every(m => m[0] !== null)).toBe(true);
});

test('main bridge preserves HTTP failures and suppresses replies after close', async () => {
    const result = await Bun.build({ entrypoints: ['src/plugin/main.ts'], target: 'browser', format: 'iife' });
    const events: Record<string, Function[]> = {};
    const messages: Record<string, Function> = {};
    const replies: any[] = [];
    const timers = new Map<number, Function>();
    let nextTimer = 0;
    let finish: (value: any) => void;
    let request = () => Promise.reject({ statusCode: 401, text: '{"error":"expired"}' });
    const noop = () => {};
    runInNewContext(await result.outputs[0].text(), {
        setTimeout(fn: Function) { timers.set(++nextTimer, fn); return nextTimer; },
        clearTimeout(id: number) { timers.delete(id); },
        setInterval(fn: Function) { timers.set(++nextTimer, fn); return nextTimer; },
        clearInterval(id: number) { timers.delete(id); },
        iina: {
            console: { log: noop, error: noop },
            event: { on(name: string, fn: Function) { (events[name] ||= []).push(fn); } },
            sidebar: { loadFile: noop, show: noop, hide: noop, onMessage(name: string, fn: Function) { messages[name] = fn; }, postMessage(...args: any[]) { replies.push(args); } },
            global: { onMessage: noop, postMessage: noop },
            http: { get: () => request(), post: () => request() },
            mpv: { getString: () => '', getNumber: () => undefined, getFlag: () => false },
            preferences: { get: () => false }, overlay: {}, utils: {}
        }
    });
    events['iina.window-loaded'].forEach(fn => fn());
    const { MESSAGE_NAMES } = await import('../src/shared/messages');
    await messages[MESSAGE_NAMES.HttpRequest]({ id: 'first', url: 'https://www.youtube.com', method: 'GET' });
    expect(replies[0][1].statusCode).toBe(401);
    request = () => new Promise(resolve => { finish = resolve; });
    const pending = messages[MESSAGE_NAMES.HttpRequest]({ id: 'late', url: 'https://www.youtube.com' });
    events['iina.window-will-close'].forEach(fn => fn());
    finish!({ statusCode: 200, text: '{}' });
    await pending;
    expect(replies).toHaveLength(1);
    expect(timers.size).toBe(0);
});

test('subscription refresh retains results on failure and ignores signed-out results', async () => {
    globalThis.document = { querySelector: () => null, querySelectorAll: () => [] } as any;
    const { state } = await import('../src/ui/state');
    const { createSubscriptionsController } = await import('../src/ui/controller/subscriptions');
    const oldItems = parseFeedItemsFromBrowseResponse(video()).items;
    let resolve: (result: any) => void;
    let calls = 0;
    const controller = createSubscriptionsController({
        updateActiveViewLoadingIndicators() {}, playFeedItem() {},
        resolveFeedItemPresentation: () => ({ title: '', thumbnailUrl: '', durationLabel: '', channelLine: '', statsLine: '' }),
        fetchLoggedInSubscriptionsFeed: () => { calls++; return new Promise(done => { resolve = done; }); },
        buildFinalFilteredFeedItems: async items => items
    });
    state.appMode = 'logged_in';
    state.subscriptionsState.items = oldItems;
    const refresh = controller.refreshSubscriptions();
    await controller.refreshSubscriptions();
    expect(calls).toBe(1);
    resolve!({ items: [], failureReason: 'http_error', statusCode: 503 });
    await refresh;
    expect(state.subscriptionsState.items).toEqual(oldItems);
    expect(state.subscriptionsState.status).toContain('HTTP 503');
    const pending = controller.refreshSubscriptions();
    const { createAuthController } = await import('../src/ui/controller/auth');
    const auth = createAuthController({ renderFeed() {}, renderSubscriptions() {}, refreshFeed: async () => {},
        refreshSubscriptions: controller.refreshSubscriptions, getActiveView: () => 'feed', setActiveView() {} });
    await auth.setAppMode('anonymous');
    resolve!({ items: oldItems });
    await pending;
    expect(state.subscriptionsState.items).toEqual([]);
    expect(state.subscriptionsState.isLoading).toBe(false);
});
