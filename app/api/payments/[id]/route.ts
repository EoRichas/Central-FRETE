import { authorize } from "@/lib/server/auth";
import { ApiError, getD1, jsonError, queryFirst } from "@/lib/server/d1";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await authorize(request, ["ADMIN", "FINANCEIRO"]);
    const { id } = await context.params;
    const payment = await queryFirst<{id: string; type: string}>("select id, type from payment_transactions where id = ?", [id]);
    if (!payment) throw new ApiError(404, "Recebimento não encontrado.");
    if (payment.type === "ESTORNO") throw new ApiError(409, "Exclua o recebimento original para remover este lançamento vinculado.");
    const db = await getD1();
    // Exclusão lógica: remove do caixa e das listas, preservando idempotência e auditoria.
    // Estornos antigos vinculados são retirados juntos para não inverter o saldo.
    const result = await db.prepare(`
      with previous as materialized (
        select * from payment_transactions
        where (id = ? or reversed_transaction_id = ?) and status <> 'CANCELADO'
        for update
      ), removed as (
        update payment_transactions set status = 'CANCELADO'
        where id in (select id from previous) returning id
      )
      insert into audit_logs (id, entity_type, entity_id, action, actor_user_id, actor_email, previous_value, new_value, request_id)
      select ? || ':' || p.id, 'PAYMENT_TRANSACTION', p.id, 'DELETED', ?, ?,
        row_to_json(p)::text, '{"status":"CANCELADO"}', ?
      from previous p join removed r on r.id = p.id returning id
    `).bind(id, id, crypto.randomUUID(), user.id, user.email, request.headers.get("x-request-id") ?? crypto.randomUUID()).all();
    return Response.json({ deleted: true, alreadyDeleted: (result.results ?? []).length === 0 });
  } catch (error) { return jsonError(error); }
}
