import type { Metadata } from "next";
import { SaleDetailScreen } from "@/components/sale-detail-screen";

export const metadata: Metadata = { title: "Detalhes da venda" };

export default async function SaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SaleDetailScreen id={id} />;
}

