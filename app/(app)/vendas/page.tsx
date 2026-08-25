import type { Metadata } from "next";
import { SalesScreen } from "@/components/sales-screen";

export const metadata: Metadata = { title: "Vendas e fretes" };

export default async function VendasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <SalesScreen
      initialCompetency={typeof params.competency === "string" ? params.competency : "2026-08"}
      initialFinancialStatus={typeof params.financialStatus === "string" ? params.financialStatus : ""}
    />
  );
}

