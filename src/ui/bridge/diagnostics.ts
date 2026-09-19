import info from "../../../xyz.brbc.youtube.iinaplugin/Info.json";
const entries: string[] = [];
let update: (() => void) | undefined;

export function recordDiagnostic(message: string): void {
    entries.push(`${new Date().toISOString()} ${message}`);
    if (entries.length > 60) entries.shift();
    update?.();
}

export function diagnosticReport(): string {
    return [`YouTube for IINA ${info.version} — request diagnostics`,
        'No search terms, account tokens, or response bodies are recorded.', ...entries].join('\n');
}

export function initializeDiagnostics(): void {
    const output = document.querySelector<HTMLTextAreaElement>('[data-diagnostics-output]');
    if (!output) return;
    update = () => { output.value = diagnosticReport(); };
    update();
    document.querySelector('[data-diagnostics-select]')?.addEventListener('click', () => {
        output.focus(); output.select();
    });
}
