import { ApiError, getD1, jsonError, queryFirst } from "@/lib/server/d1";
import {
  createUserSessionToken,
  isLocalRequest,
  LOCAL_SESSION_COOKIE,
  verifyPassword,
} from "@/lib/server/local-session";
import { asObject } from "@/lib/server/validation";

type LoginUserRow = {
  id: string;
  email: string;
  username: string | null;
  passwordSalt: string | null;
  passwordHash: string | null;
  name: string;
  role: string;
  active: number;
};

function normalizeUsername(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export async function POST(request: Request) {
  try {
    const payload = asObject(await request.json());
    const username = normalizeUsername(payload.username);
    const password = String(payload.password ?? "");
    if (!username) throw new ApiError(400, "Informe o usuário.");
    if (!password) throw new ApiError(400, "Informe a senha.");

    const count = await queryFirst<{ total: number }>(`select count(*)::integer as total from users`);
    if (Number(count?.total ?? 0) === 0) {
      throw new ApiError(409, "Nenhum administrador foi cadastrado. Configure o administrador inicial.");
    }

    const user = await queryFirst<LoginUserRow>(
      `select id, email, username, password_salt as passwordSalt,
        password_hash as passwordHash, name, role, active
       from users
       where lower(coalesce(username, '')) = ?
       limit 1`,
      [username],
    );

    if (!user || !user.active || !user.passwordHash || !user.passwordSalt) {
      throw new ApiError(401, "Usuário ou senha incorretos.");
    }

    if (!(await verifyPassword(password, user.passwordSalt, user.passwordHash))) {
      throw new ApiError(401, "Usuário ou senha incorretos.");
    }

    const sessionUsername = user.username!;
    const token = await createUserSessionToken({
      id: user.id,
      email: user.email,
      username: sessionUsername,
      name: user.name,
    });
    const secure = isLocalRequest(request) ? "" : "; Secure";
    return Response.json(
      { authenticated: true, role: user.role },
      {
        headers: {
          "set-cookie": `${LOCAL_SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${secure}`,
          "cache-control": "no-store",
        },
      },
    );
  } catch (error) {
    return jsonError(error);
  }
}
