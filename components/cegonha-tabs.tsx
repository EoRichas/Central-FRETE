"use client";
import Link from 'next/link';
export function CegonhaTabs({competency}:{active:'sales'|'monthly';competency:string}) {
 return <nav className="cegonha-tabs" aria-label="Vendas Cegonha"><Link className="active" aria-current="page" href={`/vendas${competency?`?competency=${competency}`:''}`}>Vendas</Link></nav>;
}
