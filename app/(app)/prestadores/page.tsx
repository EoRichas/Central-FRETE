import type { Metadata } from "next";
import { ProvidersScreen } from "@/components/providers-screen";

export const metadata: Metadata = { title: "Prestadores" };
export default function ProvidersPage() { return <ProvidersScreen />; }

