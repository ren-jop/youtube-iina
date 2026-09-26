import { describe, expect, test } from 'bun:test';
import { runInNewContext } from 'node:vm';
import { decodeHttpResponse } from '../src/shared/httpTransport';
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
    callbacks.playerClosed({ playerId: 1 }, '1-xyz.brbc.youtube');
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
            core: { status: { url: '', idle: true }, open: noop, seekTo: noop },
            preferences: { get: () => false }, overlay: {}, utils: {}
        }
    });
    events['iina.window-loaded'].forEach(fn => fn());
    const { MESSAGE_NAMES } = await import('../src/shared/messages');
    await messages[MESSAGE_NAMES.HttpRequest]({ id: 'first', url: 'https://www.youtube.com', method: 'GET' });
    expect(decodeHttpResponse(replies.find(r => r[0] === MESSAGE_NAMES.HttpResponse)[1]).statusCode).toBe(401);
    request = () => new Promise(resolve => { finish = resolve; });
    const pending = messages[MESSAGE_NAMES.HttpRequest]({ id: 'late', url: 'https://www.youtube.com' });
    events['iina.window-will-close'].forEach(fn => fn());
    finish!({ statusCode: 200, text: '{}' });
    await pending;
    expect(replies.filter(r => r[0] === MESSAGE_NAMES.HttpResponse)).toHaveLength(1);
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
    const joined = controller.refreshSubscriptions();
    expect(joined).toBe(refresh);
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

test('lifecycle hooks never register native property observers or read status on end/close', async () => {
    const { installPlaybackHookScaffolding } = await import('../src/plugin/hooks');
    const events: Record<string, Function> = {};
    const messages: any[] = [];
    let reads = 0;
    installPlaybackHookScaffolding({ event: { on(name, fn) { events[name] = fn; } },
        core: { status: { get url() { reads++; return `https://www.youtube.com/watch?v=${videoId}`; } } },
        sidebar: { postMessage(_name, payload) { messages.push(payload); } }
    });
    expect(Object.keys(events).some(name => name.endsWith('.changed'))).toBe(false);
    events['iina.file-loaded']();
    expect(messages[0].videoId).toBe(videoId);
    events['mpv.end-file']();
    events['iina.window-will-close']();
    events['mpv.end-file']();
    expect(reads).toBe(1);
    expect(messages).toHaveLength(2);
    events['iina.file-loaded'](); // Reused IINA window.
    expect(messages).toHaveLength(3);
});

test('playback monitor does not read native state when disabled, stopped, or constructed', async () => {
    const { createPlaybackMonitor } = await import('../src/plugin/playbackMonitor');
    const originalSetInterval = globalThis.setInterval;
    const originalClearInterval = globalThis.clearInterval;
    let tick: Function;
    let reads = 0;
    let enabled = false;
    const status = new Proxy({ url: `https://www.youtube.com/watch?v=${videoId}`, position: 10, duration: 60, paused: false, idle: false }, {
        get(target, key) { reads++; return target[key]; }
    });
    try {
        globalThis.setInterval = ((callback: Function) => { tick = callback; return 1; }) as any;
        globalThis.clearInterval = (() => {}) as any;
        const monitor = createPlaybackMonitor({ core: { status }, shouldPoll: () => enabled });
        expect(reads).toBe(0);
        monitor.start(); tick!();
        expect(reads).toBe(0);
        enabled = true; tick!();
        expect(monitor.getLatestSnapshot().positionSeconds).toBe(10);
        const activeReads = reads;
        monitor.stop(); tick!();
        expect(reads).toBe(activeReads);
    } finally {
        globalThis.setInterval = originalSetInterval;
        globalThis.clearInterval = originalClearInterval;
    }
});

test('video activation uses native playlist lifecycle without reopening or leaving fullscreen', async () => {
    const { handlePlayItem } = await import('../src/plugin/playback');
    const opened: unknown[] = [];
    globalThis.iina = {
        core: { open() { throw new Error('Must not reopen a playing window'); }, get window() { throw new Error('Must not change fullscreen'); } },
        playlist: { count: () => 1, add(url: string, at: number) { opened.push(['add', url, at]); return true; }, play(index: number) { opened.push(['native-play', index]); } },
        mpv: { command(name: string, args: string[]) { opened.push([name, args]); } }
    } as any;
    expect(handlePlayItem({ videoId, url: 'https://example.com/untrusted' })).toBe(true);
    expect(opened).toEqual([["add", `https://www.youtube.com/watch?v=${videoId}`, 0], ["native-play", 0], ["playlist-clear", []]]);
    expect(handlePlayItem({ videoId: 'invalid', url: 'https://example.com' })).toBe(false);
    delete globalThis.iina;
});

test('global routing never switches to an unmanaged string player label', async () => {
    const result = await Bun.build({ entrypoints: ['src/plugin/global.ts'], target: 'browser', format: 'iife' });
    const callbacks: Record<string, Function> = {};
    const messages: any[] = [];
    let action: Function;
    let created = 0;
    runInNewContext(await result.outputs[0].text(), { iina: {
        console: { log() {}, error() {} },
        menu: { item(_name: string, handler: Function) { action = handler; }, addItem() {} },
        global: { onMessage(name: string, handler: Function) { callbacks[name] = handler; },
            postMessage(...args: any[]) { messages.push(args); }, createPlayerInstance() { return ++created; } }
    } });
    action!();
    callbacks.playerClosed({ playerId: 100 }, 'some-other-player');
    action!();
    expect(created).toBe(1);
    expect(messages.map(message => message[0])).toEqual([1, 1]);
    expect(callbacks.playerReady).toBeUndefined();
});

describe('integrated playback and related results', () => {
    const next = (results: any[]) => ({ contents: { twoColumnWatchNextResults: { secondaryResults: { secondaryResults: { results } } } } });
    const chip = (text: string, token: string, isSelected = false) => ({ relatedChipCloudRenderer: { content: { chipCloudRenderer: { chips: [
        { chipCloudChipRenderer: { text: { simpleText: text }, isSelected, navigationEndpoint: { continuationCommand: { token } } } }
    ] } } } });
    const page = (items: any[]) => ({ onResponseReceivedEndpoints: [{ reloadContinuationItemsCommand: { targetId: 'watch-next-feed', continuationItems: items } }] });

    test('uses only the Related chip and its scoped continuation, excluding mixed cards and comments', async () => {
        const { fetchRelatedFeed } = await import('../src/ui/innertube/feedBrowse');
        const calls: any[] = [];
        respond = request => {
            calls.push(request.body);
            const token = request.body?.continuation;
            if (token === 'related-page') return { statusCode: 200, text: JSON.stringify(page([video('Addiction explained'),
                { continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token: 'more-related' } } } }])) };
            if (token === 'more-related') return { statusCode: 200, text: JSON.stringify(page([])) };
            return { statusCode: 200, text: JSON.stringify(next([chip('All', 'mixed'), chip('Related', 'related-page'), video('Spicy food')])) };
        };
        const result = await fetchRelatedFeed('source12345');
        expect(result.items.map(item => item.title)).toEqual(['Addiction explained']);
        expect(calls.map(call => call.continuation).filter(Boolean)).toEqual(['related-page', 'more-related']);
    });

    test('does not fall back to random recommendations when the filter is absent or fails', async () => {
        const { fetchRelatedFeed } = await import('../src/ui/innertube/feedBrowse');
        respond = () => ({ statusCode: 200, text: JSON.stringify(next([video('Spicy food')])) });
        const empty = await fetchRelatedFeed('empty123456');
        expect(empty.items).toEqual([]);
        expect(empty.notice).toContain('No close title-topic matches');
        respond = request => request.body?.continuation ? { statusCode: 503, text: '{}' }
            : { statusCode: 200, text: JSON.stringify(next([chip('Related', 'related-page'), video('Spicy food')])) };
        const result = await fetchRelatedFeed('failed12345');
        expect(result.items).toEqual([]);
        expect(result.statusCode).toBe(503);
    });

    test('selected Related filter does not fetch mixed chips or unrelated response sections', async () => {
        const { relatedCards, relatedFilter } = await import('../src/ui/parsers/related');
        const payload = { ...next([chip('Related', '', true), video('Topic match')]), comments: video('Other video') };
        expect(relatedFilter(payload)?.selected).toBe(true);
        expect(parseFeedItemsFromBrowseResponse(relatedCards(payload, true)).items.map(item => item.title)).toEqual(['Topic match']);
        expect(relatedCards({ onResponseReceivedEndpoints: [{ appendContinuationItemsAction: { targetId: 'comments', continuationItems: [video()] } }] })).toEqual([]);
    });

    test.each(['feed', 'search', 'related'] as const)('playback keeps the %s view and list intact', async activeView => {
        globalThis.document = { querySelector: () => null, querySelectorAll: () => [] } as any;
        const { state } = await import('../src/ui/state');
        const { createRelatedController } = await import('../src/ui/controller/related');
        const items = parseFeedItemsFromBrowseResponse(video()).items;
        state.activeView = activeView;
        state.currentPlaybackVideoId = 'oldvideo123';
        state.relatedState.items = items;
        let requests = 0;
        respond = () => { requests++; throw new Error('Unexpected request'); };
        const controller = createRelatedController({ updateActiveViewLoadingIndicators() {}, playFeedItem() {}, renderModeTabs() {},
            resolveFeedItemPresentation: () => ({ title: '', thumbnailUrl: '', durationLabel: '', channelLine: '', statsLine: '' }),
            buildFinalFilteredFeedItems: async items => items });
        controller.handlePlaybackLifecycleEvent({ event: 'started', videoId, observedAt: new Date().toISOString() } as any);
        expect(state.activeView).toBe(activeView);
        expect(state.relatedState.items).toBe(items);
        expect(state.currentPlaybackVideoId).toBe(videoId);
        expect(requests).toBe(0);
    });

    test('modern cards recover real author, views and publication text without metadata requests', () => {
        const modern = { lockupViewModel: { contentId: videoId, contentType: 'LOCKUP_CONTENT_TYPE_VIDEO',
            metadata: { lockupMetadataViewModel: { title: { content: 'Modern video' }, metadata: { contentMetadataViewModel: { metadataRows: [
                { metadataParts: [{ text: { content: 'RECOVERable with Dr. L', commandRuns: [{ startIndex: 0, length: 23, onTap: { innertubeCommand: { browseEndpoint: { browseId: 'UCchannel' } } } }] } }] },
                { metadataParts: [{ text: { content: '12K views' } }, { text: { content: '2 days ago' } }] }
            ] } } } }, contentImage: { thumbnailViewModel: { image: { sources: [{ url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` }] } } } } };
        const item = parseFeedItemsFromBrowseResponse(modern).items[0];
        expect(item.channelTitle).toBe('RECOVERable with Dr. L');
        expect(item.viewCountText).toContain('12');
        expect(item.published).toBe('2 days ago');
    });
});

test('missing-filter fallback loads close topics from the current video title', async () => {
    const { fetchRelatedFeed } = await import('../src/ui/innertube/feedBrowse');
    const relevant = video('How to quit digital addictions');
    relevant.videoRenderer.videoId = '12345678901';
    relevant.videoRenderer.navigationEndpoint.watchEndpoint.videoId = '12345678901';
    respond = () => ({ statusCode: 200, text: JSON.stringify({ contents: { twoColumnWatchNextResults: {
        results: { results: { contents: [{ videoPrimaryInfoRenderer: { title: { simpleText: 'Understanding digital addiction' } } }] } },
        secondaryResults: { secondaryResults: { results: [video('10 Levels of Spicy Food'), relevant] } }
    } } }) });
    const result = await fetchRelatedFeed('topic123456');
    expect(result.items.map(item => item.title)).toEqual(['How to quit digital addictions']);
    expect(result.notice).toContain('matched from recommendations and search');
});

test('channel attribution requests are deduplicated and cached independently of feed loading', async () => {
    const { resolveChannelName } = await import('../src/ui/innertube/channelNames');
    let calls = 0;
    respond = request => {
        calls++;
        expect(request.url).toContain('/oembed?url=');
        return { statusCode: 200, text: JSON.stringify({ author_name: 'A real creator' }) };
    };
    const result = await Promise.all([resolveChannelName('author12345'),resolveChannelName('author12345')]);
    expect(result).toEqual(['A real creator','A real creator']);
    expect(await resolveChannelName('author12345')).toBe('A real creator');
    expect(calls).toBe(1);
});

test('Related recovers an empty selected chip through topic search and shares cached results', async () => {
    const { fetchRelatedFeed } = await import('../src/ui/innertube/feedBrowse');
    let calls = 0;
    respond = request => {
        calls++;
        if (request.url.includes('/search')) return {statusCode:200,text:JSON.stringify({contents:[video('Learning Rust programming')]})};
        return {statusCode:200,text:JSON.stringify({contents:{twoColumnWatchNextResults:{secondaryResults:{secondaryResults:{results:[
            {relatedChipCloudRenderer:{content:{chipCloudRenderer:{chips:[{chipCloudChipRenderer:{text:{simpleText:'Related'},isSelected:true}}]}}}}
        ]}}}}})};
    };
    const [first, second] = await Promise.all([fetchRelatedFeed('rustsource1','Rust programming'),fetchRelatedFeed('rustsource1','Rust programming')]);
    expect(first.items[0]?.title).toBe('Learning Rust programming');
    expect(second).toBe(first);
    expect(calls).toBe(2);
    await fetchRelatedFeed('rustsource1','Rust programming');
    expect(calls).toBe(2);
});

test('video author IDs survive classic and modern parsing without unrelated endpoints', async () => {
    const { parseSearchResponse } = await import('../src/ui/parsers/search');
    const { readVideoChannelId } = await import('../src/ui/parsers/channelIdentity');
    const channelId = 'UC' + 'i'.repeat(22);
    const renderer = {...video().videoRenderer, longBylineText: {runs: [{text: 'Creator', navigationEndpoint: {browseEndpoint: {browseId: channelId}}}]}};
    expect(parseFeedItemsFromBrowseResponse({videoRenderer: renderer}).items[0].channelId).toBe(channelId);
    expect(parseSearchResponse({contents: [{videoRenderer: renderer}]}).videos[0].channelId).toBe(channelId);
    expect(readVideoChannelId({metadata:{lockupMetadataViewModel:{metadata:{contentMetadataViewModel:{metadataRows:[{metadataParts:[{text:{commandRuns:[{onTap:{innertubeCommand:{browseEndpoint:{browseId:channelId}}}}]}}]}]}}}}})).toBe(channelId);
    expect(readVideoChannelId({relatedChannel: {browseId: channelId}})).toBeUndefined();
});

test('channel browsing shares one request and preserves attribution, views and publication', async () => {
    const { loadChannelVideos } = await import('../src/ui/innertube/channels');
    const channelId = 'UC' + 'c'.repeat(22);
    let calls = 0;
    respond = request => {
        calls++;
        expect(request.body.browseId).toBe(channelId);
        return {statusCode: 200, text: JSON.stringify({contents: [{videoRenderer: {...video().videoRenderer, viewCountText: {simpleText: '12K views'}, publishedTimeText: {simpleText:'2 days ago'}}}]})};
    };
    const source = {channelId, title: 'Creator'};
    const [first, second] = await Promise.all([loadChannelVideos(source), loadChannelVideos(source)]);
    expect(first).toBe(second);
    expect(first.items[0]).toMatchObject({channelId, channelTitle:'Creator', viewCountText:'12K views', published:'2 days ago'});
    expect(await loadChannelVideos(source)).toBe(first);
    expect(calls).toBe(1);
});

test('unknown channel links resolve once and reject non-YouTube author URLs', async () => {
    const { loadChannelVideos } = await import('../src/ui/innertube/channels');
    const channelId = 'UC' + 'u'.repeat(22);
    const calls: string[] = [];
    respond = request => {
        calls.push(request.url);
        if (request.url.includes('/oembed')) return {statusCode:200,text:JSON.stringify({author_name:'Resolved',author_url:'https://www.youtube.com/@resolved'})};
        if (request.url.includes('/navigation/resolve_url')) return {statusCode:200,text:JSON.stringify({endpoint:{browseEndpoint:{browseId:channelId}}})};
        return {statusCode:200,text:JSON.stringify(video())};
    };
    const [first, second] = await Promise.all([loadChannelVideos({videoId:'identity001'}),loadChannelVideos({videoId:'identity001'})]);
    expect(first).toBe(second); expect(first.channelId).toBe(channelId); expect(calls).toHaveLength(3);
    respond = () => ({statusCode:200,text:JSON.stringify({author_url:'https://example.com/@untrusted'})});
    await expect(loadChannelVideos({videoId:'badhost0001'})).rejects.toThrow('Channel link unavailable');
});

test('Related uses channel uploads when YouTube next fails and excludes the playing video', async () => {
    const { state } = await import('../src/ui/state');
    const { createRelatedController } = await import('../src/ui/controller/related');
    const channelId = 'UC' + 'r'.repeat(22);
    state.currentPlaybackVideoId = 'related0001';
    state.feedState.items = [{videoId:'related0001',title:'Lecture',channelTitle:'Teacher',channelId,published:'',thumbnailUrl:''}];
    state.relatedState.isLoading = false;
    respond = request => request.url.includes('/next') ? {statusCode:503,text:'{}'} : {statusCode:200,text:JSON.stringify({contents:[video('Another lecture'),{videoRenderer:{...video().videoRenderer,videoId:'related0001',navigationEndpoint:{watchEndpoint:{videoId:'related0001'}}}}]})};
    const controller = createRelatedController({updateActiveViewLoadingIndicators(){},playFeedItem(){},renderModeTabs(){},resolveFeedItemPresentation:item=>({title:item.title,channelLine:item.channelTitle,thumbnailUrl:'',durationLabel:'',statsLine:''}),buildFinalFilteredFeedItems:async items=>items});
    await controller.refreshRelated();
    expect(state.relatedState.items.map(item=>item.videoId)).toEqual([videoId]);
    expect(state.relatedState.warning).toBe('More from this channel.');
    expect(state.relatedState.status).toBe('');
    expect(state.relatedState.isLoading).toBe(false);
});
