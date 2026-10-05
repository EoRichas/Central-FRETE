import { LOCAL_SESSION_COOKIE, revokeSession } from '@/lib/server/local-session';
import { assertTrustedMutation } from '@/lib/server/request-security';
import { assertAccessGateway } from '@/lib/server/access-gateway';
import { recordAuthEvent } from '@/lib/server/auth-security';
import { jsonError } from '@/lib/server/d1';

export async function POST(request: Request) {
  try {
    assertTrustedMutation(request);
    await assertAccessGateway(request);
    const all = new URL(request.url).searchParams.get('all') === 'true';
    const session = await revokeSession(request, all);
    if (session) await recordAuthEvent(all ? 'LOGOUT_ALL' : 'LOGOUT', session.userId, session.userId);
    return Response.json({authenticated: false}, {headers: {
      'set-cookie': `${LOCAL_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`,
      'cache-control': 'private, no-store',
    }});
  } catch (error) { return jsonError(error); }
}
