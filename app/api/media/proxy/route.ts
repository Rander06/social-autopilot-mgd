import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAllowedMediaUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    const envPublic = process.env.R2_PUBLIC_URL?.trim();
    if (envPublic) {
      try {
        if (host === new URL(envPublic).hostname.toLowerCase()) return true;
      } catch {
        // Ignora URL de env inválida
      }
    }
    return host.endsWith(".r2.dev") || host.endsWith(".r2.cloudflarestorage.com");
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const targetUrl = request.nextUrl.searchParams.get("url")?.trim();
  if (!targetUrl || !isAllowedMediaUrl(targetUrl)) {
    return NextResponse.json({ error: "URL de mídia inválida." }, { status: 400 });
  }

  try {
    const upstream = await fetch(targetUrl, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!upstream.ok) {
      return NextResponse.json(
        { error: "Mídia não encontrada." },
        { status: upstream.status }
      );
    }

    const contentType = upstream.headers.get("content-type") || "image/png";
    const buf = await upstream.arrayBuffer();
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Erro ao carregar mídia." },
      { status: 502 }
    );
  }
}
