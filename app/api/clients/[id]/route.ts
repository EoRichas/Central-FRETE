import type { ClientAddressRecord, ClientRecord } from "@/lib/contracts";
import { authorize } from "@/lib/server/auth";
import { ApiError, getD1, jsonError, queryAll, queryFirst } from "@/lib/server/d1";
import { listSales } from "@/lib/server/repository";
import { asObject, upper } from "@/lib/server/validation";

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
        notes, active from clients where id = ?`,
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
      sales,
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
    const user = await authorize(request, ["ADMIN"]);
    const { id } = await context.params;
    const current = await queryFirst<{ legalName: string; notes: string | null; active: number }>(
      `select legal_name as legalName, notes, active from clients where id = ?`,
      [id],
    );
    if (!current) throw new ApiError(404, "Cliente não encontrado.");
    const payload = asObject(await request.json());
    const notes = upper(payload.notes);
    const active = payload.active === false ? 0 : 1;
    const db = await getD1();
    await db.batch([
      db
        .prepare(
          `update clients set notes = ?, active = ?,
            updated_at = to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') where id = ?`,
        )
        .bind(notes, active, id),
      db
        .prepare(
          `insert into audit_logs (
            id, entity_type, entity_id, action, actor_user_id, actor_email,
            previous_value, new_value, request_id
          ) values (?, 'CLIENT', ?, 'UPDATED', ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          id,
          user.id,
          user.email,
          JSON.stringify(current),
          JSON.stringify({ notes, active }),
          request.headers.get("x-request-id") ?? crypto.randomUUID(),
        ),
    ]);
    return Response.json({ updated: true });
  } catch (error) {
    return jsonError(error);
  }
}
