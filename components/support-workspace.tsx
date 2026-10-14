"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import styles from "./support-workspace.module.css";

type Ticket = {
  id: string;
  number: number;
  title: string;
  description: string;
  module: string;
  status: string;
  priority: string;
  created_at: string;
};
type Message = {
  id: string;
  body: string;
  created_at: string;
  author_label: string;
};
type Attachment = { id: string; bytes: number; mime: string };
type Detail = {
  ticket: Ticket;
  messages: Message[];
  attachments: Attachment[];
};
type Profile = {
  user: { name: string };
  companies: Array<{ name: string; modules: string[] }>;
};
const labels: Record<string, string> = {
  novo: "Recebido",
  analise: "Em análise",
  andamento: "Em atendimento",
  aguardando: "Aguardando resposta",
  resolvido: "Resolvido",
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};
const date = (value: string) => new Date(value).toLocaleString("pt-BR");
async function api<T>(
  endpoint: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${endpoint}/${path}`, {
    method: body === undefined ? "GET" : "POST",
    cache: "no-store",
    credentials: "same-origin",
    headers:
      body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(data.error || "Não foi possível concluir a operação."), { status: response.status });
  return data;
}
export function SupportWorkspace({ endpoint }: { endpoint: string }) {
  const [profile, setProfile] = useState<Profile | null>(null),
    [tickets, setTickets] = useState<Ticket[]>([]),
    [page, setPage] = useState(0),
    [more, setMore] = useState(false);
  const [selected, setSelected] = useState<string | null>(null),
    [detail, setDetail] = useState<Detail | null>(null),
    [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [message, setMessage] = useState("");
  const createId = useRef(""),
    messageId = useRef("");
  const generation = useRef(0);
  const activeRefreshes = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    activeRefreshes.current++;
    try {
      const [p, list, d] = await Promise.all([
        api<Profile>(endpoint, "me"),
        api<{ tickets: Ticket[]; hasMore: boolean }>(
          endpoint,
          `tickets?page=${page}`,
        ),
        selected
          ? api<Detail>(endpoint, `tickets/${selected}`).catch((error) => {
              if (error.status === 404) return null;
              throw error;
            })
          : Promise.resolve(null),
      ]);
      if (current !== generation.current) return;
      setProfile(p);
      setTickets(list.tickets);
      setMore(list.hasMore);
      setDetail(d);
      if (selected && !d) {
        setSelected(null);
        setMessage("");
        setNotice("Este chamado não está mais disponível neste sistema. O histórico permanece com a equipe de suporte.");
      }
      setError("");
    } catch (e) {
      if (current === generation.current)
        setError(e instanceof Error ? e.message : "Suporte indisponível.");
    } finally {
      activeRefreshes.current--;
      if (current === generation.current) setLoading(false);
    }
  }, [endpoint, page, selected]);
  useEffect(() => {
    setLoading(true);
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" && activeRefreshes.current === 0)
        void refresh();
    }, 5000);
    return () => {
      generation.current++;
      clearInterval(timer);
    };
  }, [refresh]);
  function open(id: string) {
    setSelected(id);
    setDetail(null);
    setCreating(false);
    setMessage("");
    messageId.current = "";
    setNotice("");
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    createId.current ||= crypto.randomUUID();
    setBusy(true);
    setError("");
    try {
      const ticket = await api<Ticket>(endpoint, "tickets", {
        id: createId.current,
        title: data.get("title"),
        description: data.get("description"),
        module: data.get("module"),
        kind: data.get("kind"),
        impact: data.get("impact"),
        affected: data.get("affected"),
      });
      createId.current = "";
      setPage(0);
      open(ticket.id);
      setNotice(
        `Chamado SUP-${ticket.number} aberto. Você pode anexar imagens ou documentos abaixo.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao abrir chamado.");
    } finally {
      setBusy(false);
    }
  }
  async function reply(event: FormEvent) {
    event.preventDefault();
    if (!selected || busy) return;
    messageId.current ||= crypto.randomUUID();
    setBusy(true);
    setError("");
    try {
      await api(endpoint, `tickets/${selected}/messages`, {
        id: messageId.current,
        body: message,
      });
      messageId.current = "";
      setMessage("");
      await refresh();
      setNotice("Mensagem enviada ao suporte.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao enviar mensagem.");
    } finally {
      setBusy(false);
    }
  }
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || busy) return;
    const form = event.currentTarget;
    const file = new FormData(form).get("file");
    if (!(file instanceof File) || !file.size) return;
    if (file.size > 5242880) {
      setError("O limite por anexo é de 5 MB.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = () =>
          reject(new Error("Não foi possível ler o arquivo."));
        reader.readAsDataURL(file);
      });
      await api(endpoint, `tickets/${selected}/attachments`, {
        id: crypto.randomUUID(),
        data,
      });
      form.reset();
      await refresh();
      setNotice("Anexo enviado.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao enviar anexo.");
    } finally {
      setBusy(false);
    }
  }
  const badge = (value: string) => (
    <span className={styles.badge} data-tone={value}>
      {labels[value] || value}
    </span>
  );
  return (
    <section className={styles.workspace} aria-label="Suporte">
      <header className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>ATENDIMENTO</span>
          <h1>Como podemos ajudar?</h1>
          <p>Abra um chamado e converse com o suporte sem sair do sistema.</p>
        </div>
        <button
          type="button"
          className={styles.primary}
          disabled={!profile || busy}
          onClick={() => {
            setCreating(true);
            setSelected(null);
            setDetail(null);
            setNotice("");
          }}
        >
          + Novo chamado
        </button>
      </header>
      {error && (
        <div role="alert" className={styles.error}>
          {error}{" "}
          <button type="button" onClick={() => void refresh()}>
            Tentar novamente
          </button>
        </div>
      )}
      {notice && (
        <p role="status" className={styles.notice}>
          {notice}
        </p>
      )}
      <div className={styles.layout}>
        <aside className={styles.list}>
          <div className={styles.listHeading}>
            <h2>Meus chamados</h2>
            <button
              type="button"
              aria-label="Atualizar chamados"
              onClick={() => void refresh()}
              disabled={busy}
            >
              Atualizar
            </button>
          </div>
          {loading && !tickets.length ? (
            <p role="status">Carregando chamados…</p>
          ) : tickets.length === 0 ? (
            <div className={styles.empty}>
              <strong>Nenhum chamado por aqui.</strong>
              <p>Quando precisar de ajuda, use “Novo chamado”.</p>
            </div>
          ) : (
            tickets.map((t) => (
              <button
                type="button"
                key={t.id}
                className={styles.ticket}
                aria-pressed={selected === t.id}
                disabled={busy}
                onClick={() => open(t.id)}
              >
                <span>
                  SUP-{String(t.number).padStart(5, "0")} · {t.module}
                </span>
                <strong>{t.title}</strong>
                <div>
                  {badge(t.status)}
                  {badge(t.priority)}
                </div>
                <small>{date(t.created_at)}</small>
              </button>
            ))
          )}
          <div className={styles.pagination}>
            <button
              type="button"
              disabled={page === 0 || busy}
              onClick={() => setPage((n) => n - 1)}
            >
              Anterior
            </button>
            <span>Página {page + 1}</span>
            <button
              type="button"
              disabled={!more || busy}
              onClick={() => setPage((n) => n + 1)}
            >
              Próxima
            </button>
          </div>
        </aside>
        <div className={styles.panel}>
          {creating ? (
            <form onSubmit={create} className={styles.form}>
              <div>
                <h2>Abrir chamado</h2>
                <p>
                  Solicitante: <strong>{profile?.user.name}</strong> ·{" "}
                  {profile?.companies[0]?.name}
                </p>
              </div>
              <label>
                Onde está o problema?
                <select name="module" required>
                  {profile?.companies[0]?.modules.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </label>
              <label>
                Resumo
                <input
                  name="title"
                  minLength={5}
                  maxLength={160}
                  required
                  placeholder="Ex.: não consigo salvar uma venda"
                />
              </label>
              <label>
                O que aconteceu?
                <textarea
                  name="description"
                  rows={5}
                  minLength={10}
                  maxLength={6000}
                  required
                  placeholder="Conte o que tentou fazer, o resultado e como podemos reproduzir o problema."
                />
              </label>
              <div className={styles.fields}>
                <label>
                  Tipo
                  <select name="kind">
                    <option value="erro">Problema / erro</option>
                    <option value="duvida">Dúvida</option>
                    <option value="melhoria">Sugestão</option>
                  </select>
                </label>
                <label>
                  Impacto
                  <select name="impact">
                    <option value="parcial">
                      Consigo continuar parcialmente
                    </option>
                    <option value="bloqueado">Não consigo trabalhar</option>
                    <option value="nenhum">Não impede o trabalho</option>
                  </select>
                </label>
                <label>
                  Quem foi afetado?
                  <select name="affected">
                    <option value="uma_pessoa">Somente eu</option>
                    <option value="equipe">Minha equipe</option>
                    <option value="todos">Todos</option>
                  </select>
                </label>
              </div>
              <p className={styles.hint}>
                Não inclua senhas, chaves, dados financeiros ou documentos
                pessoais. Você poderá anexar evidências depois de abrir o
                chamado.
              </p>
              <div className={styles.actions}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setCreating(false)}
                >
                  Cancelar
                </button>
                <button className={styles.primary} disabled={busy}>
                  {busy ? "Enviando…" : "Enviar chamado"}
                </button>
              </div>
            </form>
          ) : selected ? (
            detail ? (
              <div className={styles.conversation}>
                <header>
                  <span className={styles.eyebrow}>
                    SUP-{String(detail.ticket.number).padStart(5, "0")} ·{" "}
                    {detail.ticket.module}
                  </span>
                  <h2>{detail.ticket.title}</h2>
                  <div className={styles.badges}>
                    {badge(detail.ticket.status)}
                    {badge(detail.ticket.priority)}
                  </div>
                </header>
                <p className={styles.description}>
                  {detail.ticket.description}
                </p>
                <h3>Conversa com o suporte</h3>
                <div className={styles.messages}>
                  {detail.messages.length === 0 ? (
                    <p className={styles.hint}>
                      Recebemos seu chamado. As respostas aparecerão aqui.
                    </p>
                  ) : (
                    detail.messages.map((m) => (
                      <article
                        key={m.id}
                        className={styles.message}
                        data-own={m.author_label === "Você"}
                      >
                        <header>
                          <strong>{m.author_label}</strong>
                          <time>{date(m.created_at)}</time>
                        </header>
                        <p>{m.body}</p>
                      </article>
                    ))
                  )}
                </div>
                <form onSubmit={reply} className={styles.form}>
                  <label>
                    Sua mensagem
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={3}
                      maxLength={6000}
                      required
                    />
                  </label>
                  <button
                    className={styles.primary}
                    disabled={busy || !message.trim()}
                  >
                    {busy ? "Enviando…" : "Enviar mensagem"}
                  </button>
                </form>
                <div className={styles.evidence}>
                  <h3>Anexos</h3>
                  {detail.attachments.map((a, i) => (
                    <a
                      key={a.id}
                      href={`${endpoint}/attachments/${a.id}`}
                      download
                    >
                      Anexo {i + 1} · {Math.ceil(a.bytes / 1024)} KB ↓
                    </a>
                  ))}
                  <form onSubmit={upload} className={styles.form}>
                    <label>
                      Adicionar imagem ou PDF
                      <input
                        type="file"
                        name="file"
                        required
                        accept="image/png,image/jpeg,image/webp,application/pdf"
                      />
                    </label>
                    <p className={styles.hint}>
                      Até 5 MB. Oculte informações sensíveis antes de anexar.
                    </p>
                    <button type="submit" disabled={busy}>
                      {busy ? "Enviando…" : "Enviar anexo"}
                    </button>
                  </form>
                </div>
              </div>
            ) : (
              <p role="status">
                {loading
                  ? "Carregando conversa…"
                  : "Não foi possível carregar este chamado."}
              </p>
            )
          ) : (
            <div className={styles.welcome}>
              <span aria-hidden="true">↗</span>
              <h2>Seu canal direto com o suporte.</h2>
              <p>
                Selecione um chamado para ver as respostas ou abra uma nova
                solicitação.
              </p>
              <p className={styles.hint}>
                Sua empresa e seu usuário são identificados automaticamente.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
