import { NextRequest, NextResponse } from "next/server";
import { CampaignOrchestratorService } from "@/lib/ads-orchestrator";
import { getSessionFromRequest, SessionPayload } from "@/lib/crypto";
import { AdChannel, ParsedCampaignPlan } from "@/lib/types";

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
        ad_account_id: adAccountId,
        account_name:
          typeof body.account_name === "string" ? body.account_name : undefined,
        currency: typeof body.currency === "string" ? body.currency : undefined,
        account_status:
          typeof body.account_status === "number"
            ? body.account_status
            : undefined,
        is_default:
          typeof body.is_default === "boolean" ? body.is_default : true,
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

    if (action === "preview_campaign") {
      const postId = String(body.postId || "").trim();
      const channel = (String(body.channel || "INSTAGRAM").toUpperCase() ||
        "INSTAGRAM") as AdChannel;
      const userPrompt = String(body.userPrompt || "").trim();
      const adAccountId =
        typeof body.adAccountId === "string" ? body.adAccountId : null;

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
      });
      return NextResponse.json({ plan });
    }

    if (action === "create_campaign") {
      const postId = String(body.postId || "").trim();
      const channel = (String(body.channel || "INSTAGRAM").toUpperCase() ||
        "INSTAGRAM") as AdChannel;
      const userPrompt = String(body.userPrompt || "").trim();
      const adAccountId =
        typeof body.adAccountId === "string" ? body.adAccountId : null;
      const overridePlan =
        body.overridePlan && typeof body.overridePlan === "object"
          ? (body.overridePlan as Partial<ParsedCampaignPlan>)
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
        channel,
        userPrompt,
        adAccountId,
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
      const advice =
        await CampaignOrchestratorService.getOptimizationAdvice(companyId);
      return NextResponse.json({ advice });
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
