import {
  AdInsightsDailyPoint,
  AdInsightsSnapshot,
  AdInsightsWindow,
  AdInsightsWindowMetrics,
  MetaAdObjective,
  PostChannelOrganicMetrics,
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

export function isBrokenFacebookPermalink(url?: string | null): boolean {
  const clean = url?.trim();
  if (!clean) return true;
  if (/\/\d+_\d+\/?$/.test(clean)) return true;
  if (/^https?:\/\/(?:www\.|m\.)?facebook\.com\/\d+\/posts\/\d+\/?$/i.test(clean)) {
    return true;
  }
  if (/permalink\.php\?story_fbid=\d+&id=\d+/i.test(clean)) {
    return true;
  }
  return false;
}

interface FacebookPostPermalinkFields {
  permalink_url?: string;
  attachments?: {
    data?: Array<{
      url?: string;
      unshimmed_url?: string;
      target?: { url?: string };
      subattachments?: {
        data?: Array<{
          url?: string;
          unshimmed_url?: string;
          target?: { url?: string };
        }>;
      };
    }>;
  };
}

function extractFacebookWorkingUrl(
  data?: FacebookPostPermalinkFields | null
): string | null {
  if (!data) return null;
  if (data.permalink_url && !isBrokenFacebookPermalink(data.permalink_url)) {
    return data.permalink_url.trim();
  }

  for (const att of data.attachments?.data || []) {
    for (const candidate of [att.url, att.unshimmed_url, att.target?.url]) {
      const clean = candidate?.trim();
      if (clean && /^https:\/\//i.test(clean) && !isBrokenFacebookPermalink(clean)) {
        return clean;
      }
    }
    for (const sub of att.subattachments?.data || []) {
      for (const candidate of [sub.url, sub.unshimmed_url, sub.target?.url]) {
        const clean = candidate?.trim();
        if (clean && /^https:\/\//i.test(clean) && !isBrokenFacebookPermalink(clean)) {
          return clean;
        }
      }
    }
  }

  return null;
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
  business_id: string | null;
  business_name: string | null;
  ownership_type?: "OWNED" | "CLIENT" | "PERSONAL";
  is_active: boolean;
}

export interface MetaAdPixelSummary {
  id: string;
  name: string;
  is_unavailable: boolean;
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
    neighborhoods?: Array<{ key: string }>;
    subcities?: Array<{ key: string }>;
    zips?: Array<{ key: string }>;
    custom_locations?: Array<{
      latitude: number;
      longitude: number;
      radius: number;
      distance_unit: "kilometer" | "mile";
      name?: string;
    }>;
  };
  age_min?: number;
  age_max?: number;
  genders?: Array<1 | 2>;
  publisher_platforms?: string[];
  facebook_positions?: string[];
  instagram_positions?: string[];
  targeting_automation?: {
    advantage_audience?: 0 | 1;
  };
}

export interface MetaCreativeItemInput {
  postId?: string | null;
  adName?: string | null;
  fbPostId?: string | null;
  igMediaId?: string | null;
  postImageUrl?: string | null;
  postStoryImageUrl?: string | null;
  postHeadline?: string | null;
  postCaption?: string | null;
  welcomeGreeting?: string | null;
  welcomeAutofill?: string | null;
}

export interface CreatedMetaAdItem {
  postId: string | null;
  adName: string;
  headline: string;
  primaryText: string;
  imageUrl: string | null;
  storyImageUrl: string | null;
  sourceStoryId: string;
  creativeId: string | null;
  adId: string | null;
  status: "PAUSED" | "ERROR";
  errorMessage?: string | null;
  stepsLog: string[];
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
  startTime?: string | null;
  endTime?: string | null;
  noEndDate?: boolean;
  targeting?: MetaTargetingInput;
  fbPageId?: string | null;
  fbPostId?: string | null;
  igUserId?: string | null;
  igMediaId?: string | null;
  destinationUrl?: string | null;
  postImageUrl?: string | null;
  postStoryImageUrl?: string | null;
  postHeadline?: string | null;
  postCaption?: string | null;
  welcomeGreeting?: string | null;
  welcomeAutofill?: string | null;
  pixelId?: string | null;
  urlTags?: string | null;
  creatives?: MetaCreativeItemInput[];
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
  createdAds: CreatedMetaAdItem[];
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

const IMAGE_SAFE_FB_POSITIONS = [
  "feed",
  "story",
  "marketplace",
  "profile_feed",
  "search",
  "facebook_reels",
];
const IMAGE_SAFE_FB_POSITIONS_FALLBACK = ["feed", "story", "marketplace"];
const IMAGE_SAFE_IG_POSITIONS = [
  "stream",
  "story",
  "reels",
  "explore_home",
  "profile_feed",
  "ig_search",
];
const IMAGE_SAFE_IG_POSITIONS_FALLBACK = ["stream", "story", "reels"];

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
    has_instagram_manage_insights: boolean;
    has_read_insights: boolean;
    has_pages_read_engagement: boolean;
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
      has_instagram_manage_insights: granted.includes(
        "instagram_manage_insights"
      ),
      has_read_insights: granted.includes("read_insights"),
      has_pages_read_engagement: granted.includes("pages_read_engagement"),
      granted,
    };
  }

  private async requestWithToken<T>(
    path: string,
    token: string,
    query: Record<string, string | number | undefined> = {}
  ): Promise<T> {
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(`${META_ADS_GRAPH_BASE_URL}${cleanPath}`);
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && String(v).length > 0) {
        url.searchParams.set(k, String(v));
      }
    }
    url.searchParams.set("access_token", token);

    const res = await fetch(url.toString(), {
      method: "GET",
      signal: AbortSignal.timeout(20_000),
    });
    const data = (await res.json().catch(() => ({}))) as T & {
      error?: { message?: string; code?: number; error_subcode?: number };
    };
    if (!res.ok || data.error) {
      throw new MetaAdsApiError({
        message: `Meta Graph (${cleanPath}): ${
          data.error?.message || res.statusText || `HTTP ${res.status}`
        }`,
        status: res.status,
        code: data.error?.code,
        subcode: data.error?.error_subcode,
      });
    }
    return data;
  }

  async resolvePageAccessToken(fbPageId: string): Promise<string> {
    const cleanPage = fbPageId.trim();
    if (!cleanPage) return this.accessToken;
    try {
      const data = await this.request<{ access_token?: string }>(
        `/${cleanPage}`,
        { query: { fields: "access_token,name" } }
      );
      return data.access_token?.trim() || this.accessToken;
    } catch {
      return this.accessToken;
    }
  }

  async fetchInstagramPostMetrics(
    igMediaId: string,
    tryInsights = true
  ): Promise<PostChannelOrganicMetrics> {
    const cleanId = igMediaId.trim();
    const basic = await this.request<{
      id: string;
      like_count?: number;
      comments_count?: number;
      permalink?: string;
    }>(`/${cleanId}`, {
      query: {
        fields: "id,like_count,comments_count,media_type,media_product_type,permalink",
      },
    });

    const metrics: PostChannelOrganicMetrics = {
      likes: Number(basic.like_count || 0),
      comments: Number(basic.comments_count || 0),
      views: null,
      reach: null,
      saved: null,
      shares: null,
      permalink: basic.permalink || null,
      insights_available: false,
      error: null,
    };

    if (!tryInsights) {
      return metrics;
    }

    const extractInsightValue = (
      items: Array<{ name?: string; values?: Array<{ value?: number }> }> | undefined,
      metricName: string
    ): number | null => {
      const found = (items || []).find((m) => m.name === metricName);
      const val = found?.values?.[0]?.value;
      return typeof val === "number" && Number.isFinite(val) ? val : null;
    };

    for (const metricList of ["views,reach,saved,shares", "reach,saved,shares"]) {
      try {
        const ins = await this.request<{
          data?: Array<{ name?: string; values?: Array<{ value?: number }> }>;
        }>(`/${cleanId}/insights`, {
          query: { metric: metricList },
        });
        const items = ins.data || [];
        metrics.views = extractInsightValue(items, "views");
        metrics.reach = extractInsightValue(items, "reach");
        metrics.saved = extractInsightValue(items, "saved");
        metrics.shares = extractInsightValue(items, "shares");
        metrics.insights_available = true;
        break;
      } catch {
        // segue para fallback ou mantém likes/comments básicos
      }
    }

    return metrics;
  }

  async fetchFacebookPostMetrics(params: {
    fbPageId?: string | null;
    fbPostId: string;
    pageAccessToken?: string | null;
    tryInsights?: boolean;
  }): Promise<PostChannelOrganicMetrics> {
    const storyId = normalizeFbObjectStoryId(
      params.fbPageId || "",
      params.fbPostId
    );
    const token = params.pageAccessToken?.trim() || this.accessToken;

    const basic = await this.requestWithToken<{
      id: string;
      permalink_url?: string;
      attachments?: FacebookPostPermalinkFields["attachments"];
      shares?: { count?: number };
      reactions?: { summary?: { total_count?: number } };
      comments?: { summary?: { total_count?: number } };
    }>(`/${storyId}`, token, {
      fields:
        "id,permalink_url,attachments{url,unshimmed_url,target{url},subattachments{url,unshimmed_url,target{url}}},shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)",
    });

    const metrics: PostChannelOrganicMetrics = {
      likes: Number(basic.reactions?.summary?.total_count || 0),
      comments: Number(basic.comments?.summary?.total_count || 0),
      views: null,
      reach: null,
      saved: null,
      shares:
        basic.shares?.count !== undefined
          ? Number(basic.shares.count || 0)
          : null,
      permalink: extractFacebookWorkingUrl(basic),
      insights_available: false,
      error: null,
    };

    if (params.tryInsights === false) {
      return metrics;
    }

    const extractInsightValue = (
      items: Array<{ name?: string; values?: Array<{ value?: number }> }> | undefined,
      metricName: string
    ): number | null => {
      const found = (items || []).find((m) => m.name === metricName);
      const val = found?.values?.[0]?.value;
      return typeof val === "number" && Number.isFinite(val) ? val : null;
    };

    for (const metricList of [
      "post_media_view,post_impressions_unique",
      "post_impressions,post_impressions_unique",
    ]) {
      try {
        const ins = await this.requestWithToken<{
          data?: Array<{ name?: string; values?: Array<{ value?: number }> }>;
        }>(`/${storyId}/insights`, token, { metric: metricList });
        const items = ins.data || [];
        const mediaView = extractInsightValue(items, "post_media_view");
        const impressions = extractInsightValue(items, "post_impressions");
        const reach = extractInsightValue(items, "post_impressions_unique");
        metrics.views = mediaView ?? impressions ?? null;
        metrics.reach = reach;
        metrics.insights_available = true;
        break;
      } catch {
        // mantém likes/comments/shares básicos
      }
    }

    return metrics;
  }

  async fetchInstagramPermalink(igMediaId: string): Promise<string | null> {
    const cleanId = igMediaId.trim();
    if (!cleanId) return null;
    const data = await this.request<{ permalink?: string }>(`/${cleanId}`, {
      query: { fields: "permalink" },
    });
    return data.permalink?.trim() || null;
  }

  async fetchFacebookPermalink(params: {
    fbPageId?: string | null;
    fbPostId: string;
    pageAccessToken?: string | null;
  }): Promise<string> {
    const storyId = normalizeFbObjectStoryId(
      params.fbPageId || "",
      params.fbPostId
    );
    const underscoreIdx = storyId.indexOf("_");
    const pagePart =
      underscoreIdx > 0 ? storyId.slice(0, underscoreIdx) : "";
    const postPart =
      underscoreIdx > 0 ? storyId.slice(underscoreIdx + 1) : storyId;
    const fallbackUrl = pagePart
      ? `https://www.facebook.com/${encodeURIComponent(pagePart)}`
      : `https://www.facebook.com/photo/?fbid=${encodeURIComponent(storyId)}`;
    const token = params.pageAccessToken?.trim() || this.accessToken;

    // Tentativa 1: Post node + attachments (photo.php?fbid=... abre com HTTP 200 em Páginas NPE)
    try {
      const data = await this.requestWithToken<FacebookPostPermalinkFields>(
        `/${storyId}`,
        token,
        {
          fields:
            "permalink_url,attachments{url,unshimmed_url,target{url},subattachments{url,unshimmed_url,target{url}}}",
        }
      );
      const working = extractFacebookWorkingUrl(data);
      if (working) {
        return working;
      }
    } catch {
      // tenta node alternativo da foto/post abaixo
    }

    // Tentativa 2: Photo node / postPart
    if (postPart) {
      try {
        const photoData = await this.requestWithToken<{
          link?: string;
          permalink_url?: string;
          page_story_id?: string;
        }>(`/${postPart}`, token, {
          fields: "link,permalink_url,page_story_id",
        });
        if (
          photoData.permalink_url &&
          !isBrokenFacebookPermalink(photoData.permalink_url)
        ) {
          return photoData.permalink_url.trim();
        }
        if (photoData.link && !isBrokenFacebookPermalink(photoData.link)) {
          return photoData.link.trim();
        }
        if (photoData.page_story_id?.trim()) {
          const storyData = await this.requestWithToken<{
            permalink_url?: string;
          }>(`/${photoData.page_story_id.trim()}`, token, {
            fields: "permalink_url",
          });
          if (
            storyData.permalink_url &&
            !isBrokenFacebookPermalink(storyData.permalink_url)
          ) {
            return storyData.permalink_url.trim();
          }
        }
      } catch {
        // segue para fallback seguro da Página
      }
    }

    return fallbackUrl;
  }

  async listAdAccounts(): Promise<MetaAdAccountSummary[]> {
    type RawMetaAdAccount = {
      id: string;
      name?: string;
      currency?: string;
      account_status?: number;
      business_name?: string;
      business?: { id?: string; name?: string };
    };

    let data: { data?: RawMetaAdAccount[] };
    try {
      data = await this.request<{ data?: RawMetaAdAccount[] }>("/me/adaccounts", {
        query: {
          fields: "id,name,currency,account_status,business_name,business{id,name}",
          limit: 100,
        },
      });
    } catch {
      data = await this.request<{ data?: RawMetaAdAccount[] }>("/me/adaccounts", {
        query: {
          fields: "id,name,currency,account_status,business_name",
          limit: 100,
        },
      });
    }

    return (data.data || []).map((acc) => {
      const statusCode = Number(acc.account_status ?? 0);
      const businessId = acc.business?.id?.trim() || null;
      const businessName =
        acc.business?.name?.trim() || acc.business_name?.trim() || null;
      return {
        id: normalizeAdAccountId(acc.id),
        name: acc.name?.trim() || acc.id,
        currency: (acc.currency || "BRL").toUpperCase(),
        account_status: statusCode,
        business_id: businessId,
        business_name: businessName,
        ownership_type:
          businessId || businessName ? "OWNED" : "PERSONAL",
        is_active: statusCode === 1,
      };
    });
  }

  async listBusinessesWithAdAccounts(): Promise<{
    businesses: Array<{ id: string; name: string; ad_account_count: number }>;
    accounts: MetaAdAccountSummary[];
  }> {
    type RawMetaAdAccount = {
      id: string;
      name?: string;
      currency?: string;
      account_status?: number;
      business_name?: string;
      business?: { id?: string; name?: string };
    };

    const [meAccounts, bmListResp] = await Promise.all([
      this.listAdAccounts(),
      this.request<{ data?: Array<{ id: string; name?: string }> }>(
        "/me/businesses",
        {
          query: {
            fields: "id,name",
            limit: 50,
          },
        }
      ).catch(() => ({ data: [] as Array<{ id: string; name?: string }> })),
    ]);

    const accountMap = new Map<string, MetaAdAccountSummary>();
    for (const acc of meAccounts) {
      accountMap.set(acc.id, acc);
    }

    const businessMap = new Map<string, { id: string; name: string }>();
    for (const acc of meAccounts) {
      if (acc.business_id) {
        businessMap.set(acc.business_id, {
          id: acc.business_id,
          name: acc.business_name || `BM ${acc.business_id}`,
        });
      }
    }

    const remoteBusinesses = (bmListResp.data || []).slice(0, 15);
    for (const bm of remoteBusinesses) {
      if (bm.id) {
        businessMap.set(bm.id, {
          id: bm.id,
          name: bm.name?.trim() || `BM ${bm.id}`,
        });
      }
    }

    const mapBmRawAccount = (
      raw: RawMetaAdAccount,
      bm: { id: string; name?: string },
      ownershipType: "OWNED" | "CLIENT"
    ): MetaAdAccountSummary => {
      const normalizedId = normalizeAdAccountId(raw.id);
      const statusCode = Number(raw.account_status ?? 0);
      return {
        id: normalizedId,
        name: raw.name?.trim() || raw.id,
        currency: (raw.currency || "BRL").toUpperCase(),
        account_status: statusCode,
        business_id: raw.business?.id?.trim() || bm.id,
        business_name:
          bm.name?.trim() ||
          raw.business?.name?.trim() ||
          raw.business_name?.trim() ||
          `BM ${bm.id}`,
        ownership_type: ownershipType,
        is_active: statusCode === 1,
      };
    };

    await Promise.all(
      remoteBusinesses.map(async (bm) => {
        if (!bm.id) return;
        const [ownedResp, clientResp] = await Promise.all([
          this.request<{ data?: RawMetaAdAccount[] }>(
            `/${encodeURIComponent(bm.id)}/owned_ad_accounts`,
            {
              query: {
                fields:
                  "id,name,currency,account_status,business_name,business{id,name}",
                limit: 100,
              },
            }
          ).catch(() => ({ data: [] as RawMetaAdAccount[] })),
          this.request<{ data?: RawMetaAdAccount[] }>(
            `/${encodeURIComponent(bm.id)}/client_ad_accounts`,
            {
              query: {
                fields:
                  "id,name,currency,account_status,business_name,business{id,name}",
                limit: 100,
              },
            }
          ).catch(() => ({ data: [] as RawMetaAdAccount[] })),
        ]);

        for (const raw of ownedResp.data || []) {
          const mapped = mapBmRawAccount(raw, bm, "OWNED");
          const prev = accountMap.get(mapped.id);
          accountMap.set(mapped.id, {
            ...prev,
            ...mapped,
            business_id: mapped.business_id || prev?.business_id || null,
            business_name: mapped.business_name || prev?.business_name || null,
          });
        }

        for (const raw of clientResp.data || []) {
          const mapped = mapBmRawAccount(raw, bm, "CLIENT");
          const prev = accountMap.get(mapped.id);
          accountMap.set(mapped.id, {
            ...prev,
            ...mapped,
            business_id: mapped.business_id || prev?.business_id || null,
            business_name: mapped.business_name || prev?.business_name || null,
          });
        }
      })
    );

    const accounts = Array.from(accountMap.values());
    for (const acc of accounts) {
      if (acc.business_id && !businessMap.has(acc.business_id)) {
        businessMap.set(acc.business_id, {
          id: acc.business_id,
          name: acc.business_name || `BM ${acc.business_id}`,
        });
      }
    }

    const businesses = Array.from(businessMap.values()).map((bm) => ({
      id: bm.id,
      name: bm.name,
      ad_account_count: accounts.filter((a) => a.business_id === bm.id).length,
    }));

    return { businesses, accounts };
  }

  async searchGeoLocations(
    query: string,
    options: {
      locationTypes?: Array<
        "city" | "region" | "country" | "neighborhood" | "subcity" | "zip"
      >;
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

  private normalizeTargeting(
    input?: MetaTargetingInput,
    options?: {
      hasInstagram?: boolean;
      fbPositions?: string[];
      igPositions?: string[];
    }
  ): Record<string, unknown> {
    const ageMin = Math.max(18, Math.min(65, Math.round(input?.age_min ?? 18)));
    const ageMax = Math.max(ageMin, Math.min(65, Math.round(input?.age_max ?? 65)));

    const rawGeo = input?.geo_locations;
    const hasCustomGeo = Boolean(
      (rawGeo?.cities && rawGeo.cities.length > 0) ||
        (rawGeo?.regions && rawGeo.regions.length > 0) ||
        (rawGeo?.neighborhoods && rawGeo.neighborhoods.length > 0) ||
        (rawGeo?.subcities && rawGeo.subcities.length > 0) ||
        (rawGeo?.zips && rawGeo.zips.length > 0) ||
        (rawGeo?.custom_locations && rawGeo.custom_locations.length > 0) ||
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

    // Define explicitamente posicionamentos compatíveis com imagem (sem instream_video nem audience_network)
    if (input?.publisher_platforms && input.publisher_platforms.length > 0) {
      targeting.publisher_platforms = input.publisher_platforms;
      if (input.facebook_positions) {
        targeting.facebook_positions = input.facebook_positions;
      }
      if (input.instagram_positions) {
        targeting.instagram_positions = input.instagram_positions;
      }
    } else {
      const includeIg = options?.hasInstagram !== false;
      targeting.publisher_platforms = includeIg
        ? ["facebook", "instagram"]
        : ["facebook"];
      targeting.facebook_positions =
        options?.fbPositions || IMAGE_SAFE_FB_POSITIONS;
      if (includeIg) {
        targeting.instagram_positions =
          options?.igPositions || IMAGE_SAFE_IG_POSITIONS;
      }
    }

    return targeting;
  }

  async applyImageSafePlacementsToAdSet(
    adsetId: string,
    hasInstagram = true
  ): Promise<{
    updated: boolean;
    fbPositions: string[];
    igPositions: string[];
  }> {
    const cleanId = adsetId.trim();
    if (!cleanId) {
      throw new Error("meta_adset_id não informado.");
    }

    const data = await this.request<{ targeting?: Record<string, unknown> }>(
      `/${encodeURIComponent(cleanId)}`,
      { query: { fields: "targeting" } }
    );
    const baseTargeting: Record<string, unknown> = {
      ...(data.targeting || {}),
    };
    delete baseTargeting.audience_network_positions;
    delete baseTargeting.messenger_positions;
    delete baseTargeting.device_platforms;

    const platforms = hasInstagram ? ["facebook", "instagram"] : ["facebook"];
    const buildPayload = (fbPos: string[], igPos: string[]) => ({
      ...baseTargeting,
      publisher_platforms: platforms,
      facebook_positions: fbPos,
      ...(hasInstagram ? { instagram_positions: igPos } : {}),
    });

    try {
      await this.request(`/${encodeURIComponent(cleanId)}`, {
        method: "POST",
        body: {
          targeting: buildPayload(
            IMAGE_SAFE_FB_POSITIONS,
            IMAGE_SAFE_IG_POSITIONS
          ),
        },
      });
      return {
        updated: true,
        fbPositions: IMAGE_SAFE_FB_POSITIONS,
        igPositions: hasInstagram ? IMAGE_SAFE_IG_POSITIONS : [],
      };
    } catch {
      await this.request(`/${encodeURIComponent(cleanId)}`, {
        method: "POST",
        body: {
          targeting: buildPayload(
            IMAGE_SAFE_FB_POSITIONS_FALLBACK,
            IMAGE_SAFE_IG_POSITIONS_FALLBACK
          ),
        },
      });
      return {
        updated: true,
        fbPositions: IMAGE_SAFE_FB_POSITIONS_FALLBACK,
        igPositions: hasInstagram ? IMAGE_SAFE_IG_POSITIONS_FALLBACK : [],
      };
    }
  }

  async checkPageWhatsappNumber(fbPageId: string): Promise<string | null> {
    const cleanPage = fbPageId.trim();
    if (!cleanPage) return null;
    try {
      const data = await this.request<{ whatsapp_number?: string }>(
        `/${cleanPage}`,
        { query: { fields: "whatsapp_number" } }
      );
      return data.whatsapp_number?.trim() || null;
    } catch {
      return null;
    }
  }

  async listAdPixels(adAccountId: string): Promise<MetaAdPixelSummary[]> {
    const cleanAccountId = normalizeAdAccountId(adAccountId);
    if (!cleanAccountId) return [];
    const data = await this.request<{
      data?: Array<{
        id?: string;
        name?: string;
        is_unavailable?: boolean;
      }>;
    }>(`/${cleanAccountId}/adspixels`, {
      query: { fields: "id,name,is_unavailable", limit: 50 },
    });

    return (data.data || [])
      .filter((px) => Boolean(px.id))
      .map((px) => ({
        id: String(px.id),
        name: px.name?.trim() || `Pixel ${px.id}`,
        is_unavailable: Boolean(px.is_unavailable),
      }));
  }

  async uploadAdImageFromUrl(
    adAccountId: string,
    imageUrl: string
  ): Promise<string | null> {
    const cleanAccountId = normalizeAdAccountId(adAccountId);
    const cleanUrl = imageUrl.trim();
    if (!cleanAccountId || !cleanUrl) return null;

    try {
      const imgRes = await fetch(cleanUrl, {
        signal: AbortSignal.timeout(20000),
      });
      if (!imgRes.ok) return null;
      const arrBuf = await imgRes.arrayBuffer();
      const base64 = Buffer.from(arrBuf).toString("base64");
      if (!base64) return null;

      const uploadRes = await this.request<{
        images?: Record<string, { hash?: string }>;
      }>(`/${cleanAccountId}/adimages`, {
        method: "POST",
        body: { bytes: base64 },
      });

      const firstEntry = uploadRes.images
        ? Object.values(uploadRes.images).find((item) => Boolean(item?.hash))
        : null;
      return firstEntry?.hash?.trim() || null;
    } catch {
      return null;
    }
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

    if (!fbPageId) {
      throw new Error(
        "Página do Facebook (fb_page_id) não configurada nas Integrações desta empresa."
      );
    }

    let sourceStoryId = "";
    if (fbPostId) {
      sourceStoryId = normalizeFbObjectStoryId(fbPageId, fbPostId);
    } else if (igMediaId) {
      sourceStoryId = igMediaId;
    }

    const stepsLog: string[] = [];
    let effectiveObjective: MetaAdObjective = input.objective;
    let effectiveGoal = input.optimizationGoal || "LINK_CLICKS";
    let effectiveDestination = input.destinationType?.trim().toUpperCase() || null;
    const cleanDestUrl = input.destinationUrl?.trim() || null;

    if (effectiveDestination === "WHATSAPP") {
      // Na API v26.0, Click-to-WhatsApp exige OUTCOME_ENGAGEMENT + CONVERSATIONS.
      // Não bloqueamos previamente por fields=whatsapp_number porque o token pode omitir esse campo mesmo quando a Página já tem WhatsApp vinculado.
      effectiveObjective = "OUTCOME_ENGAGEMENT";
      effectiveGoal = "CONVERSATIONS";
    }

    if (effectiveObjective === "OUTCOME_TRAFFIC" && !cleanDestUrl) {
      throw new Error(
        "Para campanhas de Tráfego, informe o Link Destino (site ou https://wa.me/55...) antes de criar a campanha."
      );
    }

    const partialIds: {
      campaignId?: string;
      adsetId?: string;
      creativeId?: string;
    } = {};

    const attachPartialIds = async (err: unknown): Promise<never> => {
      if (partialIds.campaignId) {
        await this.toggleEntityStatus(partialIds.campaignId, "ARCHIVED").catch(
          () => null
        );
      }
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

    const createCampaignAndAdSet = async (): Promise<{
      campaignId: string;
      adsetId: string;
    }> => {
      const cRes = await this.request<{ id: string }>(
        `/${adAccountId}/campaigns`,
        {
          method: "POST",
          body: {
            name: input.name.trim(),
            objective: effectiveObjective,
            status: "PAUSED",
            special_ad_categories: [],
            is_adset_budget_sharing_enabled: false,
          },
        }
      );
      partialIds.campaignId = cRes.id;
      stepsLog.push(
        `Passo 1 concluído: Campaign ${cRes.id} (${effectiveObjective} • PAUSED)`
      );

      const adsetPayload: Record<string, unknown> = {
        name: `${input.name.trim()} — AdSet`,
        campaign_id: cRes.id,
        daily_budget: String(budgetCents),
        billing_event: "IMPRESSIONS",
        optimization_goal: effectiveGoal,
        bid_strategy: "LOWEST_COST_WITHOUT_CAP",
        targeting: this.normalizeTargeting(input.targeting, {
          hasInstagram: Boolean(igUserId),
        }),
        status: "PAUSED",
      };

      if (effectiveDestination) {
        adsetPayload.destination_type = effectiveDestination;
      }

      const needsPagePromotedObject =
        effectiveObjective === "OUTCOME_LEADS" ||
        effectiveObjective === "OUTCOME_ENGAGEMENT" ||
        effectiveDestination === "WHATSAPP" ||
        effectiveDestination === "MESSENGER" ||
        effectiveDestination === "INSTAGRAM_DIRECT";

      if (needsPagePromotedObject && fbPageId) {
        adsetPayload.promoted_object = { page_id: fbPageId };
      }

      const parsedStart = input.startTime?.trim()
        ? new Date(input.startTime.trim())
        : null;
      const validStart =
        parsedStart && !Number.isNaN(parsedStart.getTime()) ? parsedStart : null;
      const parsedEnd = input.endTime?.trim()
        ? new Date(input.endTime.trim())
        : null;
      const validEnd =
        parsedEnd && !Number.isNaN(parsedEnd.getTime()) ? parsedEnd : null;

      if (input.noEndDate) {
        if (validStart) {
          adsetPayload.start_time = validStart.toISOString();
        }
      } else if (validEnd) {
        const effectiveStart = validStart || new Date();
        if (validEnd.getTime() <= effectiveStart.getTime() + 60_000) {
          throw new Error(
            "A data/hora de término deve ser posterior à data/hora de início."
          );
        }
        adsetPayload.start_time = effectiveStart.toISOString();
        adsetPayload.end_time = validEnd.toISOString();
      } else if (input.durationDays && input.durationDays > 0) {
        const effectiveStart = validStart || new Date();
        const end = new Date(
          effectiveStart.getTime() +
            Math.round(input.durationDays) * 24 * 60 * 60 * 1000
        );
        adsetPayload.start_time = effectiveStart.toISOString();
        adsetPayload.end_time = end.toISOString();
      } else if (validStart) {
        adsetPayload.start_time = validStart.toISOString();
      }

      let aRes: { id: string };
      try {
        aRes = await this.request<{ id: string }>(`/${adAccountId}/adsets`, {
          method: "POST",
          body: adsetPayload,
        });
      } catch (adsetErr) {
        const msg = adsetErr instanceof Error ? adsetErr.message : "";
        if (/position|placement|reels|explore/i.test(msg)) {
          adsetPayload.targeting = this.normalizeTargeting(input.targeting, {
            hasInstagram: Boolean(igUserId),
            fbPositions: IMAGE_SAFE_FB_POSITIONS_FALLBACK,
            igPositions: IMAGE_SAFE_IG_POSITIONS_FALLBACK,
          });
          aRes = await this.request<{ id: string }>(`/${adAccountId}/adsets`, {
            method: "POST",
            body: adsetPayload,
          });
        } else {
          throw adsetErr;
        }
      }
      return { campaignId: cRes.id, adsetId: aRes.id };
    };

    let campaignRes: { id: string };
    let adsetRes: { id: string };
    try {
      const pair = await createCampaignAndAdSet();
      campaignRes = { id: pair.campaignId };
      adsetRes = { id: pair.adsetId };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const isWhatsappLinkIssue =
        effectiveDestination === "WHATSAPP" &&
        /whatsapp|phone|telefone|número|numero/i.test(errMsg);

      if (isWhatsappLinkIssue && cleanDestUrl) {
        if (partialIds.campaignId) {
          await this.toggleEntityStatus(partialIds.campaignId, "ARCHIVED").catch(
            () => null
          );
          partialIds.campaignId = undefined;
        }
        effectiveObjective = "OUTCOME_TRAFFIC";
        effectiveGoal = "LINK_CLICKS";
        effectiveDestination = "WEBSITE";
        stepsLog.push(
          "WhatsApp Business nativo indisponível na Página: recriando como Tráfego para o Link Destino informado."
        );
        try {
          const fallbackPair = await createCampaignAndAdSet();
          campaignRes = { id: fallbackPair.campaignId };
          adsetRes = { id: fallbackPair.adsetId };
        } catch (fallbackErr) {
          return await attachPartialIds(fallbackErr);
        }
      } else if (isWhatsappLinkIssue && !cleanDestUrl) {
        if (partialIds.campaignId) {
          await this.toggleEntityStatus(partialIds.campaignId, "ARCHIVED").catch(
            () => null
          );
          partialIds.campaignId = undefined;
        }
        throw new Error(
          `A Meta informou que a Página ainda não liberou o WhatsApp Business para anúncios (${errMsg}). Preencha o campo 'Link Destino' com https://wa.me/55... para rodar apontando direto para seu WhatsApp.`
        );
      } else {
        return await attachPartialIds(err);
      }
    }

    partialIds.adsetId = adsetRes.id;
    stepsLog.push(`Passo 2 concluído: AdSet ${adsetRes.id} (PAUSED)`);

    // Passo 3 & 4 — AdCreative + Ad compatíveis com o objetivo ODAX v26.0 (suporta 1 ou N criativos no mesmo AdSet)
    const itemsToCreate: MetaCreativeItemInput[] =
      input.creatives && input.creatives.length > 0
        ? input.creatives
        : [
            {
              fbPostId,
              igMediaId,
              postImageUrl: input.postImageUrl || null,
              postStoryImageUrl: input.postStoryImageUrl || null,
              postHeadline: input.postHeadline || null,
              postCaption: input.postCaption || null,
              welcomeGreeting: input.welcomeGreeting || null,
              welcomeAutofill: input.welcomeAutofill || null,
            },
          ];

    const createdAds: CreatedMetaAdItem[] = [];
    for (let i = 0; i < itemsToCreate.length; i += 1) {
      const adResult = await this.createAdInAdSet({
        adAccountId,
        adsetId: adsetRes.id,
        campaignName: input.name,
        objective: effectiveObjective,
        destinationType: effectiveDestination,
        fbPageId,
        igUserId,
        destinationUrl: cleanDestUrl,
        pixelId: input.pixelId,
        urlTags: input.urlTags,
        item: itemsToCreate[i],
        itemIndex: itemsToCreate.length > 1 ? i + 1 : undefined,
      });
      createdAds.push(adResult);
      stepsLog.push(...adResult.stepsLog);
    }

    const firstSuccess = createdAds.find(
      (a) => a.status === "PAUSED" && Boolean(a.adId) && Boolean(a.creativeId)
    );
    if (!firstSuccess || !firstSuccess.adId || !firstSuccess.creativeId) {
      const firstErrMsg =
        createdAds.find((a) => a.errorMessage)?.errorMessage ||
        "Falha ao criar o(s) anúncio(s) na Meta Ads.";
      return await attachPartialIds(new Error(firstErrMsg));
    }

    return {
      adAccountId,
      sourceStoryId: firstSuccess.sourceStoryId || sourceStoryId,
      campaignId: campaignRes.id,
      adsetId: adsetRes.id,
      creativeId: firstSuccess.creativeId,
      adId: firstSuccess.adId,
      status: "PAUSED",
      stepsLog,
      createdAds,
    };
  }

  async createAdInAdSet(params: {
    adAccountId: string;
    adsetId: string;
    campaignName: string;
    objective: MetaAdObjective;
    destinationType?: string | null;
    fbPageId: string;
    igUserId?: string | null;
    destinationUrl?: string | null;
    pixelId?: string | null;
    urlTags?: string | null;
    item: MetaCreativeItemInput;
    itemIndex?: number;
  }): Promise<CreatedMetaAdItem> {
    const adAccountId = normalizeAdAccountId(params.adAccountId);
    const fbPageId = params.fbPageId.trim();
    const igUserId = params.igUserId?.trim() || "";
    const fbPostId = params.item.fbPostId?.trim() || "";
    const igMediaId = params.item.igMediaId?.trim() || "";
    const sourceStoryId = fbPostId
      ? normalizeFbObjectStoryId(fbPageId, fbPostId)
      : igMediaId || "";
    const postImg = params.item.postImageUrl?.trim() || "";
    const postStoryImg = params.item.postStoryImageUrl?.trim() || "";
    const cleanDestUrl = params.destinationUrl?.trim() || null;
    const cleanUrlTags = params.urlTags?.trim() || "";
    const effectiveObjective = params.objective;
    const effectiveDestination =
      params.destinationType?.trim().toUpperCase() || null;

    const isMessagingDest =
      effectiveDestination === "WHATSAPP" ||
      effectiveDestination === "MESSENGER" ||
      effectiveDestination === "INSTAGRAM_DIRECT";
    const isPureEngagement =
      effectiveObjective === "OUTCOME_ENGAGEMENT" && !isMessagingDest;

    const headline = (params.item.postHeadline || params.campaignName)
      .trim()
      .slice(0, 90);
    const primaryText = (
      params.item.postCaption ||
      headline ||
      params.campaignName
    ).trim();
    const idxTag = params.itemIndex ? ` #${params.itemIndex}` : "";
    const adName = (
      params.item.adName?.trim() ||
      `${params.campaignName.trim()} — Ad${idxTag}${
        headline ? ` (${headline.slice(0, 28)})` : ""
      }`
    ).slice(0, 120);

    const stepsLog: string[] = [];
    let partialCreativeId: string | null = null;

    const buildLinkSpecCreativePayload = (
      welcomePlacement: "link_data" | "story_spec" | "none" = "link_data"
    ): Record<string, unknown> => {
      const targetLink =
        effectiveDestination === "WHATSAPP"
          ? "https://api.whatsapp.com/send"
          : cleanDestUrl || "https://www.facebook.com/";
      const cta =
        effectiveDestination === "WHATSAPP"
          ? {
              type: "WHATSAPP_MESSAGE",
              value: {
                app_destination: "WHATSAPP",
                link: "https://api.whatsapp.com/send",
              },
            }
          : {
              type: "LEARN_MORE",
              value: { link: targetLink },
            };

      const linkData: Record<string, unknown> = {
        link: targetLink,
        message: primaryText,
        name: headline,
        call_to_action: cta,
      };
      if (postImg) {
        linkData.picture = postImg;
      }

      const greeting = params.item.welcomeGreeting?.trim() || "";
      const autofill = params.item.welcomeAutofill?.trim() || "";
      const shouldSendWelcome =
        welcomePlacement !== "none" &&
        effectiveDestination === "WHATSAPP" &&
        Boolean(greeting || autofill);

      const serializedWelcome = shouldSendWelcome
        ? JSON.stringify({
            type: "VISUAL_EDITOR",
            version: 2,
            landing_screen_type: "welcome_message",
            media_type: "text",
            text_format: {
              customer_action_type: "autofill_message",
              message: {
                text: greeting || "Oi! Como podemos ajudar?",
                autofill_message: {
                  content:
                    autofill ||
                    "Olá! Gostaria de mais informações sobre este anúncio.",
                },
              },
            },
          })
        : null;

      if (serializedWelcome && welcomePlacement === "link_data") {
        linkData.page_welcome_message = serializedWelcome;
      }

      return {
        name: `${adName} — Creative Link`,
        ...(cleanUrlTags ? { url_tags: cleanUrlTags } : {}),
        object_story_spec: {
          page_id: fbPageId,
          ...(igUserId ? { instagram_user_id: igUserId } : {}),
          ...(serializedWelcome && welcomePlacement === "story_spec"
            ? { page_welcome_message: serializedWelcome }
            : {}),
          link_data: linkData,
        },
      };
    };

    const createLinkSpecCreativeSafe = async (): Promise<{ id: string }> => {
      const hasWelcome =
        effectiveDestination === "WHATSAPP" &&
        Boolean(
          params.item.welcomeGreeting?.trim() ||
            params.item.welcomeAutofill?.trim()
        );
      if (!hasWelcome) {
        return await this.request<{ id: string }>(
          `/${adAccountId}/adcreatives`,
          {
            method: "POST",
            body: buildLinkSpecCreativePayload("none"),
          }
        );
      }

      try {
        return await this.request<{ id: string }>(
          `/${adAccountId}/adcreatives`,
          {
            method: "POST",
            body: buildLinkSpecCreativePayload("link_data"),
          }
        );
      } catch {
        try {
          return await this.request<{ id: string }>(
            `/${adAccountId}/adcreatives`,
            {
              method: "POST",
              body: buildLinkSpecCreativePayload("story_spec"),
            }
          );
        } catch {
          stepsLog.push(
            `Aviso (${adName}): Meta rejeitou page_welcome_message personalizado; recriando com mensagem padrão.`
          );
          return await this.request<{ id: string }>(
            `/${adAccountId}/adcreatives`,
            {
              method: "POST",
              body: buildLinkSpecCreativePayload("none"),
            }
          );
        }
      }
    };

    const createAdWithTracking = async (
      creativeId: string
    ): Promise<{ id: string }> => {
      const cleanPixel = params.pixelId?.trim() || "";
      const baseAdBody: Record<string, unknown> = {
        name: adName,
        adset_id: params.adsetId,
        creative: { creative_id: creativeId },
        status: "PAUSED",
      };

      if (!cleanPixel) {
        return await this.request<{ id: string }>(`/${adAccountId}/ads`, {
          method: "POST",
          body: baseAdBody,
        });
      }

      try {
        const res = await this.request<{ id: string }>(`/${adAccountId}/ads`, {
          method: "POST",
          body: {
            ...baseAdBody,
            tracking_specs: [
              {
                "action.type": ["offsite_conversion"],
                fb_pixel: [cleanPixel],
              },
            ],
          },
        });
        stepsLog.push(
          `Rastreamento vinculado (${adName}): Pixel ${cleanPixel}${
            cleanUrlTags ? " + UTM tags" : ""
          }`
        );
        return res;
      } catch {
        stepsLog.push(
          `Aviso (${adName}): Meta não aplicou tracking_specs do Pixel ${cleanPixel}; anúncio criado sem pixel explícito.`
        );
        return await this.request<{ id: string }>(`/${adAccountId}/ads`, {
          method: "POST",
          body: baseAdBody,
        });
      }
    };

    const buildOrganicCreativePayload = (): Record<string, unknown> => {
      if (fbPostId) {
        return {
          name: `${adName} — Creative Meta`,
          object_story_id: normalizeFbObjectStoryId(fbPageId, fbPostId),
          ...(cleanUrlTags ? { url_tags: cleanUrlTags } : {}),
        };
      }

      if (igUserId && igMediaId) {
        const payload: Record<string, unknown> = {
          name: `${adName} — Creative IG`,
          object_id: fbPageId,
          instagram_user_id: igUserId,
          source_instagram_media_id: igMediaId,
          ...(cleanUrlTags ? { url_tags: cleanUrlTags } : {}),
        };

        if (!isPureEngagement) {
          if (effectiveDestination === "WHATSAPP") {
            payload.call_to_action = {
              type: "WHATSAPP_MESSAGE",
              value: {
                app_destination: "WHATSAPP",
                link: "https://api.whatsapp.com/send",
              },
            };
          } else if (cleanDestUrl && effectiveObjective === "OUTCOME_TRAFFIC") {
            payload.call_to_action = {
              type: "LEARN_MORE",
              value: { link: cleanDestUrl },
            };
          }
        }
        return payload;
      }

      throw new Error(
        "Post orgânico sem publicação vinculada no Facebook/Instagram para campanha de engajamento puro."
      );
    };

    const preferLinkSpecDirect = !isPureEngagement && Boolean(postImg);

    const tryCreatePlacementCustomizedCreative = async (): Promise<{
      creativeRes: { id: string };
      adRes: { id: string };
    } | null> => {
      if (
        !preferLinkSpecDirect ||
        effectiveDestination === "WHATSAPP" ||
        !postStoryImg ||
        postStoryImg === postImg
      ) {
        return null;
      }

      const [feedHash, storyHash] = await Promise.all([
        this.uploadAdImageFromUrl(adAccountId, postImg),
        this.uploadAdImageFromUrl(adAccountId, postStoryImg),
      ]);

      if (!feedHash || !storyHash) {
        return null;
      }

      try {
        const customCreative = await this.request<{ id: string }>(
          `/${adAccountId}/adcreatives`,
          {
            method: "POST",
            body: {
              name: `${adName} — Creative Placement (Feed + Story)`,
              ...(cleanUrlTags ? { url_tags: cleanUrlTags } : {}),
              object_story_spec: {
                page_id: fbPageId,
                ...(igUserId ? { instagram_user_id: igUserId } : {}),
              },
              asset_feed_spec: {
                ad_formats: ["SINGLE_IMAGE"],
                call_to_action_types: ["LEARN_MORE"],
                link_urls: [
                  {
                    website_url: cleanDestUrl || "https://www.facebook.com/",
                  },
                ],
                images: [
                  {
                    hash: feedHash,
                    adlabels: [{ name: "pf_feed" }],
                  },
                  {
                    hash: storyHash,
                    adlabels: [{ name: "pf_story" }],
                  },
                ],
                titles: [{ text: headline }],
                bodies: [{ text: primaryText }],
                asset_customization_rules: [
                  {
                    priority: 1,
                    customization_spec: {
                      publisher_platforms: ["facebook", "instagram"],
                      facebook_positions: ["story", "facebook_reels"],
                      instagram_positions: ["story", "reels"],
                    },
                    image_label: { name: "pf_story" },
                  },
                  {
                    priority: 2,
                    customization_spec: {},
                    image_label: { name: "pf_feed" },
                  },
                ],
              },
            },
          }
        );

        partialCreativeId = customCreative.id;
        const customAd = await createAdWithTracking(customCreative.id);
        stepsLog.push(
          `Passo 3 concluído (${adName}): AdCreative ${customCreative.id} (Personalização por Posicionamento Feed 4:5 + Story 9:16)`
        );
        return { creativeRes: customCreative, adRes: customAd };
      } catch {
        partialCreativeId = null;
        stepsLog.push(
          `Aviso (${adName}): Personalização por Posicionamento recusada pela Meta para este objetivo; aplicando criativo padrão unificado.`
        );
        return null;
      }
    };

    try {
      let creativeRes: { id: string };
      let adRes: { id: string };

      if (preferLinkSpecDirect) {
        const placementCustomized =
          await tryCreatePlacementCustomizedCreative();
        if (placementCustomized) {
          creativeRes = placementCustomized.creativeRes;
          adRes = placementCustomized.adRes;
        } else {
          creativeRes = await createLinkSpecCreativeSafe();
          partialCreativeId = creativeRes.id;
          stepsLog.push(
            `Passo 3 concluído (${adName}): AdCreative ${creativeRes.id} (link_data com CTA compatível)`
          );
          adRes = await createAdWithTracking(creativeRes.id);
        }
      } else {
        try {
          creativeRes = await this.request<{ id: string }>(
            `/${adAccountId}/adcreatives`,
            {
              method: "POST",
              body: buildOrganicCreativePayload(),
            }
          );
          partialCreativeId = creativeRes.id;
          stepsLog.push(
            `Passo 3 concluído (${adName}): AdCreative ${creativeRes.id} (prova social preservada)`
          );
          adRes = await createAdWithTracking(creativeRes.id);
        } catch (primaryErr) {
          if (!isPureEngagement && Boolean(postImg)) {
            creativeRes = await createLinkSpecCreativeSafe();
            partialCreativeId = creativeRes.id;
            stepsLog.push(
              `Passo 3 fallback concluído (${adName}): AdCreative ${creativeRes.id} (link_data compatível com objetivo)`
            );
            adRes = await createAdWithTracking(creativeRes.id);
          } else {
            throw primaryErr;
          }
        }
      }

      stepsLog.push(`Passo 4 concluído: Ad ${adRes.id} (${adName} • PAUSED)`);
      return {
        postId: params.item.postId || null,
        adName,
        headline,
        primaryText,
        imageUrl: postImg || null,
        storyImageUrl: postStoryImg || null,
        sourceStoryId,
        creativeId: creativeRes.id,
        adId: adRes.id,
        status: "PAUSED",
        stepsLog,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      stepsLog.push(`Erro em ${adName}: ${msg}`);
      return {
        postId: params.item.postId || null,
        adName,
        headline,
        primaryText,
        imageUrl: postImg || null,
        storyImageUrl: postStoryImg || null,
        sourceStoryId,
        creativeId: partialCreativeId,
        adId: null,
        status: "ERROR",
        errorMessage: msg,
        stepsLog,
      };
    }
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

  async fetchEntitiesMetadata(
    ids: string[],
    fields: string
  ): Promise<Record<string, Record<string, unknown>>> {
    const uniqueIds = Array.from(
      new Set(ids.map((id) => id.trim()).filter(Boolean))
    );
    const out: Record<string, Record<string, unknown>> = {};
    if (uniqueIds.length === 0) return out;

    for (let i = 0; i < uniqueIds.length; i += 40) {
      const chunk = uniqueIds.slice(i, i + 40);
      try {
        const res = await this.request<Record<string, Record<string, unknown>>>(
          "/",
          {
            query: {
              ids: chunk.join(","),
              fields,
            },
          }
        );
        for (const [id, payload] of Object.entries(res || {})) {
          if (payload && typeof payload === "object") {
            out[id] = payload;
          }
        }
      } catch {
        // Se algum ID da lista foi apagado/restrito no Gerenciador, busca individualmente os restantes
        for (const singleId of chunk) {
          try {
            const item = await this.request<Record<string, unknown>>(
              `/${encodeURIComponent(singleId)}`,
              { query: { fields } }
            );
            if (item && typeof item === "object") {
              out[singleId] = item;
            }
          } catch {
            // ignora ID inacessível
          }
        }
      }
    }

    return out;
  }

  async listAdsInAdSet(adsetId: string): Promise<
    Array<{
      id: string;
      name: string;
      status?: string;
      effective_status?: string;
      creative?: {
        id?: string;
        title?: string;
        body?: string;
        image_url?: string;
        thumbnail_url?: string;
      };
    }>
  > {
    const cleanId = adsetId.trim();
    if (!cleanId) return [];
    const res = await this.request<{
      data?: Array<{
        id: string;
        name?: string;
        status?: string;
        effective_status?: string;
        creative?: {
          id?: string;
          title?: string;
          body?: string;
          image_url?: string;
          thumbnail_url?: string;
        };
      }>;
    }>(`/${encodeURIComponent(cleanId)}/ads`, {
      query: {
        fields:
          "id,name,status,effective_status,creative{id,title,body,image_url,thumbnail_url}",
        limit: 50,
      },
    });
    return (res.data || []).map((ad) => ({
      id: String(ad.id),
      name: ad.name?.trim() || `Ad ${ad.id}`,
      status: ad.status,
      effective_status: ad.effective_status,
      creative: ad.creative,
    }));
  }

  async updateCampaignFields(
    campaignId: string,
    fields: { name?: string }
  ): Promise<{ success: boolean }> {
    const cleanId = campaignId.trim();
    if (!cleanId) throw new Error("meta_campaign_id não informado.");
    const body: Record<string, unknown> = {};
    if (fields.name?.trim()) {
      body.name = fields.name.trim();
    }
    if (Object.keys(body).length === 0) return { success: true };
    const res = await this.request<{ success?: boolean }>(`/${cleanId}`, {
      method: "POST",
      body,
    });
    return { success: res.success !== false };
  }

  async fetchAdSetDetails(adsetId: string): Promise<{
    id: string;
    name: string;
    daily_budget_cents: number | null;
    start_time: string | null;
    end_time: string | null;
    status: string | null;
    targeting: Record<string, unknown>;
  } | null> {
    const cleanId = adsetId.trim();
    if (!cleanId) return null;
    const data = await this.request<{
      id?: string;
      name?: string;
      daily_budget?: string | number;
      start_time?: string;
      end_time?: string;
      status?: string;
      targeting?: Record<string, unknown>;
    }>(`/${encodeURIComponent(cleanId)}`, {
      query: {
        fields: "id,name,daily_budget,start_time,end_time,status,targeting",
      },
    });
    const parsedBudget = Number(data.daily_budget);
    return {
      id: String(data.id || cleanId),
      name: data.name?.trim() || "",
      daily_budget_cents:
        Number.isFinite(parsedBudget) && parsedBudget > 0
          ? Math.round(parsedBudget)
          : null,
      start_time: data.start_time || null,
      end_time: data.end_time || null,
      status: data.status || null,
      targeting:
        data.targeting && typeof data.targeting === "object"
          ? data.targeting
          : {},
    };
  }

  async updateAdSetFields(
    adsetId: string,
    fields: {
      name?: string;
      dailyBudgetCents?: number;
      currency?: string;
      targeting?: Record<string, unknown>;
      startTime?: string | null;
      endTime?: string | null;
      noEndDate?: boolean;
    }
  ): Promise<{ success: boolean }> {
    const cleanId = adsetId.trim();
    if (!cleanId) throw new Error("meta_adset_id não informado.");
    const body: Record<string, unknown> = {};
    if (fields.name?.trim()) {
      body.name = fields.name.trim();
    }
    if (fields.dailyBudgetCents !== undefined) {
      const currency = (fields.currency || "BRL").toUpperCase();
      const minCents = getMinimumDailyBudgetCents(currency);
      const rounded = Math.round(fields.dailyBudgetCents);
      if (!Number.isFinite(rounded) || rounded < minCents) {
        throw new Error(
          `Orçamento diário abaixo do mínimo exigido pela Meta (${minCents} centavos em ${currency}).`
        );
      }
      body.daily_budget = String(rounded);
    }
    if (fields.targeting && Object.keys(fields.targeting).length > 0) {
      body.targeting = fields.targeting;
    }
    if (fields.startTime?.trim()) {
      const parsed = new Date(fields.startTime.trim());
      if (!Number.isNaN(parsed.getTime()) && parsed.getTime() > Date.now() + 60_000) {
        body.start_time = parsed.toISOString();
      }
    }
    if (fields.noEndDate === true) {
      body.end_time = "0";
    } else if (fields.endTime?.trim()) {
      const parsedEnd = new Date(fields.endTime.trim());
      if (Number.isNaN(parsedEnd.getTime())) {
        throw new Error("Data/hora de término inválida.");
      }
      if (parsedEnd.getTime() <= Date.now() + 60_000) {
        throw new Error(
          "A data/hora de término deve estar no futuro em relação ao horário atual."
        );
      }
      body.end_time = parsedEnd.toISOString();
    }
    if (Object.keys(body).length === 0) return { success: true };
    const res = await this.request<{ success?: boolean }>(`/${cleanId}`, {
      method: "POST",
      body,
    });
    return { success: res.success !== false };
  }

  async updateAdFields(
    adId: string,
    fields: { name?: string; creativeId?: string }
  ): Promise<{ success: boolean }> {
    const cleanId = adId.trim();
    if (!cleanId) throw new Error("meta_ad_id não informado.");
    const body: Record<string, unknown> = {};
    if (fields.name?.trim()) {
      body.name = fields.name.trim().slice(0, 120);
    }
    if (fields.creativeId?.trim()) {
      body.creative = { creative_id: fields.creativeId.trim() };
    }
    if (Object.keys(body).length === 0) return { success: true };
    const res = await this.request<{ success?: boolean }>(`/${cleanId}`, {
      method: "POST",
      body,
    });
    return { success: res.success !== false };
  }

  async updateAdCreativeAndFields(params: {
    adAccountId: string;
    adId: string;
    adName: string;
    headline: string;
    primaryText: string;
    imageUrl?: string | null;
    objective: MetaAdObjective;
    destinationType?: string | null;
    fbPageId: string;
    igUserId?: string | null;
    destinationUrl?: string | null;
    urlTags?: string | null;
    welcomeGreeting?: string | null;
    welcomeAutofill?: string | null;
    creativeChanged: boolean;
  }): Promise<{ creativeId: string | null }> {
    const adAccountId = normalizeAdAccountId(params.adAccountId);
    const cleanAdName = params.adName.trim().slice(0, 120);
    const cleanHeadline = params.headline.trim().slice(0, 90);
    const cleanPrimaryText = params.primaryText.trim();

    if (!params.creativeChanged) {
      await this.updateAdFields(params.adId, { name: cleanAdName });
      return { creativeId: null };
    }

    const effectiveDestination =
      params.destinationType?.trim().toUpperCase() || null;
    const cleanDestUrl = params.destinationUrl?.trim() || null;
    const cleanUrlTags = params.urlTags?.trim() || "";
    const fbPageId = params.fbPageId.trim();
    const igUserId = params.igUserId?.trim() || "";

    const buildCreativeBody = (
      welcomePlacement: "link_data" | "none" = "link_data"
    ): Record<string, unknown> => {
      const targetLink =
        effectiveDestination === "WHATSAPP"
          ? "https://api.whatsapp.com/send"
          : cleanDestUrl || "https://www.facebook.com/";
      const cta =
        effectiveDestination === "WHATSAPP"
          ? {
              type: "WHATSAPP_MESSAGE",
              value: {
                app_destination: "WHATSAPP",
                link: "https://api.whatsapp.com/send",
              },
            }
          : {
              type: "LEARN_MORE",
              value: { link: targetLink },
            };

      const linkData: Record<string, unknown> = {
        link: targetLink,
        message: cleanPrimaryText || cleanHeadline || cleanAdName,
        name: cleanHeadline || cleanAdName.slice(0, 90),
        call_to_action: cta,
      };
      if (params.imageUrl?.trim()) {
        linkData.picture = params.imageUrl.trim();
      }

      const greeting = params.welcomeGreeting?.trim() || "";
      const autofill = params.welcomeAutofill?.trim() || "";
      if (
        welcomePlacement === "link_data" &&
        effectiveDestination === "WHATSAPP" &&
        Boolean(greeting || autofill)
      ) {
        linkData.page_welcome_message = JSON.stringify({
          type: "VISUAL_EDITOR",
          version: 2,
          landing_screen_type: "welcome_message",
          media_type: "text",
          text_format: {
            customer_action_type: "autofill_message",
            message: {
              text: greeting || "Oi! Como podemos ajudar?",
              autofill_message: {
                content:
                  autofill ||
                  "Olá! Gostaria de mais informações sobre este anúncio.",
              },
            },
          },
        });
      }

      return {
        name: `${cleanAdName} — Creative Edit`,
        ...(cleanUrlTags ? { url_tags: cleanUrlTags } : {}),
        object_story_spec: {
          page_id: fbPageId,
          ...(igUserId ? { instagram_user_id: igUserId } : {}),
          link_data: linkData,
        },
      };
    };

    const hasWelcome =
      effectiveDestination === "WHATSAPP" &&
      Boolean(
        params.welcomeGreeting?.trim() || params.welcomeAutofill?.trim()
      );
    let creativeRes: { id: string };
    if (hasWelcome) {
      try {
        creativeRes = await this.request<{ id: string }>(
          `/${adAccountId}/adcreatives`,
          { method: "POST", body: buildCreativeBody("link_data") }
        );
      } catch {
        creativeRes = await this.request<{ id: string }>(
          `/${adAccountId}/adcreatives`,
          { method: "POST", body: buildCreativeBody("none") }
        );
      }
    } else {
      creativeRes = await this.request<{ id: string }>(
        `/${adAccountId}/adcreatives`,
        { method: "POST", body: buildCreativeBody("none") }
      );
    }

    await this.updateAdFields(params.adId, {
      name: cleanAdName,
      creativeId: creativeRes.id,
    });
    return { creativeId: creativeRes.id };
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
          revenue: Number(revenue.toFixed(2)),
          cpl: unitCost,
          cpa: unitCost,
          roas: spend > 0 && revenue > 0 ? Number((revenue / spend).toFixed(2)) : null,
          raw_actions: row.actions || [],
        },
      };
    });
  }

  async fetchDailyAdInsights(
    adAccountId: string,
    options: {
      windowDays?: 4 | 7 | 14 | 30;
      adIds?: string[];
    } = {}
  ): Promise<Record<string, AdInsightsDailyPoint[]>> {
    const cleanAccountId = normalizeAdAccountId(adAccountId);
    if (!cleanAccountId) return {};

    const windowDays = options.windowDays || 30;
    const untilDate = new Date();
    const sinceDate = new Date(
      untilDate.getTime() - (windowDays - 1) * 24 * 60 * 60 * 1000
    );

    const query: Record<string, string | number | undefined> = {
      level: "ad",
      time_increment: 1,
      fields:
        "ad_id,date_start,spend,impressions,clicks,ctr,cpc,actions,action_values",
      time_range: JSON.stringify({
        since: sinceDate.toISOString().slice(0, 10),
        until: untilDate.toISOString().slice(0, 10),
      }),
      limit: 500,
    };

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
        date_start?: string;
        spend?: string;
        impressions?: string;
        clicks?: string;
        ctr?: string;
        cpc?: string;
        actions?: Array<{ action_type: string; value: string }>;
        action_values?: Array<{ action_type: string; value: string }>;
      }>;
    }>(`/${cleanAccountId}/insights`, { query });

    const byAdId: Record<string, AdInsightsDailyPoint[]> = {};
    for (const row of data.data || []) {
      const adId = row.ad_id?.trim();
      const date = String(row.date_start || "").slice(0, 10);
      if (!adId || !date) continue;

      const { conversions, revenue } = extractConversionsAndRevenue(
        row.actions,
        row.action_values
      );

      if (!byAdId[adId]) {
        byAdId[adId] = [];
      }
      byAdId[adId].push({
        date,
        spend: Number(row.spend || 0),
        impressions: Number(row.impressions || 0),
        clicks: Number(row.clicks || 0),
        conversions,
        revenue: Number(revenue.toFixed(2)),
        ctr: Number(row.ctr || 0),
        cpc: Number(row.cpc || 0),
      });
    }

    for (const adId of Object.keys(byAdId)) {
      byAdId[adId].sort((a, b) => a.date.localeCompare(b.date));
    }

    return byAdId;
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

    const [settled, dailyByAdId] = await Promise.all([
      Promise.all(
        windowSpecs.map(async (w) => {
          const rows = await this.fetchAdInsights(adAccountId, {
            windowDays: w.days,
            adIds,
          });
          return { key: w.key, rows };
        })
      ),
      this.fetchDailyAdInsights(adAccountId, {
        windowDays: 30,
        adIds,
      }).catch(() => ({} as Record<string, AdInsightsDailyPoint[]>)),
    ]);

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
          revenue: Number(s.revenue || 0),
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

    for (const adId of Object.keys(dailyByAdId)) {
      if (!byAdId[adId]) {
        byAdId[adId] = { windows: {} };
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
      snap.daily = dailyByAdId[adId] || [];
    }

    return byAdId;
  }
}
