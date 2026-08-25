import type { Metadata } from "next";
import { ClientDetailScreen } from "@/components/client-detail-screen";

export const metadata: Metadata = { title: "Detalhes do cliente" };

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; return <ClientDetailScreen id={id} />;
}

