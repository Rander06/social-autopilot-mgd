import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Termos de Serviço | Social PilotFlow SaaS",
  description:
    "Termos de Serviço da plataforma Social PilotFlow SaaS (Meu Gestor Digital).",
};

export default function TermosPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 text-slate-800">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <img
              src="/logo-pilotflow.jpg"
              alt="Social PilotFlow SaaS"
              className="h-10 w-10 rounded-xl border border-slate-200 object-cover"
            />
            <div>
              <h1 className="text-xl font-extrabold text-slate-900">
                Termos de Serviço
              </h1>
              <p className="text-xs text-slate-500">
                Social PilotFlow SaaS • Meu Gestor Digital
              </p>
            </div>
          </div>
          <Link
            href="/"
            className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
          >
            ← Voltar ao Painel
          </Link>
        </div>

        <section className="space-y-3 text-sm leading-relaxed text-slate-700">
          <h2 className="text-base font-bold text-slate-900">
            1. Aceitação dos Termos
          </h2>
          <p>
            Ao acessar ou utilizar a plataforma <strong>Social PilotFlow SaaS</strong>,
            operada por <strong>Meu Gestor Digital</strong>, você concorda com estes
            Termos de Serviço e com nossa{" "}
            <Link href="/privacidade" className="font-semibold text-indigo-600 underline">
              Política de Privacidade
            </Link>
            .
          </p>

          <h2 className="text-base font-bold text-slate-900">
            2. Descrição do Serviço
          </h2>
          <p>
            O Social PilotFlow SaaS é uma plataforma de automação de marketing e
            publicação de conteúdos em redes sociais (Instagram Business, Páginas do
            Facebook e TikTok), utilizando inteligência artificial (Google Gemini,
            OpenAI e Anthropic Claude) e armazenamento em nuvem (Cloudflare R2)
            conforme as configurações e chaves informadas por cada empresa cliente.
          </p>

          <h2 className="text-base font-bold text-slate-900">
            3. Credenciais Próprias (BYOK) e Contas Conectadas
          </h2>
          <p>
            Cada empresa cliente é responsável pelas chaves de API e tokens de acesso
            conectados ao painel (OpenAI, Google Gemini, Anthropic, Meta Graph API,
            TikTok Content Posting API e Cloudflare R2), bem como pelos custos de uso
            junto aos respectivos provedores e pelo cumprimento das políticas de uso de
            cada rede social.
          </p>

          <h2 className="text-base font-bold text-slate-900">
            4. Responsabilidade pelo Conteúdo Publicado
          </h2>
          <p>
            Todo conteúdo gerado, editado, agendado ou publicado por meio da
            plataforma — incluindo textos, imagens e marcas — é de exclusiva
            responsabilidade do usuário/empresa titular da conta. O sistema oferece
            modo de pré-visualização e aprovação manual antes da publicação sempre que
            o usuário desejar revisar o material.
          </p>

          <h2 className="text-base font-bold text-slate-900">
            5. Planos, Limites e Disponibilidade
          </h2>
          <p>
            O acesso às funcionalidades segue os limites do plano contratado (cota
            mensal de publicações, carrosséis e integrações). Embora trabalhemos para
            manter alta disponibilidade, interrupções temporárias podem ocorrer por
            manutenção ou indisponibilidade de APIs de terceiros (Meta, TikTok, OpenAI,
            Google ou Cloudflare).
          </p>

          <h2 className="text-base font-bold text-slate-900">
            6. Alterações e Contato
          </h2>
          <p>
            Estes termos podem ser atualizados periodicamente. Em caso de dúvidas ou
            solicitações de suporte, entre em contato pelo canal oficial do{" "}
            <strong>Meu Gestor Digital</strong> no próprio painel administrativo.
          </p>
        </section>

        <div className="border-t border-slate-100 pt-4 text-xs text-slate-500">
          Última atualização: Novembro de 2026 •{" "}
          <Link href="/privacidade" className="font-semibold text-indigo-600 underline">
            Ver Política de Privacidade
          </Link>
        </div>
      </div>
    </main>
  );
}
