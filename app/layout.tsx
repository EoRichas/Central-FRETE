import type { Metadata } from "next";
import "./globals.css";
import "./fleet-overrides.css";
import "./visual-refresh.css";
import "./interaction-refinements.css";
import "./theme.css";

export const metadata: Metadata = {
  title: {
    default: "Central Express",
    template: "%s | Central Express",
  },
  description:
    "Gestão integrada de vendas de frete e custos da Central Express.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

const themeBootstrap = `
(function () {
  try {
    var saved = window.localStorage.getItem("cf-theme");
    var prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    var theme = saved === "dark" || (!saved && prefersDark) ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch (_) {
    document.documentElement.dataset.theme = "light";
    document.documentElement.style.colorScheme = "light";
  }
})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
