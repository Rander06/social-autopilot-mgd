import { GoogleGenAI, Type } from "@google/genai";
import {
  getMinimumDailyBudgetCents,
  MetaAdsApiError,
  MetaAdsService,
  MetaTargetingInput,
  normalizeAdAccountId,
} from "./meta-ads";
import {
  appendAuditLog,
  createAdCampaignRecord,
  getAdCampaignById,
  getCompanyById,
  getCompanySecrets,
  getDefaultAdAccount,
  listActiveAdCampaignsForMonitoring,
  listAdAccountsByCompany,
  listAdCampaignsByCompany,
  listPostsHistory,
  updateAdCampaignRecord,
  upsertAdAccountConfig,
} from "./store";
import {
  AdAccountConfig,
  AdCampaignRecord,
  AdChannel,
  AdDecisionVerdict,
  AdInsightsSnapshot,
  AdsAdvisorReport,
  MetaAdObjective,
  ParsedCampaignPlan,
} from "./types";

const ALLOWED_OBJECTIVES: MetaAdObjective[] = [
  "OUTCOME_TRAFFIC",
  "OUTCOME_LEADS",
  "OUTCOME_SALES",
  "OUTCOME_ENGAGEMENT",
];

const ALLOWED_GOALS = new Set([
  "LINK_CLICKS",
  "LANDING_PAGE_VIEWS",
  "LEAD_GENERATION",
  "CONVERSATIONS",
  "OFFSITE_CONVERSIONS",
  "POST_ENGAGEMENT",
  "IMPRESSIONS",
  "REACH",
]);

function normalizeObjective(raw?: string | null): MetaAdObjective {
  const upper = String(raw || "").trim().toUpperCase();
  if (ALLOWED_OBJECTIVES.includes(upper as MetaAdObjective)) {
    return upper as MetaAdObjective;
  }
  return "OUTCOME_TRAFFIC";
}

function defaultGoalForObjective(
  objective: MetaAdObjective,
  destinationType?: string | null
): string {
  if (
    destinationType === "WHATSAPP" ||
    destinationType === "MESSENGER" ||
    destinationType === "INSTAGRAM_DIRECT"
  ) {
    return "CONVERSATIONS";
  }
  if (objective === "OUTCOME_LEADS") return "LEAD_GENERATION";
  if (objective === "OUTCOME_SALES") return "OFFSITE_CONVERSIONS";
  if (objective === "OUTCOME_ENGAGEMENT") return "POST_ENGAGEMENT";
  return "LINK_CLICKS";
}

async function runStructuredJsonWithCompanyAI<T>(params: {
  geminiKey?: string | null;
  openaiKey?: string | null;
  systemPrompt: string;
  userPrompt: string;
  geminiSchema: Record<string, unknown>;
  openaiSchema: { name: string; schema: Record<string, unknown> };
}): Promise<{ data: T; provider: string } | null> {
  if (params.geminiKey?.trim()) {
    const ai = new GoogleGenAI({ apiKey: params.geminiKey.trim() });
    for (const model of [
      "gemini-3.8-flash",
      "gemini-3.5-flash",
      "gemini-3.5-flash-lite",
    ]) {
      try {
        const response = await Promise.race([
          ai.models.generateContent({
            model,
            contents: `${params.systemPrompt}\n\n${params.userPrompt}`,
            config: {
              responseMimeType: "application/json",
              responseSchema: params.geminiSchema as never,
              temperature: 0.2,
            },
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Timeout Gemini Ads")), 12_000)
          ),
        ]);
        if (response.text) {
          return {
            data: JSON.parse(response.text) as T,
            provider: `GEMINI (${model})`,
          };
        }
      } catch {
        // tenta próximo modelo
      }
    }
  }

  if (params.openaiKey?.trim()) {
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${params.openaiKey.trim()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          temperature: 0.2,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: params.openaiSchema.name,
              strict: true,
              schema: params.openaiSchema.schema,
            },
          },
          messages: [
            { role: "system", content: params.systemPrompt },
            { role: "user", content: params.userPrompt },
          ],
        }),
        signal: AbortSignal.timeout(14_000),
      });
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = data.choices?.[0]?.message?.content;
      if (res.ok && text) {
        return {
          data: JSON.parse(text) as T,
          provider: "OPENAI (gpt-4.1-mini)",
        };
      }
    } catch {
      // fallback determinístico abaixo
    }
  }

  return null;
}

function deterministicFallbackParse(params: {
  userPrompt: string;
  postHeadline: string;
  adAccount: AdAccountConfig | null;
  currency: string;
}): ParsedCampaignPlan {
  const prompt = params.userPrompt.trim();
  const minCents = getMinimumDailyBudgetCents(params.currency);

  const moneyMatch = prompt.match(/(?:R\$|\$|BRL|USD)?\s*(\d+(?:[.,]\d{1,2})?)\s*(?:\/?\s*dia|por\s+dia|di[áa]ri[oa])?/i);
  const parsedValue = moneyMatch
    ? Number(moneyMatch[1].replace(",", "."))
    : 25;
  const dailyBudgetCents = Math.max(
    minCents,
    Math.round((Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : 25) * 100)
  );

  const daysMatch = prompt.match(/(\d+)\s*dias?/i);
  const durationDays = daysMatch ? Math.min(90, Math.max(1, Number(daysMatch[1]))) : 7;

  const isWhatsapp = /whatsapp|zap|mensag|inbox|direct|dm|conversa/i.test(prompt);
  const isSales = /venda|compra|convers[ãa]o|cat[áa]logo|e-?commerce|checkout/i.test(prompt);
  const isLeads = /lead|cadastro|formul[áa]rio|or[çc]amento|contato/i.test(prompt);
  const isEngagement = /engaj|curtid|seguidor|alcance|visualiza/i.test(prompt);

  const objective: MetaAdObjective = isSales
    ? "OUTCOME_SALES"
    : isWhatsapp || isLeads
      ? "OUTCOME_LEADS"
      : isEngagement
        ? "OUTCOME_ENGAGEMENT"
        : "OUTCOME_TRAFFIC";

  const destinationType = isWhatsapp
    ? "WHATSAPP"
    : params.adAccount?.link_destino_padrao
      ? "WEBSITE"
      : null;

  const optimizationGoal = defaultGoalForObjective(objective, destinationType);

  const cityMatch = prompt.match(/\b(?:em|para|na\s+cidade\s+de|regi[ãa]o\s+de)\s+([A-ZÀ-Úa-zà-ú][A-ZÀ-Úa-zà-ú\s-]{2,32})/i);
  const locationQuery =
    cityMatch?.[1]?.trim() || params.adAccount?.localizacao_base || "Brasil";

  const shortTitle = (params.postHeadline || "Impulsionamento")
    .trim()
    .slice(0, 48);

  return {
    name: `[PilotFlow] ${shortTitle}`,
    objective,
    optimization_goal: optimizationGoal,
    destination_type: destinationType,
    daily_budget_cents: dailyBudgetCents,
    duration_days: durationDays,
    location_query: locationQuery,
    age_min: 22,
    age_max: 55,
    genders: [],
    destination_url: params.adAccount?.link_destino_padrao || null,
    reasoning:
      "Plano estruturado automaticamente pelo parser determinístico com base no texto informado e metas da conta.",
    parser_provider: "DETERMINISTIC_FALLBACK",
  };
}

/**
 * Módulo 2 (equiv. meta-campaign-launcher): converte pedido em linguagem natural em JSON estruturado
 * e cria Campanha -> AdSet -> AdCreative (reaproveitando post orgânico) -> Ad sempre em PAUSED.
 */
export class CampaignLauncherService {
  static async parseCampaignPromptWithAI(params: {
    companyName: string;
    userPrompt: string;
    postHeadline: string;
    postCaption: string;
    adAccount: AdAccountConfig | null;
    channel: AdChannel;
    keys: { gemini?: string | null; openai?: string | null };
  }): Promise<ParsedCampaignPlan> {
    const currency = (params.adAccount?.currency || "BRL").toUpperCase();
    const minCents = getMinimumDailyBudgetCents(currency);
    const defaultLocation = params.adAccount?.localizacao_base || "Brasil";
    const defaultLink = params.adAccount?.link_destino_padrao || "";

    const systemPrompt = `Você é um gestor de tráfego pago sênior especialista na Meta Marketing API v26.0.
Converta o pedido em linguagem natural do cliente em parâmetros técnicos estruturados de campanha para impulsionar um post orgânico existente no ${params.channel}.
Regras obrigatórias:
- objective deve ser exatamente um de: OUTCOME_TRAFFIC, OUTCOME_LEADS, OUTCOME_SALES, OUTCOME_ENGAGEMENT.
- optimization_goal deve ser compatível com objective (ex: LINK_CLICKS, LANDING_PAGE_VIEWS, CONVERSATIONS, LEAD_GENERATION, OFFSITE_CONVERSIONS, POST_ENGAGEMENT).
- daily_budget_cents é em centavos inteiros na moeda ${currency} (mínimo ${minCents}). Ex: R$ 40/dia => 4000.
- Se mencionar WhatsApp ou mensagens/direct, use objective="OUTCOME_LEADS", destination_type="WHATSAPP" e optimization_goal="CONVERSATIONS".
- Se não mencionar cidade/estado específico, use "${defaultLocation}" em location_query.
- Idade padrão segura se não informada: age_min=22, age_max=55.`;

    const userPrompt = `Empresa: ${params.companyName}
Headline do post orgânico: "${params.postHeadline}"
Resumo da legenda: "${params.postCaption.slice(0, 280)}"
Localização padrão da conta: "${defaultLocation}"
Link destino padrão: "${defaultLink}"
Pedido do usuário: "${params.userPrompt || "Impulsionar post para gerar mais visitas e contatos"}"`;

    interface RawAiPlan {
      name: string;
      objective: string;
      optimization_goal: string;
      destination_type: string;
      daily_budget_cents: number;
      duration_days: number;
      location_query: string;
      age_min: number;
      age_max: number;
      reasoning: string;
    }

    const aiRes = await runStructuredJsonWithCompanyAI<RawAiPlan>({
      geminiKey: params.keys.gemini,
      openaiKey: params.keys.openai,
      systemPrompt,
      userPrompt,
      geminiSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          objective: { type: Type.STRING },
          optimization_goal: { type: Type.STRING },
          destination_type: { type: Type.STRING },
          daily_budget_cents: { type: Type.INTEGER },
          duration_days: { type: Type.INTEGER },
          location_query: { type: Type.STRING },
          age_min: { type: Type.INTEGER },
          age_max: { type: Type.INTEGER },
          reasoning: { type: Type.STRING },
        },
        required: [
          "name",
          "objective",
          "optimization_goal",
          "destination_type",
          "daily_budget_cents",
          "duration_days",
          "location_query",
          "age_min",
          "age_max",
          "reasoning",
        ],
      },
      openaiSchema: {
        name: "meta_campaign_plan",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            objective: { type: "string" },
            optimization_goal: { type: "string" },
            destination_type: { type: "string" },
            daily_budget_cents: { type: "integer" },
            duration_days: { type: "integer" },
            location_query: { type: "string" },
            age_min: { type: "integer" },
            age_max: { type: "integer" },
            reasoning: { type: "string" },
          },
          required: [
            "name",
            "objective",
            "optimization_goal",
            "destination_type",
            "daily_budget_cents",
            "duration_days",
            "location_query",
            "age_min",
            "age_max",
            "reasoning",
          ],
        },
      },
    });

    if (!aiRes) {
      return deterministicFallbackParse({
        userPrompt: params.userPrompt,
        postHeadline: params.postHeadline,
        adAccount: params.adAccount,
        currency,
      });
    }

    const raw = aiRes.data;
    const objective = normalizeObjective(raw.objective);
    const destTypeRaw = String(raw.destination_type || "").trim().toUpperCase();
    const destinationType =
      destTypeRaw && destTypeRaw !== "NONE" && destTypeRaw !== "NULL"
        ? destTypeRaw
        : null;
    const rawGoal = String(raw.optimization_goal || "").trim().toUpperCase();
    const optimizationGoal = ALLOWED_GOALS.has(rawGoal)
      ? rawGoal
      : defaultGoalForObjective(objective, destinationType);

    const ageMin = Math.max(18, Math.min(65, Math.round(Number(raw.age_min) || 22)));
    const ageMax = Math.max(ageMin, Math.min(65, Math.round(Number(raw.age_max) || 55)));
    const budgetCents = Math.max(
      minCents,
      Math.round(Number(raw.daily_budget_cents) || 2500)
    );
    const durationDays =
      Number(raw.duration_days) > 0
        ? Math.min(90, Math.round(Number(raw.duration_days)))
        : 7;

    return {
      name:
        String(raw.name || "").trim() ||
        `[PilotFlow] ${params.postHeadline.slice(0, 48)}`,
      objective,
      optimization_goal: optimizationGoal,
      destination_type: destinationType,
      daily_budget_cents: budgetCents,
      duration_days: durationDays,
      location_query: String(raw.location_query || defaultLocation).trim() || "Brasil",
      age_min: ageMin,
      age_max: ageMax,
      genders: [],
      destination_url: params.adAccount?.link_destino_padrao || null,
      reasoning:
        String(raw.reasoning || "").trim() ||
        "Parâmetros estruturados automaticamente via IA.",
      parser_provider: aiRes.provider,
    };
  }

  static async resolveGeoTargeting(
    metaAds: MetaAdsService,
    plan: ParsedCampaignPlan
  ): Promise<MetaTargetingInput> {
    const query = (plan.location_query || "").trim();
    const isCountryWide =
      !query || /^(?:brasil|brazil|todo\s+o\s+brasil|br)$/i.test(query);

    let geoLocations: MetaTargetingInput["geo_locations"] = {
      countries: ["BR"],
    };

    if (!isCountryWide) {
      try {
        const matches = await metaAds.searchGeoLocations(query, {
          locationTypes: ["city", "region"],
          countryCode: "BR",
          limit: 5,
        });
        const cityMatch = matches.find((m) => m.type === "city");
        const regionMatch = matches.find((m) => m.type === "region");
        if (cityMatch?.key) {
          geoLocations = {
            cities: [
              {
                key: cityMatch.key,
                radius: 25,
                distance_unit: "kilometer",
              },
            ],
          };
        } else if (regionMatch?.key) {
          geoLocations = {
            regions: [{ key: regionMatch.key }],
          };
        }
      } catch {
        geoLocations = { countries: ["BR"] };
      }
    }

    return {
      geo_locations: geoLocations,
      age_min: plan.age_min,
      age_max: plan.age_max,
      ...(plan.genders.length > 0 ? { genders: plan.genders } : {}),
      targeting_automation: { advantage_audience: 0 },
    };
  }

  static async launchFromExistingPost(params: {
    companyId: string;
    userId?: string | null;
    postId: string;
    channel: AdChannel;
    userPrompt: string;
    adAccountId?: string | null;
    overridePlan?: Partial<ParsedCampaignPlan>;
  }): Promise<{
    campaign: AdCampaignRecord;
    plan: ParsedCampaignPlan;
    stepsLog: string[];
  }> {
    if (params.channel === "TIKTOK") {
      throw new Error(
        "TikTok Ads em breve — módulo bloqueado por feature flag até aprovação oficial da TikTok Marketing API."
      );
    }

    const [company, secrets, defaultAccount, allAccounts, posts] = await Promise.all([
      getCompanyById(params.companyId),
      getCompanySecrets(params.companyId),
      getDefaultAdAccount(params.companyId, "META"),
      listAdAccountsByCompany(params.companyId, "META"),
      listPostsHistory(params.companyId, 120),
    ]);

    if (!secrets.meta_access_token) {
      throw new Error(
        "Token da Meta não configurado nas Integrações desta empresa."
      );
    }

    const post = posts.find((p) => p.id === params.postId);
    if (!post) {
      throw new Error("Post orgânico não encontrado para esta empresa.");
    }

    if (params.channel === "INSTAGRAM" && !post.ig_post_id) {
      throw new Error(
        "Este post não possui ID publicado no Instagram (ig_post_id) para impulsionar."
      );
    }
    if (params.channel === "FACEBOOK" && !post.fb_post_id) {
      throw new Error(
        "Este post não possui ID publicado no Facebook (fb_post_id) para impulsionar."
      );
    }

    const requestedAccId = params.adAccountId
      ? normalizeAdAccountId(params.adAccountId)
      : "";
    const selectedAccount =
      (requestedAccId
        ? allAccounts.find((a) => a.ad_account_id === requestedAccId)
        : null) || defaultAccount;

    const targetAdAccountId =
      requestedAccId || selectedAccount?.ad_account_id || "";
    if (!targetAdAccountId) {
      throw new Error(
        "Nenhuma Conta de Anúncios configurada. Selecione sua conta Meta Ads nas configurações antes de criar campanhas."
      );
    }

    const parsed = await this.parseCampaignPromptWithAI({
      companyName: company?.name || "Empresa",
      userPrompt: params.userPrompt,
      postHeadline: post.headline,
      postCaption: post.content_json?.legenda || "",
      adAccount: selectedAccount,
      channel: params.channel,
      keys: {
        gemini: secrets.gemini_api_key,
        openai: secrets.openai_api_key,
      },
    });

    const currency = (selectedAccount?.currency || "BRL").toUpperCase();
    const minCents = getMinimumDailyBudgetCents(currency);
    const plan: ParsedCampaignPlan = {
      ...parsed,
      ...params.overridePlan,
      objective: normalizeObjective(
        params.overridePlan?.objective || parsed.objective
      ),
      daily_budget_cents: Math.max(
        minCents,
        Math.round(
          params.overridePlan?.daily_budget_cents ?? parsed.daily_budget_cents
        )
      ),
    };

    const metaAds = new MetaAdsService(secrets.meta_access_token);
    const targeting = await this.resolveGeoTargeting(metaAds, plan);

    try {
      const created = await metaAds.createCampaignFromExistingPost({
        adAccountId: targetAdAccountId,
        channel: params.channel,
        name: plan.name,
        objective: plan.objective,
        optimizationGoal: plan.optimization_goal,
        destinationType: plan.destination_type,
        dailyBudgetCents: plan.daily_budget_cents,
        currency,
        durationDays: plan.duration_days,
        targeting,
        fbPageId: secrets.fb_page_id,
        fbPostId: post.fb_post_id,
        igUserId: secrets.ig_user_id,
        igMediaId: post.ig_post_id,
        destinationUrl: plan.destination_url,
      });

      const saved = await createAdCampaignRecord({
        company_id: params.companyId,
        post_id: post.id,
        provider: "META",
        channel: params.channel,
        ad_account_id: created.adAccountId,
        name: plan.name,
        user_prompt: params.userPrompt,
        objective: plan.objective,
        optimization_goal: plan.optimization_goal,
        destination_type: plan.destination_type,
        daily_budget_cents: plan.daily_budget_cents,
        currency,
        duration_days: plan.duration_days,
        targeting_json: targeting as Record<string, unknown>,
        source_story_id: created.sourceStoryId,
        meta_campaign_id: created.campaignId,
        meta_adset_id: created.adsetId,
        meta_creative_id: created.creativeId,
        meta_ad_id: created.adId,
        status: "PAUSED",
        created_by_user_id: params.userId || null,
      });

      return {
        campaign: saved,
        plan,
        stepsLog: created.stepsLog,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const partial = err instanceof MetaAdsApiError ? err.partialIds : undefined;
      await createAdCampaignRecord({
        company_id: params.companyId,
        post_id: post.id,
        provider: "META",
        channel: params.channel,
        ad_account_id: targetAdAccountId,
        name: plan.name,
        user_prompt: params.userPrompt,
        objective: plan.objective,
        optimization_goal: plan.optimization_goal,
        destination_type: plan.destination_type,
        daily_budget_cents: plan.daily_budget_cents,
        currency,
        duration_days: plan.duration_days,
        targeting_json: targeting as Record<string, unknown>,
        meta_campaign_id: partial?.campaignId || null,
        meta_adset_id: partial?.adsetId || null,
        meta_creative_id: partial?.creativeId || null,
        status: "ERROR",
        error_message: errMsg,
        created_by_user_id: params.userId || null,
      });
      throw err;
    }
  }
}

/**
 * Módulo 4 (equiv. meta-performance-analyzer): aplica `decide()` com proteção de 48h,
 * amostra mínima e detecção de fadiga criativa (frequência alta + CTR em queda).
 */
export class PerformanceAnalyzerService {
  static decide(params: {
    snapshot: AdInsightsSnapshot;
    account: Pick<
      AdAccountConfig,
      "cpa_maximo" | "roas_minimo" | "amostra_minima_cliques"
    >;
    campaignCreatedAt: string;
  }): {
    verdict: AdDecisionVerdict;
    reason: string;
    creativeFatigue: boolean;
  } {
    const hoursRunning =
      (Date.now() - new Date(params.campaignCreatedAt).getTime()) /
      (1000 * 60 * 60);
    const spend = Number(params.snapshot.spend || 0);
    const clicks = Number(params.snapshot.clicks || 0);
    const conversions = Number(params.snapshot.conversions || 0);
    const cpa = params.snapshot.cpa ?? null;
    const roas = params.snapshot.roas ?? null;
    const frequency = Number(params.snapshot.frequency || 0);
    const ctr = Number(params.snapshot.ctr || 0);
    const w4 = params.snapshot.windows?.["4d"];
    const w7 = params.snapshot.windows?.["7d"];
    const ctrDropped = Boolean(w4 && w7 && w7.ctr > 0 && w4.ctr < w7.ctr * 0.75);
    const creativeFatigue =
      Boolean(params.snapshot.creative_fatigue) ||
      (frequency >= 2.8 && (ctr < 0.8 || ctrDropped));

    const cpaMax = Number(params.account.cpa_maximo || 35);
    const roasMin = Number(params.account.roas_minimo || 2);
    const minClicks = Number(params.account.amostra_minima_cliques || 50);

    if (hoursRunning < 48) {
      return {
        verdict: "MANTER",
        reason: `Em fase inicial de aprendizado (${Math.max(
          1,
          Math.floor(hoursRunning)
        )}h de 48h mínimas). Aguardando estabilização antes de alterar.`,
        creativeFatigue,
      };
    }

    if (spend >= cpaMax * 2 && conversions === 0) {
      return {
        verdict: "PAUSAR",
        reason: `Gasto acumulado (${spend.toFixed(
          2
        )}) atingiu 2× o CPA máximo (${cpaMax.toFixed(
          2
        )}) sem nenhuma conversão registrada.`,
        creativeFatigue,
      };
    }

    if (clicks >= minClicks && cpa !== null && cpa > cpaMax * 1.5) {
      return {
        verdict: "PAUSAR",
        reason: `Após ${clicks} cliques, o CPA atual (${cpa.toFixed(
          2
        )}) superou em mais de 50% o teto definido (${cpaMax.toFixed(2)}).`,
        creativeFatigue,
      };
    }

    const hasGoodCpa = cpa !== null && cpa <= cpaMax;
    const hasGoodRoas = roas !== null && roas >= roasMin;

    if (clicks >= minClicks && (hasGoodCpa || hasGoodRoas) && !creativeFatigue) {
      return {
        verdict: "ESCALAR",
        reason: `Desempenho validado com ${clicks} cliques e ${conversions} conversões (${
          hasGoodCpa ? `CPA ${cpa?.toFixed(2)} ≤ ${cpaMax.toFixed(2)}` : ""
        }${hasGoodCpa && hasGoodRoas ? " • " : ""}${
          hasGoodRoas ? `ROAS ${roas?.toFixed(2)} ≥ ${roasMin.toFixed(2)}` : ""
        }). Recomenda-se aumentar orçamento em +20%.`,
        creativeFatigue,
      };
    }

    if (creativeFatigue) {
      return {
        verdict: "MANTER",
        reason: `Fadiga criativa detectada (Frequência ${frequency.toFixed(
          2
        )} e CTR ${ctr.toFixed(
          2
        )}%). Prepare um novo criativo/gancho para substituir em breve.`,
        creativeFatigue: true,
      };
    }

    return {
      verdict: "MANTER",
      reason: `Amostra em coleta (${clicks}/${minClicks} cliques • gasto ${spend.toFixed(
        2
      )}). Continue monitorando antes de escalar ou pausar.`,
      creativeFatigue: false,
    };
  }
}

/**
 * Módulo 3 (equiv. meta-metrics-fetcher): coleta insights nas janelas 4d, 7d, 14d e 30d,
 * aplica decide() e executa auto-pause quando autorizado no perfil da empresa.
 */
export class MetricsFetcherWorker {
  static async syncCompanyCampaignMetrics(companyId: string): Promise<{
    campaignsUpdated: number;
    autoPaused: number;
    errors: string[];
  }> {
    const [secrets, accounts, campaigns] = await Promise.all([
      getCompanySecrets(companyId),
      listAdAccountsByCompany(companyId, "META"),
      listAdCampaignsByCompany(companyId, 200),
    ]);

    const errors: string[] = [];
    if (!secrets.meta_access_token) {
      return {
        campaignsUpdated: 0,
        autoPaused: 0,
        errors: ["Token da Meta ausente para esta empresa."],
      };
    }

    const trackable = campaigns.filter(
      (c) =>
        c.provider === "META" &&
        c.meta_ad_id &&
        (c.status === "ACTIVE" || c.status === "PAUSED")
    );
    if (trackable.length === 0) {
      return { campaignsUpdated: 0, autoPaused: 0, errors: [] };
    }

    const byAccount = new Map<string, AdCampaignRecord[]>();
    for (const cmp of trackable) {
      const list = byAccount.get(cmp.ad_account_id) || [];
      list.push(cmp);
      byAccount.set(cmp.ad_account_id, list);
    }

    const metaAds = new MetaAdsService(secrets.meta_access_token);
    let campaignsUpdated = 0;
    let autoPaused = 0;

    for (const [accountId, accountCampaigns] of byAccount.entries()) {
      const accConfig =
        accounts.find((a) => a.ad_account_id === accountId) ||
        accounts.find((a) => a.is_default) || {
          cpa_maximo: 35,
          roas_minimo: 2,
          amostra_minima_cliques: 50,
          auto_pause_enabled: false,
        };

      try {
        const adIds = accountCampaigns
          .map((c) => c.meta_ad_id)
          .filter((id): id is string => Boolean(id));
        const insightsMap = await metaAds.fetchMultiWindowAdInsights(
          accountId,
          adIds
        );
        const nowIso = new Date().toISOString();

        for (const cmp of accountCampaigns) {
          const snapshot = cmp.meta_ad_id
            ? insightsMap[cmp.meta_ad_id] || {}
            : {};
          const decision = PerformanceAnalyzerService.decide({
            snapshot,
            account: accConfig,
            campaignCreatedAt: cmp.created_at,
          });

          let nextStatus = cmp.status;
          if (
            decision.verdict === "PAUSAR" &&
            accConfig.auto_pause_enabled &&
            cmp.status === "ACTIVE" &&
            cmp.meta_campaign_id
          ) {
            try {
              await metaAds.toggleEntityStatus(cmp.meta_campaign_id, "PAUSED");
              nextStatus = "PAUSED";
              autoPaused += 1;
              await appendAuditLog({
                company_id: companyId,
                action: "AD_CAMPAIGN_AUTO_PAUSED",
                details_json: {
                  ad_campaign_id: cmp.id,
                  meta_campaign_id: cmp.meta_campaign_id,
                  reason: decision.reason,
                },
              });
            } catch (pauseErr) {
              errors.push(
                `Falha ao auto-pausar ${cmp.id}: ${
                  pauseErr instanceof Error ? pauseErr.message : String(pauseErr)
                }`
              );
            }
          }

          await updateAdCampaignRecord(cmp.id, {
            status: nextStatus,
            last_verdict: decision.verdict,
            last_verdict_reason: decision.reason,
            last_insights_json: {
              ...snapshot,
              creative_fatigue: decision.creativeFatigue,
            },
            last_insights_at: nowIso,
          });
          campaignsUpdated += 1;
        }
      } catch (err) {
        errors.push(
          `Conta ${accountId}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    return { campaignsUpdated, autoPaused, errors };
  }

  static async runGlobalMonitoringCycle(companyIdFilter?: string | null): Promise<{
    companiesChecked: number;
    campaignsUpdated: number;
    autoPaused: number;
    errors: string[];
  }> {
    let companyIds: string[] = [];
    if (companyIdFilter?.trim()) {
      companyIds = [companyIdFilter.trim()];
    } else {
      const activeCampaigns = await listActiveAdCampaignsForMonitoring("META");
      companyIds = Array.from(
        new Set(activeCampaigns.map((c) => c.company_id))
      );
    }

    let campaignsUpdated = 0;
    let autoPaused = 0;
    const errors: string[] = [];

    for (const cid of companyIds) {
      const res = await this.syncCompanyCampaignMetrics(cid);
      campaignsUpdated += res.campaignsUpdated;
      autoPaused += res.autoPaused;
      errors.push(...res.errors);
    }

    return {
      companiesChecked: companyIds.length,
      campaignsUpdated,
      autoPaused,
      errors,
    };
  }
}

/**
 * Módulo 5 (equiv. meta-budget-optimizer + meta-creative-brief): sugere realocação de verba
 * e novos ganchos de copy/roteiro orgânico baseados nos posts impulsionados que mais converteram.
 */
export class BudgetAndCreativeAdvisor {
  static async generateAdvisorRecommendations(
    companyId: string
  ): Promise<AdsAdvisorReport> {
    const [campaigns, posts, secrets] = await Promise.all([
      listAdCampaignsByCompany(companyId, 60),
      listPostsHistory(companyId, 60),
      getCompanySecrets(companyId),
    ]);

    const budgetRecommendations: AdsAdvisorReport["budget_recommendations"] = [];

    const winners = campaigns.filter((c) => c.last_verdict === "ESCALAR");
    const losers = campaigns.filter((c) => c.last_verdict === "PAUSAR");

    for (const loser of losers.slice(0, 3)) {
      budgetRecommendations.push({
        campaign_id: loser.id,
        campaign_name: loser.name,
        action: "PAUSAR",
        title: `Pausar / reduzir verba de "${loser.name}"`,
        reason:
          loser.last_verdict_reason ||
          "Custo por conversão acima do limite definido nas metas da conta.",
      });
    }

    for (const winner of winners.slice(0, 3)) {
      const currentReais = (winner.daily_budget_cents / 100).toFixed(2);
      const nextReais = ((winner.daily_budget_cents * 1.2) / 100).toFixed(2);
      budgetRecommendations.push({
        campaign_id: winner.id,
        campaign_name: winner.name,
        action: "ESCALAR",
        title: `Escalar "${winner.name}" (+20% para ~${winner.currency} ${nextReais}/dia)`,
        reason:
          winner.last_verdict_reason ||
          `Atualmente em ${winner.currency} ${currentReais}/dia com CPA/ROAS dentro da meta.`,
      });
    }

    if (losers.length > 0 && winners.length > 0) {
      budgetRecommendations.unshift({
        action: "REALOCAR",
        title: `Mover verba de "${losers[0].name}" para "${winners[0].name}"`,
        reason:
          "Concentrar o orçamento nos criativos já validados evita desperdício e acelera o volume de conversões.",
      });
    }

    const topPosts = [...campaigns]
      .sort(
        (a, b) =>
          Number(b.last_insights_json?.conversions || 0) -
          Number(a.last_insights_json?.conversions || 0)
      )
      .slice(0, 5)
      .map((c) => {
        const post = posts.find((p) => p.id === c.post_id);
        return {
          postId: post?.id || c.post_id || null,
          headline: post?.headline || c.name,
          conversions: Number(c.last_insights_json?.conversions || 0),
          ctr: Number(c.last_insights_json?.ctr || 0),
          fatigue: Boolean(c.last_insights_json?.creative_fatigue),
        };
      });

    let creativeHooks: AdsAdvisorReport["creative_hooks"] = [];
    let providerUsed = "DETERMINISTIC_FALLBACK";

    if (topPosts.length > 0) {
      const aiRes = await runStructuredJsonWithCompanyAI<{
        hooks: Array<{
          angle: string;
          headline_suggestion: string;
          hook_text: string;
          based_on_post_id: string;
        }>;
      }>({
        geminiKey: secrets.gemini_api_key,
        openaiKey: secrets.openai_api_key,
        systemPrompt:
          "Você é um diretor criativo e estrategista de Meta Ads. Com base nos posts impulsionados que mais converteram ou cansaram (fadiga), sugira 3 novos ganchos inéditos em português do Brasil para o cliente testar nos próximos posts orgânicos e impulsionamentos.",
        userPrompt: `Posts impulsionados recentes:\n${JSON.stringify(topPosts, null, 2)}`,
        geminiSchema: {
          type: Type.OBJECT,
          properties: {
            hooks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  angle: { type: Type.STRING },
                  headline_suggestion: { type: Type.STRING },
                  hook_text: { type: Type.STRING },
                  based_on_post_id: { type: Type.STRING },
                },
                required: [
                  "angle",
                  "headline_suggestion",
                  "hook_text",
                  "based_on_post_id",
                ],
              },
            },
          },
          required: ["hooks"],
        },
        openaiSchema: {
          name: "creative_hooks_advice",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              hooks: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    angle: { type: "string" },
                    headline_suggestion: { type: "string" },
                    hook_text: { type: "string" },
                    based_on_post_id: { type: "string" },
                  },
                  required: [
                    "angle",
                    "headline_suggestion",
                    "hook_text",
                    "based_on_post_id",
                  ],
                },
              },
            },
            required: ["hooks"],
          },
        },
      });

      if (aiRes?.data?.hooks?.length) {
        creativeHooks = aiRes.data.hooks.slice(0, 5);
        providerUsed = aiRes.provider;
      }
    }

    if (creativeHooks.length === 0) {
      const refHeadline = topPosts[0]?.headline || "sua oferta principal";
      creativeHooks = [
        {
          angle: "Prova & Autoridade",
          headline_suggestion: `Por que clientes escolhem: ${refHeadline}`,
          hook_text:
            "Abra a arte com um resultado real ou depoimento curto e destaque o diferencial nº 1 logo no topo.",
          based_on_post_id: topPosts[0]?.postId || null,
        },
        {
          angle: "Quebra de Objeção Direta",
          headline_suggestion: "Sem complicação: veja como funciona na prática",
          hook_text:
            "Mostre em 3 passos simples como o cliente resolve o problema hoje mesmo com atendimento rápido.",
          based_on_post_id: topPosts[0]?.postId || null,
        },
        {
          angle: "Oferta / Urgência Leve",
          headline_suggestion: "Condição especial disponível esta semana",
          hook_text:
            "Use foto real nítida do produto/serviço com selo dourado de condição e chamada direta para o WhatsApp.",
          based_on_post_id: topPosts[0]?.postId || null,
        },
      ];
    }

    return {
      generated_at: new Date().toISOString(),
      budget_recommendations: budgetRecommendations,
      creative_hooks: creativeHooks,
      provider_used: providerUsed,
    };
  }
}

/**
 * Módulo 1: Orquestrador principal de Tráfego Pago consumido pelas rotas /api/ads.
 */
export class CampaignOrchestratorService {
  static async getAdsDashboardState(companyId: string) {
    const [secrets, adAccounts, campaigns] = await Promise.all([
      getCompanySecrets(companyId),
      listAdAccountsByCompany(companyId, "META"),
      listAdCampaignsByCompany(companyId, 100),
    ]);

    return {
      has_meta_token: Boolean(secrets.meta_access_token),
      has_ig_user_id: Boolean(secrets.ig_user_id),
      has_fb_page_id: Boolean(secrets.fb_page_id),
      tiktok_ads_enabled: false,
      tiktok_ads_status_label: "Em breve (aguardando TikTok Marketing API)",
      ad_accounts: adAccounts,
      default_ad_account:
        adAccounts.find((a) => a.is_default) || adAccounts[0] || null,
      campaigns,
    };
  }

  static async syncRemoteAdAccounts(companyId: string) {
    const secrets = await getCompanySecrets(companyId);
    if (!secrets.meta_access_token) {
      throw new Error(
        "Token da Meta não configurado nas Integrações desta empresa."
      );
    }

    const metaAds = new MetaAdsService(secrets.meta_access_token);
    const [permissions, remoteAccounts, savedAccounts] = await Promise.all([
      metaAds.checkAdsPermissions(),
      metaAds.listAdAccounts(),
      listAdAccountsByCompany(companyId, "META"),
    ]);

    return {
      permissions,
      remote_accounts: remoteAccounts,
      saved_accounts: savedAccounts,
    };
  }

  static async saveAdAccountSettings(input: {
    companyId: string;
    ad_account_id: string;
    account_name?: string;
    currency?: string;
    account_status?: number | null;
    is_default?: boolean;
    cpa_maximo?: number;
    roas_minimo?: number;
    amostra_minima_cliques?: number;
    link_destino_padrao?: string | null;
    localizacao_base?: string;
    auto_pause_enabled?: boolean;
  }) {
    return upsertAdAccountConfig({
      company_id: input.companyId,
      provider: "META",
      ad_account_id: input.ad_account_id,
      account_name: input.account_name,
      currency: input.currency,
      account_status: input.account_status,
      is_default: input.is_default,
      cpa_maximo: input.cpa_maximo,
      roas_minimo: input.roas_minimo,
      amostra_minima_cliques: input.amostra_minima_cliques,
      link_destino_padrao: input.link_destino_padrao,
      localizacao_base: input.localizacao_base,
      auto_pause_enabled: input.auto_pause_enabled,
    });
  }

  static async previewCampaignPlan(params: {
    companyId: string;
    postId: string;
    channel: AdChannel;
    userPrompt: string;
    adAccountId?: string | null;
  }) {
    if (params.channel === "TIKTOK") {
      throw new Error(
        "TikTok Ads em breve — bloqueado por feature flag até aprovação da TikTok Marketing API."
      );
    }

    const [company, secrets, allAccounts, defaultAccount, posts] =
      await Promise.all([
        getCompanyById(params.companyId),
        getCompanySecrets(params.companyId),
        listAdAccountsByCompany(params.companyId, "META"),
        getDefaultAdAccount(params.companyId, "META"),
        listPostsHistory(params.companyId, 120),
      ]);

    const post = posts.find((p) => p.id === params.postId);
    if (!post) {
      throw new Error("Post orgânico não encontrado.");
    }

    const requestedAccId = params.adAccountId
      ? normalizeAdAccountId(params.adAccountId)
      : "";
    const selectedAccount =
      (requestedAccId
        ? allAccounts.find((a) => a.ad_account_id === requestedAccId)
        : null) || defaultAccount;

    return CampaignLauncherService.parseCampaignPromptWithAI({
      companyName: company?.name || "Empresa",
      userPrompt: params.userPrompt,
      postHeadline: post.headline,
      postCaption: post.content_json?.legenda || "",
      adAccount: selectedAccount,
      channel: params.channel,
      keys: {
        gemini: secrets.gemini_api_key,
        openai: secrets.openai_api_key,
      },
    });
  }

  static launchCampaign = CampaignLauncherService.launchFromExistingPost;

  static async toggleCampaignStatus(params: {
    companyId: string;
    campaignId: string;
    status: "ACTIVE" | "PAUSED" | "ARCHIVED";
    userId?: string | null;
  }) {
    const [secrets, campaign] = await Promise.all([
      getCompanySecrets(params.companyId),
      getAdCampaignById(params.campaignId, params.companyId),
    ]);

    if (!campaign) {
      throw new Error("Campanha não encontrada para esta empresa.");
    }
    if (!secrets.meta_access_token) {
      throw new Error("Token Meta não configurado.");
    }
    if (!campaign.meta_campaign_id) {
      throw new Error(
        "Campanha sem meta_campaign_id criado na Meta Ads (status atual: ERROR)."
      );
    }

    const metaAds = new MetaAdsService(secrets.meta_access_token);
    await metaAds.toggleEntityStatus(campaign.meta_campaign_id, params.status);

    // Garante ativação/pausa explícita também no AdSet e Ad quando ativar/pausar
    if (campaign.meta_adset_id && params.status !== "ARCHIVED") {
      await metaAds
        .toggleEntityStatus(campaign.meta_adset_id, params.status)
        .catch(() => null);
    }
    if (campaign.meta_ad_id && params.status !== "ARCHIVED") {
      await metaAds
        .toggleEntityStatus(campaign.meta_ad_id, params.status)
        .catch(() => null);
    }

    const updated = await updateAdCampaignRecord(campaign.id, {
      status: params.status,
    });

    await appendAuditLog({
      company_id: params.companyId,
      user_id: params.userId || null,
      action: `AD_CAMPAIGN_STATUS_${params.status}`,
      details_json: {
        ad_campaign_id: campaign.id,
        meta_campaign_id: campaign.meta_campaign_id,
      },
    });

    return updated;
  }

  static refreshMetricsNow = MetricsFetcherWorker.syncCompanyCampaignMetrics;
  static getOptimizationAdvice =
    BudgetAndCreativeAdvisor.generateAdvisorRecommendations;
}
