import type { Metadata } from "next";
import { DashboardScreen } from "@/components/dashboard-screen";

export const metadata: Metadata = { title: "Início" };

export default function InicioPage() {
  return <DashboardScreen />;
}

