"use client";
import { Icons } from "@/components/icons";
import { useState } from "react";
import { FleetVehicleHistory } from "@/components/fleet-vehicle-history";
import { Field, Modal, StatusBadge } from "@/components/ui";
import { apiMutation } from "@/components/use-api";
import {
  summarizeFleet,
  type FleetData,
  type FleetDriver,
  type FleetFreight,
  type FleetVehicle,
} from "@/lib/domain/fleet";
import { formatMoney } from "@/lib/format";

export function VehicleResultCells({
  vehicleId,
  freights,
}: {
  vehicleId: string;
  freights: FleetFreight[];
}) {
  const members = freights.filter((freight) => freight.vehicleId === vehicleId);
  const totals = summarizeFleet(members);
  return (
    <>
      <td data-label="Receita no mês">{formatMoney(totals.revenueCents)}</td>
      <td data-label="Custos da operação">
        {formatMoney(totals.totalCostCents)}
      </td>
      <td data-label="Resultado operacional">
        {formatMoney(totals.netRevenueCents)}
        <small>
          {members.some((f) => f.fuelCostSource === "ESTIMADO")
            ? "Inclui combustível estimado"
            : "Sem estimativa de combustível"}
        </small>
      </td>
    </>
  );
}

export function VehicleModal({
  vehicle,
  canManage,
  onClose,
  onSaved,
}: {
  canManage: boolean;
  vehicle: FleetVehicle | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await apiMutation(
        vehicle ? `/api/fleet/vehicles/${vehicle.id}` : "/api/fleet/vehicles",
        {
          method: vehicle ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            plate: form.get("plate"),
            active: form.get("active") === "on",
          }),
        },
      );
      onSaved(vehicle ? "Veículo atualizado." : "Veículo cadastrado.");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Erro ao salvar veículo.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={vehicle ? "Editar veículo" : "Novo veículo da frota"}
    >
      <form className="modal-body form-stack" onSubmit={submit}>
        <fieldset disabled={!canManage} className="fleet-fieldset">
          <Field label="Placa">
            <input
              name="plate"
              defaultValue={vehicle?.plate ?? ""}
              maxLength={8}
              required
            />
          </Field>
          <Field label="Ativo">
            <input
              name="active"
              type="checkbox"
              defaultChecked={vehicle?.active ?? true}
            />
          </Field>
        </fieldset>
        {vehicle && <FleetVehicleHistory vehicle={vehicle} />}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <footer className="modal-actions">
          {vehicle && canManage && (
            <button
              type="button"
              className="button danger"
              disabled={saving}
              onClick={async () => {
                if (
                  !window.confirm(
                    "Excluir cadastro? Registros com histórico serão preservados.",
                  )
                )
                  return;
                setSaving(true);
                setError(null);
                try {
                  await apiMutation(`/api/fleet/vehicles/${vehicle.id}`, {
                    method: "DELETE",
                  });
                  onSaved("Cadastro excluído.");
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Erro ao excluir.");
                } finally {
                  setSaving(false);
                }
              }}
            >
              Excluir
            </button>
          )}
          <button type="button" className="button secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="button primary" disabled={saving || !canManage}>
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

export function DriverModal({
  driver,
  onClose,
  onSaved,
}: {
  driver: FleetDriver | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await apiMutation(
        driver ? `/api/fleet/drivers/${driver.id}` : "/api/fleet/drivers",
        {
          method: driver ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: form.get("name"),
            cpf: form.get("cpf"),
            address: form.get("address"),
            phone: form.get("phone"),
            active: form.get("active") === "on",
          }),
        },
      );
      onSaved(driver ? "Motorista atualizado." : "Motorista cadastrado.");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Erro ao salvar motorista.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={driver ? "Editar motorista" : "Novo motorista"}
    >
      <form className="modal-body form-stack" onSubmit={submit}>
        <Field label="Nome completo">
          <input name="name" defaultValue={driver?.name ?? ""} required />
        </Field>
        <Field label="CPF">
          <input
            name="cpf"
            defaultValue={driver?.cpf ?? ""}
            maxLength={14}
            required
          />
        </Field>
        <Field label="Endereço completo">
          <input
            name="address"
            defaultValue={driver?.address ?? ""}
            maxLength={300}
            required
          />
        </Field>
        <Field label="Telefone com DDD">
          <input
            name="phone"
            type="tel"
            defaultValue={driver?.phone ?? ""}
            required
          />
        </Field>
        <p className="fleet-update-note">O veículo é vinculado ao motorista dentro de cada frete.</p>
        <Field label="Ativo">
          <input
            name="active"
            type="checkbox"
            defaultChecked={driver?.active ?? true}
          />
        </Field>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <footer className="modal-actions">
          {driver && (
            <button
              type="button"
              className="button danger"
              disabled={saving}
              onClick={async () => {
                if (
                  !window.confirm(
                    "Excluir cadastro? Registros com histórico serão preservados.",
                  )
                )
                  return;
                setSaving(true);
                setError(null);
                try {
                  await apiMutation(`/api/fleet/drivers/${driver.id}`, {
                    method: "DELETE",
                  });
                  onSaved("Cadastro excluído.");
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Erro ao excluir.");
                } finally {
                  setSaving(false);
                }
              }}
            >
              Excluir
            </button>
          )}
          <button type="button" className="button secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="button primary" disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

export function FleetAssetsPanel({fleet,openVehicle,openDriver}: {
  fleet: FleetData;
  openVehicle: (vehicle: FleetVehicle | null) => void;
  openDriver: (driver: FleetDriver | null) => void;
}) {
  return (<div className="fleet-assets-stack">
              <section className="panel table-panel">
                <header className="fleet-panel-header">
                  <div>
                    <span className="eyebrow">Cadastro</span>
                    <h2>Veículos da frota</h2>
                    <p>
                      Resultado por caminhão no mês da coleta, antes dos custos
                      fixos da empresa.
                    </p>
                  </div>
                  {fleet.canManage && (
                    <button
                      type="button"
                      className="button primary"
                      onClick={() => openVehicle(null)}
                    >
                      <Icons.plus /> Novo veículo
                    </button>
                  )}
                </header>
                <div className="responsive-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Placa</th>
                        <th>Situação</th>
                        <th>Receita no mês</th>
                        <th>Custos da operação</th>
                        <th>Resultado operacional</th>
                        {fleet.canManage && (
                          <th>
                            <span className="sr-only">Ações</span>
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {fleet.vehicles.map((vehicle) => (
                        <tr key={vehicle.id}>
                          <td data-label="Placa">
                            <button
                              className="text-button"
                              type="button"
                              onClick={() => openVehicle(vehicle)}
                            >
                              {vehicle.plate}
                            </button>
                          </td>
                          <td data-label="Situação">
                            <StatusBadge
                              status={vehicle.active ? "ATIVO" : "INATIVO"}
                            />
                          </td>
                          <VehicleResultCells
                            vehicleId={vehicle.id}
                            freights={fleet.freights}
                          />
                          {fleet.canManage && (
                            <td data-label="Ações">
                              <div className="table-actions">
                                <button
                                  type="button"
                                  className="table-action"
                                  aria-label={`Editar veículo ${vehicle.plate}`}
                                  title="Editar veículo"
                                  onClick={() => openVehicle(vehicle)}
                                >
                                  <Icons.chevron />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                      {!fleet.vehicles.length && (
                        <tr>
                          <td
                            colSpan={fleet.canManage ? 6 : 5}
                            className="empty-cell"
                          >
                            Nenhum veículo cadastrado.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="panel table-panel">
                <header className="fleet-panel-header">
                  <div>
                    <span className="eyebrow">Equipe</span>
                    <h2>Motoristas</h2>
                  </div>
                  {fleet.canManage && (
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => openDriver(null)}
                    >
                      <Icons.plus /> Novo motorista
                    </button>
                  )}
                </header>
                <div className="responsive-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Nome / contato</th>
                        <th>Veículos no mês</th>
                        <th>Situação</th>
                        {fleet.canManage && (
                          <th>
                            <span className="sr-only">Ações</span>
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {fleet.drivers.map((driver) => (
                        <tr key={driver.id}>
                          <td data-label="Nome / contato">
                            <strong>{driver.name}</strong>
                            <small>
                              {driver.cpf ?? "CPF pendente"} ·{" "}
                              {driver.phone ?? "Telefone pendente"}
                            </small>
                            <small>{driver.address}</small>
                          </td>
                          <td data-label="Veículos no mês">
                            {[...new Set(fleet.freights.filter(f => f.driverId === driver.id).map(f => f.vehiclePlate))].join(", ") || "Sem operação no mês"}
                          </td>
                          <td data-label="Situação">
                            <StatusBadge
                              status={driver.active ? "ATIVO" : "INATIVO"}
                            />
                          </td>
                          {fleet.canManage && (
                            <td data-label="Ações">
                              <div className="table-actions">
                                <button
                                  type="button"
                                  className="table-action"
                                  aria-label={`Editar motorista ${driver.name}`}
                                  title="Editar motorista"
                                  onClick={() => openDriver(driver)}
                                >
                                  <Icons.chevron />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                      {!fleet.drivers.length && (
                        <tr>
                          <td
                            colSpan={fleet.canManage ? 4 : 3}
                            className="empty-cell"
                          >
                            Nenhum motorista cadastrado.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>);
}
