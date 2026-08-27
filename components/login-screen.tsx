"use client";

import { useEffect, useState } from "react";
import { apiMutation } from "@/components/use-api";
import { Field } from "@/components/ui";

export function LoginScreen() {
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupDone] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("setup") === "done",
  );

  useEffect(() => {
    fetch("/api/auth/setup", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as { setupRequired?: boolean; error?: string };
        if (!response.ok) throw new Error(payload.error || "Não foi possível verificar a configuração.");
        return payload;
      })
      .then((payload) => {
        if (payload.setupRequired) window.location.assign("/configurar-admin");
      })
      .catch((fetchError) => {
        setError(fetchError instanceof Error ? fetchError.message : "Não foi possível verificar a configuração.");
      })
      .finally(() => setCheckingSetup(false));
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await apiMutation("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: form.get("username"),
          password: form.get("password"),
        }),
      });
      const returnTo = new URLSearchParams(window.location.search).get("return_to");
      window.location.assign(
        returnTo?.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/inicio",
      );
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Erro ao entrar.");
    } finally {
      setSaving(false);
    }
  }

  if (checkingSetup) {
    return (
      <main className="login-page">
        <section className="login-card">
          <span className="eyebrow">Sistema de fretes</span>
          <h1>Central Express</h1>
          <p>Verificando a configuração inicial…</p>
        </section>
      </main>
    );
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <span className="login-logo" role="img" aria-label="Central Express" />
        <span className="eyebrow">Sistema de fretes</span>
        <h1>Central Express</h1>
        <p>Entre com o usuário e a senha cadastrados pelo administrador.</p>
        {setupDone && <p className="form-success" role="status">Administrador criado. Agora entre com o usuário e a senha escolhidos.</p>}
        <form className="form-stack" onSubmit={submit}>
          <Field label="Usuário">
            <input name="username" autoComplete="username" autoFocus required />
          </Field>
          <Field label="Senha">
            <input name="password" type="password" autoComplete="current-password" required />
          </Field>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button primary" disabled={saving}>
            {saving ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </section>
    </main>
  );
}
