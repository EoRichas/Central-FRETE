import type { Metadata } from "next";
import { FinanceScreen } from "@/components/finance-screen";

export const metadata: Metadata = { title: "Financeiro" };
export default function FinancePage() { return <FinanceScreen />; }

