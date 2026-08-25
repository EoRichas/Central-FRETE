import { authorize } from "@/lib/server/auth";
import {
  ApiError,
  getD1,
  jsonError,
  queryFirst,
} from "@/lib/server/d1";
import { getSale } from "@/lib/server/repository";
import {
  EDITABLE_OPERATION_COST_CATEGORIES,
  isEditableOperationCostCategory,
} from "@/lib/domain/operations";
import {
  asObject,
  dateOnly,
  enumValue,
  integerInRange,
  optionalString,
  requiredString,
  upper,
} from "@/lib/server/validation";

const COST_STATUSES = ["EM_ABERTO", "CONFIRMADO"] as const;

type RouteContext = { params: Promise<{ id: string }> };

type OperationCostRow = {
  id: string;
  saleId: string;
  category: string;
  description: string | null;
  pixDetails: string | null;
  occurredOn: string | null;
  amountCents: number;
  confirmed: number;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await authorize(request, ["ADMIN", "FINANCEIRO"]);
    const { id: saleId } = await context.params;
    const sale = await getSale(user, saleId);
    if (!sale) throw new ApiError(404, "Venda não encontrada.");

    const payload = asObject(await request.json());
    const costId = requiredString(payload.costId, "Custo");
    const previous = await queryFirst<OperationCostRow>(
      `select id, sale_id as saleId, category, description,
        pix_details as pixDetails,
        occurred_on as occurredOn, amount_cents as amountCents, confirmed
       from freight_costs where id = ? and sale_id = ?`,
      [costId, saleId],
    );
    if (!previous) throw new ApiError(404, "Custo não encontrado.");
    if (
      !EDITABLE_OPERATION_COST_CATEGORIES.includes(
        previous.category as (typeof EDITABLE_OPERATION_COST_CATEGORIES)[number],
      )
    ) {
      throw new ApiError(
        400,
        "Somente custos do painel de pagamentos podem ser alterados aqui.",
      );
    }

    const amountCents = integerInRange(
      payload.amountCents,
      "Valor do custo",
      1,
      9_000_000_000_000,
    );
    const status = enumValue(
      payload.status,
      "Situação do custo",
      COST_STATUSES,
    );
    const occurredOn = payload.occurredOn
      ? dateOnly(payload.occurredOn, "Data do custo")
      : null;
    const description = upper(payload.description);
    const pixDetails =
      isEditableOperationCostCategory(previous.category) &&
      Object.prototype.hasOwnProperty.call(payload, "pixDetails")
        ? optionalString(payload.pixDetails)
        : previous.pixDetails;
    const confirmed = status === "CONFIRMADO";
    const db = await getD1();
    await db.batch([
      db
        .prepare(
          `update freight_costs set description = ?, pix_details = ?,
            occurred_on = ?, amount_cents = ?, confirmed = ?,
            updated_at = to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
           where id = ? and sale_id = ?`,
        )
        .bind(
          description,
          pixDetails,
          occurredOn,
          amountCents,
          confirmed ? 1 : 0,
          costId,
          saleId,
        ),
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
          ) values (?, 'FREIGHT_COST', ?, 'OPERATION_COST_UPDATED', ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          costId,
          user.id,
          user.email,
          JSON.stringify(previous),
          JSON.stringify({
            saleId,
            category: previous.category,
            description,
            pixDetails,
            occurredOn,
            amountCents,
            status,
          }),
          request.headers.get("x-request-id") ?? crypto.randomUUID(),
        ),
    ]);

    return Response.json({ id: costId, status, updated: true });
  } catch (error) {
    return jsonError(error);
  }
}
