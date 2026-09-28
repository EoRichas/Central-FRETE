import { authorize } from "@/lib/server/auth";
import { jsonError, queryAll } from "@/lib/server/d1";
export async function GET(request: Request) {
  try {
    await authorize(request, ["ADMIN", "OPERACIONAL", "VENDEDOR"]);
    const sellers = await queryAll<{id: string; name: string}>("select id,name from users where role='VENDEDOR' and active=1 order by name,id");
    return Response.json({sellers}, {headers:{"cache-control":"private, no-store"}});
  } catch (error) { return jsonError(error); }
}
