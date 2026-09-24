import type { FleetVehicle } from "@/lib/domain/fleet";
import { formatMoney } from "@/lib/format";
export function FleetVehicleHistory({ vehicle }: { vehicle: FleetVehicle }) {
  return (
    <section>
      <h3>Histórico mensal · {vehicle.plate}</h3>
      <p>
        Referência gerencial do caminhão. Estes valores não são descontados dos
        fretes.
      </p>
      <div className="responsive-table">
        <table>
          <thead>
            <tr>
              <th>Competência</th>
              <th>Quilometragem</th>
              <th>Custo mensal</th>
              <th>Custo / km</th>
              <th>Referência histórica</th>
            </tr>
          </thead>
          <tbody>
            {vehicle.costs.map((cost) => (
              <tr key={cost.id}>
                <td data-label="Competência">{cost.competency}</td>
                <td data-label="Quilometragem">
                  {(cost.distanceMeters / 1000).toLocaleString("pt-BR")} km
                </td>
                <td data-label="Custo mensal">
                  {formatMoney(cost.monthlyCostCents)}
                </td>
                <td data-label="Custo / km">
                  {cost.distanceMeters > 0
                    ? formatMoney(cost.costPerKmCents)
                    : "—"}
                </td>
                <td data-label="Referência histórica">
                  {cost.includeInRateAverage
                    ? "Integrava a média"
                    : "Fora da média histórica"}
                </td>
              </tr>
            ))}
            {!vehicle.costs.length && (
              <tr>
                <td colSpan={5}>Nenhum histórico mensal registrado.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
