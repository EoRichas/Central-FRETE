import { authorize } from "@/lib/server/auth";
import { jsonError, queryAll } from "@/lib/server/d1";
export async function GET(request: Request) {
  try {
    const user = await authorize(request, ["ADMIN", "VENDEDOR"]);
    const sellers = await queryAll<{id: string; name: string; commissionBasisPoints: number}>(`select id,name,commission_basis_points as commissionBasisPoints from users where role='VENDEDOR' and active=1 ${user.role === 'VENDEDOR' ? 'and id=?' : ''} order by name,id`, user.role === 'VENDEDOR' ? [user.id] : []);
    return Response.json({sellers}, {headers:{"cache-control":"private, no-store"}});
  } catch (error) { return jsonError(error); }
}
