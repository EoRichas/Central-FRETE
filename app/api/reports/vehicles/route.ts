import { authorize } from '@/lib/server/auth';
import { jsonError } from '@/lib/server/d1';
import { loadFleetReportPlates, loadFleetVehicleReport } from '@/lib/server/fleet-client-report';
import { pdfResponse } from '@/lib/server/reports/pdf-layout';
import { renderFleetVehicleReportPdf } from '@/lib/server/reports/fleet-vehicle-pdf';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const user = await authorize(request, ['ADMIN','GERENCIA','FINANCEIRO','OPERACIONAL']);
    const params = new URL(request.url).searchParams;
    const headers = {'Cache-Control':'private, no-store'};
    if (params.get('options')==='plates') return Response.json({plates:await loadFleetReportPlates(user)},{headers});
    const report = await loadFleetVehicleReport(user,params);
    if (params.get('format')==='pdf') return pdfResponse(await renderFleetVehicleReportPdf(report),'Relatorio-de-Veiculos.pdf');
    return Response.json({report},{headers});
  } catch (error) {
    return jsonError(error);
  }
}
