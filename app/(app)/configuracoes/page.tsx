import type { Metadata } from "next";
import { SettingsScreen } from "@/components/settings-screen";

export const metadata: Metadata = { title: "Configurações" };
export default function SettingsPage() { return <SettingsScreen />; }

