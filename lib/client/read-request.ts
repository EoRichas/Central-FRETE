/** Bounded GET, including body download. Mutations are deliberately not retried. */
export async function fetchRead(url: string, signal?: AbortSignal, timeoutMs = 25_000): Promise<Response> {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  signal?.addEventListener("abort", abort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(url, { cache: "no-store", signal: controller.signal });
        const body = await response.arrayBuffer();
        return new Response([204, 205, 304].includes(response.status) ? null : body, {
          status: response.status, statusText: response.statusText, headers: response.headers,
        });
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error("O carregamento demorou mais que o esperado. Tente novamente."));
          controller.abort();
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
