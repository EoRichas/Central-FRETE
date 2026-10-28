import { authorize } from '@/lib/server/auth';
import { ApiError,jsonError } from '@/lib/server/d1';
import { loadDriverCommissions } from '@/lib/server/driver-commissions';
import { renderDriverCommissionsPdf } from '@/lib/server/reports/driver-commissions-pdf';
import { pdfResponse } from '@/lib/server/reports/pdf-layout';
export async function GET(request:Request){try{
 const user=await authorize(request,['ADMIN','GERENCIA','FINANCEIRO','OPERACIONAL']);
 const params=new URL(request.url).searchParams,by=params.get('by')||'driver';
 if(!['driver','vehicle'].includes(by))throw new ApiError(400,'Tipo de relatório inválido.');
 const report=await loadDriverCommissions(params);
 if(params.get('format')==='pdf')return pdfResponse(await renderDriverCommissionsPdf(report,by as 'driver'|'vehicle'),by==='driver'?'Comissoes-Motoristas.pdf':'Comissoes-Veiculos.pdf');
 return Response.json({report,canManagePayments:user.role==='ADMIN'},{headers:{'Cache-Control':'private, no-store'}});
}catch(error){return jsonError(error);}}
