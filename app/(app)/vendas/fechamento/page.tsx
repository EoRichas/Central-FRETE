import { CegonhaMonthlyScreen } from '@/components/cegonha-monthly-screen';
import { currentCompetency, isCompetency } from '@/lib/domain/dates';
export const metadata={title:'Fechamento mensal Cegonha'};
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
 const params=await searchParams;
 return <CegonhaMonthlyScreen initialCompetency={typeof params.competency==='string'&&isCompetency(params.competency)?params.competency:currentCompetency()} />;
}
