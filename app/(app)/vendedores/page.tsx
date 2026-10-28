import type { Metadata } from "next";
import { CommissionsScreen } from "@/components/commissions-screen";

export const metadata: Metadata = { title: "Comissões" };

export default async function SellersPage({
  searchParams,
}: {
  searchParams: Promise<{ competency?: string }>;
}) {
  const { competency } = await searchParams;
  return <CommissionsScreen initialCompetency={competency} />;
}
