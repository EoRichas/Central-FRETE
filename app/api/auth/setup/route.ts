import { ApiError, getD1, jsonError, queryFirst } from "@/lib/server/d1";
import { createPasswordCredential } from "@/lib/server/local-session";
import { asObject, requiredUpper } from "@/lib/server/validation";

function normalizeUsername(value: unknown) {
  const username = String(value ?? "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
    throw new ApiError(400, "Usuário inválido. Use de 3 a 40 caracteres: letras, números, ponto, hífen ou underline.");
  }
  return username;
}

function setupToken() {
  const token = process.env.CENTRAL_FRETE_SETUP_TOKEN?.trim();
  if (!token || token.length < 24) {
    throw new ApiError(503, "Configuração inicial indisponível. Defina CENTRAL_FRETE_SETUP_TOKEN no servidor.");
  }
  return token;
}

function constantTimeEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

export async function GET() {
  try {
    const count = await queryFirst<{ total: number }>(`select count(*)::integer as total from users`);
    return Response.json(
      { setupRequired: Number(count?.total ?? 0) === 0 },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = asObject(await request.json());
    const suppliedToken = String(payload.setupToken ?? "");
    if (!constantTimeEqual(suppliedToken, setupToken())) {
      throw new ApiError(403, "Token de configuração inválido.");
    }

    const count = await queryFirst<{ total: number }>(`select count(*)::integer as total from users`);
    if (Number(count?.total ?? 0) !== 0) {
      throw new ApiError(409, "O administrador inicial já foi cadastrado.");
    }

    const username = normalizeUsername(payload.username);
    const name = requiredUpper(payload.name, "Nome");
    const password = String(payload.password ?? "");
    const passwordConfirmation = String(payload.passwordConfirmation ?? "");

    if (password !== passwordConfirmation) {
      throw new ApiError(400, "As senhas não conferem.");
    }

    let credential: Awaited<ReturnType<typeof createPasswordCredential>>;
    try {
      credential = await createPasswordCredential(password);
    } catch (error) {
      throw new ApiError(400, error instanceof Error ? error.message : "Senha inválida.");
    }

    const id = crypto.randomUUID();
    const email = `${username}@centralfrete.local`;
    const db = await getD1();

    await db.batch([
      db.prepare(
        `insert into users (
          id, email, username, password_salt, password_hash, name, role, active
        ) values (?, ?, ?, ?, ?, ?, 'ADMIN', 1)`,
      ).bind(
        id,
        email,
        username,
        credential.passwordSalt,
        credential.passwordHash,
        name,
      ),
      db.prepare(
        `insert into audit_logs (
          id, entity_type, entity_id, action, actor_email, new_value
        ) values (?, 'USER', ?, 'INITIAL_ADMIN_CREATED', ?, ?)`
      ).bind(
        crypto.randomUUID(),
        id,
        email,
        JSON.stringify({ username, name, role: "ADMIN" }),
      ),
    ]);

    return Response.json({ created: true, username }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
