import { authorize } from "@/lib/server/auth";
import { ApiError, getD1, jsonError, queryFirst } from "@/lib/server/d1";
import { asObject, digits, lower, requiredUpper } from "@/lib/server/validation";

type RouteContext = { params: Promise<{ id: string }> };

type ProviderRow = {
  id: string;
  name: string;
  referenceName: string | null;
  yardAddress: string | null;
  document: string | null;
  phone: string | null;
  email: string | null;
  active: number;
};

function activeValue(value: unknown) {
  if (value === true || value === 1 || value === "1" || value === "true") {
    return true;
  }
  if (value === false || value === 0 || value === "0" || value === "false") {
    return false;
  }
  throw new ApiError(400, "Situação do prestador inválida.");
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await authorize(request, ["ADMIN"]);
    const { id } = await context.params;
    const previous = await queryFirst<ProviderRow>(
      `select id, name, reference_name as referenceName,
        yard_address as yardAddress, document, phone, email, active
       from providers where id = ?`,
      [id],
    );
    if (!previous) throw new ApiError(404, "Prestador não encontrado.");

    const payload = asObject(await request.json());
    const data = {
      name: requiredUpper(
        payload.companyName ?? payload.name,
        "Empresa do prestador",
      ),
      referenceName: requiredUpper(
        payload.referenceName,
        "Nome de referência",
      ),
      yardAddress: requiredUpper(payload.yardAddress, "Endereço do pátio"),
      document: digits(payload.document),
      phone: digits(payload.phone),
      email: lower(payload.email),
      active: activeValue(payload.active),
    };
    const db = await getD1();
    await db.batch([
      db
        .prepare(
          `update providers set name = ?, reference_name = ?, yard_address = ?,
            document = ?, phone = ?, email = ?, active = ?,
            updated_at = to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
           where id = ?`,
        )
        .bind(
          data.name,
          data.referenceName,
          data.yardAddress,
          data.document,
          data.phone,
          data.email,
          data.active ? 1 : 0,
          id,
        ),
      db
        .prepare(
          `insert into audit_logs (
            id, entity_type, entity_id, action, actor_user_id, actor_email,
            previous_value, new_value, request_id
          ) values (?, 'PROVIDER', ?, 'UPDATED', ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          id,
          user.id,
          user.email,
          JSON.stringify({ ...previous, active: Boolean(previous.active) }),
          JSON.stringify(data),
          request.headers.get("x-request-id") ?? crypto.randomUUID(),
        ),
    ]);
    return Response.json({ id, updated: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint")) {
      return Response.json(
        { error: "Já existe outro prestador com esse CPF/CNPJ." },
        { status: 409 },
      );
    }
    return jsonError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await authorize(request, ["ADMIN"]);
    const { id } = await context.params;
    const previous = await queryFirst<ProviderRow>(
      `select id, name, reference_name as referenceName,
        yard_address as yardAddress, document, phone, email, active
       from providers where id = ?`,
      [id],
    );
    if (!previous) throw new ApiError(404, "Prestador não encontrado.");

    const db = await getD1();
    await db.batch([
      db
        .prepare(
          `insert into audit_logs (
            id, entity_type, entity_id, action, actor_user_id, actor_email,
            previous_value, request_id
          ) values (?, 'PROVIDER', ?, 'DELETED', ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          id,
          user.id,
          user.email,
          JSON.stringify({ ...previous, active: Boolean(previous.active) }),
          request.headers.get("x-request-id") ?? crypto.randomUUID(),
        ),
      db.prepare("delete from providers where id = ?").bind(id),
    ]);
    return Response.json({ deleted: true });
  } catch (error) {
    return jsonError(error);
  }
}
