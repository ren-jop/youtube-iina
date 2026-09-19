import type { HttpRequestPayload, HttpResponsePayload } from '../../shared/messages';
import { MESSAGE_NAMES } from '../../shared/messages';
import { decodeHttpResponse, requestLabel } from '../../shared/httpTransport';
import { HTTP_TIMEOUT_MS } from '../constants';
import { recordDiagnostic } from './diagnostics';

type PendingHttpRequest = {
    resolve: (payload: HttpResponsePayload) => void;
    reject: (error: Error) => void;
    timeoutId: number;
    label: string;
    startedAt: number;
    stage: 'sent' | 'received' | 'completed';
};
let iinaApi: typeof iina | undefined = (globalThis as { iina?: typeof iina }).iina;
const pendingHttpRequests = new Map<string, PendingHttpRequest>();
let nextHttpRequestId = 1;
let boundApi: typeof iina | undefined;

export function setHttpBridgeApi(nextApi: typeof iina | undefined): void {
    if (nextApi !== iinaApi) {
        for (const request of pendingHttpRequests.values()) {
            clearTimeout(request.timeoutId);
            request.reject(new Error('IINA message bridge changed. Please retry.'));
        }
        pendingHttpRequests.clear();
    }
    iinaApi = nextApi;
}

export function ensureHttpBridgeListener(): void {
    if (!iinaApi || boundApi === iinaApi || typeof iinaApi.onMessage !== 'function') return;
    iinaApi.onMessage(MESSAGE_NAMES.HttpProgress, (payload) => {
        const request = pendingHttpRequests.get(payload?.id);
        if (!request) return;
        request.stage = payload.stage;
        recordDiagnostic(`${request.label}: ${payload.stage}${typeof payload.statusCode === 'number' ? ` HTTP ${payload.statusCode}` : ''}`);
    });
    iinaApi.onMessage(MESSAGE_NAMES.HttpResponse, (wire) => {
        if (!wire || typeof wire.id !== 'string') return;
        const pending = pendingHttpRequests.get(wire.id);
        if (!pending) return;
        pendingHttpRequests.delete(wire.id);
        clearTimeout(pending.timeoutId);
        try {
            const response = decodeHttpResponse(wire);
            recordDiagnostic(`${pending.label}: delivered HTTP ${response.statusCode}, ${response.text?.length || 0} characters, ${Date.now() - pending.startedAt}ms`);
            pending.resolve(response);
        } catch {
            recordDiagnostic(`${pending.label}: response decoding failed`);
            pending.reject(new Error('IINA response decoding failed. Open Diagnostics for details.'));
        }
    });
    boundApi = iinaApi;
    recordDiagnostic('Response listeners attached');
}

export function sendHttpRequest(request: Omit<HttpRequestPayload, 'id'>, timeoutMs = HTTP_TIMEOUT_MS): Promise<HttpResponsePayload> {
    const activeApi = iinaApi;
    if (!activeApi || typeof activeApi.postMessage !== 'function') {
        recordDiagnostic('IINA message bridge unavailable');
        return Promise.reject(new Error('IINA message bridge is unavailable in this context.'));
    }
    ensureHttpBridgeListener();
    const requestId = `http-${Date.now()}-${nextHttpRequestId++}`;
    const label = requestLabel(request.url);
    recordDiagnostic(`${label}: sent`);
    return new Promise((resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
            const pending = pendingHttpRequests.get(requestId);
            pendingHttpRequests.delete(requestId);
            const reason = pending?.stage === 'completed' ? 'IINA received the response but could not deliver it to the sidebar'
                : pending?.stage === 'received' ? 'YouTube did not finish responding'
                : 'the IINA plugin did not acknowledge the request';
            recordDiagnostic(`${label}: timeout (${reason})`);
            reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s: ${reason}. Open Diagnostics below.`));
        }, timeoutMs);
        pendingHttpRequests.set(requestId, { resolve, reject, timeoutId, label, startedAt: Date.now(), stage: 'sent' });
        try {
            activeApi.postMessage(MESSAGE_NAMES.HttpRequest, { id: requestId, ...request });
        } catch {
            pendingHttpRequests.delete(requestId);
            clearTimeout(timeoutId);
            recordDiagnostic(`${label}: bridge send failed`);
            reject(new Error('Could not send request to IINA. Open Diagnostics below.'));
        }
    });
}
