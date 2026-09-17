import { authorize } from '@/lib/server/auth';
import { ApiError, getD1, jsonError } from '@/lib/server/d1';
import { resolveFleetReferences } from '@/lib/server/fleet-mutations';
import { parseTrip } from '@/lib/server/fleet-results-validation';
import { asObject } from '@/lib/server/validation';
type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, context: Context) {
  try {
    const user = await authorize(request, ['ADMIN', 'GERENCIA']);
    const { id } = await context.params;
    const data = parseTrip(asObject(await request.json()));
    await resolveFleetReferences(data.vehicleId, data.driverId);
    const db = await getD1();
    const result = await db.batch([
      db.prepare(`insert into audit_logs(id,entity_type,entity_id,action,actor_user_id,actor_email,previous_value,new_value,request_id)
        select ?,'FLEET_TRIP',id,'UPDATED',?,?,row_to_json(fleet_trips)::text,?,? from fleet_trips where id = ?`)
        .bind(crypto.randomUUID(),user.id,user.email,JSON.stringify(data),crypto.randomUUID(),id),
      db.prepare(`update fleet_trips set name=?,vehicle_id=?,driver_id=?,operation_date=?,fuel_cost_cents=?,toll_cents=?,other_cost_cents=?,notes=?,
        updated_at=to_char(timezone('UTC',now()),'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') where id=? returning id`)
        .bind(data.name,data.vehicleId,data.driverId,data.operationDate,data.fuelCostCents,data.tollCents,data.otherCostCents,data.notes,id),
    ]);
    if (!result[1].results.length) throw new ApiError(404, 'Viagem não encontrada.');
    return Response.json({ id });
  } catch (error) { return jsonError(error); }
}
export async function DELETE(request: Request, context: Context) {
  try {
    const user = await authorize(request, ['ADMIN', 'GERENCIA']);
    const { id } = await context.params;
    const db = await getD1();
    const result = await db.batch([
      db.prepare(`insert into audit_logs(id,entity_type,entity_id,action,actor_user_id,actor_email,previous_value,request_id)
        select ?,'FLEET_TRIP',id,'DELETED',?,?,row_to_json(fleet_trips)::text,? from fleet_trips where id = ?`)
        .bind(crypto.randomUUID(),user.id,user.email,crypto.randomUUID(),id),
      db.prepare('delete from fleet_trips where id=? returning id').bind(id),
    ]);
    if (!result[1].results.length) throw new ApiError(404, 'Viagem não encontrada.');
    return Response.json({ deleted: true });
  } catch (error) { return jsonError(error); }
}
