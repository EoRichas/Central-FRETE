import { authorize } from '@/lib/server/auth';
import { ApiError, jsonError } from '@/lib/server/d1';
import { loadFleetClientReport } from '@/lib/server/fleet-client-report';
import { renderFleetClientPdf, type ClientReportObservation } from '@/lib/server/reports/fleet-client-pdf';
import { pdfResponse } from '@/lib/server/reports/pdf-layout';
import { asObject } from '@/lib/server/validation';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const user = await authorize(request);
    return Response.json(await loadFleetClientReport(user, new URL(request.url).searchParams), {headers: {'Cache-Control': 'private, no-store'}});
  } catch (error) { return jsonError(error); }
}
export async function POST(request: Request) {
  try {
    const user = await authorize(request);
    if (!request.headers.get('content-type')?.startsWith('application/json')) throw new ApiError(415, 'Envie os dados em JSON.');
    // Bound the body before parsing; client-selected IDs/text never supply totals.
    const reader = request.body?.getReader(); let length = 0; const chunks: Uint8Array[] = [];
    if (reader) try {
      while (true) { const next = await reader.read(); if (next.done) break; length += next.value.length; if (length > 1_000_000) { await reader.cancel(); throw new ApiError(413, 'Observações muito grandes.'); } chunks.push(next.value); }
    } finally { reader.releaseLock(); }
    let parsed: unknown;
    try { parsed = JSON.parse(Buffer.concat(chunks).toString()); } catch { throw new ApiError(400, 'Dados inválidos.'); }
    const data = asObject(parsed);
    const {report} = await loadFleetClientReport(user, new URL(request.url).searchParams);
    if (!report?.rows.length) throw new ApiError(400, 'Selecione um cliente e um período com vendas.');
    if (typeof data.includeObservations !== 'boolean') throw new ApiError(400, 'Escolha se deseja incluir observações.');
    const observations: ClientReportObservation[] = [];
    if (data.includeObservations) {
      if (!Array.isArray(data.observations) || data.observations.length > report.rows.length) throw new ApiError(400, 'Observações inválidas.');
      const seen = new Set<string>();
      for (const value of data.observations) {
        const item = asObject(value);
        if (typeof item.saleId !== 'string' || !report.rows.some(row => row.id === item.saleId) || seen.has(item.saleId)) throw new ApiError(400, 'A observação deve pertencer a uma venda deste relatório.');
        if (typeof item.text !== 'string' || item.text.length > 6000) throw new ApiError(400, 'A observação deve ter até 6.000 caracteres.');
        seen.add(item.saleId);
        if (item.text.trim()) observations.push({saleId: item.saleId, text: item.text.trim()});
      }
    }
    return pdfResponse(await renderFleetClientPdf(report, observations), `Relatorio-Vendas-Frota-${report.from}-${report.to}.pdf`);
  } catch (error) { return jsonError(error); }
}
