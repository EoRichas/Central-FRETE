import { authorize } from "@/lib/server/auth";
import { ApiError, getD1, jsonError } from "@/lib/server/d1";
import { getSale } from "@/lib/server/repository";
import { OPERATIONAL_STATUSES } from "@/lib/domain/operations";
import { asObject, dateOnly, enumValue } from "@/lib/server/validation";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await authorize(request, ["ADMIN", "FINANCEIRO", "OPERACIONAL"]);
    const { id } = await context.params;
    const sale = await getSale(user, id);
    if (!sale) throw new ApiError(404, "Venda não encontrada.");
    const payload = asObject(await request.json());
    const operationalStatus = enumValue(payload.operationalStatus, "Status operacional", OPERATIONAL_STATUSES);
    const billingDate = payload.billingDate ? dateOnly(payload.billingDate, "Data do faturamento") : null;
    if (billingDate && new Date(`${billingDate}T12:00:00Z`).toISOString().slice(0, 10) !== billingDate) {
      throw new ApiError(400, "Data do faturamento inválida.");
    }
    const db = await getD1();
    const statements = [
      db.prepare(`update freight_sales set operational_status=?, billing_date=?,
        updated_at=to_char(timezone('UTC',now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') where id=?`)
        .bind(operationalStatus, billingDate, id),
    ];
    // Linked fleet operations are the source of the billing date in reports.
    if (sale.fleetFreightId) statements.push(db.prepare(`update fleet_freights set billing_date=?, updated_by=?,
      updated_at=to_char(timezone('UTC',now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') where id=?`).bind(billingDate, user.id, sale.fleetFreightId));
    statements.push(db.prepare(`insert into audit_logs(id,entity_type,entity_id,action,actor_user_id,actor_email,previous_value,new_value,request_id)
      values(?,'FREIGHT_SALE',?,'BILLING_UPDATED',?,?,?,?,?)`).bind(crypto.randomUUID(), id, user.id, user.email,
      JSON.stringify({operationalStatus: sale.operationalStatus, billingDate: sale.billingDate}),
      JSON.stringify({operationalStatus, billingDate, fleetFreightId: sale.fleetFreightId}),
      request.headers.get("x-request-id") ?? crypto.randomUUID()));
    await db.batch(statements);
    return Response.json({updated: true});
  } catch (error) { return jsonError(error); }
}
