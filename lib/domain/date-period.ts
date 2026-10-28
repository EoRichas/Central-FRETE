import { currentCompetency } from "./dates";
export type DatePeriod = { from: string; to: string };
export function currentDatePeriod(): DatePeriod {
 const month=currentCompetency(),next=new Date(`${month}-01T12:00:00Z`);
 next.setUTCMonth(next.getUTCMonth()+1);next.setUTCDate(0);
 return {from:`${month}-01`,to:next.toISOString().slice(0,10)};
}
export function isCalendarDate(value:string) {
 return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
}
export function exclusivePeriodEnd(to:string) {const date=new Date(`${to}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+1);return date.toISOString().slice(0,10);}
export function inDatePeriod(date:string,period:DatePeriod){return date>=period.from&&date<=period.to;}
