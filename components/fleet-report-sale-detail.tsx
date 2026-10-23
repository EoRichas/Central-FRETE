"use client";

import { useState } from 'react';
import type { CurrentUser } from '@/lib/contracts';
import type { FleetFreight } from '@/lib/domain/fleet';
import { roleCan } from '@/lib/domain/permissions';
import { FleetFreightDetail } from './fleet-freight-detail';
import { SaleDetailScreen } from './sale-detail-screen';
import { ServiceOrderScreen } from './service-order-screen';
import { ErrorState, LoadingState, PageHeader } from './ui';
import { useApi } from './use-api';

/** Report navigation stays local so client, period and report results survive. */
export function FleetReportSaleDetail({id, onBack}: {id: string; onBack: () => void}) {
  const [orderOpen, setOrderOpen] = useState(false);
  const source = id.startsWith('freight:') ? 'fleet' : 'sale';
  const resourceId = id.slice(source === 'fleet' ? 8 : 5);
  if (orderOpen) return <ServiceOrderScreen id={resourceId} source={source} onBack={() => setOrderOpen(false)} />;
  if (source === 'sale') return <SaleDetailScreen id={resourceId} onBack={onBack} onViewOrder={() => setOrderOpen(true)} hideDeleteActions />;
  return <ReportFreightDetail id={resourceId} onBack={onBack} onViewOrder={() => setOrderOpen(true)} />;
}

function ReportFreightDetail({id, onBack, onViewOrder}: {id: string; onBack: () => void; onViewOrder: () => void}) {
  const api = useApi<{freight: FleetFreight}>(`/api/fleet/freights/${id}`);
  const me = useApi<{user: CurrentUser}>('/api/me');
  const freight = api.data?.freight;
  return <>
    <PageHeader eyebrow={freight ? `Venda ${freight.saleNumber}` : 'Venda Frota'} title="Detalhes da venda"
      description={freight ? `${freight.origin} → ${freight.destination}` : undefined}
      actions={<><button type="button" className="button secondary" onClick={onBack}>Voltar ao relatório</button>{freight && me.data && roleCan(me.data.user.role, 'VIEW_SERVICE_ORDERS') && <button type="button" className="button secondary" onClick={onViewOrder}>Visualizar OS</button>}</>} />
    {api.loading || me.loading ? <LoadingState label="Carregando detalhes da venda…" /> : api.error ? <ErrorState message={api.error} retry={api.refresh} /> : me.error ? <ErrorState message={me.error} retry={me.refresh} /> : freight ? <FleetFreightDetail freight={freight} /> : null}
  </>;
}
