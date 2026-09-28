"use client";
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
            Competência pela data de faturamento; sem essa data, a coleta é usada provisoriamente.
          </p>
        </div>
      </header>
      {data.freights.some(f => !f.billingDate) && <p className="form-error" role="status">Total provisório: há fretes sem data de faturamento. Abra o frete para corrigir a data.</p>}
      <div className="responsive-table">
        <table>
          <thead>
            <tr>
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
                <td data-label="Data">{formatDate(f.billingDate || f.pickupDate)}{!f.billingDate && <small>Coleta · faturamento pendente</small>}</td>
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
            {!data.freights.length && (
              <tr>
                <td colSpan={7}>Nenhum frete nesta competência. Confira o mês selecionado.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <header className="fleet-panel-header">
        <div>
          <h2>Comissões dos motoristas</h2>
          <p>
            {formatMoney(data.commissionCents)} gerados no período. Não indica
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
                  {formatDate(f.billingDate || f.pickupDate)} · {f.clientName} ·{" "}
                  {f.vehiclePlate} · {formatMoney(f.driverCommissionCents)}
                </button>
              </li>
            ))}
          </ul>
        </details>
      ))}
      {!data.drivers.length && (
        <p>Nenhuma comissão de motorista cadastrado nesta competência.</p>
      )}
    </section>
  );
}
