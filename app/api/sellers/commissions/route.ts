import { commissionedRevenueCents } from '@/lib/domain/commissions';
import type {
  SellerCommissionRecord,
  SellerCommissionStatus,
} from "@/lib/contracts";
import { currentCompetency, todaySaoPaulo } from "@/lib/domain/dates";
import { commissionCents } from "@/lib/domain/finance";
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
} from "@/lib/server/validation";

const COMMISSION_STATUSES = ["EM_ABERTO", "PAGO"] as const;

type CommissionAggregateRow = {
  sourceKind: "sale" | "freight";
  saleId: string;
  saleNumber: string;
  saleDate: string;
  clientName: string | null;
  sellerId: string | null;
  sellerName: string;
  salesCount: number;
  totalSalesCents: number;
  commissionBasisPoints: number;
  commissionOverrideCents: number | null;
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
  const effectiveCommission = commissionCents(totalSalesCents, Number(row.commissionBasisPoints), row.commissionOverrideCents == null ? null : Number(row.commissionOverrideCents));
  const sellerUser =
    row.sellerId ? sellerUsersById.get(row.sellerId) : sellerUsersByName.get(row.sellerName.toUpperCase());
  return {
    sourceKind: row.sourceKind,
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
    commissionBasisPoints: Number(row.commissionBasisPoints),
    commissionOverrideCents: row.commissionOverrideCents,
    creditedSalesCents: commissionedRevenueCents(totalSalesCents, effectiveCommission),
    commissionCents: effectiveCommission,
    status: row.status ?? "EM_ABERTO",
    paidAt: row.paidAt,
    paidByName: row.paidByName,
  };
}

export async function GET(request: Request) {
  try {
    const user = await authorize(request, ["ADMIN", "VENDEDOR", "OPERACIONAL"]);
    const url = new URL(request.url);
    const competency = validateCompetency(
      url.searchParams.get("competency") ?? currentCompetency(),
    );
    const sellerScope =
      ["VENDEDOR", "OPERACIONAL"].includes(user.role)
        ? "and s.seller_id = ?"
        : "";
    const params: unknown[] = [competency];
    if (["VENDEDOR", "OPERACIONAL"].includes(user.role)) params.push(user.id);

    const [rows, sellerUsers, sellerProfiles] = await Promise.all([
      queryAll<CommissionAggregateRow>(
        `select s.source_kind as sourceKind,s.id as saleId, s.sale_number as saleNumber, s.sale_date as saleDate,
          coalesce(c.legal_name,s.fleet_client_name) as clientName, s.seller_id as sellerId, upper(s.seller_name) as sellerName,
          1 as salesCount, s.freight_amount_cents as totalSalesCents,
          s.commission_basis_points as commissionBasisPoints, s.commission_override_cents as commissionOverrideCents,
          cs.status, cs.paid_at as paidAt, u.name as paidByName
         from (
           select 'sale'::text as source_kind,id,sale_number,sale_date,client_id,null::text as fleet_client_name,seller_id,seller_name,freight_amount_cents,commission_basis_points,commission_override_cents,competency
           from freight_sales where not (sale_channel='FROTA' and fleet_freight_id is not null)
           union all
           select 'freight'::text,id,sale_number,pickup_date,null,client_name,seller_id,seller_name,freight_amount_cents,seller_commission_basis_points,seller_commission_override_cents,left(pickup_date,7)
           from fleet_freights where seller_name is not null
         ) s
         left join clients c on c.id = s.client_id
         left join sale_commission_payments cs
           on cs.source_kind=s.source_kind and cs.source_id=s.id
         left join users u on u.id = cs.paid_by
         where s.competency = ? ${sellerScope}
         order by s.sale_date, s.sale_number`,
        params,
      ),
      queryAll<SellerUserRow>(
        `select id, name, pix_details as pixDetails
         from users where role in ('VENDEDOR','OPERACIONAL')`,
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
    const commissions = rows
      .map((row) =>
        toCommissionRecord(
          row,
          competency,
          sellerUsersById,
          sellerUsersByName,
          sellerProfilesByName,
        ),
      )
      .sort((left, right) =>
        (left.saleNumber ?? "").localeCompare(right.saleNumber ?? "", "pt-BR", {
          numeric: true,
          sensitivity: "base",
        }),
      );
    return Response.json({ competency, commissions });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
 try {
  const user=await authorize(request,["ADMIN"]);
  const payload=asObject(await request.json());
  const sourceKind=enumValue(payload.sourceKind,"Origem da comissão",["SALE","FREIGHT"] as const).toLowerCase() as "sale"|"freight";
  const saleId=String(payload.saleId??"").trim();
  if(!saleId||saleId.length>80)throw new ApiError(400,"Selecione a comissão de uma venda.");
  const competency=validateCompetency(String(payload.competency??""));
  const source=await queryFirst<{sellerName:string;sellerId:string|null;competency:string}>(
   sourceKind==='sale'?`select upper(seller_name) as sellerName,seller_id as sellerId,competency from freight_sales where id=? and not(sale_channel='FROTA' and fleet_freight_id is not null)`:
   `select upper(seller_name) as sellerName,seller_id as sellerId,left(pickup_date,7) as competency from fleet_freights where id=?`,[saleId]);
  if(!source||source.competency!==competency||!source.sellerName)throw new ApiError(404,"Comissão não encontrada nesta competência.");
  const status=enumValue(payload.status,"Situação da comissão",COMMISSION_STATUSES);
  const paidAt=status==='PAGO'?dateOnly(payload.paidAt??todaySaoPaulo(),"Data do pagamento"):null;
  if(paidAt&&new Date(paidAt+'T12:00:00Z').toISOString().slice(0,10)!==paidAt)throw new ApiError(400,'Data do pagamento inválida.');
  const previous=await queryFirst(`select status,paid_at,paid_by from sale_commission_payments where source_kind=? and source_id=?`,[sourceKind,saleId]);
  const db=await getD1();
  const statements:D1PreparedStatement[]=[db.prepare(`insert into sale_commission_payments(source_kind,source_id,status,paid_at,paid_by) values (?,?,?,?,?)
   on conflict(source_kind,source_id) do update set status=excluded.status,paid_at=excluded.paid_at,paid_by=excluded.paid_by,updated_at=now()`)
   .bind(sourceKind,saleId,status,paidAt,status==='PAGO'?user.id:null)];
  let pixDetails:string|undefined;
  if(Object.hasOwn(payload,'pixDetails')){
   pixDetails=String(payload.pixDetails??'').trim();
   if(pixDetails.length>2000)throw new ApiError(400,"Dados PIX muito extensos.");
   statements.push(db.prepare(`insert into seller_payment_profiles(seller_name,pix_details) values (?,?) on conflict(seller_name) do update set pix_details=excluded.pix_details,updated_at=to_char(timezone('UTC',now()),'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`).bind(source.sellerName,pixDetails||null));
   if(source.sellerId)statements.push(db.prepare('update users set pix_details=? where id=?').bind(pixDetails||null,source.sellerId));
  }
  statements.push(db.prepare(`insert into audit_logs(id,entity_type,entity_id,action,actor_user_id,actor_email,previous_value,new_value,request_id) values (?,'SELLER_COMMISSION',?,'STATUS_UPDATED',?,?,?,?,?)`)
   .bind(crypto.randomUUID(),`${sourceKind}:${saleId}`,user.id,user.email,previous?JSON.stringify(previous):null,JSON.stringify({sourceKind,saleId,sellerName:source.sellerName,competency,status,paidAt}),request.headers.get('x-request-id')??crypto.randomUUID()));
  await db.batch(statements);
  return Response.json({sourceKind,saleId,sellerName:source.sellerName,competency,status,paidAt,pixDetails});
 }catch(error){return jsonError(error);}
}
