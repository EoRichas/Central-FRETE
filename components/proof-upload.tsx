"use client";

import { useId, useRef, useState } from "react";
import { PROOF_ACCEPT, PROOF_FORMATS } from "@/lib/domain/proof-files";
import styles from "./proof-upload.module.css";

// From Uiverse.io by Creatlydev, adapted for a labelled file input.
export function UploadButton({ onClick, disabled, type = "button", children = "Upload" }: {
  onClick?: () => void; disabled?: boolean; type?: "button" | "submit"; children?: React.ReactNode;
}) {
  return <button type={type} className={styles.button} onClick={onClick} disabled={disabled}>
    <span className={styles.icon} aria-hidden="true"><svg strokeLinejoin="round" strokeLinecap="round" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" height="24" width="24"><path d="M7 18a4.6 4.4 0 0 1 0 -9a5 4.5 0 0 1 11 2h1a3.5 3.5 0 0 1 0 7h-1" /><path d="M9 15l3 -3l3 3M12 12v9" /></svg></span>
    <span>{children}</span>
  </button>;
}

export function ProofUpload({ name = "file", required = false, disabled = false, label = "Anexar comprovante" }: {
  name?: string; required?: boolean; disabled?: boolean; label?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  return <div className={`field ${styles.field}`}>
    <label htmlFor={id}>{label}</label>
    <div className={styles.row}>
      <input ref={input} id={id} className={styles.input} name={name} type="file" accept={PROOF_ACCEPT} required={required} disabled={disabled} aria-describedby={`${id}-hint`} onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")} />
      <UploadButton disabled={disabled} onClick={() => input.current?.click()} />
      <span className={styles.filename} role="status">{fileName || "Nenhum arquivo selecionado"}</span>
    </div>
    <small id={`${id}-hint`}>{PROOF_FORMATS}</small>
  </div>;
}
