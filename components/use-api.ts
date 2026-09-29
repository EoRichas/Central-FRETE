"use client";

import { CurrentUserContext } from "@/components/current-user-context";
import { fetchSession } from "@/lib/client/session-request";
import { useCallback, useContext, useEffect, useState } from "react";

export function useApi<T>(url: string | null) {
  const context = useContext(CurrentUserContext);
  const session = url === "/api/me" ? context : null;
  const sessionProvided = Boolean(session);
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);

  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    if (sessionProvided) return;
    const controller = new AbortController();
    if (url === null) {
      Promise.resolve().then(() => { if (!controller.signal.aborted) { setData(null); setError(null); setLoading(false); } });
      return () => controller.abort();
    }
    Promise.resolve().then(() => {
      if (!controller.signal.aborted) {
        setLoading(true);
        setError(null);
      }
    });
    (url === "/api/me" ? fetchSession() : fetch(url, { cache: "no-store", signal: controller.signal }))
      .then(async (response) => {
        const payload = (await response.json()) as T & { error?: string };
        if (!response.ok) throw new Error(payload.error || "Erro ao carregar.");
        return payload;
      })
      .then((payload) => { if (!controller.signal.aborted) setData(payload); })
      .catch((fetchError: unknown) => {
        if (controller.signal.aborted) return;
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") return;
        setError(fetchError instanceof Error ? fetchError.message : "Erro ao carregar.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [url, revision, sessionProvided]);

  if (session) return {data: {user:session.user} as T, error:null, loading:false, refresh:session.refresh, setData};
  return { data, error, loading, refresh, setData };
}

export async function apiMutation<T>(
  url: string,
  init: RequestInit,
): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Não foi possível concluir.");
  return payload;
}
