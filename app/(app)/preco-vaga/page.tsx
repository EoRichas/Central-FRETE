import type { Metadata } from "next";
import { VacancyPriceScreen } from "@/components/vacancy-price-screen";

export const metadata: Metadata = { title: "Preço Vaga" };

export default function VacancyPricePage() {
  return <VacancyPriceScreen />;
}
