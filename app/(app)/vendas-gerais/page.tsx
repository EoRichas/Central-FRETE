import type { Metadata } from "next";
import { GeneralSalesScreen } from "@/components/general-sales-screen";

export const metadata: Metadata = { title: "Vendas Geral" };
export default function GeneralSalesPage() { return <GeneralSalesScreen />; }
