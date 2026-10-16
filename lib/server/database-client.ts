type ClosableClient = { end: (options: { timeout: number }) => Promise<void> };

export class DatabaseTimeoutError extends Error {
  readonly code = "DATABASE_TIMEOUT";
  constructor() { super("A conexão com o banco não respondeu dentro do prazo."); }
}

/** Recycle idle clients on entry: serverless suspension can pause idle timers. */
export function createDatabaseRunner<Client extends ClosableClient>(
  create: () => Client,
  { idleMs = 10_000, timeoutMs = 20_000, now = Date.now } = {},
) {
  type State = { client: Client; active: number; lastUsed: number; disposed: boolean };
  let current: State | null = null;

  function dispose(state: State) {
    if (current === state) current = null;
    if (state.disposed) return;
    state.disposed = true;
    // Force-close, without waiting for a dead socket's graceful shutdown.
    void state.client.end({ timeout: 0 }).catch(() => {});
  }

  return async function run<T>(operation: (client: Client) => PromiseLike<T>): Promise<T> {
    if (current && current.active === 0 && now() - current.lastUsed >= idleMs) dispose(current);
    current ??= { client: create(), active: 0, lastUsed: now(), disposed: false };
    const state = current;
    state.active++;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation(state.client),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(new DatabaseTimeoutError());
            dispose(state);
          }, timeoutMs);
        }),
      ]);
    } finally {
      clearTimeout(timer);
      state.active--;
      state.lastUsed = now();
    }
    // Never replay a business operation: a timed-out write may have committed.
  };
}
