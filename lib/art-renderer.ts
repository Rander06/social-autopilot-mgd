import React from "react";
import { ImageResponse } from "@vercel/og";
import {
  AspectRatio,
  BrandSettings,
  GeneratedContentPayload,
  PostFormat,
} from "./types";

const fontCache = new Map<string, ArrayBuffer>();

const DIMENSIONS: Record<AspectRatio, { width: number; height: number }> = {
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
  "9:16": { width: 1080, height: 1920 },
};

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
      // Headline + foto produto lateral quando houver
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
                fontSize: isTall ? "60px" : "52px",
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
                fontSize: isTall ? "26px" : "23px",
                fontWeight: 700,
                color: "rgba(255, 255, 255, 0.92)",
                lineHeight: 1.3,
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
                  width: isTall ? "250px" : "210px",
                  height: isTall ? "250px" : "210px",
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
      // Card luminoso de benefícios + dor vs solução
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

export async function renderArtSlidesBuffers(params: {
  brand: BrandSettings;
  content: GeneratedContentPayload;
  format: PostFormat;
  slidesCount: number;
  aspectRatio: AspectRatio;
  offerPrice?: string | null;
  productPhotoUrl?: string | null;
}): Promise<Buffer[]> {
  const { width, height } = DIMENSIONS[params.aspectRatio] || DIMENSIONS["1:1"];
  const [fonts, photoDataUrl, logoDataUrl] = await Promise.all([
    loadFonts(),
    toDataUrl(params.productPhotoUrl),
    toDataUrl(params.brand.logo_url),
  ]);

  if (params.format === "SINGLE" || params.slidesCount <= 1) {
    const element = buildSingleArt({
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
    const element = buildCarouselSlideArt({
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
