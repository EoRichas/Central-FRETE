import { authorize } from "@/lib/server/auth";
import { ApiError, getD1, jsonError, queryFirst } from "@/lib/server/d1";
import {
  asObject,
  digits,
  enumValue,
  requiredUpper,
  upper,
} from "@/lib/server/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await authorize(request, ["ADMIN"]);
    const { id: clientId } = await context.params;
    const client = await queryFirst<{ id: string; legalName: string }>(
      "select id, legal_name as legalName from clients where id = ? and active = 1",
      [clientId],
    );
    if (!client) throw new ApiError(404, "Cliente não encontrado ou inativo.");

    const payload = asObject(await request.json());
    const uiType = enumValue(payload.type, "Tipo de endereço", [
      "EMPRESA",
      "COLETA",
      "ENTREGA",
    ] as const);
    const dbType = uiType === "EMPRESA" ? "COBRANCA" : uiType;
    const state = requiredUpper(payload.state, "UF");
    if (state.length !== 2) throw new ApiError(400, "UF deve possuir 2 letras.");

    const existing = await queryFirst<{ count: number }>(
      "select count(*) as count from client_addresses where client_id = ? and type = ?",
      [clientId, dbType],
    );
    const addressId = crypto.randomUUID();
    const address = {
      id: addressId,
      type: dbType,
      label: upper(payload.label),
      contactName: upper(payload.contactName),
      phone: digits(payload.phone),
      cep: digits(payload.cep),
      street: requiredUpper(payload.street, "Logradouro"),
      number: requiredUpper(payload.number, "Número"),
      complement: upper(payload.complement),
      district: requiredUpper(payload.district, "Bairro"),
      city: requiredUpper(payload.city, "Cidade"),
      state,
      isPrimary: (existing?.count ?? 0) === 0,
    };

    const db = await getD1();
    await db.batch([
      db
        .prepare(
          `insert into client_addresses (
            id, client_id, type, label, contact_name, phone, cep, street,
            number, complement, district, city, state, is_primary
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          address.id,
          clientId,
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
      db
        .prepare(
          `insert into audit_logs (
            id, entity_type, entity_id, action, actor_user_id, actor_email,
            new_value, request_id
          ) values (?, 'CLIENT_ADDRESS', ?, 'CREATED', ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          addressId,
          user.id,
          user.email,
          JSON.stringify({ ...address, clientId, clientName: client.legalName, type: uiType }),
          request.headers.get("x-request-id") ?? crypto.randomUUID(),
        ),
    ]);

    return Response.json({ id: addressId }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
