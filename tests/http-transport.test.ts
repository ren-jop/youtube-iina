import { expect, test } from 'bun:test';
import { runInNewContext } from 'node:vm';
import { encodeHttpResponse, decodeHttpResponse, requestLabel } from '../src/shared/httpTransport';
import { sendHttpRequest, setHttpBridgeApi } from '../src/ui/bridge/httpBridge';
import { diagnosticReport } from '../src/ui/bridge/diagnostics';
import { parseInnertubeConfig } from '../src/ui/innertube/config';

// Match JavascriptMessageHub.swift: JSON is embedded, unescaped, in String.raw.
function nativeDeliver(payload: unknown, emit: Function): void {
    runInNewContext('window.iina._emit(`httpResponse`, String.raw`' + JSON.stringify(payload) + '`)', {
        window: { iina: { _emit(_name: string, json: string) { emit(JSON.parse(json)); } } }
    });
}
const html = '<script>const template = `hello ${unknownVariable}`;</script>\n'
    + '"INNERTUBE_API_KEY":"key","INNERTUBE_CONTEXT_CLIENT_VERSION":"version"';

test('reproduces the old native bridge failure on YouTube script content', () => {
    expect(() => nativeDeliver({ id: 'test', ok: true, statusCode: 200, text: html }, () => {})).toThrow();
});

test.each([html, '${unknownVariable}', '`', 'emoji 🎸 / 中文 / \\n', '\u2028\u2029', '\ud800'])('native transport round-trips special content %#', (text) => {
    const response = { id: 'test', ok: true, statusCode: 200, text };
    let received;
    nativeDeliver(encodeHttpResponse(response), value => { received = decodeHttpResponse(value); });
    expect(received).toEqual(response);
});

test('homepage reaches the real sidebar bridge through native template evaluation', async () => {
    globalThis.window = globalThis as any;
    const listeners: Record<string, Function> = {};
    setHttpBridgeApi({
        onMessage(name: string, callback: Function) { listeners[name] = callback; },
        postMessage(_name: string, request: any) {
            listeners.httpProgress({ id: request.id, stage: 'received' });
            nativeDeliver(encodeHttpResponse({ id: request.id, ok: true, statusCode: 200, text: html }), listeners.httpResponse);
        }
    } as any);
    const response = await sendHttpRequest({ url: 'https://www.youtube.com/?hl=en' }, 100);
    expect(parseInnertubeConfig(response.text!).clientVersion).toBe('version');
});

test.each(['sent', 'received', 'completed'])('timeouts distinguish %s stage', async (stage) => {
    globalThis.window = globalThis as any;
    const listeners: Record<string, Function> = {};
    setHttpBridgeApi({
        onMessage(name: string, callback: Function) { listeners[name] = callback; },
        postMessage(_name: string, request: any) {
            if (stage !== 'sent') listeners.httpProgress({ id: request.id, stage });
        }
    } as any);
    const expected = stage === 'sent' ? 'did not acknowledge' : stage === 'received' ? 'did not finish responding' : 'could not deliver';
    await expect(sendHttpRequest({ url: 'https://www.youtube.com/youtubei/v1/search?key=private-key', body: { query: 'private-search' }, headers: { Authorization: 'Bearer private-token' } }, 5)).rejects.toThrow(expected);
    expect(diagnosticReport()).not.toContain('private-key');
    expect(diagnosticReport()).not.toContain('private-search');
    expect(diagnosticReport()).not.toContain('private-token');
});

test('diagnostic labels never expose arbitrary URL paths or revoke tokens', () => {
    expect(requestLabel('https://www.youtube.com/o/oauth2/revoke?token=secret')).toBe('Sign-out');
    expect(requestLabel('https://example.com/private-secret')).toBe('Network request');
});

test('malformed encoded responses fail immediately instead of silently timing out', async () => {
    const listeners: Record<string, Function> = {};
    setHttpBridgeApi({ onMessage(name: string, callback: Function) { listeners[name] = callback; },
        postMessage(_name: string, request: any) { listeners.httpResponse({ id: request.id, encodedResponse: '%bad' }); }
    } as any);
    await expect(sendHttpRequest({ url: 'https://www.youtube.com/' }, 100)).rejects.toThrow('decoding failed');
});
