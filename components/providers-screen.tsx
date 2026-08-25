"use client";

import { useState } from "react";
import { Icons } from "@/components/icons";
import {
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  Modal,
  PageHeader,
  StatusBadge,
} from "@/components/ui";
import { apiMutation, useApi } from "@/components/use-api";
import type { CurrentUser, ProviderRecord } from "@/lib/contracts";

export function ProvidersScreen() {
  const api = useApi<{ providers: ProviderRecord[] }>("/api/providers");
  const meApi = useApi<{ user: CurrentUser }>("/api/me");
  const [open, setOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ProviderRecord | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canManage = meApi.data?.user.role === "ADMIN";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setSaving(true);
    setError(null);
    const form = new FormData(formElement);
    try {
      await apiMutation(
        editingProvider
          ? `/api/providers/${editingProvider.id}`
          : "/api/providers",
        {
        method: editingProvider ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form)),
        },
      );
      formElement.reset();
      setOpen(false);
      setEditingProvider(null);
      api.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Erro ao salvar prestador.",
      );
    } finally {
      setSaving(false);
    }
  }

  function openNew() {
    setEditingProvider(null);
    setError(null);
    setOpen(true);
  }

  function openEdit(provider: ProviderRecord) {
    setEditingProvider(provider);
    setError(null);
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    setEditingProvider(null);
    setError(null);
  }

  async function deleteProvider(provider: ProviderRecord) {
    if (!window.confirm(`Excluir o prestador ${provider.name}?`)) return;
    setDeletingId(provider.id);
    setError(null);
    try {
      await apiMutation(`/api/providers/${provider.id}`, { method: "DELETE" });
      api.refresh();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Erro ao excluir prestador.",
      );
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Rede operacional"
        title="Prestadores"
        description="Empresas, contatos de referência e endereços dos pátios usados na operação."
        actions={canManage ? (
          <button className="button primary" onClick={openNew}>
            <Icons.plus /> Novo prestador
          </button>
        ) : null}
      />
      {error && !open && <p className="form-error" role="alert">{error}</p>}
      {api.loading && <LoadingState label="Carregando prestadores…" />}
      {api.error && <ErrorState message={api.error} retry={api.refresh} />}
      {!api.loading && !api.error && !api.data?.providers.length && (
        <EmptyState
          title="Nenhum prestador cadastrado"
          description="Cadastre a primeira empresa e o endereço do pátio."
        />
      )}
      {Boolean(api.data?.providers.length) && (
        <section className="panel table-panel">
          <div className="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Nome de referência</th>
                  <th>Endereço do pátio</th>
                  <th>Contato</th>
                  <th>CPF / CNPJ</th>
                  <th>Situação</th>
                  <th><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {api.data!.providers.map((provider) => (
                  <tr key={provider.id}>
                    <td data-label="Empresa">
                      <strong>{provider.name}</strong>
                    </td>
                    <td data-label="Nome de referência">
                      {provider.referenceName ?? "—"}
                    </td>
                    <td data-label="Endereço do pátio">
                      {provider.yardAddress ?? "—"}
                    </td>
                    <td data-label="Contato">
                      <strong>{provider.phone ?? "—"}</strong>
                      <small>{provider.email ?? ""}</small>
                    </td>
                    <td data-label="CPF / CNPJ">{provider.document ?? "—"}</td>
                    <td data-label="Situação">
                      <StatusBadge status={provider.active ? "ATIVO" : "INATIVO"} />
                    </td>
                    <td data-label="Ações">
                      {canManage && (
                        <div className="table-actions">
                          <button
                            type="button"
                            className="button secondary compact-button"
                            onClick={() => openEdit(provider)}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="button danger compact-button"
                            disabled={deletingId === provider.id}
                            onClick={() => deleteProvider(provider)}
                          >
                            {deletingId === provider.id ? "Excluindo…" : "Excluir"}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <Modal
        open={open}
        onClose={closeModal}
        title={editingProvider ? "Editar prestador" : "Novo prestador"}
        description={
          editingProvider
            ? "Atualize a empresa, a referência, o pátio e a situação cadastral."
            : "Cadastre a empresa, a referência usada pela equipe e o endereço do pátio."
        }
      >
        <form
          key={editingProvider?.id ?? "new-provider"}
          className="modal-body form-stack"
          onSubmit={submit}
        >
          <Field label="Empresa">
            <input name="companyName" defaultValue={editingProvider?.name ?? ""} required />
          </Field>
          <Field label="Nome de referência">
            <input name="referenceName" defaultValue={editingProvider?.referenceName ?? ""} required />
          </Field>
          <Field label="Endereço do pátio">
            <textarea name="yardAddress" rows={3} defaultValue={editingProvider?.yardAddress ?? ""} required />
          </Field>
          <div className="form-grid two">
            <Field label="CPF / CNPJ">
              <input name="document" inputMode="numeric" defaultValue={editingProvider?.document ?? ""} />
            </Field>
            <Field label="Telefone">
              <input name="phone" inputMode="tel" defaultValue={editingProvider?.phone ?? ""} />
            </Field>
          </div>
          <Field label="E-mail">
            <input name="email" type="email" defaultValue={editingProvider?.email ?? ""} />
          </Field>
          {editingProvider && (
            <Field label="Situação">
              <select name="active" defaultValue={editingProvider.active ? "true" : "false"}>
                <option value="true">Ativo</option>
                <option value="false">Inativo</option>
              </select>
            </Field>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <footer className="modal-actions">
            <button
              type="button"
              className="button secondary"
              onClick={closeModal}
            >
              Cancelar
            </button>
            <button className="button primary" disabled={saving}>
              {saving
                ? "Salvando…"
                : editingProvider
                  ? "Salvar alterações"
                  : "Cadastrar"}
            </button>
          </footer>
        </form>
      </Modal>
    </>
  );
}
