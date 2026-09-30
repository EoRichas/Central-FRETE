import { redirect } from "next/navigation";

// Preserve old bookmarks without retaining a second report screen.
export default function LegacyReportsPage() { redirect("/vendas-gerais"); }
