import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Social Autopilot | Meu Gestor Digital",
  description:
    "Automação de criação e publicação de posts no Instagram e Facebook para a agência Meu Gestor Digital.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
