import { queryAll } from "@/lib/server/d1";
import { verifyDirectory, directoryError } from "@/lib/server/support-directory";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const directory = verifyDirectory(request, "central");
    const users = await queryAll<{id:string;name:string}>("select id, name from users where active = 1 order by name, id limit 1001");
    return Response.json(directory(users), {headers:{"cache-control":"private, no-store"}});
  } catch(error) { return directoryError(error); }
}
