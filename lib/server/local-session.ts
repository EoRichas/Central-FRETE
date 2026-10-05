import { ApiError, queryFirst } from './d1';
export const LOCAL_SESSION_COOKIE = "cf_local_session";

export type UserSession = {
  userId: string;
  tokenHash: string;
  email: string;
  username: string;
  name: string;
  expiresAt: number;
};

function base64UrlEncode(value: Uint8Array | string) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(normalized + padding);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function derivePassword(password: string, salt: Uint8Array<ArrayBuffer>) {
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 120_000 }, keyMaterial, 256);
  return new Uint8Array(bits);
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

export function isLocalRequest(request: Request) {
  const hostname = new URL(request.url).hostname.toLowerCase();
  return ["localhost", "127.0.0.1", "::1", "terminal.local"].includes(hostname);
}

export async function createPasswordCredential(passwordValue: unknown) {
  const password = String(passwordValue ?? "");
  if (password.length < 6) throw new Error("A senha deve ter pelo menos 6 caracteres.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePassword(password, salt);
  return { passwordSalt: base64UrlEncode(salt), passwordHash: base64UrlEncode(hash) };
}

export async function verifyPassword(passwordValue: unknown, passwordSalt: string | null, passwordHash: string | null) {
  if (!passwordSalt || !passwordHash) return false;
  try {
    const supplied = await derivePassword(String(passwordValue ?? ""), base64UrlDecode(passwordSalt));
    return constantTimeEqual(supplied, base64UrlDecode(passwordHash));
  } catch {
    return false;
  }
}

async function tokenHash(token: string) {
  return base64UrlEncode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))));
}

export async function createUserSessionToken(user: { id: string; email: string; username: string; name: string; securityVersion?: number }): Promise<string> {
  const token = base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
  const hash = await tokenHash(token);
  const saved = await queryFirst(`insert into auth_sessions(token_hash,user_id,security_version,expires_at)
    select ?,id,security_version,now()+interval '12 hours' from users
    where id=? and (?::integer is null or security_version=?) returning token_hash`,
    [hash,user.id,user.securityVersion ?? null,user.securityVersion ?? null]);
  if (!saved) throw new ApiError(401, 'O acesso foi alterado. Entre novamente.');
  return token;
}

function cookieValue(request: Request, name: string) {
  const matches = (request.headers.get('cookie') || '').split(';')
    .map(item => item.trim().split('=')).filter(([key]) => key === name);
  // Reject ambiguous cookies instead of trusting a sibling-subdomain cookie.
  return matches.length === 1 ? matches[0].slice(1).join('=') : null;
}

export async function verifyLocalSession(request: Request): Promise<UserSession | null> {
  const token = cookieValue(request, LOCAL_SESSION_COOKIE);
  // Legacy signed sessions deliberately require a new login after deployment.
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return queryFirst<UserSession>(`select s.token_hash as tokenHash,u.id as userId,u.email,
    coalesce(u.username,u.id) as username,u.name,extract(epoch from s.expires_at)*1000 as expiresAt
    from auth_sessions s join users u on u.id=s.user_id
    where s.token_hash=? and s.revoked_at is null and s.expires_at>now()
      and s.security_version=u.security_version limit 1`, [await tokenHash(token)]);
}

export async function revokeSession(request: Request, all = false) {
  const session = await verifyLocalSession(request);
  if (!session) return null;
  if (all) {
    await queryFirst('update users set security_version=security_version+1 where id=? returning id', [session.userId]);
  } else {
    await queryFirst('update auth_sessions set revoked_at=now() where token_hash=? returning token_hash', [session.tokenHash]);
  }
  return session;
}
