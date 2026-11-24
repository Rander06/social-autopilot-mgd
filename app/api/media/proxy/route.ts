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

    const rawBuffer = Buffer.from(await upstream.arrayBuffer());

    // Normaliza toda imagem para JPEG dentro dos limites do TikTok Photo Mode
    // (máx. 1080x1920, mín. 720px no maior lado, sem transparência e EXIF corrigido).
    const image = sharp(rawBuffer).rotate();
    const meta = await image.metadata();
    const w = meta.width || 1080;
    const h = meta.height || 1080;

    let pipeline = image;
    if (w > 1080 || h > 1920) {
      pipeline = pipeline.resize({
        width: 1080,
        height: 1920,
        fit: "inside",
        withoutEnlargement: true,
      });
    } else if (w < 720 && h < 720) {
      pipeline = pipeline.resize({
        width: 1080,
        height: 1080,
        fit: "inside",
        withoutEnlargement: false,
      });
    }

    const jpegBuffer = await pipeline
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 90 })
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
