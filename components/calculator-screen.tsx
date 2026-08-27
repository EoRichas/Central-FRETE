"use client";

import { useMemo, useState } from "react";
import type {
  CalculatorDocument,
  CalculatorLine,
} from "@/lib/domain/calculator";
import {
  calculateCalculator,
  isDerivedCalculatorLine,
} from "@/lib/domain/calculator";
import { formatMoney, formatPercent } from "@/lib/format";
import {
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
} from "@/components/ui";
import { apiMutation, useApi } from "@/components/use-api";

type CalculatorResponse = {
  document: CalculatorDocument;
  persisted: boolean;
  updatedAt: string | null;
  updatedByName: string | null;
};

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

export function CalculatorScreen() {
  const api = useApi<CalculatorResponse>("/api/tools/calculator");
  if (api.loading) return <LoadingState label="Carregando a calculadora…" />;
  if (api.error) return <ErrorState message={api.error} retry={api.refresh} />;
  if (!api.data) return null;
  return (
    <CalculatorEditor
      key={api.data.updatedAt ?? "default"}
      initial={api.data}
    />
  );
}

function CalculatorEditor({ initial }: { initial: CalculatorResponse }) {
  const [document, setDocument] = useState(initial.document);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const result = useMemo(() => calculateCalculator(document), [document]);

  function updateDocument<K extends keyof CalculatorDocument>(
    key: K,
    value: CalculatorDocument[K],
  ) {
    setDocument((current) => ({ ...current, [key]: value }));
    setMessage(null);
  }

  function updateLine(id: CalculatorLine["id"], patch: Partial<CalculatorLine>) {
    setDocument((current) => ({
      ...current,
      lines: current.lines.map((line) =>
        line.id === id ? { ...line, ...patch } : line,
      ),
    }));
    setMessage(null);
  }

  async function persist(nextDocument: CalculatorDocument, successMessage: string) {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await apiMutation<{ document: CalculatorDocument }>(
        "/api/tools/calculator",
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
          : "Não foi possível salvar a calculadora.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function restoreDefaults() {
    const confirmed = window.confirm(
      "Restaurar todos os valores do arquivo original da calculadora?",
    );
    if (!confirmed) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await apiMutation<{ document: CalculatorDocument }>(
        "/api/tools/calculator",
        { method: "POST" },
      );
      setDocument(response.document);
      setMessage("Modelo original restaurado.");
    } catch (restoreError) {
      setError(
        restoreError instanceof Error
          ? restoreError.message
          : "Não foi possível restaurar o modelo original.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Ferramenta de vendas"
        title="Calculadora"
        description="Modelo editável baseado na planilha enviada. Seguro, ICMS, comissão, nota fiscal e totais são recalculados automaticamente."
        actions={
          <>
            <button
              type="button"
              className="button secondary"
              disabled={saving}
              onClick={restoreDefaults}
            >
              Restaurar modelo
            </button>
            <button
              type="button"
              className="button primary"
              disabled={saving}
              onClick={() => persist(document, "Calculadora salva para o seu usuário.")}
            >
              {saving ? "Salvando…" : "Salvar calculadora"}
            </button>
          </>
        }
      />
      {message && <p className="success-banner" role="status">{message}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}

      <section className="panel calculator-sheet">
        <div className="calculator-brand-row">
          <div>
            <span className="brand-logo calculator-brand-logo" aria-hidden="true" />
            <strong>CENTRAL EXPRESS TRANSPORTES</strong>
          </div>
          <b>VENDAS</b>
        </div>

        <div className="calculator-identification">
          <Field label="Nome do colaborador">
            <input
              value={document.collaboratorName}
              onChange={(event) =>
                updateDocument("collaboratorName", event.target.value)
              }
            />
          </Field>
          <Field label="Função">
            <input
              value={document.functionName}
              onChange={(event) => updateDocument("functionName", event.target.value)}
            />
          </Field>
        </div>

        <div className="calculator-table-wrap">
          <table className="calculator-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Descrição</th>
                <th>Adiantamento</th>
                <th>Valor</th>
                <th>Observação</th>
              </tr>
            </thead>
            <tbody>
              {document.lines.map((line) => {
                const derived = isDerivedCalculatorLine(line.id);
                return (
                  <tr key={line.id}>
                    <td data-label="Código">
                      <input
                        aria-label={`Código de ${line.description}`}
                        value={line.code}
                        onChange={(event) =>
                          updateLine(line.id, { code: event.target.value })
                        }
                      />
                    </td>
                    <td data-label="Descrição">
                      <input
                        aria-label={`Descrição de ${line.code}`}
                        value={line.description}
                        onChange={(event) =>
                          updateLine(line.id, { description: event.target.value })
                        }
                      />
                    </td>
                    <td data-label="Adiantamento">
                      <div className="money-field compact calculator-money-input">
                        <span>R$</span>
                        <input
                          aria-label={`Adiantamento de ${line.description}`}
                          type="number"
                          min="0"
                          step="0.01"
                          value={inputMoney(line.advanceCents)}
                          onChange={(event) =>
                            updateLine(line.id, {
                              advanceCents: centsFromInput(event.target.value),
                            })
                          }
                        />
                      </div>
                    </td>
                    <td data-label="Valor">
                      {derived ? (
                        <output>{formatMoney(result.lineValues[line.id])}</output>
                      ) : (
                        <div className="money-field compact calculator-money-input">
                          <span>R$</span>
                          <input
                            aria-label={`Valor de ${line.description}`}
                            type="number"
                            min="0"
                            step="0.01"
                            value={inputMoney(line.valueCents)}
                            onChange={(event) =>
                              updateLine(line.id, {
                                valueCents: centsFromInput(event.target.value),
                              })
                            }
                          />
                        </div>
                      )}
                    </td>
                    <td data-label="Observação">
                      {line.observationBasisPoints === null ? (
                        <span className="calculator-empty-cell">—</span>
                      ) : (
                        <div className="percent-field">
                          <input
                            aria-label={`Percentual de ${line.description}`}
                            type="number"
                            min="0"
                            max="99.99"
                            step="0.01"
                            value={(line.observationBasisPoints / 100).toFixed(2)}
                            onChange={(event) =>
                              updateLine(line.id, {
                                observationBasisPoints: basisPointsFromInput(
                                  event.target.value,
                                ),
                              })
                            }
                          />
                          <span>%</span>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="calculator-summary-grid">
          <Field label="Mensagens">
            <textarea
              rows={5}
              value={document.message}
              onChange={(event) => updateDocument("message", event.target.value)}
            />
          </Field>
          <dl>
            <div>
              <dt>Total do adiantamento</dt>
              <dd>{formatMoney(result.advanceTotalCents)}</dd>
            </div>
            <div>
              <dt>Valor total</dt>
              <dd>{formatMoney(result.totalCents)}</dd>
            </div>
            <div>
              <dt>Valor com nota fiscal</dt>
              <dd>{formatMoney(result.invoiceTotalCents)}</dd>
            </div>
            <div className="calculator-net-result">
              <dt>Líquido a receber</dt>
              <dd>{formatMoney(result.netReceivableCents)}</dd>
            </div>
          </dl>
        </div>

        <div className="calculator-footer-inputs">
          <div>
            <span>Subtotal</span>
            <strong>{formatMoney(result.subtotalCents)}</strong>
          </div>
          <div>
            <span>Custo operação</span>
            <strong>{formatMoney(result.operationCostCents)}</strong>
          </div>
          <Field label="Base ICMS">
            <div className="money-field compact">
              <span>R$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={inputMoney(document.icmsBaseCents)}
                onChange={(event) =>
                  updateDocument("icmsBaseCents", centsFromInput(event.target.value))
                }
              />
            </div>
          </Field>
          <Field label="Fipe">
            <div className="money-field compact">
              <span>R$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={inputMoney(document.fipeCents)}
                onChange={(event) =>
                  updateDocument("fipeCents", centsFromInput(event.target.value))
                }
              />
            </div>
          </Field>
          <Field label="Seguro">
            <input
              value={document.insurer}
              onChange={(event) => updateDocument("insurer", event.target.value)}
            />
          </Field>
          <Field label="Prazo">
            <input
              type="number"
              min="0"
              max="365"
              value={document.deadlineDays}
              onChange={(event) =>
                updateDocument(
                  "deadlineDays",
                  Math.max(0, Math.min(365, Number(event.target.value) || 0)),
                )
              }
            />
          </Field>
        </div>
        <p className="calculator-formula-note">
          Comissão {formatPercent(document.lines.find((line) => line.id === "seller-commission")?.observationBasisPoints ?? 0)} com gross-up, conforme a fórmula da planilha original.
          {initial.updatedAt && ` Última gravação por ${initial.updatedByName ?? "usuário do sistema"}.`}
        </p>
      </section>
    </>
  );
}
