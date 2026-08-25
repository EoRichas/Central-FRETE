export const LOCAL_SESSION_COOKIE = "cf_local_session";

export type UserSession = {
  userId: string;
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

async function sessionSecret() {
  const secret = process.env.CENTRAL_FRETE_SESSION_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("CENTRAL_FRETE_SESSION_SECRET deve ter pelo menos 32 caracteres.");
  }
  return secret;
}

async function derivePassword(password: string, salt: Uint8Array) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const saltBuffer = salt.slice().buffer as ArrayBuffer;
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: saltBuffer, iterations: 120_000 },
    keyMaterial,
    256,
  );
  return new Uint8Array(bits);
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function signature(payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(await sessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64UrlEncode(
    new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload))),
  );
}

export function isLocalRequest(request: Request) {
  const hostname = new URL(request.url).hostname.toLowerCase();
  return ["localhost", "127.0.0.1", "::1", "terminal.local"].includes(hostname);
}

export async function createPasswordCredential(passwordValue: unknown) {
  const password = String(passwordValue ?? "");
  if (password.length < 8) throw new Error("A senha deve ter pelo menos 8 caracteres.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePassword(password, salt);
  return { passwordSalt: base64UrlEncode(salt), passwordHash: base64UrlEncode(hash) };
}

export async function verifyPassword(
  passwordValue: unknown,
  passwordSalt: string | null,
  passwordHash: string | null,
) {
  if (!passwordSalt || !passwordHash) return false;
  try {
    const supplied = await derivePassword(String(passwordValue ?? ""), base64UrlDecode(passwordSalt));
    return constantTimeEqual(supplied, base64UrlDecode(passwordHash));
  } catch {
    return false;
  }
}

export async function createUserSessionToken(user: {
  id: string;
  email: string;
  username: string;
  name: string;
}): Promise<string> {
  const session: UserSession = {
    userId: user.id,
    email: user.email,
    username: user.username,
    name: user.name,
    expiresAt: Date.now() + 12 * 60 * 60 * 1000,
  };
  const payload = base64UrlEncode(JSON.stringify(session));
  return `${payload}.${await signature(payload)}`;
}

function cookieValue(request: Request, name: string) {
  const cookies = request.headers.get("cookie") ?? "";
  for (const item of cookies.split(";")) {
    const [key, ...value] = item.trim().split("=");
    if (key === name) return value.join("=");
  }
  return null;
}

export async function verifyLocalSession(request: Request) {
  const token = cookieValue(request, LOCAL_SESSION_COOKIE);
  if (!token) return null;
  const [payload, suppliedSignature, extra] = token.split(".");
  if (!payload || !suppliedSignature || extra) return null;
  const expectedSignature = await signature(payload);
  if (
    !constantTimeEqual(
      new TextEncoder().encode(suppliedSignature),
      new TextEncoder().encode(expectedSignature),
    )
  ) return null;
  try {
    const session = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload))) as UserSession;
    if (
      !session.userId || !session.email || !session.username || !session.name ||
      !Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now()
    ) return null;
    return session;
  } catch {
    return null;
  }
}
