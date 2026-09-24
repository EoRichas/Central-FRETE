"use client";
import { useState } from "react";
import { apiMutation, useApi } from "@/components/use-api";
export function StorageCleanupNotice() {
  const api = useApi<{ pending: number }>("/api/storage-cleanup");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!api.data?.pending) return null;
  return (
    <div role="status" className="success-banner">
      A exclusão foi concluída. {api.data.pending} arquivo(s) aguardam remoção.
      <button
        className="text-button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await apiMutation("/api/storage-cleanup", { method: "POST" });
            api.refresh();
          } catch (error) {
            setError(
              error instanceof Error ? error.message : "Tente novamente.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Removendo…" : "Tentar remover arquivos novamente"}
      </button>
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
