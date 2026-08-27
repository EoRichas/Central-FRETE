import type { Role } from "@/lib/contracts";
import { authorize } from "@/lib/server/auth";
import { ApiError, getD1, jsonError, queryFirst } from "@/lib/server/d1";
import { createPasswordCredential } from "@/lib/server/local-session";
import { asObject, enumValue, lower, requiredUpper } from "@/lib/server/validation";

const ASSIGNABLE_ROLES = ["ADMIN", "VENDEDOR", "FINANCEIRO"] as const;
type RouteContext = { params: Promise<{ id: string }> };

function usernameValue(value: unknown) {
  const username = String(value ?? "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
    throw new ApiError(
      400,
      "Usuário inválido. Use de 3 a 40 caracteres: letras, números, ponto, hífen ou underline.",
    );
  }
  return username;
}

function activeValue(value: unknown) {
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  if (value === false || value === 0 || value === "0" || value === "false") return false;
  throw new ApiError(400, "Situação do usuário inválida.");
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const actor = await authorize(request, ["ADMIN"]);
    const { id } = await context.params;
    const previous = await queryFirst<{
      id: string;
      email: string;
      username: string | null;
      name: string;
      role: Role;
      active: number;
      pixDetails: string | null;
    }>(
      `select id, email, username, name, role, active, pix_details as pixDetails
       from users where id = ?`,
      [id],
    );
    if (!previous) throw new ApiError(404, "Usuário não encontrado.");

    const payload = asObject(await request.json());
    const email = lower(payload.email);
    if (!email || !email.includes("@")) throw new ApiError(400, "E-mail inválido.");
    const username = usernameValue(payload.username);
    const name = requiredUpper(payload.name, "Nome");
    const role = enumValue(payload.role, "Perfil", ASSIGNABLE_ROLES);
    const active = activeValue(payload.active);
    const pixDetails = String(payload.pixDetails ?? "").trim() || null;

    if (id === actor.id && (!active || role !== "ADMIN")) {
      throw new ApiError(
        400,
        "O administrador logado não pode desativar o próprio acesso nem remover o próprio perfil ADMIN.",
      );
    }

    const newPassword = String(payload.password ?? "");
    let credential: Awaited<ReturnType<typeof createPasswordCredential>> | null = null;
    if (newPassword) {
      try {
        credential = await createPasswordCredential(newPassword);
      } catch (error) {
        throw new ApiError(
          400,
          error instanceof Error ? error.message : "Senha inválida.",
        );
      }
    }

    const db = await getD1();
    const update = credential
      ? db
          .prepare(
            `update users set email = ?, username = ?, name = ?, role = ?, active = ?,
              pix_details = ?, password_salt = ?, password_hash = ?,
              updated_at = to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
             where id = ?`,
          )
          .bind(
            email,
            username,
            name,
            role,
            active ? 1 : 0,
            pixDetails,
            credential.passwordSalt,
            credential.passwordHash,
            id,
          )
      : db
          .prepare(
            `update users set email = ?, username = ?, name = ?, role = ?, active = ?,
              pix_details = ?, updated_at = to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
             where id = ?`,
          )
          .bind(email, username, name, role, active ? 1 : 0, pixDetails, id);

    await db.batch([
      update,
      db
        .prepare(
          `insert into audit_logs (
            id, entity_type, entity_id, action, actor_user_id, actor_email,
            previous_value, new_value, request_id
          ) values (?, 'USER', ?, 'UPDATED', ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          id,
          actor.id,
          actor.email,
          JSON.stringify({ ...previous, active: Boolean(previous.active) }),
          JSON.stringify({
            email,
            username,
            name,
            role,
            active,
            pixDetails,
            passwordChanged: Boolean(credential),
          }),
          request.headers.get("x-request-id") ?? crypto.randomUUID(),
        ),
    ]);
    return Response.json({ id, updated: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint")) {
      return Response.json(
        { error: "E-mail ou usuário já cadastrado." },
        { status: 409 },
      );
    }
    return jsonError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const actor = await authorize(request, ["ADMIN"]);
    const { id } = await context.params;
    if (id === actor.id) {
      throw new ApiError(400, "O administrador logado não pode excluir o próprio acesso.");
    }
    const previous = await queryFirst<{
      id: string;
      email: string;
      username: string | null;
      name: string;
      role: Role;
      active: number;
      pixDetails: string | null;
    }>(
      `select id, email, username, name, role, active, pix_details as pixDetails
       from users where id = ?`,
      [id],
    );
    if (!previous) throw new ApiError(404, "Usuário não encontrado.");

    const db = await getD1();
    await db.batch([
      db
        .prepare(
          `insert into audit_logs (
            id, entity_type, entity_id, action, actor_user_id, actor_email,
            previous_value, request_id
          ) values (?, 'USER', ?, 'ACCESS_DELETED', ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          id,
          actor.id,
          actor.email,
          JSON.stringify({ ...previous, active: Boolean(previous.active) }),
          request.headers.get("x-request-id") ?? crypto.randomUUID(),
        ),
      db
        .prepare(
          `delete from editable_tool_documents
           where document_key = 'CALCULATOR' and owner_key = ?`,
        )
        .bind(id),
      db.prepare("delete from users where id = ?").bind(id),
    ]);
    return Response.json({ id, deleted: true });
  } catch (error) {
    return jsonError(error);
  }
}
