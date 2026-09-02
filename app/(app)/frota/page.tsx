import type { Metadata } from "next";
import { FleetScreen } from "@/components/fleet-screen";

export const metadata: Metadata = { title: "Frota" };

export default function FleetPage() {
  return <FleetScreen />;
}
