"use client";
import { useState } from 'react';
import { Field, Modal } from '@/components/ui';
import { apiMutation } from '@/components/use-api';
import type { FleetData, FleetFreight } from '@/lib/domain/fleet';
import type { FleetTrip } from '@/lib/domain/fleet-results';
import { formatDate, formatMoney, moneyInputToCents } from '@/lib/format';
import { todaySaoPaulo } from '@/lib/domain/dates';
import { Icons } from '@/components/icons';

function TripModal({ trip, fleet, onClose, onSaved, onDelete }: {
  trip: FleetTrip | null; fleet: FleetData; onClose: () => void; onSaved: (message: string) => void; onDelete: (trip: FleetTrip) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const members = fleet.tripResults.find(t => t.id === trip?.id)?.freights ?? [];
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError('');
    const form = new FormData(event.currentTarget);
    try {
      const payload = { name: form.get('name'), vehicleId: form.get('vehicleId'), driverId: form.get('driverId'),
        operationDate: form.get('operationDate'), notes: form.get('notes'),
        fuelCostCents: moneyInputToCents(String(form.get('fuel') || '0')),
        tollCents: moneyInputToCents(String(form.get('toll') || '0')),
        otherCostCents: moneyInputToCents(String(form.get('other') || '0')) };
      await apiMutation(trip ? `/api/fleet/trips/${trip.id}` : '/api/fleet/trips', {
        method: trip ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      onSaved('Viagem salva. Vincule os veículos transportados no cadastro de cada frete.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar a viagem.'); }
    finally { setSaving(false); }
  }
  return <Modal open wide title={trip ? 'Editar viagem' : 'Nova viagem'} onClose={onClose}>
    <form className="modal-body form-stack" onSubmit={submit}>
      <Field label="Identificação da viagem"><input name="name" defaultValue={trip?.name} maxLength={120} required placeholder="Ex.: SP para Curitiba, carga 18" /></Field>
      <div className="form-grid three">
        <Field label="Caminhão"><select name="vehicleId" defaultValue={trip?.vehicleId} required>{fleet.vehicles.filter(v => v.active || v.id === trip?.vehicleId).map(v => <option key={v.id} value={v.id}>{v.plate}</option>)}</select></Field>
        <Field label="Motorista"><select name="driverId" defaultValue={trip?.driverId} required>{fleet.drivers.filter(d => d.active || d.id === trip?.driverId).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
        <Field label="Data de apuração da viagem" hint="Define o mês dos custos compartilhados."><input name="operationDate" type="date" required defaultValue={trip?.operationDate ?? todaySaoPaulo()} /></Field>
      </div>
      <p>Informe os custos realizados da viagem completa. As comissões e as despesas de cada veículo transportado são somadas a partir dos fretes vinculados.</p>
      <div className="form-grid three">
        {([{ name: 'fuel', label: 'Diesel realizado (R$)', value: trip?.fuelCostCents }, { name: 'toll', label: 'Pedágio total (R$)', value: trip?.tollCents }, { name: 'other', label: 'Outros custos da viagem (R$)', value: trip?.otherCostCents }]).map(f => <Field key={f.name} label={f.label}><input name={f.name} inputMode="decimal" defaultValue={((f.value ?? 0) / 100).toFixed(2).replace('.', ',')} required /></Field>)}
      </div>
      <Field label="Observações sobre os custos"><textarea name="notes" maxLength={2000} defaultValue={trip?.notes} /></Field>
      {!!members.length && <p>{members.length} frete(s) vinculado(s). Para trocar o caminhão ou o motorista, primeiro desvincule esses fretes.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer className="modal-actions">{trip && <button type="button" className="button danger" disabled={saving || members.length > 0} onClick={() => void onDelete(trip)}>Excluir viagem</button>}<button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar viagem'}</button></footer>
    </form>
  </Modal>;
}
export function FleetTripsPanel({ fleet, onSaved, onEditFreight }: {
  fleet: FleetData; onSaved: (message: string) => void; onEditFreight: (freight: FleetFreight) => void;
}) {
  const [editing, setEditing] = useState<FleetTrip | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  async function remove(trip: FleetTrip) {
    if (!window.confirm(`Excluir a viagem ${trip.name}? Só é possível excluir viagens sem fretes vinculados.`)) return;
    setError('');
    try { await apiMutation(`/api/fleet/trips/${trip.id}`, { method: 'DELETE' }); setOpen(false); onSaved('Viagem excluída.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível excluir.'); }
  }
  return <section className="fleet-stack">
    <header className="fleet-panel-header"><div><h2>Resultado operacional da viagem</h2><p>Receita de todos os veículos transportados menos custos diretos e compartilhados. Sem rateio de custo fixo.</p></div>
      {fleet.canManage && <button className="button primary" onClick={() => { setEditing(null); setOpen(true); }}>Nova viagem</button>}
    </header>
    {error && <p className="form-error" role="alert">{error}</p>}
    {!fleet.tripResults.length && <div className="panel inline-empty">Nenhuma viagem neste mês. Crie a viagem e selecione-a no cadastro de cada frete transportado.</div>}
    {fleet.tripResults.map(trip => <article className="panel table-panel" key={trip.id}>
      <header className="fleet-panel-header"><div><h3>{trip.name}</h3><p>{formatDate(trip.operationDate)} · {trip.vehiclePlate} · {trip.driverName} · {trip.freights.length} veículo(s) transportado(s)</p></div>
        {fleet.canManage && <div className="table-actions"><button type="button" className="table-action" aria-label={`Editar viagem ${trip.name}`} title="Editar viagem" onClick={() => { setEditing(trip); setOpen(true); }}><Icons.chevron /></button></div>}
      </header>
      <div className="fleet-form-preview"><div><span>Receita</span><strong>{formatMoney(trip.revenueCents)}</strong></div><div><span>Comissões e despesas diretas</span><strong>{formatMoney(trip.directCostCents)}</strong></div><div><span>Custos da viagem</span><strong>{formatMoney(trip.sharedCostCents)}</strong></div><div><span>Resultado operacional</span><strong className={trip.resultCents < 0 ? 'negative' : 'positive'}>{formatMoney(trip.resultCents)}</strong></div></div>
      <p className="fleet-update-note">Diesel: {formatMoney(trip.fuelCostCents)} · Pedágio: {formatMoney(trip.tollCents)} · Outros: {formatMoney(trip.otherCostCents)}</p>
      {trip.notes && <p className="fleet-update-note">{trip.notes}</p>}
      <div className="responsive-table"><table><thead><tr><th>Cliente / veículo transportado</th><th>Receita</th><th>Margem de contribuição</th><th>Ações</th></tr></thead><tbody>
        {trip.freights.map(f => <tr key={f.id}><td data-label="Cliente / veículo transportado"><strong>{f.clientName}</strong><small>{f.cargoVehicleModel} {f.cargoPlate}</small></td><td data-label="Receita">{formatMoney(f.freightAmountCents)}</td><td data-label="Margem de contribuição">{formatMoney(f.contributionCents)}</td><td data-label="Ações">{fleet.canEditFreights && <button type="button" className="table-action" aria-label={`Editar frete de ${f.clientName}`} title="Editar frete" onClick={() => onEditFreight(f)}><Icons.chevron /></button>}</td></tr>)}
        {!trip.freights.length && <tr><td colSpan={4}>Vincule os veículos transportados selecionando esta viagem no cadastro dos fretes.</td></tr>}
      </tbody></table></div>
    </article>)}
    {open && <TripModal key={editing?.id ?? 'new'} trip={editing} fleet={fleet} onClose={() => setOpen(false)} onSaved={message => { setOpen(false); onSaved(message); }} onDelete={remove} />}
  </section>;
}
