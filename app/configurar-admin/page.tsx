import type { Metadata } from "next";
import { AdminSetupScreen } from "@/components/admin-setup-screen";

export const metadata: Metadata = { title: "Configurar administrador" };

export default function ConfigureAdminPage() {
  return <AdminSetupScreen />;
}
