"use client";
import { useEffect, useRef, useState } from 'react';
import { Modal } from './ui';
export function ReportPreviewButton({url,filename,label,title="Relatório de prestadores"}:{url:string;filename:string;label:string;title?:string}) {
 const [pdf,setPdf]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const active=useRef<AbortController|null>(null),objectUrl=useRef<string|null>(null);
 function close(){if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);objectUrl.current=null;setPdf(null);}
 useEffect(()=>()=>{active.current?.abort();if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);},[]);
 async function generate(){if(active.current)return;const controller=new AbortController();active.current=controller;setBusy(true);setError('');
  try{const response=await fetch(url,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(60000)])});if(!response.ok)throw new Error((await response.json()).error||'Não foi possível gerar o relatório.');const blob=await response.blob();if(controller.signal.aborted)return;close();objectUrl.current=URL.createObjectURL(blob);setPdf(objectUrl.current);}
  catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Não foi possível gerar o relatório.');}
  finally{if(active.current===controller)active.current=null;if(!controller.signal.aborted)setBusy(false);}
 }
 return <><button type="button" className="button secondary" disabled={busy} onClick={generate}>{busy?'Gerando…':label}</button>{error&&<p className="form-error" role="alert">{error}</p>}<Modal open={Boolean(pdf)} onClose={close} title={title} wide>{pdf&&<div className="modal-body form-stack"><div className="order-actions"><a className="button secondary" href={pdf} target="_blank" rel="noreferrer">Visualizar / imprimir</a><a className="button secondary" href={pdf} download={filename}>Salvar PDF</a><button type="button" className="button secondary" onClick={close}>Fechar</button></div><iframe className="order-preview" title={title} src={pdf}/></div>}</Modal></>;
}
