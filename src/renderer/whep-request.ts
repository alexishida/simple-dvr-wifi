/** An eager RTSP source can still be connecting when the WHEP listener opens. */
export async function requestWhepAnswer(
  url: string,
  input: { token: string; sdp: string; signal: AbortSignal },
  options: { fetchImpl?: typeof fetch; timeoutMs?: number; retryMs?: number } = {},
): Promise<Response> {
  const signal = AbortSignal.any([
    input.signal,
    AbortSignal.timeout(options.timeoutMs ?? 10_000),
  ]);
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    for (;;) {
      signal.throwIfAborted();
      const response = await fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.token}`,
          "Content-Type": "application/sdp",
          Accept: "application/sdp",
        },
        body: input.sdp,
        signal,
      });
      if (response.status !== 404) return response;
      await response.body?.cancel();
      await new Promise<void>((resolve, reject) => {
        const abort = (): void => {
          clearTimeout(timer);
          reject(signal.reason);
        };
        const timer = setTimeout(() => {
          signal.removeEventListener("abort", abort);
          resolve();
        }, options.retryMs ?? 250);
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
      });
    }
  } catch (error) {
    if (!input.signal.aborted && signal.aborted) {
      throw new Error("O vídeo não ficou disponível a tempo. Tente novamente; se persistir, teste a conexão da câmera.");
    }
    throw error;
  }
}
