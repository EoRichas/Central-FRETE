"use client";

import { useState } from "react";
import type { Role } from "@/lib/contracts";
import {
  ErrorState,
  Field,
  LoadingState,
  Modal,
  PageHeader,
  StatusBadge,
} from "@/components/ui";
import { apiMutation, useApi } from "@/components/use-api";

type UserRow = {
  id: string;
  name: string;
  email: string;
  username: string | null;
  pixDetails: string | null;
  role: Role;
  active: boolean;
  hasPassword: boolean;
};

function fallbackUsername(user: UserRow) {
  return user.username ?? user.email.split("@")[0]?.toLowerCase() ?? "";
}

function profileLabel(role: Role) {
  return role === "GERENCIA" ? "PERFIL REMOVIDO" : role;
}

export function SettingsScreen() {
  const usersApi = useApi<{ users: UserRow[] }>("/api/users");
  const [savingUser, setSavingUser] = useState(false);
  const [deletingUser, setDeletingUser] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function addUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setSavingUser(true);
    setError(null);
    setMessage(null);
    const form = new FormData(formElement);
    try {
      await apiMutation("/api/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form)),
      });
      formElement.reset();
      usersApi.refresh();
      setMessage("Usuário autorizado com login e senha.");
    } catch (userError) {
      setError(
        userError instanceof Error
          ? userError.message
          : "Erro ao cadastrar usuário.",
      );
    } finally {
      setSavingUser(false);
    }
  }

  async function editUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingUser) return;
    setSavingUser(true);
    setError(null);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    try {
      await apiMutation(`/api/users/${editingUser.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form)),
      });
      setEditingUser(null);
      usersApi.refresh();
      setMessage("Acesso atualizado com sucesso.");
    } catch (userError) {
      setError(
        userError instanceof Error
          ? userError.message
          : "Erro ao atualizar usuário.",
      );
    } finally {
      setSavingUser(false);
    }
  }

  async function deleteUser(user: UserRow) {
    const confirmed = window.confirm(
      `Excluir definitivamente o acesso de ${user.name}? O histórico das vendas será preservado, mas esse login deixará de existir.`,
    );
    if (!confirmed) return;
    setDeletingUser(user.id);
    setError(null);
    setMessage(null);
    try {
      await apiMutation(`/api/users/${user.id}`, { method: "DELETE" });
      usersApi.refresh();
      setMessage("Acesso excluído com sucesso.");
    } catch (userError) {
      setError(
        userError instanceof Error
          ? userError.message
          : "Erro ao excluir o acesso.",
      );
    } finally {
      setDeletingUser(null);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Administração"
        title="Configurações"
        description="Gerencie somente logins, senhas, perfis e acesso dos usuários."
      />
      {message && <p className="success-banner" role="status">{message}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <section className="panel settings-section">
        <header>
          <div>
            <span className="eyebrow">Acesso</span>
            <h2>Usuários, senhas e perfis</h2>
            <p>Somente o ADMIN pode criar ou editar acessos.</p>
          </div>
        </header>
        <form className="inline-user-form" onSubmit={addUser}>
          <Field label="Nome"><input name="name" required /></Field>
          <Field label="Usuário"><input name="username" autoComplete="off" required /></Field>
          <Field label="Senha"><input name="password" type="password" minLength={6} autoComplete="new-password" required /></Field>
          <Field label="E-mail"><input name="email" type="email" required /></Field>
          <Field label="Perfil">
            <select name="role" defaultValue="VENDEDOR">
              <option value="ADMIN">Admin</option>
              <option value="VENDEDOR">Vendedor</option>
              <option value="FINANCEIRO">Financeiro</option>
            </select>
          </Field>
          <Field label="PIX do vendedor" hint="Opcional; usado na aba Comissões.">
            <input name="pixDetails" placeholder="Chave ou dados PIX" />
          </Field>
          <button className="button secondary" disabled={savingUser}>
            {savingUser ? "Adicionando…" : "Criar acesso"}
          </button>
        </form>
        {usersApi.loading && <LoadingState label="Carregando usuários…" />}
        {usersApi.error && (
          <ErrorState message={usersApi.error} retry={usersApi.refresh} />
        )}
        {usersApi.data && (
          <div className="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Usuário</th>
                  <th>E-mail</th>
                  <th>Perfil</th>
                  <th>Login</th>
                  <th>Situação</th>
                  <th><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {usersApi.data.users.map((user) => (
                  <tr key={user.id}>
                    <td data-label="Nome"><strong>{user.name}</strong></td>
                    <td data-label="Usuário">{user.username ?? "NÃO DEFINIDO"}</td>
                    <td data-label="E-mail">{user.email}</td>
                    <td data-label="Perfil">{profileLabel(user.role)}</td>
                    <td data-label="Login">
                      <StatusBadge status={user.hasPassword ? "CONFIGURADO" : "SEM SENHA"} />
                    </td>
                    <td data-label="Situação"><StatusBadge status={user.active ? "ATIVO" : "INATIVO"} /></td>
                    <td data-label="Ações"><div className="table-actions">
                      <button
                        type="button"
                        className="button secondary compact-button"
                        onClick={() => {
                          setError(null);
                          setEditingUser(user);
                        }}
                      >
                        Editar acesso
                      </button>
                      <button
                        type="button"
                        className="button danger compact-button"
                        disabled={deletingUser === user.id}
                        onClick={() => deleteUser(user)}
                      >
                        {deletingUser === user.id ? "Excluindo…" : "Excluir acesso"}
                      </button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal
        open={editingUser !== null}
        onClose={() => setEditingUser(null)}
        title="Editar acesso"
        description="Altere login, perfil, situação, PIX ou redefina a senha."
      >
        {editingUser && (
          <form
            key={editingUser.id}
            className="modal-body form-stack"
            onSubmit={editUser}
          >
            <Field label="Nome">
              <input name="name" defaultValue={editingUser.name} required />
            </Field>
            <Field label="Usuário">
              <input name="username" defaultValue={fallbackUsername(editingUser)} required />
            </Field>
            <Field label="E-mail">
              <input name="email" type="email" defaultValue={editingUser.email} required />
            </Field>
            <Field label="Perfil">
              <select
                name="role"
                defaultValue={editingUser.role === "GERENCIA" ? "" : editingUser.role}
                required
              >
                {editingUser.role === "GERENCIA" && (
                  <option value="" disabled>Selecione um novo perfil</option>
                )}
                <option value="ADMIN">Admin</option>
                <option value="VENDEDOR">Vendedor</option>
                <option value="FINANCEIRO">Financeiro</option>
              </select>
            </Field>
            <Field label="Situação">
              <select name="active" defaultValue={editingUser.active ? "true" : "false"}>
                <option value="true">Ativo</option>
                <option value="false">Inativo</option>
              </select>
            </Field>
            <Field label="PIX do vendedor">
              <input name="pixDetails" defaultValue={editingUser.pixDetails ?? ""} placeholder="Chave ou dados PIX" />
            </Field>
            <Field label="Nova senha" hint="Deixe em branco para manter a senha atual.">
              <input name="password" type="password" minLength={6} autoComplete="new-password" />
            </Field>
            {error && <p className="form-error" role="alert">{error}</p>}
            <footer className="modal-actions">
              <button type="button" className="button secondary" onClick={() => setEditingUser(null)}>Cancelar</button>
              <button className="button primary" disabled={savingUser}>{savingUser ? "Salvando…" : "Salvar acesso"}</button>
            </footer>
          </form>
        )}
      </Modal>
    </>
  );
}
