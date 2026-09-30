import type { SaleRecord } from '@/lib/contracts';
import type { FleetFreight } from './fleet';
import { weightedMarginBasisPoints } from './finance';
import { costCategoryLabel } from './operations';

export type ReportSale = Pick<SaleRecord, 'id'|'saleNumber'|'saleDate'|'saleChannel'|'sellerId'|'sellerName'|'clientName'|'freightAmountCents'|'commissionBasisPoints'|'costsPending'> & {
  origin?: string; destination?: string;
  costs: {category:string;amountCents:number}[];
  financial: Pick<SaleRecord['financial'],'commissionCents'|'transportCostCents'|'marginCents'|'marginBasisPoints'>;
};
export const reportSellerKey = (sale: Pick<ReportSale,'sellerId'|'sellerName'>) => sale.sellerId || `historical:${sale.sellerName || 'Não informado'}`;

// Operational Frota records are authoritative when a commercial mirror exists.
export function consolidateReportSales(sales: SaleRecord[], freights: FleetFreight[]): ReportSale[] {
  return [...sales.filter(s => s.saleChannel !== 'FROTA' || !s.fleetFreightId).map((s):ReportSale=>({id:s.id,origin:s.origin,destination:s.destination,saleNumber:s.saleNumber,saleDate:s.saleDate,saleChannel:s.saleChannel,sellerId:s.sellerId,sellerName:s.sellerName,clientName:s.clientName,freightAmountCents:s.freightAmountCents,commissionBasisPoints:s.commissionBasisPoints,costsPending:s.costsPending,costs:s.costs.map(c=>({category:c.category,amountCents:c.amountCents})),financial:{commissionCents:s.financial.commissionCents,transportCostCents:s.financial.transportCostCents,marginCents:s.financial.marginCents,marginBasisPoints:s.financial.marginBasisPoints}})), ...freights.map((f):ReportSale => ({
    id: `freight:${f.id}`, origin:f.origin, destination:f.destination, saleNumber:f.saleNumber || 'Não disponível', saleDate:f.pickupDate, saleChannel:'FROTA',
    sellerId:f.sellerId ?? null, sellerName:f.sellerName || 'Não informado', clientName:f.clientName,
    freightAmountCents:f.freightAmountCents, commissionBasisPoints:f.sellerCommissionBasisPoints ?? 0,
    costsPending:f.fuelCostSource === 'ESTIMADO',
    costs:[{category:'Despesas operacionais da Frota',amountCents:f.totalCostCents-(f.sellerCommissionCents ?? 0)}],
    financial:{commissionCents:f.sellerCommissionCents ?? 0,transportCostCents:f.totalCostCents,marginCents:f.netRevenueCents,marginBasisPoints:f.marginBasisPoints},
  }))];
}

export function buildSalesReport(sales: ReportSale[], showCommission = true) {
  const ordered = [...sales].sort((a,b)=>a.saleNumber.localeCompare(b.saleNumber,'pt-BR',{numeric:true}));
  const groups = new Map<string,ReportSale[]>();
  const sellers = new Map<string,ReportSale[]>();
  const expenses = new Map<string,number>();
  let commissions = 0;
  for (const sale of ordered) {
    const sellerKey = reportSellerKey(sale);
    if(!sellers.has(sellerKey))sellers.set(sellerKey,[]);
    sellers.get(sellerKey)!.push(sale);
    const name = sale.clientName || 'Cliente não informado';
    if(!groups.has(name))groups.set(name,[]);
    groups.get(name)!.push(sale);
    for(const cost of sale.costs) expenses.set(costCategoryLabel(cost.category),(expenses.get(costCategoryLabel(cost.category)) ?? 0)+cost.amountCents);
    commissions += sale.financial.commissionCents;
  }
  if(commissions && showCommission) expenses.set('Comissão dos vendedores',commissions);
  const sum = (items:ReportSale[]) => ({
    freight:items.reduce((s,r)=>s+r.freightAmountCents,0),
    cost:items.reduce((s,r)=>s+r.financial.transportCostCents,0),
    margin:items.reduce((s,r)=>s+r.financial.marginCents,0),
    marginBps:weightedMarginBasisPoints(items.map(r=>({freightAmountCents:r.freightAmountCents,marginCents:r.financial.marginCents}))),
  });
  const totals = sum(ordered);
  for(const value of [totals.freight,totals.cost,totals.margin,commissions]) if(!Number.isSafeInteger(value)) throw new Error('Total do relatório excede o limite de precisão.');
  return {sales:ordered,totals,commissions,pendingCosts:ordered.filter(s=>s.costsPending).length,
    sellers:[...sellers.entries()].map(([id,items])=>({id,name:items[0].sellerName,sales:items.length,...sum(items),...(showCommission ? {commission:items.reduce((total,s)=>total+s.financial.commissionCents,0)} : {})})).sort((a,b)=>b.freight-a.freight),
    clients:[...groups.entries()].map(([name,items])=>({name,sales:items.length,...sum(items)})).sort((a,b)=>b.freight-a.freight),
    expenses:[...expenses].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value)};
}
export type SalesReport = ReturnType<typeof buildSalesReport>;
