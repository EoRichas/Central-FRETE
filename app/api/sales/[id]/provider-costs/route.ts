import { authorize } from "@/lib/server/auth";
import { ApiError, getD1, jsonError, queryFirst } from "@/lib/server/d1";
import { getSale } from "@/lib/server/repository";
import {
  asObject,
  dateOnly,
  enumValue,
  integerInRange,
  optionalString,
  requiredUpper,
} from "@/lib/server/validation";

const PROVIDER_PAYMENT_STATUSES = ["EM_ABERTO", "PAGO"] as const;

type RouteContext = { params: Promise<{ id: string }> };

type ProviderCostRow = {
  id: string;
  providerName: string | null;
  pixDetails: string | null;
  amountCents: number;
  paymentStatus: string;
  paidAt: string | null;
  paidBy: string | null;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await authorize(request, ["ADMIN", "FINANCEIRO"]);
    const { id: saleId } = await context.params;
    const sale = await getSale(user, saleId);
    if (!sale) throw new ApiError(404, "Venda não encontrada.");

    const payload = asObject(await request.json());
    const providerSlot = integerInRange(
      payload.providerSlot,
      "Linha do prestador",
      1,
      3,
    );
    const providerName = requiredUpper(
      payload.providerName,
      "Referência do prestador",
    );
    const pixDetails = optionalString(payload.pixDetails);
    const amountCents = integerInRange(
      payload.amountCents,
      "Valor do prestador",
      1,
      9_000_000_000_000,
    );
    const paymentStatus = enumValue(
      payload.paymentStatus,
      "Situação do pagamento",
      PROVIDER_PAYMENT_STATUSES,
    );
    const paidAt =
      paymentStatus === "PAGO"
        ? dateOnly(payload.paidAt, "Data do pagamento")
        : null;
    const paidBy = paymentStatus === "PAGO" ? user.id : null;

    const previous = await queryFirst<ProviderCostRow>(
      `select id, provider_name as providerName, pix_details as pixDetails,
        amount_cents as amountCents,
        payment_status as paymentStatus, paid_at as paidAt, paid_by as paidBy
       from freight_costs
       where sale_id = ? and category = 'PRESTADOR_SERVICO'
         and provider_slot = ?
       limit 1`,
      [saleId, providerSlot],
    );
    const costId = previous?.id ?? crypto.randomUUID();
    const description = `PRESTADOR DE SERVIÇO ${providerSlot}`;
    const db = await getD1();
    const costStatement = previous
      ? db
          .prepare(
            `update freight_costs set provider_name = ?, description = ?,
              pix_details = ?, amount_cents = ?, confirmed = 1, payment_status = ?,
              paid_at = ?, paid_by = ?,
              updated_at = to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
             where id = ?`,
          )
          .bind(
            providerName,
            description,
            pixDetails,
            amountCents,
            paymentStatus,
            paidAt,
            paidBy,
            costId,
          )
      : db
          .prepare(
            `insert into freight_costs (
              id, sale_id, category, provider_name, pix_details, description,
              amount_cents, confirmed, provider_slot, payment_status,
              paid_at, paid_by
            ) values (?, ?, 'PRESTADOR_SERVICO', ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
          )
          .bind(
            costId,
            saleId,
            providerName,
            pixDetails,
            description,
            amountCents,
            providerSlot,
            paymentStatus,
            paidAt,
            paidBy,
          );

    await db.batch([
      costStatement,
      db
        .prepare(
          `update freight_sales set
            costs_pending = case when exists (
              select 1 from freight_costs
              where sale_id = ? and confirmed = 0
            ) then 1 else 0 end,
            updated_at = to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
           where id = ?`,
        )
        .bind(saleId, saleId),
      db
        .prepare(
          `insert into audit_logs (
            id, entity_type, entity_id, action, actor_user_id, actor_email,
            previous_value, new_value, request_id
          ) values (?, 'FREIGHT_COST', ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          costId,
          previous ? "PROVIDER_COST_UPDATED" : "PROVIDER_COST_CREATED",
          user.id,
          user.email,
          previous ? JSON.stringify(previous) : null,
          JSON.stringify({
            saleId,
            providerSlot,
            providerName,
            pixDetails,
            amountCents,
            paymentStatus,
            paidAt,
          }),
          request.headers.get("x-request-id") ?? crypto.randomUUID(),
        ),
    ]);

    return Response.json(
      { id: costId, updated: Boolean(previous) },
      { status: previous ? 200 : 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
