"use client";
import Link from 'next/link';
import { useContext } from 'react';
import { CurrentUserContext } from './current-user-context';
export function CegonhaTabs({active,competency}:{active:'sales'|'monthly';competency:string}) {
 const context=useContext(CurrentUserContext);
 if(!context || !['ADMIN','GERENCIA','FINANCEIRO'].includes(context.user.role))return null;
 return <nav className="cegonha-tabs" aria-label="Vendas Cegonha"><Link className={active==='sales'?'active':''} aria-current={active==='sales'?'page':undefined} href={`/vendas${competency?`?competency=${competency}`:''}`}>Vendas</Link><Link className={active==='monthly'?'active':''} aria-current={active==='monthly'?'page':undefined} href={`/vendas/fechamento${competency?`?competency=${competency}`:''}`}>Fechamento mensal</Link></nav>;
}
