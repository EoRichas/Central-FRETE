import type { Metadata } from "next";
import { CalculatorScreen } from "@/components/calculator-screen";

export const metadata: Metadata = { title: "Calculadora" };

export default function CalculatorPage() {
  return <CalculatorScreen />;
}
