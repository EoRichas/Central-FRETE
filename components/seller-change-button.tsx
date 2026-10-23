"use client";
import { useState } from 'react';
import { apiMutation,useApi } from './use-api';
import { Field,Modal } from './ui';

export function SellerChangeButton({source,id,sellerId,sellerName,onChanged}:{source:'sale'|'freight';id:string;sellerId:string|null|undefined;sellerName:string|null|undefined;onChanged:()=>void}) {
  const [open,setOpen]=useState(false),[selected,setSelected]=useState(''),[previous,setPrevious]=useState<string|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const sellers=useApi<{sellers:{id:string;name:string}[]}>(open?'/api/sales/sellers?assignment=1':null);
  async function save(){
    if(!selected||busy)return;
    setBusy(true);setError('');
    try {
      const result=await apiMutation<{accessTransferred:boolean}>(`${source==='freight'?'/api/fleet/freights':'/api/sales'}/${encodeURIComponent(id)}/seller`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({sellerId:selected,previousSellerId:previous})});
      setOpen(false);
      if(result.accessTransferred){window.location.assign(source==='freight'?'/frota':'/vendas');return;}
      onChanged();
    } catch(e){setError(e instanceof Error?e.message:'Não foi possível trocar o vendedor.');}
    finally {setBusy(false);}
  }
  return <><button type="button" className="table-action" onClick={()=>{setPrevious(sellerId??null);setSelected('');setError('');setOpen(true);}}>Trocar vendedor</button><Modal open={open} titleId="seller-change-title" title="Trocar vendedor" onClose={()=>{if(!busy)setOpen(false);}}><div className="modal-body form-stack">
    <p>Vendedor atual: <strong>{sellerName||'Não informado'}</strong></p>
    <Field label="Novo vendedor"><select value={selected} disabled={busy||sellers.loading||Boolean(sellers.error)} onChange={e=>setSelected(e.target.value)}><option value="">{sellers.loading?'Carregando vendedores…':'Selecione um vendedor'}</option>{sellers.data?.sellers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
    <p>A comissão automática usará o cadastro do novo vendedor. Valores combinados e baixas já registradas nesta venda serão preservados. Ao transferir uma venda própria, o perfil vendedor deixa de ter acesso a ela.</p>
    {sellers.error&&<><p className="form-error" role="alert">{sellers.error}</p><button type="button" className="button secondary" onClick={sellers.refresh}>Tentar novamente</button></>}
    {error&&<p className="form-error" role="alert">{error}</p>}
    <div className="form-actions"><button type="button" className="button secondary" disabled={busy} onClick={()=>setOpen(false)}>Cancelar</button><button type="button" className="button primary" disabled={busy||!selected||selected===previous||sellers.loading||Boolean(sellers.error)} onClick={save}>{busy?'Salvando…':'Salvar vendedor'}</button></div>
  </div></Modal></>;
}
