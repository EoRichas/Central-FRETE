import { authorize } from "@/lib/server/auth";
import { ApiError, getD1, jsonError, queryFirst } from "@/lib/server/d1";
import { asObject, dateOnly, enumValue } from "@/lib/server/validation";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
 try {
  const user = await authorize(request, ["ADMIN", "FINANCEIRO"]);
  const { id } = await context.params;
  const data = asObject(await request.json());
  const status = enumValue(data.status, "Situação", ["EM_ABERTO", "PAGO"]);
  const previous = await queryFirst("select payment_status, paid_at, proof_attachment_id from fleet_freights where id = ?", [id]);
  if (!previous) throw new ApiError(404, "Frete não encontrado.");
  const proof = status === "PAGO" ? await queryFirst<{ id: string }>("select id from fleet_attachments where id = ? and freight_id = ?", [String(data.proofId ?? ""), id]) : null;
  if (status === "PAGO" && !proof) throw new ApiError(400, "Anexe e selecione um comprovante deste frete antes de confirmar Pago.");
  const paidAt = status === "PAGO" ? `${dateOnly(data.paidAt, "Data do pagamento")}T15:00:00.000Z` : null;
  const db = await getD1();
  await db.batch([
   db.prepare("update fleet_freights set payment_status = ?, proof_attachment_id = ?, paid_at = ?, updated_by = ? where id = ?").bind(status, proof?.id ?? null, paidAt, user.id, id),
   db.prepare("insert into audit_logs(id, entity_type, entity_id, action, actor_user_id, actor_email, previous_value, new_value) values (?, 'FLEET_PAYMENT', ?, 'UPDATED', ?, ?, ?, ?)").bind(crypto.randomUUID(), id, user.id, user.email, JSON.stringify(previous), JSON.stringify({status, paidAt, proofId: proof?.id})),
  ]);
  return Response.json({ updated: true });
 } catch(error) { return jsonError(error); }
}
