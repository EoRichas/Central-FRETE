import type { ClientAddressRecord, ClientRecord } from "@/lib/contracts";
import { authorize } from "@/lib/server/auth";
import { ApiError, getD1, jsonError, queryAll } from "@/lib/server/d1";
import {
  asObject,
  digits,
  enumValue,
  lower,
  requiredUpper,
  upper,
} from "@/lib/server/validation";

type ClientRow = Omit<ClientRecord, "contacts" | "addresses" | "active"> & {
  active: number;
};
type ContactRow = Omit<ClientRecord["contacts"][number], "isPrimary"> & {
  clientId: string;
  isPrimary: number;
};
type AddressRow = Omit<
  ClientRecord["addresses"][number],
  "isPrimary" | "type"
> & {
  clientId: string;
  isPrimary: number;
  type: string;
};

export async function GET(request: Request) {
  try {
    await authorize(request);
    const url = new URL(request.url);
    const query = url.searchParams.get("q")?.trim().toUpperCase();
    const where = query
      ? `where upper(legal_name) like ? or upper(coalesce(trade_name, '')) like ? or coalesce(cpf_cnpj, '') like ?`
      : "";
    const params = query ? [`%${query}%`, `%${query}%`, `%${query}%`] : [];
    const clients = await queryAll<ClientRow>(
      `select id, type, legal_name as legalName, trade_name as tradeName,
        cpf_cnpj as cpfCnpj, state_registration as stateRegistration,
        notes, active
      from clients ${where} order by legal_name limit 300`,
      params,
    );
    if (!clients.length) return Response.json({ clients: [] });
    const ids = clients.map((client) => client.id);
    const list = ids.map(() => "?").join(",");
    const [contacts, addresses] = await Promise.all([
      queryAll<ContactRow>(
        `select id, client_id as clientId, name, phone, whatsapp, email,
          is_primary as isPrimary
        from client_contacts where client_id in (${list}) order by is_primary desc, name`,
        ids,
      ),
      queryAll<AddressRow>(
        `select id, client_id as clientId, type, label, contact_name as contactName,
          phone, cep, street, number, complement, district, city, state,
          is_primary as isPrimary
        from client_addresses where client_id in (${list})
        order by type, is_primary desc, label`,
        ids,
      ),
    ]);
    return Response.json({
      clients: clients.map((client) => ({
        ...client,
        active: Boolean(client.active),
        contacts: contacts
          .filter((contact) => contact.clientId === client.id)
          .map((contact) => ({
            id: contact.id,
            name: contact.name,
            phone: contact.phone,
            whatsapp: contact.whatsapp,
            email: contact.email,
            isPrimary: Boolean(contact.isPrimary),
          })),
        addresses: addresses
          .filter((address) => address.clientId === client.id)
          .map((address) => ({
            id: address.id,
            type: (address.type === "COBRANCA"
              ? "EMPRESA"
              : address.type) as ClientAddressRecord["type"],
            label: address.label,
            contactName: address.contactName,
            phone: address.phone,
            cep: address.cep,
            street: address.street,
            number: address.number,
            complement: address.complement,
            district: address.district,
            city: address.city,
            state: address.state,
            isPrimary: Boolean(address.isPrimary),
          })),
      })),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await authorize(request, ["ADMIN", "VENDEDOR"]);
    const payload = asObject(await request.json());
    const type = enumValue(payload.type, "Tipo de pessoa", ["PF", "PJ"] as const);
    const legalName = requiredUpper(payload.legalName, "Nome/Razão social");
    const cpfCnpj = digits(payload.cpfCnpj);
    if (cpfCnpj && ![11, 14].includes(cpfCnpj.length)) {
      throw new ApiError(400, "CPF/CNPJ deve possuir 11 ou 14 dígitos.");
    }
    const contactsPayload = Array.isArray(payload.contacts) ? payload.contacts : [];
    const addressesPayload = Array.isArray(payload.addresses) ? payload.addresses : [];
    if (!contactsPayload.length) {
      throw new ApiError(400, "Informe ao menos um contato.");
    }
    const contacts = contactsPayload.map((raw, index) => {
      const contact = asObject(raw);
      return {
        id: crypto.randomUUID(),
        name: requiredUpper(contact.name, `Nome do contato ${index + 1}`),
        phone: digits(contact.phone),
        whatsapp: digits(contact.whatsapp),
        email: lower(contact.email),
        isPrimary: index === 0 || Boolean(contact.isPrimary),
      };
    });
    const addresses = addressesPayload.map((raw, index) => {
      const address = asObject(raw);
      const state = requiredUpper(address.state, `UF do endereço ${index + 1}`);
      if (state.length !== 2) throw new ApiError(400, "UF deve possuir 2 letras.");
      const addressType = enumValue(address.type, "Tipo de endereço", [
        "EMPRESA",
        "COLETA",
        "ENTREGA",
      ] as const);
      return {
        id: crypto.randomUUID(),
        type: addressType === "EMPRESA" ? "COBRANCA" : addressType,
        label: upper(address.label),
        contactName: upper(address.contactName),
        phone: digits(address.phone),
        cep: digits(address.cep),
        street: requiredUpper(address.street, `Logradouro ${index + 1}`),
        number: requiredUpper(address.number, `Número ${index + 1}`),
        complement: upper(address.complement),
        district: requiredUpper(address.district, `Bairro ${index + 1}`),
        city: requiredUpper(address.city, `Cidade ${index + 1}`),
        state,
        isPrimary: index === 0 || Boolean(address.isPrimary),
      };
    });
    const id = crypto.randomUUID();
    const db = await getD1();
    const statements: D1PreparedStatement[] = [
      db
        .prepare(
          `insert into clients (
            id, type, legal_name, trade_name, cpf_cnpj, state_registration,
            notes, active
          ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          type,
          legalName,
          upper(payload.tradeName),
          cpfCnpj,
          upper(payload.stateRegistration),
          upper(payload.notes),
          payload.active === false ? 0 : 1,
        ),
    ];
    for (const contact of contacts) {
      statements.push(
        db
          .prepare(
            `insert into client_contacts (
              id, client_id, name, phone, whatsapp, email, is_primary
            ) values (?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            contact.id,
            id,
            contact.name,
            contact.phone,
            contact.whatsapp,
            contact.email,
            contact.isPrimary ? 1 : 0,
          ),
      );
    }
    for (const address of addresses) {
      statements.push(
        db
          .prepare(
            `insert into client_addresses (
              id, client_id, type, label, contact_name, phone, cep, street,
              number, complement, district, city, state, is_primary
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            address.id,
            id,
            address.type,
            address.label,
            address.contactName,
            address.phone,
            address.cep,
            address.street,
            address.number,
            address.complement,
            address.district,
            address.city,
            address.state,
            address.isPrimary ? 1 : 0,
          ),
      );
    }
    statements.push(
      db
        .prepare(
          `insert into audit_logs (
            id, entity_type, entity_id, action, actor_user_id, actor_email,
            new_value, request_id
          ) values (?, 'CLIENT', ?, 'CREATED', ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          id,
          user.id,
          user.email,
          JSON.stringify({ type, legalName, cpfCnpj, contactCount: contacts.length }),
          request.headers.get("x-request-id") ?? crypto.randomUUID(),
        ),
    );
    await db.batch(statements);
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint")) {
      return Response.json(
        { error: "Já existe um cliente com esse CPF/CNPJ." },
        { status: 409 },
      );
    }
    return jsonError(error);
  }
}
