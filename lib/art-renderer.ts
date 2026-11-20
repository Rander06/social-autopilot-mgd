import fs from "node:fs";
import path from "node:path";
import React from "react";
import { ImageResponse } from "@vercel/og";
import {
  AIPhotoMode,
  AspectRatio,
  BrandSettings,
  GeneratedContentPayload,
  PostFormat,
} from "./types";

const fontCache = new Map<string, ArrayBuffer>();
const samplePhotoCache = new Map<string, string>();

const DIMENSIONS: Record<AspectRatio, { width: number; height: number }> = {
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
  "9:16": { width: 1080, height: 1920 },
};

type EditorialVariant =
  | "finance_whatsapp"
  | "laptop_phone"
  | "phone_property_tag"
  | "offer_poster";

async function loadGoogleFont(
  family: string,
  weight: 500 | 700 | 800
): Promise<ArrayBuffer | null> {
  const key = `${family}:${weight}`;
  const cached = fontCache.get(key);
  if (cached) return cached;

  try {
    const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(
      family
    )}:wght@${weight}&display=swap`;
    const cssRes = await fetch(cssUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1",
      },
      signal: AbortSignal.timeout(4000),
    });
    if (!cssRes.ok) return null;
    const css = await cssRes.text();
    const match = css.match(
      /src:\s*url\(([^)]+)\)\s*format\(['"]?truetype['"]?\)/
    );
    if (!match?.[1]) return null;

    const fontRes = await fetch(match[1], {
      signal: AbortSignal.timeout(4000),
    });
    if (!fontRes.ok) return null;
    const buffer = await fontRes.arrayBuffer();
    fontCache.set(key, buffer);
    return buffer;
  } catch {
    return null;
  }
}

async function loadFonts() {
  const [w500, w700, w800] = await Promise.all([
    loadGoogleFont("Plus Jakarta Sans", 500),
    loadGoogleFont("Plus Jakarta Sans", 700),
    loadGoogleFont("Plus Jakarta Sans", 800),
  ]);

  const fonts: Array<{
    name: string;
    data: ArrayBuffer;
    weight: 500 | 700 | 800;
    style: "normal";
  }> = [];

  if (w500) fonts.push({ name: "Plus Jakarta Sans", data: w500, weight: 500, style: "normal" });
  if (w700) fonts.push({ name: "Plus Jakarta Sans", data: w700, weight: 700, style: "normal" });
  if (w800) fonts.push({ name: "Plus Jakarta Sans", data: w800, weight: 800, style: "normal" });
  return fonts;
}

async function toDataUrl(imageUrl?: string | null): Promise<string | null> {
  if (!imageUrl) return null;
  if (imageUrl.startsWith("data:")) return imageUrl;
  try {
    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "image/jpeg";
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${contentType};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

async function loadEditorialSampleDataUrl(
  customPrompt?: string | null,
  headline?: string | null
): Promise<string | null> {
  const combined = `${customPrompt || ""} ${headline || ""}`.toLowerCase();
  const isPropertyScene =
    /piscina|ch[áa]cara|rancho|temporada|festa|gourmet|lazer|casa|sal[ãa]o|reserva|deck/.test(
      combined
    );
  const fileName = isPropertyScene ? "casa-temporada.jpg" : "agencia-digital.jpg";
  const cached = samplePhotoCache.get(fileName);
  if (cached) return cached;

  try {
    const filePath = path.join(process.cwd(), "public", "samples", fileName);
    if (fs.existsSync(filePath)) {
      const buf = fs.readFileSync(filePath);
      const dataUrl = `data:image/jpeg;base64,${buf.toString("base64")}`;
      samplePhotoCache.set(fileName, dataUrl);
      return dataUrl;
    }
  } catch {
    // Fallback para HTTP abaixo caso serverless bundle omita public/samples
  }

  return toDataUrl(`https://social.meugestordigital.com.br/samples/${fileName}`);
}

function svgCheck(color: string, size = 22) {
  const h = React.createElement;
  return h(
    "svg",
    { width: size, height: size, viewBox: "0 0 24 24", fill: "none", style: { flexShrink: 0 } },
    h("circle", { cx: "12", cy: "12", r: "10", fill: color, fillOpacity: "0.16" }),
    h("path", {
      d: "M7.5 12.5L10.5 15.5L16.5 9",
      stroke: color,
      strokeWidth: "2.6",
      strokeLinecap: "round",
      strokeLinejoin: "round",
    })
  );
}

function svgBolt(color: string, size = 22) {
  const h = React.createElement;
  return h(
    "svg",
    { width: size, height: size, viewBox: "0 0 24 24", fill: "none", style: { flexShrink: 0 } },
    h("path", { d: "M13 2L4.5 13.5H11.5L10.5 22L19.5 10.5H12.5L13 2Z", fill: color })
  );
}

function svgArrow(color: string, size = 20) {
  const h = React.createElement;
  return h(
    "svg",
    { width: size, height: size, viewBox: "0 0 24 24", fill: "none", style: { flexShrink: 0 } },
    h("path", {
      d: "M5 12H19M19 12L13 6M19 12L13 18",
      stroke: color,
      strokeWidth: "2.6",
      strokeLinecap: "round",
      strokeLinejoin: "round",
    })
  );
}

// ============================================================================
// PADRÃO ORIGINAL DO APP (CARDS LUMINOSOS + MINIATURA LATERAL OPCIONAL)
// ============================================================================

function renderHeader(params: {
  brand: BrandSettings;
  content: GeneratedContentPayload;
  offerPrice?: string | null;
  slideTag?: string;
  darkText?: boolean;
}) {
  const h = React.createElement;
  const { brand, content, offerPrice, slideTag, darkText } = params;

  return h(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        gap: "16px",
      },
    },
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: "10px",
          flexWrap: "wrap",
        },
      },
      h(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            backgroundColor: brand.primary_color,
            color: "#FFFFFF",
            padding: "10px 20px",
            borderRadius: "999px",
            fontSize: "17px",
            fontWeight: 800,
            letterSpacing: "0.04em",
          },
        },
        content.tema_visual.toUpperCase()
      ),
      slideTag
        ? h(
            "div",
            {
              style: {
                display: "flex",
                alignItems: "center",
                backgroundColor: darkText
                  ? "rgba(15, 23, 42, 0.08)"
                  : "rgba(255, 255, 255, 0.18)",
                border: darkText
                  ? "1px solid rgba(15, 23, 42, 0.15)"
                  : "1px solid rgba(255, 255, 255, 0.35)",
                color: darkText ? brand.text_color : "#FFFFFF",
                padding: "9px 16px",
                borderRadius: "999px",
                fontSize: "16px",
                fontWeight: 700,
              },
            },
            slideTag
          )
        : null
    ),
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          backgroundColor: brand.accent_color,
          color: "#FFFFFF",
          padding: "12px 22px",
          borderRadius: "16px",
          flexShrink: 0,
          boxShadow: "0 10px 24px rgba(15, 23, 42, 0.15)",
        },
      },
      h(
        "div",
        {
          style: {
            display: "flex",
            fontSize: "24px",
            fontWeight: 800,
            whiteSpace: "nowrap",
          },
        },
        offerPrice?.trim() || content.destaque_selo
      ),
      offerPrice?.trim()
        ? h(
            "div",
            {
              style: {
                display: "flex",
                fontSize: "12px",
                fontWeight: 700,
                opacity: 0.92,
                marginTop: "2px",
              },
            },
            content.destaque_selo.toUpperCase()
          )
        : null
    )
  );
}

function renderFooter(
  brand: BrandSettings,
  logoDataUrl: string | null,
  ctaOverride?: string
) {
  const h = React.createElement;
  return h(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "16px",
        backgroundColor: "#FFFFFF",
        border: "2px solid rgba(15, 23, 42, 0.08)",
        padding: "20px 26px",
        borderRadius: "22px",
        width: "100%",
        boxShadow: "0 14px 32px rgba(15, 23, 42, 0.08)",
      },
    },
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: "14px",
        },
      },
      logoDataUrl
        ? h("img", {
            src: logoDataUrl,
            alt: brand.footer_name,
            style: {
              width: "48px",
              height: "48px",
              borderRadius: "12px",
              objectFit: "cover",
            },
          })
        : h(
            "div",
            {
              style: {
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "46px",
                height: "46px",
                borderRadius: "12px",
                backgroundImage: `linear-gradient(135deg, ${brand.primary_color} 0%, ${brand.secondary_color} 100%)`,
                color: "#FFFFFF",
                fontSize: "20px",
                fontWeight: 800,
              },
            },
            brand.footer_name.slice(0, 2).toUpperCase()
          ),
      h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
          },
        },
        h(
          "div",
          {
            style: {
              display: "flex",
              fontSize: "23px",
              fontWeight: 800,
              color: brand.text_color,
            },
          },
          brand.footer_name
        ),
        brand.subtitle_default
          ? h(
              "div",
              {
                style: {
                  display: "flex",
                  fontSize: "14px",
                  fontWeight: 500,
                  color: "rgba(15, 23, 42, 0.68)",
                  marginTop: "2px",
                },
              },
              brand.subtitle_default
            )
          : null
      )
    ),
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: "8px",
          backgroundImage: `linear-gradient(135deg, ${brand.primary_color} 0%, ${brand.secondary_color} 100%)`,
          color: "#FFFFFF",
          padding: "13px 22px",
          borderRadius: "14px",
          fontSize: "18px",
          fontWeight: 800,
          whiteSpace: "nowrap",
          flexShrink: 0,
        },
      },
      ctaOverride || brand.cta_default || 'COMENTE "EU QUERO"',
      svgArrow("#FFFFFF", 18)
    )
  );
}

function renderHeroGradient(
  brand: BrandSettings,
  width: number,
  height: number,
  photoDataUrl: string | null
) {
  const h = React.createElement;
  return h(
    "div",
    {
      style: {
        position: "absolute",
        top: 0,
        left: 0,
        width: `${width}px`,
        height: `${height}px`,
        display: "flex",
        overflow: "hidden",
      },
    },
    photoDataUrl
      ? h("img", {
          src: photoDataUrl,
          alt: "Produto ou serviço em destaque",
          style: {
            position: "absolute",
            top: 0,
            left: 0,
            width: `${width}px`,
            height: `${height}px`,
            objectFit: "cover",
          },
        })
      : null,
    h("div", {
      style: {
        position: "absolute",
        top: 0,
        left: 0,
        width: `${width}px`,
        height: `${height}px`,
        display: "flex",
        backgroundImage: photoDataUrl
          ? `linear-gradient(145deg, rgba(15, 23, 42, 0.88) 0%, ${brand.primary_color}CC 65%, ${brand.secondary_color}AA 100%)`
          : `linear-gradient(135deg, ${brand.primary_color} 0%, ${brand.secondary_color} 100%)`,
      },
    })
  );
}

function buildSingleArt(params: {
  width: number;
  height: number;
  brand: BrandSettings;
  content: GeneratedContentPayload;
  offerPrice?: string | null;
  photoDataUrl: string | null;
  logoDataUrl: string | null;
}) {
  const h = React.createElement;
  const { width, height, brand, content, offerPrice, photoDataUrl, logoDataUrl } =
    params;
  const isTall = height > 1100;
  const heroHeight = isTall ? Math.round(height * 0.42) : 400;

  return h(
    "div",
    {
      style: {
        width: `${width}px`,
        height: `${height}px`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: brand.bg_color,
        fontFamily: "Plus Jakarta Sans, sans-serif",
        color: brand.text_color,
        position: "relative",
        overflow: "hidden",
      },
    },
    renderHeroGradient(brand, width, heroHeight, photoDataUrl),
    h(
      "div",
      {
        style: {
          position: "relative",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: `${width}px`,
          height: `${height}px`,
          padding: isTall ? "56px 48px" : "40px 44px",
        },
      },
      renderHeader({ brand, content, offerPrice }),
      h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "24px",
          },
        },
        h(
          "div",
          {
            style: {
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              flex: 1,
            },
          },
          h(
            "div",
            {
              style: {
                display: "flex",
                fontSize: isTall ? "60px" : "50px",
                fontWeight: 800,
                lineHeight: 1.07,
                color: "#FFFFFF",
                letterSpacing: "-0.02em",
              },
            },
            content.headline_arte
          ),
          h(
            "div",
            {
              style: {
                display: "flex",
                fontSize: isTall ? "25px" : "22px",
                fontWeight: 700,
                color: "rgba(255, 255, 255, 0.92)",
                lineHeight: 1.28,
              },
            },
            content.subtitulo_arte
          )
        ),
        photoDataUrl
          ? h(
              "div",
              {
                style: {
                  display: "flex",
                  width: isTall ? "240px" : "200px",
                  height: isTall ? "240px" : "200px",
                  borderRadius: "24px",
                  border: "4px solid #FFFFFF",
                  overflow: "hidden",
                  boxShadow: "0 18px 36px rgba(15, 23, 42, 0.35)",
                  flexShrink: 0,
                },
              },
              h("img", {
                src: photoDataUrl,
                alt: "Produto em destaque",
                style: {
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                },
              })
            )
          : null
      ),
      h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            backgroundColor: "#FFFFFF",
            borderRadius: "28px",
            border: "2px solid rgba(15, 23, 42, 0.08)",
            padding: isTall ? "32px" : "24px 26px",
            gap: isTall ? "20px" : "15px",
            boxShadow: "0 20px 48px rgba(15, 23, 42, 0.08)",
          },
        },
        h(
          "div",
          {
            style: {
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: "12px",
              backgroundColor: brand.bg_color,
              borderLeft: `6px solid ${brand.primary_color}`,
              borderRadius: "14px",
              padding: "14px 18px",
            },
          },
          svgBolt(brand.primary_color, 22),
          h(
            "div",
            {
              style: {
                display: "flex",
                fontSize: isTall ? "21px" : "19px",
                fontWeight: 700,
                color: brand.text_color,
                lineHeight: 1.3,
              },
            },
            content.dor_vs_solucao
          )
        ),
        h(
          "div",
          {
            style: {
              display: "flex",
              flexDirection: "row",
              flexWrap: "wrap",
              gap: "12px",
              width: "100%",
            },
          },
          ...content.beneficios.slice(0, 6).map((benefit, idx) =>
            h(
              "div",
              {
                key: `${idx}-${benefit}`,
                style: {
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: "10px",
                  width: "460px",
                  backgroundColor: brand.bg_color,
                  border: `1px solid ${brand.primary_color}26`,
                  borderRadius: "14px",
                  padding: isTall ? "15px 18px" : "12px 15px",
                },
              },
              svgCheck(brand.accent_color, 20),
              h(
                "div",
                {
                  style: {
                    display: "flex",
                    fontSize: isTall ? "19px" : "17px",
                    fontWeight: 700,
                    color: brand.text_color,
                    lineHeight: 1.25,
                  },
                },
                benefit
              )
            )
          )
        )
      ),
      renderFooter(brand, logoDataUrl)
    )
  );
}

function buildCarouselSlideArt(params: {
  slideIndex: number;
  totalSlides: number;
  width: number;
  height: number;
  brand: BrandSettings;
  content: GeneratedContentPayload;
  offerPrice?: string | null;
  photoDataUrl: string | null;
  logoDataUrl: string | null;
}) {
  const h = React.createElement;
  const {
    slideIndex,
    totalSlides,
    width,
    height,
    brand,
    content,
    offerPrice,
    photoDataUrl,
    logoDataUrl,
  } = params;

  const isFirst = slideIndex === 0;
  const isLast = slideIndex === totalSlides - 1;
  const slideData = content.slides[slideIndex] || {
    badge: `SLIDE ${slideIndex + 1}`,
    title: content.headline_arte,
    body: content.subtitulo_arte,
    highlight: offerPrice || "",
  };

  if (isFirst) {
    return h(
      "div",
      {
        style: {
          width: `${width}px`,
          height: `${height}px`,
          display: "flex",
          flexDirection: "column",
          fontFamily: "Plus Jakarta Sans, sans-serif",
          position: "relative",
          overflow: "hidden",
          backgroundColor: brand.primary_color,
        },
      },
      renderHeroGradient(brand, width, height, photoDataUrl),
      h(
        "div",
        {
          style: {
            position: "relative",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: `${width}px`,
            height: `${height}px`,
            padding: "50px 48px",
          },
        },
        renderHeader({
          brand,
          content,
          offerPrice,
          slideTag: `SLIDE 1/${totalSlides}`,
        }),
        h(
          "div",
          {
            style: {
              display: "flex",
              flexDirection: "column",
              gap: "20px",
              backgroundColor: "rgba(255, 255, 255, 0.94)",
              borderRadius: "30px",
              padding: "42px",
              boxShadow: "0 24px 56px rgba(15, 23, 42, 0.25)",
            },
          },
          h(
            "div",
            {
              style: {
                display: "flex",
                fontSize: "62px",
                fontWeight: 800,
                lineHeight: 1.07,
                color: brand.text_color,
                letterSpacing: "-0.02em",
              },
            },
            content.headline_arte
          ),
          h(
            "div",
            {
              style: {
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                gap: "12px",
                backgroundColor: brand.bg_color,
                borderLeft: `6px solid ${brand.primary_color}`,
                borderRadius: "14px",
                padding: "16px 20px",
              },
            },
            svgBolt(brand.primary_color, 24),
            h(
              "div",
              {
                style: {
                  display: "flex",
                  fontSize: "22px",
                  fontWeight: 700,
                  color: brand.text_color,
                },
              },
              content.dor_vs_solucao
            )
          ),
          h(
            "div",
            {
              style: {
                display: "flex",
                fontSize: "24px",
                fontWeight: 700,
                color: brand.primary_color,
              },
            },
            content.subtitulo_arte
          )
        ),
        renderFooter(brand, logoDataUrl, "DESLIZE PARA VER")
      )
    );
  }

  return h(
    "div",
    {
      style: {
        width: `${width}px`,
        height: `${height}px`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: brand.bg_color,
        fontFamily: "Plus Jakarta Sans, sans-serif",
        color: brand.text_color,
        padding: "48px",
      },
    },
    renderHeader({
      brand,
      content,
      offerPrice,
      slideTag: `SLIDE ${slideIndex + 1}/${totalSlides}`,
      darkText: true,
    }),
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: "24px",
          backgroundColor: "#FFFFFF",
          borderRadius: "30px",
          border: `2px solid ${brand.primary_color}22`,
          padding: "44px",
          boxShadow: "0 20px 44px rgba(15, 23, 42, 0.08)",
          flex: 1,
          marginTop: "24px",
          marginBottom: "24px",
        },
      },
      h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          },
        },
        h(
          "div",
          {
            style: {
              display: "flex",
              backgroundImage: `linear-gradient(135deg, ${brand.primary_color} 0%, ${brand.secondary_color} 100%)`,
              color: "#FFFFFF",
              padding: "10px 20px",
              borderRadius: "999px",
              fontSize: "18px",
              fontWeight: 800,
            },
          },
          slideData.badge.toUpperCase()
        ),
        slideData.highlight
          ? h(
              "div",
              {
                style: {
                  display: "flex",
                  backgroundColor: `${brand.accent_color}1A`,
                  color: brand.accent_color,
                  border: `1px solid ${brand.accent_color}`,
                  padding: "8px 16px",
                  borderRadius: "999px",
                  fontSize: "16px",
                  fontWeight: 800,
                },
              },
              slideData.highlight
            )
          : null
      ),
      h(
        "div",
        {
          style: {
            display: "flex",
            fontSize: "48px",
            fontWeight: 800,
            lineHeight: 1.12,
            color: brand.text_color,
          },
        },
        slideData.title
      ),
      h(
        "div",
        {
          style: {
            display: "flex",
            fontSize: "26px",
            fontWeight: 500,
            lineHeight: 1.45,
            color: "rgba(15, 23, 42, 0.78)",
          },
        },
        slideData.body
      ),
      isLast
        ? h(
            "div",
            {
              style: {
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                marginTop: "10px",
                backgroundColor: brand.bg_color,
                padding: "22px",
                borderRadius: "20px",
              },
            },
            ...content.beneficios.slice(0, 4).map((b, i) =>
              h(
                "div",
                {
                  key: `${i}-${b}`,
                  style: {
                    display: "flex",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: "10px",
                    fontSize: "20px",
                    fontWeight: 700,
                    color: brand.text_color,
                  },
                },
                svgCheck(brand.accent_color, 20),
                b
              )
            )
          )
        : photoDataUrl && slideIndex === 1
        ? h(
            "div",
            {
              style: {
                display: "flex",
                width: "100%",
                height: "280px",
                borderRadius: "20px",
                overflow: "hidden",
                border: `2px solid ${brand.primary_color}22`,
              },
            },
            h("img", {
              src: photoDataUrl,
              alt: slideData.title,
              style: { width: "100%", height: "100%", objectFit: "cover" },
            })
          )
        : null
    ),
    renderFooter(
      brand,
      logoDataUrl,
      isLast ? brand.cta_default : "PRÓXIMO SLIDE"
    )
  );
}

// ============================================================================
// ESTILO AGÊNCIA EDITORIAL & MOCKUPS (BASEADO NAS IMAGENS 2, 3, 4 E 5)
// ============================================================================

interface EditorialPalette {
  creamBg: string;
  terracotta: string;
  forestGreen: string;
  ink: string;
}

function parseEditorialPrompt(params: {
  customPrompt?: string | null;
  brand: BrandSettings;
  content: GeneratedContentPayload;
  offerPrice?: string | null;
  slideIndex?: number;
}) {
  const raw = (params.customPrompt || "")
    .replace(/\[cite:\s*[^\]]+\]/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  const lower = raw.toLowerCase();

  // Detecta cores do prompt (com padrão Creme #F5EFE6 + Terracota #B84A27 + Verde #1E7E53 + Preto #222222)
  const hexes: string[] = raw.match(/#[0-9A-Fa-f]{6}\b/g) || [];
  const bgMatch = raw.match(/fundo[^#.\n]*(#[0-9A-Fa-f]{6})/i);
  const terraMatch = raw.match(/(?:terracota|faixa|detalhes?)[^#.\n]*(#[0-9A-Fa-f]{6})/i);
  const greenMatch = raw.match(/(?:verde|p[ií]lula)[^#.\n]*(#[0-9A-Fa-f]{6})/i);
  const inkMatch = raw.match(/(?:preta|t[íi]tulo|fonte)[^#.\n]*(#[0-9A-Fa-f]{6})/i);

  const palette: EditorialPalette = {
    creamBg:
      bgMatch?.[1] ||
      (hexes.includes("#F5EFE6") || lower.includes("creme") ? "#F5EFE6" : "#F5EFE6"),
    terracotta:
      terraMatch?.[1] ||
      (hexes.includes("#B84A27") || lower.includes("terracota")
        ? "#B84A27"
        : params.brand.theme_preset !== "luminoso-tech"
        ? params.brand.primary_color
        : "#B84A27"),
    forestGreen:
      greenMatch?.[1] ||
      (hexes.includes("#1E7E53") || lower.includes("verde")
        ? "#1E7E53"
        : "#1E7E53"),
    ink: inkMatch?.[1] || "#222222",
  };

  // Detecta título explícito citado entre aspas no prompt (ex.: "CONTROLE TUDO + ATENDIMENTO COM IA")
  const explicitTitleMatch = raw.match(
    /(?:t[íi]tulo|headline)[^:"\n]{0,60}:\s*["“]([^"”]+)["”]/i
  );
  const title =
    (params.content.headline_arte || "").trim() ||
    explicitTitleMatch?.[1]?.trim() ||
    "CONTROLE TUDO + ATENDIMENTO COM IA";

  // Detecta preço explícito
  const priceMatch = raw.match(/12x\s*de\s*R\$\s*[\d.,]+/i);
  const priceLabel =
    params.offerPrice?.trim() ||
    priceMatch?.[0]?.trim() ||
    params.content.destaque_selo ||
    "12x de R$149,90";

  // Escolhe a composição visual com base nas palavras-chave do prompt (ou varia nos slides de carrossel)
  let variant: EditorialVariant = "finance_whatsapp";
  if (
    lower.includes("financeiro") ||
    lower.includes("whatsapp") ||
    lower.includes("rosca") ||
    lower.includes("faturamento") ||
    lower.includes("controle tudo")
  ) {
    variant = "finance_whatsapp";
  } else if (
    lower.includes("notebook") ||
    lower.includes("laptop") ||
    lower.includes("computador") ||
    lower.includes("curiosos")
  ) {
    variant = "laptop_phone";
  } else if (
    lower.includes("oferta") &&
    (lower.includes("gigante") || lower.includes("à vista") || lower.includes("card central"))
  ) {
    variant = "offer_poster";
  } else if (
    lower.includes("etiqueta") ||
    lower.includes("reservas 24h") ||
    lower.includes("tag")
  ) {
    variant = "phone_property_tag";
  } else if ((params.slideIndex ?? 0) > 0) {
    const cycle: EditorialVariant[] = [
      "finance_whatsapp",
      "laptop_phone",
      "phone_property_tag",
      "offer_poster",
    ];
    variant = cycle[(params.slideIndex ?? 0) % cycle.length];
  }

  return { palette, title, priceLabel, variant };
}

function renderArchitecturalVillaScene(
  widthLabel: string,
  heightLabel: string,
  palette: EditorialPalette
) {
  const h = React.createElement;
  // Ilustração vetorial nítida de casa de temporada com piscina cristalina e área gourmet (quando nenhuma foto foi enviada)
  return h(
    "div",
    {
      style: {
        display: "flex",
        width: widthLabel,
        height: heightLabel,
        position: "relative",
        overflow: "hidden",
        backgroundImage:
          "linear-gradient(180deg, #E8F3F8 0%, #FDF8F2 56%, #C58C5A 56%, #A66E3E 100%)",
      },
    },
    // Área gourmet / parede tijolinho e varanda
    h("div", {
      style: {
        position: "absolute",
        top: "52px",
        right: "0px",
        width: "78%",
        height: "48%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#EFE6DA",
        borderTop: "14px solid #D9CFC2",
        borderLeft: "10px solid #B65D3B",
        boxShadow: "-6px 10px 24px rgba(15, 23, 42, 0.14)",
      },
    }),
    // Parede tijolinho gourmet interna
    h("div", {
      style: {
        position: "absolute",
        top: "120px",
        left: "126px",
        width: "66px",
        height: "155px",
        display: "flex",
        backgroundColor: palette.terracotta,
        borderRadius: "4px",
      },
    }),
    // Luz pendente aconchegante
    h("div", {
      style: {
        position: "absolute",
        top: "95px",
        right: "74px",
        width: "26px",
        height: "20px",
        display: "flex",
        borderRadius: "999px",
        backgroundColor: "#F59E0B",
        boxShadow: "0 0 24px rgba(245, 158, 11, 0.6)",
      },
    }),
    // Vegetação tropical lateral
    h("div", {
      style: {
        position: "absolute",
        top: "140px",
        left: "-12px",
        width: "92px",
        height: "170px",
        display: "flex",
        borderRadius: "50%",
        backgroundColor: "#5E8C4A",
      },
    }),
    // Piscina cristalina em perspectiva limpa
    h(
      "div",
      {
        style: {
          position: "absolute",
          bottom: "24px",
          left: "26px",
          right: "26px",
          height: "36%",
          display: "flex",
          backgroundImage:
            "linear-gradient(135deg, #6BD5E8 0%, #269FB8 55%, #167E96 100%)",
          borderTop: "10px solid #E5D9C8",
          borderLeft: "8px solid #D5C6B2",
          borderRadius: "10px",
          boxShadow: "inset 0 8px 18px rgba(255,255,255,0.4)",
        },
      },
      h("div", {
        style: {
          position: "absolute",
          top: "18px",
          left: "24px",
          width: "65%",
          height: "6px",
          display: "flex",
          borderRadius: "999px",
          backgroundColor: "rgba(255, 255, 255, 0.35)",
        },
      })
    )
  );
}

function renderDonutChartSvg(primary: string, green: string) {
  const h = React.createElement;
  return h(
    "svg",
    { width: 96, height: 96, viewBox: "0 0 100 100", style: { flexShrink: 0 } },
    h("circle", {
      cx: 50,
      cy: 50,
      r: 36,
      fill: "none",
      stroke: "#F59E0B",
      strokeWidth: 15,
    }),
    h("circle", {
      cx: 50,
      cy: 50,
      r: 36,
      fill: "none",
      stroke: green,
      strokeWidth: 15,
      strokeDasharray: "120 226",
      strokeDashoffset: "25",
    }),
    h("circle", {
      cx: 50,
      cy: 50,
      r: 36,
      fill: "none",
      stroke: primary,
      strokeWidth: 15,
      strokeDasharray: "32 226",
      strokeDashoffset: "-95",
    })
  );
}

function renderWhatsAppPhoneMockup(heightPx = 390) {
  const h = React.createElement;
  return h(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        width: "226px",
        height: `${heightPx}px`,
        backgroundColor: "#18181B",
        borderRadius: "32px",
        padding: "8px",
        boxShadow: "0 22px 44px rgba(15, 23, 42, 0.32)",
        border: "2px solid #52525B",
      },
    },
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          flex: 1,
          backgroundColor: "#EFEAE2",
          borderRadius: "24px",
          overflow: "hidden",
        },
      },
      // Status bar + WhatsApp green header
      h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            backgroundColor: "#075E54",
            color: "#FFFFFF",
            padding: "10px 12px 10px 12px",
            gap: "4px",
          },
        },
        h(
          "div",
          {
            style: {
              display: "flex",
              flexDirection: "row",
              justifyContent: "space-between",
              width: "100%",
              fontSize: "10px",
              fontWeight: 700,
              opacity: 0.9,
            },
          },
          h("span", null, "9:41"),
          h("span", null, "5G")
        ),
        h(
          "div",
          {
            style: {
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: "8px",
            },
          },
          h(
            "div",
            {
              style: {
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "24px",
                height: "24px",
                borderRadius: "999px",
                backgroundColor: "#1E7E53",
                fontSize: "10px",
                fontWeight: 800,
              },
            },
            "IA"
          ),
          h(
            "div",
            {
              style: {
                display: "flex",
                flexDirection: "column",
              },
            },
            h(
              "div",
              { style: { display: "flex", fontSize: "11px", fontWeight: 800 } },
              "WhatsApp AI Assistant"
            ),
            h(
              "div",
              { style: { display: "flex", fontSize: "9px", opacity: 0.85 } },
              "online • responde na hora"
            )
          )
        )
      ),
      // Chat messages
      h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            gap: "7px",
            padding: "10px 8px",
            flex: 1,
          },
        },
        h(
          "div",
          {
            style: {
              display: "flex",
              alignSelf: "flex-end",
              backgroundColor: "#D9FDD3",
              color: "#111827",
              padding: "6px 9px",
              borderRadius: "10px",
              fontSize: "10px",
              fontWeight: 700,
              maxWidth: "85%",
            },
          },
          "Tem vaga para sábado?"
        ),
        h(
          "div",
          {
            style: {
              display: "flex",
              flexDirection: "column",
              alignSelf: "flex-start",
              backgroundColor: "#FFFFFF",
              color: "#111827",
              padding: "7px 9px",
              borderRadius: "10px",
              fontSize: "9.5px",
              fontWeight: 500,
              gap: "4px",
              maxWidth: "92%",
              boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
            },
          },
          "Sim! Sábado disponível para até 30 pessoas. Valor calculado: R$ 1.170,00.",
          h(
            "div",
            {
              style: {
                display: "flex",
                justifyContent: "center",
                backgroundColor: "#F0FDF4",
                color: "#166534",
                borderRadius: "6px",
                padding: "4px 6px",
                fontSize: "9px",
                fontWeight: 800,
              },
            },
            "Gerar PIX e Contrato"
          )
        ),
        h(
          "div",
          {
            style: {
              display: "flex",
              alignSelf: "flex-end",
              backgroundColor: "#D9FDD3",
              color: "#111827",
              padding: "6px 9px",
              borderRadius: "10px",
              fontSize: "10px",
              fontWeight: 700,
            },
          },
          "Perfeito! Pode fechar"
        ),
        h(
          "div",
          {
            style: {
              display: "flex",
              flexDirection: "column",
              alignSelf: "flex-start",
              backgroundColor: "#FFFFFF",
              color: "#111827",
              padding: "7px 9px",
              borderRadius: "10px",
              fontSize: "9.5px",
              fontWeight: 500,
              maxWidth: "92%",
            },
          },
          "Reserva confirmada! PDF do contrato e PIX enviados automaticamente."
        )
      ),
      // Bottom input bar
      h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: "#FFFFFF",
            margin: "0 8px 8px 8px",
            padding: "6px 10px",
            borderRadius: "999px",
            fontSize: "10px",
            color: "#6B7280",
          },
        },
        "Mensagem...",
        h("div", {
          style: {
            display: "flex",
            width: "18px",
            height: "18px",
            borderRadius: "999px",
            backgroundColor: "#1E7E53",
          },
        })
      )
    )
  );
}

function renderFinancialDashboardPanel(palette: EditorialPalette) {
  const h = React.createElement;
  return h(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        width: "100%",
        backgroundColor: "#FFFFFF",
        borderRadius: "20px",
        padding: "18px",
        border: "1px solid rgba(15, 23, 42, 0.08)",
        boxShadow: "0 14px 34px rgba(15, 23, 42, 0.08)",
      },
    },
    h(
      "div",
      {
        style: {
          display: "flex",
          fontSize: "11px",
          fontWeight: 800,
          letterSpacing: "0.04em",
          color: "#475569",
        },
      },
      "FATURAMENTO & RECEITAS"
    ),
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "row",
          gap: "10px",
        },
      },
      h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            flex: 1,
            backgroundColor: "#F8FAFC",
            border: "1px solid #E2E8F0",
            borderRadius: "14px",
            padding: "12px",
            gap: "3px",
          },
        },
        h(
          "div",
          { style: { display: "flex", fontSize: "9px", fontWeight: 700, color: "#64748B" } },
          "FATURAMENTO MÊS"
        ),
        h(
          "div",
          { style: { display: "flex", fontSize: "20px", fontWeight: 800, color: "#0F172A" } },
          "R$ 3.260,00"
        ),
        h(
          "div",
          { style: { display: "flex", fontSize: "9px", color: palette.forestGreen, fontWeight: 700 } },
          "+24% via reservas"
        )
      ),
      h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            flex: 1,
            backgroundColor: "#F8FAFC",
            border: "1px solid #E2E8F0",
            borderRadius: "14px",
            padding: "12px",
            gap: "3px",
          },
        },
        h(
          "div",
          { style: { display: "flex", fontSize: "9px", fontWeight: 700, color: "#64748B" } },
          "FATURAMENTO ANUAL"
        ),
        h(
          "div",
          { style: { display: "flex", fontSize: "20px", fontWeight: 800, color: "#0F172A" } },
          "R$ 17.690,00"
        ),
        h(
          "div",
          { style: { display: "flex", fontSize: "9px", color: palette.terracotta, fontWeight: 700 } },
          "0% taxa por venda"
        )
      )
    ),
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#F8FAFC",
          border: "1px solid #E2E8F0",
          borderRadius: "16px",
          padding: "14px",
          gap: "10px",
        },
      },
      h(
        "div",
        { style: { display: "flex", fontSize: "12px", fontWeight: 800, color: "#0F172A" } },
        "Despesas & Lucro do Mês"
      ),
      h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: "14px",
          },
        },
        renderDonutChartSvg(palette.terracotta, palette.forestGreen),
        h(
          "div",
          {
            style: {
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              fontSize: "11px",
              fontWeight: 700,
              color: "#334155",
            },
          },
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "6px" } },
            h("div", {
              style: {
                display: "flex",
                width: "10px",
                height: "10px",
                borderRadius: "999px",
                backgroundColor: palette.forestGreen,
              },
            }),
            "Saldo Líquido"
          ),
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "6px" } },
            h("div", {
              style: {
                display: "flex",
                width: "10px",
                height: "10px",
                borderRadius: "999px",
                backgroundColor: "#F59E0B",
              },
            }),
            "Manutenção"
          ),
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "6px" } },
            h("div", {
              style: {
                display: "flex",
                width: "10px",
                height: "10px",
                borderRadius: "999px",
                backgroundColor: palette.terracotta,
              },
            }),
            "Limpeza & Fixos"
          )
        )
      )
    )
  );
}

function buildEditorialSingleArt(params: {
  width: number;
  height: number;
  brand: BrandSettings;
  content: GeneratedContentPayload;
  offerPrice?: string | null;
  photoDataUrl: string | null;
  logoDataUrl: string | null;
  customPrompt?: string | null;
  slideIndex?: number;
  totalSlides?: number;
}) {
  const h = React.createElement;
  const { width, height, brand, content, offerPrice, photoDataUrl, customPrompt } =
    params;
  const isTall = height > 1100;
  const { palette, title, priceLabel, variant } = parseEditorialPrompt({
    customPrompt,
    brand,
    content,
    offerPrice,
    slideIndex: params.slideIndex,
  });

  // VARIANTE 4: CARD DE OFERTA IMPACTO (ESTILO IMAGEM 5)
  if (variant === "offer_poster") {
    return h(
      "div",
      {
        style: {
          width: `${width}px`,
          height: `${height}px`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundImage: `linear-gradient(90deg, ${palette.terracotta} 0%, ${palette.terracotta} 50%, #973719 50%, #973719 100%)`,
          fontFamily: "Plus Jakarta Sans, sans-serif",
          padding: isTall ? "64px 72px" : "46px 76px",
          position: "relative",
          overflow: "hidden",
        },
      },
      // Card central creme
      h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            height: "100%",
            backgroundColor: palette.creamBg,
            borderRadius: "34px",
            padding: isTall ? "54px 44px" : "38px 40px",
            boxShadow: "0 26px 60px rgba(15, 23, 42, 0.3)",
            position: "relative",
          },
        },
        h(
          "div",
          {
            style: {
              display: "flex",
              fontSize: "24px",
              fontWeight: 800,
              letterSpacing: "0.06em",
              color: palette.terracotta,
              textTransform: "uppercase",
            },
          },
          brand.footer_name
        ),
        h(
          "div",
          {
            style: {
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              gap: "8px",
            },
          },
          h(
            "div",
            {
              style: {
                display: "flex",
                fontSize: isTall ? "54px" : "46px",
                fontWeight: 800,
                lineHeight: 1.05,
                color: palette.ink,
                textAlign: "center",
              },
            },
            title.toUpperCase()
          ),
          h(
            "div",
            {
              style: {
                display: "flex",
                fontSize: "22px",
                fontWeight: 700,
                color: palette.terracotta,
                textAlign: "center",
              },
            },
            content.subtitulo_arte
          )
        ),
        // Foto ou destaque central + preço grande
        h(
          "div",
          {
            style: {
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: "22px",
              width: "100%",
            },
          },
          photoDataUrl
            ? h(
                "div",
                {
                  style: {
                    display: "flex",
                    width: "220px",
                    height: "220px",
                    borderRadius: "22px",
                    overflow: "hidden",
                    border: `4px solid ${palette.terracotta}`,
                    boxShadow: "0 14px 28px rgba(15, 23, 42, 0.16)",
                    flexShrink: 0,
                  },
                },
                h("img", {
                  src: photoDataUrl,
                  alt: title,
                  style: { width: "100%", height: "100%", objectFit: "cover" },
                })
              )
            : null,
          h(
            "div",
            {
              style: {
                display: "flex",
                flexDirection: "column",
                alignItems: photoDataUrl ? "flex-start" : "center",
                gap: "4px",
              },
            },
            h(
              "div",
              {
                style: {
                  display: "flex",
                  fontSize: "20px",
                  fontWeight: 800,
                  color: palette.terracotta,
                  textTransform: "uppercase",
                },
              },
              content.destaque_selo
            ),
            h(
              "div",
              {
                style: {
                  display: "flex",
                  fontSize: isTall ? "74px" : "62px",
                  fontWeight: 800,
                  lineHeight: 1.0,
                  color: palette.ink,
                  letterSpacing: "-0.02em",
                },
              },
              priceLabel
            )
          )
        ),
        h(
          "div",
          {
            style: {
              display: "flex",
              backgroundColor: palette.terracotta,
              color: "#FFFFFF",
              padding: "10px 24px",
              borderRadius: "999px",
              fontSize: "20px",
              fontWeight: 700,
            },
          },
          content.dor_vs_solucao
        ),
        h(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: palette.terracotta,
              color: "#FFFFFF",
              padding: "18px 46px",
              borderRadius: "20px",
              border: `3px solid ${palette.ink}`,
              fontSize: "28px",
              fontWeight: 800,
              boxShadow: "0 10px 0px rgba(34, 34, 34, 0.9)",
            },
          },
          "GARANTIR ESSA OFERTA"
        )
      )
    );
  }

  // VARIANTE 3: SMARTPHONE + FOTO COM ETIQUETA DE PREÇO VERDE (ESTILO IMAGEM 4)
  if (variant === "phone_property_tag") {
    return h(
      "div",
      {
        style: {
          width: `${width}px`,
          height: `${height}px`,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: palette.creamBg,
          fontFamily: "Plus Jakarta Sans, sans-serif",
          padding: isTall ? "56px 46px" : "42px 44px",
          position: "relative",
          overflow: "hidden",
        },
      },
      // Topo título
      h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
          },
        },
        h(
          "div",
          {
            style: {
              display: "flex",
              fontSize: isTall ? "60px" : "52px",
              fontWeight: 800,
              lineHeight: 1.07,
              color: palette.ink,
              textAlign: "center",
            },
          },
          title.toUpperCase()
        )
      ),
      // Centro: Foto ampla à direita com etiqueta verde no topo + Smartphone à esquerda sobreposto
      h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            position: "relative",
            width: "100%",
            height: isTall ? "740px" : "640px",
          },
        },
        // Moldura direita grande com a foto (ou cenário piscina)
        h(
          "div",
          {
            style: {
              position: "absolute",
              right: "0px",
              bottom: "24px",
              width: "660px",
              height: isTall ? "560px" : "470px",
              display: "flex",
              borderRadius: "26px",
              overflow: "hidden",
              border: "4px solid #FFFFFF",
              boxShadow: "0 22px 48px rgba(15, 23, 42, 0.16)",
            },
          },
          photoDataUrl
            ? h("img", {
                src: photoDataUrl,
                alt: title,
                style: { width: "100%", height: "100%", objectFit: "cover" },
              })
            : renderArchitecturalVillaScene("660px", isTall ? "560px" : "470px", palette)
        ),
        // Etiqueta verde de preço sobreposta no canto superior direito
        h(
          "div",
          {
            style: {
              position: "absolute",
              right: "26px",
              top: "26px",
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: "14px",
              backgroundColor: palette.forestGreen,
              color: "#FFFFFF",
              padding: "20px 34px",
              borderRadius: "20px",
              boxShadow: "0 18px 34px rgba(30, 126, 83, 0.35)",
            },
          },
          h("div", {
            style: {
              display: "flex",
              width: "14px",
              height: "14px",
              borderRadius: "999px",
              backgroundColor: palette.creamBg,
            },
          }),
          h(
            "div",
            { style: { display: "flex", fontSize: "40px", fontWeight: 800 } },
            priceLabel
          )
        ),
        // Celular sobreposto à esquerda
        h(
          "div",
          {
            style: {
              position: "absolute",
              left: "12px",
              top: "40px",
              display: "flex",
              flexDirection: "column",
              width: "350px",
              height: isTall ? "640px" : "565px",
              backgroundColor: "#1F2937",
              borderRadius: "42px",
              padding: "12px",
              border: "3px solid #D6D3D1",
              boxShadow: "14px 24px 48px rgba(15, 23, 42, 0.28)",
            },
          },
          h(
            "div",
            {
              style: {
                display: "flex",
                flexDirection: "column",
                flex: 1,
                backgroundColor: "#FFFFFF",
                borderRadius: "32px",
                padding: "22px 20px",
                justifyContent: "space-between",
              },
            },
            h(
              "div",
              {
                style: {
                  display: "flex",
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                },
              },
              h(
                "div",
                {
                  style: {
                    display: "flex",
                    backgroundColor: palette.terracotta,
                    color: "#FFFFFF",
                    padding: "6px 12px",
                    borderRadius: "8px",
                    fontSize: "12px",
                    fontWeight: 800,
                  },
                },
                "SISTEMA DE RESERVAS"
              ),
              h(
                "div",
                { style: { display: "flex", fontSize: "12px", fontWeight: 700, color: "#64748B" } },
                "24H PIX"
              )
            ),
            h(
              "div",
              { style: { display: "flex", flexDirection: "column", gap: "10px" } },
              h(
                "div",
                {
                  style: {
                    display: "flex",
                    flexDirection: "column",
                    backgroundColor: "#FFF7ED",
                    border: `1px solid ${palette.terracotta}44`,
                    borderRadius: "14px",
                    padding: "12px",
                    gap: "4px",
                  },
                },
                h("div", { style: { display: "flex", fontSize: "11px", color: "#9A3412", fontWeight: 700 } }, "SOLICITAR RESERVA"),
                h("div", { style: { display: "flex", fontSize: "16px", fontWeight: 800, color: "#1E293B" } }, "Sábado • Diária Completa")
              ),
              ...content.beneficios.slice(0, 3).map((b, i) =>
                h(
                  "div",
                  {
                    key: i,
                    style: {
                      display: "flex",
                      flexDirection: "row",
                      alignItems: "center",
                      gap: "8px",
                      backgroundColor: "#F8FAFC",
                      border: "1px solid #E2E8F0",
                      borderRadius: "12px",
                      padding: "9px 10px",
                      fontSize: "11.5px",
                      fontWeight: 700,
                      color: "#0F172A",
                    },
                  },
                  svgCheck(palette.forestGreen, 15),
                  b
                )
              )
            ),
            h(
              "div",
              {
                style: {
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderTop: "1px solid #E2E8F0",
                  paddingTop: "12px",
                },
              },
              h("div", { style: { display: "flex", fontSize: "12px", color: "#64748B", fontWeight: 700 } }, "VALOR TOTAL"),
              h("div", { style: { display: "flex", fontSize: "22px", fontWeight: 800, color: palette.ink } }, "R$ 1.170,00")
            )
          )
        )
      ),
      // Rodapé limpo centrado
      h(
        "div",
        {
          style: {
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            fontSize: "30px",
            fontWeight: 800,
            color: palette.ink,
          },
        },
        brand.footer_name
      )
    );
  }

  // VARIANTE 2: NOTEBOOK + CELULAR MOCKUP (ESTILO IMAGEM 2)
  if (variant === "laptop_phone") {
    return h(
      "div",
      {
        style: {
          width: `${width}px`,
          height: `${height}px`,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: palette.creamBg,
          fontFamily: "Plus Jakarta Sans, sans-serif",
          padding: isTall ? "54px 44px" : "42px 44px",
          position: "relative",
          overflow: "hidden",
        },
      },
      // Detalhes geométricos terracota nos cantos
      h("div", {
        style: {
          position: "absolute",
          top: "0px",
          right: "0px",
          width: "160px",
          height: "36px",
          display: "flex",
          backgroundColor: palette.terracotta,
        },
      }),
      h("div", {
        style: {
          position: "absolute",
          top: "300px",
          right: "0px",
          width: "260px",
          height: "280px",
          display: "flex",
          backgroundColor: palette.terracotta,
        },
      }),
      // Topo headline + pílula terracota de preço
      h(
        "div",
        {
          style: {
            position: "relative",
            display: "flex",
            flexDirection: "column",
            gap: "18px",
          },
        },
        h(
          "div",
          {
            style: {
              display: "flex",
              fontSize: isTall ? "60px" : "52px",
              fontWeight: 800,
              lineHeight: 1.07,
              color: palette.ink,
              textAlign: "center",
              justifyContent: "center",
            },
          },
          title.toUpperCase()
        ),
        h(
          "div",
          {
            style: {
              display: "flex",
              alignSelf: "flex-start",
              backgroundColor: palette.terracotta,
              color: "#FFFFFF",
              padding: "14px 30px",
              borderRadius: "16px",
              fontSize: "34px",
              fontWeight: 800,
              marginLeft: "26px",
              boxShadow: "0 10px 24px rgba(184, 74, 39, 0.28)",
            },
          },
          priceLabel
        )
      ),
      // Palco central: Smartphone à esquerda + Notebook à direita
      h(
        "div",
        {
          style: {
            position: "relative",
            display: "flex",
            flexDirection: "row",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: "18px",
            height: isTall ? "620px" : "540px",
          },
        },
        // Smartphone esquerdo
        h(
          "div",
          {
            style: {
              display: "flex",
              flexDirection: "column",
              width: "240px",
              height: "450px",
              backgroundColor: "#18181B",
              borderRadius: "32px",
              padding: "10px",
              border: "2px solid #52525B",
              boxShadow: "0 20px 44px rgba(15, 23, 42, 0.26)",
              marginBottom: "30px",
              flexShrink: 0,
            },
          },
          h(
            "div",
            {
              style: {
                display: "flex",
                flexDirection: "column",
                flex: 1,
                backgroundColor: "#FFFFFF",
                borderRadius: "24px",
                padding: "16px",
                justifyContent: "space-between",
              },
            },
            h("div", { style: { display: "flex", fontSize: "13px", fontWeight: 800, color: palette.terracotta } }, "Solicitar Reserva"),
            ...content.beneficios.slice(0, 3).map((b, i) =>
              h(
                "div",
                {
                  key: i,
                  style: {
                    display: "flex",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: "6px",
                    backgroundColor: "#F8FAFC",
                    padding: "8px",
                    borderRadius: "8px",
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "#0F172A",
                  },
                },
                svgCheck(palette.forestGreen, 14),
                b
              )
            ),
            h(
              "div",
              {
                style: {
                  display: "flex",
                  flexDirection: "row",
                  justifyContent: "space-between",
                  width: "100%",
                  backgroundColor: "#FFF7ED",
                  padding: "10px",
                  borderRadius: "10px",
                  fontSize: "13px",
                  fontWeight: 800,
                  color: palette.ink,
                },
              },
              h("span", null, "Orçamento:"),
              h("span", null, "R$ 1.170")
            )
          )
        ),
        // Notebook direito
        h(
          "div",
          {
            style: {
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              flex: 1,
              marginBottom: "20px",
            },
          },
          h(
            "div",
            {
              style: {
                display: "flex",
                flexDirection: "column",
                width: "100%",
                height: isTall ? "500px" : "430px",
                backgroundColor: "#18181B",
                borderRadius: "22px 22px 6px 6px",
                padding: "14px",
                border: "2px solid #A1A1AA",
                boxShadow: "0 24px 50px rgba(15, 23, 42, 0.25)",
              },
            },
            h(
              "div",
              {
                style: {
                  display: "flex",
                  flexDirection: "column",
                  flex: 1,
                  backgroundColor: "#FFFFFF",
                  borderRadius: "10px",
                  overflow: "hidden",
                },
              },
              photoDataUrl
                ? h("img", {
                    src: photoDataUrl,
                    alt: title,
                    style: { width: "100%", height: "54%", objectFit: "cover" },
                  })
                : h(
                    "div",
                    {
                      style: {
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        width: "100%",
                        height: "56%",
                        backgroundColor: "#FFF7ED",
                        padding: "16px 20px",
                        borderBottom: "1px solid #FED7AA",
                      },
                    },
                    h(
                      "div",
                      {
                        style: {
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          width: "100%",
                        },
                      },
                      h(
                        "div",
                        { style: { display: "flex", fontSize: "14px", fontWeight: 800, color: palette.ink } },
                        "Portal de Reservas Online"
                      ),
                      h(
                        "div",
                        {
                          style: {
                            display: "flex",
                            backgroundColor: palette.forestGreen,
                            color: "#FFFFFF",
                            padding: "5px 12px",
                            borderRadius: "999px",
                            fontSize: "11px",
                            fontWeight: 800,
                          },
                        },
                        "DISPONÍVEL"
                      )
                    ),
                    renderArchitecturalVillaScene("100%", "145px", palette)
                  ),
              h(
                "div",
                {
                  style: {
                    display: "flex",
                    flexDirection: "column",
                    padding: "16px 20px",
                    gap: "10px",
                    flex: 1,
                    justifyContent: "space-between",
                  },
                },
                h(
                  "div",
                  { style: { display: "flex", fontSize: "15px", fontWeight: 800, color: palette.terracotta } },
                  `${brand.footer_name} • Plataforma Própria Sem Taxas`
                ),
                h(
                  "div",
                  {
                    style: {
                      display: "flex",
                      flexDirection: "row",
                      gap: "10px",
                    },
                  },
                  h(
                    "div",
                    {
                      style: {
                        display: "flex",
                        flexDirection: "column",
                        flex: 1,
                        backgroundColor: "#F8FAFC",
                        border: "1px solid #E2E8F0",
                        borderRadius: "10px",
                        padding: "10px",
                      },
                    },
                    h("div", { style: { display: "flex", fontSize: "10px", color: "#64748B", fontWeight: 700 } }, "CHECK-IN ONLINE"),
                    h("div", { style: { display: "flex", fontSize: "15px", fontWeight: 800, color: "#0F172A" } }, "PIX Automático")
                  ),
                  h(
                    "div",
                    {
                      style: {
                        display: "flex",
                        flexDirection: "column",
                        flex: 1,
                        backgroundColor: "#FFF7ED",
                        border: `1px solid ${palette.terracotta}44`,
                        borderRadius: "10px",
                        padding: "10px",
                      },
                    },
                    h("div", { style: { display: "flex", fontSize: "10px", color: palette.terracotta, fontWeight: 700 } }, "RESUMO DO ORÇAMENTO"),
                    h("div", { style: { display: "flex", fontSize: "16px", fontWeight: 800, color: palette.ink } }, "R$ 1.170,00")
                  )
                )
              )
            )
          ),
          // Base metálica do notebook
          h("div", {
            style: {
              display: "flex",
              width: "104%",
              height: "20px",
              backgroundImage: "linear-gradient(180deg, #E4E4E7 0%, #9CA3AF 100%)",
              borderRadius: "0 0 18px 18px",
            },
          })
        )
      ),
      h(
        "div",
        {
          style: {
            position: "relative",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: "24px",
            fontWeight: 800,
            color: palette.ink,
          },
        },
        brand.footer_name,
        h(
          "div",
          {
            style: {
              display: "flex",
              backgroundColor: palette.forestGreen,
              color: "#FFFFFF",
              padding: "10px 24px",
              borderRadius: "999px",
              fontSize: "18px",
            },
          },
          content.destaque_selo
        )
      )
    );
  }

  // VARIANTE 1 (PADRÃO DO PROMPT ANEXADO): CREME QUENTE + TERRACOTA + FOTO À ESQUERDA + PAINEL + WHATSAPP IA + FAIXA INFERIOR (IMAGEM 3)
  const frameHeight = isTall ? 740 : 620;
  return h(
    "div",
    {
      style: {
        width: `${width}px`,
        height: `${height}px`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: palette.creamBg,
        fontFamily: "Plus Jakarta Sans, sans-serif",
        position: "relative",
        overflow: "hidden",
      },
    },
    // Detalhes geométricos em terracota nos cantos
    h("div", {
      style: {
        position: "absolute",
        top: "0px",
        right: "0px",
        width: "68px",
        height: "78px",
        display: "flex",
        backgroundColor: palette.terracotta,
      },
    }),
    h("div", {
      style: {
        position: "absolute",
        top: "0px",
        left: "0px",
        width: "44px",
        height: "44px",
        display: "flex",
        backgroundColor: palette.terracotta,
      },
    }),
    h("div", {
      style: {
        position: "absolute",
        top: "238px",
        right: "0px",
        width: "200px",
        height: "3px",
        display: "flex",
        backgroundColor: palette.terracotta,
      },
    }),
    // Topo: Título grande em preto negrito (#222222)
    h(
      "div",
      {
        style: {
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: isTall ? "56px 52px 18px 52px" : "40px 52px 14px 52px",
          textAlign: "center",
        },
      },
      h(
        "div",
        {
          style: {
            display: "flex",
            fontSize: isTall ? "62px" : "56px",
            fontWeight: 800,
            lineHeight: 1.06,
            color: palette.ink,
            textAlign: "center",
            letterSpacing: "-0.02em",
          },
        },
        title.toUpperCase()
      )
    ),
    // Palco central: Esquerda (Foto em quadro vertical com cantos terracota) + Direita (Painel financeiro + WhatsApp IA)
    h(
      "div",
      {
        style: {
          position: "relative",
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "24px",
          padding: isTall ? "12px 42px 24px 42px" : "10px 40px 20px 40px",
          flex: 1,
        },
      },
      // Coluna esquerda: Quadro vertical com cantos terracota
      h(
        "div",
        {
          style: {
            position: "relative",
            display: "flex",
            width: "466px",
            height: `${frameHeight}px`,
            flexShrink: 0,
          },
        },
        h("div", {
          style: {
            position: "absolute",
            top: "-12px",
            left: "-12px",
            width: "110px",
            height: "110px",
            display: "flex",
            backgroundColor: palette.terracotta,
            borderRadius: "10px",
          },
        }),
        h("div", {
          style: {
            position: "absolute",
            bottom: "-12px",
            left: "-12px",
            width: "66px",
            height: "66px",
            display: "flex",
            backgroundColor: palette.terracotta,
            borderRadius: "8px",
          },
        }),
        h(
          "div",
          {
            style: {
              position: "relative",
              display: "flex",
              width: "466px",
              height: `${frameHeight}px`,
              borderRadius: "24px",
              overflow: "hidden",
              boxShadow: "0 20px 44px rgba(15, 23, 42, 0.16)",
              backgroundColor: "#FFFFFF",
            },
          },
          photoDataUrl
            ? h("img", {
                src: photoDataUrl,
                alt: title,
                style: {
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                },
              })
            : renderArchitecturalVillaScene("466px", `${frameHeight}px`, palette)
        )
      ),
      // Coluna direita: Painel financeiro limpo + Smartphone WhatsApp AI Assistant sobreposto
      h(
        "div",
        {
          style: {
            position: "relative",
            display: "flex",
            flexDirection: "column",
            flex: 1,
            height: `${frameHeight}px`,
            justifyContent: "flex-start",
          },
        },
        renderFinancialDashboardPanel(palette),
        h(
          "div",
          {
            style: {
              position: "absolute",
              right: "-6px",
              bottom: "-10px",
              display: "flex",
            },
          },
          renderWhatsAppPhoneMockup(isTall ? 430 : 395)
        )
      )
    ),
    // Faixa inferior sólida em terracota com pílula verde-escura à esquerda e nome da marca branco à direita
    h(
      "div",
      {
        style: {
          position: "relative",
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          height: isTall ? "148px" : "128px",
          backgroundColor: palette.terracotta,
          padding: "0 46px",
        },
      },
      h(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: palette.forestGreen,
            color: "#FFFFFF",
            padding: "16px 38px",
            borderRadius: "999px",
            fontSize: isTall ? "42px" : "38px",
            fontWeight: 800,
            boxShadow: "0 10px 24px rgba(15, 23, 42, 0.22)",
            whiteSpace: "nowrap",
          },
        },
        priceLabel
      ),
      h(
        "div",
        {
          style: {
            display: "flex",
            fontSize: isTall ? "40px" : "36px",
            fontWeight: 800,
            color: "#FFFFFF",
            letterSpacing: "-0.01em",
            whiteSpace: "nowrap",
          },
        },
        brand.footer_name
      )
    )
  );
}

function buildEditorialCarouselSlideArt(params: {
  slideIndex: number;
  totalSlides: number;
  width: number;
  height: number;
  brand: BrandSettings;
  content: GeneratedContentPayload;
  offerPrice?: string | null;
  photoDataUrl: string | null;
  logoDataUrl: string | null;
  customPrompt?: string | null;
}) {
  const h = React.createElement;
  if (params.slideIndex === 0) {
    return buildEditorialSingleArt(params);
  }

  const { width, height, brand, content, offerPrice, photoDataUrl, customPrompt } =
    params;
  const { palette, priceLabel } = parseEditorialPrompt({
    customPrompt,
    brand,
    content,
    offerPrice,
    slideIndex: params.slideIndex,
  });
  const slideData = content.slides[params.slideIndex] || {
    badge: `SLIDE ${params.slideIndex + 1}`,
    title: content.headline_arte,
    body: content.subtitulo_arte,
    highlight: priceLabel,
  };
  const isLast = params.slideIndex === params.totalSlides - 1;

  return h(
    "div",
    {
      style: {
        width: `${width}px`,
        height: `${height}px`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: palette.creamBg,
        fontFamily: "Plus Jakarta Sans, sans-serif",
        position: "relative",
        overflow: "hidden",
      },
    },
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "44px 48px 0 48px",
        },
      },
      h(
        "div",
        {
          style: {
            display: "flex",
            backgroundColor: palette.terracotta,
            color: "#FFFFFF",
            padding: "10px 22px",
            borderRadius: "999px",
            fontSize: "18px",
            fontWeight: 800,
          },
        },
        `${slideData.badge.toUpperCase()} • ${params.slideIndex + 1}/${params.totalSlides}`
      ),
      h(
        "div",
        {
          style: {
            display: "flex",
            backgroundColor: palette.forestGreen,
            color: "#FFFFFF",
            padding: "10px 22px",
            borderRadius: "999px",
            fontSize: "20px",
            fontWeight: 800,
          },
        },
        slideData.highlight || priceLabel
      )
    ),
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: "22px",
          backgroundColor: "#FFFFFF",
          borderRadius: "30px",
          padding: "42px",
          margin: "26px 46px",
          flex: 1,
          border: `2px solid ${palette.terracotta}2A`,
          boxShadow: "0 20px 44px rgba(15, 23, 42, 0.08)",
        },
      },
      h(
        "div",
        {
          style: {
            display: "flex",
            fontSize: "48px",
            fontWeight: 800,
            lineHeight: 1.1,
            color: palette.ink,
          },
        },
        slideData.title.toUpperCase()
      ),
      h(
        "div",
        {
          style: {
            display: "flex",
            fontSize: "25px",
            fontWeight: 500,
            lineHeight: 1.45,
            color: "#334155",
          },
        },
        slideData.body
      ),
      isLast
        ? h(
            "div",
            {
              style: {
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                backgroundColor: palette.creamBg,
                padding: "22px",
                borderRadius: "20px",
              },
            },
            ...content.beneficios.slice(0, 4).map((b, i) =>
              h(
                "div",
                {
                  key: `${i}-${b}`,
                  style: {
                    display: "flex",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: "10px",
                    fontSize: "20px",
                    fontWeight: 700,
                    color: palette.ink,
                  },
                },
                svgCheck(palette.forestGreen, 20),
                b
              )
            )
          )
        : photoDataUrl && params.slideIndex === 1
        ? h(
            "div",
            {
              style: {
                display: "flex",
                width: "100%",
                height: "300px",
                borderRadius: "20px",
                overflow: "hidden",
                border: `3px solid ${palette.terracotta}`,
              },
            },
            h("img", {
              src: photoDataUrl,
              alt: slideData.title,
              style: { width: "100%", height: "100%", objectFit: "cover" },
            })
          )
        : null
    ),
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          height: "118px",
          backgroundColor: palette.terracotta,
          padding: "0 46px",
        },
      },
      h(
        "div",
        {
          style: {
            display: "flex",
            backgroundColor: palette.forestGreen,
            color: "#FFFFFF",
            padding: "14px 30px",
            borderRadius: "999px",
            fontSize: "28px",
            fontWeight: 800,
          },
        },
        priceLabel
      ),
      h(
        "div",
        {
          style: {
            display: "flex",
            fontSize: "28px",
            fontWeight: 800,
            color: "#FFFFFF",
          },
        },
        isLast ? `${brand.footer_name} • ${brand.cta_default}` : `${brand.footer_name} →`
      )
    )
  );
}

export async function renderArtSlidesBuffers(params: {
  brand: BrandSettings;
  content: GeneratedContentPayload;
  format: PostFormat;
  slidesCount: number;
  aspectRatio: AspectRatio;
  offerPrice?: string | null;
  productPhotoUrl?: string | null;
  aiPhotoMode?: AIPhotoMode;
  customPrompt?: string | null;
}): Promise<Buffer[]> {
  const { width, height } = DIMENSIONS[params.aspectRatio] || DIMENSIONS["1:1"];
  const [fonts, photoDataUrl, logoDataUrl] = await Promise.all([
    loadFonts(),
    toDataUrl(params.productPhotoUrl),
    toDataUrl(params.brand.logo_url),
  ]);

  const useEditorialAgency =
    params.aiPhotoMode === "EDITORIAL_MOCKUP" ||
    params.aiPhotoMode === "AI_FULL_CREATIVE";

  const editorialPhotoDataUrl =
    photoDataUrl ||
    (useEditorialAgency
      ? await loadEditorialSampleDataUrl(
          params.customPrompt,
          params.content.headline_arte
        )
      : null);

  if (params.format === "SINGLE" || params.slidesCount <= 1) {
    const element = useEditorialAgency
      ? buildEditorialSingleArt({
          width,
          height,
          brand: params.brand,
          content: params.content,
          offerPrice: params.offerPrice,
          photoDataUrl: editorialPhotoDataUrl,
          logoDataUrl,
          customPrompt: params.customPrompt,
        })
      : buildSingleArt({
          width,
          height,
          brand: params.brand,
          content: params.content,
          offerPrice: params.offerPrice,
          photoDataUrl,
          logoDataUrl,
        });
    const res = new ImageResponse(element, {
      width,
      height,
      fonts: fonts.length > 0 ? fonts : undefined,
    });
    return [Buffer.from(await res.arrayBuffer())];
  }

  const total = Math.min(8, Math.max(2, params.slidesCount));
  const buffers: Buffer[] = [];
  for (let i = 0; i < total; i++) {
    const element = useEditorialAgency
      ? buildEditorialCarouselSlideArt({
          slideIndex: i,
          totalSlides: total,
          width,
          height,
          brand: params.brand,
          content: params.content,
          offerPrice: params.offerPrice,
          photoDataUrl: editorialPhotoDataUrl,
          logoDataUrl,
          customPrompt: params.customPrompt,
        })
      : buildCarouselSlideArt({
          slideIndex: i,
          totalSlides: total,
          width,
          height,
          brand: params.brand,
          content: params.content,
          offerPrice: params.offerPrice,
          photoDataUrl,
          logoDataUrl,
        });
    const res = new ImageResponse(element, {
      width,
      height,
      fonts: fonts.length > 0 ? fonts : undefined,
    });
    buffers.push(Buffer.from(await res.arrayBuffer()));
  }
  return buffers;
}
