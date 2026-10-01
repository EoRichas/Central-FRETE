"use client";
import { useId } from 'react';
import { Field } from '@/components/ui';
import type { CargoVehicle } from '@/lib/domain/cargo-vehicles';

export function CargoVehiclesEditor({ vehicles, onChange, disabled = false, showFipe = false }: {
  vehicles: CargoVehicle[]; onChange: (vehicles: CargoVehicle[]) => void; disabled?: boolean; showFipe?: boolean;
}) {
  const id = useId();
  function update(index: number, field: keyof CargoVehicle, value: string | number | null) {
    onChange(vehicles.map((vehicle, i) => i === index ? { ...vehicle, [field]: value } : vehicle));
  }
  return <fieldset className="cargo-editor fleet-fieldset" disabled={disabled}>
    <legend>Veículos transportados</legend>
    <p className="fleet-update-note" aria-live="polite">Quantidade: <strong>{vehicles.length}</strong> {vehicles.length === 1 ? 'veículo' : 'veículos'}. Cada linha representa uma unidade da carga.</p>
    {vehicles.map((vehicle, index) => <div className="cargo-row" key={`${id}-${index}`}>
      <span className="cargo-index">{index + 1}</span>
      <div className={`form-grid ${showFipe ? 'three' : 'two'}`}>
        <Field label={`Modelo ${index + 1}`}><input value={vehicle.model ?? ''} maxLength={80} onChange={e => update(index, 'model', e.target.value)} /></Field>
        <Field label={`Placa ${index + 1}`}><input value={vehicle.plate ?? ''} maxLength={8} onChange={e => update(index, 'plate', e.target.value)} /></Field>
        {showFipe && <Field label={`Tabela FIPE ${index + 1} (R$)`}><input
          inputMode="numeric" placeholder="0,00" maxLength={20}
          value={vehicle.fipeValueCents == null ? '' : (vehicle.fipeValueCents / 100).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
          onChange={e => {
            const digits = e.target.value.replace(/\D/g, '');
            const cents = digits ? Number(digits) : null;
            if (cents === null || (Number.isSafeInteger(cents) && cents <= 9_000_000_000_000)) update(index, 'fipeValueCents', cents);
          }}
        /></Field>}
      </div>
      {!disabled && <button type="button" className="button secondary compact-button" disabled={vehicles.length === 1} aria-label={`Remover veículo ${index + 1}`} onClick={() => onChange(vehicles.filter((_, i) => i !== index))}>Remover</button>}
    </div>)}
    {!disabled && <button type="button" className="button secondary" disabled={vehicles.length >= 100} onClick={() => onChange([...vehicles, { model: null, plate: null, identification: null }])}>Adicionar veículo</button>}
  </fieldset>;
}
