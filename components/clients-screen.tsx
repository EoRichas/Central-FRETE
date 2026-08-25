"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ClientRecord } from "@/lib/contracts";
import { ClientFormModal } from "@/components/client-form-modal";
import { Icons } from "@/components/icons";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
} from "@/components/ui";
import { useApi } from "@/components/use-api";

function formatDocument(value: string | null) {
  if (!value) return "SEM DOCUMENTO";
  if (value.length === 11) {
    return value.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  if (value.length === 14) {
    return value.replace(
      /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,
      "$1.$2.$3/$4-$5",
    );
  }
  return value;
}

export function ClientsScreen() {
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const clientsApi = useApi<{ clients: ClientRecord[] }>("/api/clients");
  const clients = useMemo(
    () =>
      (clientsApi.data?.clients ?? []).filter(
        (client) =>
          !query ||
          [client.legalName, client.tradeName, client.cpfCnpj].some((value) =>
            value?.toUpperCase().includes(query.toUpperCase()),
          ),
      ),
    [clientsApi.data, query],
  );

  return (
    <>
      <PageHeader
        eyebrow="Relacionamento"
        title="Clientes"
        description="Cadastros, contatos e endereços de empresa, coleta e entrega."
        actions={
          <button className="button primary" onClick={() => setModalOpen(true)}>
            <Icons.plus /> Novo cliente
          </button>
        }
      />
      <section className="filter-panel compact">
        <label>
          <span>Pesquisar</span>
          <div className="search-input">
            <Icons.search />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nome, fantasia ou documento"
            />
          </div>
        </label>
        <div className="filter-stat">
          <strong>{clients.length}</strong>
          <span>clientes encontrados</span>
        </div>
      </section>
      {clientsApi.loading && <LoadingState label="Carregando clientes…" />}
      {clientsApi.error && (
        <ErrorState message={clientsApi.error} retry={clientsApi.refresh} />
      )}
      {!clientsApi.loading && !clientsApi.error && clients.length === 0 && (
        <EmptyState
          title="Nenhum cliente cadastrado"
          description="Cadastre o primeiro cliente para vinculá-lo às vendas."
          action="Cadastrar cliente"
        />
      )}
      {clients.length > 0 && (
        <section className="client-list" aria-label="Lista de clientes">
          <div className="client-list-header" aria-hidden="true">
            <span>Cliente</span>
            <span>Responsável</span>
            <span>Telefone</span>
            <span>Localidade</span>
            <span>Situação</span>
            <span />
          </div>
          {clients.map((client) => {
            const primary =
              client.contacts.find((contact) => contact.isPrimary) ??
              client.contacts[0];
            const address =
              client.addresses.find((item) => item.isPrimary) ??
              client.addresses[0];
            return (
              <Link
                href={`/clientes/${client.id}`}
                className="client-list-row"
                key={client.id}
              >
                <div className="client-list-identity">
                  <span className="client-avatar">
                    {client.legalName.slice(0, 2)}
                  </span>
                  <div>
                    <strong>{client.legalName}</strong>
                    <small>
                      {client.tradeName || formatDocument(client.cpfCnpj)}
                    </small>
                  </div>
                </div>
                <div className="client-list-cell" data-label="Responsável">
                  <strong>{primary?.name ?? "NÃO INFORMADO"}</strong>
                  <small>{primary?.email ?? "SEM E-MAIL"}</small>
                </div>
                <div className="client-list-cell" data-label="Telefone">
                  <strong>{primary?.phone ?? "—"}</strong>
                  <small>
                    {primary?.whatsapp
                      ? `WhatsApp ${primary.whatsapp}`
                      : "SEM WHATSAPP"}
                  </small>
                </div>
                <div className="client-list-cell" data-label="Localidade">
                  <strong>
                    {address ? `${address.city}/${address.state}` : "—"}
                  </strong>
                  <small>
                    {address
                      ? [address.street, address.number]
                          .filter(Boolean)
                          .join(", ")
                      : "SEM ENDEREÇO"}
                  </small>
                </div>
                <div className="client-list-status">
                  <StatusBadge status={client.active ? "ATIVO" : "INATIVO"} />
                </div>
                <span className="client-list-action" aria-hidden="true">
                  <Icons.chevron />
                </span>
              </Link>
            );
          })}
        </section>
      )}
      <ClientFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={() => clientsApi.refresh()}
      />
    </>
  );
}
