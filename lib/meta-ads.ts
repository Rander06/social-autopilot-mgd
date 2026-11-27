import {
  AdInsightsSnapshot,
  AdInsightsWindow,
  AdInsightsWindowMetrics,
  MetaAdObjective,
} from "./types";

export const META_ADS_GRAPH_VERSION = "v26.0";
export const META_ADS_GRAPH_BASE_URL = `https://graph.facebook.com/${META_ADS_GRAPH_VERSION}`;

export function normalizeAdAccountId(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return /^act_/i.test(trimmed) ? `act_${trimmed.slice(4)}` : `act_${trimmed}`;
}

/**
 * Em `posts_history.fb_post_id`, o PilotFlow costuma gravar no formato já composto `${page_id}_${post_id}`.
 * Normaliza para evitar duplicação de `page_id_` ao enviar `object_story_id` para a Meta.
 */
export function normalizeFbObjectStoryId(
  fbPageId: string,
  fbPostId: string
): string {
  const cleanPage = fbPageId.trim();
  const cleanPost = fbPostId.trim();
  if (!cleanPost) return "";
  if (cleanPost.includes("_") || !cleanPage) return cleanPost;
  return `${cleanPage}_${cleanPost}`;
}

export function getMinimumDailyBudgetCents(currency = "BRL"): number {
  const code = currency.trim().toUpperCase();
  if (code === "USD" || code === "EUR") return 100;
  return 600;
}

export class MetaAdsApiError extends Error {
  status: number;
  code?: number;
  subcode?: number;
  userTitle?: string;
  userMessage?: string;
  partialIds?: {
    campaignId?: string;
    adsetId?: string;
    creativeId?: string;
  };

  constructor(params: {
    message: string;
    status: number;
    code?: number;
    subcode?: number;
    userTitle?: string;
    userMessage?: string;
    partialIds?: {
      campaignId?: string;
      adsetId?: string;
      creativeId?: string;
    };
  }) {
    super(params.message);
    this.name = "MetaAdsApiError";
    this.status = params.status;
    this.code = params.code;
    this.subcode = params.subcode;
    this.userTitle = params.userTitle;
    this.userMessage = params.userMessage;
    this.partialIds = params.partialIds;
  }
}

export interface MetaAdAccountSummary {
  id: string;
  name: string;
  currency: string;
  account_status: number;
  business_name: string | null;
  is_active: boolean;
}

export interface MetaGeoLocationResult {
  key: string;
  name: string;
  type: string;
  country_code?: string;
  region?: string;
  region_id?: number;
  supports_city?: boolean;
  supports_region?: boolean;
}

export interface MetaTargetingInput {
  geo_locations?: {
    countries?: string[];
    cities?: Array<{
      key: string;
      radius?: number;
      distance_unit?: "kilometer" | "mile";
    }>;
    regions?: Array<{ key: string }>;
  };
  age_min?: number;
  age_max?: number;
  genders?: Array<1 | 2>;
  targeting_automation?: {
    advantage_audience?: 0 | 1;
  };
}

export interface CreateMetaCampaignInput {
  adAccountId: string;
  channel: "INSTAGRAM" | "FACEBOOK";
  name: string;
  objective: MetaAdObjective;
  optimizationGoal: string;
  destinationType?: string | null;
  dailyBudgetCents: number;
  currency?: string;
  durationDays?: number | null;
  targeting?: MetaTargetingInput;
  fbPageId?: string | null;
  fbPostId?: string | null;
  igUserId?: string | null;
  igMediaId?: string | null;
  destinationUrl?: string | null;
}

export interface CreateMetaCampaignResult {
  adAccountId: string;
  sourceStoryId: string;
  campaignId: string;
  adsetId: string;
  creativeId: string;
  adId: string;
  status: "PAUSED";
  stepsLog: string[];
}

export interface MetaAdInsightRow {
  ad_id: string;
  ad_name: string;
  adset_id?: string;
  campaign_id?: string;
  snapshot: AdInsightsSnapshot;
}

const CONVERSION_ACTION_PRIORITY = [
  "onsite_conversion.messaging_conversation_started_7d",
  "lead",
  "onsite_conversion.lead_grouped",
  "offsite_conversion.fb_pixel_lead",
  "offsite_conversion.fb_pixel_purchase",
  "purchase",
  "omni_purchase",
];

function extractConversionsAndRevenue(
  actions?: Array<{ action_type: string; value: string }>,
  actionValues?: Array<{ action_type: string; value: string }>
): { conversions: number; revenue: number } {
  let conversions = 0;
  if (Array.isArray(actions) && actions.length > 0) {
    for (const actionType of CONVERSION_ACTION_PRIORITY) {
      const matched = actions.find((a) => a.action_type === actionType);
      if (matched) {
        const val = Number(matched.value);
        if (Number.isFinite(val) && val > 0) {
          conversions = val;
          break;
        }
      }
    }
    if (conversions === 0) {
      const linkClicks = actions.find((a) => a.action_type === "link_click");
      if (linkClicks) {
        const val = Number(linkClicks.value);
        if (Number.isFinite(val) && val > 0) conversions = val;
      }
    }
  }

  let revenue = 0;
  if (Array.isArray(actionValues) && actionValues.length > 0) {
    for (const actionType of [
      "offsite_conversion.fb_pixel_purchase",
      "purchase",
      "omni_purchase",
    ]) {
      const matched = actionValues.find((a) => a.action_type === actionType);
      if (matched) {
        const val = Number(matched.value);
        if (Number.isFinite(val) && val > 0) {
          revenue = val;
          break;
        }
      }
    }
  }

  return { conversions, revenue };
}

export class MetaAdsService {
  private readonly accessToken: string;

  constructor(accessToken: string) {
    const cleanToken = accessToken?.trim();
    if (!cleanToken) {
      throw new Error(
        "Token da Meta ausente. Conecte a conta Meta nas Integrações antes de usar o módulo de Anúncios."
      );
    }
    this.accessToken = cleanToken;
  }

  private async request<T>(
    path: string,
    options: {
      method?: "GET" | "POST";
      query?: Record<string, string | number | undefined>;
      body?: Record<string, unknown>;
    } = {}
  ): Promise<T> {
    const method = options.method || "GET";
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(`${META_ADS_GRAPH_BASE_URL}${cleanPath}`);

    if (options.query) {
      for (const [k, v] of Object.entries(options.query)) {
        if (v !== undefined && v !== null && String(v).length > 0) {
          url.searchParams.set(k, String(v));
        }
      }
    }
    if (method === "GET") {
      url.searchParams.set("access_token", this.accessToken);
    }

    const res = await fetch(url.toString(), {
      method,
      headers:
        method === "POST"
          ? { "Content-Type": "application/json" }
          : undefined,
      body:
        method === "POST"
          ? JSON.stringify({
              ...(options.body || {}),
              access_token: this.accessToken,
            })
          : undefined,
      signal: AbortSignal.timeout(25_000),
    });

    const data = (await res.json().catch(() => ({}))) as T & {
      error?: {
        message?: string;
        code?: number;
        error_subcode?: number;
        error_user_title?: string;
        error_user_msg?: string;
      };
    };

    if (!res.ok || data.error) {
      const errObj = data.error;
      const detail =
        errObj?.error_user_msg ||
        errObj?.message ||
        res.statusText ||
        `Erro HTTP ${res.status}`;
      throw new MetaAdsApiError({
        message: `Meta Marketing API (${cleanPath}): ${detail}`,
        status: res.status,
        code: errObj?.code,
        subcode: errObj?.error_subcode,
        userTitle: errObj?.error_user_title,
        userMessage: errObj?.error_user_msg,
      });
    }

    return data;
  }

  async checkAdsPermissions(): Promise<{
    has_ads_management: boolean;
    has_ads_read: boolean;
    has_business_management: boolean;
    granted: string[];
  }> {
    const data = await this.request<{
      data?: Array<{ permission: string; status: string }>;
    }>("/me/permissions");
    const granted = (data.data || [])
      .filter((p) => p.status === "granted")
      .map((p) => p.permission);

    return {
      has_ads_management: granted.includes("ads_management"),
      has_ads_read: granted.includes("ads_read"),
      has_business_management: granted.includes("business_management"),
      granted,
    };
  }

  async listAdAccounts(): Promise<MetaAdAccountSummary[]> {
    const data = await this.request<{
      data?: Array<{
        id: string;
        name?: string;
        currency?: string;
        account_status?: number;
        business_name?: string;
      }>;
    }>("/me/adaccounts", {
      query: {
        fields: "id,name,currency,account_status,business_name",
        limit: 100,
      },
    });

    return (data.data || []).map((acc) => {
      const statusCode = Number(acc.account_status ?? 0);
      return {
        id: normalizeAdAccountId(acc.id),
        name: acc.name?.trim() || acc.id,
        currency: (acc.currency || "BRL").toUpperCase(),
        account_status: statusCode,
        business_name: acc.business_name || null,
        is_active: statusCode === 1,
      };
    });
  }

  async searchGeoLocations(
    query: string,
    options: {
      locationTypes?: Array<"city" | "region" | "country">;
      countryCode?: string;
      limit?: number;
    } = {}
  ): Promise<MetaGeoLocationResult[]> {
    const cleanQuery = query.trim();
    if (!cleanQuery) return [];

    const types = options.locationTypes || ["city", "region"];
    const data = await this.request<{ data?: MetaGeoLocationResult[] }>(
      "/search",
      {
        query: {
          type: "adgeolocation",
          q: cleanQuery,
          location_types: JSON.stringify(types),
          country_code: options.countryCode || "BR",
          limit: options.limit ?? 10,
        },
      }
    );

    return data.data || [];
  }

  private normalizeTargeting(input?: MetaTargetingInput): Record<string, unknown> {
    const ageMin = Math.max(18, Math.min(65, Math.round(input?.age_min ?? 18)));
    const ageMax = Math.max(ageMin, Math.min(65, Math.round(input?.age_max ?? 65)));

    const rawGeo = input?.geo_locations;
    const hasCustomGeo = Boolean(
      (rawGeo?.cities && rawGeo.cities.length > 0) ||
        (rawGeo?.regions && rawGeo.regions.length > 0) ||
        (rawGeo?.countries && rawGeo.countries.length > 0)
    );

    const geo_locations = hasCustomGeo
      ? rawGeo
      : { countries: ["BR"] };

    const targeting: Record<string, unknown> = {
      geo_locations,
      age_min: ageMin,
      age_max: ageMax,
      targeting_automation: {
        advantage_audience: input?.targeting_automation?.advantage_audience ?? 0,
      },
    };

    if (input?.genders && input.genders.length > 0) {
      targeting.genders = input.genders;
    }

    return targeting;
  }

  async createCampaignFromExistingPost(
    input: CreateMetaCampaignInput
  ): Promise<CreateMetaCampaignResult> {
    const adAccountId = normalizeAdAccountId(input.adAccountId);
    if (!adAccountId) {
      throw new Error("Conta de anúncios (ad_account_id) inválida.");
    }

    const currency = (input.currency || "BRL").toUpperCase();
    const minBudget = getMinimumDailyBudgetCents(currency);
    const budgetCents = Math.round(input.dailyBudgetCents);
    if (!Number.isFinite(budgetCents) || budgetCents < minBudget) {
      throw new Error(
        `Orçamento diário abaixo do mínimo exigido pela Meta (${minBudget} centavos em ${currency}).`
      );
    }

    const fbPageId = input.fbPageId?.trim() || "";
    const fbPostId = input.fbPostId?.trim() || "";
    const igUserId = input.igUserId?.trim() || "";
    const igMediaId = input.igMediaId?.trim() || "";

    let sourceStoryId = "";
    if (input.channel === "FACEBOOK") {
      if (!fbPageId || !fbPostId) {
        throw new Error(
          "Post orgânico sem fb_page_id ou fb_post_id para impulsionar no Facebook."
        );
      }
      sourceStoryId = normalizeFbObjectStoryId(fbPageId, fbPostId);
    } else {
      if (!fbPageId || !igUserId || !igMediaId) {
        throw new Error(
          "Post orgânico sem fb_page_id, ig_user_id ou ig_post_id para impulsionar no Instagram."
        );
      }
      sourceStoryId = igMediaId;
    }

    const stepsLog: string[] = [];
    const partialIds: {
      campaignId?: string;
      adsetId?: string;
      creativeId?: string;
    } = {};

    const attachPartialIds = (err: unknown): never => {
      if (err instanceof MetaAdsApiError) {
        err.partialIds = { ...partialIds };
        throw err;
      }
      throw new MetaAdsApiError({
        message: err instanceof Error ? err.message : String(err),
        status: 500,
        partialIds: { ...partialIds },
      });
    };

    // Passo 1 — Criar Campanha (sempre PAUSED por segurança)
    const campaignRes = await this.request<{ id: string }>(
      `/${adAccountId}/campaigns`,
      {
        method: "POST",
        body: {
          name: input.name.trim(),
          objective: input.objective,
          status: "PAUSED",
          special_ad_categories: [],
          is_adset_budget_sharing_enabled: false,
        },
      }
    );
    partialIds.campaignId = campaignRes.id;
    stepsLog.push(`Passo 1 concluído: Campaign ${campaignRes.id} (PAUSED)`);

    // Passo 2 — Criar Conjunto de Anúncios (AdSet PAUSED)
    const adsetPayload: Record<string, unknown> = {
      name: `${input.name.trim()} — AdSet`,
      campaign_id: campaignRes.id,
      daily_budget: String(budgetCents),
      billing_event: "IMPRESSIONS",
      optimization_goal: input.optimizationGoal || "LINK_CLICKS",
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      targeting: this.normalizeTargeting(input.targeting),
      status: "PAUSED",
    };

    if (input.destinationType?.trim()) {
      adsetPayload.destination_type = input.destinationType.trim();
    }

    const needsPagePromotedObject =
      input.objective === "OUTCOME_LEADS" ||
      input.objective === "OUTCOME_ENGAGEMENT" ||
      input.destinationType === "WHATSAPP" ||
      input.destinationType === "MESSENGER" ||
      input.destinationType === "INSTAGRAM_DIRECT";

    if (needsPagePromotedObject && fbPageId) {
      adsetPayload.promoted_object = { page_id: fbPageId };
    }

    if (input.durationDays && input.durationDays > 0) {
      const start = new Date();
      const end = new Date(
        start.getTime() + Math.round(input.durationDays) * 24 * 60 * 60 * 1000
      );
      adsetPayload.start_time = start.toISOString();
      adsetPayload.end_time = end.toISOString();
    }

    let adsetRes: { id: string };
    try {
      adsetRes = await this.request<{ id: string }>(`/${adAccountId}/adsets`, {
        method: "POST",
        body: adsetPayload,
      });
    } catch (err) {
      return attachPartialIds(err);
    }
    partialIds.adsetId = adsetRes.id;
    stepsLog.push(`Passo 2 concluído: AdSet ${adsetRes.id} (PAUSED)`);

    // Passo 3 — Criar AdCreative reaproveitando o post orgânico (zero re-upload)
    const creativePayload: Record<string, unknown> =
      input.channel === "FACEBOOK"
        ? {
            name: `${input.name.trim()} — Creative FB`,
            object_story_id: sourceStoryId,
          }
        : {
            name: `${input.name.trim()} — Creative IG`,
            object_id: fbPageId,
            instagram_user_id: igUserId,
            source_instagram_media_id: igMediaId,
          };

    if (
      input.destinationUrl?.trim() &&
      input.objective === "OUTCOME_TRAFFIC" &&
      input.channel === "INSTAGRAM"
    ) {
      creativePayload.call_to_action = {
        type: "LEARN_MORE",
        value: { link: input.destinationUrl.trim() },
      };
    }

    let creativeRes: { id: string };
    try {
      creativeRes = await this.request<{ id: string }>(
        `/${adAccountId}/adcreatives`,
        {
          method: "POST",
          body: creativePayload,
        }
      );
    } catch (err) {
      return attachPartialIds(err);
    }
    partialIds.creativeId = creativeRes.id;
    stepsLog.push(`Passo 3 concluído: AdCreative ${creativeRes.id} (prova social preservada)`);

    // Passo 4 — Criar Anúncio (Ad PAUSED)
    let adRes: { id: string };
    try {
      adRes = await this.request<{ id: string }>(`/${adAccountId}/ads`, {
        method: "POST",
        body: {
          name: `${input.name.trim()} — Ad`,
          adset_id: adsetRes.id,
          creative: { creative_id: creativeRes.id },
          status: "PAUSED",
        },
      });
    } catch (err) {
      return attachPartialIds(err);
    }
    stepsLog.push(`Passo 4 concluído: Ad ${adRes.id} (PAUSED)`);

    return {
      adAccountId,
      sourceStoryId,
      campaignId: campaignRes.id,
      adsetId: adsetRes.id,
      creativeId: creativeRes.id,
      adId: adRes.id,
      status: "PAUSED",
      stepsLog,
    };
  }

  async toggleEntityStatus(
    entityId: string,
    status: "ACTIVE" | "PAUSED" | "ARCHIVED"
  ): Promise<{ success: boolean }> {
    const cleanId = entityId.trim();
    if (!cleanId) {
      throw new Error("ID da entidade Meta não informado.");
    }
    const res = await this.request<{ success?: boolean }>(`/${cleanId}`, {
      method: "POST",
      body: { status },
    });
    return { success: res.success !== false };
  }

  async fetchAdInsights(
    adAccountId: string,
    options: {
      datePreset?: "today" | "yesterday" | "last_3d" | "last_7d" | "last_30d";
      windowDays?: 4 | 7 | 14 | 30;
      adIds?: string[];
    } = {}
  ): Promise<MetaAdInsightRow[]> {
    const cleanAccountId = normalizeAdAccountId(adAccountId);
    if (!cleanAccountId) return [];

    const query: Record<string, string | number | undefined> = {
      level: "ad",
      fields:
        "ad_id,ad_name,adset_id,campaign_id,spend,impressions,clicks,ctr,cpc,cpm,frequency,actions,action_values",
      limit: 200,
    };

    if (options.windowDays) {
      const untilDate = new Date();
      const sinceDate = new Date(
        untilDate.getTime() - (options.windowDays - 1) * 24 * 60 * 60 * 1000
      );
      query.time_range = JSON.stringify({
        since: sinceDate.toISOString().slice(0, 10),
        until: untilDate.toISOString().slice(0, 10),
      });
    } else {
      query.date_preset = options.datePreset || "last_7d";
    }

    const cleanAdIds = (options.adIds || [])
      .map((id) => id.trim())
      .filter(Boolean);
    if (cleanAdIds.length > 0) {
      query.filtering = JSON.stringify([
        { field: "ad.id", operator: "IN", value: cleanAdIds },
      ]);
    }

    const data = await this.request<{
      data?: Array<{
        ad_id: string;
        ad_name?: string;
        adset_id?: string;
        campaign_id?: string;
        spend?: string;
        impressions?: string;
        clicks?: string;
        ctr?: string;
        cpc?: string;
        cpm?: string;
        frequency?: string;
        actions?: Array<{ action_type: string; value: string }>;
        action_values?: Array<{ action_type: string; value: string }>;
      }>;
    }>(`/${cleanAccountId}/insights`, { query });

    return (data.data || []).map((row) => {
      const spend = Number(row.spend || 0);
      const impressions = Number(row.impressions || 0);
      const clicks = Number(row.clicks || 0);
      const ctr = Number(row.ctr || 0);
      const cpc = Number(row.cpc || 0);
      const cpm = Number(row.cpm || 0);
      const frequency = Number(row.frequency || 0);
      const { conversions, revenue } = extractConversionsAndRevenue(
        row.actions,
        row.action_values
      );
      const unitCost =
        conversions > 0 ? Number((spend / conversions).toFixed(2)) : null;

      return {
        ad_id: row.ad_id,
        ad_name: row.ad_name || row.ad_id,
        adset_id: row.adset_id,
        campaign_id: row.campaign_id,
        snapshot: {
          spend,
          impressions,
          clicks,
          ctr,
          cpc,
          cpm,
          frequency,
          conversions,
          cpl: unitCost,
          cpa: unitCost,
          roas: spend > 0 && revenue > 0 ? Number((revenue / spend).toFixed(2)) : null,
          raw_actions: row.actions || [],
        },
      };
    });
  }

  async fetchMultiWindowAdInsights(
    adAccountId: string,
    adIds?: string[]
  ): Promise<Record<string, AdInsightsSnapshot>> {
    const windowSpecs: Array<{ key: AdInsightsWindow; days: 4 | 7 | 14 | 30 }> = [
      { key: "4d", days: 4 },
      { key: "7d", days: 7 },
      { key: "14d", days: 14 },
      { key: "30d", days: 30 },
    ];

    const settled = await Promise.all(
      windowSpecs.map(async (w) => {
        const rows = await this.fetchAdInsights(adAccountId, {
          windowDays: w.days,
          adIds,
        });
        return { key: w.key, rows };
      })
    );

    const byAdId: Record<string, AdInsightsSnapshot> = {};

    for (const { key, rows } of settled) {
      for (const row of rows) {
        if (!byAdId[row.ad_id]) {
          byAdId[row.ad_id] = { windows: {} };
        }
        const s = row.snapshot;
        const winMetrics: AdInsightsWindowMetrics = {
          spend: Number(s.spend || 0),
          impressions: Number(s.impressions || 0),
          clicks: Number(s.clicks || 0),
          ctr: Number(s.ctr || 0),
          cpc: Number(s.cpc || 0),
          cpm: Number(s.cpm || 0),
          frequency: Number(s.frequency || 0),
          conversions: Number(s.conversions || 0),
          cpl: s.cpl ?? null,
          cpa: s.cpa ?? null,
          roas: s.roas ?? null,
        };
        byAdId[row.ad_id].windows![key] = winMetrics;

        if (key === "7d") {
          byAdId[row.ad_id] = {
            ...byAdId[row.ad_id],
            ...winMetrics,
            raw_actions: s.raw_actions,
            windows: byAdId[row.ad_id].windows,
          };
        }
      }
    }

    for (const adId of Object.keys(byAdId)) {
      const snap = byAdId[adId];
      const fallbackWin =
        snap.windows?.["7d"] ||
        snap.windows?.["4d"] ||
        snap.windows?.["14d"] ||
        snap.windows?.["30d"];
      if (snap.spend === undefined && fallbackWin) {
        Object.assign(snap, fallbackWin);
      }
      const w4 = snap.windows?.["4d"];
      const w7 = snap.windows?.["7d"];
      const freq = Number(snap.frequency ?? w4?.frequency ?? 0);
      const ctr = Number(snap.ctr ?? w4?.ctr ?? 0);
      const ctrDropped = Boolean(w4 && w7 && w7.ctr > 0 && w4.ctr < w7.ctr * 0.75);
      snap.creative_fatigue = freq >= 2.8 && (ctr < 0.8 || ctrDropped);
    }

    return byAdId;
  }
}
