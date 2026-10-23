import { authorize } from "@/lib/server/auth";
import { jsonError, queryAll } from "@/lib/server/d1";
export async function GET(request: Request) {
  try {
    const assignment=new URL(request.url).searchParams.get('assignment')==='1';
    const user = await authorize(request, assignment ? undefined : ["ADMIN", "FINANCEIRO", "VENDEDOR", "OPERACIONAL"]);
    if(assignment){
      const sellers=await queryAll<{id:string;name:string}>("select id,name from users where role in ('VENDEDOR','OPERACIONAL') and active=1 and deleted_at is null order by name,id");
      return Response.json({sellers},{headers:{"cache-control":"private, no-store"}});
    }
    const sellers = await queryAll<{id: string; name: string; commissionBasisPoints: number}>(`select id,name,commission_basis_points as commissionBasisPoints from users where role in ('VENDEDOR','OPERACIONAL') and active=1 ${['VENDEDOR','OPERACIONAL'].includes(user.role) ? 'and id=?' : ''} order by name,id`, ['VENDEDOR','OPERACIONAL'].includes(user.role) ? [user.id] : []);
    return Response.json({sellers: user.role === 'FINANCEIRO' ? sellers.map(({id,name})=>({id,name})) : sellers}, {headers:{"cache-control":"private, no-store"}});
  } catch (error) { return jsonError(error); }
}
