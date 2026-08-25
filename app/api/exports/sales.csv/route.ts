import { authorize } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/d1";
import { listSales } from "@/lib/server/repository";

function csvCell(value: unknown): string {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  try {
    const user = await authorize(request);
    const url = new URL(request.url);
    const competency = url.searchParams.get("competency") || undefined;
    const sales = await listSales(user, { competency, limit: 500 });
    const rows = [
      [
        "VENDA",
        "DATA",
        "VENDEDOR",
        "CLIENTE",
        "ORIGEM",
        "DESTINO",
        "STATUS OPERACIONAL",
        "STATUS FINANCEIRO",
        "VALOR FRETE",
        "TOTAL RECEBIDO",
        "SALDO",
        "CUSTO TOTAL",
        "MARGEM",
        "MARGEM %",
      ],
      ...sales.map((sale) => [
        sale.saleNumber,
        sale.saleDate,
        sale.sellerName,
        sale.clientName ?? "CLIENTE NÃO INFORMADO",
        sale.origin,
        sale.destination,
        sale.operationalStatus,
        sale.financial.status,
        (sale.freightAmountCents / 100).toFixed(2),
        (sale.financial.totalReceivedCents / 100).toFixed(2),
        (sale.financial.balanceCents / 100).toFixed(2),
        (sale.financial.transportCostCents / 100).toFixed(2),
        (sale.financial.marginCents / 100).toFixed(2),
        (sale.financial.marginBasisPoints / 100).toFixed(2),
      ]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="central-frete-${competency ?? "todos"}.csv"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

