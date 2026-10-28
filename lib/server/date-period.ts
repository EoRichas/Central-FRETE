import { isCalendarDate, type DatePeriod } from "@/lib/domain/date-period";
import { ApiError } from "./d1";
export function readDatePeriod(params:URLSearchParams): DatePeriod | undefined {
 const from=params.get("from"),to=params.get("to");
 if(from===null&&to===null)return undefined;
 if(!from||!to||!isCalendarDate(from)||!isCalendarDate(to))throw new ApiError(400,"Informe datas inicial e final válidas.");
 if(from>to)throw new ApiError(400,"A data inicial deve ser anterior à data final.");
 return {from,to};
}
