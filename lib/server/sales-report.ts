import type { CurrentUser } from '@/lib/contracts';
import { buildSalesReport, consolidateReportSales, reportSellerKey } from '@/lib/domain/reports';
import { canViewSellerCommission } from '@/lib/domain/permissions';
import { SALE_CHANNELS } from '@/lib/domain/sales';
import { isCompetency } from '@/lib/domain/dates';
import { enumValue } from './validation';
import { ApiError } from './d1';
import { listSales } from './repository';
import { loadFleetData } from './fleet';

function dateFilter(value:string|null) {
  if(!value)return undefined;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10)!==value)throw new ApiError(400,'Data inválida.');
  return value;
}
export async function loadSalesReport(user:CurrentUser, params:URLSearchParams) {
  const competency=params.get('competency');
  if(competency && !isCompetency(competency))throw new ApiError(400,'Competência inválida.');
  const from=dateFilter(params.get('from')),to=dateFilter(params.get('to'));
  if(from && to && from>to)throw new ApiError(400,'A data inicial deve ser anterior à data final.');
  const channel=params.get('saleChannel') ? enumValue(params.get('saleChannel'),'Canal',SALE_CHANNELS) : undefined;
  const seller=params.get('seller') || '';
  const showCommission=canViewSellerCommission(user.role);
  const [sales,fleet]=await Promise.all([
    listSales(user,{all:true}),
    channel==='CEGONHA' ? Promise.resolve({freights:[]}) : loadFleetData(false,false,false,true,undefined,false,{user}),
  ]);
  const inPeriod=consolidateReportSales(sales,fleet.freights).filter(s=>(!channel || s.saleChannel===channel)
    && (!competency || s.saleDate.startsWith(competency)) && (!from || s.saleDate>=from) && (!to || s.saleDate<=to));
  const sellers=[...new Map(inPeriod.map(s=>[reportSellerKey(s),{id:reportSellerKey(s),name:s.sellerName}])).values()].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
  const report=buildSalesReport(inPeriod.filter(s=>!seller || reportSellerKey(s)===seller),showCommission);
  return {report,showCommission,sellers,period:competency || (from || to ? `${from || 'Início'} a ${to || 'hoje'}` : 'Todo o histórico'),channel:channel==='FROTA'?'Frota':channel==='CEGONHA'?'Cegonha':'Frota e Cegonha',seller:seller ? sellers.find(s=>s.id===seller)?.name || 'Sem correspondência' : 'Todos'};
}
