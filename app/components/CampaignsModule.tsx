"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AdAccountConfig,
  AdCampaignRecord,
  AdChannel,
  AdInsightsWindow,
  AdsAdvisorReport,
  MetaAdObjective,
  ParsedCampaignPlan,
  PostHistoryItem,
  PostOrganicMetrics,
} from "@/lib/types";
import { CampaignsReportCharts } from "./CampaignsReportCharts";

export function PostOrganicMetricsBar({
  metrics,
  isTopPerformer = false,
}: {
  metrics?: PostOrganicMetrics | null;
  isTopPerformer?: boolean;
}) {
  if (!metrics) {
    return (
      <p className="text-[10px] text-slate-400">
        Sem métricas orgânicas carregadas ainda.
      </p>
    );
  }

  const igBreakdown = metrics.ig
    ? `IG: ${metrics.ig.likes}❤️ ${metrics.ig.comments}💬${
        metrics.ig.views != null ? ` ${metrics.ig.views}👁️` : ""
      }`
    : "";
  const fbBreakdown = metrics.fb
    ? `FB: ${metrics.fb.likes}👍 ${metrics.fb.comments}💬${
        metrics.fb.views != null ? ` ${metrics.fb.views}👁️` : ""
      }`
    : "";
  const tooltip = [
    igBreakdown,
    fbBreakdown,
    `Sincronizado em ${new Date(metrics.synced_at).toLocaleString("pt-BR")}`,
  ]
    .filter(Boolean)
    .join(" • ");

  return (
    <div
      title={tooltip}
      className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold"
    >
      {isTopPerformer && metrics.engagement_score > 0 && (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
          🔥 Melhor Orgânico
        </span>
      )}
      {metrics.total_views !== null ? (
        <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-indigo-800">
          👁️ {metrics.total_views.toLocaleString("pt-BR")}
        </span>
      ) : metrics.total_reach !== null ? (
        <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-indigo-800">
          📣 {metrics.total_reach.toLocaleString("pt-BR")} alc.
        </span>
      ) : null}
      <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-rose-700">
        ❤️ {metrics.total_likes.toLocaleString("pt-BR")}
      </span>
      <span className="rounded-md bg-cyan-50 px-1.5 py-0.5 text-cyan-800">
        💬 {metrics.total_comments.toLocaleString("pt-BR")}
      </span>
      {metrics.total_saved !== null && metrics.total_saved > 0 && (
        <span className="rounded-md bg-violet-50 px-1.5 py-0.5 text-violet-800">
          🔖 {metrics.total_saved.toLocaleString("pt-BR")}
        </span>
      )}
      {metrics.total_shares !== null && metrics.total_shares > 0 && (
        <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-emerald-800">
          🔁 {metrics.total_shares.toLocaleString("pt-BR")}
        </span>
      )}
    </div>
  );
}

export function PostExternalLinks({
  companyId,
  post,
  onPermalinkResolved,
}: {
  companyId: string;
  post: PostHistoryItem;
  onPermalinkResolved?: (
    postId: string,
    organicMetrics?: PostOrganicMetrics | null
  ) => void;
}) {
  const [resolvingChannel, setResolvingChannel] = useState<
    "INSTAGRAM" | "TIKTOK" | null
  >(null);

  if (!post.ig_post_id && !post.fb_post_id && !post.tiktok_post_id) {
    return null;
  }

  const igPermalink = post.organic_metrics?.ig?.permalink?.trim() || null;
  const fbHref =
    post.organic_metrics?.fb?.permalink?.trim() ||
    (post.fb_post_id ? `https://www.facebook.com/${post.fb_post_id}` : null);
  const rawTikTok = post.tiktok_post_id?.trim() || "";
  const directTikTokHref = /^\d{15,}$/.test(rawTikTok)
    ? `https://www.tiktok.com/@/video/${rawTikTok}`
    : null;

  async function handleResolveAndOpen(channel: "INSTAGRAM" | "TIKTOK") {
    const popup =
      typeof window !== "undefined" ? window.open("about:blank", "_blank") : null;
    setResolvingChannel(channel);
    try {
      const res = await fetch("/api/ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "resolve_post_permalink",
          companyId,
          postId: post.id,
          channel,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error || "Não foi possível abrir o post.");
      }
      if (data.organic_metrics) {
        onPermalinkResolved?.(
          post.id,
          data.organic_metrics as PostOrganicMetrics
        );
      }
      if (popup) {
        popup.location.href = data.url;
      } else if (typeof window !== "undefined") {
        window.open(data.url, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      if (popup) popup.close();
      if (typeof window !== "undefined") {
        window.alert(
          err instanceof Error
            ? err.message
            : "Erro ao abrir o post na rede social."
        );
      }
    } finally {
      setResolvingChannel(null);
    }
  }

  return (
    <>
      {post.ig_post_id &&
        (igPermalink ? (
          <a
            href={igPermalink}
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir publicação no Instagram"
            className="inline-flex items-center gap-1 rounded-lg border border-pink-200 bg-pink-50 px-2.5 py-1 text-[11px] font-bold text-pink-700 hover:bg-pink-100"
          >
            Instagram ↗
          </a>
        ) : (
          <button
            type="button"
            disabled={resolvingChannel !== null}
            onClick={() => void handleResolveAndOpen("INSTAGRAM")}
            title="Buscar link oficial e abrir publicação no Instagram"
            className="inline-flex items-center gap-1 rounded-lg border border-pink-200 bg-pink-50 px-2.5 py-1 text-[11px] font-bold text-pink-700 hover:bg-pink-100 disabled:opacity-60"
          >
            {resolvingChannel === "INSTAGRAM" ? "Abrindo..." : "Instagram ↗"}
          </button>
        ))}

      {fbHref && (
        <a
          href={fbHref}
          target="_blank"
          rel="noopener noreferrer"
          title="Abrir publicação no Facebook"
          className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700 hover:bg-blue-100"
        >
          Facebook ↗
        </a>
      )}

      {post.tiktok_post_id &&
        (directTikTokHref ? (
          <a
            href={directTikTokHref}
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir vídeo no TikTok"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-800 hover:bg-slate-200"
          >
            TikTok ↗
          </a>
        ) : (
          <button
            type="button"
            disabled={resolvingChannel !== null}
            onClick={() => void handleResolveAndOpen("TIKTOK")}
            title="Abrir publicação no TikTok"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-800 hover:bg-slate-200 disabled:opacity-60"
          >
            {resolvingChannel === "TIKTOK" ? "Abrindo..." : "TikTok ↗"}
          </button>
        ))}
    </>
  );
}

interface RemoteMetaAdAccount {
  id: string;
  name: string;
  currency: string;
  account_status: number;
  business_name: string | null;
  is_active: boolean;
}

interface AdsPermissionsState {
  has_ads_management: boolean;
  has_ads_read: boolean;
  has_business_management: boolean;
  granted: string[];
}

interface AdsDashboardStateResponse {
  has_meta_token: boolean;
  has_ig_user_id: boolean;
  has_fb_page_id: boolean;
  tiktok_ads_enabled: boolean;
  tiktok_ads_status_label: string;
  ad_accounts: AdAccountConfig[];
  default_ad_account: AdAccountConfig | null;
  campaigns: AdCampaignRecord[];
}

function formatMoney(value: number | null | undefined, currency = "BRL"): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const prefix = currency.toUpperCase() === "USD" ? "US$" : "R$";
  return `${prefix} ${Number(value).toFixed(2).replace(".", ",")}`;
}

export function BoostCampaignModal({
  companyId,
  post,
  adAccounts,
  defaultAccountId,
  onClose,
  onCreated,
  onOpenAccountSetup,
}: {
  companyId: string;
  post: PostHistoryItem;
  adAccounts: AdAccountConfig[];
  defaultAccountId?: string | null;
  onClose: () => void;
  onCreated: (campaign: AdCampaignRecord) => void;
  onOpenAccountSetup: () => void;
}) {
  const initialChannel: AdChannel = post.ig_post_id ? "INSTAGRAM" : "FACEBOOK";
  const [channel, setChannel] = useState<AdChannel>(initialChannel);
  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    defaultAccountId ||
      adAccounts.find((a) => a.is_default)?.ad_account_id ||
      adAccounts[0]?.ad_account_id ||
      ""
  );
  const [userPrompt, setUserPrompt] = useState(
    "Rodar R$ 30/dia por 7 dias focando em WhatsApp e mensagens"
  );
  const [plan, setPlan] = useState<ParsedCampaignPlan | null>(null);
  const [budgetReaisInput, setBudgetReaisInput] = useState("30.00");
  const [loadingStep, setLoadingStep] = useState<"idle" | "preview" | "create">(
    "idle"
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const selectedAccount =
    adAccounts.find((a) => a.ad_account_id === selectedAccountId) || null;
  const currency = selectedAccount?.currency || "BRL";

  async function handlePreviewPlan() {
    setLoadingStep("preview");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "preview_campaign",
          companyId,
          postId: post.id,
          channel,
          userPrompt,
          adAccountId: selectedAccountId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Falha ao analisar comando com IA.");
      }
      const nextPlan = data.plan as ParsedCampaignPlan;
      setPlan(nextPlan);
      setBudgetReaisInput((nextPlan.daily_budget_cents / 100).toFixed(2));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Erro ao gerar prévia.");
    } finally {
      setLoadingStep("idle");
    }
  }

  async function handleCreateCampaign() {
    setLoadingStep("create");
    setErrorMsg(null);
    try {
      const parsedBudget = Number(budgetReaisInput.replace(",", "."));
      const overridePlan: Partial<ParsedCampaignPlan> | undefined = plan
        ? {
            ...plan,
            daily_budget_cents:
              Number.isFinite(parsedBudget) && parsedBudget > 0
                ? Math.round(parsedBudget * 100)
                : plan.daily_budget_cents,
          }
        : undefined;

      const res = await fetch("/api/ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_campaign",
          companyId,
          postId: post.id,
          channel,
          userPrompt,
          adAccountId: selectedAccountId || null,
          overridePlan,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Falha ao criar campanha na Meta Ads.");
      }
      onCreated(data.campaign as AdCampaignRecord);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Erro ao criar campanha.");
    } finally {
      setLoadingStep("idle");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">
              Impulsionar / Criar Campanha (Zero Re-upload)
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Reaproveita o post orgânico já publicado para manter curtidas e
              comentários. A campanha é criada <strong>PAUSADA</strong> por
              segurança.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100"
          >
            Fechar
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {/* Resumo do post orgânico */}
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            {post.image_urls_json[0] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={post.image_urls_json[0]}
                alt={post.headline}
                className="h-14 w-14 shrink-0 rounded-lg object-cover"
              />
            )}
            <div className="min-w-0 flex-1 text-xs">
              <p className="truncate font-extrabold text-slate-900">
                {post.headline}
              </p>
              <p className="mt-0.5 font-mono text-[10px] text-indigo-700">
                IG: {post.ig_post_id || "—"} • FB: {post.fb_post_id || "—"}
              </p>
            </div>
          </div>

          {/* Canal */}
          <div>
            <label className="block text-xs font-bold text-slate-700">
              Rede / Canal de Impulsionamento
            </label>
            <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button
                type="button"
                disabled={!post.ig_post_id}
                onClick={() => setChannel("INSTAGRAM")}
                title={
                  post.ig_post_id
                    ? "Impulsionar post orgânico do Instagram"
                    : "Este post não possui ID publicado no Instagram"
                }
                className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${
                  channel === "INSTAGRAM"
                    ? "border-indigo-500 bg-indigo-50 text-indigo-800"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                } disabled:cursor-not-allowed disabled:opacity-45`}
              >
                Instagram {!post.ig_post_id ? "(Sem ID)" : ""}
              </button>

              <button
                type="button"
                disabled={!post.fb_post_id}
                onClick={() => setChannel("FACEBOOK")}
                title={
                  post.fb_post_id
                    ? "Impulsionar post orgânico do Facebook"
                    : "Este post não possui ID publicado no Facebook"
                }
                className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${
                  channel === "FACEBOOK"
                    ? "border-indigo-500 bg-indigo-50 text-indigo-800"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                } disabled:cursor-not-allowed disabled:opacity-45`}
              >
                Facebook {!post.fb_post_id ? "(Sem ID)" : ""}
              </button>

              <button
                type="button"
                disabled
                title="TikTok Spark Ads bloqueado até aprovação da TikTok Marketing API"
                className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-bold text-slate-500 opacity-80"
              >
                TikTok Ads
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold text-amber-800">
                  Em breve
                </span>
              </button>
            </div>
          </div>

          {/* Conta de Anúncios */}
          <div>
            <label className="block text-xs font-bold text-slate-700">
              Conta de Anúncios Meta Ads
            </label>
            {adAccounts.length > 0 ? (
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800"
              >
                {adAccounts.map((acc) => (
                  <option key={acc.id} value={acc.ad_account_id}>
                    {acc.account_name} ({acc.ad_account_id} • {acc.currency})
                    {acc.is_default ? " — Padrão" : ""}
                  </option>
                ))}
              </select>
            ) : (
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <span>
                  Nenhuma conta de anúncios salva ainda nesta empresa.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenAccountSetup();
                  }}
                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-amber-700"
                >
                  Configurar na aba Campanhas
                </button>
              </div>
            )}
          </div>

          {/* Comando em linguagem natural */}
          <div>
            <label className="block text-xs font-bold text-slate-700">
              Como deseja impulsionar este post? (IA converte para Meta Ads API)
            </label>
            <textarea
              rows={3}
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              placeholder="Ex: Rodar R$ 40/dia por 7 dias focando em WhatsApp na cidade de Uberaba"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-indigo-500"
            />
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {[
                "Rodar R$ 30/dia por 7 dias focando em WhatsApp",
                "Rodar R$ 40/dia por 7 dias focando em tráfego para o site",
                "Rodar R$ 50/dia para leads em Uberaba por 10 dias",
              ].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setUserPrompt(preset)}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Prévia estruturada pela IA */}
          {plan && (
            <div className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-extrabold text-indigo-900">
                  Parâmetros Estruturados (Editáveis antes de criar)
                </span>
                <span className="rounded-full bg-white px-2.5 py-0.5 text-[10px] font-bold text-indigo-700">
                  Parser: {plan.parser_provider}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600">
                    Nome da Campanha
                  </label>
                  <input
                    value={plan.name}
                    onChange={(e) => setPlan({ ...plan, name: e.target.value })}
                    className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-600">
                    Objetivo Meta Ads
                  </label>
                  <select
                    value={plan.objective}
                    onChange={(e) =>
                      setPlan({
                        ...plan,
                        objective: e.target.value as MetaAdObjective,
                      })
                    }
                    className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold"
                  >
                    <option value="OUTCOME_TRAFFIC">OUTCOME_TRAFFIC (Tráfego)</option>
                    <option value="OUTCOME_LEADS">OUTCOME_LEADS (Leads / Mensagens)</option>
                    <option value="OUTCOME_SALES">OUTCOME_SALES (Vendas)</option>
                    <option value="OUTCOME_ENGAGEMENT">OUTCOME_ENGAGEMENT (Engajamento)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-600">
                    Orçamento Diário ({currency})
                  </label>
                  <input
                    value={budgetReaisInput}
                    onChange={(e) => setBudgetReaisInput(e.target.value)}
                    className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-600">
                    Localização / Cidade
                  </label>
                  <input
                    value={plan.location_query}
                    onChange={(e) =>
                      setPlan({ ...plan, location_query: e.target.value })
                    }
                    className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-600">
                    Duração (dias)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={plan.duration_days ?? 7}
                    onChange={(e) =>
                      setPlan({
                        ...plan,
                        duration_days: Number(e.target.value) || 7,
                      })
                    }
                    className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-600">
                    Otimização / Destino
                  </label>
                  <input
                    value={`${plan.optimization_goal}${
                      plan.destination_type ? ` (${plan.destination_type})` : ""
                    }`}
                    readOnly
                    className="mt-0.5 w-full rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600"
                  />
                </div>
              </div>

              <p className="text-[11px] text-indigo-900/80">{plan.reasoning}</p>
            </div>
          )}

          {errorMsg && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800">
              {errorMsg}
            </div>
          )}

          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-[11px] text-emerald-900">
            <strong>Regra de segurança:</strong> Campanha, Conjunto e Anúncio são
            sempre criados na Meta Ads com status <strong>PAUSED</strong> (nenhum
            valor será gasto até você clicar em <em>Ativar</em> na aba Campanhas).
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={loadingStep !== "idle"}
              onClick={handlePreviewPlan}
              className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-xs font-extrabold text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
            >
              {loadingStep === "preview"
                ? "Analisando..."
                : "1. Analisar com IA (Prévia)"}
            </button>
            <button
              type="button"
              disabled={loadingStep !== "idle" || adAccounts.length === 0}
              onClick={handleCreateCampaign}
              className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-xs font-extrabold text-white shadow-md hover:opacity-95 disabled:opacity-60"
            >
              {loadingStep === "create"
                ? "Criando na Meta Ads..."
                : "2. Criar Campanha (PAUSADA)"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CampaignsPanel({
  companyId,
  companyName,
  publishedPosts,
  refreshKey,
  onOpenBoostModal,
  onOpenIntegrations,
  onUseHookInStudio,
  onAccountsLoaded,
  onPostsEngagementSynced,
}: {
  companyId: string;
  companyName?: string;
  publishedPosts: PostHistoryItem[];
  refreshKey: number;
  onOpenBoostModal: (post: PostHistoryItem) => void;
  onOpenIntegrations: () => void;
  onUseHookInStudio: (hookPrompt: string) => void;
  onAccountsLoaded?: (accounts: AdAccountConfig[]) => void;
  onPostsEngagementSynced?: (updatedPosts: Record<string, PostOrganicMetrics>) => void;
}) {
  const [state, setState] = useState<AdsDashboardStateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [remoteAccounts, setRemoteAccounts] = useState<RemoteMetaAdAccount[]>(
    []
  );
  const [permissions, setPermissions] = useState<AdsPermissionsState | null>(
    null
  );
  const [advisor, setAdvisor] = useState<AdsAdvisorReport | null>(null);
  const [selectedWindow, setSelectedWindow] = useState<AdInsightsWindow>("7d");
  const [postSortBy, setPostSortBy] = useState<"RECENT" | "ENGAGEMENT">(
    "RECENT"
  );
  const [engagementPermInfo, setEngagementPermInfo] = useState<{
    has_instagram_manage_insights: boolean;
    has_read_insights: boolean;
    missing_insights_scopes: string[];
  } | null>(null);

  // Formulário de Conta de Anúncios & Perfil decide()
  const [accId, setAccId] = useState("");
  const [accName, setAccName] = useState("");
  const [accCurrency, setAccCurrency] = useState("BRL");
  const [accStatus, setAccStatus] = useState<number | null>(null);
  const [cpaMax, setCpaMax] = useState("35");
  const [roasMin, setRoasMin] = useState("2");
  const [minClicks, setMinClicks] = useState("50");
  const [defaultLink, setDefaultLink] = useState("");
  const [baseLocation, setBaseLocation] = useState("Brasil");
  const [autoPause, setAutoPause] = useState(false);

  const applyAccountToForm = useCallback((acc: AdAccountConfig) => {
    setAccId(acc.ad_account_id);
    setAccName(acc.account_name || acc.ad_account_id);
    setAccCurrency(acc.currency || "BRL");
    setAccStatus(acc.account_status ?? null);
    setCpaMax(String(acc.cpa_maximo ?? 35));
    setRoasMin(String(acc.roas_minimo ?? 2));
    setMinClicks(String(acc.amostra_minima_cliques ?? 50));
    setDefaultLink(acc.link_destino_padrao || "");
    setBaseLocation(acc.localizacao_base || "Brasil");
    setAutoPause(Boolean(acc.auto_pause_enabled));
  }, []);

  const fetchAdsState = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/ads?companyId=${encodeURIComponent(companyId)}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao carregar campanhas.");
      const parsed = data as AdsDashboardStateResponse;
      setState(parsed);
      onAccountsLoaded?.(parsed.ad_accounts || []);
      if (parsed.default_ad_account) {
        applyAccountToForm(parsed.default_ad_account);
      }
    } catch (err) {
      setNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Erro ao carregar campanhas.",
      });
    } finally {
      setLoading(false);
    }
  }, [companyId, applyAccountToForm, onAccountsLoaded]);

  useEffect(() => {
    void fetchAdsState();
  }, [fetchAdsState, refreshKey]);

  async function handleListRemoteAccounts() {
    setBusyAction("list_remote");
    setNotice(null);
    try {
      const res = await fetch("/api/ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "list_meta_ad_accounts",
          companyId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao buscar contas Meta.");
      const list = (data.remote_accounts || []) as RemoteMetaAdAccount[];
      setRemoteAccounts(list);
      setPermissions((data.permissions || null) as AdsPermissionsState | null);
      if (list.length > 0 && !accId) {
        const firstActive = list.find((a) => a.is_active) || list[0];
        setAccId(firstActive.id);
        setAccName(firstActive.name);
        setAccCurrency(firstActive.currency);
        setAccStatus(firstActive.account_status);
      }
      setNotice({
        type: "success",
        text: `${list.length} conta(s) de anúncio encontrada(s) na Meta.`,
      });
    } catch (err) {
      setNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Erro ao consultar Meta Ads.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSaveAdAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!accId.trim()) {
      setNotice({
        type: "error",
        text: "Informe ou selecione o ID da conta de anúncios (ex: act_123456).",
      });
      return;
    }
    setBusyAction("save_account");
    setNotice(null);
    try {
      const res = await fetch("/api/ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_ad_account",
          companyId,
          ad_account_id: accId.trim(),
          account_name: accName.trim() || accId.trim(),
          currency: accCurrency.trim() || "BRL",
          account_status: accStatus,
          is_default: true,
          cpa_maximo: Number(cpaMax) || 35,
          roas_minimo: Number(roasMin) || 2,
          amostra_minima_cliques: Number(minClicks) || 50,
          link_destino_padrao: defaultLink.trim() || null,
          localizacao_base: baseLocation.trim() || "Brasil",
          auto_pause_enabled: autoPause,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao salvar conta.");
      await fetchAdsState();
      setNotice({
        type: "success",
        text: "Conta de anúncios e perfil de decisão salvos com sucesso!",
      });
    } catch (err) {
      setNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Erro ao salvar conta.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRefreshMetrics() {
    setBusyAction("refresh_metrics");
    setNotice(null);
    try {
      const res = await fetch("/api/ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh_metrics", companyId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao atualizar métricas.");
      if (data.state) {
        setState(data.state as AdsDashboardStateResponse);
      } else {
        await fetchAdsState();
      }
      const sum = data.summary as {
        campaignsUpdated?: number;
        autoPaused?: number;
        errors?: string[];
      };
      setNotice({
        type: sum?.errors?.length ? "error" : "success",
        text:
          sum?.errors?.length
            ? `Métricas atualizadas (${sum.campaignsUpdated || 0}), avisos: ${sum.errors.join("; ")}`
            : `Métricas atualizadas (${sum?.campaignsUpdated || 0} campanha(s); ${sum?.autoPaused || 0} auto-pausada(s)).`,
      });
    } catch (err) {
      setNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Erro ao atualizar métricas.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleLoadAdvisor() {
    setBusyAction("advisor");
    setNotice(null);
    try {
      const res = await fetch("/api/ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get_advisor", companyId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao gerar recomendações.");
      setAdvisor(data.advice as AdsAdvisorReport);
    } catch (err) {
      setNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Erro no Consultor IA.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleToggleCampaignStatus(
    cmp: AdCampaignRecord,
    nextStatus: "ACTIVE" | "PAUSED" | "ARCHIVED"
  ) {
    if (
      nextStatus === "ACTIVE" &&
      typeof window !== "undefined" &&
      !window.confirm(
        `Confirmar ativação da campanha "${cmp.name}" (${formatMoney(
          cmp.daily_budget_cents / 100,
          cmp.currency
        )}/dia) na Meta Ads?`
      )
    ) {
      return;
    }
    if (
      nextStatus === "ARCHIVED" &&
      typeof window !== "undefined" &&
      !window.confirm(`Tem certeza que deseja arquivar "${cmp.name}"?`)
    ) {
      return;
    }

    setBusyAction(`status-${cmp.id}`);
    setNotice(null);
    try {
      const res = await fetch("/api/ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle_status",
          companyId,
          campaignId: cmp.id,
          status: nextStatus,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao alterar status.");
      await fetchAdsState();
      setNotice({
        type: "success",
        text: `Campanha "${cmp.name}" alterada para ${nextStatus}.`,
      });
    } catch (err) {
      setNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Erro ao alterar status.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSyncPostEngagement() {
    setBusyAction("sync_engagement");
    setNotice(null);
    try {
      const res = await fetch("/api/ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sync_post_engagement",
          companyId,
          limit: 25,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erro ao buscar engajamento na Meta.");
      }
      if (data.updatedPosts) {
        onPostsEngagementSynced?.(
          data.updatedPosts as Record<string, PostOrganicMetrics>
        );
      }
      if (data.permissions) {
        setEngagementPermInfo(data.permissions);
      }
      const missing: string[] = data.permissions?.missing_insights_scopes || [];
      setNotice({
        type: "success",
        text:
          missing.length > 0
            ? `Curtidas e comentários atualizados em ${data.syncedCount || 0} post(s). Para liberar Visualizações/Alcance, adicione: ${missing.join(", ")}.`
            : `Engajamento orgânico completo atualizado em ${data.syncedCount || 0} post(s)!`,
      });
    } catch (err) {
      setNotice({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : "Erro ao sincronizar engajamento.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  const eligiblePosts = publishedPosts.filter(
    (p) => p.status === "PUBLISHED" && (Boolean(p.ig_post_id) || Boolean(p.fb_post_id))
  );
  const topEngagementScore = eligiblePosts.reduce(
    (max, p) => Math.max(max, p.organic_metrics?.engagement_score || 0),
    0
  );
  const readyPosts = [...eligiblePosts]
    .sort((a, b) => {
      if (postSortBy === "ENGAGEMENT") {
        const diff =
          (b.organic_metrics?.engagement_score ?? -1) -
          (a.organic_metrics?.engagement_score ?? -1);
        if (diff !== 0) return diff;
      }
      return b.created_at.localeCompare(a.created_at);
    })
    .slice(0, 9);

  return (
    <div className="space-y-6">
      {/* Cabeçalho Campanhas */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900">Campanhas</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Impulsione posts orgânicos já publicados reaproveitando curtidas e
            comentários, com criação segura em modo PAUSADO e monitoramento
            automático.
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px]">
            <span
              className={`rounded-full px-2.5 py-0.5 font-bold ${
                state?.has_meta_token
                  ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border border-amber-200 bg-amber-50 text-amber-800"
              }`}
            >
              Meta Ads (IG &amp; FB):{" "}
              {state?.has_meta_token ? "Token Conectado" : "Token Pendente"}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 font-bold text-slate-600">
              TikTok Ads{" "}
              <span className="rounded-full bg-amber-100 px-1.5 py-0.2 text-[10px] text-amber-800">
                Em breve
              </span>
            </span>
            {!state?.has_meta_token && (
              <button
                type="button"
                onClick={onOpenIntegrations}
                className="font-bold text-indigo-600 underline hover:text-indigo-800"
              >
                Configurar token em Integrações →
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={handleRefreshMetrics}
            className="rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-2.5 text-xs font-extrabold text-cyan-800 hover:bg-cyan-100 disabled:opacity-60"
          >
            {busyAction === "refresh_metrics"
              ? "Sincronizando..."
              : "Atualizar Métricas"}
          </button>
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={handleLoadAdvisor}
            className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm hover:opacity-95 disabled:opacity-60"
          >
            {busyAction === "advisor"
              ? "Analisando..."
              : "Consultor IA (Verba & Copy)"}
          </button>
        </div>
      </div>

      {notice && (
        <div
          className={`rounded-2xl border px-4 py-3 text-xs font-bold ${
            notice.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {notice.text}
        </div>
      )}

      {/* Relatório Completo com Métricas & Gráficos */}
      <CampaignsReportCharts
        companyName={companyName || "Empresa"}
        accountName={
          state?.default_ad_account?.account_name || accName || null
        }
        currency={
          state?.default_ad_account?.currency || accCurrency || "BRL"
        }
        campaigns={state?.campaigns || []}
        selectedWindow={selectedWindow}
        onSelectWindow={setSelectedWindow}
        cpaMaximo={
          state?.default_ad_account?.cpa_maximo ?? (Number(cpaMax) || 35)
        }
        roasMinimo={
          state?.default_ad_account?.roas_minimo ?? (Number(roasMin) || 2)
        }
      />

      {/* Conta de Anúncios & Metas decide() */}
      <form
        onSubmit={handleSaveAdAccount}
        className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900">
              Conta de Anúncios &amp; Perfil de Decisão (decide)
            </h3>
            <p className="text-[11px] text-slate-500">
              Defina a conta padrão e seus limites de CPA, ROAS e região para a
              IA e o monitoramento automático.
            </p>
          </div>
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={handleListRemoteAccounts}
            className="rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
          >
            {busyAction === "list_remote"
              ? "Buscando..."
              : "Buscar Contas na Meta"}
          </button>
        </div>

        {permissions &&
          (!permissions.has_ads_management || !permissions.has_ads_read) && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <strong>Atenção às permissões do token Meta:</strong> para criar e
              ler campanhas, o token precisa das permissões{" "}
              <code>ads_management</code> e <code>ads_read</code> (hoje:{" "}
              {permissions.granted.join(", ") || "nenhuma"}).
            </div>
          )}

        {remoteAccounts.length > 0 && (
          <div className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] font-bold text-slate-700">
              Contas encontradas na sua Meta (clique para selecionar):
            </p>
            <div className="flex flex-wrap gap-2">
              {remoteAccounts.map((acc) => (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => {
                    setAccId(acc.id);
                    setAccName(acc.name);
                    setAccCurrency(acc.currency);
                    setAccStatus(acc.account_status);
                  }}
                  className={`rounded-lg border px-3 py-1.5 text-left text-[11px] font-bold transition ${
                    accId === acc.id
                      ? "border-indigo-500 bg-indigo-50 text-indigo-800"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {acc.name} ({acc.id} • {acc.currency}){" "}
                  {acc.is_active ? "• Ativa" : "• Inativa"}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-600">
              ID da Conta Meta Ads (act_...)
            </label>
            <input
              value={accId}
              onChange={(e) => setAccId(e.target.value)}
              placeholder="act_123456789"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-600">
              Nome da Conta
            </label>
            <input
              value={accName}
              onChange={(e) => setAccName(e.target.value)}
              placeholder="Conta Principal"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-600">
              Moeda
            </label>
            <input
              value={accCurrency}
              onChange={(e) => setAccCurrency(e.target.value.toUpperCase())}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-600">
              Localização Base Padrão
            </label>
            <input
              value={baseLocation}
              onChange={(e) => setBaseLocation(e.target.value)}
              placeholder="Ex: Brasil ou Uberaba"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-600">
              CPA Máximo Aceitável ({accCurrency})
            </label>
            <input
              type="number"
              step="0.01"
              value={cpaMax}
              onChange={(e) => setCpaMax(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold"
            />
            <p className="mt-1 text-[10px] leading-snug text-slate-500">
              Valor máximo que você aceita pagar por conversa no WhatsApp, lead
              ou venda. Ex.: R$ 15–35 para leads.
            </p>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-600">
              ROAS Mínimo Desejado
            </label>
            <input
              type="number"
              step="0.1"
              value={roasMin}
              onChange={(e) => setRoasMin(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold"
            />
            <p className="mt-1 text-[10px] leading-snug text-slate-500">
              Retorno mínimo por R$ 1 gasto (ex.: 2 = R$ 2 em vendas para cada
              R$ 1 investido). Usado quando há venda rastreada no Pixel.
            </p>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-600">
              Amostra Mínima (Cliques)
            </label>
            <input
              type="number"
              min={10}
              value={minClicks}
              onChange={(e) => setMinClicks(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold"
            />
            <p className="mt-1 text-[10px] leading-snug text-slate-500">
              Cliques mínimos antes de escalar ou pausar por CPA alto (após 48h).
              Ex.: 30 cliques p/ R$ 20/dia; 50 p/ R$ 40+/dia.
            </p>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-600">
              Link Destino Padrão (WhatsApp / Site)
            </label>
            <input
              value={defaultLink}
              onChange={(e) => setDefaultLink(e.target.value)}
              placeholder="https://wa.me/55..."
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
            />
          </div>
        </div>

        <details className="rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2.5 text-[11px] text-slate-600">
          <summary className="cursor-pointer font-bold text-slate-700 hover:text-indigo-700">
            Como o sistema usa esses 3 números (regra decide)?
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>
              <strong>Primeiras 48h:</strong> sempre mantém em{" "}
              <strong>MANTER</strong> para respeitar a fase de aprendizado da
              Meta.
            </li>
            <li>
              <strong>ESCALAR (+20%):</strong> após atingir os cliques mínimos
              com CPA ≤ CPA Máximo (ou ROAS ≥ ROAS Mínimo) e sem fadiga
              criativa.
            </li>
            <li>
              <strong>PAUSAR:</strong> se gastar ≥ 2× o CPA Máximo com zero
              conversões ou se o CPA passar de 1,5× o limite após a amostra
              mínima.
            </li>
          </ul>
        </details>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <input
              type="checkbox"
              checked={autoPause}
              onChange={(e) => setAutoPause(e.target.checked)}
            />
            Piloto Automático: pausar automaticamente campanhas com gasto ≥ 2× CPA máximo e zero conversões (após 48h)
          </label>
          <button
            type="submit"
            disabled={busyAction !== null}
            className="rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-extrabold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {busyAction === "save_account"
              ? "Salvando..."
              : "Salvar Conta & Metas"}
          </button>
        </div>
      </form>

      {/* Consultor IA (Verba & Novos Ganchos) */}
      {advisor && (
        <div className="space-y-4 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-extrabold text-indigo-950">
              Consultor IA de Verba &amp; Novos Ganchos Orgânicos
            </h3>
            <span className="rounded-full bg-white px-2.5 py-0.5 text-[10px] font-bold text-indigo-700">
              Motor: {advisor.provider_used}
            </span>
          </div>

          {advisor.budget_recommendations.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-700">
                Realocação de Orçamento:
              </p>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {advisor.budget_recommendations.map((rec, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-slate-200 bg-white p-3 text-xs"
                  >
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                        rec.action === "ESCALAR"
                          ? "bg-emerald-100 text-emerald-800"
                          : rec.action === "PAUSAR"
                            ? "bg-rose-100 text-rose-800"
                            : "bg-indigo-100 text-indigo-800"
                      }`}
                    >
                      {rec.action}
                    </span>
                    <p className="mt-1 font-extrabold text-slate-900">
                      {rec.title}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-600">
                      {rec.reason}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {advisor.creative_hooks.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-700">
                Novos Ganchos de Copy para Testar no Estúdio Manual:
              </p>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                {advisor.creative_hooks.map((hook, i) => (
                  <div
                    key={i}
                    className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-3.5 text-xs"
                  >
                    <div>
                      <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-800">
                        {hook.angle}
                      </span>
                      <p className="mt-1.5 font-extrabold text-slate-900">
                        {hook.headline_suggestion}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-600">
                        {hook.hook_text}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onUseHookInStudio(
                          `Título em destaque: "${hook.headline_suggestion}"\nÂngulo: ${hook.angle}\nDireção: ${hook.hook_text}`
                        )
                      }
                      className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100"
                    >
                      Testar no Estúdio Manual →
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Posts Publicados Prontos para Impulsionar */}
      <div className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900">
              Posts Publicados Prontos para Impulsionar ({readyPosts.length})
            </h3>
            <p className="text-[11px] text-slate-500">
              Compare curtidas, comentários e visualizações orgânicas para
              impulsionar o post que mais chamou atenção.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 text-[11px]">
              <button
                type="button"
                onClick={() => setPostSortBy("RECENT")}
                className={`rounded-lg px-2.5 py-1 font-bold ${
                  postSortBy === "RECENT"
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-white"
                }`}
              >
                Mais Recentes
              </button>
              <button
                type="button"
                onClick={() => setPostSortBy("ENGAGEMENT")}
                className={`rounded-lg px-2.5 py-1 font-bold ${
                  postSortBy === "ENGAGEMENT"
                    ? "bg-amber-500 text-white"
                    : "text-slate-600 hover:bg-white"
                }`}
              >
                🔥 Melhor Engajamento
              </button>
            </div>
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={handleSyncPostEngagement}
              className="rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-[11px] font-extrabold text-cyan-800 hover:bg-cyan-100 disabled:opacity-60"
            >
              {busyAction === "sync_engagement"
                ? "Buscando na Meta..."
                : "Atualizar Engajamento"}
            </button>
          </div>
        </div>

        {engagementPermInfo &&
          engagementPermInfo.missing_insights_scopes.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[11px] text-amber-900">
              <strong>Visualizações/Alcance parciais:</strong> seu token já traz
              curtidas e comentários, mas faltam os escopos{" "}
              <code>
                {engagementPermInfo.missing_insights_scopes.join(", ")}
              </code>{" "}
              para liberar visualizações e alcance detalhados.
            </div>
          )}

        {readyPosts.length === 0 ? (
          <p className="text-xs text-slate-500">
            Publique um post no Instagram ou Facebook para que ele apareça aqui
            com o botão de Criar Campanha.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {readyPosts.map((p) => {
              const score = p.organic_metrics?.engagement_score || 0;
              const isTop = topEngagementScore > 0 && score === topEngagementScore;
              return (
                <div
                  key={p.id}
                  className={`flex items-start gap-3 rounded-xl border p-3 ${
                    isTop
                      ? "border-amber-300 bg-amber-50/40"
                      : "border-slate-200 bg-slate-50/70"
                  }`}
                >
                  {p.image_urls_json[0] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.image_urls_json[0]}
                      alt={p.headline}
                      className="h-14 w-14 shrink-0 rounded-lg object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1 space-y-1.5 text-xs">
                    <p className="truncate font-extrabold text-slate-900">
                      {p.headline}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {p.ig_post_id ? "IG OK" : "Sem IG"} •{" "}
                      {p.fb_post_id ? "FB OK" : "Sem FB"}
                    </p>
                    <PostOrganicMetricsBar
                      metrics={p.organic_metrics}
                      isTopPerformer={isTop}
                    />
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <button
                        type="button"
                        onClick={() => onOpenBoostModal(p)}
                        className="rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-indigo-700"
                      >
                        Criar Campanha
                      </button>
                      <PostExternalLinks
                        companyId={companyId}
                        post={p}
                        onPermalinkResolved={(postId, metrics) => {
                          if (metrics) {
                            onPostsEngagementSynced?.({ [postId]: metrics });
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Lista de Campanhas Criadas */}
      <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-extrabold text-slate-900">
            Campanhas &amp; Performance ({state?.campaigns.length || 0})
          </h3>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-500">
              Janela:
            </span>
            {(["4d", "7d", "14d", "30d"] as AdInsightsWindow[]).map((win) => (
              <button
                key={win}
                type="button"
                onClick={() => setSelectedWindow(win)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                  selectedWindow === win
                    ? "bg-indigo-600 text-white"
                    : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
              >
                {win.replace("d", " dias")}
              </button>
            ))}
          </div>
        </div>

        {loading && !state ? (
          <p className="text-xs text-slate-500">Carregando campanhas...</p>
        ) : !state || state.campaigns.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500">
            Nenhuma campanha criada ainda. Clique em{" "}
            <strong>Criar Campanha</strong> acima ou em{" "}
            <strong>Impulsionar / Criar Campanha</strong> no Histórico de Posts.
          </div>
        ) : (
          <div className="space-y-3">
            {state.campaigns.map((cmp) => {
              const winMetrics =
                cmp.last_insights_json?.windows?.[selectedWindow] ||
                cmp.last_insights_json;
              const spend = winMetrics?.spend;
              const impressions = winMetrics?.impressions;
              const clicks = winMetrics?.clicks;
              const ctr = winMetrics?.ctr;
              const cpc = winMetrics?.cpc;
              const cpm = winMetrics?.cpm;
              const freq = winMetrics?.frequency;
              const conversions = winMetrics?.conversions;
              const cpa = winMetrics?.cpa;
              const roas = winMetrics?.roas;

              return (
                <div
                  key={cmp.id}
                  className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/50 p-4 text-xs"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                            cmp.status === "ACTIVE"
                              ? "bg-emerald-100 text-emerald-800"
                              : cmp.status === "ERROR"
                                ? "bg-rose-100 text-rose-800"
                                : cmp.status === "ARCHIVED"
                                  ? "bg-slate-200 text-slate-600"
                                  : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {cmp.status}
                        </span>
                        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-800">
                          {cmp.channel}
                        </span>
                        {cmp.last_verdict && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                              cmp.last_verdict === "ESCALAR"
                                ? "bg-emerald-600 text-white"
                                : cmp.last_verdict === "PAUSAR"
                                  ? "bg-rose-600 text-white"
                                  : "bg-slate-700 text-white"
                            }`}
                          >
                            Veredito: {cmp.last_verdict}
                          </span>
                        )}
                        {cmp.last_insights_json?.creative_fatigue && (
                          <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-extrabold text-white">
                            Fadiga Criativa
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 text-sm font-extrabold text-slate-900">
                        {cmp.name}
                      </p>
                      <p className="text-[11px] text-slate-600">
                        {cmp.objective} ({cmp.optimization_goal}) •{" "}
                        <strong>
                          {formatMoney(cmp.daily_budget_cents / 100, cmp.currency)}
                          /dia
                        </strong>{" "}
                        • Conta {cmp.ad_account_id}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {cmp.status !== "ACTIVE" &&
                        cmp.status !== "ARCHIVED" &&
                        cmp.meta_campaign_id && (
                          <button
                            type="button"
                            disabled={busyAction !== null}
                            onClick={() =>
                              handleToggleCampaignStatus(cmp, "ACTIVE")
                            }
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
                          >
                            Ativar
                          </button>
                        )}
                      {cmp.status === "ACTIVE" && cmp.meta_campaign_id && (
                        <button
                          type="button"
                          disabled={busyAction !== null}
                          onClick={() =>
                            handleToggleCampaignStatus(cmp, "PAUSED")
                          }
                          className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-[11px] font-bold text-amber-800 hover:bg-amber-100 disabled:opacity-60"
                        >
                          Pausar
                        </button>
                      )}
                      {cmp.status !== "ARCHIVED" && cmp.meta_campaign_id && (
                        <button
                          type="button"
                          disabled={busyAction !== null}
                          onClick={() =>
                            handleToggleCampaignStatus(cmp, "ARCHIVED")
                          }
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-60"
                        >
                          Arquivar
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Métricas da janela */}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    <div className="rounded-lg bg-white p-2 border border-slate-200/70">
                      <p className="text-[10px] text-slate-500">Gasto</p>
                      <p className="font-extrabold text-slate-900">
                        {formatMoney(spend, cmp.currency)}
                      </p>
                    </div>
                    <div className="rounded-lg bg-white p-2 border border-slate-200/70">
                      <p className="text-[10px] text-slate-500">Impressões</p>
                      <p className="font-extrabold text-slate-900">
                        {impressions !== undefined
                          ? Number(impressions).toLocaleString("pt-BR")
                          : "—"}
                      </p>
                    </div>
                    <div className="rounded-lg bg-white p-2 border border-slate-200/70">
                      <p className="text-[10px] text-slate-500">Cliques</p>
                      <p className="font-extrabold text-slate-900">
                        {clicks ?? "—"}
                      </p>
                    </div>
                    <div className="rounded-lg bg-white p-2 border border-slate-200/70">
                      <p className="text-[10px] text-slate-500">CTR</p>
                      <p className="font-extrabold text-slate-900">
                        {ctr !== undefined ? `${Number(ctr).toFixed(2)}%` : "—"}
                      </p>
                    </div>
                    <div className="rounded-lg bg-white p-2 border border-slate-200/70">
                      <p className="text-[10px] text-slate-500">CPC</p>
                      <p className="font-extrabold text-slate-900">
                        {formatMoney(cpc, cmp.currency)}
                      </p>
                    </div>
                    <div className="rounded-lg bg-white p-2 border border-slate-200/70">
                      <p className="text-[10px] text-slate-500">CPM</p>
                      <p className="font-extrabold text-slate-900">
                        {formatMoney(cpm, cmp.currency)}
                      </p>
                    </div>
                    <div className="rounded-lg bg-white p-2 border border-slate-200/70">
                      <p className="text-[10px] text-slate-500">Frequência</p>
                      <p className="font-extrabold text-slate-900">
                        {freq !== undefined ? Number(freq).toFixed(2) : "—"}
                      </p>
                    </div>
                    <div className="rounded-lg bg-white p-2 border border-slate-200/70">
                      <p className="text-[10px] text-slate-500">Conversões</p>
                      <p className="font-extrabold text-slate-900">
                        {conversions ?? "—"}
                      </p>
                    </div>
                    <div className="rounded-lg bg-white p-2 border border-slate-200/70">
                      <p className="text-[10px] text-slate-500">CPA / CPL</p>
                      <p className="font-extrabold text-slate-900">
                        {formatMoney(cpa, cmp.currency)}
                      </p>
                    </div>
                    <div className="rounded-lg bg-white p-2 border border-slate-200/70">
                      <p className="text-[10px] text-slate-500">ROAS</p>
                      <p className="font-extrabold text-slate-900">
                        {roas !== null && roas !== undefined
                          ? `${Number(roas).toFixed(2)}x`
                          : "—"}
                      </p>
                    </div>
                  </div>

                  {cmp.last_verdict_reason && (
                    <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-700">
                      <strong>Análise:</strong> {cmp.last_verdict_reason}
                    </p>
                  )}

                  {cmp.error_message && (
                    <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-700">
                      Erro Meta Ads: {cmp.error_message}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
