"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AdAccountConfig,
  AdCampaignAdRecord,
  AdCampaignRecord,
  AdChannel,
  AdGeoLocationSelection,
  AdInsightsWindow,
  AdProvider,
  AdsAIProviderPreference,
  AdsAdvisorReport,
  AdsMetricsAIDiagnosis,
  CreativePostInput,
  MetaAdObjective,
  ParsedCampaignPlan,
  PostHistoryItem,
  PostOrganicMetrics,
} from "@/lib/types";
import { CampaignsReportCharts } from "./CampaignsReportCharts";
import { ImageLightboxModal } from "./ImageLightboxModal";

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
    "INSTAGRAM" | "FACEBOOK" | "TIKTOK" | null
  >(null);

  if (!post.ig_post_id && !post.fb_post_id && !post.tiktok_post_id) {
    return null;
  }

  const igPermalink = post.organic_metrics?.ig?.permalink?.trim() || null;
  const rawFbPermalink = post.organic_metrics?.fb?.permalink?.trim() || null;
  const isBrokenFb =
    !rawFbPermalink ||
    /\/\d+_\d+\/?$/.test(rawFbPermalink) ||
    /^https?:\/\/(?:www\.|m\.)?facebook\.com\/\d+\/posts\/\d+\/?$/i.test(
      rawFbPermalink
    ) ||
    /permalink\.php\?story_fbid=\d+&id=\d+/i.test(rawFbPermalink);
  const fbPermalink = isBrokenFb ? null : rawFbPermalink;
  const rawTikTok = post.tiktok_post_id?.trim() || "";
  const directTikTokHref = /^\d{15,}$/.test(rawTikTok)
    ? `https://www.tiktok.com/@/video/${rawTikTok}`
    : null;

  async function handleResolveAndOpen(
    channel: "INSTAGRAM" | "FACEBOOK" | "TIKTOK"
  ) {
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

      {post.fb_post_id &&
        (fbPermalink ? (
          <a
            href={fbPermalink}
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir publicação no Facebook"
            className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700 hover:bg-blue-100"
          >
            Facebook ↗
          </a>
        ) : (
          <button
            type="button"
            disabled={resolvingChannel !== null}
            onClick={() => void handleResolveAndOpen("FACEBOOK")}
            title="Buscar link oficial e abrir publicação no Facebook"
            className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-60"
          >
            {resolvingChannel === "FACEBOOK" ? "Abrindo..." : "Facebook ↗"}
          </button>
        ))}

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

interface RemoteMetaBusiness {
  id: string;
  name: string;
  ad_account_count?: number;
}

interface RemoteMetaAdAccount {
  id: string;
  name: string;
  currency: string;
  account_status: number;
  business_id?: string | null;
  business_name: string | null;
  ownership_type?: "OWNED" | "CLIENT" | "PERSONAL";
  is_active: boolean;
}

function formatAccountDisplayLabel(acc: {
  account_name?: string | null;
  ad_account_id: string;
  business_name?: string | null;
}): string {
  const baseName = acc.account_name?.trim() || acc.ad_account_id;
  if (acc.business_name?.trim()) {
    return `${acc.business_name.trim()} › ${baseName}`;
  }
  return baseName;
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
  available_ai_providers?: {
    gemini: boolean;
    openai: boolean;
    claude: boolean;
  };
  tiktok_ads_enabled: boolean;
  tiktok_ads_status_label: string;
  ad_accounts: AdAccountConfig[];
  default_ad_account: AdAccountConfig | null;
  campaigns: AdCampaignRecord[];
}

function formatAIProviderLabel(pref?: AdsAIProviderPreference | null): string {
  switch (pref) {
    case "GEMINI":
      return "Google Gemini";
    case "OPENAI":
      return "OpenAI (GPT)";
    case "CLAUDE":
      return "Anthropic Claude";
    default:
      return "Automático (Gemini → OpenAI → Claude)";
  }
}

function formatMoney(value: number | null | undefined, currency = "BRL"): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const prefix = currency.toUpperCase() === "USD" ? "US$" : "R$";
  return `${prefix} ${Number(value).toFixed(2).replace(".", ",")}`;
}

function toLocalDateTimeInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function stripAdAccountPrefix(accountId: string): string {
  return accountId.trim().replace(/^act_/i, "");
}

function shouldShowLocationRadius(
  locationInput: string,
  selectedLocation: AdGeoLocationSelection | null
): boolean {
  if (selectedLocation) {
    return (
      selectedLocation.type === "city" ||
      selectedLocation.type === "custom_pin"
    );
  }
  const clean = locationInput.trim();
  if (!clean) return false;
  return !/^(?:bra[sz]il(?:\s*\(todo o brasil\))?|todo\s+o\s+brasil|br)$/i.test(
    clean
  );
}

function buildCampaignAdLink(cmp: AdCampaignRecord): {
  label: string;
  url: string;
  className: string;
  title: string;
} | null {
  const cleanAct = stripAdAccountPrefix(cmp.ad_account_id || "");
  if (!cleanAct) return null;

  if (cmp.provider === "META") {
    const adCount = cmp.ads?.length || 0;
    const url =
      adCount > 1 && cmp.meta_campaign_id && cmp.meta_adset_id
        ? `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${encodeURIComponent(
            cleanAct
          )}&selected_campaign_ids=${encodeURIComponent(
            cmp.meta_campaign_id
          )}&selected_adset_ids=${encodeURIComponent(cmp.meta_adset_id)}`
        : cmp.meta_campaign_id && cmp.meta_ad_id
        ? `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${encodeURIComponent(
            cleanAct
          )}&selected_campaign_ids=${encodeURIComponent(
            cmp.meta_campaign_id
          )}&selected_ad_ids=${encodeURIComponent(cmp.meta_ad_id)}`
        : cmp.meta_campaign_id
        ? `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${encodeURIComponent(
            cleanAct
          )}&selected_campaign_ids=${encodeURIComponent(cmp.meta_campaign_id)}`
        : `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${encodeURIComponent(
            cleanAct
          )}`;

    return {
      label: adCount > 1 ? `Ver Anúncios (${adCount}) ↗` : "Ver Anúncio ↗",
      url,
      className:
        "inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100",
      title: `Abrir anúncio(s) na conta ${cmp.ad_account_id} do Gerenciador de Anúncios da Meta`,
    };
  }

  if (cmp.provider === "TIKTOK") {
    return {
      label: "Ver Anúncio ↗",
      url: `https://ads.tiktok.com/i18n/perf/campaign?aadvid=${encodeURIComponent(
        cleanAct
      )}`,
      className:
        "inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-slate-100 px-2.5 py-1.5 text-[11px] font-bold text-slate-800 hover:bg-slate-200",
      title: `Abrir anúncio no TikTok Ads Manager (Conta ${cmp.ad_account_id})`,
    };
  }

  return null;
}

interface SelectedCreativeDraft {
  post: PostHistoryItem;
  headline: string;
  primaryText: string;
  editing: boolean;
}

export function BoostCampaignModal({
  companyId,
  post,
  availablePosts = [],
  adAccounts,
  defaultAccountId,
  onClose,
  onCreated,
  onOpenAccountSetup,
}: {
  companyId: string;
  post: PostHistoryItem;
  availablePosts?: PostHistoryItem[];
  adAccounts: AdAccountConfig[];
  defaultAccountId?: string | null;
  onClose: () => void;
  onCreated: (campaign: AdCampaignRecord) => void;
  onOpenAccountSetup: () => void;
}) {
  const channel: AdChannel = "FACEBOOK";
  const [selectedCreatives, setSelectedCreatives] = useState<
    SelectedCreativeDraft[]
  >(() => [
    {
      post,
      headline: post.headline || "",
      primaryText: post.content_json?.legenda || "",
      editing: false,
    },
  ]);
  const [showPostPicker, setShowPostPicker] = useState(false);

  const hasAnyStoryImage = selectedCreatives.some((c) =>
    Boolean(
      c.post.story_image_urls_json?.[0] ||
        c.post.content_json?.story_image_urls?.[0]
    )
  );
  const candidatePosts = availablePosts.filter(
    (p) =>
      p.status === "PUBLISHED" &&
      (Boolean(p.fb_post_id) ||
        Boolean(p.ig_post_id) ||
        Boolean(p.image_urls_json?.[0]))
  );
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
  const [ageMinInput, setAgeMinInput] = useState("22");
  const [ageMaxInput, setAgeMaxInput] = useState("55");
  const [genderFilter, setGenderFilter] = useState<"ALL" | "WOMEN" | "MEN">(
    "ALL"
  );
  const ageTouchedRef = useRef(false);
  const genderTouchedRef = useRef(false);
  const [welcomeGreeting, setWelcomeGreeting] = useState("");
  const [welcomeAutofill, setWelcomeAutofill] = useState(
    `Olá! Vi o anúncio "${post.headline.slice(0, 55)}" e gostaria de mais informações.`
  );
  const [availablePixels, setAvailablePixels] = useState<
    Array<{ id: string; name: string; is_unavailable: boolean }>
  >([]);
  const [selectedPixelId, setSelectedPixelId] = useState("");
  const [urlTags, setUrlTags] = useState(
    "utm_source=meta_ads&utm_medium=cpc&utm_campaign={{campaign.name}}&utm_content={{ad.name}}"
  );
  const [loadingStep, setLoadingStep] = useState<"idle" | "preview" | "create">(
    "idle"
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const selectedAccount =
    adAccounts.find((a) => a.ad_account_id === selectedAccountId) || null;
  const [aiProviderChoice, setAiProviderChoice] =
    useState<AdsAIProviderPreference>(
      selectedAccount?.preferred_ai_provider || "AUTO"
    );
  const aiTouchedRef = useRef(false);
  const currency = selectedAccount?.currency || "BRL";
  const [destinationUrlInput, setDestinationUrlInput] = useState(
    selectedAccount?.link_destino_padrao || ""
  );
  const [locationInput, setLocationInput] = useState(
    selectedAccount?.localizacao_base || "Brasil"
  );
  const [locationRadiusKm, setLocationRadiusKm] = useState("20");
  const [selectedLocation, setSelectedLocation] =
    useState<AdGeoLocationSelection | null>(null);
  const [geoResults, setGeoResults] = useState<AdGeoLocationSelection[]>([]);
  const [searchingGeo, setSearchingGeo] = useState(false);
  const locationTouchedRef = useRef(false);
  const [startDateTimeInput, setStartDateTimeInput] = useState("");
  const [noEndDate, setNoEndDate] = useState(true);
  const [endDateTimeInput, setEndDateTimeInput] = useState("");
  const scheduleTouchedRef = useRef(false);
  const previewBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (selectedAccount?.link_destino_padrao) {
      setDestinationUrlInput((prev) =>
        prev.trim() ? prev : selectedAccount.link_destino_padrao || ""
      );
    }
    if (selectedAccount?.localizacao_base && !locationTouchedRef.current) {
      setLocationInput(selectedAccount.localizacao_base);
    }
    if (!aiTouchedRef.current) {
      setAiProviderChoice(selectedAccount?.preferred_ai_provider || "AUTO");
    }
  }, [
    selectedAccount?.ad_account_id,
    selectedAccount?.link_destino_padrao,
    selectedAccount?.localizacao_base,
    selectedAccount?.preferred_ai_provider,
  ]);

  useEffect(() => {
    if (!selectedAccountId) {
      setAvailablePixels([]);
      return;
    }
    let cancelled = false;
    fetch("/api/ads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "list_ad_pixels",
        companyId,
        adAccountId: selectedAccountId,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !Array.isArray(data.pixels)) return;
        const list = data.pixels as Array<{
          id: string;
          name: string;
          is_unavailable: boolean;
        }>;
        setAvailablePixels(list);
        const activeOnes = list.filter((px) => !px.is_unavailable);
        if (activeOnes.length === 1) {
          setSelectedPixelId((prev) => prev || activeOnes[0].id);
        }
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [companyId, selectedAccountId]);

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
          aiProvider: aiProviderChoice,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Falha ao analisar comando com IA.");
      }
      const nextPlan = data.plan as ParsedCampaignPlan;
      if (!ageTouchedRef.current) {
        setAgeMinInput(String(nextPlan.age_min ?? 22));
        setAgeMaxInput(String(nextPlan.age_max ?? 55));
      } else {
        const minAge = Math.max(
          18,
          Math.min(65, Math.round(Number(ageMinInput) || 22))
        );
        const maxAge = Math.max(
          minAge,
          Math.min(65, Math.round(Number(ageMaxInput) || 55))
        );
        nextPlan.age_min = minAge;
        nextPlan.age_max = maxAge;
      }

      if (!genderTouchedRef.current) {
        if (nextPlan.genders?.length === 1 && nextPlan.genders[0] === 2) {
          setGenderFilter("WOMEN");
        } else if (nextPlan.genders?.length === 1 && nextPlan.genders[0] === 1) {
          setGenderFilter("MEN");
        } else {
          setGenderFilter("ALL");
        }
      } else {
        nextPlan.genders =
          genderFilter === "WOMEN" ? [2] : genderFilter === "MEN" ? [1] : [];
      }

      if (!locationTouchedRef.current && nextPlan.location_query) {
        setLocationInput(nextPlan.location_query);
      } else {
        nextPlan.location_query = locationInput.trim() || "Brasil";
      }

      setPlan(nextPlan);
      setBudgetReaisInput((nextPlan.daily_budget_cents / 100).toFixed(2));
      if (nextPlan.destination_url && !destinationUrlInput.trim()) {
        setDestinationUrlInput(nextPlan.destination_url);
      }
      if (typeof window !== "undefined") {
        window.requestAnimationFrame(() => {
          previewBoxRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
          });
        });
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Erro ao gerar prévia.");
    } finally {
      setLoadingStep("idle");
    }
  }

  async function handleSearchGeoLocations() {
    const q = locationInput.trim();
    if (!q) return;
    setSearchingGeo(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "search_geo_locations",
          companyId,
          query: q,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erro ao buscar localizações.");
      }
      setGeoResults((data.locations || []) as AdGeoLocationSelection[]);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Erro ao buscar localizações."
      );
    } finally {
      setSearchingGeo(false);
    }
  }

  async function handleCreateCampaign() {
    setLoadingStep("create");
    setErrorMsg(null);
    try {
      const parsedBudget = Number(budgetReaisInput.replace(",", "."));
      const cleanDest = destinationUrlInput.trim() || null;
      const parsedMinAge = Math.max(
        18,
        Math.min(65, Math.round(Number(ageMinInput) || 22))
      );
      const parsedMaxAge = Math.max(
        parsedMinAge,
        Math.min(65, Math.round(Number(ageMaxInput) || 55))
      );
      const genders: Array<1 | 2> =
        genderFilter === "WOMEN" ? [2] : genderFilter === "MEN" ? [1] : [];

      const parsedRadius = Math.max(
        1,
        Math.min(80, Math.round(Number(locationRadiusKm) || 20))
      );
      const startIso = startDateTimeInput.trim()
        ? new Date(startDateTimeInput).toISOString()
        : null;
      const endIso =
        !noEndDate && endDateTimeInput.trim()
          ? new Date(endDateTimeInput).toISOString()
          : null;

      if (!noEndDate && endIso) {
        const startMs = startIso ? new Date(startIso).getTime() : Date.now();
        if (new Date(endIso).getTime() <= startMs + 60_000) {
          throw new Error(
            "A data/hora de término deve ser posterior à data/hora de início."
          );
        }
      }

      const extraOverrides: Partial<ParsedCampaignPlan> = {
        age_min: parsedMinAge,
        age_max: parsedMaxAge,
        genders,
        location_query: locationInput.trim() || "Brasil",
        location_radius_km: parsedRadius,
        selected_location: selectedLocation
          ? { ...selectedLocation, radius_km: parsedRadius }
          : null,
        start_time: startIso,
        end_time: endIso,
        no_end_date: noEndDate,
        welcome_greeting: welcomeGreeting.trim() || null,
        welcome_autofill: welcomeAutofill.trim() || null,
        pixel_id: selectedPixelId.trim() || null,
        url_tags: urlTags.trim() || null,
      };
      const overridePlan: Partial<ParsedCampaignPlan> = plan
        ? {
            ...plan,
            ...extraOverrides,
            daily_budget_cents:
              Number.isFinite(parsedBudget) && parsedBudget > 0
                ? Math.round(parsedBudget * 100)
                : plan.daily_budget_cents,
            destination_url: cleanDest ?? plan.destination_url ?? null,
          }
        : {
            ...extraOverrides,
            ...(cleanDest ? { destination_url: cleanDest } : {}),
          };

      const creativesPayload: CreativePostInput[] = selectedCreatives.map(
        (item) => ({
          postId: item.post.id,
          headline: item.headline.trim() || null,
          primaryText: item.primaryText.trim() || null,
        })
      );

      const res = await fetch("/api/ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_campaign",
          companyId,
          postId: selectedCreatives[0]?.post.id || post.id,
          creatives: creativesPayload,
          channel,
          userPrompt,
          adAccountId: selectedAccountId || null,
          aiProvider: aiProviderChoice,
          overridePlan:
            Object.keys(overridePlan).length > 0 ? overridePlan : undefined,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-2.5 backdrop-blur-xs sm:p-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:p-6">
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
          {/* Criativos / Anúncios no Conjunto (1-1-N) */}
          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-extrabold text-slate-800">
                  Criativos no Conjunto ({selectedCreatives.length}{" "}
                  {selectedCreatives.length === 1 ? "anúncio" : "anúncios"})
                </p>
                <p className="text-[10px] text-slate-500">
                  1 Campanha → 1 Conjunto → vários anúncios. Recomendado: 3 a 5
                  criativos para a Meta otimizar a entrega.
                </p>
              </div>
              {candidatePosts.length > 1 && (
                <button
                  type="button"
                  onClick={() => setShowPostPicker((prev) => !prev)}
                  className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1 text-[11px] font-bold text-indigo-700 hover:bg-indigo-50"
                >
                  {showPostPicker
                    ? "Fechar lista de posts"
                    : "+ Adicionar mais posts publicados"}
                </button>
              )}
            </div>

            <div className="space-y-2">
              {selectedCreatives.map((item, idx) => (
                <div
                  key={item.post.id}
                  className="rounded-xl border border-slate-200 bg-white p-2.5"
                >
                  <div className="flex items-center gap-2.5">
                    {item.post.image_urls_json[0] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.post.image_urls_json[0]}
                        alt={item.headline}
                        className="h-12 w-12 shrink-0 rounded-lg object-cover"
                      />
                    )}
                    <div className="min-w-0 flex-1 text-xs">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-extrabold text-indigo-700">
                          Anúncio #{idx + 1}
                        </span>
                        <p className="truncate font-extrabold text-slate-900">
                          {item.headline || item.post.headline}
                        </p>
                      </div>
                      <p className="mt-0.5 font-mono text-[10px] text-slate-500">
                        IG: {item.post.ig_post_id || "—"} • FB:{" "}
                        {item.post.fb_post_id || "—"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedCreatives((prev) =>
                            prev.map((c, cIdx) =>
                              cIdx === idx ? { ...c, editing: !c.editing } : c
                            )
                          )
                        }
                        className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-50"
                      >
                        {item.editing ? "Ocultar texto" : "Editar Título/Texto"}
                      </button>
                      {selectedCreatives.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedCreatives((prev) =>
                              prev.filter((_, cIdx) => cIdx !== idx)
                            )
                          }
                          className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-700 hover:bg-rose-100"
                        >
                          Remover
                        </button>
                      )}
                    </div>
                  </div>

                  {item.editing && (
                    <div className="mt-2.5 grid grid-cols-1 gap-2 border-t border-slate-100 pt-2.5">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600">
                          Título (Headline — até 90 caracteres)
                        </label>
                        <input
                          maxLength={90}
                          value={item.headline}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSelectedCreatives((prev) =>
                              prev.map((c, cIdx) =>
                                cIdx === idx ? { ...c, headline: val } : c
                              )
                            );
                          }}
                          className="mt-0.5 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600">
                          Texto principal (Legenda do anúncio)
                        </label>
                        <textarea
                          rows={2}
                          value={item.primaryText}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSelectedCreatives((prev) =>
                              prev.map((c, cIdx) =>
                                cIdx === idx ? { ...c, primaryText: val } : c
                              )
                            );
                          }}
                          className="mt-0.5 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {showPostPicker && (
              <div className="mt-2 max-h-48 space-y-1.5 overflow-y-auto rounded-xl border border-indigo-200 bg-white p-2">
                {candidatePosts.map((cand) => {
                  const alreadyAdded = selectedCreatives.some(
                    (s) => s.post.id === cand.id
                  );
                  return (
                    <div
                      key={cand.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-2 py-1.5 text-xs hover:bg-slate-50"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        {cand.image_urls_json[0] && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={cand.image_urls_json[0]}
                            alt={cand.headline}
                            className="h-9 w-9 shrink-0 rounded object-cover"
                          />
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-bold text-slate-800">
                            {cand.headline}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {new Date(cand.created_at).toLocaleDateString("pt-BR")}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={alreadyAdded || selectedCreatives.length >= 10}
                        onClick={() => {
                          setSelectedCreatives((prev) => [
                            ...prev,
                            {
                              post: cand,
                              headline: cand.headline || "",
                              primaryText: cand.content_json?.legenda || "",
                              editing: false,
                            },
                          ]);
                        }}
                        className={`shrink-0 rounded-lg px-2.5 py-1 text-[10px] font-extrabold ${
                          alreadyAdded
                            ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                        }`}
                      >
                        {alreadyAdded ? "Adicionado ✓" : "+ Incluir"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Canal */}
          <div>
            <label className="block text-xs font-bold text-slate-700">
              Canal de Anúncios
            </label>
            <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-indigo-500 bg-indigo-50 px-3 py-2 text-left text-indigo-900">
                <p className="text-xs font-extrabold">
                  Meta Ads (Facebook &amp; Instagram)
                </p>
                <p className="mt-0.5 text-[11px] font-medium text-indigo-700">
                  Veiculação unificada em Feed, Stories e Reels
                </p>
              </div>

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
            {hasAnyStoryImage && (
              <p className="mt-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-medium text-emerald-800">
                Arte 9:16 de Story detectada: quando compatível com o objetivo,
                será aplicada automaticamente via{" "}
                <strong>Personalização por Posicionamento</strong> (ou
                redimensionada automaticamente pela Meta em campanhas de
                WhatsApp).
              </p>
            )}
          </div>

          {/* Conta de Anúncios & IA da Campanha */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                      {formatAccountDisplayLabel(acc)} ({acc.ad_account_id} •{" "}
                      {acc.currency}){acc.is_default ? " — Padrão" : ""}
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

            <div>
              <label className="block text-xs font-bold text-slate-700">
                IA para estruturar esta Campanha
              </label>
              <select
                value={aiProviderChoice}
                onChange={(e) => {
                  aiTouchedRef.current = true;
                  setAiProviderChoice(
                    e.target.value as AdsAIProviderPreference
                  );
                }}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800"
              >
                <option value="AUTO">
                  Automático (Gemini → OpenAI → Claude)
                </option>
                <option value="GEMINI">Google Gemini</option>
                <option value="OPENAI">OpenAI (GPT)</option>
                <option value="CLAUDE">Anthropic Claude</option>
              </select>
            </div>
          </div>

          <details className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-[11px] text-slate-600">
            <summary className="cursor-pointer font-bold text-slate-700 hover:text-indigo-700">
              Como funciona a escolha de IA por campanha?
            </summary>
            <p className="mt-1.5 leading-relaxed">
              Cada conta de anúncios tem uma IA padrão, mas aqui você pode
              escolher qual IA desta empresa (Gemini, OpenAI ou Claude) vai
              interpretar o seu objetivo em texto e estruturar verba, público e
              posicionamento desta campanha. Em{" "}
              <strong>Automático</strong>, o sistema usa as chaves configuradas
              em Integrações com fallback automático caso alguma falhe. A opção
              escolhida fica salva nesta campanha para análises futuras.
            </p>
          </details>

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
                "Rodar R$ 20/dia por 7 dias focando em engajamento e alcance do post",
                "Rodar R$ 30/dia por 7 dias focando em WhatsApp",
                "Rodar R$ 40/dia por 7 dias focando em tráfego para o site",
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

          <div>
            <label className="block text-xs font-bold text-slate-700">
              Link Destino (WhatsApp https://wa.me/55... ou Site)
            </label>
            <input
              value={destinationUrlInput}
              onChange={(e) => setDestinationUrlInput(e.target.value)}
              placeholder="https://wa.me/5534999999999 ou https://seusite.com.br"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-indigo-500"
            />
            <p className="mt-1 text-[10px] text-slate-500">
              Necessário para campanhas de Tráfego ou WhatsApp quando a Página não
              tem WhatsApp Business vinculado. Opcional para engajamento.
            </p>
          </div>

          {/* Público: Idade e Gênero */}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-bold text-slate-700">
                Idade Mínima (18–65)
              </label>
              <input
                type="number"
                min={18}
                max={65}
                value={ageMinInput}
                onChange={(e) => {
                  ageTouchedRef.current = true;
                  setAgeMinInput(e.target.value);
                }}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700">
                Idade Máxima (18–65)
              </label>
              <input
                type="number"
                min={18}
                max={65}
                value={ageMaxInput}
                onChange={(e) => {
                  ageTouchedRef.current = true;
                  setAgeMaxInput(e.target.value);
                }}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700">
                Gênero do Público
              </label>
              <select
                value={genderFilter}
                onChange={(e) => {
                  genderTouchedRef.current = true;
                  setGenderFilter(
                    e.target.value as "ALL" | "WOMEN" | "MEN"
                  );
                }}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold outline-none focus:border-indigo-500"
              >
                <option value="ALL">Todos</option>
                <option value="WOMEN">Mulheres</option>
                <option value="MEN">Homens</option>
              </select>
            </div>
          </div>

          {/* Localização Precisa (Cidade, Bairro ou Pino com Raio) */}
          <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-extrabold text-slate-800">
                Localização Precisa (Cidade, Bairro, CEP ou Pino)
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    locationTouchedRef.current = true;
                    setLocationInput("Brasil");
                    setSelectedLocation({
                      label: "País: Brasil (Todo o Brasil)",
                      type: "country",
                      country_code: "BR",
                    });
                    setGeoResults([]);
                  }}
                  className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700"
                >
                  Brasil inteiro
                </button>
                {selectedLocation && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedLocation(null);
                      setGeoResults([]);
                    }}
                    className="text-[10px] font-bold text-rose-600 hover:underline"
                  >
                    Limpar seleção
                  </button>
                )}
              </div>
            </div>
            {(() => {
              const showRadius = shouldShowLocationRadius(
                locationInput,
                selectedLocation
              );
              return (
                <div
                  className={`grid grid-cols-1 gap-2 ${
                    showRadius
                      ? "sm:grid-cols-[1fr_auto_110px]"
                      : "sm:grid-cols-[1fr_auto]"
                  }`}
                >
                  <input
                    value={locationInput}
                    onChange={(e) => {
                      locationTouchedRef.current = true;
                      setSelectedLocation(null);
                      setLocationInput(e.target.value);
                    }}
                    placeholder="Ex: Uberaba, Centro Uberaba, Copacabana RJ ou CEP"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    disabled={searchingGeo || !locationInput.trim()}
                    onClick={() => void handleSearchGeoLocations()}
                    className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
                  >
                    {searchingGeo ? "Buscando..." : "Buscar local"}
                  </button>
                  {showRadius && (
                    <div>
                      <input
                        type="number"
                        min={1}
                        max={80}
                        value={locationRadiusKm}
                        onChange={(e) => setLocationRadiusKm(e.target.value)}
                        title="Raio em km (Cidades: 17–80 km • Pino Exato: 1–80 km)"
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold outline-none focus:border-indigo-500"
                      />
                      <span className="mt-0.5 block text-center text-[9px] text-slate-500">
                        Raio (km)
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}

            {selectedLocation && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-900">
                Local selecionado: {selectedLocation.label}
                {(selectedLocation.type === "city" ||
                  selectedLocation.type === "custom_pin") &&
                  ` • Raio ${locationRadiusKm} km`}
              </div>
            )}

            {geoResults.length > 0 && (
              <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
                {geoResults.map((item, idx) => (
                  <button
                    key={`${item.type}-${item.key || item.latitude}-${idx}`}
                    type="button"
                    onClick={() => {
                      locationTouchedRef.current = true;
                      setSelectedLocation(item);
                      setLocationInput(
                        item.label
                          .replace(/^(?:País|Cidade|Bairro|Estado|CEP|Sub-região|📍\s*Pino Exato):\s*/i, "")
                      );
                      if (item.type === "custom_pin") {
                        setLocationRadiusKm(String(item.radius_km ?? 5));
                      } else if (item.type === "city") {
                        setLocationRadiusKm(String(item.radius_km ?? 20));
                      }
                      setGeoResults([]);
                    }}
                    className="block w-full rounded-md px-2.5 py-1.5 text-left text-[11px] font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-800"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
            <p className="text-[10px] text-slate-500">
              Para anunciar em um bairro ou endereço exato com raio menor (1 a 16
              km), busque e escolha a opção{" "}
              <strong>📍 Pino Exato</strong>.
            </p>
          </div>

          {/* Agendamento: Início e Término */}
          <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
            <p className="text-xs font-extrabold text-slate-800">
              Agendamento (Início e Término)
            </p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div>
                <label className="block text-[10px] font-bold text-slate-600">
                  Data e Hora de Início (opcional)
                </label>
                <input
                  type="datetime-local"
                  value={startDateTimeInput}
                  onChange={(e) => {
                    scheduleTouchedRef.current = true;
                    setStartDateTimeInput(e.target.value);
                  }}
                  className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                />
                <span className="mt-0.5 block text-[9px] text-slate-500">
                  Vazio = começa imediatamente ao clicar em Ativar.
                </span>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600">
                  Data e Hora de Término
                </label>
                {noEndDate ? (
                  <div className="mt-0.5 rounded-lg border border-dashed border-slate-300 bg-white px-2.5 py-2 text-[11px] font-semibold text-slate-600">
                    Contínua (sem data de término definida)
                  </div>
                ) : (
                  <input
                    type="datetime-local"
                    value={endDateTimeInput}
                    onChange={(e) => {
                      scheduleTouchedRef.current = true;
                      setEndDateTimeInput(e.target.value);
                    }}
                    className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                  />
                )}
              </div>
            </div>
            <label className="flex items-center gap-2 text-[11px] font-bold text-slate-700">
              <input
                type="checkbox"
                checked={noEndDate}
                onChange={(e) => {
                  const checked = e.target.checked;
                  scheduleTouchedRef.current = true;
                  setNoEndDate(checked);
                  if (!checked && !endDateTimeInput.trim()) {
                    const base = startDateTimeInput.trim()
                      ? new Date(startDateTimeInput)
                      : new Date();
                    const plus7 = new Date(
                      base.getTime() + 7 * 24 * 60 * 60 * 1000
                    );
                    setEndDateTimeInput(toLocalDateTimeInputValue(plus7));
                  }
                }}
              />
              Sem data de término (campanha contínua — as regras de pausa
              automática continuam ativas)
            </label>
          </div>

          {/* Conversas (WhatsApp) & Rastreamento (Pixel / UTM) */}
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
            <p className="text-xs font-extrabold text-slate-800">
              Conversas (WhatsApp) &amp; Rastreamento (Pixel / URL)
            </p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div>
                <label className="block text-[10px] font-bold text-slate-600">
                  Mensagem de Boas-vindas (opcional)
                </label>
                <input
                  value={welcomeGreeting}
                  onChange={(e) => setWelcomeGreeting(e.target.value)}
                  placeholder="Deixar vazio se usar CRM / IA"
                  className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600">
                  Mensagem Pronta do Cliente (preenchida ao clicar)
                </label>
                <input
                  value={welcomeAutofill}
                  onChange={(e) => setWelcomeAutofill(e.target.value)}
                  placeholder="Olá! Posso ter mais informações sobre isso?"
                  className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600">
                  Eventos do Site (Meta Pixel)
                </label>
                <select
                  value={selectedPixelId}
                  onChange={(e) => setSelectedPixelId(e.target.value)}
                  className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold"
                >
                  <option value="">Não rastrear eventos do site</option>
                  {availablePixels.map((px) => (
                    <option key={px.id} value={px.id}>
                      {px.name} ({px.id})
                      {px.is_unavailable ? " — Indisponível" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600">
                  Parâmetros de URL (UTMs)
                </label>
                <input
                  value={urlTags}
                  onChange={(e) => setUrlTags(e.target.value)}
                  placeholder="utm_source=meta_ads&utm_medium=cpc"
                  className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-[11px]"
                />
              </div>
            </div>
          </div>

          {/* Prévia estruturada pela IA */}
          {plan && (
            <div
              ref={previewBoxRef}
              className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 text-xs"
            >
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
                    <option value="OUTCOME_ENGAGEMENT">
                      OUTCOME_ENGAGEMENT (Engajamento / WhatsApp)
                    </option>
                    <option value="OUTCOME_TRAFFIC">
                      OUTCOME_TRAFFIC (Tráfego)
                    </option>
                    <option value="OUTCOME_LEADS">
                      OUTCOME_LEADS (Leads / Cadastros)
                    </option>
                    <option value="OUTCOME_SALES">
                      OUTCOME_SALES (Vendas)
                    </option>
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

              <p className="rounded-lg border border-indigo-200/70 bg-white/80 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700">
                Público &amp; Agenda:{" "}
                <strong>
                  {selectedLocation?.label || locationInput || "Brasil"}
                </strong>{" "}
                • Idade{" "}
                <strong>
                  {ageMinInput}–{ageMaxInput} anos
                </strong>{" "}
                •{" "}
                <strong>
                  {genderFilter === "WOMEN"
                    ? "Mulheres"
                    : genderFilter === "MEN"
                      ? "Homens"
                      : "Todos os gêneros"}
                </strong>{" "}
                •{" "}
                <strong>
                  {noEndDate
                    ? "Contínua (sem data de término)"
                    : endDateTimeInput
                      ? `Até ${new Date(endDateTimeInput).toLocaleString("pt-BR")}`
                      : "Com data de término"}
                </strong>
              </p>

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

function AddCreativesModal({
  companyId,
  campaign,
  publishedPosts,
  onClose,
  onAdded,
}: {
  companyId: string;
  campaign: AdCampaignRecord;
  publishedPosts: PostHistoryItem[];
  onClose: () => void;
  onAdded: (addedCount: number, failedCount: number) => void;
}) {
  const [selected, setSelected] = useState<SelectedCreativeDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const candidates = publishedPosts.filter(
    (p) =>
      p.status === "PUBLISHED" &&
      (Boolean(p.fb_post_id) ||
        Boolean(p.ig_post_id) ||
        Boolean(p.image_urls_json?.[0]))
  );
  const existingPostIds = new Set(
    (campaign.ads || [])
      .map((a) => a.post_id)
      .filter((id): id is string => Boolean(id))
  );

  function toggleSelect(post: PostHistoryItem) {
    setSelected((prev) => {
      const exists = prev.some((s) => s.post.id === post.id);
      if (exists) {
        return prev.filter((s) => s.post.id !== post.id);
      }
      if (prev.length >= 10) return prev;
      return [
        ...prev,
        {
          post,
          headline: post.headline || "",
          primaryText: post.content_json?.legenda || "",
          editing: false,
        },
      ];
    });
  }

  async function handleSubmit() {
    if (selected.length === 0) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_creatives",
          companyId,
          campaignId: campaign.id,
          creatives: selected.map((s) => ({
            postId: s.post.id,
            headline: s.headline.trim() || null,
            primaryText: s.primaryText.trim() || null,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erro ao adicionar criativos.");
      }
      onAdded((data.addedAds || []).length, Number(data.failedCount || 0));
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Erro ao adicionar criativos."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-2.5 backdrop-blur-xs sm:p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">
              + Adicionar Criativos ao Conjunto
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Campanha: <strong>{campaign.name}</strong> • Novos anúncios entram{" "}
              <strong>PAUSADOS</strong> no mesmo conjunto (AdSet) para testar
              criativos lado a lado.
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
          <div className="max-h-60 space-y-1.5 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2.5">
            {candidates.length === 0 ? (
              <p className="p-3 text-center text-xs text-slate-500">
                Nenhum post publicado elegível encontrado.
              </p>
            ) : (
              candidates.map((cand) => {
                const isSel = selected.some((s) => s.post.id === cand.id);
                const inCampaign = existingPostIds.has(cand.id);
                return (
                  <div
                    key={cand.id}
                    className={`flex items-center justify-between gap-2 rounded-xl border p-2 text-xs ${
                      isSel
                        ? "border-indigo-400 bg-indigo-50/70"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      {cand.image_urls_json[0] && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={cand.image_urls_json[0]}
                          alt={cand.headline}
                          className="h-10 w-10 shrink-0 rounded-lg object-cover"
                        />
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-bold text-slate-900">
                          {cand.headline}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {new Date(cand.created_at).toLocaleDateString("pt-BR")}
                          {inCampaign ? " • Já possui anúncio neste conjunto" : ""}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleSelect(cand)}
                      className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-extrabold ${
                        isSel
                          ? "bg-indigo-600 text-white"
                          : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {isSel ? "Selecionado ✓" : "+ Selecionar"}
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {selected.length > 0 && (
            <div className="space-y-2 rounded-xl border border-indigo-200 bg-indigo-50/50 p-3">
              <p className="text-xs font-extrabold text-indigo-900">
                Selecionados ({selected.length}) — revise Título e Texto
                Principal se desejar:
              </p>
              {selected.map((item, idx) => (
                <div
                  key={item.post.id}
                  className="rounded-lg border border-indigo-200/70 bg-white p-2.5 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-bold text-slate-800">
                      #{idx + 1}: {item.headline || item.post.headline}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setSelected((prev) =>
                          prev.map((s, sIdx) =>
                            sIdx === idx ? { ...s, editing: !s.editing } : s
                          )
                        )
                      }
                      className="shrink-0 text-[10px] font-bold text-indigo-700 hover:underline"
                    >
                      {item.editing ? "Ocultar campos" : "Editar Título/Texto"}
                    </button>
                  </div>
                  {item.editing && (
                    <div className="mt-2 space-y-2 border-t border-slate-100 pt-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600">
                          Título (Headline — até 90 caracteres)
                        </label>
                        <input
                          maxLength={90}
                          value={item.headline}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSelected((prev) =>
                              prev.map((s, sIdx) =>
                                sIdx === idx ? { ...s, headline: val } : s
                              )
                            );
                          }}
                          className="mt-0.5 w-full rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600">
                          Texto principal (Legenda)
                        </label>
                        <textarea
                          rows={2}
                          value={item.primaryText}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSelected((prev) =>
                              prev.map((s, sIdx) =>
                                sIdx === idx ? { ...s, primaryText: val } : s
                              )
                            );
                          }}
                          className="mt-0.5 w-full rounded-lg border border-slate-200 px-2.5 py-1 text-xs"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {errorMsg && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800">
              {errorMsg}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={submitting || selected.length === 0}
              onClick={() => void handleSubmit()}
              className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2 text-xs font-extrabold text-white shadow-md hover:opacity-95 disabled:opacity-60"
            >
              {submitting
                ? "Criando anúncios..."
                : `Adicionar ${selected.length || ""} criativo(s) (PAUSADOS)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EditCampaignModal({
  companyId,
  campaign,
  onClose,
  onSaved,
}: {
  companyId: string;
  campaign: AdCampaignRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const initTargeting = (campaign.targeting_json || {}) as Record<
    string,
    unknown
  >;
  const initGenders = Array.isArray(initTargeting.genders)
    ? (initTargeting.genders as Array<1 | 2>)
    : [];

  const [loadingDetails, setLoadingDetails] = useState(true);
  const [name, setName] = useState(campaign.name);
  const [adsetName, setAdsetName] = useState(
    typeof initTargeting._adset_name === "string"
      ? initTargeting._adset_name
      : `${campaign.name} — AdSet`
  );
  const [budgetReais, setBudgetReais] = useState(
    (campaign.daily_budget_cents / 100).toFixed(2)
  );

  // Público
  const [ageMin, setAgeMin] = useState(String(initTargeting.age_min ?? 22));
  const [ageMax, setAgeMax] = useState(String(initTargeting.age_max ?? 55));
  const [genderFilter, setGenderFilter] = useState<"ALL" | "WOMEN" | "MEN">(
    initGenders.length === 1 && initGenders[0] === 2
      ? "WOMEN"
      : initGenders.length === 1 && initGenders[0] === 1
        ? "MEN"
        : "ALL"
  );
  const [currentLocationSummary, setCurrentLocationSummary] = useState(
    typeof initTargeting._location_label === "string"
      ? initTargeting._location_label
      : "Brasil"
  );
  const [locationInput, setLocationInput] = useState("");
  const [locationRadiusKm, setLocationRadiusKm] = useState("20");
  const [selectedLocation, setSelectedLocation] =
    useState<AdGeoLocationSelection | null>(null);
  const [geoResults, setGeoResults] = useState<AdGeoLocationSelection[]>([]);
  const [searchingGeo, setSearchingGeo] = useState(false);
  const [audienceTouched, setAudienceTouched] = useState(false);

  // Agendamento
  const [startDateTimeInput, setStartDateTimeInput] = useState("");
  const [endDateTimeInput, setEndDateTimeInput] = useState("");
  const [noEndDate, setNoEndDate] = useState(true);
  const [scheduleTouched, setScheduleTouched] = useState(false);

  // Nomes dos anúncios
  const [adNames, setAdNames] = useState<
    Array<{ id: string; adName: string; imageUrl?: string | null }>
  >(() =>
    (campaign.ads || [])
      .filter((a) => a.status !== "ERROR" && a.status !== "ARCHIVED")
      .map((a) => ({
        id: a.id,
        adName: a.ad_name || a.headline,
        imageUrl: a.image_url,
      }))
  );

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadLiveDetails() {
      setLoadingDetails(true);
      try {
        const res = await fetch("/api/ads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "get_campaign_edit_details",
            companyId,
            campaignId: campaign.id,
          }),
        });
        const data = await res.json();
        if (!res.ok || cancelled || !data.details) return;
        const d = data.details as {
          campaign_name: string;
          adset_name: string;
          daily_budget_cents: number;
          age_min: number;
          age_max: number;
          genders: Array<1 | 2>;
          location_summary: string;
          location_radius_km: number;
          start_time: string | null;
          end_time: string | null;
          no_end_date: boolean;
        };
        setName(d.campaign_name);
        setAdsetName(d.adset_name);
        setBudgetReais((d.daily_budget_cents / 100).toFixed(2));
        setAgeMin(String(d.age_min));
        setAgeMax(String(d.age_max));
        if (d.genders?.length === 1 && d.genders[0] === 2) {
          setGenderFilter("WOMEN");
        } else if (d.genders?.length === 1 && d.genders[0] === 1) {
          setGenderFilter("MEN");
        } else {
          setGenderFilter("ALL");
        }
        setCurrentLocationSummary(d.location_summary || "Brasil");
        setLocationRadiusKm(String(d.location_radius_km || 20));
        if (d.start_time) {
          const parsedStart = new Date(d.start_time);
          if (!Number.isNaN(parsedStart.getTime())) {
            setStartDateTimeInput(toLocalDateTimeInputValue(parsedStart));
          }
        }
        setNoEndDate(Boolean(d.no_end_date));
        if (d.end_time) {
          const parsedEnd = new Date(d.end_time);
          if (!Number.isNaN(parsedEnd.getTime())) {
            setEndDateTimeInput(toLocalDateTimeInputValue(parsedEnd));
          }
        }
      } catch {
        // mantém valores locais
      } finally {
        if (!cancelled) setLoadingDetails(false);
      }
    }
    void loadLiveDetails();
    return () => {
      cancelled = true;
    };
  }, [companyId, campaign.id]);

  async function handleSearchGeoLocations() {
    const q = locationInput.trim();
    if (!q) return;
    setSearchingGeo(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "search_geo_locations",
          companyId,
          query: q,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao buscar localizações.");
      setGeoResults((data.locations || []) as AdGeoLocationSelection[]);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Erro ao buscar localizações."
      );
    } finally {
      setSearchingGeo(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanName = name.trim();
    const cleanAdsetName = adsetName.trim();
    const parsedBudget = Number(budgetReais.replace(",", "."));
    if (!cleanName) {
      setErrorMsg("Informe o nome da campanha.");
      return;
    }
    if (!cleanAdsetName) {
      setErrorMsg("Informe o nome do conjunto de anúncios.");
      return;
    }
    if (!Number.isFinite(parsedBudget) || parsedBudget <= 0) {
      setErrorMsg("Informe um orçamento diário válido.");
      return;
    }

    const parsedAgeMin = Math.max(18, Math.min(65, Math.round(Number(ageMin) || 22)));
    const parsedAgeMax = Math.max(
      parsedAgeMin,
      Math.min(65, Math.round(Number(ageMax) || 55))
    );
    const genders: Array<1 | 2> =
      genderFilter === "WOMEN" ? [2] : genderFilter === "MEN" ? [1] : [];
    const parsedRadius = Math.max(
      1,
      Math.min(80, Math.round(Number(locationRadiusKm) || 20))
    );

    const startIso = startDateTimeInput.trim()
      ? new Date(startDateTimeInput).toISOString()
      : null;
    const endIso =
      !noEndDate && endDateTimeInput.trim()
        ? new Date(endDateTimeInput).toISOString()
        : null;

    if (scheduleTouched && !noEndDate && endIso) {
      const startMs = startIso ? new Date(startIso).getTime() : Date.now();
      if (new Date(endIso).getTime() <= startMs + 60_000) {
        setErrorMsg(
          "A data/hora de término deve ser posterior à data/hora de início."
        );
        return;
      }
    }

    setSaving(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_campaign",
          companyId,
          campaignId: campaign.id,
          name: cleanName,
          adsetName: cleanAdsetName,
          dailyBudgetCents: Math.round(parsedBudget * 100),
          audienceChanged: audienceTouched,
          ageMin: parsedAgeMin,
          ageMax: parsedAgeMax,
          genders,
          locationQuery: locationInput.trim() || undefined,
          locationRadiusKm: parsedRadius,
          selectedLocation: selectedLocation
            ? { ...selectedLocation, radius_km: parsedRadius }
            : undefined,
          scheduleChanged: scheduleTouched,
          startTime: startIso,
          endTime: endIso,
          noEndDate,
          adNames: adNames.map((a) => ({ id: a.id, adName: a.adName })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erro ao atualizar campanha na Meta.");
      }
      onSaved();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Erro ao atualizar campanha."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-2.5 backdrop-blur-xs sm:p-4">
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="max-h-[92vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">
              Editar Campanha, Conjunto, Público e Anúncios
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {loadingDetails
                ? "Carregando configurações atuais da Meta Ads..."
                : "Alterações aplicadas diretamente na Meta Ads API e sincronizadas no PilotFlow."}
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

        {/* Bloco 1: Identificação & Orçamento */}
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-xs">
          <p className="font-extrabold text-slate-800">
            Campanha, Conjunto &amp; Orçamento
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold text-slate-700">
                Nome da Campanha
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700">
                Nome do Conjunto de Anúncios (AdSet)
              </label>
              <input
                value={adsetName}
                onChange={(e) => setAdsetName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700">
                Orçamento Diário ({campaign.currency})
              </label>
              <input
                value={budgetReais}
                onChange={(e) => setBudgetReais(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Bloco 2: Público (Idade, Gênero e Localização Precisa) */}
        <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-xs">
          <p className="font-extrabold text-slate-800">
            Público (Idade, Gênero &amp; Localização Precisa)
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700">
                Idade Mínima
              </label>
              <input
                type="number"
                min={18}
                max={65}
                value={ageMin}
                onChange={(e) => {
                  setAudienceTouched(true);
                  setAgeMin(e.target.value);
                }}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700">
                Idade Máxima
              </label>
              <input
                type="number"
                min={18}
                max={65}
                value={ageMax}
                onChange={(e) => {
                  setAudienceTouched(true);
                  setAgeMax(e.target.value);
                }}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700">
                Gênero do Público
              </label>
              <select
                value={genderFilter}
                onChange={(e) => {
                  setAudienceTouched(true);
                  setGenderFilter(
                    e.target.value as "ALL" | "WOMEN" | "MEN"
                  );
                }}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold outline-none focus:border-indigo-500"
              >
                <option value="ALL">Todos</option>
                <option value="WOMEN">Mulheres</option>
                <option value="MEN">Homens</option>
              </select>
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {selectedLocation ? (
                <div className="text-[11px]">
                  <p className="font-bold text-emerald-800">
                    Nova localização (ao salvar):{" "}
                    <span>
                      {selectedLocation.label}
                      {(selectedLocation.type === "city" ||
                        selectedLocation.type === "custom_pin") &&
                        ` • Raio ${locationRadiusKm} km`}
                    </span>
                  </p>
                  <p className="text-[10px] text-slate-500">
                    Salvo atualmente na Meta: {currentLocationSummary}
                  </p>
                </div>
              ) : (
                <p className="text-[11px] font-bold text-slate-700">
                  Localização salva na Meta:{" "}
                  <span className="text-indigo-700">{currentLocationSummary}</span>
                </p>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAudienceTouched(true);
                    setLocationInput("Brasil");
                    setSelectedLocation({
                      label: "País: Brasil (Todo o Brasil)",
                      type: "country",
                      country_code: "BR",
                    });
                    setGeoResults([]);
                  }}
                  className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700"
                >
                  Brasil inteiro
                </button>
                {selectedLocation && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedLocation(null);
                      setLocationInput("");
                      setGeoResults([]);
                    }}
                    className="text-[10px] font-bold text-rose-600 hover:underline"
                  >
                    Cancelar troca
                  </button>
                )}
              </div>
            </div>

            {(() => {
              const showRadius = shouldShowLocationRadius(
                locationInput,
                selectedLocation
              );
              return (
                <div
                  className={`grid grid-cols-1 gap-2 ${
                    showRadius
                      ? "sm:grid-cols-[1fr_auto_95px]"
                      : "sm:grid-cols-[1fr_auto]"
                  }`}
                >
                  <input
                    value={locationInput}
                    onChange={(e) => {
                      setAudienceTouched(true);
                      setSelectedLocation(null);
                      setLocationInput(e.target.value);
                    }}
                    placeholder="Alterar para: cidade, bairro, CEP ou endereço exato"
                    className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    disabled={searchingGeo || !locationInput.trim()}
                    onClick={() => void handleSearchGeoLocations()}
                    className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
                  >
                    {searchingGeo ? "Buscando..." : "Buscar local"}
                  </button>
                  {showRadius && (
                    <div>
                      <input
                        type="number"
                        min={1}
                        max={80}
                        value={locationRadiusKm}
                        onChange={(e) => {
                          setAudienceTouched(true);
                          setLocationRadiusKm(e.target.value);
                        }}
                        title="Raio em km (Cidades: 17–80 km • Pino Exato: 1–80 km)"
                        className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold outline-none focus:border-indigo-500"
                      />
                      <span className="mt-0.5 block text-center text-[9px] text-slate-500">
                        Raio (km)
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}

            {geoResults.length > 0 && (
              <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
                {geoResults.map((item, idx) => (
                  <button
                    key={`${item.type}-${item.key || item.latitude}-${idx}`}
                    type="button"
                    onClick={() => {
                      setAudienceTouched(true);
                      setSelectedLocation(item);
                      setLocationInput(
                        item.label.replace(
                          /^(?:País|Cidade|Bairro|Estado|CEP|Sub-região|📍\s*Pino Exato):\s*/i,
                          ""
                        )
                      );
                      if (item.type === "custom_pin") {
                        setLocationRadiusKm(String(item.radius_km ?? 5));
                      } else if (item.type === "city") {
                        setLocationRadiusKm(String(item.radius_km ?? 20));
                      }
                      setGeoResults([]);
                    }}
                    className="block w-full rounded-md px-2.5 py-1.5 text-left text-[11px] font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-800"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
            Obs.: alterar público em uma campanha já ativa reinicia a fase de
            aprendizado na Meta; em campanhas pausadas é imediato e sem impacto.
          </p>
        </div>

        {/* Bloco 3: Agendamento */}
        <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-xs">
          <p className="font-extrabold text-slate-800">
            Agendamento (Início e Término)
          </p>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <div>
              <label className="block text-[10px] font-bold text-slate-600">
                Data e Hora de Início
              </label>
              <input
                type="datetime-local"
                value={startDateTimeInput}
                onChange={(e) => {
                  setScheduleTouched(true);
                  setStartDateTimeInput(e.target.value);
                }}
                className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
              />
              <span className="mt-0.5 block text-[9px] text-slate-500">
                A Meta só altera o início se a nova data estiver no futuro.
              </span>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-600">
                Data e Hora de Término
              </label>
              {noEndDate ? (
                <div className="mt-0.5 rounded-lg border border-dashed border-slate-300 bg-white px-2.5 py-2 text-[11px] font-semibold text-slate-600">
                  Contínua (sem data de término definida)
                </div>
              ) : (
                <input
                  type="datetime-local"
                  value={endDateTimeInput}
                  onChange={(e) => {
                    setScheduleTouched(true);
                    setEndDateTimeInput(e.target.value);
                  }}
                  className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                />
              )}
            </div>
          </div>
          <label className="flex items-center gap-2 text-[11px] font-bold text-slate-700">
            <input
              type="checkbox"
              checked={noEndDate}
              onChange={(e) => {
                const checked = e.target.checked;
                setScheduleTouched(true);
                setNoEndDate(checked);
                if (!checked && !endDateTimeInput.trim()) {
                  const base = startDateTimeInput.trim()
                    ? new Date(startDateTimeInput)
                    : new Date();
                  const plus7 = new Date(
                    Math.max(base.getTime(), Date.now()) +
                      7 * 24 * 60 * 60 * 1000
                  );
                  setEndDateTimeInput(toLocalDateTimeInputValue(plus7));
                }
              }}
            />
            Sem data de término (campanha contínua)
          </label>
        </div>

        {/* Bloco 4: Nomes dos Anúncios neste Conjunto */}
        {adNames.length > 0 && (
          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-xs">
            <p className="font-extrabold text-slate-800">
              Nomes dos Anúncios neste Conjunto ({adNames.length})
            </p>
            <div className="space-y-2">
              {adNames.map((item, idx) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2"
                >
                  {item.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.imageUrl}
                      alt={item.adName}
                      className="h-8 w-8 shrink-0 rounded object-cover"
                    />
                  )}
                  <input
                    maxLength={120}
                    value={item.adName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setAdNames((prev) =>
                        prev.map((row, rIdx) =>
                          rIdx === idx ? { ...row, adName: val } : row
                        )
                      );
                    }}
                    placeholder={`Nome do Anúncio #${idx + 1}`}
                    className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold outline-none focus:border-indigo-500"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800">
            {errorMsg}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-extrabold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving ? "Salvando na Meta..." : "Salvar alterações"}
          </button>
        </div>
      </form>
    </div>
  );
}

function EditAdModal({
  companyId,
  ad,
  onClose,
  onSaved,
}: {
  companyId: string;
  ad: AdCampaignAdRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [adName, setAdName] = useState(ad.ad_name || "");
  const [headline, setHeadline] = useState(ad.headline || "");
  const [primaryText, setPrimaryText] = useState(ad.primary_text || "");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const creativeChanged =
    headline.trim() !== (ad.headline || "").trim() ||
    primaryText.trim() !== (ad.primary_text || "").trim();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!adName.trim()) {
      setErrorMsg("Informe o nome do anúncio.");
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_ad",
          companyId,
          adId: ad.id,
          adName: adName.trim(),
          headline: headline.trim(),
          primaryText: primaryText.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erro ao atualizar anúncio na Meta.");
      }
      onSaved();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Erro ao atualizar anúncio."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-2.5 backdrop-blur-xs sm:p-4">
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">
              Editar Anúncio na Meta Ads
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Altera o nome e/ou os textos do criativo diretamente no anúncio
              existente.
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

        <div className="space-y-3 text-xs">
          <div>
            <label className="block font-bold text-slate-700">
              Nome do Anúncio (identificação interna e na Meta)
            </label>
            <input
              maxLength={120}
              value={adName}
              onChange={(e) => setAdName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700">
              Título (Headline — até 90 caracteres)
            </label>
            <input
              maxLength={90}
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700">
              Texto principal (Legenda do anúncio)
            </label>
            <textarea
              rows={4}
              value={primaryText}
              onChange={(e) => setPrimaryText(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-indigo-500"
            />
          </div>

          {creativeChanged && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900">
              <strong>Aviso:</strong> Ao alterar Título ou Texto Principal, a
              Meta cria um novo AdCreative vinculado a este anúncio e ele passa
              novamente por revisão automática (se mudar apenas o Nome do
              Anúncio, não entra em revisão).
            </div>
          )}
        </div>

        {errorMsg && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800">
            {errorMsg}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-extrabold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving ? "Atualizando na Meta..." : "Salvar anúncio"}
          </button>
        </div>
      </form>
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
  const [addCreativesTarget, setAddCreativesTarget] =
    useState<AdCampaignRecord | null>(null);
  const [editCampaignTarget, setEditCampaignTarget] =
    useState<AdCampaignRecord | null>(null);
  const [editAdTarget, setEditAdTarget] = useState<AdCampaignAdRecord | null>(
    null
  );
  const [notice, setNotice] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [remoteBusinesses, setRemoteBusinesses] = useState<
    RemoteMetaBusiness[]
  >([]);
  const [remoteAccounts, setRemoteAccounts] = useState<RemoteMetaAdAccount[]>(
    []
  );
  const [permissions, setPermissions] = useState<AdsPermissionsState | null>(
    null
  );
  const [advisor, setAdvisor] = useState<AdsAdvisorReport | null>(null);
  const [metricsDiagnosis, setMetricsDiagnosis] =
    useState<AdsMetricsAIDiagnosis | null>(null);
  const [selectedAIProvider, setSelectedAIProvider] =
    useState<AdsAIProviderPreference>("AUTO");
  const [selectedWindow, setSelectedWindow] = useState<AdInsightsWindow>("7d");
  const [accountFilter, setAccountFilter] = useState<string>("ALL");
  const [providerFilter, setProviderFilter] = useState<"ALL" | AdProvider>("ALL");
  const [postSortBy, setPostSortBy] = useState<"RECENT" | "ENGAGEMENT">(
    "RECENT"
  );
  const [engagementPermInfo, setEngagementPermInfo] = useState<{
    has_instagram_manage_insights: boolean;
    has_read_insights: boolean;
    missing_insights_scopes: string[];
  } | null>(null);
  const [lightboxState, setLightboxState] = useState<{
    images: string[];
    title: string;
  } | null>(null);

  // Formulário de Conta de Anúncios & Perfil decide() (fechado por padrão)
  const [accountFormMode, setAccountFormMode] = useState<
    "closed" | "create" | "edit"
  >("closed");
  const [editingAccountRowId, setEditingAccountRowId] = useState<string | null>(
    null
  );
  const [accId, setAccId] = useState("");
  const [accName, setAccName] = useState("");
  const [accBusinessId, setAccBusinessId] = useState("");
  const [accBusinessName, setAccBusinessName] = useState("");
  const [accCurrency, setAccCurrency] = useState("BRL");
  const [accStatus, setAccStatus] = useState<number | null>(null);
  const [cpaMax, setCpaMax] = useState("35");
  const [roasMin, setRoasMin] = useState("2");
  const [minClicks, setMinClicks] = useState("50");
  const [defaultLink, setDefaultLink] = useState("");
  const [baseLocation, setBaseLocation] = useState("Brasil");
  const [autoPause, setAutoPause] = useState(false);
  const [accPreferredAI, setAccPreferredAI] =
    useState<AdsAIProviderPreference>("AUTO");
  const [accIsDefault, setAccIsDefault] = useState(false);

  const resetAndCloseAccountForm = useCallback(() => {
    setAccId("");
    setAccName("");
    setAccBusinessId("");
    setAccBusinessName("");
    setAccCurrency("BRL");
    setAccStatus(null);
    setCpaMax("35");
    setRoasMin("2");
    setMinClicks("50");
    setDefaultLink("");
    setBaseLocation("Brasil");
    setAutoPause(false);
    setAccPreferredAI("AUTO");
    setAccIsDefault(false);
    setEditingAccountRowId(null);
    setAccountFormMode("closed");
  }, []);

  useEffect(() => {
    resetAndCloseAccountForm();
    setAdvisor(null);
    setMetricsDiagnosis(null);
    setRemoteBusinesses([]);
    setRemoteAccounts([]);
  }, [companyId, resetAndCloseAccountForm]);

  const applyAccountToForm = useCallback((acc: AdAccountConfig) => {
    setAccId(acc.ad_account_id);
    setAccName(acc.account_name || acc.ad_account_id);
    setAccBusinessId(acc.business_id || "");
    setAccBusinessName(acc.business_name || "");
    setAccCurrency(acc.currency || "BRL");
    setAccStatus(acc.account_status ?? null);
    setCpaMax(String(acc.cpa_maximo ?? 35));
    setRoasMin(String(acc.roas_minimo ?? 2));
    setMinClicks(String(acc.amostra_minima_cliques ?? 50));
    setDefaultLink(acc.link_destino_padrao || "");
    setBaseLocation(acc.localizacao_base || "Brasil");
    setAutoPause(Boolean(acc.auto_pause_enabled));
    setAccPreferredAI(acc.preferred_ai_provider || "AUTO");
    setAccIsDefault(Boolean(acc.is_default));
    setEditingAccountRowId(acc.id);
    setAccountFormMode("edit");
  }, []);

  const handleStartNewAccount = useCallback(() => {
    setAccId("");
    setAccName("");
    setAccBusinessId("");
    setAccBusinessName("");
    setAccCurrency("BRL");
    setAccStatus(null);
    setCpaMax("35");
    setRoasMin("2");
    setMinClicks("50");
    setDefaultLink("");
    setBaseLocation("Brasil");
    setAutoPause(false);
    setAccPreferredAI("AUTO");
    setAccIsDefault((state?.ad_accounts.length || 0) === 0);
    setEditingAccountRowId(null);
    setAccountFormMode("create");
  }, [state?.ad_accounts.length]);

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
    } catch (err) {
      setNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Erro ao carregar campanhas.",
      });
    } finally {
      setLoading(false);
    }
  }, [companyId, onAccountsLoaded]);

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
      const bms = (data.businesses || []) as RemoteMetaBusiness[];
      const updatedSaved = Array.isArray(data.saved_accounts)
        ? (data.saved_accounts as AdAccountConfig[])
        : null;
      setRemoteBusinesses(bms);
      setRemoteAccounts(list);
      setPermissions((data.permissions || null) as AdsPermissionsState | null);
      if (updatedSaved) {
        setState((prev) =>
          prev
            ? {
                ...prev,
                ad_accounts: updatedSaved,
                default_ad_account:
                  updatedSaved.find((a) => a.is_default) ||
                  updatedSaved[0] ||
                  null,
              }
            : prev
        );
        onAccountsLoaded?.(updatedSaved);
      }
      const updatedBmCount = Number(data.updated_bm_count || 0);
      setNotice({
        type: "success",
        text:
          bms.length > 0
            ? `${bms.length} BM(s) e ${list.length} conta(s) encontrada(s) na Meta${
                updatedBmCount > 0
                  ? ` (${updatedBmCount} conta(s) conectada(s) associada(s) à BM automaticamente)`
                  : ""
              }.`
            : `${list.length} conta(s) de anúncio encontrada(s) na Meta.`,
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

  async function handleImportBusinessAccounts(
    groupKey: string,
    groupLabel: string,
    groupAccounts: RemoteMetaAdAccount[]
  ) {
    if (groupAccounts.length === 0) return;
    setBusyAction(`import-bm-${groupKey}`);
    setNotice(null);
    try {
      const res = await fetch("/api/ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "import_bm_ad_accounts",
          companyId,
          accounts: groupAccounts.map((acc) => ({
            ad_account_id: acc.id,
            account_name: acc.name,
            currency: acc.currency,
            account_status: acc.account_status,
            business_id: acc.business_id || null,
            business_name: acc.business_name || null,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao importar contas da BM.");
      await fetchAdsState();
      setNotice({
        type: "success",
        text: `${groupAccounts.length} conta(s) de "${groupLabel}" sincronizada(s) nesta empresa!`,
      });
    } catch (err) {
      setNotice({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : "Erro ao importar contas da BM.",
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
          business_id: accBusinessId.trim() || null,
          business_name: accBusinessName.trim() || null,
          currency: accCurrency.trim() || "BRL",
          account_status: accStatus,
          is_default: accIsDefault,
          cpa_maximo: Number(cpaMax) || 35,
          roas_minimo: Number(roasMin) || 2,
          amostra_minima_cliques: Number(minClicks) || 50,
          link_destino_padrao: defaultLink.trim() || null,
          localizacao_base: baseLocation.trim() || "Brasil",
          auto_pause_enabled: autoPause,
          preferred_ai_provider: accPreferredAI,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao salvar conta.");
      await fetchAdsState();
      resetAndCloseAccountForm();
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

  async function handleSetDefaultAdAccount(acc: AdAccountConfig) {
    setBusyAction(`default-acc-${acc.id}`);
    setNotice(null);
    try {
      const res = await fetch("/api/ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_default_ad_account",
          companyId,
          accountRowId: acc.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erro ao definir conta padrão.");
      }
      await fetchAdsState();
      setNotice({
        type: "success",
        text: `Conta "${acc.account_name}" definida como padrão desta empresa.`,
      });
    } catch (err) {
      setNotice({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : "Erro ao alterar conta padrão.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDeleteAdAccount(acc: AdAccountConfig) {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `Remover a conta "${acc.account_name}" (${acc.ad_account_id}) desta empresa? Campanhas já criadas permanecem no histórico.`
      )
    ) {
      return;
    }
    setBusyAction(`delete-acc-${acc.id}`);
    setNotice(null);
    try {
      const res = await fetch("/api/ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_ad_account",
          companyId,
          accountRowId: acc.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao remover conta.");
      if (editingAccountRowId === acc.id || accId === acc.ad_account_id) {
        resetAndCloseAccountForm();
      }
      if (accountFilter === acc.ad_account_id) {
        setAccountFilter("ALL");
      }
      await fetchAdsState();
      setNotice({
        type: "success",
        text: `Conta "${acc.account_name}" removida da lista desta empresa.`,
      });
    } catch (err) {
      setNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Erro ao remover conta.",
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
        metadataSynced?: number;
        autoPaused?: number;
        errors?: string[];
      };
      setNotice({
        type: sum?.errors?.length ? "error" : "success",
        text:
          sum?.errors?.length
            ? `Sincronização concluída (${sum.campaignsUpdated || 0} campanhas, ${sum.metadataSynced || 0} atualizações cadastrais), avisos: ${sum.errors.join("; ")}`
            : `Sincronizado com a Meta (${sum?.metadataSynced || 0} ajuste(s) cadastrais, ${sum?.campaignsUpdated || 0} campanha(s) em métricas, ${sum?.autoPaused || 0} auto-pausada(s)).`,
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
        body: JSON.stringify({
          action: "get_advisor",
          companyId,
          aiProvider: selectedAIProvider,
          adAccountId: accountFilter !== "ALL" ? accountFilter : null,
        }),
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

  async function handleAnalyzeMetricsWithAI(campaignId?: string) {
    setBusyAction(campaignId ? `metrics-ai-${campaignId}` : "metrics-ai");
    setNotice(null);
    try {
      const res = await fetch("/api/ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "analyze_metrics_ai",
          companyId,
          campaignId: campaignId || null,
          adAccountId: accountFilter !== "ALL" ? accountFilter : null,
          aiProvider: selectedAIProvider,
          window: selectedWindow,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erro ao analisar métricas com IA.");
      }
      setMetricsDiagnosis(data.diagnosis as AdsMetricsAIDiagnosis);
    } catch (err) {
      setNotice({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : "Erro ao gerar diagnóstico de métricas com IA.",
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

  async function handleDeleteCampaign(cmp: AdCampaignRecord) {
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Remover o registro "${cmp.name}" do painel?`)
    ) {
      return;
    }
    setBusyAction(`delete-${cmp.id}`);
    setNotice(null);
    try {
      const res = await fetch("/api/ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_campaign",
          companyId,
          campaignId: cmp.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao excluir registro.");
      await fetchAdsState();
      setNotice({
        type: "success",
        text: `Registro "${cmp.name}" removido do painel.`,
      });
    } catch (err) {
      setNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Erro ao excluir.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleToggleAdStatus(
    ad: AdCampaignAdRecord,
    nextStatus: "ACTIVE" | "PAUSED"
  ) {
    if (
      nextStatus === "ACTIVE" &&
      typeof window !== "undefined" &&
      !window.confirm(
        `Ativar apenas o anúncio "${ad.headline || ad.ad_name}" na Meta Ads?`
      )
    ) {
      return;
    }
    setBusyAction(`ad-status-${ad.id}`);
    setNotice(null);
    try {
      const res = await fetch("/api/ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle_ad_status",
          companyId,
          adId: ad.id,
          status: nextStatus,
        }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Erro ao alterar status do anúncio.");
      await fetchAdsState();
      setNotice({
        type: "success",
        text: `Anúncio "${ad.headline || ad.ad_name}" alterado para ${nextStatus}.`,
      });
    } catch (err) {
      setNotice({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : "Erro ao alterar status do anúncio.",
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
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6">
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

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <select
            value={selectedAIProvider}
            onChange={(e) =>
              setSelectedAIProvider(e.target.value as AdsAIProviderPreference)
            }
            aria-label="Escolher IA para métricas e consultor"
            title="IA usada no Diagnóstico de Métricas e no Consultor de Verba & Copy"
            className="w-full max-w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-bold text-slate-800 sm:w-auto"
          >
            <option value="AUTO">
              IA: Automático (Gemini → OpenAI → Claude)
            </option>
            <option value="GEMINI">
              IA: Google Gemini
              {state?.available_ai_providers &&
              !state.available_ai_providers.gemini
                ? " (chave ausente)"
                : ""}
            </option>
            <option value="OPENAI">
              IA: OpenAI (GPT)
              {state?.available_ai_providers &&
              !state.available_ai_providers.openai
                ? " (chave ausente)"
                : ""}
            </option>
            <option value="CLAUDE">
              IA: Anthropic Claude
              {state?.available_ai_providers &&
              !state.available_ai_providers.claude
                ? " (chave ausente)"
                : ""}
            </option>
          </select>
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={handleRefreshMetrics}
            className="w-full rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-2.5 text-center text-xs font-extrabold text-cyan-800 hover:bg-cyan-100 disabled:opacity-60 sm:w-auto"
          >
            {busyAction === "refresh_metrics"
              ? "Sincronizando..."
              : "Sincronizar Meta & Métricas"}
          </button>
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => handleAnalyzeMetricsWithAI()}
            className="w-full rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-center text-xs font-extrabold text-indigo-800 hover:bg-indigo-100 disabled:opacity-60 sm:w-auto"
          >
            {busyAction === "metrics-ai"
              ? "Analisando métricas..."
              : "Diagnóstico IA (Métricas)"}
          </button>
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={handleLoadAdvisor}
            className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2.5 text-center text-xs font-extrabold text-white shadow-sm hover:opacity-95 disabled:opacity-60 sm:w-auto"
          >
            {busyAction === "advisor"
              ? "Analisando..."
              : "Consultor IA (Verba & Copy)"}
          </button>
        </div>
      </div>

      <details className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-[11px] text-slate-600 shadow-sm">
        <summary className="cursor-pointer font-bold text-slate-800 hover:text-indigo-700">
          Como usar a escolha de IA, Diagnóstico de Métricas e Consultor?
        </summary>
        <ul className="mt-2 list-disc space-y-1 pl-4 leading-relaxed">
          <li>
            <strong>Seletor de IA no topo:</strong> define qual motor (Gemini,
            OpenAI ou Claude configurado nas Integrações desta empresa) gera o{" "}
            <strong>Diagnóstico IA (Métricas)</strong> e o{" "}
            <strong>Consultor IA (Verba &amp; Copy)</strong>. Em{" "}
            <strong>Automático</strong>, o sistema respeita a preferência da
            conta/campanha e faz fallback automático entre as chaves ativas.
          </li>
          <li>
            <strong>Sincronizar Meta &amp; Métricas:</strong> puxa os números
            mais recentes (4d, 7d, 14d, 30d), status real e alterações feitas no
            Gerenciador da Meta. Rode antes de pedir análises se acabou de editar
            ou ativar algo por lá.
          </li>
          <li>
            <strong>Diagnóstico IA (Métricas):</strong> lê as métricas da janela
            selecionada ({selectedWindow}) respeitando o filtro de{" "}
            <strong>Conta</strong> abaixo (ou analisa uma única campanha pelo
            botão <strong>Analisar IA</strong> no card dela).
          </li>
          <li>
            <strong>Consultor IA (Verba &amp; Copy):</strong> recomenda onde
            escalar ou pausar verba e cria 3 ganchos novos de copy para testar no
            Estúdio Manual.
          </li>
        </ul>
      </details>

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
          state?.default_ad_account
            ? formatAccountDisplayLabel(state.default_ad_account)
            : accName || null
        }
        currency={
          state?.default_ad_account?.currency || accCurrency || "BRL"
        }
        adAccounts={state?.ad_accounts || []}
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
        className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900">
              Contas de Anúncios &amp; Perfil de Decisão (decide)
            </h3>
            <p className="text-[11px] text-slate-500">
              Conecte uma ou mais contas de anúncios desta empresa, escolha a
              conta padrão, defina a IA preferida e os limites de CPA/ROAS.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={handleStartNewAccount}
              className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
            >
              + Adicionar Nova Conta
            </button>
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
        </div>

        {(state?.ad_accounts?.length || 0) > 0 ? (
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-extrabold text-slate-700">
                Portfólios (BM) &amp; Contas de Anúncios Conectadas (
                {state?.ad_accounts.length || 0})
              </p>
              <span className="text-[10px] text-slate-500">
                Clique em Editar para ajustar metas/IA ou em Tornar Padrão
              </span>
            </div>

            {(() => {
              const savedGroupsMap = new Map<
                string,
                {
                  key: string;
                  businessId: string | null;
                  businessName: string | null;
                  accounts: AdAccountConfig[];
                }
              >();

              for (const acc of state?.ad_accounts || []) {
                const bId = acc.business_id?.trim() || null;
                const bName = acc.business_name?.trim() || null;
                const key = bId
                  ? `bm_${bId}`
                  : bName
                    ? `bname_${bName.toLowerCase()}`
                    : "__PERSONAL__";
                const existingGroup = savedGroupsMap.get(key);
                if (existingGroup) {
                  existingGroup.accounts.push(acc);
                  if (!existingGroup.businessId && bId) {
                    existingGroup.businessId = bId;
                  }
                  if (!existingGroup.businessName && bName) {
                    existingGroup.businessName = bName;
                  }
                } else {
                  savedGroupsMap.set(key, {
                    key,
                    businessId: bId,
                    businessName: bName,
                    accounts: [acc],
                  });
                }
              }

              const savedGroups = Array.from(savedGroupsMap.values()).sort(
                (a, b) => {
                  if (a.key === "__PERSONAL__" && b.key !== "__PERSONAL__") {
                    return 1;
                  }
                  if (a.key !== "__PERSONAL__" && b.key === "__PERSONAL__") {
                    return -1;
                  }
                  return (a.businessName || "").localeCompare(
                    b.businessName || ""
                  );
                }
              );

              return (
                <div className="space-y-3">
                  {savedGroups.map((group) => (
                    <div
                      key={group.key}
                      className="space-y-2 rounded-xl border border-slate-200/90 bg-white/70 p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 pb-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-extrabold text-white">
                            {group.key === "__PERSONAL__"
                              ? "Conta Pessoal (sem BM)"
                              : `BM: ${group.businessName || group.businessId}`}
                          </span>
                          {group.businessId && (
                            <span className="font-mono text-[10px] text-slate-500">
                              ID: {group.businessId}
                            </span>
                          )}
                          <span className="text-[10px] font-bold text-slate-500">
                            • {group.accounts.length} conta(s)
                          </span>
                        </div>
                        {group.businessId && (
                          <a
                            href={`https://business.facebook.com/settings/ad-accounts?business_id=${encodeURIComponent(
                              group.businessId
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-100"
                          >
                            Abrir BM ↗
                          </a>
                        )}
                      </div>

                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        {group.accounts.map((acc) => {
                          const isEditing =
                            accountFormMode === "edit" &&
                            editingAccountRowId === acc.id;
                          return (
                            <div
                              key={acc.id}
                              className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-xs transition ${
                                isEditing
                                  ? "border-indigo-400 bg-indigo-50/60"
                                  : "border-slate-200 bg-white"
                              }`}
                            >
                              <div className="min-w-0 space-y-0.5">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="truncate font-extrabold text-slate-900">
                                    {acc.account_name}
                                  </span>
                                  {acc.is_default && (
                                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-800">
                                      Padrão
                                    </span>
                                  )}
                                  <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-800">
                                    IA: {acc.preferred_ai_provider || "AUTO"}
                                  </span>
                                </div>
                                <p className="text-[10px] text-slate-600">
                                  <span className="font-mono">
                                    {acc.ad_account_id}
                                  </span>{" "}
                                  • {acc.currency} • CPA Máx:{" "}
                                  {formatMoney(acc.cpa_maximo, acc.currency)} •
                                  ROAS: {acc.roas_minimo}x
                                </p>
                              </div>
                              <div className="flex flex-wrap items-center gap-1">
                                <button
                                  type="button"
                                  disabled={busyAction !== null}
                                  onClick={() => applyAccountToForm(acc)}
                                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-100"
                                >
                                  Editar
                                </button>
                                {!acc.is_default && (
                                  <button
                                    type="button"
                                    disabled={busyAction !== null}
                                    onClick={() =>
                                      handleSetDefaultAdAccount(acc)
                                    }
                                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700 hover:bg-emerald-100"
                                  >
                                    Tornar Padrão
                                  </button>
                                )}
                                <a
                                  href={`https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${encodeURIComponent(
                                    stripAdAccountPrefix(acc.ad_account_id)
                                  )}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700 hover:bg-blue-100"
                                >
                                  Abrir Meta ↗
                                </a>
                                <button
                                  type="button"
                                  disabled={busyAction !== null}
                                  onClick={() => handleDeleteAdAccount(acc)}
                                  className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-700 hover:bg-rose-100"
                                >
                                  Remover
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        ) : (
          accountFormMode === "closed" && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs text-amber-900">
              <span>
                Nenhuma conta de anúncios conectada ainda nesta empresa. Clique
                em <strong>Buscar Contas na Meta</strong> ou{" "}
                <strong>+ Adicionar Nova Conta</strong> para configurar.
              </span>
            </div>
          )
        )}

        <details className="rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2.5 text-[11px] text-slate-600">
          <summary className="cursor-pointer font-bold text-slate-700 hover:text-indigo-700">
            Como usar Múltiplas Contas de Anúncios por BM e empresa/perfil?
          </summary>
          <ol className="mt-2 list-decimal space-y-1 pl-4 leading-relaxed">
            <li>
              Clique em <strong>Buscar Contas na Meta</strong> para listar suas{" "}
              <strong>BMs (Portfólios Empresariais)</strong> e contas vinculadas.
              Você pode importar todas as contas de uma BM em um clique ou
              clicar em <strong>+ Adicionar Nova Conta</strong> manualmente.
            </li>
            <li>
              Para clientes <strong>autônomos sem BM</strong>, o sistema agrupa
              automaticamente em <strong>Conta Pessoal (sem BM)</strong> — não é
              obrigatório preencher BM.
            </li>
            <li>
              Para ajustar metas/IA de qualquer conta sem deixar dados expostos
              na tela, clique em <strong>Editar</strong> no card dela; caso
              desista, clique em <strong>Cancelar</strong> para limpar e fechar
              os campos.
            </li>
          </ol>
        </details>

        {permissions &&
          (!permissions.has_ads_management || !permissions.has_ads_read) && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <strong>Atenção às permissões do token Meta:</strong> para criar e
              ler campanhas, o token precisa das permissões{" "}
              <code>ads_management</code> e <code>ads_read</code> (hoje:{" "}
              {permissions.granted.join(", ") || "nenhuma"}).
            </div>
          )}

        {remoteAccounts.length > 0 &&
          (() => {
            const remoteGroupsMap = new Map<
              string,
              {
                key: string;
                businessId: string | null;
                businessName: string;
                accounts: RemoteMetaAdAccount[];
              }
            >();

            for (const bm of remoteBusinesses) {
              const key = `bm_${bm.id}`;
              if (!remoteGroupsMap.has(key)) {
                remoteGroupsMap.set(key, {
                  key,
                  businessId: bm.id,
                  businessName: bm.name || `BM ${bm.id}`,
                  accounts: [],
                });
              }
            }

            for (const acc of remoteAccounts) {
              const bId = acc.business_id?.trim() || null;
              const bName = acc.business_name?.trim() || null;
              const key = bId
                ? `bm_${bId}`
                : bName
                  ? `bname_${bName.toLowerCase()}`
                  : "__PERSONAL__";
              const existingGroup = remoteGroupsMap.get(key);
              if (existingGroup) {
                existingGroup.accounts.push(acc);
              } else {
                remoteGroupsMap.set(key, {
                  key,
                  businessId: bId,
                  businessName:
                    key === "__PERSONAL__"
                      ? "Conta Pessoal (sem BM)"
                      : bName || `BM ${bId}`,
                  accounts: [acc],
                });
              }
            }

            const remoteGroups = Array.from(remoteGroupsMap.values()).filter(
              (g) => g.accounts.length > 0
            );
            const savedIdsSet = new Set(
              (state?.ad_accounts || []).map((a) =>
                a.ad_account_id.toLowerCase()
              )
            );

            return (
              <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] font-bold text-slate-700">
                    Contas encontradas na sua Meta agrupadas por BM (clique em
                    uma conta para abrir/editar ou importe a BM inteira):
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setRemoteAccounts([]);
                      setRemoteBusinesses([]);
                    }}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-100"
                  >
                    Fechar
                  </button>
                </div>
                <div className="space-y-2.5">
                  {remoteGroups.map((group) => {
                    const importBusy =
                      busyAction === `import-bm-${group.key}`;
                    const notSavedCount = group.accounts.filter(
                      (acc) => !savedIdsSet.has(acc.id.toLowerCase())
                    ).length;
                    return (
                      <div
                        key={group.key}
                        className="space-y-2 rounded-xl border border-slate-200 bg-white p-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded bg-indigo-900 px-2 py-0.5 text-[10px] font-extrabold text-white">
                              {group.key === "__PERSONAL__"
                                ? "Conta Pessoal (sem BM)"
                                : `BM: ${group.businessName}`}
                            </span>
                            {group.businessId && (
                              <span className="font-mono text-[10px] text-slate-500">
                                ID: {group.businessId}
                              </span>
                            )}
                            <span className="text-[10px] text-slate-500">
                              • {group.accounts.length} conta(s)
                            </span>
                          </div>
                          {group.key !== "__PERSONAL__" &&
                            (notSavedCount === 0 ? (
                              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                                ✓ Todas conectadas
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={busyAction !== null}
                                onClick={() =>
                                  handleImportBusinessAccounts(
                                    group.key,
                                    group.businessName,
                                    group.accounts
                                  )
                                }
                                className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                              >
                                {importBusy
                                  ? "Importando..."
                                  : `Importar todas desta BM (${group.accounts.length})`}
                              </button>
                            ))}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {group.accounts.map((acc) => {
                            const isSaved = savedIdsSet.has(
                              acc.id.toLowerCase()
                            );
                            const isSelected =
                              accountFormMode !== "closed" &&
                              accId.toLowerCase() === acc.id.toLowerCase();
                            return (
                              <button
                                key={acc.id}
                                type="button"
                                onClick={() => {
                                  const existing = state?.ad_accounts.find(
                                    (saved) =>
                                      saved.ad_account_id.toLowerCase() ===
                                      acc.id.toLowerCase()
                                  );
                                  if (existing) {
                                    applyAccountToForm({
                                      ...existing,
                                      business_id:
                                        existing.business_id ||
                                        acc.business_id ||
                                        null,
                                      business_name:
                                        existing.business_name ||
                                        acc.business_name ||
                                        null,
                                    });
                                    return;
                                  }
                                  setCpaMax("35");
                                  setRoasMin("2");
                                  setMinClicks("50");
                                  setDefaultLink("");
                                  setBaseLocation("Brasil");
                                  setAutoPause(false);
                                  setAccPreferredAI("AUTO");
                                  setAccId(acc.id);
                                  setAccName(acc.name);
                                  setAccBusinessId(acc.business_id || "");
                                  setAccBusinessName(acc.business_name || "");
                                  setAccCurrency(acc.currency);
                                  setAccStatus(acc.account_status);
                                  setAccIsDefault(
                                    (state?.ad_accounts.length || 0) === 0
                                  );
                                  setEditingAccountRowId(null);
                                  setAccountFormMode("create");
                                }}
                                className={`max-w-full rounded-lg border px-3 py-1.5 text-left text-[11px] font-bold whitespace-normal break-words transition ${
                                  isSelected
                                    ? "border-indigo-500 bg-indigo-50 text-indigo-800"
                                    : "border-slate-200 bg-slate-50/60 text-slate-700 hover:bg-slate-100"
                                }`}
                              >
                                {acc.name} ({acc.id} • {acc.currency}){" "}
                                {acc.is_active ? "• Ativa" : "• Inativa"}
                                {acc.ownership_type === "CLIENT"
                                  ? " • Cliente"
                                  : acc.ownership_type === "OWNED"
                                    ? " • Própria"
                                    : ""}
                                {isSaved ? " • ✓ Conectada" : ""}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

        {accountFormMode !== "closed" && (
          <div className="space-y-4 rounded-xl border border-indigo-200 bg-indigo-50/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100 pb-3">
              <div>
                <p className="text-xs font-extrabold text-slate-900">
                  {accountFormMode === "edit"
                    ? `Editando: ${accName || accId}`
                    : "Adicionar Nova Conta de Anúncios"}
                </p>
                <p className="text-[11px] text-slate-500">
                  Preencha ou ajuste os campos abaixo e salve, ou clique em
                  Cancelar para limpar e fechar.
                </p>
              </div>
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={resetAndCloseAccountForm}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
              >
                Cancelar
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-600">
                  ID da Conta Meta Ads (act_...)
                </label>
                <input
                  value={accId}
                  onChange={(e) => setAccId(e.target.value)}
                  placeholder="act_123456789"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-mono"
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
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600">
                  BM / Portfólio Empresarial (opcional)
                </label>
                <input
                  value={accBusinessName}
                  onChange={(e) => setAccBusinessName(e.target.value)}
                  placeholder="Ex: BM 01 (deixe vazio se pessoal)"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600">
                  ID da BM (opcional)
                </label>
                <input
                  value={accBusinessId}
                  onChange={(e) => setAccBusinessId(e.target.value)}
                  placeholder="Ex: 123456789012345"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600">
                  Moeda
                </label>
                <input
                  value={accCurrency}
                  onChange={(e) => setAccCurrency(e.target.value.toUpperCase())}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold"
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
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                />
                <p className="mt-1 text-[10px] leading-snug text-slate-500">
                  Padrão sugerido para novas campanhas. Ao criar cada campanha,
                  você pode ajustar cidade, bairro ou pino com raio.
                </p>
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
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold"
                />
                <p className="mt-1 text-[10px] leading-snug text-slate-500">
                  Valor máximo que você aceita pagar por conversa no WhatsApp,
                  lead ou venda. Ex.: R$ 15–35 para leads.
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
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold"
                />
                <p className="mt-1 text-[10px] leading-snug text-slate-500">
                  Retorno mínimo por R$ 1 gasto (ex.: 2 = R$ 2 em vendas para
                  cada R$ 1 investido). Usado quando há venda rastreada no Pixel.
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
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold"
                />
                <p className="mt-1 text-[10px] leading-snug text-slate-500">
                  Cliques mínimos antes de escalar ou pausar por CPA alto (após
                  48h). Ex.: 30 cliques p/ R$ 20/dia; 50 p/ R$ 40+/dia.
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
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600">
                  IA Padrão desta Conta
                </label>
                <select
                  value={accPreferredAI}
                  onChange={(e) =>
                    setAccPreferredAI(
                      e.target.value as AdsAIProviderPreference
                    )
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800"
                >
                  <option value="AUTO">
                    Automático (Gemini → OpenAI → Claude)
                  </option>
                  <option value="GEMINI">Google Gemini</option>
                  <option value="OPENAI">OpenAI (GPT)</option>
                  <option value="CLAUDE">Anthropic Claude</option>
                </select>
                <p className="mt-1 text-[10px] leading-snug text-slate-500">
                  IA pré-selecionada ao criar campanhas e analisar métricas
                  desta conta.
                </p>
              </div>
            </div>

            <details className="rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2.5 text-[11px] text-slate-600">
              <summary className="cursor-pointer font-bold text-slate-700 hover:text-indigo-700">
                Como o sistema usa esses 3 números (regra decide)?
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                <li>
                  <strong>Primeiras 48h:</strong> sempre mantém em{" "}
                  <strong>MANTER</strong> para respeitar a fase de aprendizado
                  da Meta.
                </li>
                <li>
                  <strong>ESCALAR (+20%):</strong> após atingir os cliques
                  mínimos com CPA ≤ CPA Máximo (ou ROAS ≥ ROAS Mínimo) e sem
                  fadiga criativa.
                </li>
                <li>
                  <strong>PAUSAR:</strong> se gastar ≥ 2× o CPA Máximo com zero
                  conversões ou se o CPA passar de 1,5× o limite após a amostra
                  mínima.
                </li>
              </ul>
            </details>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={accIsDefault}
                    onChange={(e) => setAccIsDefault(e.target.checked)}
                  />
                  Definir como conta padrão desta empresa
                </label>
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={autoPause}
                    onChange={(e) => setAutoPause(e.target.checked)}
                  />
                  Piloto Automático: pausar automaticamente campanhas com gasto
                  ≥ 2× CPA máximo e zero conversões (após 48h)
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={resetAndCloseAccountForm}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={busyAction !== null}
                  className="rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-extrabold text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {busyAction === "save_account"
                    ? "Salvando..."
                    : accountFormMode === "edit"
                      ? "Salvar Alterações"
                      : "Salvar Conta & Metas"}
                </button>
              </div>
            </div>
          </div>
        )}
      </form>

      {/* Diagnóstico IA das Métricas (por Conta ou Campanha) */}
      {metricsDiagnosis && (
        <div className="space-y-4 rounded-2xl border border-cyan-200 bg-cyan-50/40 p-4 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-extrabold text-cyan-950">
                Diagnóstico IA de Métricas — {metricsDiagnosis.scope_label}
              </h3>
              <p className="text-[11px] text-cyan-800/80">
                Gerado em{" "}
                {new Date(metricsDiagnosis.generated_at).toLocaleString(
                  "pt-BR"
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-white px-2.5 py-0.5 text-[10px] font-bold text-cyan-800">
                Motor: {metricsDiagnosis.provider_used}
              </span>
              <button
                type="button"
                onClick={() => setMetricsDiagnosis(null)}
                className="rounded-lg border border-cyan-200 bg-white px-2.5 py-1 text-[10px] font-bold text-cyan-800 hover:bg-cyan-100"
              >
                Fechar
              </button>
            </div>
          </div>

          <p className="rounded-xl border border-cyan-200/80 bg-white p-3.5 text-xs leading-relaxed text-slate-800">
            {metricsDiagnosis.summary}
          </p>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-emerald-200 bg-white p-3.5 text-xs">
              <p className="font-extrabold text-emerald-900">Pontos Fortes</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[11px] text-slate-700">
                {metricsDiagnosis.highlights.length > 0 ? (
                  metricsDiagnosis.highlights.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))
                ) : (
                  <li>Sem destaques positivos relevantes ainda.</li>
                )}
              </ul>
            </div>
            <div className="rounded-xl border border-amber-200 bg-white p-3.5 text-xs">
              <p className="font-extrabold text-amber-900">Alertas</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[11px] text-slate-700">
                {metricsDiagnosis.alerts.length > 0 ? (
                  metricsDiagnosis.alerts.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))
                ) : (
                  <li>Nenhum alerta crítico neste período.</li>
                )}
              </ul>
            </div>
            <div className="rounded-xl border border-indigo-200 bg-white p-3.5 text-xs">
              <p className="font-extrabold text-indigo-900">Próximas Ações</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[11px] text-slate-700">
                {metricsDiagnosis.next_actions.length > 0 ? (
                  metricsDiagnosis.next_actions.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))
                ) : (
                  <li>Continue monitorando após atingir a amostra mínima.</li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Consultor IA (Verba & Novos Ganchos) */}
      {advisor && (
        <div className="space-y-4 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4 shadow-sm sm:p-6">
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
      <div className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6">
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
                    <button
                      type="button"
                      onClick={() =>
                        setLightboxState({
                          images: p.image_urls_json,
                          title: p.headline,
                        })
                      }
                      title="Clique para ampliar a imagem"
                      className="relative h-14 w-14 shrink-0 cursor-zoom-in overflow-hidden rounded-lg border border-slate-200"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.image_urls_json[0]}
                        alt={p.headline}
                        className="h-full w-full object-cover transition hover:scale-105"
                      />
                    </button>
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
      {(() => {
        const allCampaigns = state?.campaigns || [];
        const accountNameMap = new Map<string, string>();
        for (const acc of state?.ad_accounts || []) {
          accountNameMap.set(
            acc.ad_account_id,
            formatAccountDisplayLabel(acc)
          );
        }
        const distinctAccountIds = Array.from(
          new Set([
            ...(state?.ad_accounts || []).map((a) => a.ad_account_id),
            ...allCampaigns.map((c) => c.ad_account_id),
          ])
        ).filter(Boolean);

        const filteredCampaigns = allCampaigns.filter((cmp) => {
          if (accountFilter !== "ALL" && cmp.ad_account_id !== accountFilter) {
            return false;
          }
          if (providerFilter !== "ALL" && cmp.provider !== providerFilter) {
            return false;
          }
          return true;
        });

        return (
      <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-extrabold text-slate-900">
            Campanhas &amp; Performance ({filteredCampaigns.length}
            {filteredCampaigns.length !== allCampaigns.length
              ? ` de ${allCampaigns.length}`
              : ""}
            )
          </h3>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            {distinctAccountIds.length > 0 && (
              <select
                value={accountFilter}
                onChange={(e) => setAccountFilter(e.target.value)}
                aria-label="Filtrar por conta de anúncios"
                className="w-full max-w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 sm:w-auto sm:py-1"
              >
                <option value="ALL">
                  Todas as Contas ({distinctAccountIds.length})
                </option>
                {distinctAccountIds.map((id) => (
                  <option key={id} value={id}>
                    {accountNameMap.get(id) || id} ({id})
                  </option>
                ))}
              </select>
            )}
            <select
              value={providerFilter}
              onChange={(e) =>
                setProviderFilter(e.target.value as "ALL" | AdProvider)
              }
              aria-label="Filtrar por rede de anúncios"
              className="w-full max-w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 sm:w-auto sm:py-1"
            >
              <option value="ALL">Todas as Redes</option>
              <option value="META">Meta Ads (IG &amp; FB)</option>
              <option value="TIKTOK">TikTok Ads (Em breve)</option>
            </select>
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
        </div>

        {loading && !state ? (
          <p className="text-xs text-slate-500">Carregando campanhas...</p>
        ) : !state || filteredCampaigns.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500">
            {allCampaigns.length === 0
              ? "Nenhuma campanha criada ainda. Clique em Criar Campanha acima ou em Impulsionar / Criar Campanha no Histórico de Posts."
              : "Nenhuma campanha encontrada para os filtros selecionados."}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredCampaigns.map((cmp) => {
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
              const adManagerLink = buildCampaignAdLink(cmp);
              const accountLabel =
                accountNameMap.get(cmp.ad_account_id) || cmp.ad_account_id;

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
                        {cmp.provider === "META" ? (
                          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-800">
                            Meta (FB + IG)
                          </span>
                        ) : (
                          <>
                            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                              {cmp.provider}
                            </span>
                            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-800">
                              {cmp.channel}
                            </span>
                          </>
                        )}
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
                        {cmp.ai_provider_preference &&
                          cmp.ai_provider_preference !== "AUTO" && (
                            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-800">
                              IA: {formatAIProviderLabel(cmp.ai_provider_preference)}
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
                        • Conta <strong>{accountLabel}</strong>{" "}
                        <span className="font-mono text-[10px] text-slate-500">
                          ({cmp.ad_account_id})
                        </span>
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {adManagerLink && (
                        <a
                          href={adManagerLink.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={adManagerLink.title}
                          className={adManagerLink.className}
                        >
                          {adManagerLink.label}
                        </a>
                      )}
                      {cmp.provider === "META" && (
                        <button
                          type="button"
                          disabled={busyAction !== null}
                          onClick={() => handleAnalyzeMetricsWithAI(cmp.id)}
                          className="rounded-lg border border-cyan-200 bg-cyan-50 px-2.5 py-1.5 text-[11px] font-bold text-cyan-800 hover:bg-cyan-100 disabled:opacity-60"
                        >
                          {busyAction === `metrics-ai-${cmp.id}`
                            ? "Analisando..."
                            : "Analisar IA"}
                        </button>
                      )}
                      {cmp.provider === "META" &&
                        cmp.meta_campaign_id &&
                        cmp.status !== "ARCHIVED" &&
                        cmp.status !== "ERROR" && (
                          <button
                            type="button"
                            disabled={busyAction !== null}
                            onClick={() => setEditCampaignTarget(cmp)}
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                          >
                            Editar
                          </button>
                        )}
                      {cmp.provider === "META" &&
                        cmp.meta_adset_id &&
                        cmp.status !== "ARCHIVED" &&
                        cmp.status !== "ERROR" && (
                          <button
                            type="button"
                            disabled={busyAction !== null}
                            onClick={() => setAddCreativesTarget(cmp)}
                            className="rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-[11px] font-bold text-violet-700 hover:bg-violet-100 disabled:opacity-60"
                          >
                            + Criativo
                          </button>
                        )}
                      {cmp.status === "PAUSED" && cmp.meta_campaign_id && (
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
                      {cmp.status !== "ARCHIVED" &&
                        cmp.status !== "ERROR" &&
                        cmp.meta_campaign_id && (
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
                      {(cmp.status === "ERROR" || cmp.status === "ARCHIVED") && (
                        <button
                          type="button"
                          disabled={busyAction !== null}
                          onClick={() => void handleDeleteCampaign(cmp)}
                          className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                        >
                          Excluir
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Métricas da janela */}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
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

                  {cmp.ads && cmp.ads.length > 0 && (
                    <div className="space-y-1.5 rounded-xl border border-slate-200 bg-white p-3">
                      <p className="text-[11px] font-extrabold text-slate-700">
                        Anúncios no Conjunto ({cmp.ads.length})
                      </p>
                      <div className="space-y-1.5">
                        {cmp.ads.map((ad) => {
                          const adWin = ad.last_insights_json?.windows?.[selectedWindow];
                          const adSpend = adWin?.spend ?? ad.last_insights_json?.spend;
                          const adClicks = adWin?.clicks ?? ad.last_insights_json?.clicks;
                          const adCtr = adWin?.ctr ?? ad.last_insights_json?.ctr;
                          const adConv =
                            adWin?.conversions ?? ad.last_insights_json?.conversions;
                          const adCpa = adWin?.cpa ?? ad.last_insights_json?.cpa;

                          return (
                            <div
                              key={ad.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200/80 bg-slate-50/70 px-2.5 py-2 text-[11px]"
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                {ad.image_url && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setLightboxState({
                                        images: [ad.image_url!],
                                        title: ad.headline || ad.ad_name,
                                      })
                                    }
                                    title="Clique para ampliar a imagem"
                                    className="h-9 w-9 shrink-0 cursor-zoom-in overflow-hidden rounded border border-slate-200"
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={ad.image_url}
                                      alt={ad.headline || ad.ad_name}
                                      className="h-full w-full object-cover transition hover:scale-105"
                                    />
                                  </button>
                                )}
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span
                                      className={`rounded-full px-1.5 py-0.5 text-[9px] font-extrabold ${
                                        ad.status === "ACTIVE"
                                          ? "bg-emerald-100 text-emerald-800"
                                          : ad.status === "ERROR"
                                            ? "bg-rose-100 text-rose-800"
                                            : "bg-amber-100 text-amber-800"
                                      }`}
                                    >
                                      {ad.status}
                                    </span>
                                    <span className="truncate font-bold text-slate-900">
                                      {ad.headline || ad.ad_name}
                                    </span>
                                  </div>
                                  <p className="mt-0.5 text-[10px] text-slate-600">
                                    Gasto:{" "}
                                    <strong>{formatMoney(adSpend, cmp.currency)}</strong>{" "}
                                    • Cliques: <strong>{adClicks ?? "—"}</strong> • CTR:{" "}
                                    <strong>
                                      {adCtr !== undefined
                                        ? `${Number(adCtr).toFixed(2)}%`
                                        : "—"}
                                    </strong>{" "}
                                    • Conv.: <strong>{adConv ?? "—"}</strong> • CPA:{" "}
                                    <strong>{formatMoney(adCpa, cmp.currency)}</strong>
                                  </p>
                                  {ad.error_message && (
                                    <p className="mt-0.5 text-[10px] font-bold text-rose-700">
                                      Erro: {ad.error_message}
                                    </p>
                                  )}
                                </div>
                              </div>

                              <div className="flex shrink-0 items-center gap-1">
                                {ad.meta_ad_id &&
                                  ad.status !== "ERROR" &&
                                  ad.status !== "ARCHIVED" && (
                                    <button
                                      type="button"
                                      disabled={busyAction !== null}
                                      onClick={() => setEditAdTarget(ad)}
                                      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                                    >
                                      Editar
                                    </button>
                                  )}
                                {ad.meta_ad_id && ad.status === "PAUSED" && (
                                  <button
                                    type="button"
                                    disabled={busyAction !== null}
                                    onClick={() =>
                                      void handleToggleAdStatus(ad, "ACTIVE")
                                    }
                                    className="rounded-md bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
                                  >
                                    Ativar
                                  </button>
                                )}
                                {ad.meta_ad_id && ad.status === "ACTIVE" && (
                                  <button
                                    type="button"
                                    disabled={busyAction !== null}
                                    onClick={() =>
                                      void handleToggleAdStatus(ad, "PAUSED")
                                    }
                                    className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-800 hover:bg-amber-100 disabled:opacity-60"
                                  >
                                    Pausar
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
        );
      })()}

      {addCreativesTarget && (
        <AddCreativesModal
          companyId={companyId}
          campaign={addCreativesTarget}
          publishedPosts={publishedPosts}
          onClose={() => setAddCreativesTarget(null)}
          onAdded={(addedCount, failedCount) => {
            setAddCreativesTarget(null);
            void fetchAdsState();
            setNotice({
              type: failedCount > 0 && addedCount === failedCount ? "error" : "success",
              text:
                failedCount > 0
                  ? `${addedCount} criativo(s) processado(s) na campanha (${failedCount} com erro).`
                  : `${addedCount} novo(s) anúncio(s) adicionado(s) em PAUSED no conjunto.`,
            });
          }}
        />
      )}

      {editCampaignTarget && (
        <EditCampaignModal
          companyId={companyId}
          campaign={editCampaignTarget}
          onClose={() => setEditCampaignTarget(null)}
          onSaved={() => {
            setEditCampaignTarget(null);
            void fetchAdsState();
            setNotice({
              type: "success",
              text: "Campanha atualizada na Meta Ads e sincronizada no PilotFlow.",
            });
          }}
        />
      )}

      {editAdTarget && (
        <EditAdModal
          companyId={companyId}
          ad={editAdTarget}
          onClose={() => setEditAdTarget(null)}
          onSaved={() => {
            setEditAdTarget(null);
            void fetchAdsState();
            setNotice({
              type: "success",
              text: "Anúncio atualizado na Meta Ads e sincronizado no PilotFlow.",
            });
          }}
        />
      )}

      {lightboxState && (
        <ImageLightboxModal
          images={lightboxState.images}
          title={lightboxState.title}
          onClose={() => setLightboxState(null)}
        />
      )}
    </div>
  );
}
