import type { SaleRecord } from '@/lib/contracts';
import { weightedMarginBasisPoints } from './finance';
import { costCategoryLabel } from './operations';

export function buildSalesReport(sales: SaleRecord[]) {
  const ordered = [...sales].sort((a,b)=>a.saleNumber.localeCompare(b.saleNumber,'pt-BR',{numeric:true}));
  const groups = new Map<string,SaleRecord[]>();
  const expenses = new Map<string,number>();
  let commissions = 0;
  for (const sale of ordered) {
    const name = sale.clientName || 'Cliente não informado';
    groups.set(name,[...(groups.get(name) ?? []),sale]);
    for(const cost of sale.costs) expenses.set(costCategoryLabel(cost.category),(expenses.get(costCategoryLabel(cost.category)) ?? 0)+cost.amountCents);
    commissions += sale.financial.commissionCents;
  }
  if(commissions) expenses.set('Comissão dos vendedores',commissions);
  const sum = (items:SaleRecord[]) => ({
    freight:items.reduce((s,r)=>s+r.freightAmountCents,0),
    cost:items.reduce((s,r)=>s+r.financial.transportCostCents,0),
    margin:items.reduce((s,r)=>s+r.financial.marginCents,0),
    marginBps:weightedMarginBasisPoints(items.map(r=>({freightAmountCents:r.freightAmountCents,marginCents:r.financial.marginCents}))),
  });
  const totals = sum(ordered);
  for(const value of [totals.freight,totals.cost,totals.margin,commissions]) if(!Number.isSafeInteger(value)) throw new Error('Total do relatório excede o limite de precisão.');
  return {sales:ordered,totals,commissions,pendingCosts:ordered.filter(s=>s.costsPending).length,
    clients:[...groups.entries()].map(([name,items])=>({name,sales:items.length,...sum(items)})).sort((a,b)=>b.freight-a.freight),
    expenses:[...expenses].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value)};
}
export type SalesReport = ReturnType<typeof buildSalesReport>;
