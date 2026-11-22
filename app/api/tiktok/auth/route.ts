import { NextRequest, NextResponse } from "next/server";
import { encryptSecret, getSessionFromRequest } from "@/lib/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSiteOrigin(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const proto = request.headers.get("x-forwarded-proto") || "https";
  const host =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    request.nextUrl.host;
  return `${proto}://${host}`;
}

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  const origin = getSiteOrigin(request);

  if (!session) {
    return NextResponse.redirect(
      `${origin}/?tiktok_error=${encodeURIComponent(
        "Faça login no painel antes de conectar sua conta TikTok."
      )}`
    );
  }

  const clientKey = process.env.TIKTOK_CLIENT_KEY?.trim();
  if (!clientKey) {
    return NextResponse.redirect(
      `${origin}/?tab=integrations&tiktok_error=${encodeURIComponent(
        "TIKTOK_CLIENT_KEY não configurada nas variáveis de ambiente do servidor."
      )}`
    );
  }

  const requestedCompanyId =
    request.nextUrl.searchParams.get("companyId")?.trim() || "";
  const companyId =
    session.role === "SUPER_ADMIN" && requestedCompanyId
      ? requestedCompanyId
      : session.companyId;

  const state = encryptSecret(
    JSON.stringify({
      companyId,
      userId: session.userId,
      ts: Date.now(),
    })
  );

  if (!state) {
    return NextResponse.redirect(
      `${origin}/?tab=integrations&tiktok_error=erro_estado_oauth`
    );
  }

  const redirectUri = `${origin}/api/tiktok/callback`;
  const authUrl = new URL("https://www.tiktok.com/v2/auth/authorize/");
  authUrl.searchParams.set("client_key", clientKey);
  authUrl.searchParams.set("scope", "user.info.basic,video.publish");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);

  return NextResponse.redirect(authUrl.toString());
}
