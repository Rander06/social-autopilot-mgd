"use client";

import { useEffect, useState } from "react";

interface GeneratedPostContent {
  headline_arte: string;
  subtitulo_arte: string;
  legenda: string;
  hashtags: string;
}

interface PublishResult {
  success: boolean;
  imageUrl: string;
  instagramPostId: string;
  facebookPostId: string;
  generatedAt: string;
  post: GeneratedPostContent;
}

const STORAGE_KEY = "mgd_last_published_post";

export default function HomePage() {
  const [secret, setSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastPost, setLastPost] = useState<PublishResult | null>(null);
  const [copiedCaption, setCopiedCaption] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as PublishResult;
        setLastPost(parsed);
      }
    } catch {
      // Ignora erro de leitura do localStorage
    }
  }, []);

  async function handleGenerateAndPublish(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setCopiedCaption(false);

    const trimmedSecret = secret.trim();
    if (!trimmedSecret) {
      setErrorMessage("Informe a senha (CRON_SECRET) para autorizar a publicação.");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/cron/gerar-e-postar", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${trimmedSecret}`,
        },
        cache: "no-store",
      });

      const data = await response.json().catch(() => null);

      if (response.status === 401) {
        setErrorMessage(
          "Senha inválida (401). Verifique o valor de CRON_SECRET e tente novamente."
        );
        return;
      }

      if (!response.ok) {
        setErrorMessage(
          data?.error ||
            `Erro ao executar automação (HTTP ${response.status}).`
        );
        return;
      }

      const result: PublishResult = {
        success: true,
        imageUrl: data.imageUrl,
        instagramPostId: data.instagramPostId,
        facebookPostId: data.facebookPostId,
        generatedAt: data.generatedAt || new Date().toISOString(),
        post: data.post,
      };

      setLastPost(result);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
      } catch {
        // Ignora erro ao salvar no localStorage
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? `Falha na requisição: ${err.message}`
          : "Erro inesperado ao conectar com o servidor."
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCopyCaption() {
    if (!lastPost?.post) return;
    const fullText = `${lastPost.post.legenda.trim()}\n\n${lastPost.post.hashtags.trim()}`;
    try {
      await navigator.clipboard.writeText(fullText);
      setCopiedCaption(true);
      setTimeout(() => setCopiedCaption(false), 2500);
    } catch {
      setErrorMessage("Não foi possível copiar a legenda automaticamente.");
    }
  }

  return (
    <main className="min-h-screen bg-[#FAF5EE] text-[#2C1E16] px-4 py-10 md:px-8">
      <div className="mx-auto max-w-5xl space-y-8">
        {/* Cabeçalho */}
        <header className="rounded-2xl border border-[#2C1E16]/10 bg-white/80 p-6 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <span className="inline-flex items-center rounded-full bg-[#C85A32]/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[#C85A32]">
                Social Autopilot MGD
              </span>
              <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#2C1E16] md:text-3xl">
                Meu Gestor Digital — Automação Meta
              </h1>
              <p className="mt-1 text-sm text-[#2C1E16]/75">
                Geração automática de copy com Gemini 2.5 Flash, arte 1080×1080,
                hospedagem no Cloudflare R2 e publicação no Instagram e Facebook.
              </p>
            </div>
            <div className="rounded-xl border border-[#1E7E53]/25 bg-[#1E7E53]/10 px-4 py-3 text-right">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#1E7E53]">
                Agenda Cron (Vercel)
              </p>
              <p className="text-sm font-bold text-[#2C1E16]">
                Seg, Qua e Sex às 13:00 UTC
              </p>
              <p className="text-xs text-[#2C1E16]/70">0 13 * * 1,3,5</p>
            </div>
          </div>
        </header>

        {/* Painel Protegido por Senha */}
        <section className="rounded-2xl border border-[#2C1E16]/10 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-[#2C1E16]">
            Disparo Manual Protegido
          </h2>
          <p className="mt-1 text-sm text-[#2C1E16]/70">
            Digite a senha configurada em{" "}
            <code className="rounded bg-[#FAF5EE] px-1.5 py-0.5 font-mono text-xs text-[#C85A32]">
              CRON_SECRET
            </code>{" "}
            para gerar um post inédito e publicar imediatamente.
          </p>

          <form
            onSubmit={handleGenerateAndPublish}
            className="mt-5 flex flex-col gap-4 md:flex-row md:items-end"
          >
            <div className="flex-1">
              <label
                htmlFor="cron-secret"
                className="block text-sm font-semibold text-[#2C1E16]"
              >
                Senha de Acesso (CRON_SECRET)
              </label>
              <div className="relative mt-1.5">
                <input
                  id="cron-secret"
                  type={showSecret ? "text" : "password"}
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  placeholder="Digite o token CRON_SECRET..."
                  disabled={isLoading}
                  autoComplete="current-password"
                  className="w-full rounded-xl border border-[#2C1E16]/20 bg-[#FAF5EE]/60 px-4 py-3 pr-24 text-sm text-[#2C1E16] placeholder-[#2C1E16]/40 outline-none transition focus:border-[#C85A32] focus:ring-2 focus:ring-[#C85A32]/20 disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg px-2.5 py-1 text-xs font-semibold text-[#2C1E16]/70 hover:bg-[#2C1E16]/10"
                >
                  {showSecret ? "Ocultar" : "Mostrar"}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#C85A32] px-6 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#b04b26] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70 md:min-w-[230px]"
            >
              {isLoading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Publicando...
                </>
              ) : (
                "Gerar e Publicar Agora"
              )}
            </button>
          </form>

          {isLoading && (
            <div className="mt-4 rounded-xl border border-[#C85A32]/25 bg-[#FAF5EE] p-4 text-sm text-[#2C1E16]">
              <p className="font-semibold text-[#C85A32]">
                Pipeline em execução...
              </p>
              <p className="mt-1 text-xs text-[#2C1E16]/80">
                Gerando copy com Gemini IA, renderizando arte 1080×1080,
                enviando ao R2 e publicando no Instagram e Facebook (inclui espera
                de 5s para processamento do container Meta)...
              </p>
            </div>
          )}

          {errorMessage && (
            <div
              role="alert"
              className="mt-4 rounded-xl border border-red-300 bg-red-50 p-4 text-sm font-medium text-red-800"
            >
              {errorMessage}
            </div>
          )}
        </section>

        {/* Último Post Gerado */}
        <section className="rounded-2xl border border-[#2C1E16]/10 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-[#2C1E16]">
              Último Post Gerado
            </h2>
            {lastPost && (
              <span className="rounded-full bg-[#1E7E53]/15 px-3 py-1 text-xs font-semibold text-[#1E7E53]">
                Publicado em{" "}
                {new Date(lastPost.generatedAt).toLocaleString("pt-BR")}
              </span>
            )}
          </div>

          {!lastPost ? (
            <div className="mt-4 rounded-xl border border-dashed border-[#2C1E16]/20 bg-[#FAF5EE]/50 p-8 text-center">
              <p className="text-sm font-medium text-[#2C1E16]/70">
                Nenhum post foi publicado manualmente neste navegador ainda.
              </p>
              <p className="mt-1 text-xs text-[#2C1E16]/50">
                Informe o CRON_SECRET acima e clique em &quot;Gerar e Publicar
                Agora&quot; para visualizar a arte e a legenda aqui.
              </p>
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
              {/* Preview da Arte */}
              <div className="lg:col-span-5">
                <div className="overflow-hidden rounded-2xl border border-[#2C1E16]/15 bg-[#FAF5EE] shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={lastPost.imageUrl}
                    alt={lastPost.post.headline_arte}
                    className="aspect-square w-full object-cover"
                  />
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-[#2C1E16]/70">
                    Arquivo PNG 1080×1080 no R2
                  </span>
                  <a
                    href={lastPost.imageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-[#C85A32] underline hover:text-[#b04b26]"
                  >
                    Abrir imagem original
                  </a>
                </div>
              </div>

              {/* Detalhes e IDs */}
              <div className="space-y-4 lg:col-span-7">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-[#2C1E16]/10 bg-[#FAF5EE]/60 p-3.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#2C1E16]/60">
                      Instagram Post ID
                    </p>
                    <p className="mt-1 break-all font-mono text-xs font-bold text-[#1E7E53]">
                      {lastPost.instagramPostId}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[#2C1E16]/10 bg-[#FAF5EE]/60 p-3.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#2C1E16]/60">
                      Facebook Post ID
                    </p>
                    <p className="mt-1 break-all font-mono text-xs font-bold text-[#1E7E53]">
                      {lastPost.facebookPostId}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-[#2C1E16]/10 bg-[#FAF5EE]/40 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#C85A32]">
                    Headline da Arte
                  </p>
                  <p className="mt-1 text-base font-bold text-[#2C1E16]">
                    {lastPost.post.headline_arte}
                  </p>

                  <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-[#C85A32]">
                    Subtítulo da Arte
                  </p>
                  <p className="mt-1 text-sm font-medium text-[#2C1E16]/85">
                    {lastPost.post.subtitulo_arte}
                  </p>
                </div>

                <div className="rounded-xl border border-[#2C1E16]/10 bg-[#FAF5EE]/40 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-[#2C1E16]/70">
                      Legenda e Hashtags
                    </p>
                    <button
                      type="button"
                      onClick={handleCopyCaption}
                      className="rounded-lg border border-[#2C1E16]/15 bg-white px-3 py-1 text-xs font-semibold text-[#2C1E16] transition hover:bg-[#FAF5EE]"
                    >
                      {copiedCaption ? "Copiado!" : "Copiar Legenda"}
                    </button>
                  </div>
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-[#2C1E16]">
                    {lastPost.post.legenda}
                  </p>
                  <p className="mt-3 text-xs font-medium text-[#1E7E53]">
                    {lastPost.post.hashtags}
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
