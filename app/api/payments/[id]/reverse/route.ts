import { authorize } from "@/lib/server/auth";
import { ApiError, getD1, jsonError, queryFirst } from "@/lib/server/d1";

type RouteContext = { params: Promise<{ id: string }> };

type PaymentRow = {
  id: string;
  saleId: string;
  installmentId: string | null;
  type: string;
  status: string;
  amountCents: number;
  occurredAt: string;
  paymentMethod: string;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await authorize(request, ["ADMIN", "FINANCEIRO"]);
    const { id } = await context.params;
    const payment = await queryFirst<PaymentRow>(
      `select id, sale_id as saleId, installment_id as installmentId, type, status,
        amount_cents as amountCents, occurred_at as occurredAt,
        payment_method as paymentMethod
      from payment_transactions where id = ?`,
      [id],
    );
    if (!payment) throw new ApiError(404, "Recebimento não encontrado.");
    if (payment.type === "ESTORNO" || payment.status !== "CONFIRMADO") {
      throw new ApiError(409, "Somente recebimentos confirmados podem ser estornados.");
    }
    const existing = await queryFirst<{ id: string }>(
      `select id from payment_transactions where reversed_transaction_id = ?`,
      [id],
    );
    if (existing) {
      return Response.json({ id: existing.id, duplicate: true });
    }

    const reversalId = crypto.randomUUID();
    const db = await getD1();
    await db.batch([
      db
        .prepare(
          `insert into payment_transactions (
            id, sale_id, installment_id, type, status, amount_cents,
            occurred_at, payment_method, notes, reversed_transaction_id,
            idempotency_key, created_by
          ) values (?, ?, ?, 'ESTORNO', 'CONFIRMADO', ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          reversalId,
          payment.saleId,
          payment.installmentId,
          payment.amountCents,
          new Date().toISOString(),
          payment.paymentMethod,
          `ESTORNO DA TRANSAÇÃO ${payment.id}`,
          payment.id,
          `reverse:${payment.id}`,
          user.id,
        ),
      db
        .prepare(
          `insert into audit_logs (
            id, entity_type, entity_id, action, actor_user_id, actor_email,
            previous_value, new_value, request_id
          ) values (?, 'PAYMENT_TRANSACTION', ?, 'REVERSED', ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          payment.id,
          user.id,
          user.email,
          JSON.stringify({ status: payment.status, amountCents: payment.amountCents }),
          JSON.stringify({ reversalId, amountCents: payment.amountCents }),
          request.headers.get("x-request-id") ?? crypto.randomUUID(),
        ),
    ]);
    return Response.json({ id: reversalId, duplicate: false }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
