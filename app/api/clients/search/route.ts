import { authorize } from "@/lib/server/auth";
import { jsonError, queryAll } from "@/lib/server/d1";
import { enumValue } from "@/lib/server/validation";
import type { ClientSearchOption } from "@/lib/domain/client-search";

export async function GET(request: Request) {
  try {
    await authorize(request);
    const params = new URL(request.url).searchParams;
    const channel = enumValue(params.get("channel"), "Canal", ["FROTA", "CEGONHA"] as const);
    const query = (params.get("q") ?? "").trim().slice(0, 120);
    if (query.length < 2) return Response.json({ clients: [], hasMore: false });
    const normalized = query.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");
    const pattern = `%${escapeLike(normalized)}%`;
    const document = query.replace(/\D/g, "");
    const rows = await queryAll<ClientSearchOption>(
      `select id, legal_name as legalName, trade_name as tradeName, cpf_cnpj as cpfCnpj
       from clients where active=1 and sale_channel in (?, 'AMBOS') and (
         translate(lower(legal_name), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') like ?
         or translate(lower(coalesce(trade_name,'')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') like ?
         or (? <> '' and regexp_replace(coalesce(cpf_cnpj,''), '[^0-9]', '', 'g') like ?)
       ) order by legal_name, id limit 21`,
      [channel, pattern, pattern, document.length >= 2 ? document : "", `%${document}%`],
    );
    return Response.json({ clients: rows.slice(0, 20), hasMore: rows.length > 20 }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return jsonError(error); }
}
