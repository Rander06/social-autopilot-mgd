import { GoogleGenAI, Type } from "@google/genai";
import {
  getMinimumDailyBudgetCents,
  isBrokenFacebookPermalink,
  MetaAdsApiError,
  MetaAdsService,
  MetaCreativeItemInput,
  MetaTargetingInput,
  normalizeAdAccountId,
  normalizeFbObjectStoryId,
} from "./meta-ads";
import {
  appendAuditLog,
  createAdCampaignAdRecord,
  createAdCampaignRecord,
  deleteAdAccountConfig,
  deleteAdCampaignRecord,
  getAdCampaignAdById,
  getAdCampaignById,
  getCompanyById,
  getCompanySecrets,
  getDefaultAdAccount,
  listActiveAdCampaignsForMonitoring,
  listAdAccountsByCompany,
  listAdCampaignAdsByCompany,
  listAdCampaignsByCompany,
  listPostsHistory,
  setDefaultAdAccount,
  updateAdCampaignAdRecord,
  updateAdCampaignRecord,
  updatePostRecord,
  upsertAdAccountConfig,
} from "./store";
import {
  AdAccountConfig,
  AdCampaignAdRecord,
  AdCampaignRecord,
  AdChannel,
  AdDecisionVerdict,
  AdGeoLocationSelection,
  AdInsightsDailyPoint,
  AdInsightsSnapshot,
  AdInsightsWindow,
  AdInsightsWindowMetrics,
  AdsAIProviderPreference,
  AdsAdvisorReport,
  AdsMetricsAIDiagnosis,
  CreativePostInput,
  MetaAdObjective,
  ParsedCampaignPlan,
  PostChannelOrganicMetrics,
  PostOrganicMetrics,
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

function resolvePreferredAIOrder(
  preferred?: AdsAIProviderPreference | null
): Array<"GEMINI" | "OPENAI" | "CLAUDE"> {
  const base: Array<"GEMINI" | "OPENAI" | "CLAUDE"> = [
    "GEMINI",
    "OPENAI",
    "CLAUDE",
  ];
  if (
    preferred === "GEMINI" ||
    preferred === "OPENAI" ||
    preferred === "CLAUDE"
  ) {
    return [preferred, ...base.filter((p) => p !== preferred)];
  }
  return base;
}

function extractJsonObjectString(text: string): string {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return cleaned.slice(start, end + 1);
  }
  return cleaned;
}

async function runStructuredJsonWithCompanyAI<T>(params: {
  geminiKey?: string | null;
  openaiKey?: string | null;
  anthropicKey?: string | null;
  preferredProvider?: AdsAIProviderPreference | null;
  systemPrompt: string;
  userPrompt: string;
  geminiSchema: Record<string, unknown>;
  openaiSchema: { name: string; schema: Record<string, unknown> };
}): Promise<{ data: T; provider: string } | null> {
  const order = resolvePreferredAIOrder(params.preferredProvider);

  for (const provider of order) {
    if (provider === "GEMINI" && params.geminiKey?.trim()) {
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

    if (provider === "OPENAI" && params.openaiKey?.trim()) {
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
        // fallback próximo provedor
      }
    }

    if (provider === "CLAUDE" && params.anthropicKey?.trim()) {
      for (const model of ["claude-sonnet-4-5", "claude-3-5-haiku-latest"]) {
        try {
          const res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "x-api-key": params.anthropicKey.trim(),
              "anthropic-version": "2023-06-01",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model,
              max_tokens: 1500,
              temperature: 0.2,
              messages: [
                {
                  role: "user",
                  content: `${params.systemPrompt}\n\n${params.userPrompt}\n\nResponda EXCLUSIVAMENTE um JSON válido respeitando exatamente este JSON Schema:\n${JSON.stringify(params.openaiSchema.schema)}`,
                },
              ],
            }),
            signal: AbortSignal.timeout(14_000),
          });
          const data = (await res.json()) as {
            content?: Array<{ type: string; text?: string }>;
          };
          const text = data.content?.find((c) => c.type === "text")?.text;
          if (res.ok && text) {
            return {
              data: JSON.parse(extractJsonObjectString(text)) as T,
              provider: `CLAUDE (${model})`,
            };
          }
        } catch {
          // fallback próximo modelo/provedor
        }
      }
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
    : isWhatsapp || isEngagement
      ? "OUTCOME_ENGAGEMENT"
      : isLeads
        ? "OUTCOME_LEADS"
        : "OUTCOME_TRAFFIC";

  const destinationType = isWhatsapp
    ? "WHATSAPP"
    : objective === "OUTCOME_ENGAGEMENT"
      ? null
      : params.adAccount?.link_destino_padrao
        ? "WEBSITE"
        : null;

  const optimizationGoal = defaultGoalForObjective(objective, destinationType);

  const cityMatch = prompt.match(/\b(?:em|para|na\s+cidade\s+de|regi[ãa]o\s+de)\s+([A-ZÀ-Úa-zà-ú][A-ZÀ-Úa-zà-ú\s-]{2,32})/i);
  const locationQuery =
    cityMatch?.[1]?.trim() || params.adAccount?.localizacao_base || "Brasil";

  const ageMatch = prompt.match(/(\d{2})\s*(?:a|-|at[ée])\s*(\d{2})\s*anos?/i);
  const ageMin = ageMatch
    ? Math.max(18, Math.min(65, Number(ageMatch[1])))
    : 22;
  const ageMax = ageMatch
    ? Math.max(ageMin, Math.min(65, Number(ageMatch[2])))
    : 55;
  const genders: Array<1 | 2> = /mulher|feminino/i.test(prompt)
    ? [2]
    : /homem|masculino/i.test(prompt)
      ? [1]
      : [];

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
    age_min: ageMin,
    age_max: ageMax,
    genders,
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
async function searchNominatimPins(
  query: string
): Promise<AdGeoLocationSelection[]> {
  const clean = query.trim();
  if (!clean) return [];
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "json");
    url.searchParams.set("countrycodes", "br");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("limit", "3");
    url.searchParams.set("q", clean);

    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": "SocialPilotFlow/1.0 (https://social.pilotflow.com.br)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const items = (await res.json()) as Array<{
      display_name?: string;
      lat?: string;
      lon?: string;
    }>;
    return items
      .map((item) => {
        const lat = Number(item.lat);
        const lon = Number(item.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
        const shortLabel = (item.display_name || clean)
          .split(",")
          .slice(0, 3)
          .join(", ")
          .trim();
        return {
          label: `📍 Pino Exato: ${shortLabel}`,
          type: "custom_pin" as const,
          latitude: Number(lat.toFixed(6)),
          longitude: Number(lon.toFixed(6)),
          radius_km: 5,
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
  } catch {
    return [];
  }
}

export class CampaignLauncherService {
  static async parseCampaignPromptWithAI(params: {
    companyName: string;
    userPrompt: string;
    postHeadline: string;
    postCaption: string;
    adAccount: AdAccountConfig | null;
    channel: AdChannel;
    aiProvider?: AdsAIProviderPreference;
    keys: {
      gemini?: string | null;
      openai?: string | null;
      anthropic?: string | null;
    };
  }): Promise<ParsedCampaignPlan> {
    const effectiveAI: AdsAIProviderPreference =
      params.aiProvider && params.aiProvider !== "AUTO"
        ? params.aiProvider
        : params.adAccount?.preferred_ai_provider || "AUTO";
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
- Se mencionar WhatsApp ou mensagens/direct, use objective="OUTCOME_ENGAGEMENT", destination_type="WHATSAPP" e optimization_goal="CONVERSATIONS".
- Se mencionar engajamento, curtidas ou alcance sem WhatsApp, use objective="OUTCOME_ENGAGEMENT", destination_type="" e optimization_goal="POST_ENGAGEMENT".
- Se mencionar tráfego para site ou link https://wa.me, use objective="OUTCOME_TRAFFIC", destination_type="WEBSITE" e optimization_goal="LINK_CLICKS".
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
      anthropicKey: params.keys.anthropic,
      preferredProvider: effectiveAI,
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
      return {
        ...deterministicFallbackParse({
          userPrompt: params.userPrompt,
          postHeadline: params.postHeadline,
          adAccount: params.adAccount,
          currency,
        }),
        ai_provider_preference: effectiveAI,
      };
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

    const promptGenders: Array<1 | 2> = /\bmulher(?:es)?\b|\bfeminino\b/i.test(
      params.userPrompt
    )
      ? [2]
      : /\bhomem\b|\bhomens\b|\bmasculino\b/i.test(params.userPrompt)
        ? [1]
        : [];

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
      genders: promptGenders,
      destination_url: params.adAccount?.link_destino_padrao || null,
      reasoning:
        String(raw.reasoning || "").trim() ||
        "Parâmetros estruturados automaticamente via IA.",
      parser_provider: aiRes.provider,
      ai_provider_preference: effectiveAI,
    };
  }

  static async resolveGeoTargeting(
    metaAds: MetaAdsService,
    plan: ParsedCampaignPlan
  ): Promise<MetaTargetingInput> {
    let geoLocations: MetaTargetingInput["geo_locations"] = {
      countries: ["BR"],
    };

    const sel = plan.selected_location;
    if (sel) {
      const customRadius = Number(plan.location_radius_km ?? sel.radius_km ?? 0);
      if (sel.type === "city" && sel.key) {
        geoLocations = {
          cities: [
            {
              key: sel.key,
              radius: Math.max(17, Math.min(80, Math.round(customRadius || 20))),
              distance_unit: "kilometer",
            },
          ],
        };
      } else if (sel.type === "region" && sel.key) {
        geoLocations = { regions: [{ key: sel.key }] };
      } else if (sel.type === "neighborhood" && sel.key) {
        geoLocations = { neighborhoods: [{ key: sel.key }] };
      } else if (sel.type === "subcity" && sel.key) {
        geoLocations = { subcities: [{ key: sel.key }] };
      } else if (sel.type === "zip" && sel.key) {
        geoLocations = { zips: [{ key: sel.key }] };
      } else if (
        sel.type === "custom_pin" &&
        typeof sel.latitude === "number" &&
        typeof sel.longitude === "number"
      ) {
        geoLocations = {
          custom_locations: [
            {
              latitude: sel.latitude,
              longitude: sel.longitude,
              radius: Math.max(1, Math.min(80, Math.round(customRadius || 5))),
              distance_unit: "kilometer",
              name: sel.label.replace(/^📍\s*Pino Exato:\s*/i, "").slice(0, 60),
            },
          ],
        };
      } else if (sel.type === "country") {
        geoLocations = { countries: [sel.country_code || "BR"] };
      }
    } else {
      const query = (plan.location_query || "").trim();
      const isCountryWide =
        !query || /^(?:brasil|brazil|todo\s+o\s+brasil|br)$/i.test(query);

      if (!isCountryWide) {
        try {
          const matches = await metaAds.searchGeoLocations(query, {
            locationTypes: [
              "city",
              "neighborhood",
              "subcity",
              "region",
              "zip",
            ],
            countryCode: "BR",
            limit: 6,
          });
          const neighborhoodMatch = matches.find(
            (m) => m.type === "neighborhood"
          );
          const subcityMatch = matches.find((m) => m.type === "subcity");
          const zipMatch = matches.find((m) => m.type === "zip");
          const cityMatch = matches.find((m) => m.type === "city");
          const regionMatch = matches.find((m) => m.type === "region");
          const radiusKm = Math.max(
            17,
            Math.min(80, Math.round(Number(plan.location_radius_km) || 20))
          );

          if (neighborhoodMatch?.key) {
            geoLocations = { neighborhoods: [{ key: neighborhoodMatch.key }] };
          } else if (subcityMatch?.key) {
            geoLocations = { subcities: [{ key: subcityMatch.key }] };
          } else if (zipMatch?.key) {
            geoLocations = { zips: [{ key: zipMatch.key }] };
          } else if (cityMatch?.key) {
            geoLocations = {
              cities: [
                {
                  key: cityMatch.key,
                  radius: radiusKm,
                  distance_unit: "kilometer",
                },
              ],
            };
          } else if (regionMatch?.key) {
            geoLocations = { regions: [{ key: regionMatch.key }] };
          } else {
            const pins = await searchNominatimPins(query);
            const pin = pins[0];
            if (
              pin &&
              typeof pin.latitude === "number" &&
              typeof pin.longitude === "number"
            ) {
              geoLocations = {
                custom_locations: [
                  {
                    latitude: pin.latitude,
                    longitude: pin.longitude,
                    radius: Math.max(
                      1,
                      Math.min(80, Math.round(Number(plan.location_radius_km) || 5))
                    ),
                    distance_unit: "kilometer",
                    name: query.slice(0, 60),
                  },
                ],
              };
            }
          }
        } catch {
          geoLocations = { countries: ["BR"] };
        }
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
    creatives?: CreativePostInput[];
    channel: AdChannel;
    userPrompt: string;
    adAccountId?: string | null;
    aiProvider?: AdsAIProviderPreference;
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

    const rawCreatives: CreativePostInput[] =
      params.creatives && params.creatives.length > 0
        ? params.creatives
        : [{ postId: params.postId }];

    const seenPostIds = new Set<string>();
    const selectedEntries: Array<{
      post: (typeof posts)[number];
      input: CreativePostInput;
    }> = [];

    for (const item of rawCreatives) {
      const pid = String(item.postId || "").trim();
      if (!pid || seenPostIds.has(pid)) continue;
      seenPostIds.add(pid);
      const found = posts.find((p) => p.id === pid);
      if (!found) {
        throw new Error(`Post orgânico (${pid}) não encontrado para esta empresa.`);
      }
      if (!found.fb_post_id && !found.ig_post_id && !found.image_urls_json?.[0]) {
        throw new Error(
          `O post "${found.headline}" não possui publicação no Facebook/Instagram nem imagem disponível para impulsionar na Meta.`
        );
      }
      selectedEntries.push({ post: found, input: item });
      if (selectedEntries.length >= 10) break;
    }

    if (selectedEntries.length === 0) {
      throw new Error("Selecione pelo menos 1 post publicado para impulsionar.");
    }

    const post = selectedEntries[0].post;

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

    const effectiveAI: AdsAIProviderPreference =
      params.aiProvider && params.aiProvider !== "AUTO"
        ? params.aiProvider
        : selectedAccount?.preferred_ai_provider || "AUTO";

    const parsed = await CampaignLauncherService.parseCampaignPromptWithAI({
      companyName: company?.name || "Empresa",
      userPrompt: params.userPrompt,
      postHeadline: selectedEntries[0].input.headline?.trim() || post.headline,
      postCaption:
        selectedEntries[0].input.primaryText?.trim() ||
        post.content_json?.legenda ||
        "",
      adAccount: selectedAccount,
      channel: params.channel,
      aiProvider: effectiveAI,
      keys: {
        gemini: secrets.gemini_api_key,
        openai: secrets.openai_api_key,
        anthropic: secrets.anthropic_api_key,
      },
    });

    const currency = (selectedAccount?.currency || "BRL").toUpperCase();
    const minCents = getMinimumDailyBudgetCents(currency);
    const clampedAgeMin = Math.max(
      18,
      Math.min(65, Math.round(params.overridePlan?.age_min ?? parsed.age_min ?? 22))
    );
    const clampedAgeMax = Math.max(
      clampedAgeMin,
      Math.min(65, Math.round(params.overridePlan?.age_max ?? parsed.age_max ?? 55))
    );
    const plan: ParsedCampaignPlan = {
      ...parsed,
      ...params.overridePlan,
      location_query:
        params.overridePlan?.location_query?.trim() || parsed.location_query,
      location_radius_km:
        params.overridePlan?.location_radius_km ?? parsed.location_radius_km ?? null,
      selected_location:
        params.overridePlan?.selected_location !== undefined
          ? params.overridePlan.selected_location
          : parsed.selected_location ?? null,
      start_time: params.overridePlan?.start_time ?? parsed.start_time ?? null,
      end_time: params.overridePlan?.end_time ?? parsed.end_time ?? null,
      no_end_date:
        params.overridePlan?.no_end_date ?? parsed.no_end_date ?? false,
      age_min: clampedAgeMin,
      age_max: clampedAgeMax,
      genders: params.overridePlan?.genders ?? parsed.genders ?? [],
      objective: normalizeObjective(
        params.overridePlan?.objective || parsed.objective
      ),
      daily_budget_cents: Math.max(
        minCents,
        Math.round(
          params.overridePlan?.daily_budget_cents ?? parsed.daily_budget_cents
        )
      ),
      destination_url:
        params.overridePlan?.destination_url?.trim() ||
        parsed.destination_url ||
        selectedAccount?.link_destino_padrao ||
        null,
    };

    const creativeItems: MetaCreativeItemInput[] = selectedEntries.map(
      ({ post: itemPost, input: itemInput }) => ({
        postId: itemPost.id,
        fbPostId: itemPost.fb_post_id,
        igMediaId: itemPost.ig_post_id,
        postImageUrl: itemPost.image_urls_json?.[0] || null,
        postStoryImageUrl:
          itemPost.story_image_urls_json?.[0] ||
          itemPost.content_json?.story_image_urls?.[0] ||
          null,
        postHeadline: itemInput.headline?.trim() || itemPost.headline,
        postCaption:
          itemInput.primaryText?.trim() || itemPost.content_json?.legenda || "",
        welcomeGreeting: params.overridePlan?.welcome_greeting ?? null,
        welcomeAutofill: params.overridePlan?.welcome_autofill ?? null,
      })
    );

    const metaAds = new MetaAdsService(secrets.meta_access_token);
    const targeting = await CampaignLauncherService.resolveGeoTargeting(
      metaAds,
      plan
    );

    const dbTargetingJson: Record<string, unknown> = {
      ...(targeting as Record<string, unknown>),
      _creative_defaults: {
        destination_url: plan.destination_url || null,
        pixel_id: params.overridePlan?.pixel_id ?? null,
        url_tags: params.overridePlan?.url_tags ?? null,
        welcome_greeting: params.overridePlan?.welcome_greeting ?? null,
        welcome_autofill: params.overridePlan?.welcome_autofill ?? null,
      },
    };

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
        durationDays: plan.no_end_date ? null : plan.duration_days,
        startTime: plan.start_time,
        endTime: plan.end_time,
        noEndDate: Boolean(plan.no_end_date),
        targeting,
        fbPageId: secrets.fb_page_id,
        fbPostId: post.fb_post_id,
        igUserId: secrets.ig_user_id,
        igMediaId: post.ig_post_id,
        destinationUrl: plan.destination_url,
        postImageUrl: post.image_urls_json?.[0] || null,
        postStoryImageUrl:
          post.story_image_urls_json?.[0] ||
          post.content_json?.story_image_urls?.[0] ||
          null,
        postHeadline: creativeItems[0].postHeadline,
        postCaption: creativeItems[0].postCaption,
        welcomeGreeting: params.overridePlan?.welcome_greeting ?? null,
        welcomeAutofill: params.overridePlan?.welcome_autofill ?? null,
        pixelId: params.overridePlan?.pixel_id ?? null,
        urlTags: params.overridePlan?.url_tags ?? null,
        creatives: creativeItems,
      });

      const saved = await createAdCampaignRecord({
        company_id: params.companyId,
        post_id: post.id,
        provider: "META",
        channel: params.channel,
        ad_account_id: created.adAccountId,
        ai_provider_preference: effectiveAI,
        name: plan.name,
        user_prompt: params.userPrompt,
        objective: plan.objective,
        optimization_goal: plan.optimization_goal,
        destination_type: plan.destination_type,
        daily_budget_cents: plan.daily_budget_cents,
        currency,
        duration_days: plan.no_end_date ? null : plan.duration_days,
        targeting_json: dbTargetingJson,
        source_story_id: created.sourceStoryId,
        meta_campaign_id: created.campaignId,
        meta_adset_id: created.adsetId,
        meta_creative_id: created.creativeId,
        meta_ad_id: created.adId,
        status: "PAUSED",
        created_by_user_id: params.userId || null,
      });

      const savedAds = await Promise.all(
        created.createdAds.map((item) =>
          createAdCampaignAdRecord({
            campaign_id: saved.id,
            company_id: params.companyId,
            post_id: item.postId,
            ad_name: item.adName,
            headline: item.headline,
            primary_text: item.primaryText,
            image_url: item.imageUrl,
            story_image_url: item.storyImageUrl,
            source_story_id: item.sourceStoryId || null,
            meta_creative_id: item.creativeId,
            meta_ad_id: item.adId,
            status: item.status === "ERROR" ? "ERROR" : "PAUSED",
            error_message: item.errorMessage || null,
          })
        )
      );

      return {
        campaign: { ...saved, ads: savedAds },
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
        targeting_json: dbTargetingJson,
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

function aggregateAdSnapshots(
  snapshots: AdInsightsSnapshot[]
): AdInsightsSnapshot {
  if (snapshots.length === 0) return {};
  if (snapshots.length === 1) return snapshots[0];

  let spend = 0;
  let impressions = 0;
  let clicks = 0;
  let conversions = 0;
  let revenue = 0;
  let frequency = 0;
  let creativeFatigue = false;

  const windowKeys: AdInsightsWindow[] = ["4d", "7d", "14d", "30d"];
  const windows: Partial<Record<AdInsightsWindow, AdInsightsWindowMetrics>> = {};
  const dailyMap = new Map<
    string,
    { spend: number; impressions: number; clicks: number; conversions: number; revenue: number }
  >();

  for (const snap of snapshots) {
    spend += Number(snap.spend || 0);
    impressions += Number(snap.impressions || 0);
    clicks += Number(snap.clicks || 0);
    conversions += Number(snap.conversions || 0);
    revenue += Number(snap.revenue || 0);
    frequency = Math.max(frequency, Number(snap.frequency || 0));
    if (snap.creative_fatigue) creativeFatigue = true;

    for (const pt of snap.daily || []) {
      const cur = dailyMap.get(pt.date) || {
        spend: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        revenue: 0,
      };
      cur.spend += Number(pt.spend || 0);
      cur.impressions += Number(pt.impressions || 0);
      cur.clicks += Number(pt.clicks || 0);
      cur.conversions += Number(pt.conversions || 0);
      cur.revenue += Number(pt.revenue || 0);
      dailyMap.set(pt.date, cur);
    }
  }

  for (const wKey of windowKeys) {
    const items = snapshots
      .map((s) => s.windows?.[wKey])
      .filter((w): w is AdInsightsWindowMetrics => Boolean(w));
    if (items.length === 0) continue;
    let wSpend = 0;
    let wImpr = 0;
    let wClicks = 0;
    let wConv = 0;
    let wRev = 0;
    let wFreq = 0;
    for (const w of items) {
      wSpend += Number(w.spend || 0);
      wImpr += Number(w.impressions || 0);
      wClicks += Number(w.clicks || 0);
      wConv += Number(w.conversions || 0);
      wRev += Number(w.revenue || 0);
      wFreq = Math.max(wFreq, Number(w.frequency || 0));
    }
    const wCpa = wConv > 0 ? Number((wSpend / wConv).toFixed(2)) : null;
    windows[wKey] = {
      spend: Number(wSpend.toFixed(2)),
      impressions: wImpr,
      clicks: wClicks,
      ctr: wImpr > 0 ? Number(((wClicks / wImpr) * 100).toFixed(2)) : 0,
      cpc: wClicks > 0 ? Number((wSpend / wClicks).toFixed(2)) : 0,
      cpm: wImpr > 0 ? Number(((wSpend / wImpr) * 1000).toFixed(2)) : 0,
      frequency: Number(wFreq.toFixed(2)),
      conversions: wConv,
      revenue: Number(wRev.toFixed(2)),
      cpl: wCpa,
      cpa: wCpa,
      roas: wSpend > 0 && wRev > 0 ? Number((wRev / wSpend).toFixed(2)) : null,
    };
  }

  const daily: AdInsightsDailyPoint[] = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({
      date,
      spend: Number(d.spend.toFixed(2)),
      impressions: d.impressions,
      clicks: d.clicks,
      conversions: d.conversions,
      revenue: Number(d.revenue.toFixed(2)),
      ctr: d.impressions > 0 ? Number(((d.clicks / d.impressions) * 100).toFixed(2)) : 0,
      cpc: d.clicks > 0 ? Number((d.spend / d.clicks).toFixed(2)) : 0,
    }));

  const cpa = conversions > 0 ? Number((spend / conversions).toFixed(2)) : null;
  return {
    spend: Number(spend.toFixed(2)),
    impressions,
    clicks,
    ctr: impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0,
    cpc: clicks > 0 ? Number((spend / clicks).toFixed(2)) : 0,
    cpm: impressions > 0 ? Number(((spend / impressions) * 1000).toFixed(2)) : 0,
    frequency: Number(frequency.toFixed(2)),
    conversions,
    revenue: Number(revenue.toFixed(2)),
    cpl: cpa,
    cpa,
    roas: spend > 0 && revenue > 0 ? Number((revenue / spend).toFixed(2)) : null,
    creative_fatigue: creativeFatigue,
    windows,
    daily,
  };
}

function mapMetaEntityStatus(
  status?: unknown,
  effectiveStatus?: unknown
): "ACTIVE" | "PAUSED" | "ARCHIVED" | null {
  const eff = String(effectiveStatus || "").trim().toUpperCase();
  if (eff === "DELETED" || eff === "ARCHIVED") {
    return "ARCHIVED";
  }
  const st = String(status || "").trim().toUpperCase();
  if (st === "ACTIVE") return "ACTIVE";
  if (st === "PAUSED") return "PAUSED";
  if (st === "ARCHIVED" || st === "DELETED") return "ARCHIVED";
  return null;
}

/**
 * Módulo 3 (equiv. meta-metrics-fetcher): coleta insights nas janelas 4d, 7d, 14d e 30d,
 * sincroniza alterações feitas no Gerenciador da Meta, aplica decide() e executa auto-pause.
 */
export class MetricsFetcherWorker {
  static async syncCompanyCampaignMetrics(companyId: string): Promise<{
    campaignsUpdated: number;
    metadataSynced: number;
    autoPaused: number;
    errors: string[];
  }> {
    const [secrets, accounts, campaigns, allAds] = await Promise.all([
      getCompanySecrets(companyId),
      listAdAccountsByCompany(companyId, "META"),
      listAdCampaignsByCompany(companyId, 200),
      listAdCampaignAdsByCompany(companyId),
    ]);

    const errors: string[] = [];
    if (!secrets.meta_access_token) {
      return {
        campaignsUpdated: 0,
        metadataSynced: 0,
        autoPaused: 0,
        errors: ["Token da Meta ausente para esta empresa."],
      };
    }

    const adsByCampaign = new Map<string, AdCampaignAdRecord[]>();
    for (const ad of allAds) {
      const arr = adsByCampaign.get(ad.campaign_id) || [];
      arr.push(ad);
      adsByCampaign.set(ad.campaign_id, arr);
    }

    const metaAds = new MetaAdsService(secrets.meta_access_token);
    let metadataSynced = 0;

    // 1) Sincronização Meta -> PilotFlow (nome, orçamento, status e novos anúncios do conjunto)
    const syncableCampaigns = campaigns.filter(
      (c) =>
        c.provider === "META" &&
        Boolean(c.meta_campaign_id) &&
        (c.status === "ACTIVE" || c.status === "PAUSED" || c.status === "DRAFT")
    );

    if (syncableCampaigns.length > 0) {
      try {
        const campaignIds = syncableCampaigns
          .map((c) => c.meta_campaign_id)
          .filter((id): id is string => Boolean(id));
        const adsetIds = syncableCampaigns
          .map((c) => c.meta_adset_id)
          .filter((id): id is string => Boolean(id));
        const existingAdIds = allAds
          .map((a) => a.meta_ad_id)
          .filter((id): id is string => Boolean(id));

        const [campaignMeta, adsetMeta, existingAdMeta] = await Promise.all([
          metaAds.fetchEntitiesMetadata(
            campaignIds,
            "id,name,status,effective_status"
          ),
          metaAds.fetchEntitiesMetadata(
            adsetIds,
            "id,name,daily_budget,status,effective_status"
          ),
          metaAds.fetchEntitiesMetadata(
            existingAdIds,
            "id,name,status,effective_status"
          ),
        ]);

        for (const cmp of syncableCampaigns) {
          const rCamp = cmp.meta_campaign_id
            ? campaignMeta[cmp.meta_campaign_id]
            : undefined;
          const rAdSet = cmp.meta_adset_id
            ? adsetMeta[cmp.meta_adset_id]
            : undefined;

          const cmpPatch: Partial<{
            name: string;
            daily_budget_cents: number;
            status: "ACTIVE" | "PAUSED" | "ARCHIVED";
          }> = {};

          const remoteCampName =
            typeof rCamp?.name === "string" ? rCamp.name.trim() : "";
          if (remoteCampName && remoteCampName !== cmp.name) {
            cmpPatch.name = remoteCampName;
            cmp.name = remoteCampName;
          }

          const rawDailyBudget = rAdSet?.daily_budget;
          const parsedBudget = Number(rawDailyBudget);
          if (
            rawDailyBudget !== undefined &&
            Number.isFinite(parsedBudget) &&
            parsedBudget > 0 &&
            Math.round(parsedBudget) !== cmp.daily_budget_cents
          ) {
            cmpPatch.daily_budget_cents = Math.round(parsedBudget);
            cmp.daily_budget_cents = Math.round(parsedBudget);
          }

          const mappedStatus = mapMetaEntityStatus(
            rCamp?.status,
            rCamp?.effective_status
          );
          if (mappedStatus && mappedStatus !== cmp.status) {
            cmpPatch.status = mappedStatus;
            cmp.status = mappedStatus;
          }

          if (Object.keys(cmpPatch).length > 0) {
            await updateAdCampaignRecord(cmp.id, cmpPatch);
            metadataSynced += 1;
          }

          const children = adsByCampaign.get(cmp.id) || [];
          for (const ch of children) {
            if (!ch.meta_ad_id) continue;
            const rAd = existingAdMeta[ch.meta_ad_id];
            if (!rAd) continue;

            const adPatch: Partial<{
              ad_name: string;
              status: "ACTIVE" | "PAUSED" | "ARCHIVED";
            }> = {};
            const remoteAdName =
              typeof rAd.name === "string" ? rAd.name.trim() : "";
            if (remoteAdName && remoteAdName !== ch.ad_name) {
              adPatch.ad_name = remoteAdName;
              ch.ad_name = remoteAdName;
            }
            const mappedAdStatus = mapMetaEntityStatus(
              rAd.status,
              rAd.effective_status
            );
            if (mappedAdStatus && mappedAdStatus !== ch.status) {
              adPatch.status = mappedAdStatus;
              ch.status = mappedAdStatus;
            }
            if (Object.keys(adPatch).length > 0) {
              await updateAdCampaignAdRecord(ch.id, adPatch);
              metadataSynced += 1;
            }
          }

          if (cmp.meta_adset_id && cmp.status !== "ARCHIVED") {
            const remoteAdsInSet = await metaAds
              .listAdsInAdSet(cmp.meta_adset_id)
              .catch(() => []);
            const knownMetaAdIds = new Set(
              children.map((c) => c.meta_ad_id).filter(Boolean)
            );
            for (const rAd of remoteAdsInSet) {
              if (!rAd.id || knownMetaAdIds.has(rAd.id)) continue;
              const rStatus = mapMetaEntityStatus(
                rAd.status,
                rAd.effective_status
              );
              if (rStatus === "ARCHIVED") continue;

              const imported = await createAdCampaignAdRecord({
                campaign_id: cmp.id,
                company_id: companyId,
                post_id:
                  rAd.id === cmp.meta_ad_id ? cmp.post_id || null : null,
                ad_name: rAd.name,
                headline: rAd.creative?.title?.trim() || rAd.name,
                primary_text: rAd.creative?.body?.trim() || "",
                image_url:
                  rAd.creative?.image_url ||
                  rAd.creative?.thumbnail_url ||
                  null,
                meta_creative_id: rAd.creative?.id || null,
                meta_ad_id: rAd.id,
                status: rStatus === "ACTIVE" ? "ACTIVE" : "PAUSED",
              });
              children.push(imported);
              adsByCampaign.set(cmp.id, children);
              metadataSynced += 1;
            }
          }
        }
      } catch (metaErr) {
        errors.push(
          `Sincronização cadastral: ${
            metaErr instanceof Error ? metaErr.message : String(metaErr)
          }`
        );
      }
    }

    const trackable = campaigns.filter((c) => {
      if (c.provider !== "META") return false;
      if (c.status !== "ACTIVE" && c.status !== "PAUSED") return false;
      const children = adsByCampaign.get(c.id) || [];
      return Boolean(c.meta_ad_id) || children.some((a) => Boolean(a.meta_ad_id));
    });
    if (trackable.length === 0) {
      return { campaignsUpdated: 0, metadataSynced, autoPaused: 0, errors };
    }

    const byAccount = new Map<string, AdCampaignRecord[]>();
    for (const cmp of trackable) {
      const list = byAccount.get(cmp.ad_account_id) || [];
      list.push(cmp);
      byAccount.set(cmp.ad_account_id, list);
    }

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
        const adIdSet = new Set<string>();
        for (const cmp of accountCampaigns) {
          const children = adsByCampaign.get(cmp.id) || [];
          if (children.length > 0) {
            for (const ch of children) {
              if (
                ch.meta_ad_id &&
                (ch.status === "ACTIVE" || ch.status === "PAUSED")
              ) {
                adIdSet.add(ch.meta_ad_id);
              }
            }
          } else if (cmp.meta_ad_id) {
            adIdSet.add(cmp.meta_ad_id);
          }
        }

        const adIds = Array.from(adIdSet);
        const insightsMap =
          adIds.length > 0
            ? await metaAds.fetchMultiWindowAdInsights(accountId, adIds)
            : {};
        const nowIso = new Date().toISOString();

        for (const cmp of accountCampaigns) {
          const children = adsByCampaign.get(cmp.id) || [];
          let snapshot: AdInsightsSnapshot = {};

          if (children.length > 0) {
            const childSnapshots: AdInsightsSnapshot[] = [];
            for (const ch of children) {
              if (!ch.meta_ad_id) continue;
              const adSnap = insightsMap[ch.meta_ad_id] || {};
              childSnapshots.push(adSnap);
              const adDecision = PerformanceAnalyzerService.decide({
                snapshot: adSnap,
                account: accConfig,
                campaignCreatedAt: ch.created_at || cmp.created_at,
              });
              await updateAdCampaignAdRecord(ch.id, {
                last_verdict: adDecision.verdict,
                last_verdict_reason: adDecision.reason,
                last_insights_json: {
                  ...adSnap,
                  creative_fatigue: adDecision.creativeFatigue,
                },
                last_insights_at: nowIso,
              });
            }
            snapshot = aggregateAdSnapshots(childSnapshots);
          } else {
            snapshot = cmp.meta_ad_id ? insightsMap[cmp.meta_ad_id] || {} : {};
          }

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

    return { campaignsUpdated, metadataSynced, autoPaused, errors };
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
      const res = await MetricsFetcherWorker.syncCompanyCampaignMetrics(cid);
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
    companyId: string,
    options?: {
      aiProvider?: AdsAIProviderPreference;
      adAccountId?: string | null;
    }
  ): Promise<AdsAdvisorReport> {
    const [allCampaigns, posts, secrets, accounts] = await Promise.all([
      listAdCampaignsByCompany(companyId, 60),
      listPostsHistory(companyId, 60),
      getCompanySecrets(companyId),
      listAdAccountsByCompany(companyId, "META"),
    ]);

    const scopedAccId =
      options?.adAccountId && options.adAccountId !== "ALL"
        ? normalizeAdAccountId(options.adAccountId)
        : "";
    const campaigns = scopedAccId
      ? allCampaigns.filter((c) => c.ad_account_id === scopedAccId)
      : allCampaigns;
    const targetAccount =
      (scopedAccId
        ? accounts.find((a) => a.ad_account_id === scopedAccId)
        : null) ||
      accounts.find((a) => a.is_default) ||
      accounts[0] ||
      null;
    const preferredProvider: AdsAIProviderPreference =
      options?.aiProvider && options.aiProvider !== "AUTO"
        ? options.aiProvider
        : targetAccount?.preferred_ai_provider || "AUTO";

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
        anthropicKey: secrets.anthropic_api_key,
        preferredProvider,
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
    const [secrets, adAccounts, rawCampaigns, rawAds] = await Promise.all([
      getCompanySecrets(companyId),
      listAdAccountsByCompany(companyId, "META"),
      listAdCampaignsByCompany(companyId, 100),
      listAdCampaignAdsByCompany(companyId),
    ]);

    const adsByCampaign = new Map<string, AdCampaignAdRecord[]>();
    for (const ad of rawAds) {
      const list = adsByCampaign.get(ad.campaign_id) || [];
      list.push(ad);
      adsByCampaign.set(ad.campaign_id, list);
    }

    const campaigns = rawCampaigns.map((cmp) => {
      const childAds = adsByCampaign.get(cmp.id);
      if (childAds && childAds.length > 0) {
        return { ...cmp, ads: childAds };
      }
      if (cmp.meta_ad_id) {
        const legacyAd: AdCampaignAdRecord = {
          id: `legacy_${cmp.id}`,
          campaign_id: cmp.id,
          company_id: cmp.company_id,
          post_id: cmp.post_id || null,
          ad_name: cmp.name,
          headline: cmp.name,
          primary_text: cmp.user_prompt || "",
          image_url: null,
          story_image_url: null,
          source_story_id: cmp.source_story_id || null,
          meta_creative_id: cmp.meta_creative_id || null,
          meta_ad_id: cmp.meta_ad_id,
          status: cmp.status,
          last_verdict: cmp.last_verdict || null,
          last_verdict_reason: cmp.last_verdict_reason || null,
          last_insights_json: cmp.last_insights_json || {},
          last_insights_at: cmp.last_insights_at || null,
          error_message: cmp.error_message || null,
          created_at: cmp.created_at,
          updated_at: cmp.updated_at,
        };
        return { ...cmp, ads: [legacyAd] };
      }
      return { ...cmp, ads: [] };
    });

    return {
      has_meta_token: Boolean(secrets.meta_access_token),
      has_ig_user_id: Boolean(secrets.ig_user_id),
      has_fb_page_id: Boolean(secrets.fb_page_id),
      available_ai_providers: {
        gemini: Boolean(secrets.gemini_api_key?.trim()),
        openai: Boolean(secrets.openai_api_key?.trim()),
        claude: Boolean(secrets.anthropic_api_key?.trim()),
      },
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
    userId?: string | null;
    ad_account_id: string;
    account_name?: string;
    currency?: string;
    account_status?: number | null;
    is_default?: boolean;
    preferred_ai_provider?: AdsAIProviderPreference;
    cpa_maximo?: number;
    roas_minimo?: number;
    amostra_minima_cliques?: number;
    link_destino_padrao?: string | null;
    localizacao_base?: string;
    auto_pause_enabled?: boolean;
  }) {
    return upsertAdAccountConfig({
      company_id: input.companyId,
      user_id: input.userId || null,
      provider: "META",
      ad_account_id: input.ad_account_id,
      account_name: input.account_name,
      currency: input.currency,
      account_status: input.account_status,
      is_default: input.is_default,
      preferred_ai_provider: input.preferred_ai_provider,
      cpa_maximo: input.cpa_maximo,
      roas_minimo: input.roas_minimo,
      amostra_minima_cliques: input.amostra_minima_cliques,
      link_destino_padrao: input.link_destino_padrao,
      localizacao_base: input.localizacao_base,
      auto_pause_enabled: input.auto_pause_enabled,
    });
  }

  static async setDefaultAdAccount(
    companyId: string,
    accountRowId: string,
    userId?: string | null
  ) {
    return setDefaultAdAccount(companyId, accountRowId, userId);
  }

  static async deleteAdAccount(
    companyId: string,
    accountRowId: string,
    userId?: string | null
  ) {
    return deleteAdAccountConfig(companyId, accountRowId, userId);
  }

  static async previewCampaignPlan(params: {
    companyId: string;
    postId: string;
    channel: AdChannel;
    userPrompt: string;
    adAccountId?: string | null;
    aiProvider?: AdsAIProviderPreference;
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
      aiProvider: params.aiProvider,
      keys: {
        gemini: secrets.gemini_api_key,
        openai: secrets.openai_api_key,
        anthropic: secrets.anthropic_api_key,
      },
    });
  }

  static async launchCampaign(
    params: Parameters<typeof CampaignLauncherService.launchFromExistingPost>[0]
  ) {
    return CampaignLauncherService.launchFromExistingPost(params);
  }

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

    if (campaign.meta_adset_id && params.status !== "ARCHIVED") {
      await metaAds
        .toggleEntityStatus(campaign.meta_adset_id, params.status)
        .catch(() => null);
    }

    const childAds = await listAdCampaignAdsByCompany(
      params.companyId,
      campaign.id
    );
    if (childAds.length > 0 && params.status !== "ARCHIVED") {
      for (const ch of childAds) {
        if (ch.meta_ad_id && ch.status !== "ARCHIVED" && ch.status !== "ERROR") {
          await metaAds
            .toggleEntityStatus(ch.meta_ad_id, params.status)
            .catch(() => null);
          await updateAdCampaignAdRecord(ch.id, { status: params.status });
        }
      }
    } else if (campaign.meta_ad_id && params.status !== "ARCHIVED") {
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

  static async toggleAdStatus(params: {
    companyId: string;
    adId: string;
    status: "ACTIVE" | "PAUSED" | "ARCHIVED";
    userId?: string | null;
  }) {
    const secrets = await getCompanySecrets(params.companyId);
    if (!secrets.meta_access_token) {
      throw new Error("Token Meta não configurado.");
    }

    if (params.adId.startsWith("legacy_")) {
      const legacyCmpId = params.adId.slice("legacy_".length);
      const cmp = await getAdCampaignById(legacyCmpId, params.companyId);
      if (!cmp || !cmp.meta_ad_id) {
        throw new Error("Anúncio não encontrado para esta campanha.");
      }
      const metaAds = new MetaAdsService(secrets.meta_access_token);
      await metaAds.toggleEntityStatus(cmp.meta_ad_id, params.status);
      return { id: params.adId, status: params.status };
    }

    const adRecord = await getAdCampaignAdById(params.adId, params.companyId);
    if (!adRecord) {
      throw new Error("Anúncio não encontrado para esta empresa.");
    }
    if (!adRecord.meta_ad_id) {
      throw new Error("Este anúncio não possui meta_ad_id válido na Meta.");
    }

    const metaAds = new MetaAdsService(secrets.meta_access_token);
    await metaAds.toggleEntityStatus(adRecord.meta_ad_id, params.status);
    const updated = await updateAdCampaignAdRecord(adRecord.id, {
      status: params.status,
    });

    await appendAuditLog({
      company_id: params.companyId,
      user_id: params.userId || null,
      action: `AD_CREATIVE_STATUS_${params.status}`,
      details_json: {
        ad_campaign_ad_id: adRecord.id,
        campaign_id: adRecord.campaign_id,
        meta_ad_id: adRecord.meta_ad_id,
      },
    });

    return updated;
  }

  static async addCreativesToCampaign(params: {
    companyId: string;
    campaignId: string;
    creatives: CreativePostInput[];
    userId?: string | null;
  }): Promise<{
    addedAds: AdCampaignAdRecord[];
    failedCount: number;
    stepsLog: string[];
  }> {
    const [secrets, campaign, existingAds, posts, accounts] =
      await Promise.all([
        getCompanySecrets(params.companyId),
        getAdCampaignById(params.campaignId, params.companyId),
        listAdCampaignAdsByCompany(params.companyId, params.campaignId),
        listPostsHistory(params.companyId, 150),
        listAdAccountsByCompany(params.companyId, "META"),
      ]);

    if (!campaign) {
      throw new Error("Campanha não encontrada para esta empresa.");
    }
    if (campaign.provider !== "META") {
      throw new Error("Adição de múltiplos criativos suportada apenas no Meta Ads.");
    }
    if (!campaign.meta_adset_id) {
      throw new Error(
        "Esta campanha não possui Conjunto de Anúncios (meta_adset_id) criado na Meta."
      );
    }
    if (campaign.status === "ARCHIVED") {
      throw new Error("Não é possível adicionar criativos a uma campanha arquivada.");
    }
    if (!secrets.meta_access_token || !secrets.fb_page_id) {
      throw new Error(
        "Token da Meta ou Página do Facebook (fb_page_id) não configurados."
      );
    }

    const seen = new Set<string>();
    const selectedEntries: Array<{
      post: (typeof posts)[number];
      input: CreativePostInput;
    }> = [];

    for (const item of params.creatives || []) {
      const pid = String(item.postId || "").trim();
      if (!pid || seen.has(pid)) continue;
      seen.add(pid);
      const found = posts.find((p) => p.id === pid);
      if (!found) {
        throw new Error(`Post (${pid}) não encontrado.`);
      }
      if (!found.fb_post_id && !found.ig_post_id && !found.image_urls_json?.[0]) {
        throw new Error(
          `Post "${found.headline}" não possui publicação nem imagem válida para Meta Ads.`
        );
      }
      selectedEntries.push({ post: found, input: item });
      if (selectedEntries.length >= 10) break;
    }

    if (selectedEntries.length === 0) {
      throw new Error("Selecione pelo menos 1 post publicado para adicionar.");
    }

    const defaultsRaw = (campaign.targeting_json?._creative_defaults || {}) as {
      destination_url?: string | null;
      pixel_id?: string | null;
      url_tags?: string | null;
      welcome_greeting?: string | null;
      welcome_autofill?: string | null;
    };
    const accountCfg = accounts.find(
      (a) => a.ad_account_id === campaign.ad_account_id
    );
    const destinationUrl =
      defaultsRaw.destination_url || accountCfg?.link_destino_padrao || null;

    const metaAds = new MetaAdsService(secrets.meta_access_token);
    const stepsLog: string[] = [];
    const addedAds: AdCampaignAdRecord[] = [];
    let failedCount = 0;

    for (let i = 0; i < selectedEntries.length; i += 1) {
      const { post, input } = selectedEntries[i];
      const adResult = await metaAds.createAdInAdSet({
        adAccountId: campaign.ad_account_id,
        adsetId: campaign.meta_adset_id,
        campaignName: campaign.name,
        objective: normalizeObjective(campaign.objective),
        destinationType: campaign.destination_type,
        fbPageId: secrets.fb_page_id,
        igUserId: secrets.ig_user_id,
        destinationUrl,
        pixelId: defaultsRaw.pixel_id ?? null,
        urlTags: defaultsRaw.url_tags ?? null,
        itemIndex: existingAds.length + 1 + i,
        item: {
          postId: post.id,
          fbPostId: post.fb_post_id,
          igMediaId: post.ig_post_id,
          postImageUrl: post.image_urls_json?.[0] || null,
          postStoryImageUrl:
            post.story_image_urls_json?.[0] ||
            post.content_json?.story_image_urls?.[0] ||
            null,
          postHeadline: input.headline?.trim() || post.headline,
          postCaption:
            input.primaryText?.trim() || post.content_json?.legenda || "",
          welcomeGreeting: defaultsRaw.welcome_greeting ?? null,
          welcomeAutofill: defaultsRaw.welcome_autofill ?? null,
        },
      });
      stepsLog.push(...adResult.stepsLog);
      if (adResult.status === "ERROR") failedCount += 1;

      const savedAd = await createAdCampaignAdRecord({
        campaign_id: campaign.id,
        company_id: params.companyId,
        post_id: adResult.postId,
        ad_name: adResult.adName,
        headline: adResult.headline,
        primary_text: adResult.primaryText,
        image_url: adResult.imageUrl,
        story_image_url: adResult.storyImageUrl,
        source_story_id: adResult.sourceStoryId || null,
        meta_creative_id: adResult.creativeId,
        meta_ad_id: adResult.adId,
        status: adResult.status === "ERROR" ? "ERROR" : "PAUSED",
        error_message: adResult.errorMessage || null,
      });
      addedAds.push(savedAd);

      if (!campaign.meta_ad_id && adResult.adId) {
        await updateAdCampaignRecord(campaign.id, {
          meta_ad_id: adResult.adId,
          meta_creative_id: adResult.creativeId,
        });
      }
    }

    await appendAuditLog({
      company_id: params.companyId,
      user_id: params.userId || null,
      action: "AD_CAMPAIGN_CREATIVES_ADDED",
      details_json: {
        ad_campaign_id: campaign.id,
        added_count: addedAds.length,
        failed_count: failedCount,
      },
    });

    return { addedAds, failedCount, stepsLog };
  }

  static async getCampaignEditDetails(companyId: string, campaignId: string) {
    const [secrets, campaign] = await Promise.all([
      getCompanySecrets(companyId),
      getAdCampaignById(campaignId, companyId),
    ]);
    if (!campaign) {
      throw new Error("Campanha não encontrada para esta empresa.");
    }

    let adsetDetails: Awaited<
      ReturnType<MetaAdsService["fetchAdSetDetails"]>
    > | null = null;
    if (
      campaign.provider === "META" &&
      campaign.meta_adset_id &&
      secrets.meta_access_token
    ) {
      const metaAds = new MetaAdsService(secrets.meta_access_token);
      adsetDetails = await metaAds
        .fetchAdSetDetails(campaign.meta_adset_id)
        .catch(() => null);
    }

    const dbTargeting = (campaign.targeting_json || {}) as Record<
      string,
      unknown
    >;
    const liveTargeting = (adsetDetails?.targeting || dbTargeting) as Record<
      string,
      unknown
    >;
    const geo = (liveTargeting.geo_locations || {}) as {
      countries?: string[];
      cities?: Array<{ key?: string; radius?: number }>;
      regions?: Array<{ key?: string }>;
      neighborhoods?: Array<{ key?: string }>;
      subcities?: Array<{ key?: string }>;
      zips?: Array<{ key?: string }>;
      custom_locations?: Array<{
        latitude?: number;
        longitude?: number;
        radius?: number;
        name?: string;
      }>;
    };

    const storedLabel =
      typeof dbTargeting._location_label === "string"
        ? dbTargeting._location_label.trim()
        : "";
    let locationSummary = storedLabel;
    let locationRadiusKm = 20;

    if (geo.custom_locations?.length) {
      const pin = geo.custom_locations[0];
      locationRadiusKm = Number(pin.radius || 5);
      const isGenericStored =
        !locationSummary || /^bra[sz]il/i.test(locationSummary);
      if (isGenericStored) {
        let friendlyName = pin.name?.trim() || "";
        if (
          !friendlyName &&
          typeof pin.latitude === "number" &&
          typeof pin.longitude === "number"
        ) {
          try {
            const revRes = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${pin.latitude}&lon=${pin.longitude}&zoom=14&accept-language=pt-BR`,
              {
                headers: { "User-Agent": "SocialPilotFlow/1.0" },
                signal: AbortSignal.timeout(2500),
              }
            );
            if (revRes.ok) {
              const revData = (await revRes.json()) as {
                address?: {
                  suburb?: string;
                  neighbourhood?: string;
                  city?: string;
                  town?: string;
                  municipality?: string;
                  state?: string;
                };
              };
              const addr = revData.address;
              const neigh = addr?.suburb || addr?.neighbourhood || "";
              const city = addr?.city || addr?.town || addr?.municipality || "";
              friendlyName = [neigh, city, addr?.state]
                .filter(Boolean)
                .slice(0, 2)
                .join(", ");
            }
          } catch {
            // fallback para nome genérico abaixo
          }
        }
        locationSummary = friendlyName
          ? `${friendlyName} (Raio ${locationRadiusKm} km)`
          : `Pino no mapa (Raio ${locationRadiusKm} km)`;
      }
    } else if (geo.cities?.length) {
      locationRadiusKm = Number(geo.cities[0].radius || 20);
      if (!locationSummary || /^bra[sz]il/i.test(locationSummary)) {
        locationSummary = `Cidade selecionada (Raio ${locationRadiusKm} km)`;
      }
    } else if (geo.neighborhoods?.length && !locationSummary) {
      locationSummary = `Bairro (ID ${geo.neighborhoods[0].key || "—"})`;
    } else if (geo.subcities?.length && !locationSummary) {
      locationSummary = `Sub-região (ID ${geo.subcities[0].key || "—"})`;
    } else if (geo.zips?.length && !locationSummary) {
      locationSummary = `CEP (${geo.zips[0].key || "—"})`;
    } else if (geo.regions?.length && !locationSummary) {
      locationSummary = `Estado (ID ${geo.regions[0].key || "—"})`;
    } else if (geo.countries?.length) {
      locationSummary = geo.countries.includes("BR")
        ? "Brasil (Todo o país)"
        : `País: ${geo.countries.join(", ")}`;
    }

    const startTime =
      adsetDetails?.start_time ||
      (typeof dbTargeting._start_time === "string"
        ? dbTargeting._start_time
        : null);
    const endTime =
      adsetDetails?.end_time ||
      (typeof dbTargeting._end_time === "string" ? dbTargeting._end_time : null);
    const noEndDate = adsetDetails
      ? !adsetDetails.end_time
      : typeof dbTargeting._no_end_date === "boolean"
        ? dbTargeting._no_end_date
        : !endTime;

    return {
      campaign_name: campaign.name,
      adset_name:
        adsetDetails?.name ||
        (typeof dbTargeting._adset_name === "string"
          ? dbTargeting._adset_name
          : `${campaign.name} — AdSet`),
      daily_budget_cents:
        adsetDetails?.daily_budget_cents ?? campaign.daily_budget_cents,
      currency: campaign.currency,
      age_min: Number(liveTargeting.age_min ?? 22),
      age_max: Number(liveTargeting.age_max ?? 55),
      genders: Array.isArray(liveTargeting.genders)
        ? (liveTargeting.genders as Array<1 | 2>)
        : [],
      location_summary: locationSummary || "Brasil",
      location_radius_km: locationRadiusKm,
      start_time: startTime,
      end_time: endTime,
      no_end_date: noEndDate,
    };
  }

  static async updateCampaignDetails(params: {
    companyId: string;
    campaignId: string;
    name?: string;
    adsetName?: string;
    dailyBudgetCents?: number;
    audienceChanged?: boolean;
    ageMin?: number;
    ageMax?: number;
    genders?: Array<1 | 2>;
    locationQuery?: string;
    locationRadiusKm?: number;
    selectedLocation?: AdGeoLocationSelection | null;
    scheduleChanged?: boolean;
    startTime?: string | null;
    endTime?: string | null;
    noEndDate?: boolean;
    adNames?: Array<{ id: string; adName: string }>;
    userId?: string | null;
  }) {
    const [secrets, campaign, existingAds] = await Promise.all([
      getCompanySecrets(params.companyId),
      getAdCampaignById(params.campaignId, params.companyId),
      listAdCampaignAdsByCompany(params.companyId, params.campaignId),
    ]);

    if (!campaign) {
      throw new Error("Campanha não encontrada para esta empresa.");
    }
    if (campaign.provider !== "META") {
      throw new Error("Edição direta suportada apenas para campanhas Meta Ads.");
    }
    if (!campaign.meta_campaign_id) {
      throw new Error("Campanha sem meta_campaign_id criado na Meta Ads.");
    }
    if (campaign.status === "ARCHIVED" || campaign.status === "ERROR") {
      throw new Error(
        "Não é possível editar uma campanha com status ERROR ou ARCHIVED."
      );
    }
    if (!secrets.meta_access_token) {
      throw new Error("Token Meta não configurado.");
    }

    const metaAds = new MetaAdsService(secrets.meta_access_token);
    const dbPatch: Partial<{
      name: string;
      daily_budget_cents: number;
      targeting_json: Record<string, unknown>;
    }> = {};
    const nextTargetingJson: Record<string, unknown> = {
      ...(campaign.targeting_json || {}),
    };

    const nextName = params.name?.trim();
    if (nextName && nextName !== campaign.name) {
      await metaAds.updateCampaignFields(campaign.meta_campaign_id, {
        name: nextName,
      });
      dbPatch.name = nextName;
    }

    const nextBudget =
      params.dailyBudgetCents !== undefined &&
      Number.isFinite(params.dailyBudgetCents)
        ? Math.round(params.dailyBudgetCents)
        : undefined;
    const nextAdsetName = params.adsetName?.trim();

    const adsetUpdate: {
      name?: string;
      dailyBudgetCents?: number;
      currency?: string;
      targeting?: Record<string, unknown>;
      startTime?: string | null;
      endTime?: string | null;
      noEndDate?: boolean;
    } = {};

    if (nextAdsetName) {
      const prevAdsetName =
        typeof nextTargetingJson._adset_name === "string"
          ? nextTargetingJson._adset_name
          : "";
      if (nextAdsetName !== prevAdsetName) {
        adsetUpdate.name = nextAdsetName;
        nextTargetingJson._adset_name = nextAdsetName;
      }
    }

    if (nextBudget !== undefined && nextBudget !== campaign.daily_budget_cents) {
      adsetUpdate.dailyBudgetCents = nextBudget;
      adsetUpdate.currency = campaign.currency;
      dbPatch.daily_budget_cents = nextBudget;
    }

    if (params.audienceChanged) {
      const liveDetails = campaign.meta_adset_id
        ? await metaAds.fetchAdSetDetails(campaign.meta_adset_id).catch(() => null)
        : null;
      const baseMetaTargeting: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(
        liveDetails?.targeting || campaign.targeting_json || {}
      )) {
        if (!k.startsWith("_")) {
          baseMetaTargeting[k] = v;
        }
      }

      const ageMin = Math.max(
        18,
        Math.min(
          65,
          Math.round(
            params.ageMin ?? Number(baseMetaTargeting.age_min ?? 22)
          )
        )
      );
      const ageMax = Math.max(
        ageMin,
        Math.min(
          65,
          Math.round(
            params.ageMax ?? Number(baseMetaTargeting.age_max ?? 55)
          )
        )
      );
      baseMetaTargeting.age_min = ageMin;
      baseMetaTargeting.age_max = ageMax;

      if (params.genders !== undefined) {
        if (params.genders.length > 0) {
          baseMetaTargeting.genders = params.genders;
        } else {
          delete baseMetaTargeting.genders;
        }
      }

      if (params.selectedLocation || params.locationQuery?.trim()) {
        const geoPlan: ParsedCampaignPlan = {
          name: campaign.name,
          objective: normalizeObjective(campaign.objective),
          optimization_goal: campaign.optimization_goal,
          destination_type: campaign.destination_type ?? null,
          daily_budget_cents: campaign.daily_budget_cents,
          duration_days: campaign.duration_days ?? null,
          location_query: params.locationQuery?.trim() || "Brasil",
          location_radius_km: params.locationRadiusKm ?? 20,
          selected_location: params.selectedLocation ?? null,
          age_min: ageMin,
          age_max: ageMax,
          genders: params.genders ?? [],
          destination_url: null,
          reasoning: "",
          parser_provider: "manual_edit",
        };
        const resolvedGeo = await CampaignLauncherService.resolveGeoTargeting(
          metaAds,
          geoPlan
        );
        if (resolvedGeo.geo_locations) {
          baseMetaTargeting.geo_locations = resolvedGeo.geo_locations;
        }
        nextTargetingJson._location_label =
          params.selectedLocation?.type === "country"
            ? "Brasil (Todo o país)"
            : params.selectedLocation?.label ||
              params.locationQuery?.trim() ||
              "Brasil (Todo o país)";
      }

      adsetUpdate.targeting = baseMetaTargeting;
      for (const [k, v] of Object.entries(baseMetaTargeting)) {
        nextTargetingJson[k] = v;
      }
      if (!baseMetaTargeting.genders) {
        delete nextTargetingJson.genders;
      }
    }

    if (params.scheduleChanged) {
      if (params.noEndDate) {
        adsetUpdate.noEndDate = true;
        nextTargetingJson._no_end_date = true;
        nextTargetingJson._end_time = null;
      } else {
        adsetUpdate.noEndDate = false;
        nextTargetingJson._no_end_date = false;
        if (params.endTime !== undefined) {
          adsetUpdate.endTime = params.endTime;
          nextTargetingJson._end_time = params.endTime;
        }
      }
      if (params.startTime) {
        const startDate = new Date(params.startTime);
        if (!Number.isNaN(startDate.getTime())) {
          if (
            !params.noEndDate &&
            params.endTime &&
            new Date(params.endTime).getTime() <= startDate.getTime() + 60_000
          ) {
            throw new Error(
              "A data/hora de término deve ser posterior à data/hora de início."
            );
          }
          if (startDate.getTime() > Date.now() + 60_000) {
            adsetUpdate.startTime = params.startTime;
          }
          nextTargetingJson._start_time = params.startTime;
        }
      }
    }

    if (Object.keys(adsetUpdate).length > 0) {
      if (!campaign.meta_adset_id) {
        throw new Error(
          "Campanha sem Conjunto de Anúncios (meta_adset_id) para editar."
        );
      }
      await metaAds.updateAdSetFields(campaign.meta_adset_id, adsetUpdate);
      dbPatch.targeting_json = nextTargetingJson;
    }

    let adsRenamed = 0;
    if (Array.isArray(params.adNames) && params.adNames.length > 0) {
      for (const entry of params.adNames) {
        const cleanAdName = entry.adName?.trim().slice(0, 120);
        if (!cleanAdName) continue;
        if (entry.id.startsWith("legacy_")) {
          if (campaign.meta_ad_id && cleanAdName !== campaign.name) {
            await metaAds.updateAdFields(campaign.meta_ad_id, {
              name: cleanAdName,
            });
            await createAdCampaignAdRecord({
              campaign_id: campaign.id,
              company_id: params.companyId,
              post_id: campaign.post_id || null,
              ad_name: cleanAdName,
              headline: campaign.name,
              primary_text: campaign.user_prompt || "",
              source_story_id: campaign.source_story_id || null,
              meta_creative_id: campaign.meta_creative_id || null,
              meta_ad_id: campaign.meta_ad_id,
              status:
                campaign.status === "ACTIVE" || campaign.status === "PAUSED"
                  ? campaign.status
                  : "PAUSED",
            });
            adsRenamed += 1;
          }
          continue;
        }

        const existing = existingAds.find((a) => a.id === entry.id);
        if (
          existing &&
          existing.meta_ad_id &&
          cleanAdName !== existing.ad_name
        ) {
          await metaAds.updateAdFields(existing.meta_ad_id, {
            name: cleanAdName,
          });
          await updateAdCampaignAdRecord(existing.id, { ad_name: cleanAdName });
          adsRenamed += 1;
        }
      }
    }

    if (Object.keys(dbPatch).length === 0 && adsRenamed === 0) {
      return campaign;
    }

    const updated =
      Object.keys(dbPatch).length > 0
        ? await updateAdCampaignRecord(campaign.id, dbPatch)
        : campaign;

    await appendAuditLog({
      company_id: params.companyId,
      user_id: params.userId || null,
      action: "AD_CAMPAIGN_UPDATED",
      details_json: {
        ad_campaign_id: campaign.id,
        meta_campaign_id: campaign.meta_campaign_id,
        updated_fields: Object.keys(dbPatch),
        audience_changed: Boolean(params.audienceChanged),
        schedule_changed: Boolean(params.scheduleChanged),
        ads_renamed: adsRenamed,
      },
    });

    return updated;
  }

  static async updateAdDetails(params: {
    companyId: string;
    adId: string;
    adName?: string;
    headline?: string;
    primaryText?: string;
    userId?: string | null;
  }) {
    const secrets = await getCompanySecrets(params.companyId);
    if (!secrets.meta_access_token || !secrets.fb_page_id) {
      throw new Error(
        "Token da Meta ou Página do Facebook (fb_page_id) não configurados."
      );
    }

    const isLegacy = params.adId.startsWith("legacy_");
    let adRecord = isLegacy
      ? null
      : await getAdCampaignAdById(params.adId, params.companyId);
    const campaignId = isLegacy
      ? params.adId.slice("legacy_".length)
      : adRecord?.campaign_id || "";

    const campaign = campaignId
      ? await getAdCampaignById(campaignId, params.companyId)
      : null;
    if (!campaign) {
      throw new Error("Campanha vinculada ao anúncio não encontrada.");
    }

    const targetMetaAdId = isLegacy
      ? campaign.meta_ad_id || ""
      : adRecord?.meta_ad_id || "";
    if (!targetMetaAdId) {
      throw new Error("Este anúncio não possui meta_ad_id válido na Meta.");
    }

    const posts = await listPostsHistory(params.companyId, 150);
    const linkedPost =
      posts.find((p) => p.id === (adRecord?.post_id || campaign.post_id)) ||
      null;

    const currentAdName = adRecord?.ad_name || campaign.name;
    const currentHeadline =
      adRecord?.headline || linkedPost?.headline || campaign.name;
    const currentPrimaryText =
      adRecord?.primary_text ||
      linkedPost?.content_json?.legenda ||
      campaign.user_prompt ||
      "";
    const imageUrl =
      adRecord?.image_url || linkedPost?.image_urls_json?.[0] || null;

    const nextAdName = params.adName?.trim() || currentAdName;
    const nextHeadline =
      params.headline !== undefined ? params.headline.trim() : currentHeadline;
    const nextPrimaryText =
      params.primaryText !== undefined
        ? params.primaryText.trim()
        : currentPrimaryText;

    const creativeChanged =
      nextHeadline !== currentHeadline || nextPrimaryText !== currentPrimaryText;
    const nameChanged = nextAdName !== currentAdName;

    if (!creativeChanged && !nameChanged) {
      return adRecord || { id: params.adId };
    }

    const defaultsRaw = (campaign.targeting_json?._creative_defaults || {}) as {
      destination_url?: string | null;
      url_tags?: string | null;
      welcome_greeting?: string | null;
      welcome_autofill?: string | null;
    };
    const accounts = await listAdAccountsByCompany(params.companyId, "META");
    const accCfg = accounts.find(
      (a) => a.ad_account_id === campaign.ad_account_id
    );

    const metaAds = new MetaAdsService(secrets.meta_access_token);
    const res = await metaAds.updateAdCreativeAndFields({
      adAccountId: campaign.ad_account_id,
      adId: targetMetaAdId,
      adName: nextAdName,
      headline: nextHeadline,
      primaryText: nextPrimaryText,
      imageUrl,
      objective: normalizeObjective(campaign.objective),
      destinationType: campaign.destination_type,
      fbPageId: secrets.fb_page_id,
      igUserId: secrets.ig_user_id,
      destinationUrl:
        defaultsRaw.destination_url || accCfg?.link_destino_padrao || null,
      urlTags: defaultsRaw.url_tags ?? null,
      welcomeGreeting: defaultsRaw.welcome_greeting ?? null,
      welcomeAutofill: defaultsRaw.welcome_autofill ?? null,
      creativeChanged,
    });

    if (isLegacy || !adRecord) {
      adRecord = await createAdCampaignAdRecord({
        campaign_id: campaign.id,
        company_id: params.companyId,
        post_id: linkedPost?.id || campaign.post_id || null,
        ad_name: nextAdName,
        headline: nextHeadline,
        primary_text: nextPrimaryText,
        image_url: imageUrl,
        source_story_id: campaign.source_story_id || null,
        meta_creative_id: res.creativeId || campaign.meta_creative_id || null,
        meta_ad_id: targetMetaAdId,
        status:
          campaign.status === "ACTIVE" || campaign.status === "PAUSED"
            ? campaign.status
            : "PAUSED",
      });
    } else {
      adRecord = await updateAdCampaignAdRecord(adRecord.id, {
        ad_name: nextAdName,
        headline: nextHeadline,
        primary_text: nextPrimaryText,
        ...(res.creativeId ? { meta_creative_id: res.creativeId } : {}),
      });
    }

    if (res.creativeId && campaign.meta_ad_id === targetMetaAdId) {
      await updateAdCampaignRecord(campaign.id, {
        meta_creative_id: res.creativeId,
      });
    }

    await appendAuditLog({
      company_id: params.companyId,
      user_id: params.userId || null,
      action: "AD_CREATIVE_UPDATED",
      details_json: {
        ad_campaign_id: campaign.id,
        ad_campaign_ad_id: adRecord?.id || params.adId,
        meta_ad_id: targetMetaAdId,
        creative_recreated: creativeChanged,
        new_creative_id: res.creativeId,
      },
    });

    return adRecord;
  }

  static async refreshMetricsNow(companyId: string) {
    return MetricsFetcherWorker.syncCompanyCampaignMetrics(companyId);
  }

  static async getOptimizationAdvice(
    companyId: string,
    options?: {
      aiProvider?: AdsAIProviderPreference;
      adAccountId?: string | null;
    }
  ) {
    return BudgetAndCreativeAdvisor.generateAdvisorRecommendations(
      companyId,
      options
    );
  }

  static async analyzeMetricsWithAI(params: {
    companyId: string;
    campaignId?: string | null;
    adAccountId?: string | null;
    aiProvider?: AdsAIProviderPreference;
    window?: AdInsightsWindow;
  }): Promise<AdsMetricsAIDiagnosis> {
    const windowKey: AdInsightsWindow = params.window || "7d";
    const [state, secrets] = await Promise.all([
      CampaignOrchestratorService.getAdsDashboardState(params.companyId),
      getCompanySecrets(params.companyId),
    ]);

    const normalizedAccFilter =
      params.adAccountId && params.adAccountId !== "ALL"
        ? normalizeAdAccountId(params.adAccountId)
        : null;

    let targetCampaigns = state.campaigns.filter((c) => c.provider === "META");
    if (params.campaignId) {
      targetCampaigns = targetCampaigns.filter(
        (c) => c.id === params.campaignId
      );
      if (targetCampaigns.length === 0) {
        throw new Error(
          "Campanha não encontrada para análise de métricas nesta empresa."
        );
      }
    } else if (normalizedAccFilter) {
      targetCampaigns = targetCampaigns.filter(
        (c) => c.ad_account_id === normalizedAccFilter
      );
    }

    const singleCampaign =
      targetCampaigns.length === 1 ? targetCampaigns[0] : null;
    const effectiveAccountId =
      singleCampaign?.ad_account_id || normalizedAccFilter || null;
    const matchingAccount = effectiveAccountId
      ? state.ad_accounts.find(
          (a) => a.ad_account_id === effectiveAccountId
        ) || null
      : state.default_ad_account;

    const preferredProvider: AdsAIProviderPreference =
      params.aiProvider && params.aiProvider !== "AUTO"
        ? params.aiProvider
        : singleCampaign?.ai_provider_preference &&
            singleCampaign.ai_provider_preference !== "AUTO"
          ? singleCampaign.ai_provider_preference
          : matchingAccount?.preferred_ai_provider &&
              matchingAccount.preferred_ai_provider !== "AUTO"
            ? matchingAccount.preferred_ai_provider
            : "AUTO";

    const scopeLabel = singleCampaign
      ? `Campanha "${singleCampaign.name}" (janela ${windowKey})`
      : normalizedAccFilter
        ? `Conta ${
            matchingAccount?.account_name || normalizedAccFilter
          } • ${targetCampaigns.length} campanha(s) (janela ${windowKey})`
        : `Todas as contas (${targetCampaigns.length} campanha(s) • janela ${windowKey})`;

    if (targetCampaigns.length === 0) {
      return {
        generated_at: new Date().toISOString(),
        scope_label: scopeLabel,
        campaign_id: params.campaignId || null,
        ad_account_id: effectiveAccountId,
        provider_used: "DETERMINISTIC_FALLBACK",
        summary:
          "Nenhuma campanha Meta encontrada neste filtro ainda. Crie e impulsione um post ou clique em 'Sincronizar Meta & Métricas' primeiro.",
        highlights: [],
        alerts: ["Sem campanhas disponíveis para analisar neste escopo."],
        next_actions: [
          "Impulsione um post publicado na aba Campanhas para iniciar os dados.",
        ],
      };
    }

    const metricsDigest = targetCampaigns.slice(0, 12).map((c) => {
      const wMetrics = c.last_insights_json?.windows?.[windowKey];
      const base = c.last_insights_json;
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        ad_account_id: c.ad_account_id,
        daily_budget_reais: Number((c.daily_budget_cents / 100).toFixed(2)),
        currency: c.currency,
        objective: c.objective,
        last_verdict: c.last_verdict,
        last_verdict_reason: c.last_verdict_reason,
        spend: Number(wMetrics?.spend ?? base?.spend ?? 0),
        impressions: Number(wMetrics?.impressions ?? base?.impressions ?? 0),
        clicks: Number(wMetrics?.clicks ?? base?.clicks ?? 0),
        ctr: Number(wMetrics?.ctr ?? base?.ctr ?? 0),
        cpc: Number(wMetrics?.cpc ?? base?.cpc ?? 0),
        conversions: Number(wMetrics?.conversions ?? base?.conversions ?? 0),
        cpa: wMetrics?.cpa ?? base?.cpa ?? null,
        roas: wMetrics?.roas ?? base?.roas ?? null,
        creative_fatigue: Boolean(base?.creative_fatigue),
      };
    });

    const aiRes = await runStructuredJsonWithCompanyAI<{
      summary: string;
      highlights: string[];
      alerts: string[];
      next_actions: string[];
    }>({
      geminiKey: secrets.gemini_api_key,
      openaiKey: secrets.openai_api_key,
      anthropicKey: secrets.anthropic_api_key,
      preferredProvider,
      systemPrompt:
        "Você é um analista sênior de tráfego pago (Meta Ads) para um SaaS multiempresa brasileiro. Analise os números reais fornecidos (gasto, impressões, cliques, CTR, CPC, conversões, CPA, ROAS, fadiga criativa e metas CPA máximo/ROAS mínimo) em português do Brasil claro e prático. Não invente números fora do JSON enviado. Se uma campanha tiver 0 gasto ou pouca amostra, diga isso claramente.",
      userPrompt: `Escopo: ${scopeLabel}\nMetas da conta referência: CPA máximo = ${
        matchingAccount?.cpa_maximo ?? 35
      } ${matchingAccount?.currency || "BRL"}, ROAS mínimo = ${
        matchingAccount?.roas_minimo ?? 2
      }, Amostra mínima = ${
        matchingAccount?.amostra_minima_cliques ?? 50
      } cliques.\n\nDados das campanhas (${windowKey}):\n${JSON.stringify(
        metricsDigest,
        null,
        2
      )}`,
      geminiSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          highlights: { type: Type.ARRAY, items: { type: Type.STRING } },
          alerts: { type: Type.ARRAY, items: { type: Type.STRING } },
          next_actions: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["summary", "highlights", "alerts", "next_actions"],
      },
      openaiSchema: {
        name: "ads_metrics_diagnosis",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            summary: { type: "string" },
            highlights: { type: "array", items: { type: "string" } },
            alerts: { type: "array", items: { type: "string" } },
            next_actions: { type: "array", items: { type: "string" } },
          },
          required: ["summary", "highlights", "alerts", "next_actions"],
        },
      },
    });

    if (aiRes?.data) {
      return {
        generated_at: new Date().toISOString(),
        scope_label: scopeLabel,
        campaign_id: params.campaignId || null,
        ad_account_id: effectiveAccountId,
        provider_used: aiRes.provider,
        summary: aiRes.data.summary,
        highlights: aiRes.data.highlights || [],
        alerts: aiRes.data.alerts || [],
        next_actions: aiRes.data.next_actions || [],
      };
    }

    const totalSpend = metricsDigest.reduce((acc, item) => acc + item.spend, 0);
    const totalClicks = metricsDigest.reduce((acc, item) => acc + item.clicks, 0);
    const totalConv = metricsDigest.reduce(
      (acc, item) => acc + item.conversions,
      0
    );

    return {
      generated_at: new Date().toISOString(),
      scope_label: scopeLabel,
      campaign_id: params.campaignId || null,
      ad_account_id: effectiveAccountId,
      provider_used: "DETERMINISTIC_FALLBACK",
      summary: `Resumo determinístico (${windowKey}): gasto acumulado de ${
        matchingAccount?.currency || "BRL"
      } ${totalSpend.toFixed(
        2
      )}, ${totalClicks} clique(s) e ${totalConv} conversão(ões). Configure uma chave Gemini, OpenAI ou Claude na aba Integrações para análise narrativa completa.`,
      highlights: [
        totalConv > 0
          ? `${totalConv} conversão(ões) registrada(s) no período.`
          : "Nenhuma conversão registrada ainda no período selecionado.",
      ],
      alerts: metricsDigest
        .filter((m) => m.creative_fatigue || m.last_verdict === "PAUSAR")
        .map(
          (m) =>
            `${m.name}: ${
              m.last_verdict_reason || "Fadiga criativa ou CPA acima do limite."
            }`
        ),
      next_actions: [
        "Clique em 'Sincronizar Meta & Métricas' após 24–48h de veiculação para atualizar a janela selecionada.",
      ],
    };
  }

  static async syncOrganicPostMetrics(companyId: string, limit = 25): Promise<{
    syncedCount: number;
    updatedPosts: Record<string, PostOrganicMetrics>;
    permissions: {
      has_instagram_manage_insights: boolean;
      has_read_insights: boolean;
      has_pages_read_engagement: boolean;
      missing_insights_scopes: string[];
    };
    errors: string[];
  }> {
    const [secrets, allPosts] = await Promise.all([
      getCompanySecrets(companyId),
      listPostsHistory(companyId, 120),
    ]);

    if (!secrets.meta_access_token) {
      throw new Error(
        "Token da Meta não configurado nas Integrações desta empresa."
      );
    }

    const safeLimit = Math.min(40, Math.max(1, Math.round(limit)));
    const targetPosts = allPosts
      .filter(
        (p) =>
          p.status === "PUBLISHED" &&
          (Boolean(p.ig_post_id) || Boolean(p.fb_post_id))
      )
      .slice(0, safeLimit);

    const metaAds = new MetaAdsService(secrets.meta_access_token);
    const permCheck = await metaAds.checkAdsPermissions().catch(() => null);

    const hasIgInsights = permCheck
      ? permCheck.has_instagram_manage_insights
      : true;
    const hasFbInsights = permCheck ? permCheck.has_read_insights : true;
    const hasPagesEngagement = permCheck
      ? permCheck.has_pages_read_engagement
      : true;

    const missingScopes: string[] = [];
    if (
      permCheck &&
      !permCheck.has_instagram_manage_insights &&
      targetPosts.some((p) => Boolean(p.ig_post_id))
    ) {
      missingScopes.push("instagram_manage_insights");
    }
    if (
      permCheck &&
      !permCheck.has_read_insights &&
      targetPosts.some((p) => Boolean(p.fb_post_id))
    ) {
      missingScopes.push("read_insights");
    }

    const hasAnyFb = targetPosts.some((p) => Boolean(p.fb_post_id));
    const fbPageToken =
      hasAnyFb && secrets.fb_page_id
        ? await metaAds.resolvePageAccessToken(secrets.fb_page_id)
        : null;

    const updatedPosts: Record<string, PostOrganicMetrics> = {};
    const errors: string[] = [];
    let syncedCount = 0;

    const sumNullable = (...vals: Array<number | null | undefined>): number | null => {
      const nums = vals.filter(
        (v): v is number => typeof v === "number" && Number.isFinite(v)
      );
      if (nums.length === 0) return null;
      return nums.reduce((acc, cur) => acc + cur, 0);
    };

    const batchSize = 5;
    for (let i = 0; i < targetPosts.length; i += batchSize) {
      const chunk = targetPosts.slice(i, i + batchSize);
      await Promise.all(
        chunk.map(async (post) => {
          let ig: PostChannelOrganicMetrics | null = null;
          let fb: PostChannelOrganicMetrics | null = null;

          if (post.ig_post_id) {
            try {
              ig = await metaAds.fetchInstagramPostMetrics(
                post.ig_post_id,
                hasIgInsights
              );
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              errors.push(`IG (${post.headline.slice(0, 24)}): ${msg}`);
              ig = post.organic_metrics?.ig || null;
            }
          }

          if (post.fb_post_id) {
            try {
              fb = await metaAds.fetchFacebookPostMetrics({
                fbPageId: secrets.fb_page_id,
                fbPostId: post.fb_post_id,
                pageAccessToken: fbPageToken,
                tryInsights: hasFbInsights,
              });
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              errors.push(`FB (${post.headline.slice(0, 24)}): ${msg}`);
              fb = post.organic_metrics?.fb || null;
            }
          }

          if (!ig && !fb) return;

          const total_likes = (ig?.likes || 0) + (fb?.likes || 0);
          const total_comments = (ig?.comments || 0) + (fb?.comments || 0);
          const total_views = sumNullable(ig?.views, fb?.views);
          const total_reach = sumNullable(ig?.reach, fb?.reach);
          const total_saved = ig?.saved ?? null;
          const total_shares = sumNullable(ig?.shares, fb?.shares);
          const engagement_score =
            total_likes +
            total_comments * 2 +
            (total_saved || 0) * 3 +
            (total_shares || 0) * 3 +
            Math.round((total_views || total_reach || 0) / 100);

          const organicMetrics: PostOrganicMetrics = {
            ig,
            fb,
            total_likes,
            total_comments,
            total_views,
            total_reach,
            total_saved,
            total_shares,
            engagement_score,
            synced_at: new Date().toISOString(),
          };

          await updatePostRecord(post.id, {
            content_json: {
              ...post.content_json,
              organic_metrics: organicMetrics,
            },
            organic_metrics: organicMetrics,
          });

          updatedPosts[post.id] = organicMetrics;
          syncedCount += 1;
        })
      );
    }

    return {
      syncedCount,
      updatedPosts,
      permissions: {
        has_instagram_manage_insights: hasIgInsights,
        has_read_insights: hasFbInsights,
        has_pages_read_engagement: hasPagesEngagement,
        missing_insights_scopes: missingScopes,
      },
      errors: errors.slice(0, 6),
    };
  }

  static async resolvePostPermalink(params: {
    companyId: string;
    postId: string;
    channel: AdChannel;
  }): Promise<{
    url: string;
    cached: boolean;
    note?: string;
    organic_metrics?: PostOrganicMetrics | null;
  }> {
    const [secrets, posts] = await Promise.all([
      getCompanySecrets(params.companyId),
      listPostsHistory(params.companyId, 200),
    ]);

    const post = posts.find((p) => p.id === params.postId);
    if (!post) {
      throw new Error("Post orgânico não encontrado para esta empresa.");
    }

    const baseMetrics: PostOrganicMetrics = post.organic_metrics || {
      ig: null,
      fb: null,
      total_likes: 0,
      total_comments: 0,
      total_views: null,
      total_reach: null,
      total_saved: null,
      total_shares: null,
      engagement_score: 0,
      synced_at: new Date().toISOString(),
    };

    if (params.channel === "FACEBOOK") {
      const cachedUrl = post.organic_metrics?.fb?.permalink?.trim();
      if (cachedUrl && !isBrokenFacebookPermalink(cachedUrl)) {
        return { url: cachedUrl, cached: true, organic_metrics: post.organic_metrics };
      }
      if (!post.fb_post_id) {
        throw new Error("Este post não possui ID publicado no Facebook.");
      }

      const storyId = normalizeFbObjectStoryId(
        secrets.fb_page_id || "",
        post.fb_post_id
      );
      const underscoreIdx = storyId.indexOf("_");
      const pagePart =
        underscoreIdx > 0 ? storyId.slice(0, underscoreIdx) : "";
      let url = pagePart
        ? `https://www.facebook.com/${encodeURIComponent(pagePart)}`
        : `https://www.facebook.com/photo/?fbid=${encodeURIComponent(storyId)}`;
      if (secrets.meta_access_token) {
        const metaAds = new MetaAdsService(secrets.meta_access_token);
        const fbPageToken = secrets.fb_page_id
          ? await metaAds.resolvePageAccessToken(secrets.fb_page_id)
          : null;
        url = await metaAds.fetchFacebookPermalink({
          fbPageId: secrets.fb_page_id,
          fbPostId: post.fb_post_id,
          pageAccessToken: fbPageToken,
        });
      }

      const nextMetrics: PostOrganicMetrics = {
        ...baseMetrics,
        fb: {
          likes: baseMetrics.fb?.likes || 0,
          comments: baseMetrics.fb?.comments || 0,
          views: baseMetrics.fb?.views ?? null,
          reach: baseMetrics.fb?.reach ?? null,
          saved: baseMetrics.fb?.saved ?? null,
          shares: baseMetrics.fb?.shares ?? null,
          insights_available: baseMetrics.fb?.insights_available ?? false,
          error: baseMetrics.fb?.error ?? null,
          permalink: url,
        },
      };

      await updatePostRecord(post.id, {
        content_json: {
          ...post.content_json,
          organic_metrics: nextMetrics,
        },
        organic_metrics: nextMetrics,
      });

      return { url, cached: false, organic_metrics: nextMetrics };
    }

    if (params.channel === "INSTAGRAM") {
      const cachedUrl = post.organic_metrics?.ig?.permalink?.trim();
      if (cachedUrl) {
        return { url: cachedUrl, cached: true, organic_metrics: post.organic_metrics };
      }
      if (!post.ig_post_id) {
        throw new Error("Este post não possui ID publicado no Instagram.");
      }
      if (!secrets.meta_access_token) {
        throw new Error(
          "Token da Meta não configurado para consultar o link do Instagram."
        );
      }

      const metaAds = new MetaAdsService(secrets.meta_access_token);
      const url = await metaAds.fetchInstagramPermalink(post.ig_post_id);
      if (!url) {
        throw new Error(
          "Não foi possível obter o link público deste post no Instagram."
        );
      }

      const nextMetrics: PostOrganicMetrics = {
        ...baseMetrics,
        ig: {
          likes: baseMetrics.ig?.likes || 0,
          comments: baseMetrics.ig?.comments || 0,
          views: baseMetrics.ig?.views ?? null,
          reach: baseMetrics.ig?.reach ?? null,
          saved: baseMetrics.ig?.saved ?? null,
          shares: baseMetrics.ig?.shares ?? null,
          insights_available: baseMetrics.ig?.insights_available ?? false,
          error: baseMetrics.ig?.error ?? null,
          permalink: url,
        },
      };

      await updatePostRecord(post.id, {
        content_json: {
          ...post.content_json,
          organic_metrics: nextMetrics,
        },
        organic_metrics: nextMetrics,
      });

      return { url, cached: false, organic_metrics: nextMetrics };
    }

    // TIKTOK
    const rawTikTokId = post.tiktok_post_id?.trim() || "";
    if (!rawTikTokId) {
      throw new Error("Este post não possui ID publicado no TikTok.");
    }
    if (/^\d{15,}$/.test(rawTikTokId)) {
      return {
        url: `https://www.tiktok.com/@/video/${rawTikTokId}`,
        cached: true,
      };
    }

    if (secrets.tiktok_access_token) {
      try {
        const res = await fetch(
          "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${secrets.tiktok_access_token.trim()}`,
              "Content-Type": "application/json; charset=UTF-8",
            },
            body: JSON.stringify({ publish_id: rawTikTokId }),
            signal: AbortSignal.timeout(8000),
          }
        );
        const statusData = (await res.json()) as {
          data?: { publicaly_available_post_id?: string[] };
        };
        const publicId = statusData.data?.publicaly_available_post_id?.[0];
        if (publicId) {
          return {
            url: `https://www.tiktok.com/@/video/${publicId}`,
            cached: false,
          };
        }
      } catch {
        // segue para o fallback do TikTok Studio
      }
    }

    return {
      url: "https://www.tiktok.com/tiktokstudio/content",
      cached: false,
      note: "Post do TikTok em modo Sandbox/privado: abrindo o TikTok Studio para visualização.",
    };
  }

  static async listAccountPixels(
    companyId: string,
    adAccountId?: string | null
  ) {
    const [secrets, defaultAccount] = await Promise.all([
      getCompanySecrets(companyId),
      getDefaultAdAccount(companyId, "META"),
    ]);
    if (!secrets.meta_access_token) {
      return { ad_account_id: null, pixels: [] };
    }
    const targetAcc =
      (adAccountId ? normalizeAdAccountId(adAccountId) : "") ||
      defaultAccount?.ad_account_id ||
      "";
    if (!targetAcc) {
      return { ad_account_id: null, pixels: [] };
    }
    const metaAds = new MetaAdsService(secrets.meta_access_token);
    const pixels = await metaAds.listAdPixels(targetAcc).catch(() => []);
    return { ad_account_id: targetAcc, pixels };
  }

  static async deleteCampaignRecord(companyId: string, campaignId: string) {
    const [secrets, campaign] = await Promise.all([
      getCompanySecrets(companyId),
      getAdCampaignById(campaignId, companyId),
    ]);
    if (!campaign) {
      throw new Error("Campanha não encontrada para esta empresa.");
    }
    if (campaign.status !== "ERROR" && campaign.status !== "ARCHIVED") {
      throw new Error(
        "Por segurança, arquive ou pause a campanha antes de removê-la do painel."
      );
    }
    if (
      campaign.meta_campaign_id &&
      campaign.status !== "ARCHIVED" &&
      secrets.meta_access_token
    ) {
      const metaAds = new MetaAdsService(secrets.meta_access_token);
      await metaAds
        .toggleEntityStatus(campaign.meta_campaign_id, "ARCHIVED")
        .catch(() => null);
    }
    await deleteAdCampaignRecord(campaign.id, companyId);
    return { deleted: true, id: campaign.id };
  }

  static async searchPreciseLocations(
    companyId: string,
    query: string
  ): Promise<AdGeoLocationSelection[]> {
    const cleanQuery = query.trim();
    if (!cleanQuery) return [];
    const isBrazilQuery = /^(?:bra[sz]il|todo\s+o\s+brasil|br)$/i.test(
      cleanQuery
    );
    const secrets = await getCompanySecrets(companyId);

    const metaPromise = secrets.meta_access_token
      ? new MetaAdsService(secrets.meta_access_token)
          .searchGeoLocations(cleanQuery, {
            locationTypes: [
              "city",
              "neighborhood",
              "subcity",
              "region",
              "zip",
            ],
            countryCode: "BR",
            limit: 8,
          })
          .catch(() => [])
      : Promise.resolve([]);

    const [metaResults, pinResults] = await Promise.all([
      metaPromise,
      searchNominatimPins(cleanQuery),
    ]);

    const typeLabels: Record<string, string> = {
      city: "Cidade",
      neighborhood: "Bairro",
      subcity: "Sub-região",
      region: "Estado",
      zip: "CEP",
      country: "País",
    };

    const mappedMeta: AdGeoLocationSelection[] = [];
    for (const item of metaResults) {
      const normalizedType = (item.type || "").toLowerCase();
      if (
        normalizedType !== "city" &&
        normalizedType !== "region" &&
        normalizedType !== "neighborhood" &&
        normalizedType !== "subcity" &&
        normalizedType !== "zip" &&
        normalizedType !== "country"
      ) {
        continue;
      }
      const badge = typeLabels[normalizedType] || item.type;
      const suffix = [item.region, item.country_code].filter(Boolean).join(", ");
      mappedMeta.push({
        label: `${badge}: ${item.name}${suffix ? ` (${suffix})` : ""}`,
        type: normalizedType,
        key: item.key,
        country_code: item.country_code,
        region: item.region,
        radius_km: normalizedType === "city" ? 20 : undefined,
      });
    }

    return [
      ...(isBrazilQuery
        ? [
            {
              label: "País: Brasil (Todo o Brasil)",
              type: "country" as const,
              country_code: "BR",
            },
          ]
        : []),
      ...mappedMeta,
      ...pinResults,
    ];
  }
}
