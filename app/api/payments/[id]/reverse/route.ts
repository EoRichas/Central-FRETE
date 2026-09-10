import { authorize } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/d1";

export async function POST(request: Request) {
  try {
    await authorize(request, ["ADMIN", "FINANCEIRO"]);
    return Response.json({ error: "A opção Estornar foi substituída por Excluir recebimento." }, { status: 410 });
  } catch (error) { return jsonError(error); }
}
