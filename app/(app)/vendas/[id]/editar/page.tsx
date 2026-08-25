import type { Metadata } from "next";
import { SaleEditScreen } from "@/components/sale-form-screen";

export const metadata: Metadata = { title: "Editar venda" };

export default async function EditSalePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SaleEditScreen id={id} />;
}
