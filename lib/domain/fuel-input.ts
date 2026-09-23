import { decimalValue } from './number-input.ts';
export function fuelInputToInteger(value: string, label: string, decimals: number): number | null {
  if (!value.trim()) return null;
  const scaled = decimalValue(value,label) * 10 ** decimals;
  if (Math.abs(scaled - Math.round(scaled)) > 0.000001 || !Number.isSafeInteger(Math.round(scaled))) throw new Error(`${label}: use até ${decimals} casas decimais.`);
  return Math.round(scaled);
}
