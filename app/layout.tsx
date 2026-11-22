import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Social PilotFlow SaaS | Meu Gestor Digital",
  description:
    "Plataforma SaaS Multi-Empresas & Multi-IA para automação de posts, carrosséis e ambientação de produtos com IA no Instagram, Facebook e TikTok.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen antialiased selection:bg-indigo-100 selection:text-indigo-900">
        {children}
      </body>
    </html>
  );
}
