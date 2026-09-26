// A click during a refresh queues one fresh pass instead of disappearing or
// starting parallel requests. All callers wait for that final pass.
export function createRefreshQueue(action: () => Promise<void>): (force?: boolean) => Promise<void> {
    let running: Promise<void> | null = null;
    let again = false;
    return (force = false) => {
        if (running) { again ||= force; return running; }
        running = (async () => {
            do { again = false; await action(); } while (again);
        })().finally(() => { running = null; });
        return running;
    };
}
