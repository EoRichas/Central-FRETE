import { createHmac, timingSafeEqual } from 'node:crypto';
import { ApiError, queryFirst } from './d1';

export function securityKey(value: string) {
  const secret = process.env.CENTRAL_FRETE_SESSION_SECRET?.trim();
  if (!secret || secret.length < 32) throw new ApiError(503, 'Configuração de segurança indisponível.');
  return createHmac('sha256', secret).update(value).digest('hex');
}

export async function recordAuthEvent(action: string, subject: string, userId: string | null = null) {
  // No password, raw username, cookie, IP or external token is recorded.
  await queryFirst(`insert into audit_logs(id,entity_type,entity_id,action,actor_user_id,actor_email)
    values (?, 'AUTH', ?, ?, ?, 'security@centralfrete.local') returning id`,
    [crypto.randomUUID(), securityKey(subject), action, userId]);
}

async function consume(key: string, limit: number) {
  const row = await queryFirst<{attempts: number; retryAfter: number}>(`
    insert into auth_login_limits(key_hash,attempts,expires_at) values (?,1,now()+interval '15 minutes')
    on conflict(key_hash) do update set
      attempts = case when auth_login_limits.expires_at <= now() then 1 else least(auth_login_limits.attempts+1, ?) end,
      expires_at = case when auth_login_limits.expires_at <= now() then now()+interval '15 minutes' else auth_login_limits.expires_at end
    returning attempts, greatest(1,ceil(extract(epoch from (expires_at-now()))))::integer as retryAfter`,
    [securityKey(key), limit + 2]);
  if (!row) throw new ApiError(503, 'Proteção de acesso indisponível.');
  if (row.attempts > limit) {
    // Log only the transition; blocked retries must not grow the audit log.
    if (row.attempts === limit + 1) await recordAuthEvent("LOGIN_THROTTLED", key);
    throw new ApiError(429, 'Muitas tentativas de acesso. Aguarde alguns minutos e tente novamente.', {retryAfter: row.retryAfter});
  }
  return row.attempts;
}

export async function limitLogin(username: string) {
  // A bounded shared budget also covers invented usernames. No untrusted IP header
  // is used: a spoofed X-Forwarded-For cannot bypass this database-backed limit.
  const count = await consume('login:global', 120);
  if (count === 1) {
    await queryFirst(`with removed as (delete from auth_login_limits where key_hash in
      (select key_hash from auth_login_limits where expires_at < now()-interval '1 day' limit 500) returning key_hash)
      select count(*) from removed`);
    await queryFirst(`with removed as (delete from auth_sessions where token_hash in
      (select token_hash from auth_sessions where expires_at < now() limit 500) returning token_hash)
      select count(*) from removed`);
  }
  await consume(`login:account:${username}`, 10);
}

export function assertSetupToken(request: Request) {
  const expected = process.env.CENTRAL_FRETE_SETUP_TOKEN?.trim();
  const supplied = request.headers.get('x-setup-token') || '';
  if (!expected || expected.length < 32 || supplied.length > 256 ||
      !timingSafeEqual(Buffer.from(securityKey(expected)), Buffer.from(securityKey(supplied)))) {
    throw new ApiError(403, 'Configuração inicial restrita ao administrador da hospedagem.');
  }
}
