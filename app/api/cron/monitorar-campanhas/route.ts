import { NextRequest, NextResponse } from "next/server";
import { MetricsFetcherWorker } from "@/lib/ads-orchestrator";
import { getSessionFromRequest } from "@/lib/crypto";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authHeader = request.headers.get("authorization");
  const querySecret = request.nextUrl.searchParams.get("secret")?.trim();
  const session = getSessionFromRequest(request);

  const isAuthorized =
    session?.role === "SUPER_ADMIN" ||
    (Boolean(cronSecret) &&
      (authHeader === `Bearer ${cronSecret}` || querySecret === cronSecret));

  if (!isAuthorized) {
    return NextResponse.json(
      { error: "Não autorizado para executar monitoramento de campanhas." },
      { status: 401 }
    );
  }

  try {
    const companyIdParam = request.nextUrl.searchParams.get("companyId");
    const summary =
      await MetricsFetcherWorker.runGlobalMonitoringCycle(companyIdParam);
    return NextResponse.json({
      ok: true,
      executed_at: new Date().toISOString(),
      ...summary,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "Erro ao monitorar métricas das campanhas.",
      },
      { status: 500 }
    );
  }
}
