"use client";

import { useEffect, useState } from "react";
import { apiMutation } from "@/components/use-api";
import { Field } from "@/components/ui";

export function AdminSetupScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);

  useEffect(() => {
    fetch("/api/auth/setup", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as { setupRequired?: boolean; error?: string };
        if (!response.ok) throw new Error(payload.error || "Não foi possível verificar a configuração.");
        return payload;
      })
      .then((payload) => {
        if (!payload.setupRequired) {
          window.location.assign("/login");
          return;
        }
        setSetupRequired(true);
      })
      .catch((fetchError) => {
        setError(fetchError instanceof Error ? fetchError.message : "Não foi possível verificar a configuração.");
      })
      .finally(() => setLoading(false));
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await apiMutation("/api/auth/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          username: form.get("username"),
          password: form.get("password"),
          passwordConfirmation: form.get("passwordConfirmation"),
        }),
      });
      window.location.assign("/login?setup=done");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Não foi possível criar o administrador.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
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

  if (!setupRequired) {
    return (
      <main className="login-page">
        <section className="login-card">
          <span className="eyebrow">Sistema de fretes</span>
          <h1>Central Express</h1>
          {error ? (
            <>
              <p className="form-error" role="alert">{error}</p>
              <button className="button primary" onClick={() => window.location.reload()}>
                Tentar novamente
              </button>
            </>
          ) : (
            <p>Redirecionando para o login…</p>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <span className="login-logo" role="img" aria-label="Central Express" />
        <span className="eyebrow">Primeiro acesso</span>
        <h1>Configurar administrador</h1>
        <p>Crie o primeiro administrador. Você escolherá o usuário e a senha que serão usados no login.</p>
        <form className="form-stack" onSubmit={submit}>
          <Field label="Nome">
            <input name="name" autoComplete="name" autoFocus required />
          </Field>
          <Field label="Usuário">
            <input name="username" autoComplete="username" required minLength={3} maxLength={40} />
          </Field>
          <Field label="Senha">
            <input name="password" type="password" autoComplete="new-password" required minLength={6} />
          </Field>
          <Field label="Confirmar senha">
            <input name="passwordConfirmation" type="password" autoComplete="new-password" required minLength={6} />
          </Field>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button primary" disabled={saving}>
            {saving ? "Criando administrador…" : "Criar administrador"}
          </button>
        </form>
      </section>
    </main>
  );
}
