"use client";

import Link from "next/link";
import { Icons } from "@/components/icons";

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: React.ReactNode }) {
  return <div className="page-header"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="page-actions">{actions}</div>}</div>;
}
export function LoadingState({ label = "Carregando informações…" }: { label?: string }) {
  return <div className="state-panel" role="status"><span className="spinner" />{label}</div>;
}
export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="state-panel state-error" role="alert"><strong>Não foi possível carregar</strong><span>{message}</span>{retry && <button className="button secondary" onClick={retry}>Tentar novamente</button>}</div>;
}
export function EmptyState({ title, description, href, action }: { title: string; description: string; href?: string; action?: string }) {
  return <div className="empty-state"><span className="empty-icon"><Icons.receipt /></span><h3>{title}</h3><p>{description}</p>{href && action && <Link className="button primary" href={href}>{action}</Link>}</div>;
}
export function StatusBadge({ status, partial = false }: { status: string; partial?: boolean }) {
  const normalized = status
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, "_")
    .toLowerCase();
  return <span className={`status-badge status-${normalized}`}>{partial ? "PARCIAL · " : ""}{status.replace(/_/g, " ")}</span>;
}
export function Modal({ title, description, open, onClose, children, wide = false }: { title: string; description?: string; open: boolean; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  if (!open) return null;
  return <div className="modal-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"><header><div><h2 id="modal-title">{title}</h2>{description && <p>{description}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Fechar"><Icons.close /></button></header>{children}</section></div>;
}
export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}
