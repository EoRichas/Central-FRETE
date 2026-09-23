"use client";
import { useId } from 'react';
import { Field } from '@/components/ui';
import type { CargoVehicle } from '@/lib/domain/cargo-vehicles';

export function CargoVehiclesEditor({ vehicles, onChange, disabled = false }: {
  vehicles: CargoVehicle[]; onChange: (vehicles: CargoVehicle[]) => void; disabled?: boolean;
}) {
  const id = useId();
  function update(index: number, field: keyof CargoVehicle, value: string) {
    onChange(vehicles.map((vehicle, i) => i === index ? { ...vehicle, [field]: value } : vehicle));
  }
  return <fieldset className="cargo-editor fleet-fieldset" disabled={disabled}>
    <legend>Veículos transportados</legend>
    <p className="fleet-update-note" aria-live="polite">Quantidade: <strong>{vehicles.length}</strong> {vehicles.length === 1 ? 'veículo' : 'veículos'}. Cada linha representa uma unidade da carga.</p>
    {vehicles.map((vehicle, index) => <div className="cargo-row" key={`${id}-${index}`}>
      <span className="cargo-index">{index + 1}</span>
      <div className="form-grid three">
        <Field label={`Modelo ${index + 1}`}><input value={vehicle.model ?? ''} maxLength={80} onChange={e => update(index, 'model', e.target.value)} /></Field>
        <Field label={`Placa ${index + 1}`}><input value={vehicle.plate ?? ''} maxLength={8} onChange={e => update(index, 'plate', e.target.value)} /></Field>
        <Field label={`Identificação ${index + 1}`}><input value={vehicle.identification ?? ''} maxLength={120} onChange={e => update(index, 'identification', e.target.value)} placeholder="Chassi ou referência" /></Field>
      </div>
      {!disabled && <button type="button" className="button secondary compact-button" disabled={vehicles.length === 1} aria-label={`Remover veículo ${index + 1}`} onClick={() => onChange(vehicles.filter((_, i) => i !== index))}>Remover</button>}
    </div>)}
    {!disabled && <button type="button" className="button secondary" disabled={vehicles.length >= 100} onClick={() => onChange([...vehicles, { model: null, plate: null, identification: null }])}>Adicionar veículo</button>}
  </fieldset>;
}
