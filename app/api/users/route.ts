import type { Role } from "@/lib/contracts";
import { authorize } from "@/lib/server/auth";
import { ApiError, getD1, jsonError, queryAll } from "@/lib/server/d1";
import { createPasswordCredential } from "@/lib/server/local-session";
import { asObject, enumValue, requiredUpper } from "@/lib/server/validation";

const ROLES = ["ADMIN", "GERENCIA", "VENDEDOR", "FINANCEIRO"] as const;

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

export async function GET(request: Request) {
  try {
    await authorize(request, ["ADMIN"]);
    const users = await queryAll<{
      id: string;
      name: string;
      email: string;
      username: string | null;
      pixDetails: string | null;
      role: Role;
      active: number;
      hasPassword: number;
    }>(
      `select id, name, email, username, pix_details as pixDetails, role, active,
        case when password_hash is not null and password_salt is not null then 1 else 0 end as hasPassword
       from users order by active desc, name`,
    );
    return Response.json({
      users: users.map((user) => ({
        ...user,
        active: Boolean(user.active),
        hasPassword: Boolean(user.hasPassword),
      })),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await authorize(request, ["ADMIN"]);
    const payload = asObject(await request.json());
    const name = requiredUpper(payload.name, "Nome");
    const role = enumValue(payload.role, "Perfil", ROLES);
    const username = usernameValue(payload.username);
    let credential: Awaited<ReturnType<typeof createPasswordCredential>>;
    try {
      credential = await createPasswordCredential(payload.password);
    } catch (error) {
      throw new ApiError(400, error instanceof Error ? error.message : "Senha inválida.");
    }
    const pixDetails = String(payload.pixDetails ?? "").trim() || null;
    const id = crypto.randomUUID();
    const email = `${username}@centralfrete.local`;
    const db = await getD1();
    await db.batch([
      db.prepare(
        `insert into users (
          id, email, username, password_salt, password_hash, pix_details,
          name, role, active
        ) values (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      ).bind(
        id,
        email,
        username,
        credential.passwordSalt,
        credential.passwordHash,
        pixDetails,
        name,
        role,
      ),
      db.prepare(
        `insert into audit_logs (
          id, entity_type, entity_id, action, actor_user_id, actor_email,
          new_value, request_id
        ) values (?, 'USER', ?, 'CREATED', ?, ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        id,
        actor.id,
        actor.email,
        JSON.stringify({ username, name, role, pixDetails }),
        request.headers.get("x-request-id") ?? crypto.randomUUID(),
      ),
    ]);
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint")) {
      return Response.json({ error: "Usuário já cadastrado." }, { status: 409 });
    }
    return jsonError(error);
  }
}
