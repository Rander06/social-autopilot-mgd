import { NextRequest, NextResponse } from "next/server";
import { decryptSecret } from "@/lib/crypto";
import { saveCompanyIntegrations } from "@/lib/store";

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
  const origin = getSiteOrigin(request);
  const code = request.nextUrl.searchParams.get("code")?.trim();
  const state = request.nextUrl.searchParams.get("state")?.trim();
  const errParam =
    request.nextUrl.searchParams.get("error_description") ||
    request.nextUrl.searchParams.get("error");

  if (errParam) {
    return NextResponse.redirect(
      `${origin}/?tab=integrations&tiktok_error=${encodeURIComponent(errParam)}`
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${origin}/?tab=integrations&tiktok_error=${encodeURIComponent(
        "Autorização TikTok cancelada ou incompleta."
      )}`
    );
  }

  const decryptedState = decryptSecret(state);
  if (!decryptedState) {
    return NextResponse.redirect(
      `${origin}/?tab=integrations&tiktok_error=${encodeURIComponent(
        "Estado OAuth inválido ou expirado."
      )}`
    );
  }

  let parsedState: { companyId?: string; userId?: string };
  try {
    parsedState = JSON.parse(decryptedState) as {
      companyId?: string;
      userId?: string;
    };
  } catch {
    return NextResponse.redirect(
      `${origin}/?tab=integrations&tiktok_error=estado_invalido`
    );
  }

  const clientKey = process.env.TIKTOK_CLIENT_KEY?.trim();
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET?.trim();
  if (!clientKey || !clientSecret || !parsedState.companyId) {
    return NextResponse.redirect(
      `${origin}/?tab=integrations&tiktok_error=${encodeURIComponent(
        "Credenciais TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET não configuradas no servidor."
      )}`
    );
  }

  try {
    const redirectUri = `${origin}/api/tiktok/callback`;
    const body = new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    });

    const tokenRes = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      open_id?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };

    if (!tokenRes.ok || !tokenData.access_token || !tokenData.open_id) {
      const msg =
        tokenData.error_description ||
        tokenData.error ||
        "Falha ao trocar código por token do TikTok.";
      return NextResponse.redirect(
        `${origin}/?tab=integrations&tiktok_error=${encodeURIComponent(msg)}`
      );
    }

    const expiresInSec = Number(tokenData.expires_in || 86400);
    const expiresAt = new Date(Date.now() + expiresInSec * 1000).toISOString();

    await saveCompanyIntegrations(
      parsedState.companyId,
      {
        tiktok_access_token: tokenData.access_token,
        tiktok_refresh_token: tokenData.refresh_token || undefined,
        tiktok_expires_at: expiresAt,
        tiktok_open_id: tokenData.open_id,
        tiktok_enabled: true,
      },
      parsedState.userId
    );

    return NextResponse.redirect(
      `${origin}/?tab=integrations&tiktok=connected`
    );
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Erro ao conectar conta TikTok.";
    return NextResponse.redirect(
      `${origin}/?tab=integrations&tiktok_error=${encodeURIComponent(msg)}`
    );
  }
}
