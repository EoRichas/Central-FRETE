"use client";
import Link from "next/link";
import type { FleetBillingData, FleetFreight } from "@/lib/domain/fleet";
import { formatMoney, formatDate } from "@/lib/format";
export function FleetBilling({
  data,
  onOpen,
}: {
  data: FleetBillingData;
  onOpen: (freight: FleetFreight) => void;
}) {
  return (
    <section className="panel table-panel">
      <header className="fleet-panel-header">
        <div>
          <h2>Faturamento do período</h2>
          <p>
            {formatMoney(data.revenueCents)} · {data.freightCount} fretes.
            Somente fretes com data de faturamento ou status Faturado e vendas Frota com data de faturamento. Vendas vinculadas contam uma vez.
          </p>
        </div>
      </header>
      {data.freights.some(f => !f.billingDate) && <p className="form-error" role="status">Há fretes marcados como Faturado sem data. Eles usam provisoriamente o mês da coleta; preencha a data para corrigir a competência.</p>}
      <div className="responsive-table">
        <table>
          <thead>
            <tr>
              <th>Venda</th>
              <th>Data</th>
              <th>Cliente</th>
              <th>Veículo</th>
              <th>Motorista</th>
              <th>Valor</th>
              <th>Situação</th>
              <th>Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {data.freights.map((f) => (
              <tr key={f.id}>
                <td data-label="Venda">{f.saleNumber}</td>
                <td data-label="Data">{formatDate(f.billingDate || f.pickupDate)}{!f.billingDate && <small>Faturado · data não informada</small>}</td>
                <td data-label="Cliente">{f.clientName}</td>
                <td data-label="Veículo">{f.vehiclePlate}</td>
                <td data-label="Motorista">{f.driverName}</td>
                <td data-label="Valor">{formatMoney(f.freightAmountCents)}</td>
                <td data-label="Situação">
                  {f.paymentStatus === "PAGO" ? "Pago" : "Em aberto"}
                </td>
                <td data-label="Detalhes">
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => onOpen(f)}
                  >
                    Abrir frete
                  </button>
                </td>
              </tr>
            ))}
            {data.sales.map(s => <tr key={`sale:${s.id}`}>
              <td data-label="Venda">{s.saleNumber}</td>
              <td data-label="Data">{formatDate(s.billingDate)}<small>Venda Frota</small></td>
              <td data-label="Cliente">{s.clientName || 'Não informado'}</td>
              <td data-label="Veículo">Não informado</td><td data-label="Motorista">Não informado</td>
              <td data-label="Valor">{formatMoney(s.freightAmountCents)}</td>
              <td data-label="Situação"><Link href={`/vendas/${s.id}`}>Ver recebimentos</Link></td>
              <td data-label="Detalhes"><Link className="text-button" href={`/vendas/${s.id}`}>Abrir venda</Link></td>
            </tr>)}
            {!data.freights.length && !data.sales.length && (
              <tr>
                <td colSpan={8}>Nenhum frete nesta competência. Confira o mês selecionado.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <header className="fleet-panel-header">
        <div>
          <h2>Comissões dos motoristas</h2>
          <p>
            {formatMoney(data.commissionCents)} gerados pelos fretes coletados no mês, mesmo sem faturamento. Não indica
            pagamento da comissão ao motorista.
          </p>
        </div>
      </header>
      {data.drivers.map((driver) => (
        <details key={driver.id} className="fleet-commission-detail">
          <summary>
            {driver.name} · {formatMoney(driver.commissionCents)} ·{" "}
            {driver.freights.length} fretes
          </summary>
          <ul>
            {driver.freights.map((f) => (
              <li key={f.id}>
                <button className="text-button" onClick={() => onOpen(f)}>
                  {formatDate(f.pickupDate)} · {f.clientName} ·{" "}
                  {f.vehiclePlate} · {formatMoney(f.driverCommissionCents)}
                </button>
              </li>
            ))}
          </ul>
        </details>
      ))}
      {!data.drivers.length && (
        <p>Nenhuma comissão de motorista nesta competência.</p>
      )}
    </section>
  );
}
