"use client";

import { useState } from "react";
import type {
  VacancyDirectionPrices,
  VacancyPriceDocument,
  VacancyPriceRow,
} from "@/lib/domain/vacancy-prices";
import { formatMoney } from "@/lib/format";
import {
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
} from "@/components/ui";
import { apiMutation, useApi } from "@/components/use-api";

type VacancyPriceResponse = {
  document: VacancyPriceDocument;
  canEdit: boolean;
  persisted: boolean;
  updatedAt: string | null;
  updatedByName: string | null;
};

type DirectionKey = "outgoing" | "returning";

function inputMoney(cents: number) {
  return (cents / 100).toFixed(2);
}

function centsFromInput(value: string) {
  const number = Number(value.replace(",", "."));
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) : 0;
}

function basisPointsFromInput(value: string) {
  const number = Number(value.replace(",", "."));
  return Number.isFinite(number) && number >= 0
    ? Math.min(Math.round(number * 100), 9_999)
    : 0;
}

export function VacancyPriceScreen() {
  const api = useApi<VacancyPriceResponse>("/api/tools/vacancy-prices");
  if (api.loading) return <LoadingState label="Carregando os preços por vaga…" />;
  if (api.error) return <ErrorState message={api.error} retry={api.refresh} />;
  if (!api.data) return null;
  return (
    <VacancyPriceEditor
      key={api.data.updatedAt ?? "default"}
      initial={api.data}
    />
  );
}

function VacancyPriceEditor({ initial }: { initial: VacancyPriceResponse }) {
  const [document, setDocument] = useState(initial.document);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function updateRow(id: string, patch: Partial<VacancyPriceRow>) {
    setDocument((current) => ({
      ...current,
      rows: current.rows.map((row) =>
        row.id === id ? { ...row, ...patch } : row,
      ),
    }));
    setMessage(null);
  }

  function updateDirection(
    id: string,
    direction: DirectionKey,
    patch: Partial<VacancyDirectionPrices>,
  ) {
    setDocument((current) => ({
      ...current,
      rows: current.rows.map((row) =>
        row.id === id
          ? { ...row, [direction]: { ...row[direction], ...patch } }
          : row,
      ),
    }));
    setMessage(null);
  }

  async function persist(nextDocument: VacancyPriceDocument, successMessage: string) {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await apiMutation<{ document: VacancyPriceDocument }>(
        "/api/tools/vacancy-prices",
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ document: nextDocument }),
        },
      );
      setDocument(response.document);
      setMessage(successMessage);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Não foi possível salvar a tabela de preços.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function restoreDefaults() {
    const confirmed = window.confirm(
      "Restaurar todos os destinos e valores do arquivo original?",
    );
    if (!confirmed) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await apiMutation<{ document: VacancyPriceDocument }>(
        "/api/tools/vacancy-prices",
        { method: "POST" },
      );
      setDocument(response.document);
      setMessage("Tabela original restaurada.");
    } catch (restoreError) {
      setError(
        restoreError instanceof Error
          ? restoreError.message
          : "Não foi possível restaurar o arquivo original.",
      );
    } finally {
      setSaving(false);
    }
  }

  function addDestination() {
    const id = `route-${crypto.randomUUID()}`;
    setDocument((current) => ({
      ...current,
      rows: [
        ...current.rows,
        {
          id,
          destination: "NOVO DESTINO",
          centralMarginCents: 0,
          insuranceBasisPoints: 0,
          outgoing: {
            baseHatchCents: 0,
            baseSuvCents: 0,
            hatchCents: 0,
            suvCents: 0,
          },
          returning: {
            baseHatchCents: 0,
            baseSuvCents: 0,
            hatchCents: 0,
            suvCents: 0,
          },
          deadline: "",
          served: true,
        },
      ],
    }));
    setMessage(null);
  }

  function removeDestination(row: VacancyPriceRow) {
    if (!window.confirm(`Excluir o destino ${row.destination}?`)) return;
    setDocument((current) => ({
      ...current,
      rows: current.rows.filter((item) => item.id !== row.id),
    }));
    setMessage(null);
  }

  const actions = initial.canEdit ? (
    <>
      <button
        type="button"
        className="button secondary"
        disabled={saving}
        onClick={addDestination}
      >
        Adicionar destino
      </button>
      <button
        type="button"
        className="button secondary"
        disabled={saving}
        onClick={restoreDefaults}
      >
        Restaurar arquivo
      </button>
      <button
        type="button"
        className="button primary"
        disabled={saving || !document.rows.length}
        onClick={() => persist(document, "Tabela de preços salva.")}
      >
        {saving ? "Salvando…" : "Salvar preços"}
      </button>
    </>
  ) : null;

  return (
    <>
      <PageHeader
        eyebrow="Tabela comercial"
        title="Preço Vaga"
        description="Valores de saída e retorno para São Bernardo do Campo, reproduzidos do arquivo enviado."
        actions={actions}
      />
      {message && <p className="success-banner" role="status">{message}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {!initial.canEdit && (
        <p className="info-banner">
          Consulta liberada. Somente Admin e Financeiro podem alterar esta tabela.
        </p>
      )}

      <section className="price-sheet-toolbar panel">
        <Field label="Valor de referência FIPE">
          <div className="money-field compact">
            <span>R$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              disabled={!initial.canEdit}
              value={inputMoney(document.fipeCents)}
              onChange={(event) => {
                setDocument((current) => ({
                  ...current,
                  fipeCents: centsFromInput(event.target.value),
                }));
                setMessage(null);
              }}
            />
          </div>
        </Field>
        <div>
          <span>Destinos cadastrados</span>
          <strong>{document.rows.length}</strong>
        </div>
        <div>
          <span>Referência atual</span>
          <strong>{formatMoney(document.fipeCents)}</strong>
        </div>
        <small>
          {initial.updatedAt
            ? `Última gravação por ${initial.updatedByName ?? "usuário do sistema"}.`
            : "Valores iniciais carregados do PDF enviado."}
        </small>
      </section>

      <div className="price-directions-grid">
        <DirectionTable
          title="Saindo de Sbcampo"
          direction="outgoing"
          rows={document.rows}
          canEdit={initial.canEdit}
          updateRow={updateRow}
          updateDirection={updateDirection}
          removeDestination={removeDestination}
        />
        <DirectionTable
          title="Voltando para Sbcampo"
          direction="returning"
          rows={document.rows}
          canEdit={initial.canEdit}
          updateRow={updateRow}
          updateDirection={updateDirection}
          removeDestination={removeDestination}
        />
      </div>
    </>
  );
}

function DirectionTable({
  title,
  direction,
  rows,
  canEdit,
  updateRow,
  updateDirection,
  removeDestination,
}: {
  title: string;
  direction: DirectionKey;
  rows: VacancyPriceRow[];
  canEdit: boolean;
  updateRow: (id: string, patch: Partial<VacancyPriceRow>) => void;
  updateDirection: (
    id: string,
    direction: DirectionKey,
    patch: Partial<VacancyDirectionPrices>,
  ) => void;
  removeDestination: (row: VacancyPriceRow) => void;
}) {
  return (
    <section className="panel price-direction-panel">
      <header>
        <div>
          <span className="eyebrow">Preço por rota</span>
          <h2>{title}</h2>
        </div>
      </header>
      <div className="responsive-table price-table-wrap">
        <table className="price-table">
          <thead>
            <tr>
              <th>Destino</th>
              <th>Margem Central</th>
              <th>% Seguro</th>
              <th>Valor vaga Hatch</th>
              <th>Valor vaga SUV</th>
              <th>Hatch</th>
              <th>SUV</th>
              <th>Prazo</th>
              {canEdit && <th><span className="sr-only">Ações</span></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const values = row[direction];
              return (
                <tr key={row.id}>
                  <td data-label="Destino" className="price-destination-cell">
                    <input
                      aria-label="Destino"
                      disabled={!canEdit}
                      value={row.destination}
                      onChange={(event) =>
                        updateRow(row.id, { destination: event.target.value })
                      }
                    />
                    {canEdit && (
                      <label className="served-toggle">
                        <input
                          type="checkbox"
                          checked={row.served}
                          onChange={(event) =>
                            updateRow(row.id, { served: event.target.checked })
                          }
                        />
                        Atendemos
                      </label>
                    )}
                  </td>
                  <td data-label="Margem Central">
                    <MoneyCell
                      value={row.centralMarginCents}
                      disabled={!canEdit}
                      label={`Margem Central de ${row.destination}`}
                      onChange={(value) =>
                        updateRow(row.id, { centralMarginCents: value })
                      }
                    />
                  </td>
                  <td data-label="Seguro">
                    <div className="percent-field compact-percent-field">
                      <input
                        aria-label={`Seguro de ${row.destination}`}
                        type="number"
                        min="0"
                        max="99.99"
                        step="0.01"
                        disabled={!canEdit}
                        value={(row.insuranceBasisPoints / 100).toFixed(2)}
                        onChange={(event) =>
                          updateRow(row.id, {
                            insuranceBasisPoints: basisPointsFromInput(
                              event.target.value,
                            ),
                          })
                        }
                      />
                      <span>%</span>
                    </div>
                  </td>
                  {!row.served ? (
                    <td data-label="Atendimento" colSpan={4} className="not-served-cell">
                      NÃO ATENDEMOS
                    </td>
                  ) : (
                    <>
                      <td data-label="Valor vaga Hatch">
                        <MoneyCell
                          value={values.baseHatchCents}
                          disabled={!canEdit}
                          label={`Valor da vaga Hatch para ${row.destination}`}
                          onChange={(value) =>
                            updateDirection(row.id, direction, {
                              baseHatchCents: value,
                            })
                          }
                        />
                      </td>
                      <td data-label="Valor vaga SUV">
                        <MoneyCell
                          value={values.baseSuvCents}
                          disabled={!canEdit}
                          label={`Valor da vaga SUV para ${row.destination}`}
                          onChange={(value) =>
                            updateDirection(row.id, direction, {
                              baseSuvCents: value,
                            })
                          }
                        />
                      </td>
                      <td data-label="Hatch">
                        <MoneyCell
                          value={values.hatchCents}
                          disabled={!canEdit}
                          label={`Preço Hatch para ${row.destination}`}
                          accent="red"
                          onChange={(value) =>
                            updateDirection(row.id, direction, { hatchCents: value })
                          }
                        />
                      </td>
                      <td data-label="SUV">
                        <MoneyCell
                          value={values.suvCents}
                          disabled={!canEdit}
                          label={`Preço SUV para ${row.destination}`}
                          accent="blue"
                          onChange={(value) =>
                            updateDirection(row.id, direction, { suvCents: value })
                          }
                        />
                      </td>
                    </>
                  )}
                  <td data-label="Prazo">
                    <input
                      aria-label={`Prazo para ${row.destination}`}
                      className="price-deadline-input"
                      disabled={!canEdit}
                      value={row.deadline}
                      onChange={(event) =>
                        updateRow(row.id, { deadline: event.target.value })
                      }
                    />
                  </td>
                  {canEdit && (
                    <td data-label="Ações">
                      <button
                        type="button"
                        className="text-button danger"
                        onClick={() => removeDestination(row)}
                      >
                        Excluir
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MoneyCell({
  value,
  disabled,
  label,
  accent,
  onChange,
}: {
  value: number;
  disabled: boolean;
  label: string;
  accent?: "red" | "blue";
  onChange: (value: number) => void;
}) {
  return (
    <div className={`price-money-cell ${accent ? `price-${accent}` : ""}`}>
      <span>R$</span>
      <input
        aria-label={label}
        type="number"
        min="0"
        step="0.01"
        disabled={disabled}
        value={inputMoney(value)}
        onChange={(event) => onChange(centsFromInput(event.target.value))}
      />
    </div>
  );
}
