import type { CurrentUser } from '@/lib/contracts';
import type { ProviderService } from '@/lib/domain/provider-services';
import { ApiError,queryAll } from './d1';
import { dateOnly } from './validation';
export type ProviderReportRow=ProviderService&{freightId:string;saleNumber:string;date:string;clientName:string};
export async function loadProviderReport(user:CurrentUser,params:URLSearchParams){
 const from=dateOnly(params.get('from'),'Data inicial'),to=dateOnly(params.get('to'),'Data final');
 if(from>to||[from,to].some(d=>new Date(d+'T12:00:00Z').toISOString().slice(0,10)!==d))throw new ApiError(400,'Período inválido.');
 const providerId=params.get('providerId')?.trim()||'';if(providerId.length>80)throw new ApiError(400,'Prestador inválido.');
 const source=await queryAll<{id:string;saleNumber:string;date:string;clientName:string;services:ProviderService[]}>(
  `select id,sale_number as saleNumber,pickup_date as date,client_name as clientName,provider_services as services from fleet_freights where pickup_date between ? and ? and jsonb_array_length(provider_services)>0 ${user.role==='VENDEDOR'?'and seller_id=?':''} order by pickup_date,sale_number,id limit 5001`,[from,to,...(user.role==='VENDEDOR'?[user.id]:[])]);
 if(source.length>5000)throw new ApiError(400,'O período contém mais de 5.000 fretes com prestadores. Reduza o intervalo.');
 const rows:ProviderReportRow[]=source.flatMap(f=>f.services.filter(p=>!providerId||p.providerId===providerId).map(p=>({...p,freightId:f.id,saleNumber:f.saleNumber,date:f.date,clientName:f.clientName})));
 const groups=new Map<string,{id:string;name:string;pickupCents:number;deliveryCents:number;otherCents:number;totalCents:number;sales:Set<string>}>();
 for(const row of rows){const group=groups.get(row.providerId)??{id:row.providerId,name:row.providerName,pickupCents:0,deliveryCents:0,otherCents:0,totalCents:0,sales:new Set<string>()};group[row.kind==='COLETA'?'pickupCents':row.kind==='ENTREGA'?'deliveryCents':'otherCents']+=row.amountCents;group.totalCents+=row.amountCents;group.sales.add(row.freightId);groups.set(row.providerId,group);}
 const totalCents=rows.reduce((sum,r)=>sum+r.amountCents,0);if(!Number.isSafeInteger(totalCents))throw new ApiError(400,'Total do relatório acima do limite.');
 return {from,to,rows,totalCents,providers:[...groups.values()].map(({sales,...g})=>({...g,salesCount:sales.size})).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'))};
}
