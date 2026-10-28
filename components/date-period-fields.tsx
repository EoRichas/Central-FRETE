"use client";
import { useId } from "react";
import type { DatePeriod } from "@/lib/domain/date-period";
export function DatePeriodFields({value,onChange,disabled=false}:{value:DatePeriod;onChange:(value:DatePeriod)=>void;disabled?:boolean}){
 const id=useId();return <div className="date-period-fields"><span id={id}>Período</span><div><label><span>De</span><input type="date" aria-label="Data inicial do período" value={value.from} max={value.to||undefined} required disabled={disabled} onChange={e=>{if(e.target.value)onChange({...value,from:e.target.value});}}/></label><label><span>Até</span><input type="date" aria-label="Data final do período" value={value.to} min={value.from||undefined} required disabled={disabled} onChange={e=>{if(e.target.value)onChange({...value,to:e.target.value});}}/></label></div></div>;
}
