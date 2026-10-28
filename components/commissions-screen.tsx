"use client";
import { useState } from 'react';
import type { CurrentUser } from '@/lib/contracts';
import { DriverCommissionsPanel } from './driver-commissions-panel';
import { SellersScreen } from './sellers-screen';
import { ErrorState,LoadingState,PageHeader } from './ui';
import { useApi } from './use-api';
export function CommissionsScreen({initialCompetency}:{initialCompetency?:string}){
 const me=useApi<{user:CurrentUser}>('/api/me');
 const [tab,setTab]=useState<'seller'|'driver'>('seller');
 if(me.loading)return <LoadingState label="Carregando comissões…"/>;
 if(me.error)return <ErrorState message={me.error} retry={me.refresh}/>;
 if(!me.data)return null;
 const role=me.data.user.role,showSeller=['ADMIN','VENDEDOR','OPERACIONAL'].includes(role),showDriver=['ADMIN','GERENCIA','FINANCEIRO','OPERACIONAL'].includes(role);
 const active=tab==='seller'&&!showSeller?'driver':tab==='driver'&&!showDriver?'seller':tab;
 return <><PageHeader eyebrow="Controle de comissões" title="Comissões" description="Consulte as comissões dos vendedores e dos motoristas."/><nav className="cegonha-tabs module-tabs" aria-label="Comissões">{showSeller&&<button type="button" className={active==='seller'?'active':''} aria-pressed={active==='seller'} onClick={()=>setTab('seller')}>Comissão vendedores</button>}{showDriver&&<button type="button" className={active==='driver'?'active':''} aria-pressed={active==='driver'} onClick={()=>setTab('driver')}>Comissão motoristas</button>}</nav>{active==='seller'?<SellersScreen initialCompetency={initialCompetency} embedded/>:<DriverCommissionsPanel/>}</>;
}
