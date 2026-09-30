import { authorize } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/d1";
import { loadFleetCreationData } from "@/lib/server/fleet";

export async function GET(request: Request) {
  try {
    await authorize(request, ["ADMIN", "GERENCIA", "VENDEDOR", "OPERACIONAL"]);
    return Response.json({fleet: await loadFleetCreationData()});
  } catch (error) { return jsonError(error); }
}
