import { NextRequest, NextResponse } from "next/server";
import { CampaignOrchestratorService } from "@/lib/ads-orchestrator";
import { getSessionFromRequest, SessionPayload } from "@/lib/crypto";
import {
  AdChannel,
  AdGeoLocationSelection,
  AdInsightsWindow,
  AdsAIProviderPreference,
  CreativePostInput,
  ParsedCampaignPlan,
} from "@/lib/types";

function parseAIProviderPreference(raw: unknown): AdsAIProviderPreference | undefined {
  if (typeof raw !== "string") return undefined;
  const upper = raw.trim().toUpperCase();
  if (
    upper === "AUTO" ||
    upper === "GEMINI" ||
    upper === "OPENAI" ||
    upper === "CLAUDE"
  ) {
    return upper;
  }
  return undefined;
}

function resolveCompanyScope(
  session: SessionPayload,
  requestedCompanyId?: string | null
): string | null {
  if (session.role === "SUPER_ADMIN") {
    return requestedCompanyId?.trim() || session.companyId || null;
  }
  return session.companyId;
}

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const requestedCompanyId = request.nextUrl.searchParams.get("companyId");
  const companyId = resolveCompanyScope(session, requestedCompanyId);
  if (!companyId) {
    return NextResponse.json(
      { error: "Empresa não identificada." },
      { status: 400 }
    );
  }

  const state = await CampaignOrchestratorService.getAdsDashboardState(companyId);
  return NextResponse.json(state);
}

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const action = String(body.action || "").trim();
    const companyId = resolveCompanyScope(
      session,
      typeof body.companyId === "string" ? body.companyId : undefined
    );

    if (!companyId) {
      return NextResponse.json(
        { error: "Empresa não identificada." },
        { status: 400 }
      );
    }

    if (action === "list_meta_ad_accounts") {
      const result =
        await CampaignOrchestratorService.syncRemoteAdAccounts(companyId);
      return NextResponse.json(result);
    }

    if (action === "save_ad_account") {
      const adAccountId = String(body.ad_account_id || "").trim();
      if (!adAccountId) {
        return NextResponse.json(
          { error: "Informe o ad_account_id da conta Meta Ads." },
          { status: 400 }
        );
      }

      const saved = await CampaignOrchestratorService.saveAdAccountSettings({
        companyId,
        userId: session.userId,
        ad_account_id: adAccountId,
        account_name:
          typeof body.account_name === "string" ? body.account_name : undefined,
        currency: typeof body.currency === "string" ? body.currency : undefined,
        account_status:
          typeof body.account_status === "number"
            ? body.account_status
            : undefined,
        is_default:
          typeof body.is_default === "boolean" ? body.is_default : false,
        preferred_ai_provider: parseAIProviderPreference(
          body.preferred_ai_provider
        ),
        cpa_maximo:
          body.cpa_maximo !== undefined ? Number(body.cpa_maximo) : undefined,
        roas_minimo:
          body.roas_minimo !== undefined ? Number(body.roas_minimo) : undefined,
        amostra_minima_cliques:
          body.amostra_minima_cliques !== undefined
            ? Number(body.amostra_minima_cliques)
            : undefined,
        link_destino_padrao:
          typeof body.link_destino_padrao === "string"
            ? body.link_destino_padrao
            : body.link_destino_padrao === null
              ? null
              : undefined,
        localizacao_base:
          typeof body.localizacao_base === "string"
            ? body.localizacao_base
            : undefined,
        auto_pause_enabled:
          typeof body.auto_pause_enabled === "boolean"
            ? body.auto_pause_enabled
            : undefined,
      });

      return NextResponse.json({ account: saved });
    }

    if (action === "set_default_ad_account") {
      const accountId = String(
        body.accountRowId || body.accountId || ""
      ).trim();
      if (!accountId) {
        return NextResponse.json(
          { error: "Informe accountRowId ou accountId." },
          { status: 400 }
        );
      }
      const account = await CampaignOrchestratorService.setDefaultAdAccount(
        companyId,
        accountId,
        session.userId
      );
      if (!account) {
        return NextResponse.json(
          { error: "Conta de anúncios não encontrada para esta empresa." },
          { status: 404 }
        );
      }
      return NextResponse.json({ account });
    }

    if (action === "delete_ad_account") {
      const accountId = String(
        body.accountRowId || body.accountId || ""
      ).trim();
      if (!accountId) {
        return NextResponse.json(
          { error: "Informe accountRowId ou accountId para remover." },
          { status: 400 }
        );
      }
      const deleted = await CampaignOrchestratorService.deleteAdAccount(
        companyId,
        accountId,
        session.userId
      );
      return NextResponse.json({ deleted });
    }

    if (action === "preview_campaign") {
      const postId = String(body.postId || "").trim();
      const channel = (String(body.channel || "FACEBOOK").toUpperCase() ||
        "FACEBOOK") as AdChannel;
      const userPrompt = String(body.userPrompt || "").trim();
      const adAccountId =
        typeof body.adAccountId === "string" ? body.adAccountId : null;
      const aiProvider = parseAIProviderPreference(body.aiProvider);

      if (!postId) {
        return NextResponse.json(
          { error: "Informe o postId para pré-visualizar a campanha." },
          { status: 400 }
        );
      }

      const plan = await CampaignOrchestratorService.previewCampaignPlan({
        companyId,
        postId,
        channel,
        userPrompt,
        adAccountId,
        aiProvider,
      });
      return NextResponse.json({ plan });
    }

    if (action === "create_campaign") {
      const postId = String(body.postId || "").trim();
      const channel = (String(body.channel || "FACEBOOK").toUpperCase() ||
        "FACEBOOK") as AdChannel;
      const userPrompt = String(body.userPrompt || "").trim();
      const adAccountId =
        typeof body.adAccountId === "string" ? body.adAccountId : null;
      const aiProvider = parseAIProviderPreference(body.aiProvider);
      const overridePlan =
        body.overridePlan && typeof body.overridePlan === "object"
          ? (body.overridePlan as Partial<ParsedCampaignPlan>)
          : undefined;
      const creatives = Array.isArray(body.creatives)
        ? (body.creatives as CreativePostInput[])
        : undefined;

      if (!postId) {
        return NextResponse.json(
          { error: "Informe o postId do post publicado." },
          { status: 400 }
        );
      }

      const result = await CampaignOrchestratorService.launchCampaign({
        companyId,
        userId: session.userId,
        postId,
        creatives,
        channel,
        userPrompt,
        adAccountId,
        aiProvider,
        overridePlan,
      });

      return NextResponse.json(result);
    }

    if (action === "toggle_status") {
      const campaignId = String(body.campaignId || "").trim();
      const status = String(body.status || "").toUpperCase();
      if (
        !campaignId ||
        (status !== "ACTIVE" && status !== "PAUSED" && status !== "ARCHIVED")
      ) {
        return NextResponse.json(
          { error: "Informe campaignId e status válido (ACTIVE, PAUSED ou ARCHIVED)." },
          { status: 400 }
        );
      }

      const campaign = await CampaignOrchestratorService.toggleCampaignStatus({
        companyId,
        campaignId,
        status,
        userId: session.userId,
      });
      return NextResponse.json({ campaign });
    }

    if (action === "refresh_metrics") {
      const summary =
        await CampaignOrchestratorService.refreshMetricsNow(companyId);
      const state =
        await CampaignOrchestratorService.getAdsDashboardState(companyId);
      return NextResponse.json({ summary, state });
    }

    if (action === "get_advisor") {
      const aiProvider = parseAIProviderPreference(body.aiProvider);
      const adAccountId =
        typeof body.adAccountId === "string" ? body.adAccountId : null;
      const advice =
        await CampaignOrchestratorService.getOptimizationAdvice(companyId, {
          aiProvider,
          adAccountId,
        });
      return NextResponse.json({ advice });
    }

    if (action === "analyze_metrics_ai") {
      const campaignId =
        typeof body.campaignId === "string" ? body.campaignId.trim() : null;
      const adAccountId =
        typeof body.adAccountId === "string" ? body.adAccountId.trim() : null;
      const aiProvider = parseAIProviderPreference(body.aiProvider);
      const rawWin = String(body.window || "7d");
      const window: AdInsightsWindow =
        rawWin === "4d" || rawWin === "14d" || rawWin === "30d" ? rawWin : "7d";

      const diagnosis = await CampaignOrchestratorService.analyzeMetricsWithAI({
        companyId,
        campaignId,
        adAccountId,
        aiProvider,
        window,
      });
      return NextResponse.json({ diagnosis });
    }

    if (action === "sync_post_engagement") {
      const limit =
        body.limit !== undefined ? Number(body.limit) || 25 : 25;
      const result = await CampaignOrchestratorService.syncOrganicPostMetrics(
        companyId,
        limit
      );
      return NextResponse.json(result);
    }

    if (action === "resolve_post_permalink") {
      const postId = String(body.postId || "").trim();
      const rawChannel = String(body.channel || "").trim().toUpperCase();
      if (
        !postId ||
        (rawChannel !== "INSTAGRAM" &&
          rawChannel !== "FACEBOOK" &&
          rawChannel !== "TIKTOK")
      ) {
        return NextResponse.json(
          {
            error:
              "Informe postId e channel válido (INSTAGRAM, FACEBOOK ou TIKTOK).",
          },
          { status: 400 }
        );
      }

      const result = await CampaignOrchestratorService.resolvePostPermalink({
        companyId,
        postId,
        channel: rawChannel as AdChannel,
      });
      return NextResponse.json(result);
    }

    if (action === "list_ad_pixels") {
      const adAccountId =
        typeof body.adAccountId === "string" ? body.adAccountId : null;
      const result = await CampaignOrchestratorService.listAccountPixels(
        companyId,
        adAccountId
      );
      return NextResponse.json(result);
    }

    if (action === "delete_campaign") {
      const campaignId = String(body.campaignId || "").trim();
      if (!campaignId) {
        return NextResponse.json(
          { error: "Informe campaignId para excluir." },
          { status: 400 }
        );
      }
      const result = await CampaignOrchestratorService.deleteCampaignRecord(
        companyId,
        campaignId
      );
      return NextResponse.json(result);
    }

    if (action === "search_geo_locations") {
      const query = String(body.query || "").trim();
      if (!query) {
        return NextResponse.json({ locations: [] });
      }
      const locations = await CampaignOrchestratorService.searchPreciseLocations(
        companyId,
        query
      );
      return NextResponse.json({ locations });
    }

    if (action === "add_creatives") {
      const campaignId = String(body.campaignId || "").trim();
      const creatives = Array.isArray(body.creatives)
        ? (body.creatives as CreativePostInput[])
        : [];
      if (!campaignId || creatives.length === 0) {
        return NextResponse.json(
          {
            error:
              "Informe campaignId e pelo menos 1 post publicado para adicionar como criativo.",
          },
          { status: 400 }
        );
      }
      const result = await CampaignOrchestratorService.addCreativesToCampaign({
        companyId,
        campaignId,
        creatives,
        userId: session.userId,
      });
      return NextResponse.json(result);
    }

    if (action === "toggle_ad_status") {
      const adId = String(body.adId || "").trim();
      const status = String(body.status || "").toUpperCase();
      if (
        !adId ||
        (status !== "ACTIVE" && status !== "PAUSED" && status !== "ARCHIVED")
      ) {
        return NextResponse.json(
          {
            error:
              "Informe adId e status válido (ACTIVE, PAUSED ou ARCHIVED).",
          },
          { status: 400 }
        );
      }
      const ad = await CampaignOrchestratorService.toggleAdStatus({
        companyId,
        adId,
        status,
        userId: session.userId,
      });
      return NextResponse.json({ ad });
    }

    if (action === "get_campaign_edit_details") {
      const campaignId = String(body.campaignId || "").trim();
      if (!campaignId) {
        return NextResponse.json(
          { error: "Informe campaignId." },
          { status: 400 }
        );
      }
      const details =
        await CampaignOrchestratorService.getCampaignEditDetails(
          companyId,
          campaignId
        );
      return NextResponse.json({ details });
    }

    if (action === "update_campaign") {
      const campaignId = String(body.campaignId || "").trim();
      if (!campaignId) {
        return NextResponse.json(
          { error: "Informe campaignId para atualizar." },
          { status: 400 }
        );
      }
      const name =
        typeof body.name === "string" ? body.name.trim() : undefined;
      const adsetName =
        typeof body.adsetName === "string" ? body.adsetName.trim() : undefined;
      const dailyBudgetCents =
        body.dailyBudgetCents !== undefined && body.dailyBudgetCents !== null
          ? Number(body.dailyBudgetCents)
          : undefined;
      const audienceChanged = Boolean(body.audienceChanged);
      const ageMin =
        body.ageMin !== undefined && body.ageMin !== null
          ? Number(body.ageMin)
          : undefined;
      const ageMax =
        body.ageMax !== undefined && body.ageMax !== null
          ? Number(body.ageMax)
          : undefined;
      const genders = Array.isArray(body.genders)
        ? (body.genders as Array<1 | 2>)
        : undefined;
      const locationQuery =
        typeof body.locationQuery === "string"
          ? body.locationQuery.trim()
          : undefined;
      const locationRadiusKm =
        body.locationRadiusKm !== undefined && body.locationRadiusKm !== null
          ? Number(body.locationRadiusKm)
          : undefined;
      const selectedLocation =
        body.selectedLocation && typeof body.selectedLocation === "object"
          ? (body.selectedLocation as AdGeoLocationSelection)
          : body.selectedLocation === null
            ? null
            : undefined;
      const scheduleChanged = Boolean(body.scheduleChanged);
      const startTime =
        typeof body.startTime === "string"
          ? body.startTime.trim() || null
          : body.startTime === null
            ? null
            : undefined;
      const endTime =
        typeof body.endTime === "string"
          ? body.endTime.trim() || null
          : body.endTime === null
            ? null
            : undefined;
      const noEndDate =
        typeof body.noEndDate === "boolean" ? body.noEndDate : undefined;
      const adNames = Array.isArray(body.adNames)
        ? (body.adNames as Array<{ id: string; adName: string }>)
        : undefined;

      const campaign = await CampaignOrchestratorService.updateCampaignDetails({
        companyId,
        campaignId,
        name,
        adsetName,
        dailyBudgetCents,
        audienceChanged,
        ageMin,
        ageMax,
        genders,
        locationQuery,
        locationRadiusKm,
        selectedLocation,
        scheduleChanged,
        startTime,
        endTime,
        noEndDate,
        adNames,
        userId: session.userId,
      });
      return NextResponse.json({ campaign });
    }

    if (action === "update_ad") {
      const adId = String(body.adId || "").trim();
      if (!adId) {
        return NextResponse.json(
          { error: "Informe adId para atualizar o anúncio." },
          { status: 400 }
        );
      }
      const adName =
        typeof body.adName === "string" ? body.adName.trim() : undefined;
      const headline =
        typeof body.headline === "string" ? body.headline.trim() : undefined;
      const primaryText =
        typeof body.primaryText === "string"
          ? body.primaryText.trim()
          : undefined;
      const ad = await CampaignOrchestratorService.updateAdDetails({
        companyId,
        adId,
        adName,
        headline,
        primaryText,
        userId: session.userId,
      });
      return NextResponse.json({ ad });
    }

    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Erro ao processar solicitação de Tráfego Pago.",
      },
      { status: 400 }
    );
  }
}
