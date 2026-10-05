import { assertTrustedMutation, readAuthJson } from '@/lib/server/request-security';
import { assertAccessGateway } from '@/lib/server/access-gateway';
import { assertSetupToken } from '@/lib/server/auth-security';
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

export async function GET(request: Request) {
  try {
    await assertAccessGateway(request);
    const count = await queryFirst<{ total: number }>(`select count(*)::integer as total from users`);
    return Response.json(
      { setupRequired: Number(count?.total ?? 0) === 0 && Boolean(process.env.CENTRAL_FRETE_SETUP_TOKEN?.trim()) },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertTrustedMutation(request);
    await assertAccessGateway(request);
    assertSetupToken(request);
    const count = await queryFirst<{ total: number }>(`select count(*)::integer as total from users`);
    if (Number(count?.total ?? 0) !== 0) {
      throw new ApiError(409, "O administrador inicial já foi cadastrado.");
    }

    const payload = asObject(await readAuthJson(request));
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

    const results = await db.batch([
      db.prepare("select pg_advisory_xact_lock(hashtext('central-frete-initial-admin'))"),
      db.prepare(
        `insert into users (
          id, email, username, password_salt, password_hash, name, role, active
        ) select ?, ?, ?, ?, ?, ?, 'ADMIN', 1 where not exists (select 1 from users) returning id`,
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
        ) select ?, 'USER', ?, 'INITIAL_ADMIN_CREATED', ?, ? where exists (select 1 from users where id = ?)`
      ).bind(
        crypto.randomUUID(),
        id,
        email,
        JSON.stringify({ username, name, role: "ADMIN" }),
        id,
      ),
    ]);

    if (!results[1]?.results.length) throw new ApiError(409, "O administrador inicial já foi cadastrado.");
    return Response.json({ created: true, username }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint")) {
      return Response.json({ error: "Usuário já cadastrado." }, { status: 409 });
    }
    return jsonError(error);
  }
}
