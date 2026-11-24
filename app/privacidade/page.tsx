import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Privacidade | Social PilotFlow SaaS",
  description:
    "Política de Privacidade e Proteção de Dados (LGPD) do Social PilotFlow SaaS.",
};

export default function PrivacidadePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12 text-slate-800">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-8 shadow-sm space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <img
              src="/logo-pilotflow.jpg"
              alt="Social PilotFlow SaaS"
              className="h-10 w-10 rounded-xl border border-slate-200 object-cover"
            />
            <div>
              <h1 className="text-xl font-extrabold text-slate-900">
                Política de Privacidade
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
            1. Dados Coletados
          </h2>
          <p>
            Para operar a plataforma <strong>Social PilotFlow SaaS</strong>, coletamos
            apenas os dados estritamente necessários ao funcionamento do serviço:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Dados cadastrais:</strong> nome da empresa, nome do responsável,
              e-mail de acesso e WhatsApp de contato.
            </li>
            <li>
              <strong>Credenciais e tokens de integração:</strong> chaves de API
              (OpenAI, Google Gemini, Anthropic, Cloudflare R2) e tokens OAuth de
              redes sociais (Meta Graph API e TikTok Content Posting API), todos
              armazenados com criptografia <strong>AES-256-GCM</strong>.
            </li>
            <li>
              <strong>Conteúdos e mídias:</strong> prompts, textos, imagens e
              histórico de publicações gerados ou enviados pelo usuário.
            </li>
          </ul>

          <h2 className="text-base font-bold text-slate-900">
            2. Finalidade e Uso das Informações
          </h2>
          <p>
            Os dados e tokens autorizados são utilizados exclusivamente para gerar
            artes e legendas solicitadas pelo usuário e publicar conteúdos nas contas
            de Instagram, Facebook e TikTok explicitamente conectadas por ele.{" "}
            <strong>Não vendemos, alugamos nem compartilhamos</strong> dados ou tokens
            com terceiros fora dos provedores necessários à execução da publicação.
          </p>

          <h2 className="text-base font-bold text-slate-900">
            3. Segurança e Armazenamento
          </h2>
          <p>
            As chaves e tokens sensíveis são criptografados antes de serem gravados no
            banco de dados (Supabase) e nunca são exibidos em texto claro na
            interface após salvos. As imagens das publicações são armazenadas no
            Cloudflare R2 exclusivamente para envio às plataformas sociais.
          </p>

          <h2 className="text-base font-bold text-slate-900">
            4. Direitos do Titular e Exclusão de Dados (LGPD)
          </h2>
          <p>
            Em conformidade com a Lei Geral de Proteção de Dados (Lei nº
            13.709/2018), o usuário pode revogar tokens, desconectar suas contas
            sociais (Instagram, Facebook e TikTok) diretamente na aba{" "}
            <strong>Integrações</strong> ou solicitar a exclusão completa de seus
            dados e histórico pelo suporte oficial do{" "}
            <strong>Meu Gestor Digital</strong>.
          </p>
        </section>

        <div className="border-t border-slate-100 pt-4 text-xs text-slate-500">
          Última atualização: Novembro de 2026 •{" "}
          <Link href="/termos" className="font-semibold text-indigo-600 underline">
            Ver Termos de Serviço
          </Link>
        </div>
      </div>
    </main>
  );
}
