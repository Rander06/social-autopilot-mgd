import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

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

    const rawType = (upstream.headers.get("content-type") || "image/png").toLowerCase();
    const rawBuffer = Buffer.from(await upstream.arrayBuffer());

    // TikTok Photo Mode aceita estritamente JPEG ou WebP (rejeita PNG).
    if (rawType.includes("jpeg") || rawType.includes("jpg") || rawType.includes("webp")) {
      return new NextResponse(new Uint8Array(rawBuffer), {
        status: 200,
        headers: {
          "Content-Type": rawType.includes("webp") ? "image/webp" : "image/jpeg",
          "Content-Disposition": `inline; filename="${rawType.includes("webp") ? "post.webp" : "post.jpg"}"`,
          "Cache-Control": "public, max-age=86400",
        },
      });
    }

    const jpegBuffer = await sharp(rawBuffer)
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 92 })
      .toBuffer();

    return new NextResponse(new Uint8Array(jpegBuffer), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Disposition": 'inline; filename="post.jpg"',
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
