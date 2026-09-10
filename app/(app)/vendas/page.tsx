import type { Metadata } from "next";
import { SalesScreen } from "@/components/sales-screen";
import { currentCompetency, isCompetency } from "@/lib/domain/dates";

export const metadata: Metadata = { title: "Vendas e fretes" };

export default async function VendasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <SalesScreen
      initialCompetency={typeof params.competency === "string" && isCompetency(params.competency) ? params.competency : currentCompetency()}
      initialFinancialStatus={typeof params.financialStatus === "string" ? params.financialStatus : ""}
    />
  );
}
