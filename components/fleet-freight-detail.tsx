"use client";
import { cargoVehiclesOrLegacy } from '@/lib/domain/cargo-vehicles';
import { FLEET_OPERATIONAL_STATUS_LABELS, type FleetFreight } from '@/lib/domain/fleet';
import { formatDate, formatMoney, formatPercent } from '@/lib/format';
import { StatusBadge } from '@/components/ui';

export function FleetFreightDetail({freight: f}: {freight: FleetFreight}) {
  const cargo=cargoVehiclesOrLegacy(f.cargoVehicles,f.cargoVehicleModel,f.cargoPlate);
  const costs: [string,number][]=[['Motorista / comissão',f.driverCommissionCents],['Combustível',f.fuelCostCents],['Pedágio',f.tripId ? 0 : f.tollCents],['Custos compartilhados da viagem',f.sharedTransportCostCents],['Pátio / recebimento',f.yardCostCents??0],['Coleta',f.pickupCostCents??0],['Entrega',f.deliveryCostCents??0],['Seguro',f.insuranceCostCents??0],['Nota Fiscal',f.invoiceCostCents??0],['ICMS',f.icmsCostCents??0],['CTE/MDF',f.cteMdfeCostCents??0],['Outras despesas',f.otherCostCents??0]];
  if (f.sellerCommissionCents != null) costs.push(['Comissão do vendedor', f.sellerCommissionCents]);
  return <>
    <section className="detail-status-strip">
      <div><span>Status operacional</span><StatusBadge status={FLEET_OPERATIONAL_STATUS_LABELS[f.operationalStatus]} /></div>
      <div><span>Status financeiro</span><StatusBadge status={f.paymentStatus} /></div>
      <div><span>Margem</span><strong>{formatMoney(f.netRevenueCents)} · {formatPercent(f.marginBasisPoints)}</strong>{f.fuelCostSource==='ESTIMADO' && <small>PROVISÓRIA</small>}</div>
    </section>
    <section className="detail-grid">
      <article className="panel detail-card">
        <header><div><span className="eyebrow">Cadastro</span><h2>Dados da operação</h2></div></header>
        <dl className="details-list">
          <div className="full"><dt>Veículos transportados ({cargo.length})</dt><dd>{cargo.map((v,i)=><div key={i}>{i+1}. {[v.model,v.plate].filter(Boolean).join(' · ') || 'Não informado'}</div>)}</dd></div>
          <div><dt>Cliente</dt><dd>{f.clientName}</dd></div>
          <div><dt>Vendedor</dt><dd>{f.sellerName ?? "Não informado"}</dd></div>
          <div><dt>Motorista</dt><dd>{f.driverName}</dd></div>
          <div><dt>Coleta</dt><dd>{f.origin}</dd></div>
          <div><dt>Entrega</dt><dd>{f.destination}</dd></div>
          <div><dt>Veículo da frota</dt><dd>{f.vehiclePlate}</dd></div>
          <div><dt>Distância {f.odometerStartMeters!=null && f.odometerEndMeters!=null ? 'realizada' : 'informada'}</dt><dd>{(f.distanceMeters/1000).toLocaleString('pt-BR')} km</dd></div>
          <div><dt>Data da coleta</dt><dd>{formatDate(f.pickupDate)}</dd></div>
          <div><dt>Data da entrega</dt><dd>{formatDate(f.deliveryDate)}</dd></div>
          <div><dt>Faturamento</dt><dd>{formatDate(f.billingDate)}</dd></div>
        </dl>
      </article>
      <article className="panel financial-card">
        <header><div><span className="eyebrow">Resultado</span><h2>Composição financeira</h2></div></header>
        <div className="money-breakdown">
          <div><span>Valor do frete</span><strong>{formatMoney(f.freightAmountCents)}</strong></div>
          <div><span>Motorista / comissão</span><strong>− {formatMoney(f.driverCommissionCents)}</strong></div>
          {f.sellerCommissionCents != null && <div><span>Comissão do vendedor ({formatPercent(f.sellerCommissionBasisPoints ?? 0)})</span><strong>− {formatMoney(f.sellerCommissionCents)}</strong></div>}
          <div><span>Demais despesas</span><strong>− {formatMoney(f.totalCostCents-f.driverCommissionCents-(f.sellerCommissionCents??0))}</strong></div>
          <div className="total"><span>Margem da Central</span><strong className={f.netRevenueCents<0?'negative':'positive'}>{formatMoney(f.netRevenueCents)}</strong></div>
        </div>
      </article>
    </section>
    <section className="panel detail-card">
      <header><div><span className="eyebrow">Custos</span><h2>Custos da operação</h2></div></header>
      <div className="money-breakdown">{costs.filter(([,v])=>v>0).map(([label,value])=><div key={label}><span>{label}{label==='Combustível' && f.fuelCostSource==='ESTIMADO' ? ' (estimado)' : ''}</span><strong>{formatMoney(value)}</strong></div>)}<div className="total"><span>Total</span><strong>{formatMoney(f.totalCostCents)}</strong></div></div>
    </section>
  </>;
}
