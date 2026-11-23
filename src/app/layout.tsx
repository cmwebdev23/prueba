import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Equipo de agentes · Orquestador, Develop y Testing",
  description: "Tres agentes de IA que trabajan juntos para modificar una web.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <header className="topbar">
          <Link href="/" className="brand">
            <span className="brand-dots" aria-hidden>
              <i className="c-orchestrator" />
              <i className="c-develop" />
              <i className="c-testing" />
            </span>
            Equipo de agentes
          </Link>
          <span className="topbar-sub">Orquestador · Develop · Testing</span>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
