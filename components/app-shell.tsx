"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { CurrentUser, Role } from "@/lib/contracts";
import { Icons } from "@/components/icons";
import { TruckLoader } from "@/components/truck-loader";

function roleLabel(role: Role) {
  return role === "GERENCIA" ? "PERFIL LEGADO" : role;
}

function userInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "CE";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

const navigation: Array<{
  href: string;
  label: string;
  icon: typeof Icons.home;
  roles: Role[];
}> = [
  { href: "/inicio", label: "Início", icon: Icons.home, roles: ["ADMIN", "GERENCIA", "VENDEDOR", "FINANCEIRO"] },
  { href: "/vendas", label: "Vendas / Fretes", icon: Icons.truck, roles: ["ADMIN", "GERENCIA", "VENDEDOR", "FINANCEIRO"] },
  { href: "/clientes", label: "Clientes", icon: Icons.users, roles: ["ADMIN", "GERENCIA"] },
  { href: "/prestadores", label: "Prestadores", icon: Icons.briefcase, roles: ["ADMIN", "GERENCIA"] },
  { href: "/frota", label: "Frota", icon: Icons.fleet, roles: ["ADMIN", "GERENCIA", "FINANCEIRO", "OPERACIONAL"] },
  { href: "/financeiro", label: "Financeiro", icon: Icons.wallet, roles: ["ADMIN", "GERENCIA", "FINANCEIRO"] },
  { href: "/vendedores", label: "Comissões", icon: Icons.users, roles: ["ADMIN", "GERENCIA", "VENDEDOR", "FINANCEIRO"] },
  { href: "/relatorios", label: "Relatórios", icon: Icons.chart, roles: ["ADMIN", "GERENCIA", "FINANCEIRO"] },
  { href: "/certificado", label: "Certificado digital", icon: Icons.wallet, roles: ["ADMIN", "FINANCEIRO"] },
  { href: "/configuracoes", label: "Configurações", icon: Icons.settings, roles: ["ADMIN"] },
];

function canAccessPath(pathname: string, role: Role) {
  if (role === "VENDEDOR" && /^\/vendas\/[^/]+\/editar\/?$/.test(pathname)) {
    return false;
  }
  const item = navigation.find(
    (entry) => pathname === entry.href || pathname.startsWith(`${entry.href}/`),
  );
  return item ? item.roles.includes(role) : true;
}

function dashboardGreeting(name: string) {
  const now = new Date();
  const hourPart = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now).find((part) => part.type === "hour")?.value;
  const hour = Number(hourPart ?? "12");
  const salutation = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const rawDate = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(now);
  const date = rawDate.charAt(0).toUpperCase() + rawDate.slice(1);
  const firstName = name.trim().split(/\s+/)[0] || name;
  return { salutation, firstName, date };
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [userLoaded, setUserLoaded] = useState(false);
  const [license, setLicense] = useState<{ blocked: boolean; alert: string | null }>({blocked: false, alert: null});

  useEffect(() => {
    let stopped = false;
    async function refresh() {
      try {
        const response = await fetch("/api/me", {cache: "no-store"});
        if (response.status === 401 || response.status === 403) { window.location.assign(`/login?return_to=${encodeURIComponent(pathname)}`); return; }
        if (!response.ok) throw new Error("Sessão indisponível");
        const payload = await response.json();
        if (!stopped) { setUser(payload.user); setLicense(payload.license); setUserLoaded(true); }
      } catch { if (!stopped) { setUser(null); setUserLoaded(true); } }
    }
    void refresh();
    const timer = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => { stopped = true; clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [pathname]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/login");
  }

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem("cf-sidebar", next ? "collapsed" : "expanded");
      return next;
    });
  }

  const visibleNavigation = user
    ? navigation.filter((item) => item.roles.includes(user.role) && (!license.blocked || item.href === "/certificado"))
    : navigation;
  const currentLabel = navigation.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  )?.label ?? "Central Express";
  const allowed = !user || canAccessPath(pathname, user.role);
  const brandHref = user?.role === "OPERACIONAL" ? "/frota" : "/inicio";
  const greeting = user ? dashboardGreeting(user.name) : null;

  return (
    <div className={`app-frame ${collapsed ? "sidebar-collapsed" : ""}`}>
      <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}>
        <div className="brand-row">
          <Link href={brandHref} className="brand" aria-label="Central Express — Início"><span className="brand-logo" aria-hidden="true" /><span className="brand-copy"><strong>Central Express</strong><small>Frete</small></span></Link>
          <button className="sidebar-close" onClick={() => setMobileOpen(false)} aria-label="Fechar menu"><Icons.close /></button>
        </div>
        <nav className="main-nav" aria-label="Navegação principal">
          {visibleNavigation.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className={active ? "active" : ""} aria-current={active ? "page" : undefined}><Icon /><span>{item.label}</span></Link>;
          })}
        </nav>
        <div className="sidebar-user">
          <div className="sidebar-user-avatar-stack">
            <span className="avatar">{user ? userInitials(user.name) : "CE"}</span>
            <button
              className="sidebar-user-switch"
              type="button"
              onClick={toggleCollapsed}
              aria-label="Esconder menu lateral"
              title="Esconder menu"
            >
              <span aria-hidden="true" />
            </button>
          </div>
          <span className="sidebar-user-copy">
            <strong>{user?.name ?? "Carregando…"}</strong>
            <small>{user ? roleLabel(user.role) : ""}</small>
            <button className="logout-button" onClick={logout} aria-label="Sair do sistema">Sair</button>
          </span>
        </div>
      </aside>
      {collapsed && <button className="sidebar-reveal-button" onClick={toggleCollapsed} aria-label="Aparecer menu"><Icons.chevron /><span>Aparecer</span></button>}
      {mobileOpen && <button className="sidebar-backdrop" onClick={() => setMobileOpen(false)} aria-label="Fechar menu" />}
      <div className="app-main">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Abrir menu"><Icons.menu /></button>
          <div className="topbar-heading">
            <div className="topbar-title-row">
              <span className="topbar-eyebrow">Central Express</span>
              {pathname === "/inicio" && greeting && (
                <div className="topbar-greeting" role="status">
                  <span className="topbar-greeting-text">{greeting.salutation}, <strong>{greeting.firstName}</strong></span>
                  <span className="topbar-greeting-dot" aria-hidden="true">•</span>
                  <span className="topbar-greeting-date">{greeting.date}</span>
                </div>
              )}
            </div>
            <strong>{currentLabel}</strong>
          </div>
        </header>
        <main className="page-content">
          {license.alert && user?.role === "ADMIN" && <div className="license-alert" role="status">{license.alert} <Link href="/certificado">Ver mensalidade</Link></div>}
          {!userLoaded ? <TruckLoader label="Carregando sessão…" /> : !user ? <section className="panel"><p>Não foi possível verificar sua sessão. Atualize a página.</p></section> : license.blocked && pathname !== "/certificado" ? <section className="panel billing-card"><h2>Acesso suspenso</h2><p>A licença mensal está pendente. Seus dados estão preservados.</p>{["ADMIN", "FINANCEIRO"].includes(user.role) ? <Link className="button primary" href="/certificado">Regularizar pagamento</Link> : <p>Solicite a regularização ao Administrador ou Financeiro.</p>}</section> : !allowed ? (
            <section className="panel">
              <span className="eyebrow">Acesso restrito</span>
              <h2>Seu perfil não permite abrir esta tela.</h2>
              <p>Este perfil possui acesso somente às áreas autorizadas pelo administrador.</p>
            </section>
          ) : children}
        </main>
      </div>
    </div>
  );
}
