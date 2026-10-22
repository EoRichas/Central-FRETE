"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiMutation } from '@/components/use-api';
import { Field } from '@/components/ui';

export function PasswordChangeForm() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form);
    setError(null);
    if (payload.newPassword !== payload.passwordConfirmation) { setError('A confirmação deve ser igual à nova senha.'); return; }
    setSaving(true);
    try {
      await apiMutation('/api/auth/password', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(payload)});
      router.replace('/login?passwordChanged=1');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível trocar a senha.');
      setSaving(false);
    }
  }
  return <section className="panel settings-section">
    <header><div><span className="eyebrow">Minha conta</span><h2>Trocar senha</h2><p>Confirme sua senha atual. Após a troca, entre novamente com a nova senha.</p></div></header>
    <form className="form-stack" onSubmit={submit}>
      <div className="form-grid three">
        <Field label="Senha atual"><input type="password" name="currentPassword" autoComplete="current-password" maxLength={4096} required disabled={saving} /></Field>
        <Field label="Nova senha"><input type="password" name="newPassword" autoComplete="new-password" minLength={6} maxLength={4096} required disabled={saving} /></Field>
        <Field label="Confirmar nova senha"><input type="password" name="passwordConfirmation" autoComplete="new-password" minLength={6} maxLength={4096} required disabled={saving} /></Field>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions"><button className="button primary" disabled={saving}>{saving ? 'Alterando…' : 'Trocar senha'}</button></div>
    </form>
  </section>;
}
