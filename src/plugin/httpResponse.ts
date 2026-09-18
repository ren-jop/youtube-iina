import type { HttpResponsePayload } from "../shared/messages";

// IINA rejects non-2xx requests with an HTTP response object, not an Error.
// Preserve its status and body so OAuth polling and token refresh can work.
export function normalizeHttpResponse(id: string, value: unknown): HttpResponsePayload {
    const response = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const statusCode = typeof response.statusCode === "number" ? response.statusCode : 0;
    const text = typeof response.text === "string" ? response.text : undefined;
    if (text && text.length > 8 * 1024 * 1024) {
        return { id, ok: false, statusCode, reason: "response_too_large", error: "YouTube response exceeded the 8 MB limit." };
    }
    return {
        id,
        ok: statusCode >= 200 && statusCode < 300,
        statusCode,
        reason: typeof response.reason === "string" ? response.reason : "error",
        text,
        ...(statusCode === 0 ? { error: value instanceof Error ? value.message : "Network request failed." } : {})
    };
}
