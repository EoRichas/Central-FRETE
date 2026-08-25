import type { Metadata } from "next";
import { SellersScreen } from "@/components/sellers-screen";

export const metadata: Metadata = { title: "Vendedores(a)" };

export default async function SellersPage({
  searchParams,
}: {
  searchParams: Promise<{ competency?: string }>;
}) {
  const { competency } = await searchParams;
  return <SellersScreen initialCompetency={competency} />;
}
