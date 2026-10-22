import { authorize } from '@/lib/server/auth';
import { limitPasswordChange, recordAuthEvent } from '@/lib/server/auth-security';
import { ApiError, jsonError, queryFirst } from '@/lib/server/d1';
import { createPasswordCredential, LOCAL_SESSION_COOKIE, verifyPassword } from '@/lib/server/local-session';
import { readAuthJson } from '@/lib/server/request-security';
import { asObject } from '@/lib/server/validation';

export async function POST(request: Request) {
  try {
    const user = await authorize(request);
    const payload = asObject(await readAuthJson(request));
    const {currentPassword, newPassword, passwordConfirmation} = payload;
    if (typeof currentPassword !== 'string' || !currentPassword || currentPassword.length > 4096 ||
        typeof newPassword !== 'string' || newPassword.length < 6 || newPassword.length > 4096 ||
        typeof passwordConfirmation !== 'string' || newPassword !== passwordConfirmation) {
      throw new ApiError(400, 'Informe a senha atual e confirme a nova senha com pelo menos seis caracteres.');
    }
    await limitPasswordChange(user.id);
    const stored = await queryFirst<{passwordSalt: string; passwordHash: string; securityVersion: number}>(
      `select password_salt as passwordSalt, password_hash as passwordHash, security_version as securityVersion
       from users where id=? and active=1`, [user.id]);
    if (!stored?.passwordSalt || !stored.passwordHash || !(await verifyPassword(currentPassword, stored.passwordSalt, stored.passwordHash))) {
      await recordAuthEvent('PASSWORD_CHANGE_FAILED', user.id, user.id);
      throw new ApiError(400, 'Senha atual incorreta.');
    }
    const credential = await createPasswordCredential(newPassword);
    // Compare-and-swap prevents a concurrent reset from being overwritten. The
    // existing users_security_version trigger revokes every previous session.
    const changed = await queryFirst(`with changed as (
      update users set password_salt=?,password_hash=?,updated_at=now()
      where id=? and active=1 and password_hash=? and security_version=? returning id
    ) insert into audit_logs(id,entity_type,entity_id,action,actor_user_id,actor_email)
      select ?,'AUTH',id,'PASSWORD_CHANGED',?,'security@centralfrete.local' from changed returning id`,
      [credential.passwordSalt,credential.passwordHash,user.id,stored.passwordHash,stored.securityVersion,crypto.randomUUID(),user.id]);
    if (!changed) throw new ApiError(409, 'O acesso foi alterado. Entre novamente.');
    return Response.json({changed: true}, {headers: {
      'set-cookie': `${LOCAL_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`,
      'cache-control': 'private, no-store',
    }});
  } catch (error) { return jsonError(error); }
}
