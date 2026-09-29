"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { SaleChannel } from "@/lib/domain/sales";
import type { ClientSearchOption, SelectedClient } from "@/lib/domain/client-search";

type SearchResult = { clients: ClientSearchOption[]; hasMore: boolean };

export function ClientAutocomplete({ channel, value, onChange, required = false, disabled = false }: {
  channel: SaleChannel;
  value: SelectedClient | null;
  onChange: (client: SelectedClient | null) => void;
  required?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; data?: SearchResult; error?: string } | null>(null);
  const query = draft.trim();
  const key = `${channel}:${query}:${revision}`;
  const searching = open && !value && query.length >= 2 && !disabled;
  const current = result?.key === key ? result : null;
  const options = searching ? current?.data?.clients ?? [] : [];
  const loading = searching && !current;
  const text = value?.legalName ?? draft;

  useEffect(() => {
    if (!searching) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(`/api/clients/search?channel=${channel}&q=${encodeURIComponent(query)}`, { signal: controller.signal, cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Não foi possível buscar clientes.");
        if (!controller.signal.aborted) setResult({ key, data });
      } catch (error) {
        if (!controller.signal.aborted) setResult({ key, error: error instanceof Error ? error.message : "Não foi possível buscar clientes." });
        else if (!cancelled) setResult({ key, error: "A busca demorou mais que o esperado. Tente novamente." });
      } finally { clearTimeout(timeout); }
    }, 250);
    let cancelled = false;
    return () => { cancelled = true; clearTimeout(timer); controller.abort(); };
  }, [searching, channel, query, key]);

  useEffect(() => {
    input.current?.setCustomValidity(!value && draft.trim() ? "Selecione um cliente nas sugestões ou limpe a busca." : "");
  }, [value, draft]);

  useEffect(() => {
    if (active >= 0 && open) document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, open, id]);

  function select(client: ClientSearchOption) {
    onChange(client); setDraft(""); setOpen(false); setActive(-1);
  }

  return <div className="client-autocomplete" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <label className="field" htmlFor={id}><span>Cliente</span></label>
    <input ref={input} id={id} role="combobox" aria-autocomplete="list" aria-expanded={open && !value}
      aria-controls={`${id}-options`} aria-activedescendant={active >= 0 && options[active] ? `${id}-option-${active}` : undefined}
      aria-describedby={`${id}-hint`} autoComplete="off" placeholder="Digite nome, razão social ou CPF/CNPJ…"
      value={text} required={required} disabled={disabled}
      onFocus={() => setOpen(true)}
      onChange={(event) => { setDraft(event.target.value); onChange(null); setOpen(true); setActive(-1); }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) { event.stopPropagation(); setOpen(false); setActive(-1); }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault(); setOpen(true);
          if (options.length) setActive(index => event.key === "ArrowDown" ? (index + 1) % options.length : (index <= 0 ? options.length : index) - 1);
        }
        if (event.key === "Enter" && open && !value) {
          event.preventDefault(); if (options[active]) select(options[active]);
        }
      }}/>
    {open && !value && <div className="client-suggestions">
      <ul id={`${id}-options`} role="listbox" aria-label="Clientes encontrados">
        {options.map((client, index) => <li id={`${id}-option-${index}`} key={client.id} role="option" aria-selected={index === active}
          onPointerDown={(event) => event.preventDefault()} onClick={() => select(client)}>
          <strong>{client.legalName}</strong>
          {(client.tradeName || client.cpfCnpj) && <small>{[client.tradeName, client.cpfCnpj].filter(Boolean).join(" · ")}</small>}
        </li>)}
      </ul>
      <div className="client-search-status" role="status">
        {query.length < 2 ? "Digite pelo menos 2 caracteres para buscar." : loading ? "Buscando clientes…" : current?.error ? <>{current.error} <button type="button" onClick={() => setRevision(n => n + 1)}>Tentar novamente</button></> : !options.length ? "Nenhum cliente disponível para esta operação." : current?.data?.hasMore ? "Há mais resultados. Continue digitando para refinar." : `${options.length} cliente(s) encontrado(s).`}
      </div>
    </div>}
    <small id={`${id}-hint`} className="client-search-hint">{value ? (value.id ? "Cliente selecionado. Para trocar, edite o nome e escolha uma sugestão." : "Nome do frete anterior preservado. Para trocar, busque um cliente cadastrado.") : "Busque e selecione um cliente cadastrado."}</small>
  </div>;
}
