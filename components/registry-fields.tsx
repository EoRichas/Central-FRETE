"use client";
import { useEffect, useRef, useState } from 'react';
import { Field } from '@/components/ui';
import { EMPTY_ADDRESS, type RegistryAddress, type ClientChannel } from '@/lib/domain/registry';

export function ActiveSelect({active=true}:{active?:boolean}) {
  return <Field label="Situação"><select name="active" defaultValue={String(active)}><option value="true">Ativo</option><option value="false">Inativo</option></select></Field>;
}
export function ClientChannelSelect({value='AMBOS'}:{value?:ClientChannel}) {
  return <Field label="Canal de atendimento"><select name="saleChannel" defaultValue={value}><option value="FROTA">Frota</option><option value="CEGONHA">Cegonha</option><option value="AMBOS">Ambos</option></select></Field>;
}
export function AddressFields({initial,legacy,required=true}:{initial?:RegistryAddress|null;legacy?:string|null;required?:boolean}) {
  const [address,setAddress]=useState<RegistryAddress>(()=>({...EMPTY_ADDRESS,...initial}));
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const version=useRef(0),controller=useRef<AbortController|null>(null);
  useEffect(()=>()=>controller.current?.abort(),[]);
  function change(key:keyof RegistryAddress,value:string){
    version.current++;controller.current?.abort();setBusy(false);setMessage('');
    setAddress(a=>({...a,[key]:value}));
  }
  async function lookup(){
    const cep=address.cep.replace(/\D/g,'');
    if(cep.length!==8){setMessage('Informe um CEP com 8 dígitos.');return;}
    controller.current?.abort();const abort=new AbortController();controller.current=abort;
    const current=++version.current;setBusy(true);setMessage('');
    const timeout=setTimeout(()=>abort.abort(),8000);
    try{
      const response=await fetch(`https://viacep.com.br/ws/${cep}/json/`,{signal:abort.signal});
      if(!response.ok)throw new Error('Falha na consulta do CEP. Preencha o endereço manualmente.');
      const data=await response.json();
      if(data.erro)throw new Error('CEP não encontrado. Confira o CEP ou preencha manualmente.');
      if(current!==version.current)return;
      setAddress(a=>({...a,cep,street:data.logradouro??'',district:data.bairro??'',city:data.localidade??'',state:data.uf??''}));
      setMessage('Confira o endereço, o número e o complemento.');
    }catch(error){if(current===version.current)setMessage(abort.signal.aborted?'Consulta interrompida. Tente novamente ou preencha manualmente.':error instanceof Error?error.message:'Falha ao consultar CEP.');}
    finally{clearTimeout(timeout);if(current===version.current)setBusy(false);}
  }
  const hasAddress=Object.values(address).some(v=>v.trim());
  const mustFill=required||hasAddress;
  return <>
    {legacy&&!initial&&<p className="field-hint">Endereço anterior: {legacy}. Ele será preservado se os novos campos ficarem vazios.</p>}
    <div className="form-grid three">
      <Field label="CEP"><div className="cep-lookup-field"><input name="cep" inputMode="numeric" maxLength={9} autoComplete="postal-code" value={address.cep} onChange={e=>change('cep',e.target.value)} onBlur={()=>{if(address.cep.replace(/\D/g,'').length===8)void lookup();}}/><button type="button" className="button secondary compact-button" disabled={busy} onClick={()=>void lookup()}>{busy?'Buscando…':'Buscar CEP'}</button></div></Field>
      {([['street','Logradouro'],['number','Número'],['complement','Complemento'],['district','Bairro'],['city','Cidade'],['state','UF']] as const).map(([key,label])=><Field label={label} key={key}><input name={key} value={address[key]} maxLength={key==='state'?2:key==='number'?20:key==='street'?160:100} onChange={e=>change(key,key==='state'?e.target.value.toUpperCase():e.target.value)} required={key!=='complement'&&mustFill}/></Field>)}
    </div>
    {message&&<p className="field-hint" role="status">{message}</p>}
  </>;
}
