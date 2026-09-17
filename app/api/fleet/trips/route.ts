import { authorize } from '@/lib/server/auth';
import { getD1, jsonError } from '@/lib/server/d1';
import { resolveFleetReferences } from '@/lib/server/fleet-mutations';
import { parseTrip } from '@/lib/server/fleet-results-validation';
import { asObject } from '@/lib/server/validation';
export async function POST(request: Request) {
  try {
    const user = await authorize(request, ['ADMIN', 'GERENCIA']);
    const data = parseTrip(asObject(await request.json()));
    await resolveFleetReferences(data.vehicleId, data.driverId);
    const id = crypto.randomUUID();
    const db = await getD1();
    await db.batch([
      db.prepare(`insert into fleet_trips(id,name,vehicle_id,driver_id,operation_date,fuel_cost_cents,toll_cents,other_cost_cents,notes,created_by)
        values (?,?,?,?,?,?,?,?,?,?)`).bind(id,data.name,data.vehicleId,data.driverId,data.operationDate,data.fuelCostCents,data.tollCents,data.otherCostCents,data.notes,user.id),
      db.prepare(`insert into audit_logs(id,entity_type,entity_id,action,actor_user_id,actor_email,new_value,request_id)
        values (?,'FLEET_TRIP',?,'CREATED',?,?,?,?)`).bind(crypto.randomUUID(),id,user.id,user.email,JSON.stringify(data),crypto.randomUUID()),
    ]);
    return Response.json({ id }, { status: 201 });
  } catch (error) { return jsonError(error); }
}
