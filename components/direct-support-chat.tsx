"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import styles from "./support-workspace.module.css";
type Message={id:string;body:string;author_label:string;created_at:string};
type Detail={chat:{id:string;recipient_name:string};messages:Message[]};
export function DirectSupportChat({endpoint,id,onEnded}:{endpoint:string;id:string;onEnded:()=>void}) {
  const [detail,setDetail]=useState<Detail|null>(null),[message,setMessage]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const box=useRef<HTMLDivElement>(null),messageId=useRef(""),ended=useRef(onEnded);
  useEffect(()=>{ended.current=onEnded;},[onEnded]);
  useEffect(()=>{
    const controller=new AbortController();let running=false;
    const refresh=async()=>{
      if(running||document.visibilityState!=="visible")return;running=true;
      try{
        const response=await fetch(`${endpoint}/chats/${id}`,{cache:"no-store",credentials:"same-origin",signal:controller.signal});
        const data=await response.json();
        if(controller.signal.aborted)return;
        if(response.status===404){ended.current();return;}
        if(!response.ok)throw new Error(data.error||"Não foi possível atualizar o chat.");
        setDetail(previous=>JSON.stringify(previous)===JSON.stringify(data)?previous:data);setError("");
      }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Chat indisponível.");}
      finally{running=false;}
    };
    void refresh();const timer=setInterval(()=>void refresh(),5000);
    const visible=()=>{if(document.visibilityState==="visible")void refresh();};document.addEventListener("visibilitychange",visible);
    return()=>{controller.abort();clearInterval(timer);document.removeEventListener("visibilitychange",visible);};
  },[endpoint,id]);
  const nearBottom=useRef(true);
  useEffect(()=>{if(nearBottom.current&&box.current)box.current.scrollTop=box.current.scrollHeight;},[detail?.messages]);
  async function reply(event:FormEvent){
    event.preventDefault();if(busy||!message.trim())return;
    messageId.current ||= crypto.randomUUID();const sent=message;setBusy(true);setError("");
    try{
      const response=await fetch(`${endpoint}/chats/${id}/messages`,{method:"POST",cache:"no-store",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({id:messageId.current,body:sent})});
      const data=await response.json();
      if(response.status===404){ended.current();return;}
      if(!response.ok)throw new Error(data.error||"Não foi possível enviar a mensagem.");
      messageId.current="";setMessage(current=>current===sent?"":current);
      const latest=await fetch(`${endpoint}/chats/${id}`,{cache:"no-store",credentials:"same-origin"});
      if(latest.status===404){ended.current();return;}
      if(latest.ok)setDetail(await latest.json());
    }catch(e){setError(e instanceof Error?e.message:"Não foi possível enviar.");}finally{setBusy(false);}
  }
  return <section className={styles.conversation} aria-label="Chat direto com o suporte">
    <header><span className={styles.eyebrow}>CHAT DIRETO</span><h2>Conversa com o suporte</h2><p className={styles.hint}>Quando o suporte encerrar, esta conversa e suas mensagens serão apagadas.</p></header>
    {error&&<p role="alert" className={styles.error}>{error}</p>}
    <div ref={box} className={`${styles.messages} ${styles.directMessages}`} role="log" aria-live="polite" onScroll={()=>{const b=box.current;if(b)nearBottom.current=b.scrollHeight-b.scrollTop-b.clientHeight<80;}}>
      {!detail?<p role="status">Carregando chat…</p>:detail.messages.length?detail.messages.map(m=><article key={m.id} className={styles.message}><header><strong>{m.author_label}</strong><time>{new Date(m.created_at).toLocaleString("pt-BR")}</time></header><p>{m.body}</p></article>):<p className={styles.hint}>O suporte abriu uma conversa com você. Escreva sua mensagem abaixo.</p>}
      {detail&&detail.messages.length>=200&&<p className={styles.hint}>Exibindo as 200 mensagens mais recentes.</p>}
    </div>
    <form onSubmit={reply} className={styles.form}><label>Sua mensagem<textarea rows={3} value={message} onChange={e=>setMessage(e.target.value)} maxLength={6000} required /></label><button type="submit" className={styles.primary} disabled={busy||!detail}>{busy?"Enviando…":"Enviar mensagem"}</button></form>
  </section>;
}
