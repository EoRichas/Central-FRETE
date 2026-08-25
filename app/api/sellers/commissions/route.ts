import type {
  SellerCommissionRecord,
  SellerCommissionStatus,
} from "@/lib/contracts";
import {
  SELLER_COMMISSION_BASIS_POINTS,
  sellerCommissionCents,
} from "@/lib/domain/commissions";
import { authorize } from "@/lib/server/auth";
import {
  ApiError,
  getD1,
  jsonError,
  queryAll,
  queryFirst,
} from "@/lib/server/d1";
import {
  asObject,
  dateOnly,
  enumValue,
  requiredUpper,
} from "@/lib/server/validation";

const COMMISSION_STATUSES = ["EM_ABERTO", "PAGO"] as const;

type CommissionAggregateRow = {
  saleId: string;
  saleNumber: string;
  saleDate: string;
  clientName: string | null;
  sellerId: string | null;
  sellerName: string;
  salesCount: number;
  totalSalesCents: number;
  status: SellerCommissionStatus | null;
  paidAt: string | null;
  paidByName: string | null;
};

type SellerUserRow = {
  id: string;
  name: string;
  pixDetails: string | null;
};

type SellerPaymentProfileRow = {
  sellerName: string;
  pixDetails: string | null;
};

type CommissionStatusRow = {
  id: string;
  status: SellerCommissionStatus;
  paidAt: string | null;
  paidBy: string | null;
};

function currentCompetency() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year ?? "2026"}-${month ?? "08"}`;
}

function todaySaoPaulo() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function validateCompetency(value: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    throw new ApiError(400, "Competência inválida.");
  }
  return value;
}

function toCommissionRecord(
  row: CommissionAggregateRow,
  competency: string,
  sellerUsersById: Map<string, SellerUserRow>,
  sellerUsersByName: Map<string, SellerUserRow>,
  sellerProfilesByName: Map<string, SellerPaymentProfileRow>,
): SellerCommissionRecord {
  const totalSalesCents = Number(row.totalSalesCents);
  const sellerUser =
    (row.sellerId ? sellerUsersById.get(row.sellerId) : undefined) ??
    sellerUsersByName.get(row.sellerName.toUpperCase());
  return {
    saleId: row.saleId,
    saleNumber: row.saleNumber,
    saleDate: row.saleDate,
    clientName: row.clientName,
    sellerId: sellerUser?.id ?? row.sellerId ?? null,
    sellerName: row.sellerName,
    pixDetails:
      sellerUser?.pixDetails ??
      sellerProfilesByName.get(row.sellerName.toUpperCase())?.pixDetails ??
      null,
    competency,
    salesCount: Number(row.salesCount),
    totalSalesCents,
    commissionBasisPoints: SELLER_COMMISSION_BASIS_POINTS,
    commissionCents: sellerCommissionCents(totalSalesCents),
    status: row.status ?? "EM_ABERTO",
    paidAt: row.paidAt,
    paidByName: row.paidByName,
  };
}

export async function GET(request: Request) {
  try {
    const user = await authorize(request);
    const url = new URL(request.url);
    const competency = validateCompetency(
      url.searchParams.get("competency") ?? currentCompetency(),
    );
    const sellerScope =
      user.role === "VENDEDOR"
        ? "and (s.seller_id = ? or upper(s.seller_name) = upper(?))"
        : "";
    const params: unknown[] = [competency, competency];
    if (user.role === "VENDEDOR") params.push(user.id, user.name);

    const [rows, sellerUsers, sellerProfiles] = await Promise.all([
      queryAll<CommissionAggregateRow>(
        `select s.id as saleId, s.sale_number as saleNumber, s.sale_date as saleDate,
          c.legal_name as clientName, s.seller_id as sellerId, upper(s.seller_name) as sellerName,
          1 as salesCount, s.freight_amount_cents as totalSalesCents,
          cs.status, cs.paid_at as paidAt, u.name as paidByName
         from freight_sales s
         left join clients c on c.id = s.client_id
         left join seller_commission_statuses cs
           on cs.seller_name = upper(s.seller_name) and cs.competency = ?
         left join users u on u.id = cs.paid_by
         where s.competency = ? ${sellerScope}
         order by upper(s.seller_name), s.sale_date desc, cast(s.sale_number as integer) desc`,
        params,
      ),
      queryAll<SellerUserRow>(
        `select id, name, pix_details as pixDetails
         from users where role = 'VENDEDOR'`,
      ),
      queryAll<SellerPaymentProfileRow>(
        `select seller_name as sellerName, pix_details as pixDetails
         from seller_payment_profiles`,
      ),
    ]);

    const sellerUsersById = new Map(sellerUsers.map((item) => [item.id, item]));
    const sellerUsersByName = new Map(
      sellerUsers.map((item) => [item.name.toUpperCase(), item]),
    );
    const sellerProfilesByName = new Map(
      sellerProfiles.map((item) => [item.sellerName.toUpperCase(), item]),
    );
    const commissions = rows.map((row) =>
      toCommissionRecord(
        row,
        competency,
        sellerUsersById,
        sellerUsersByName,
        sellerProfilesByName,
      ),
    );
    return Response.json({ competency, commissions });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await authorize(request, ["ADMIN", "FINANCEIRO"]);
    const payload = asObject(await request.json());
    const competency = validateCompetency(String(payload.competency ?? ""));
    const sellerName = requiredUpper(payload.sellerName, "Vendedor");
    const status = enumValue(
      payload.status,
      "Situação da comissão",
      COMMISSION_STATUSES,
    );
    const sales = await queryFirst<{ salesCount: number }>(
      `select count(*) as salesCount from freight_sales
       where competency = ? and upper(seller_name) = ?`,
      [competency, sellerName],
    );
    if (!sales?.salesCount) {
      throw new ApiError(404, "Vendedor sem vendas nesta competência.");
    }

    const previous = await queryFirst<CommissionStatusRow>(
      `select id, status, paid_at as paidAt, paid_by as paidBy
       from seller_commission_statuses
       where seller_name = ? and competency = ?`,
      [sellerName, competency],
    );
    const id = previous?.id ?? crypto.randomUUID();
    const paidAt =
      status === "PAGO"
        ? dateOnly(payload.paidAt ?? todaySaoPaulo(), "Data do pagamento")
        : null;
    const paidBy = status === "PAGO" ? user.id : null;
    const db = await getD1();
    const statements: D1PreparedStatement[] = [
      db
        .prepare(
          `insert into seller_commission_statuses (
            id, seller_name, competency, status, paid_at, paid_by
          ) values (?, ?, ?, ?, ?, ?)
          on conflict (seller_name, competency) do update set
            status = excluded.status,
            paid_at = excluded.paid_at,
            paid_by = excluded.paid_by,
            updated_at = to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`,
        )
        .bind(id, sellerName, competency, status, paidAt, paidBy),
    ];

    let pixDetails: string | undefined;
    if (Object.prototype.hasOwnProperty.call(payload, "pixDetails")) {
      if (user.role !== "ADMIN") {
        throw new ApiError(403, "Somente o ADMIN pode alterar o PIX do vendedor.");
      }
      pixDetails = String(payload.pixDetails ?? "").trim();
      let sellerUser = await queryFirst<{ id: string }>(
        `select u.id from users u
         where u.id = (
           select seller_id from freight_sales
           where competency = ? and upper(seller_name) = ? and seller_id is not null
           limit 1
         ) limit 1`,
        [competency, sellerName],
      );
      if (!sellerUser) {
        sellerUser = await queryFirst<{ id: string }>(
          `select id from users where role = 'VENDEDOR' and upper(name) = ? limit 1`,
          [sellerName],
        );
      }
      statements.push(
        db
          .prepare(
            `insert into seller_payment_profiles (
              seller_name, pix_details
            ) values (?, ?)
            on conflict (seller_name) do update set
              pix_details = excluded.pix_details,
              updated_at = to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`,
          )
          .bind(sellerName, pixDetails || null),
      );
      if (sellerUser) {
        statements.push(
          db
            .prepare(
              `update users set pix_details = ?,
                updated_at = to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') where id = ?`,
            )
            .bind(pixDetails || null, sellerUser.id),
        );
      }
    }

    statements.push(
      db
        .prepare(
          `insert into audit_logs (
            id, entity_type, entity_id, action, actor_user_id, actor_email,
            previous_value, new_value, request_id
          ) values (?, 'SELLER_COMMISSION', ?, 'STATUS_UPDATED', ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          id,
          user.id,
          user.email,
          previous ? JSON.stringify(previous) : null,
          JSON.stringify({ sellerName, competency, status, paidAt, pixDetails }),
          request.headers.get("x-request-id") ?? crypto.randomUUID(),
        ),
    );

    await db.batch(statements);
    return Response.json({ id, sellerName, competency, status, paidAt, pixDetails });
  } catch (error) {
    return jsonError(error);
  }
}
