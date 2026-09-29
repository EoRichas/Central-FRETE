"use client";
import { useState } from 'react';
export function PdfDownloadButton({url,filename,label='Salvar em PDF'}:{url:string;filename:string;label?:string}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function download(){setBusy(true);setError('');try{
  const response=await fetch(url,{cache:'no-store'});
  if(!response.ok){const body=await response.json();throw new Error(body.error||'Não foi possível gerar o PDF.');}
  if(!response.headers.get('content-type')?.includes('application/pdf'))throw new Error('O servidor não retornou um PDF.');
  const objectUrl=URL.createObjectURL(await response.blob()),link=document.createElement('a');link.href=objectUrl;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
 }catch(e){setError(e instanceof Error?e.message:'Não foi possível gerar o PDF.');}finally{setBusy(false);}}
 return <div className="form-stack"><button className="button primary" type="button" disabled={busy} onClick={download}>{busy?'Gerando PDF…':label}</button>{error&&<small role="alert" className="form-error">{error}</small>}</div>;
}
