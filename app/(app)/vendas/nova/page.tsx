import type { Metadata } from "next";
import { SaleFormScreen } from "@/components/sale-form-screen";

export const metadata: Metadata = { title: "Nova venda" };

export default function NewSalePage() {
  return <SaleFormScreen />;
}

