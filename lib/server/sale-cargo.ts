import type { CurrentUser, SaleRecord } from '@/lib/contracts';
import { ApiError, queryFirst } from '@/lib/server/d1';
import { boundedText, parseCargoVehicles } from '@/lib/server/cargo-validation';

export async function parseSaleCargo(payload: Record<string, unknown>, user: CurrentUser, previous?: SaleRecord) {
  const fleetFreightId = payload.fleetFreightId === undefined ? previous?.fleetFreightId ?? null : boundedText(payload.fleetFreightId, 'Frete da frota', 80);
  if (fleetFreightId && fleetFreightId !== previous?.fleetFreightId) {
    if (user.role !== 'ADMIN') throw new ApiError(403, 'Somente o administrador pode vincular uma operação da Frota.');
    if (!await queryFirst('select id from fleet_freights where id=?', [fleetFreightId])) throw new ApiError(400, 'Frete da frota não encontrado.');
  }
  const cargoVehicles = parseCargoVehicles(payload.cargoVehicles === undefined ? previous?.cargoVehicles : payload.cargoVehicles, payload.vehicle ?? previous?.vehicle, payload.plate ?? previous?.plate);
  const paymentCondition = boundedText(payload.paymentCondition === undefined ? previous?.paymentCondition : payload.paymentCondition, 'Condição de pagamento', 200);
  return { fleetFreightId, cargoVehicles, paymentCondition };
}
