import { saleForViewer } from "@/lib/server/seller-commission";
import { CLIENT_CHANNELS } from "@/lib/domain/registry";
import { booleanValue } from "@/lib/server/fleet-validation";
import type { ClientAddressRecord, ClientRecord } from "@/lib/contracts";
import { authorize } from "@/lib/server/auth";
import { ApiError, getD1, jsonError, queryAll, queryFirst } from "@/lib/server/d1";
import { listSales } from "@/lib/server/repository";
import { asObject, upper, lower, digits, requiredUpper, enumValue } from "@/lib/server/validation";

type RouteContext = { params: Promise<{ id: string }> };
type ContactRow = Omit<ClientRecord["contacts"][number], "isPrimary"> & {
  isPrimary: number;
};
type AddressRow = Omit<
  ClientRecord["addresses"][number],
  "isPrimary" | "type"
> & {
  isPrimary: number;
  type: string;
};

type ClientDeletionRow = {
  legalName: string;
  tradeName: string | null;
  cpfCnpj: string | null;
  active: number;
  linkedSales: number;
  contacts: number;
  addresses: number;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await authorize(request);
    const { id } = await context.params;
    const client = await queryFirst<Omit<ClientRecord, "contacts" | "addresses" | "active"> & { active: number }>(
      `select id, type, legal_name as legalName, trade_name as tradeName,
        cpf_cnpj as cpfCnpj, state_registration as stateRegistration,
        notes, active, sale_channel as saleChannel from clients where id = ?`,
      [id],
    );
    if (!client) throw new ApiError(404, "Cliente não encontrado.");
    const [contacts, addresses, allSales] = await Promise.all([
      queryAll<ContactRow>(
        `select id, name, phone, whatsapp, email, is_primary as isPrimary
         from client_contacts where client_id = ? order by is_primary desc, name`,
        [id],
      ),
      queryAll<AddressRow>(
        `select id, type, label, contact_name as contactName, phone, cep, street,
          number, complement, district, city, state, is_primary as isPrimary
         from client_addresses where client_id = ? order by type, is_primary desc`,
        [id],
      ),
      listSales(user, { limit: 500 }),
    ]);
    const sales = allSales.filter((sale) => sale.clientId === id);
    const summary = sales.reduce(
      (acc, sale) => {
        acc.salesCount += 1;
        acc.freightAmountCents += sale.freightAmountCents;
        acc.receivedCents += sale.financial.totalReceivedCents;
        acc.balanceCents += sale.financial.balanceCents;
        if (sale.financial.status === "VENCIDO") {
          acc.overdueCents += sale.financial.balanceCents;
        }
        return acc;
      },
      {
        salesCount: 0,
        freightAmountCents: 0,
        receivedCents: 0,
        balanceCents: 0,
        overdueCents: 0,
      },
    );
    return Response.json({
      client: {
        ...client,
        active: Boolean(client.active),
        contacts: contacts.map((contact) => ({
          ...contact,
          isPrimary: Boolean(contact.isPrimary),
        })),
        addresses: addresses.map((address) => ({
          ...address,
          type: (address.type === "COBRANCA"
            ? "EMPRESA"
            : address.type) as ClientAddressRecord["type"],
          isPrimary: Boolean(address.isPrimary),
        })),
        summary,
      },
      sales: sales.map(sale => saleForViewer(sale, user)),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await authorize(request, ["ADMIN"]);
    const { id } = await context.params;
    const current = await queryFirst<ClientDeletionRow>(
      `select c.legal_name as legalName, c.trade_name as tradeName,
        c.cpf_cnpj as cpfCnpj, c.active,
        (select count(*) from freight_sales s where s.client_id = c.id) as linkedSales,
        (select count(*) from client_contacts cc where cc.client_id = c.id) as contacts,
        (select count(*) from client_addresses ca where ca.client_id = c.id) as addresses
       from clients c where c.id = ?`,
      [id],
    );
    if (!current) throw new ApiError(404, "Cliente não encontrado.");

    const db = await getD1();
    await db.batch([
      db
        .prepare(
          `insert into audit_logs (
            id, entity_type, entity_id, action, actor_user_id, actor_email,
            previous_value, request_id
          ) values (?, 'CLIENT', ?, 'DELETED', ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          id,
          user.id,
          user.email,
          JSON.stringify({
            legalName: current.legalName,
            tradeName: current.tradeName,
            cpfCnpj: current.cpfCnpj,
            active: Boolean(current.active),
            linkedSales: current.linkedSales,
            contacts: current.contacts,
            addresses: current.addresses,
          }),
          request.headers.get("x-request-id") ?? crypto.randomUUID(),
        ),
      db
        .prepare(
          `update freight_sales set client_id = null,
            updated_at = to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
           where client_id = ?`,
        )
        .bind(id),
      db.prepare("delete from client_contacts where client_id = ?").bind(id),
      db.prepare("delete from client_addresses where client_id = ?").bind(id),
      db.prepare("delete from clients where id = ?").bind(id),
    ]);

    return Response.json({
      deleted: true,
      preservedSales: current.linkedSales,
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await authorize(request, ["ADMIN", "VENDEDOR"]);
    const { id } = await context.params;
    const current = await queryFirst<Omit<ClientRecord,'contacts'|'addresses'|'active'>&{active:number}>(
      `select id,type,legal_name as legalName,trade_name as tradeName,cpf_cnpj as cpfCnpj,state_registration as stateRegistration,notes,active,sale_channel as saleChannel from clients where id=?`,[id]);
    if (!current) throw new ApiError(404,"Cliente não encontrado.");
    const payload=asObject(await request.json());
    const next={
      type:enumValue(payload.type??current.type,"Tipo de pessoa",['PF','PJ'] as const),
      legalName:requiredUpper(payload.legalName??current.legalName,"Nome/Razão social"),
      tradeName:payload.tradeName===undefined?current.tradeName:upper(payload.tradeName),
      cpfCnpj:payload.cpfCnpj===undefined?current.cpfCnpj:digits(payload.cpfCnpj),
      stateRegistration:payload.stateRegistration===undefined?current.stateRegistration:upper(payload.stateRegistration),
      notes:payload.notes===undefined?current.notes:upper(payload.notes),
      active:payload.active===undefined?current.active:booleanValue(payload.active,"Situação")?1:0,
      saleChannel:enumValue(payload.saleChannel??current.saleChannel,"Canal",CLIENT_CHANNELS),
    };
    if(next.cpfCnpj&&![11,14].includes(next.cpfCnpj.length))throw new ApiError(400,"CPF/CNPJ deve possuir 11 ou 14 dígitos.");
    const db=await getD1();
    const statements=[db.prepare(`update clients set type=?,legal_name=?,trade_name=?,cpf_cnpj=?,state_registration=?,notes=?,active=?,sale_channel=?,updated_at=to_char(timezone('UTC',now()),'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') where id=?`).bind(next.type,next.legalName,next.tradeName,next.cpfCnpj,next.stateRegistration,next.notes,next.active,next.saleChannel,id)];
    const previousDetails:Record<string,unknown>={},updatedDetails:Record<string,unknown>={};
    for(const kind of ['contacts','addresses'] as const){
      if(payload[kind]===undefined)continue;
      const rows=payload[kind];if(!Array.isArray(rows)||rows.length>100)throw new ApiError(400,'Lista de contatos ou endereços inválida.');
      const existing=await queryAll<{id:string}&Record<string,unknown>>(kind==='contacts'?'select * from client_contacts where client_id=?':'select id,type,label,contact_name as contactName,phone,cep,street,number,complement,district,city,state,is_primary as isPrimary from client_addresses where client_id=?',[id]);
      previousDetails[kind]=existing;
      const ids=new Set(existing.map(r=>r.id)),seen=new Set<string>();
      const updates=rows.map(raw=>{
        const supplied=asObject(raw),rowId=String(supplied.id??'');
        const row={...existing.find(item=>item.id===rowId),...supplied};
        if(!ids.has(rowId)||seen.has(rowId))throw new ApiError(400,'Contato ou endereço não pertence a este cliente, ou está duplicado.');seen.add(rowId);
        if(kind==='contacts'){
          const values={id:rowId,name:requiredUpper(row.name,'Nome do contato'),phone:digits(row.phone),whatsapp:digits(row.whatsapp),email:lower(row.email)};
          statements.push(db.prepare('update client_contacts set name=?,phone=?,whatsapp=?,email=? where id=? and client_id=?').bind(values.name,values.phone,values.whatsapp,values.email,rowId,id));return values;
        }
        const type=enumValue(row.type==='COBRANCA'?'EMPRESA':row.type,'Tipo de endereço',['EMPRESA','COLETA','ENTREGA'] as const),state=requiredUpper(row.state,'UF');
        if(state.length!==2)throw new ApiError(400,'UF deve possuir 2 letras.');
        const values={id:rowId,type:type==='EMPRESA'?'COBRANCA':type,label:upper(row.label),contactName:upper(row.contactName),phone:digits(row.phone),cep:digits(row.cep),street:upper(row.street),number:upper(row.number),complement:upper(row.complement),district:upper(row.district),city:requiredUpper(row.city,'Cidade'),state};
        statements.push(db.prepare('update client_addresses set type=?,label=?,contact_name=?,phone=?,cep=?,street=?,number=?,complement=?,district=?,city=?,state=? where id=? and client_id=?').bind(values.type,values.label,values.contactName,values.phone,values.cep,values.street,values.number,values.complement,values.district,values.city,values.state,rowId,id));return values;
      });updatedDetails[kind]=updates;
    }
    statements.push(db.prepare(`insert into audit_logs(id,entity_type,entity_id,action,actor_user_id,actor_email,previous_value,new_value,request_id) values (?,'CLIENT',?,'UPDATED',?,?,?,?,?)`).bind(crypto.randomUUID(),id,user.id,user.email,JSON.stringify({...current,...previousDetails}),JSON.stringify({...next,...updatedDetails}),request.headers.get('x-request-id')??crypto.randomUUID()));
    await db.batch(statements);
    return Response.json({updated:true});
  }catch(error){return jsonError(error);}
}
