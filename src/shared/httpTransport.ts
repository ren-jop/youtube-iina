import type { HttpResponsePayload } from './messages';

export interface HttpResponseWirePayload {
    id: string;
    encodedResponse: string;
}

// IINA's native message hub interpolates JSON into String.raw`...` without
// escaping template syntax. Never pass remote HTML/JSON through it verbatim.
export function encodeHttpResponse(response: HttpResponsePayload): HttpResponseWirePayload {
    return { id: encodeURIComponent(response.id), encodedResponse: encodeURIComponent(JSON.stringify(response)) };
}

export function decodeHttpResponse(wire: HttpResponseWirePayload | HttpResponsePayload): HttpResponsePayload {
    if ('encodedResponse' in wire) {
        const result = JSON.parse(decodeURIComponent(wire.encodedResponse));
        if (!result || result.id !== decodeURIComponent(wire.id) || typeof result.ok !== 'boolean' || typeof result.statusCode !== 'number') {
            throw new Error('Invalid HTTP response envelope');
        }
        return result;
    }
    return wire; // Compatibility with older bridges and native response fixtures.
}

export function requestLabel(url: string): string {
    // Deliberate allowlist: never log queries, video IDs, tokens, or request bodies.
    const path = url.replace(/^https?:\/\/[^/]+/, '').split(/[?#]/)[0];
    const known: Record<string, string> = {
        '/oembed': 'Channel attribution', '/': 'YouTube homepage', '/tv': 'YouTube TV config',
        '/youtubei/v1/search': 'YouTube search', '/youtubei/v1/browse': 'YouTube feed',
        '/youtubei/v1/player': 'Video metadata', '/youtubei/v1/next': 'Related videos',
        '/o/oauth2/device/code': 'Sign-in code', '/o/oauth2/token': 'Sign-in token',
        '/o/oauth2/revoke': 'Sign-out', '/youtubei/v1/subscription/subscribe': 'Subscribe',
        '/youtubei/v1/subscription/unsubscribe': 'Unsubscribe'
    };
    return known[path] || 'Network request';
}
