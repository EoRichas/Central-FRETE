import type { CurrentUser, SaleRecord } from '@/lib/contracts';
import { ApiError, queryFirst } from '@/lib/server/d1';
import { boundedText, parseCargoVehicles } from '@/lib/server/cargo-validation';

export async function parseSaleCargo(payload: Record<string, unknown>, user: CurrentUser, previous?: SaleRecord) {
  const fleetFreightId = payload.fleetFreightId === undefined ? previous?.fleetFreightId ?? null : boundedText(payload.fleetFreightId, 'Frete da frota', 80);
  if (fleetFreightId && fleetFreightId !== previous?.fleetFreightId) {
    if (user.role !== 'ADMIN') throw new ApiError(403, 'Somente o administrador pode vincular uma operação da Frota.');
    const freight = await queryFirst<{saleNumber:string}>('select sale_number as saleNumber from fleet_freights where id=?', [fleetFreightId]);
    if (!freight) throw new ApiError(400, 'Frete da frota não encontrado.');
    if (previous && previous.saleNumber !== freight.saleNumber) throw new ApiError(400, 'Esta venda e o frete possuem números diferentes. O vínculo não pode alterar a numeração.');
  }
  const cargoVehicles = parseCargoVehicles(payload.cargoVehicles === undefined ? previous?.cargoVehicles : payload.cargoVehicles, payload.vehicle ?? previous?.vehicle, payload.plate ?? previous?.plate);
  return { fleetFreightId, cargoVehicles };
}
