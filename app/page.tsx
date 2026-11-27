"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AI_PHOTO_PROMPT_EXAMPLES,
  LUMINOUS_THEME_PRESETS,
  NICHE_TOPIC_TEMPLATES,
  SCHEDULE_TIME_SLOTS,
  WEEKDAY_LABELS,
} from "@/lib/presets";
import {
  buildSupportWhatsappPreviewText,
  buildSupportWhatsappUrl,
  SUPPORT_EMAIL,
  SUPPORT_WHATSAPP_DISPLAY,
  TIP_COMPLETED_DEFAULT_MESSAGE,
  TIP_ENCOURAGEMENT_TEXT,
} from "@/lib/support";
import {
  BoostCampaignModal,
  CampaignsPanel,
} from "./components/CampaignsModule";
import {
  AdAccountConfig,
  AIProvider,
  AIPhotoMode,
  ApprovalMode,
  AspectRatio,
  AuditLogItem,
  BrandSettings,
  Company,
  CompanyIntegrationsPublic,
  CompanyStatus,
  GeneratedContentPayload,
  ImageAIProvider,
  ImprovementTip,
  Plan,
  PostFormat,
  PostHistoryItem,
  PublishTargets,
  Topic,
  TopicPhoto,
  UserRole,
} from "@/lib/types";

interface SessionUser {
  id: string;
  company_id: string | null;
  role: UserRole;
  email: string;
  name: string;
}

interface WorkspaceData {
  database_mode: "supabase" | "memory";
  company: Company;
  plan: Plan;
  brand: BrandSettings;
  integrations: CompanyIntegrationsPublic;
  topics: Topic[];
  photos: TopicPhoto[];
  posts: PostHistoryItem[];
  audits: AuditLogItem[];
  tips: ImprovementTip[];
}

interface AdminCompanyRow extends Company {
  plan_name: string;
  plan_price: number;
  plan_limit: number;
  topics_count: number;
  integrations: CompanyIntegrationsPublic;
}

interface AdminSnapshot {
  database_mode: "supabase" | "memory";
  metrics: {
    total_companies: number;
    active_companies: number;
    trial_companies: number;
    blocked_or_due: number;
    mrr_brl: number;
    total_posts_month: number;
  };
  plans: Plan[];
  companies: AdminCompanyRow[];
  users: Array<{
    id: string;
    company_id: string | null;
    name: string;
    email: string;
    role: UserRole;
  }>;
  posts: PostHistoryItem[];
  audits: AuditLogItem[];
  tips: ImprovementTip[];
}

interface StudioPreviewState {
  companyId: string;
  draftPostId?: string | null;
  topicId: string | null;
  topicTitle: string;
  providerUsed: string;
  imageProviderUsed?: string;
  format: PostFormat;
  aspectRatio: AspectRatio;
  slidesCount: number;
  imageUrl: string;
  imageUrls: string[];
  storyImageUrls?: string[];
  publishTargets?: PublishTargets;
  post: GeneratedContentPayload;
  logs: string[];
}

type ClientTab =
  | "dashboard"
  | "topics"
  | "studio"
  | "brand"
  | "integrations"
  | "history"
  | "campaigns"
  | "support";

type AdminTab = "overview" | "companies" | "plans" | "audit" | "tips";

function fileToBase64(file: File): Promise<{ base64: string; contentType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const rawDataUrl = String(reader.result || "");
      if (typeof document === "undefined" || !file.type.startsWith("image/")) {
        resolve({
          base64: rawDataUrl,
          contentType: file.type || "image/jpeg",
        });
        return;
      }

      const img = new Image();
      img.onload = () => {
        const maxSide = 1280;
        const largest = Math.max(img.width || 1, img.height || 1);
        const scale = Math.min(1, maxSide / largest);

        if (scale >= 1 && file.size <= 700_000) {
          resolve({
            base64: rawDataUrl,
            contentType: file.type || "image/jpeg",
          });
          return;
        }

        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve({
            base64: rawDataUrl,
            contentType: file.type || "image/jpeg",
          });
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const outputMime =
          file.type === "image/png" || file.type === "image/webp"
            ? "image/png"
            : "image/jpeg";
        resolve({
          base64: canvas.toDataURL(outputMime, 0.92),
          contentType: outputMime,
        });
      };
      img.onerror = () =>
        resolve({
          base64: rawDataUrl,
          contentType: file.type || "image/jpeg",
        });
      img.src = rawDataUrl;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function daysUntil(isoDate?: string | null): number | null {
  if (!isoDate) return null;
  return Math.ceil(
    (new Date(isoDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
}

function normalizeVisualMode(mode?: AIPhotoMode): AIPhotoMode {
  if (mode === "RAW_ART") return "RAW_ART";
  if (
    mode === "AI_FULL_CREATIVE" ||
    mode === "EDITORIAL_MOCKUP" ||
    mode === "ENHANCE"
  ) {
    return "AI_FULL_CREATIVE";
  }
  return "NONE";
}

function parseScheduleTimesList(
  scheduleTime?: string | null,
  scheduleTimes?: string[] | null
): string[] {
  const raw =
    Array.isArray(scheduleTimes) && scheduleTimes.length > 0
      ? scheduleTimes
      : String(scheduleTime || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
  const valid = Array.from(
    new Set(raw.filter((s) => /^\d{2}:\d{2}$/.test(s)))
  ).sort();
  return valid.length > 0 ? valid : ["10:00"];
}

function defaultPublishTargets(
  t?: Partial<Topic> | null,
  tiktokEnabled = false
): PublishTargets {
  if (t?.publish_targets) {
    const pt = t.publish_targets;
    const anySelected =
      pt.ig_feed ||
      pt.ig_stories ||
      pt.fb_feed ||
      pt.fb_stories ||
      pt.tiktok_feed;
    return {
      ig_feed: anySelected ? Boolean(pt.ig_feed) : true,
      ig_stories: Boolean(pt.ig_stories),
      fb_feed: Boolean(pt.fb_feed),
      fb_stories: Boolean(pt.fb_stories),
      tiktok_feed: Boolean(pt.tiktok_feed),
    };
  }
  const stories = Boolean(t?.publish_to_stories);
  const onlyVertical = t?.aspect_ratio === "9:16" && !stories;
  return {
    ig_feed: !onlyVertical,
    ig_stories: stories || onlyVertical,
    fb_feed: !onlyVertical,
    fb_stories: stories,
    tiktok_feed: Boolean(tiktokEnabled && (stories || onlyVertical)),
  };
}

function DownloadIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 20h14" />
    </svg>
  );
}

function buildDownloadBaseName(prefix: string, label?: string | null): string {
  const slug = String(label || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 44);
  return slug ? `${prefix}-${slug}` : prefix;
}

function extensionFromMimeOrUrl(mime?: string | null, url?: string): string {
  const m = (mime || "").toLowerCase();
  if (m.includes("png")) return ".png";
  if (m.includes("webp")) return ".webp";
  if (m.includes("jpeg") || m.includes("jpg")) return ".jpg";
  if (url) {
    const cleanUrl = url.split("?")[0].toLowerCase();
    if (cleanUrl.endsWith(".png")) return ".png";
    if (cleanUrl.endsWith(".webp")) return ".webp";
  }
  return ".jpg";
}

interface IntegTestDisplayItem {
  key: string;
  label: string;
  status: "ok" | "error" | "unconfigured";
  detail: string;
}

const INTEG_TEST_ORDER: Array<{ key: string; label: string }> = [
  { key: "openai", label: "Conexão OpenAI" },
  { key: "claude", label: "Conexão Anthropic (Claude)" },
  { key: "gemini", label: "Conexão Google Gemini" },
  { key: "meta", label: "Conexão Meta (Instagram & Facebook)" },
  { key: "tiktok", label: "Conexão TikTok" },
  { key: "cloudflare_r2", label: "Conexão Cloudflare R2" },
];

function buildIntegTestRows(
  report: Record<string, unknown>
): IntegTestDisplayItem[] {
  const seen = new Set<string>();
  const orderedKeys = [
    ...INTEG_TEST_ORDER.map((item) => item.key),
    ...Object.keys(report).filter(
      (k) => !INTEG_TEST_ORDER.some((item) => item.key === k)
    ),
  ];

  const rows: IntegTestDisplayItem[] = [];
  for (const key of orderedKeys) {
    if (seen.has(key) || !(key in report)) continue;
    seen.add(key);

    const raw = report[key];
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;

    const preset = INTEG_TEST_ORDER.find((item) => item.key === key);
    const label = preset ? preset.label : `Conexão ${key}`;

    const status: "ok" | "error" | "unconfigured" =
      entry.valid === true
        ? "ok"
        : entry.configured === false
        ? "unconfigured"
        : "error";

    let detail = "";
    if (key === "meta" && status === "ok") {
      const accountName =
        typeof entry.name === "string" && entry.name.trim()
          ? `Conta: ${entry.name.trim()}`
          : "Conexão ativa.";
      const expiryInfo =
        typeof entry.days_remaining === "number"
          ? `Expira em ${entry.days_remaining} dia(s)`
          : "Token sem expiração";
      detail = `${accountName} • ${expiryInfo}`;
    } else {
      const rawText =
        (typeof entry.message === "string" && entry.message.trim()) ||
        (typeof entry.warning === "string" && entry.warning.trim()) ||
        (typeof entry.error === "string" && entry.error.trim()) ||
        "";

      if (
        /The access token is invalid or not found in the request\./i.test(
          rawText
        )
      ) {
        detail =
          "Token do TikTok inválido ou expirado. Reconecte sua conta do TikTok.";
      } else if (rawText) {
        detail = rawText;
      } else if (key === "cloudflare_r2" && status === "ok") {
        detail =
          typeof entry.bucket === "string" && entry.bucket
            ? `Bucket "${entry.bucket}" conectado.`
            : "Armazenamento conectado.";
      } else if (status === "ok") {
        detail = "Conexão ativa.";
      } else if (status === "unconfigured") {
        detail = "Não configurada.";
      } else {
        detail = "Falha ao conectar.";
      }
    }

    rows.push({ key, label, status, detail });
  }

  return rows;
}

function formatImageModelTag(raw: string): string {
  const trimmed = raw.trim();
  if (/^gemini-/i.test(trimmed)) return `GEMINI (${trimmed})`;
  if (/^OpenAI\s+/i.test(trimmed)) {
    return `OPENAI (${trimmed.replace(/^OpenAI\s+/i, "").trim()})`;
  }
  return trimmed;
}

function resolveStudioImageProvider(preview: StudioPreviewState): string {
  if (preview.imageProviderUsed?.trim()) {
    return formatImageModelTag(preview.imageProviderUsed);
  }
  if (preview.post?.image_provider_used?.trim()) {
    return formatImageModelTag(preview.post.image_provider_used);
  }
  const fromLogs = Array.from(
    new Set(
      (preview.logs || [])
        .map((l) => l.match(/Criativo 100% IA \(([^)]+)\) concluído:/i)?.[1])
        .filter((v): v is string => Boolean(v))
        .map(formatImageModelTag)
    )
  );
  if (fromLogs.length > 0) return fromLogs.join(", ");
  return "—";
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

async function downloadSingleImage(url: string, baseName: string): Promise<void> {
  if (!url || typeof document === "undefined") return;

  if (url.startsWith("data:")) {
    const mimeMatch = url.match(/^data:([^;]+);/);
    const ext = extensionFromMimeOrUrl(mimeMatch?.[1], url);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${baseName}${ext}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    return;
  }

  try {
    const proxyUrl = `/api/media/proxy?url=${encodeURIComponent(
      url
    )}&download=1&filename=${encodeURIComponent(baseName)}`;
    const res = await fetch(proxyUrl);
    if (res.ok) {
      const disposition = res.headers.get("content-disposition") || "";
      const match = disposition.match(/filename="([^"]+)"/i);
      const filename =
        match?.[1] ||
        `${baseName}${extensionFromMimeOrUrl(
          res.headers.get("content-type"),
          url
        )}`;
      const blob = await res.blob();
      triggerBlobDownload(blob, filename);
      return;
    }
  } catch {
    // Fallback para fetch direto abaixo
  }

  try {
    const directRes = await fetch(url);
    if (directRes.ok) {
      const blob = await directRes.blob();
      const ext = extensionFromMimeOrUrl(
        blob.type || directRes.headers.get("content-type"),
        url
      );
      triggerBlobDownload(blob, `${baseName}${ext}`);
      return;
    }
  } catch {
    // Fallback final abre em nova aba
  }

  window.open(url, "_blank", "noopener,noreferrer");
}

async function downloadImageList(urls: string[], baseName: string): Promise<void> {
  const validUrls = urls.filter((u) => Boolean(u?.trim()));
  if (validUrls.length === 0) return;

  if (validUrls.length === 1) {
    await downloadSingleImage(validUrls[0], baseName);
    return;
  }

  for (let i = 0; i < validUrls.length; i++) {
    await downloadSingleImage(validUrls[i], `${baseName}-slide-${i + 1}`);
    if (i < validUrls.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

function mergePromptWithLegacyBenefits(
  prompt: string,
  benefits?: string[] | null
): string {
  const base = (prompt || "").trim();
  const normalizedBase = base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const missing = (benefits || [])
    .map((b) => b.trim())
    .filter((b) => {
      if (!b) return false;
      const normB = b
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      return !normalizedBase.includes(normB);
    });
  if (missing.length === 0) return base;
  const bullets = missing.map((b) => `- ${b}`).join("\n");
  return base
    ? `${base}\n\nPrincipais diferenciais:\n${bullets}`
    : `Principais diferenciais:\n${bullets}`;
}

const GUIDED_PROMPT_TEMPLATE = `Título no topo da arte (opcional — apague esta linha no Piloto Automático para a IA variar): "[Frase curta de até 7 palavras]"

1. O QUE VOCÊ VENDE E PARA QUEM
- Produto/Serviço: [Ex: Criação de sites / Clínica odontológica / Consultoria]
- Público-alvo: [Quem compra de você]
- Objetivo do post: [Ex: gerar mensagens no WhatsApp / agendar avaliação / vender oferta]

2. DOR, BENEFÍCIO E DIFERENCIAIS
- Dor que resolve: [Principal problema do cliente]
- Resultado principal: [Grande benefício que ele ganha]
- Principais diferenciais (3 a 5 tópicos curtos):
  - [Diferencial 1]
  - [Diferencial 2]
  - [Diferencial 3]

3. ESTILO VISUAL DESEJADO (OPCIONAL)
- Cena/Elemento principal: [Ex: pessoa feliz usando o produto / ambiente real bem iluminado]
- Clima e estilo: [Ex: foto realista luminosa / visual moderno escuro e sofisticado]
- Tom da legenda: [Ex: direto e persuasivo / acolhedor e consultivo]

4. REGRAS E O QUE EVITAR
- [Ex: nunca citar preços errados, nunca falar em mensalidade, não usar termos como X]`;

const EXTERNAL_AI_META_PROMPT = `Você vai criar um BRIEFING DINÂMICO DE CAMPANHA para eu colar no meu sistema de automação de posts (PilotFlow), que vai gerar vários criativos e legendas DIFERENTES ao longo da semana com base nesse mesmo texto.

Analise a foto que enviei (se houver) e a descrição simples do meu negócio abaixo, e transforme isso em um briefing limpo, enxuto e em português perfeito.

REGRAS OBRIGATÓRIAS:
1. NÃO crie um roteiro estático de uma única imagem nem trave um título fixo entre aspas — o sistema precisa variar títulos, layouts e ângulos em cada post.
2. NÃO inclua proporção/formato (1:1, 4:5, 9:16), não escreva legenda pronta e não inclua saudações ("Claro, aqui está..."). Entregue APENAS o texto final pronto para copiar e colar.
3. Deixe 100% claro logo nas 2 primeiras linhas O QUE é vendido e PARA QUEM (público-alvo), evitando qualquer ambiguidade.
4. Liste de 4 a 6 diferenciais/ângulos distintos em tópicos curtos para a IA alternar o foco a cada publicação.
5. Descreva o estilo visual geral inspirado na foto (ex.: atmosfera, tipo de cena/produto, iluminação), sem travar posições rígidas de texto nem códigos de cor.
6. Inclua um bloco curto de "Regras e o que evitar" com base no que eu informar.

EXEMPLO DO FORMATO IDEAL DE SAÍDA (substitua 100% pelo meu negócio):
---
OBJETIVO: Venda de [produto/serviço] para [público-alvo específico], com foco em [objetivo: gerar mensagens no WhatsApp / agendamentos / vendas]. Fale sempre direto com [quem decide a compra].

DORES E ÂNGULOS PARA VARIAR A CADA POST:
- [Ângulo/Diferencial 1 curto e claro]
- [Ângulo/Diferencial 2 curto e claro]
- [Ângulo/Diferencial 3 curto e claro]
- [Ângulo/Diferencial 4 curto e claro]

UNIVERSO VISUAL E TOM:
- Mostrar [elementos reais do produto/ambiente observados na foto], em composições variadas, luminosas e limpas (sempre full-bleed e sem poluição visual).
- Tom de voz: [ex.: direto, confiável e persuasivo].

REGRAS E O QUE EVITAR:
- [Restrições importantes do negócio, termos proibidos e cuidados].
---

AGORA, AQUI ESTÃO AS INFORMAÇÕES DO MEU NEGÓCIO (e a foto em anexo):
- O que eu vendo: [escreva aqui em 1 ou 2 frases simples]
- Quem é meu cliente: [escreva aqui]
- Diferenciais / preço / detalhes importantes: [escreva aqui]
- O que NÃO quero que a IA fale: [opcional]`;

function PromptGuidePanel({
  hasExistingText,
  onReplace,
  onAppend,
  onClose,
}: {
  hasExistingText: boolean;
  onReplace: (template: string) => void;
  onAppend: (template: string) => void;
  onClose: () => void;
}) {
  const [guideTab, setGuideTab] = useState<"template" | "external_ai">(
    "template"
  );
  const [copied, setCopied] = useState(false);
  const [copiedMeta, setCopiedMeta] = useState(false);

  async function handleCopy(text: string, isMeta: boolean) {
    try {
      await navigator.clipboard?.writeText(text);
      if (isMeta) {
        setCopiedMeta(true);
        setTimeout(() => setCopiedMeta(false), 1800);
      } else {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    } catch {
      setCopied(false);
      setCopiedMeta(false);
    }
  }

  return (
    <div className="mb-2 mt-2 space-y-2.5 rounded-xl border border-indigo-200 bg-indigo-50/70 p-3.5 text-xs text-slate-700">
      <div className="flex items-center justify-between gap-2">
        <p className="font-extrabold text-indigo-950">
          Como montar um bom prompt no PilotFlow
        </p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-2 py-0.5 text-[11px] font-bold text-slate-500 transition hover:bg-white hover:text-slate-800"
        >
          Fechar
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setGuideTab("template")}
          className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${guideTab === "template"
              ? "bg-indigo-600 text-white shadow-2xs"
              : "border border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-100/60"
            }`}
        >
          1. Preencher aqui
        </button>
        <button
          type="button"
          onClick={() => setGuideTab("external_ai")}
          className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${guideTab === "external_ai"
              ? "bg-indigo-600 text-white shadow-2xs"
              : "border border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-100/60"
            }`}
        >
          2. Criar no ChatGPT / Gemini (com foto)
        </button>
      </div>

      {guideTab === "template" ? (
        <>
          <ul className="list-disc space-y-1 pl-4 text-[11px] leading-relaxed text-slate-600">
            <li>
              <strong>Formato, preço, logo e CTA:</strong> o sistema já aplica
              pelos campos da tela — não precisa repetir no texto.
            </li>
            <li>
              <strong>Título fixo (opcional):</strong> a linha{" "}
              <code className="rounded bg-white px-1 py-0.5 text-[10px]">
                Título no topo da arte: &quot;...&quot;
              </code>{" "}
              trava exatamente essa frase (ótima no Estúdio Manual; no Piloto
              Automático, apague a linha para a IA variar).
            </li>
            <li>
              <strong>Substitua os colchetes</strong>{" "}
              <code className="rounded bg-white px-1 py-0.5 text-[10px]">
                [...]
              </code>{" "}
              pelos seus dados reais e apague o que não for usar — prompts
              enxutos geram imagens mais nítidas e sem erros de escrita.
            </li>
          </ul>

          <pre className="max-h-52 overflow-y-auto whitespace-pre-wrap rounded-lg border border-indigo-100 bg-white p-2.5 font-sans text-[11px] leading-relaxed text-slate-700">
            {GUIDED_PROMPT_TEMPLATE}
          </pre>

          <div className="flex flex-wrap items-center gap-2">
            {!hasExistingText ? (
              <button
                type="button"
                onClick={() => onReplace(GUIDED_PROMPT_TEMPLATE)}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-bold text-white shadow-2xs transition hover:bg-indigo-700"
              >
                Usar este modelo no Prompt
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onReplace(GUIDED_PROMPT_TEMPLATE)}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-bold text-white shadow-2xs transition hover:bg-indigo-700"
                >
                  Substituir Prompt atual
                </button>
                <button
                  type="button"
                  onClick={() => onAppend(GUIDED_PROMPT_TEMPLATE)}
                  className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-[11px] font-bold text-indigo-700 transition hover:bg-indigo-100/60"
                >
                  Adicionar ao final
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => void handleCopy(GUIDED_PROMPT_TEMPLATE, false)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 transition hover:bg-slate-100"
            >
              {copied ? "Copiado!" : "Copiar modelo"}
            </button>
          </div>
        </>
      ) : (
        <>
          <ol className="list-decimal space-y-1 pl-4 text-[11px] leading-relaxed text-slate-600">
            <li>
              Clique em <strong>Copiar comando para ChatGPT / Gemini</strong>{" "}
              abaixo.
            </li>
            <li>
              Abra seu ChatGPT ou Gemini, <strong>anexe uma foto</strong> do seu
              produto/espaço (opcional), cole o comando e preencha só as 4
              linhas simples no final.
            </li>
            <li>
              Copie a resposta gerada (briefing dinâmico que permite à IA variar
              criativos e legendas a cada post) e cole aqui no campo Prompt.
            </li>
          </ol>

          <pre className="max-h-52 overflow-y-auto whitespace-pre-wrap rounded-lg border border-indigo-100 bg-white p-2.5 font-sans text-[11px] leading-relaxed text-slate-700">
            {EXTERNAL_AI_META_PROMPT}
          </pre>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleCopy(EXTERNAL_AI_META_PROMPT, true)}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-bold text-white shadow-2xs transition hover:bg-indigo-700"
            >
              {copiedMeta
                ? "Comando copiado!"
                : "Copiar comando para ChatGPT / Gemini"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function deriveRatioFromTargets(targets: PublishTargets): AspectRatio {
  const hasFeed = targets.ig_feed || targets.fb_feed;
  const hasVertical =
    targets.ig_stories || targets.fb_stories || targets.tiktok_feed;
  return !hasFeed && hasVertical ? "9:16" : "1:1";
}

function formatTargetsSummary(targets?: PublishTargets): string {
  if (!targets) return "IG Feed • FB Feed";
  const items: string[] = [];
  if (targets.ig_feed) items.push("IG Feed");
  if (targets.ig_stories) items.push("IG Story");
  if (targets.fb_feed) items.push("FB Feed");
  if (targets.fb_stories) items.push("FB Story");
  if (targets.tiktok_feed) items.push("TikTok");
  return items.length > 0 ? items.join(" • ") : "IG Feed";
}

function PublishTargetsSelector({
  value,
  onChange,
  availableNetworks,
  onOpenIntegrations,
  label = "Redes Sociais & Locais de Publicação (Dimensões Automáticas)",
}: {
  value: PublishTargets;
  onChange: (next: PublishTargets) => void;
  availableNetworks: {
    instagram: boolean;
    facebook: boolean;
    tiktok: boolean;
  };
  onOpenIntegrations?: () => void;
  label?: string;
}) {
  const sanitizeForAvailable = (candidate: PublishTargets): PublishTargets => ({
    ig_feed: availableNetworks.instagram ? Boolean(candidate.ig_feed) : false,
    ig_stories: availableNetworks.instagram
      ? Boolean(candidate.ig_stories)
      : false,
    fb_feed: availableNetworks.facebook ? Boolean(candidate.fb_feed) : false,
    fb_stories: availableNetworks.facebook
      ? Boolean(candidate.fb_stories)
      : false,
    tiktok_feed: availableNetworks.tiktok
      ? Boolean(candidate.tiktok_feed)
      : false,
  });

  const togglePlacement = (key: keyof PublishTargets) => {
    onChange(sanitizeForAvailable({ ...value, [key]: !value[key] }));
  };

  const igActive =
    availableNetworks.instagram && (value.ig_feed || value.ig_stories);
  const fbActive =
    availableNetworks.facebook && (value.fb_feed || value.fb_stories);
  const ttActive = availableNetworks.tiktok && value.tiktok_feed;

  const hasFeed =
    (availableNetworks.instagram && value.ig_feed) ||
    (availableNetworks.facebook && value.fb_feed);
  const hasVertical =
    (availableNetworks.instagram && value.ig_stories) ||
    (availableNetworks.facebook && value.fb_stories) ||
    (availableNetworks.tiktok && value.tiktok_feed);

  const visibleCount =
    (availableNetworks.instagram ? 1 : 0) +
    (availableNetworks.facebook ? 1 : 0) +
    (availableNetworks.tiktok ? 1 : 0);

  return (
    <div className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/40 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-extrabold uppercase tracking-wider text-indigo-950">
          {label}
        </span>
        {visibleCount > 0 && (
          <span className="rounded-full bg-white px-2.5 py-0.5 text-[10px] font-extrabold text-indigo-700 ring-1 ring-indigo-200">
            {hasFeed && hasVertical
              ? "1080×1080 (Feed) + 1080×1920 (Stories/TikTok)"
              : hasVertical
                ? "1080×1920 (9:16 Vertical Nativo)"
                : "1080×1080 (1:1 Feed Padrão)"}
          </span>
        )}
      </div>

      {visibleCount === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-900">
          <p className="font-bold">
            Nenhuma rede social com token ativo encontrada em Integrações.
          </p>
          <p className="mt-0.5 text-[11px] text-amber-800">
            Assim que você conectar o token do Instagram, Facebook ou TikTok na
            aba Integrações, a rede aparecerá automaticamente aqui para você
            ativar ou desativar por post.
          </p>
          {onOpenIntegrations && (
            <button
              type="button"
              onClick={onOpenIntegrations}
              className="mt-2 rounded-lg bg-amber-700 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-amber-800"
            >
              Ir para Integrações →
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5">
          {/* INSTAGRAM (só exibe se tiver token Meta + IG_USER_ID) */}
          {availableNetworks.instagram && (
            <div
              className={`overflow-hidden rounded-xl border p-3 transition ${igActive
                  ? "border-indigo-300 bg-white shadow-xs"
                  : "border-slate-200 bg-white/70 opacity-80"
                }`}
            >
              <label className="flex cursor-pointer items-center justify-between gap-2 border-b border-slate-100 pb-2">
                <span className="flex items-center gap-2 text-xs font-extrabold text-slate-900">
                  <input
                    type="checkbox"
                    checked={igActive}
                    onChange={() => {
                      if (igActive) {
                        onChange(
                          sanitizeForAvailable({
                            ...value,
                            ig_feed: false,
                            ig_stories: false,
                          })
                        );
                      } else {
                        onChange(
                          sanitizeForAvailable({
                            ...value,
                            ig_feed: true,
                          })
                        );
                      }
                    }}
                    className="h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600"
                  />
                  Instagram
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${igActive
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-slate-200 text-slate-600"
                    }`}
                >
                  {igActive ? "Ativado" : "Desativado"}
                </span>
              </label>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <label
                  className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${value.ig_feed
                      ? "border-indigo-200 bg-indigo-50/70 text-indigo-950"
                      : "border-slate-200 bg-slate-50/60 text-slate-600"
                    }`}
                >
                  <input
                    type="checkbox"
                    checked={value.ig_feed}
                    onChange={() => togglePlacement("ig_feed")}
                    className="h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-indigo-600"
                  />
                  <span>Post / Feed</span>
                  <span className="font-mono text-[10px] font-bold text-slate-500">
                    (1080×1080)
                  </span>
                </label>

                <label
                  className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${value.ig_stories
                      ? "border-indigo-200 bg-indigo-50/70 text-indigo-950"
                      : "border-slate-200 bg-slate-50/60 text-slate-600"
                    }`}
                >
                  <input
                    type="checkbox"
                    checked={value.ig_stories}
                    onChange={() => togglePlacement("ig_stories")}
                    className="h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-indigo-600"
                  />
                  <span>Story</span>
                  <span className="font-mono text-[10px] font-bold text-indigo-600">
                    (1080×1920)
                  </span>
                </label>

                <div
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-slate-50/50 px-2.5 py-1.5 text-xs text-slate-400"
                  title="Reels exige arquivo de vídeo MP4; disponível em breve"
                >
                  <input
                    type="checkbox"
                    disabled
                    checked={false}
                    className="h-3.5 w-3.5 shrink-0 rounded border-slate-200"
                  />
                  <span>Reel (Vídeo)</span>
                  <span className="rounded bg-slate-200/70 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">
                    Em breve
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* FACEBOOK (só exibe se tiver token Meta + FB_PAGE_ID) */}
          {availableNetworks.facebook && (
            <div
              className={`overflow-hidden rounded-xl border p-3 transition ${fbActive
                  ? "border-indigo-300 bg-white shadow-xs"
                  : "border-slate-200 bg-white/70 opacity-80"
                }`}
            >
              <label className="flex cursor-pointer items-center justify-between gap-2 border-b border-slate-100 pb-2">
                <span className="flex items-center gap-2 text-xs font-extrabold text-slate-900">
                  <input
                    type="checkbox"
                    checked={fbActive}
                    onChange={() => {
                      if (fbActive) {
                        onChange(
                          sanitizeForAvailable({
                            ...value,
                            fb_feed: false,
                            fb_stories: false,
                          })
                        );
                      } else {
                        onChange(
                          sanitizeForAvailable({
                            ...value,
                            fb_feed: true,
                          })
                        );
                      }
                    }}
                    className="h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600"
                  />
                  Facebook
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${fbActive
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-slate-200 text-slate-600"
                    }`}
                >
                  {fbActive ? "Ativado" : "Desativado"}
                </span>
              </label>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <label
                  className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${value.fb_feed
                      ? "border-indigo-200 bg-indigo-50/70 text-indigo-950"
                      : "border-slate-200 bg-slate-50/60 text-slate-600"
                    }`}
                >
                  <input
                    type="checkbox"
                    checked={value.fb_feed}
                    onChange={() => togglePlacement("fb_feed")}
                    className="h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-indigo-600"
                  />
                  <span>Post / Feed</span>
                  <span className="font-mono text-[10px] font-bold text-slate-500">
                    (1080×1080)
                  </span>
                </label>

                <label
                  className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${value.fb_stories
                      ? "border-indigo-200 bg-indigo-50/70 text-indigo-950"
                      : "border-slate-200 bg-slate-50/60 text-slate-600"
                    }`}
                >
                  <input
                    type="checkbox"
                    checked={value.fb_stories}
                    onChange={() => togglePlacement("fb_stories")}
                    className="h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-indigo-600"
                  />
                  <span>Story</span>
                  <span className="font-mono text-[10px] font-bold text-indigo-600">
                    (1080×1920)
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* TIKTOK (só exibe se tiver token TikTok ativo em Integrações) */}
          {availableNetworks.tiktok && (
            <div
              className={`overflow-hidden rounded-xl border p-3 transition ${ttActive
                  ? "border-indigo-300 bg-white shadow-xs"
                  : "border-slate-200 bg-white/70 opacity-80"
                }`}
            >
              <label className="flex cursor-pointer items-center justify-between gap-2 border-b border-slate-100 pb-2">
                <span className="flex items-center gap-2 text-xs font-extrabold text-slate-900">
                  <input
                    type="checkbox"
                    checked={ttActive}
                    onChange={() => togglePlacement("tiktok_feed")}
                    className="h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600"
                  />
                  TikTok
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${ttActive
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-slate-200 text-slate-600"
                    }`}
                >
                  {ttActive ? "Ativado" : "Desativado"}
                </span>
              </label>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <label
                  className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${value.tiktok_feed
                      ? "border-indigo-200 bg-indigo-50/70 text-indigo-950"
                      : "border-slate-200 bg-slate-50/60 text-slate-600"
                    }`}
                >
                  <input
                    type="checkbox"
                    checked={value.tiktok_feed}
                    onChange={() => togglePlacement("tiktok_feed")}
                    className="h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-indigo-600"
                  />
                  <span>Post / Photo Mode</span>
                  <span className="font-mono text-[10px] font-bold text-indigo-600">
                    (1080×1920)
                  </span>
                </label>
                <span className="text-[10px] text-slate-500">
                  Imagem única ou carrossel vertical (9:16).
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {visibleCount > 0 && (
        <p className="text-[11px] leading-relaxed text-indigo-950/80">
          {hasFeed && hasVertical ? (
            <>
              <strong>1 único post, 2 dimensões exatas sem custo extra:</strong>{" "}
              a IA gera a arte base em <strong>1080×1080 (1:1)</strong> para o
              Feed e monta automaticamente a versão{" "}
              <strong>1080×1920 (9:16)</strong> para Stories/TikTok estendendo a
              cor real do fundo da própria arte (sem faixas desfocadas e sem
              cortar textos).
            </>
          ) : hasVertical ? (
            <>
              <strong>Modo Vertical Nativo:</strong> como apenas Stories/TikTok
              estão ativados, a arte será gerada diretamente em{" "}
              <strong>1080×1920 (9:16)</strong> em tela cheia.
            </>
          ) : (
            <>
              <strong>Modo Feed Padrão:</strong> a arte será gerada em{" "}
              <strong>1080×1080 (1:1)</strong> para os Feeds ativados.
            </>
          )}
        </p>
      )}
    </div>
  );
}

function ImageModelGuide({
  value,
  onChange,
  allowDefault = true,
  label = "Modelo da IA de Imagem",
}: {
  value: ImageAIProvider | "";
  onChange: (val: ImageAIProvider | "") => void;
  allowDefault?: boolean;
  label?: string;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
      <div>
        <label className="block text-[11px] font-bold text-slate-700">
          {label}
        </label>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as ImageAIProvider | "")}
          className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-bold text-slate-800"
        >
          {allowDefault && (
            <option value="">Usar padrão das Integrações (padrão)</option>
          )}
          <option value="OPENAI">
            OpenAI — Máxima Qualidade (chatgpt-image-latest / gpt-image-1.5)
          </option>
          <option value="OPENAI_MINI">
            OpenAI — Econômica (gpt-image-1-mini • ~4x mais barata)
          </option>
          <option value="GEMINI">
            Google Gemini Image (gemini-3-pro-image / gemini-3.1-flash-image)
          </option>
        </select>
      </div>
      <div className="space-y-1 rounded-md bg-slate-50 p-2.5 text-[11px] leading-relaxed text-slate-600">
        {allowDefault && (
          <p>
            <strong>• Usar padrão das Integrações:</strong> segue o modelo
            global configurado na aba <em>Integrações</em>.
          </p>
        )}
        <p>
          <strong>• OpenAI Máxima Qualidade (~US$ 0,034–0,04/img • ~R$ 0,20–0,25):</strong>{" "}
          melhor nitidez para artes com muito texto em português, mockups de
          sistema/celular e carrosséis elaborados.
        </p>
        <p>
          <strong>• OpenAI Econômica gpt-image-1-mini (~US$ 0,008/img • ~R$ 0,05):</strong>{" "}
          cerca de 4x mais barata; ótima para fotos de ambientes, paisagens ou
          artes simples com pouco texto.
        </p>
        <p>
          <strong>• Google Gemini Image (~US$ 0,067–0,134/img • ~R$ 0,40–0,80):</strong>{" "}
          fotos ultrarrealistas e artes em português (Flash ~R$ 0,40 em
          carrosséis; Pro ~R$ 0,80 em imagem única); exige faturamento ativo no
          Google AI Studio (não gera imagem no plano gratuito).
        </p>
      </div>
    </div>
  );
}

export default function SaasAppPage() {
  const [bootLoading, setBootLoading] = useState(true);
  const [databaseMode, setDatabaseMode] = useState<"supabase" | "memory">(
    "memory"
  );
  const [user, setUser] = useState<SessionUser | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [adminSnapshot, setAdminSnapshot] = useState<AdminSnapshot | null>(
    null
  );

  // Auth screen states (Entrar / Criar Conta / Recuperar Senha)
  const [authScreen, setAuthScreen] = useState<"login" | "register" | "recovery">(
    "login"
  );
  const [loginMode, setLoginMode] = useState<"credentials" | "cron">(
    "credentials"
  );
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [authFeedback, setAuthFeedback] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [pendingConfirmEmail, setPendingConfirmEmail] = useState<string | null>(
    null
  );
  const [resendingConfirm, setResendingConfirm] = useState(false);

  // Register states
  const [regCompanyName, setRegCompanyName] = useState("");
  const [regName, setRegName] = useState("");
  const [regWhatsapp, setRegWhatsapp] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regAdminSecret, setRegAdminSecret] = useState("");

  // Recovery states
  const [recoveryMethod, setRecoveryMethod] = useState<"email" | "reset">(
    "email"
  );
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryAccessToken, setRecoveryAccessToken] = useState("");
  const [recoveryCronSecret, setRecoveryCronSecret] = useState("");
  const [recoveryNewPassword, setRecoveryNewPassword] = useState("");

  // Navigation
  const [viewScope, setViewScope] = useState<"client" | "admin">("client");
  const [clientTab, setClientTab] = useState<ClientTab>("dashboard");
  const [adminTab, setAdminTab] = useState<AdminTab>("overview");
  const [globalNotice, setGlobalNotice] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Brand form
  const [brandForm, setBrandForm] = useState<BrandSettings | null>(null);
  const [savingBrand, setSavingBrand] = useState(false);
  const [uploadingBrandLogo, setUploadingBrandLogo] = useState<
    "light" | "dark" | null
  >(null);

  // Integrations form
  const [integTextAi, setIntegTextAi] = useState<AIProvider>("GEMINI");
  const [integImageAi, setIntegImageAi] = useState<ImageAIProvider>("GEMINI");
  const [integAllowImageFallback, setIntegAllowImageFallback] = useState(false);
  const [integGeminiKey, setIntegGeminiKey] = useState("");
  const [integOpenAiKey, setIntegOpenAiKey] = useState("");
  const [integAnthropicKey, setIntegAnthropicKey] = useState("");
  const [integMetaToken, setIntegMetaToken] = useState("");
  const [integIgUserId, setIntegIgUserId] = useState("");
  const [integFbPageId, setIntegFbPageId] = useState("");
  const [integR2AccountId, setIntegR2AccountId] = useState("");
  const [integR2Bucket, setIntegR2Bucket] = useState("");
  const [integR2PublicUrl, setIntegR2PublicUrl] = useState("");
  const [integR2AccessKey, setIntegR2AccessKey] = useState("");
  const [integR2SecretKey, setIntegR2SecretKey] = useState("");
  const [integTiktokEnabled, setIntegTiktokEnabled] = useState(false);
  const [integTiktokOpenId, setIntegTiktokOpenId] = useState("");
  const [integTiktokToken, setIntegTiktokToken] = useState("");
  const [savingInteg, setSavingInteg] = useState(false);
  const [testingInteg, setTestingInteg] = useState(false);
  const [integTestReport, setIntegTestReport] = useState<Record<
    string,
    unknown
  > | null>(null);

  // Topic Editor
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [topicTitle, setTopicTitle] = useState("");
  const [topicTemplateId, setTopicTemplateId] = useState("custom");
  const [topicPrompt, setTopicPrompt] = useState("");
  const [showTopicPromptGuide, setShowTopicPromptGuide] = useState(false);
  const [topicPrice, setTopicPrice] = useState("");
  const [topicFormat, setTopicFormat] = useState<PostFormat>("SINGLE");
  const [topicSlides, setTopicSlides] = useState(3);
  const [topicRatio, setTopicRatio] = useState<AspectRatio>("1:1");
  const [topicApproval, setTopicApproval] = useState<ApprovalMode>("AUTO");
  const [topicPhotoMode, setTopicPhotoMode] = useState<AIPhotoMode>("NONE");
  const [topicPhotoPrompt, setTopicPhotoPrompt] = useState("");
  const [topicImageAi, setTopicImageAi] = useState<ImageAIProvider | "">("");
  const [topicDays, setTopicDays] = useState<number[]>([1, 3, 5]);
  const [topicTimes, setTopicTimes] = useState<string[]>(["10:00"]);
  const [topicPublishToStories, setTopicPublishToStories] = useState(false);
  const [topicPublishTargets, setTopicPublishTargets] =
    useState<PublishTargets>({
      ig_feed: true,
      ig_stories: false,
      fb_feed: true,
      fb_stories: false,
      tiktok_feed: false,
    });
  const [topicActive, setTopicActive] = useState(true);
  const [savingTopic, setSavingTopic] = useState(false);
  const [uploadingPhotoTopicId, setUploadingPhotoTopicId] = useState<
    string | null
  >(null);

  // Paid Campaigns (Meta Ads)
  const [boostModalPost, setBoostModalPost] = useState<PostHistoryItem | null>(
    null
  );
  const [companyAdAccounts, setCompanyAdAccounts] = useState<AdAccountConfig[]>(
    []
  );
  const [campaignsRefreshKey, setCampaignsRefreshKey] = useState(0);

  async function handleOpenBoostModal(post: PostHistoryItem) {
    setBoostModalPost(post);
    if (workspace && companyAdAccounts.length === 0) {
      try {
        const res = await fetch(
          `/api/ads?companyId=${encodeURIComponent(workspace.company.id)}`,
          { cache: "no-store" }
        );
        const data = await res.json();
        if (res.ok && Array.isArray(data.ad_accounts)) {
          setCompanyAdAccounts(data.ad_accounts as AdAccountConfig[]);
        }
      } catch {
        // segue abrindo o modal normalmente
      }
    }
  }

  // Studio Manual
  const studioInitializedCompanyRef = useRef<string | null>(null);
  const [studioTopicId, setStudioTopicId] = useState<string>("__free__");
  const [studioTitle, setStudioTitle] = useState("");
  const [studioPrompt, setStudioPrompt] = useState("");
  const [showStudioPromptGuide, setShowStudioPromptGuide] = useState(false);
  const [studioPrice, setStudioPrice] = useState("");
  const [studioFormat, setStudioFormat] = useState<PostFormat>("SINGLE");
  const [studioSlides, setStudioSlides] = useState(3);
  const [studioRatio, setStudioRatio] = useState<AspectRatio>("1:1");
  const [studioPhotoMode, setStudioPhotoMode] = useState<AIPhotoMode>("NONE");
  const [studioImageAi, setStudioImageAi] = useState<ImageAIProvider | "">("");
  const [studioPublishToStories, setStudioPublishToStories] = useState(false);
  const [studioPublishTargets, setStudioPublishTargets] =
    useState<PublishTargets>({
      ig_feed: true,
      ig_stories: false,
      fb_feed: true,
      fb_stories: false,
      tiktok_feed: false,
    });
  const [studioPhotoPrompt, setStudioPhotoPrompt] = useState("");
  const [studioPhotoBase64, setStudioPhotoBase64] = useState<string | null>(
    null
  );
  const [studioPhotoType, setStudioPhotoType] = useState<string>("image/jpeg");
  const [studioAction, setStudioAction] = useState<
    | "idle"
    | "generating_preview"
    | "updating_art"
    | "saving_draft"
    | "publishing"
  >("idle");
  const [studioPreview, setStudioPreview] =
    useState<StudioPreviewState | null>(null);
  const [studioReturnTab, setStudioReturnTab] = useState<ClientTab | null>(
    null
  );
  const [studioPublishLogs, setStudioPublishLogs] = useState<string[]>([]);
  const [studioCreditAlert, setStudioCreditAlert] = useState<{
    message: string;
    failedProvider: "GEMINI" | "OPENAI";
    alternativeProvider: "GEMINI" | "OPENAI" | null;
    retryOptions: {
      previewOnly: boolean;
      useEditedContent?: boolean;
      saveAsDraft?: boolean;
    };
  } | null>(null);
  const [approvingPostId, setApprovingPostId] = useState<string | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

  async function handleDownloadMedia(
    key: string,
    urls: string[],
    baseName: string
  ) {
    if (!urls.length || downloadingKey) return;
    setDownloadingKey(key);
    try {
      await downloadImageList(urls, baseName);
    } finally {
      setDownloadingKey(null);
    }
  }

  // Topics filter & pagination (10 em 10)
  const [topicsVisibleCount, setTopicsVisibleCount] = useState(10);
  const [topicsSearch, setTopicsSearch] = useState("");
  const [topicsStatusFilter, setTopicsStatusFilter] = useState<
    "ALL" | "ACTIVE" | "PAUSED"
  >("ACTIVE");
  const [topicsFormatFilter, setTopicsFormatFilter] = useState<
    "ALL" | "SINGLE" | "CAROUSEL"
  >("ALL");
  const [topicsDayFilter, setTopicsDayFilter] = useState<number[]>([]);

  // History filter & pagination (20 em 20)
  const [historyVisibleCount, setHistoryVisibleCount] = useState(20);
  const [historyDateFrom, setHistoryDateFrom] = useState("");
  const [historyDateTo, setHistoryDateTo] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [historyStatusFilter, setHistoryStatusFilter] = useState<
    "ALL" | "PUBLISHED" | "PENDING_APPROVAL" | "ERROR"
  >("ALL");

  // Admin: New / Edit Company
  const [admCompId, setAdmCompId] = useState<string | undefined>(undefined);
  const [admCompName, setAdmCompName] = useState("");
  const [admCompOwner, setAdmCompOwner] = useState("");
  const [admCompWhatsapp, setAdmCompWhatsapp] = useState("");
  const [admCompEmail, setAdmCompEmail] = useState("");
  const [admCompPassword, setAdmCompPassword] = useState("");
  const [admCompPlanId, setAdmCompPlanId] = useState("plan-pro");
  const [admCompStatus, setAdmCompStatus] = useState<CompanyStatus>("ACTIVE");
  const [admCompExpires, setAdmCompExpires] = useState(
    new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10)
  );
  const [savingAdminComp, setSavingAdminComp] = useState(false);

  // Support & Improvement Tips
  const [tipMessage, setTipMessage] = useState("");
  const [submittingTip, setSubmittingTip] = useState(false);
  const [copiedSupportEmail, setCopiedSupportEmail] = useState(false);
  const [adminTipFilter, setAdminTipFilter] = useState<
    "ALL" | "OPEN" | "COMPLETED"
  >("ALL");
  const [adminTipReplyDrafts, setAdminTipReplyDrafts] = useState<
    Record<string, string>
  >({});
  const [updatingTipId, setUpdatingTipId] = useState<string | null>(null);

  const syncWorkspaceForms = useCallback((ws: WorkspaceData | null) => {
    if (!ws) return;
    setBrandForm(ws.brand);
    setIntegTextAi(ws.integrations.preferred_text_ai);
    setIntegImageAi(ws.integrations.preferred_image_ai);
    setIntegAllowImageFallback(Boolean(ws.integrations.allow_image_ai_fallback));
    setIntegIgUserId(ws.integrations.ig_user_id || "");
    setIntegFbPageId(ws.integrations.fb_page_id || "");
    setIntegR2AccountId(ws.integrations.r2_account_id || "");
    setIntegR2Bucket(ws.integrations.r2_bucket_name || "");
    setIntegR2PublicUrl(ws.integrations.r2_public_url || "");
    setIntegR2AccessKey("");
    setIntegR2SecretKey("");
    setIntegTiktokEnabled(Boolean(ws.integrations.has_tiktok_token));
    setIntegTiktokOpenId(ws.integrations.tiktok_open_id || "");
    setIntegGeminiKey("");
    setIntegOpenAiKey("");
    setIntegAnthropicKey("");
    setIntegMetaToken("");
    setIntegTiktokToken("");

    if (studioInitializedCompanyRef.current !== ws.company.id) {
      studioInitializedCompanyRef.current = ws.company.id;
      const activeTopics = ws.topics.filter((t) => t.is_active);
      if (activeTopics.length > 0) {
        const first = activeTopics[0];
        const targets = defaultPublishTargets(
          first,
          Boolean(ws.integrations.has_tiktok_token)
        );
        setStudioTopicId("__free__");
        setStudioTitle("");
        setStudioPrompt("");
        setStudioPrice("");
        setStudioFormat(first.post_format);
        setStudioSlides(first.slides_count);
        setStudioPublishTargets(targets);
        setStudioRatio(deriveRatioFromTargets(targets));
        setStudioPhotoMode(normalizeVisualMode(first.ai_photo_mode));
        setStudioImageAi(first.preferred_image_ai || "");
        setStudioPublishToStories(
          Boolean(targets.ig_stories || targets.fb_stories)
        );
        setStudioPhotoPrompt("");
      } else {
        const targets: PublishTargets = {
          ig_feed: true,
          ig_stories: false,
          fb_feed: true,
          fb_stories: false,
          tiktok_feed: false,
        };
        setStudioTopicId("__free__");
        setStudioTitle("");
        setStudioPrompt("");
        setStudioPrice("");
        setStudioFormat("SINGLE");
        setStudioSlides(3);
        setStudioPublishTargets(targets);
        setStudioRatio("1:1");
        setStudioPhotoMode("NONE");
        setStudioImageAi("");
        setStudioPublishToStories(false);
        setStudioPhotoPrompt("");
      }
    }
  }, []);

  const loadState = useCallback(
    async (companyId?: string) => {
      try {
        const qs = companyId
          ? `?companyId=${encodeURIComponent(companyId)}`
          : "";
        const res = await fetch(`/api/saas/state${qs}`, { cache: "no-store" });
        const data = await res.json();
        setDatabaseMode(data.database_mode || "memory");
        if (data.authenticated) {
          setUser(data.user);
          setWorkspace(data.workspace);
          setAdminSnapshot(data.adminSnapshot || null);
          syncWorkspaceForms(data.workspace);
        } else {
          setUser(null);
          setWorkspace(null);
          setAdminSnapshot(null);
        }
      } catch {
        setGlobalNotice({
          type: "error",
          text: "Erro ao carregar dados do servidor.",
        });
      } finally {
        setBootLoading(false);
      }
    },
    [syncWorkspaceForms]
  );

  useEffect(() => {
    void loadState();
    if (typeof window !== "undefined") {
      const searchParams = new URLSearchParams(window.location.search);
      const tabParam = searchParams.get("tab");
      const tiktokStatus = searchParams.get("tiktok");
      const tiktokError = searchParams.get("tiktok_error");
      if (tabParam === "integrations") {
        setClientTab("integrations");
      }
      if (tiktokStatus === "connected") {
        setClientTab("integrations");
        setGlobalNotice({
          type: "success",
          text: "Conta TikTok conectada com sucesso! O token será renovado automaticamente.",
        });
        window.history.replaceState(null, "", window.location.pathname);
      } else if (tiktokError) {
        setClientTab("integrations");
        setGlobalNotice({
          type: "error",
          text: `TikTok: ${tiktokError}`,
        });
        window.history.replaceState(null, "", window.location.pathname);
      }
    }
    if (typeof window !== "undefined" && window.location.hash) {
      const hashParams = new URLSearchParams(
        window.location.hash.replace(/^#/, "")
      );
      const token = hashParams.get("access_token");
      const type = hashParams.get("type");
      const hashError = hashParams.get("error_description");
      if (hashError) {
        setLoginError(hashError);
        window.history.replaceState(null, "", window.location.pathname);
      } else if (token && type === "recovery") {
        setRecoveryAccessToken(token);
        setAuthScreen("recovery");
        setRecoveryMethod("reset");
        setAuthFeedback(
          "Link de recuperação validado! Digite abaixo a sua nova senha."
        );
        window.history.replaceState(null, "", window.location.pathname);
      } else if (type === "signup" || type === "email") {
        setAuthScreen("login");
        setLoginMode("credentials");
        setPendingConfirmEmail(null);
        setAuthFeedback(
          "E-mail confirmado com sucesso! Agora você já pode entrar com seu e-mail e senha."
        );
        window.history.replaceState(null, "", window.location.pathname);
      }
    }
  }, [loadState]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(null);
    setAuthFeedback(null);
    setAuthSubmitting(true);
    try {
      const payload =
        loginMode === "cron"
          ? { action: "login", cronSecret: loginPassword }
          : { action: "login", email: loginEmail, password: loginPassword };

      const res = await fetch("/api/saas/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "EMAIL_NOT_CONFIRMED") {
          setPendingConfirmEmail(data.email || loginEmail.trim());
        }
        setLoginError(data.error || "Falha ao autenticar.");
        return;
      }
      setPendingConfirmEmail(null);
      setDatabaseMode(data.database_mode || "memory");
      setUser(data.user);
      setWorkspace(data.workspace);
      setAdminSnapshot(data.adminSnapshot || null);
      syncWorkspaceForms(data.workspace);
      setLoginPassword("");
    } catch {
      setLoginError("Erro de conexão com o servidor.");
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(null);
    setAuthFeedback(null);
    setAuthSubmitting(true);
    try {
      const res = await fetch("/api/saas/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "register",
          companyName: regCompanyName,
          name: regName,
          whatsapp: regWhatsapp,
          email: regEmail,
          password: regPassword,
          adminSecret: regAdminSecret,
          redirectTo:
            typeof window !== "undefined" ? window.location.origin : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || "Não foi possível criar sua conta.");
        return;
      }
      if (data.requiresEmailConfirmation) {
        const targetEmail = data.email || regEmail.trim();
        setPendingConfirmEmail(targetEmail);
        setLoginEmail(targetEmail);
        setRegPassword("");
        setAuthScreen("login");
        setLoginMode("credentials");
        setAuthFeedback(
          data.message ||
            "Conta criada! Enviamos um link de confirmação para o seu e-mail."
        );
        return;
      }
      setPendingConfirmEmail(null);
      setDatabaseMode(data.database_mode || "memory");
      setUser(data.user);
      setWorkspace(data.workspace);
      setAdminSnapshot(data.adminSnapshot || null);
      syncWorkspaceForms(data.workspace);
    } catch {
      setLoginError("Erro de conexão ao cadastrar conta.");
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleResendConfirmation() {
    if (!pendingConfirmEmail || resendingConfirm) return;
    setResendingConfirm(true);
    setLoginError(null);
    try {
      const res = await fetch("/api/saas/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "resend_confirmation",
          email: pendingConfirmEmail,
          redirectTo:
            typeof window !== "undefined" ? window.location.origin : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || "Erro ao reenviar confirmação.");
        return;
      }
      setAuthFeedback(
        data.message ||
          "Reenviamos o link de confirmação para o seu e-mail."
      );
    } catch {
      setLoginError("Erro de conexão ao reenviar confirmação.");
    } finally {
      setResendingConfirm(false);
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(null);
    setAuthFeedback(null);
    setAuthSubmitting(true);
    try {
      const res = await fetch("/api/saas/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "forgot_password",
          email: recoveryEmail,
          redirectTo:
            typeof window !== "undefined" ? window.location.origin : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || "Erro ao enviar e-mail de recuperação.");
        return;
      }
      setAuthFeedback(
        data.message || "Link de recuperação enviado para seu e-mail."
      );
    } catch {
      setLoginError("Erro de conexão com o servidor.");
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(null);
    setAuthFeedback(null);
    setAuthSubmitting(true);
    try {
      const res = await fetch("/api/saas/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reset_password",
          email: recoveryEmail,
          recoveryAccessToken,
          cronSecret: recoveryCronSecret,
          newPassword: recoveryNewPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || "Erro ao redefinir senha.");
        return;
      }
      setAuthFeedback(
        data.message || "Senha redefinida com sucesso! Já pode entrar."
      );
      if (data.email) setLoginEmail(data.email);
      setRecoveryAccessToken("");
      setRecoveryCronSecret("");
      setRecoveryNewPassword("");
      setAuthScreen("login");
      setLoginMode("credentials");
    } catch {
      setLoginError("Erro de conexão ao redefinir senha.");
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/saas/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    setUser(null);
    setWorkspace(null);
    setAdminSnapshot(null);
    setStudioPreview(null);
  }

  async function handleSwitchCompany(companyId: string) {
    setGlobalNotice(null);
    const res = await fetch("/api/saas/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "switch_company", companyId }),
    });
    const data = await res.json();
    if (res.ok && data.workspace) {
      setWorkspace(data.workspace);
      syncWorkspaceForms(data.workspace);
      setViewScope("client");
      setClientTab("dashboard");
      setStudioPreview(null);
      setGlobalNotice({
        type: "success",
        text: `Visualizando painel da empresa "${data.workspace.company.name}".`,
      });
    }
  }

  async function handleSaveBrand(e: React.FormEvent) {
    e.preventDefault();
    if (!workspace || !brandForm) return;
    setSavingBrand(true);
    setGlobalNotice(null);
    try {
      const res = await fetch("/api/saas/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_brand",
          companyId: workspace.company.id,
          brand: brandForm,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setWorkspace({ ...workspace, brand: data.brand });
      setGlobalNotice({
        type: "success",
        text: "Identidade visual salva com sucesso!",
      });
    } catch (err) {
      setGlobalNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Erro ao salvar marca.",
      });
    } finally {
      setSavingBrand(false);
    }
  }

  async function handleUploadBrandLogo(
    file: File,
    variant: "light" | "dark" = "light"
  ) {
    if (!workspace || !brandForm) return;
    setUploadingBrandLogo(variant);
    setGlobalNotice(null);
    try {
      const { base64, contentType } = await fileToBase64(file);
      const res = await fetch("/api/saas/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upload_brand_logo",
          companyId: workspace.company.id,
          fileBase64: base64,
          contentType,
          variant,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBrandForm(data.brand);
      setWorkspace({ ...workspace, brand: data.brand });
      setGlobalNotice({
        type: "success",
        text:
          variant === "dark"
            ? "Logomarca para Fundo Escuro (PNG sem fundo) salva com sucesso!"
            : "Logomarca para Fundo Claro (PNG sem fundo) salva com sucesso!",
      });
    } catch (err) {
      setGlobalNotice({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : "Erro ao enviar logomarca da empresa.",
      });
    } finally {
      setUploadingBrandLogo(null);
    }
  }

  async function handleRemoveBrandLogo(variant: "light" | "dark") {
    if (!workspace || !brandForm) return;
    setSavingBrand(true);
    setGlobalNotice(null);
    try {
      const updatedBrand =
        variant === "dark"
          ? { ...brandForm, logo_dark_url: null }
          : { ...brandForm, logo_url: null };
      const res = await fetch("/api/saas/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_brand",
          companyId: workspace.company.id,
          brand: updatedBrand,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBrandForm(data.brand);
      setWorkspace({ ...workspace, brand: data.brand });
      setGlobalNotice({
        type: "success",
        text:
          variant === "dark"
            ? "Logomarca de fundo escuro removida."
            : "Logomarca de fundo claro removida.",
      });
    } catch (err) {
      setGlobalNotice({
        type: "error",
        text:
          err instanceof Error ? err.message : "Erro ao remover logomarca.",
      });
    } finally {
      setSavingBrand(false);
    }
  }

  async function handleSaveIntegrations(e: React.FormEvent) {
    e.preventDefault();
    if (!workspace) return;
    setSavingInteg(true);
    setGlobalNotice(null);
    try {
      const payload: Record<string, unknown> = {
        preferred_text_ai: integTextAi,
        preferred_image_ai: integImageAi,
        allow_image_ai_fallback: integAllowImageFallback,
        ig_user_id: integIgUserId,
        fb_page_id: integFbPageId,
        r2_account_id: integR2AccountId,
        r2_bucket_name: integR2Bucket,
        r2_public_url: integR2PublicUrl,
        tiktok_enabled: Boolean(
          integTiktokToken.trim() || workspace.integrations.has_tiktok_token
        ),
        tiktok_open_id: integTiktokOpenId,
      };
      if (integGeminiKey.trim()) payload.gemini_api_key = integGeminiKey.trim();
      if (integOpenAiKey.trim()) payload.openai_api_key = integOpenAiKey.trim();
      if (integAnthropicKey.trim())
        payload.anthropic_api_key = integAnthropicKey.trim();
      if (integMetaToken.trim())
        payload.meta_access_token = integMetaToken.trim();
      if (integR2AccessKey.trim())
        payload.r2_access_key_id = integR2AccessKey.trim();
      if (integR2SecretKey.trim())
        payload.r2_secret_access_key = integR2SecretKey.trim();
      if (integTiktokToken.trim())
        payload.tiktok_access_token = integTiktokToken.trim();

      const res = await fetch("/api/saas/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_integrations",
          companyId: workspace.company.id,
          integrations: payload,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setWorkspace({ ...workspace, integrations: data.integrations });
      setIntegGeminiKey("");
      setIntegOpenAiKey("");
      setIntegAnthropicKey("");
      setIntegMetaToken("");
      setIntegR2AccessKey("");
      setIntegR2SecretKey("");
      setIntegTiktokToken("");
      setGlobalNotice({
        type: "success",
        text: "Chaves criptografadas com AES-256 e salvas com sucesso!",
      });
    } catch (err) {
      setGlobalNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Erro ao salvar integrações.",
      });
    } finally {
      setSavingInteg(false);
    }
  }

  async function handleRemoveAiKey(provider: AIProvider) {
    if (!workspace || savingInteg) return;
    const label =
      provider === "GEMINI"
        ? "Gemini"
        : provider === "OPENAI"
        ? "OpenAI"
        : "Anthropic Claude";
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `Tem certeza que deseja remover a chave da ${label} desta empresa?`
      )
    ) {
      return;
    }
    setSavingInteg(true);
    setGlobalNotice(null);
    try {
      const nextPreferred: AIProvider =
        integTextAi === provider
          ? provider !== "OPENAI" && workspace.integrations.has_openai_key
            ? "OPENAI"
            : provider !== "GEMINI" && workspace.integrations.has_gemini_key
            ? "GEMINI"
            : provider === "GEMINI"
            ? "OPENAI"
            : "GEMINI"
          : integTextAi;

      const integrationsPayload: Record<string, unknown> = {
        preferred_text_ai: nextPreferred,
      };
      if (provider === "GEMINI") integrationsPayload.gemini_api_key = "";
      if (provider === "OPENAI") integrationsPayload.openai_api_key = "";
      if (provider === "CLAUDE") integrationsPayload.anthropic_api_key = "";

      const res = await fetch("/api/saas/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_integrations",
          companyId: workspace.company.id,
          integrations: integrationsPayload,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao remover chave.");

      setWorkspace({ ...workspace, integrations: data.integrations });
      setIntegTextAi(nextPreferred);
      if (provider === "GEMINI") setIntegGeminiKey("");
      if (provider === "OPENAI") setIntegOpenAiKey("");
      if (provider === "CLAUDE") setIntegAnthropicKey("");

      setGlobalNotice({
        type: "success",
        text: `Chave ${label} removida com sucesso!`,
      });
    } catch (err) {
      setGlobalNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Erro ao remover chave.",
      });
    } finally {
      setSavingInteg(false);
    }
  }

  async function handleTestIntegrations() {
    if (!workspace) return;
    setTestingInteg(true);
    setIntegTestReport(null);
    setGlobalNotice(null);
    try {
      const res = await fetch("/api/saas/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test_integrations",
          companyId: workspace.company.id,
        }),
      });
      const rawText = await res.text();
      let data: { report?: Record<string, unknown>; error?: string } = {};
      try {
        data = JSON.parse(rawText);
      } catch {
        data = {};
      }
      if (!res.ok) {
        throw new Error(
          data.error || `Erro ao testar conexões (HTTP ${res.status}).`
        );
      }
      setIntegTestReport(data.report || {});
    } catch (err) {
      setGlobalNotice({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : "Erro ao testar conexões das integrações.",
      });
    } finally {
      setTestingInteg(false);
    }
  }

  function startNewTopic() {
    const defaultTargets: PublishTargets = {
      ig_feed: true,
      ig_stories: false,
      fb_feed: true,
      fb_stories: false,
      tiktok_feed: false,
    };
    setEditingTopicId(null);
    setTopicTitle("");
    setTopicTemplateId("custom");
    setTopicPrompt("");
    setTopicPrice("");
    setTopicFormat("SINGLE");
    setTopicSlides(3);
    setTopicPublishTargets(defaultTargets);
    setTopicRatio("1:1");
    setTopicApproval("AUTO");
    setTopicPhotoMode("NONE");
    setTopicImageAi("");
    setTopicPhotoPrompt("");
    setTopicDays([1, 3, 5]);
    setTopicTimes(["10:00"]);
    setTopicPublishToStories(false);
    setTopicActive(true);
  }

  function loadTopicIntoEditor(t: Topic) {
    const targets = defaultPublishTargets(
      t,
      workspace?.integrations.tiktok_enabled
    );
    setEditingTopicId(t.id);
    setTopicTitle(t.title);
    setTopicTemplateId(t.niche_template || "custom");
    setTopicPrompt(
      mergePromptWithLegacyBenefits(t.prompt_instructions, t.benefits_json)
    );
    setTopicPrice(t.offer_price || "");
    setTopicFormat(t.post_format);
    setTopicSlides(t.slides_count || 3);
    setTopicPublishTargets(targets);
    setTopicRatio(deriveRatioFromTargets(targets));
    setTopicApproval(t.approval_mode || "AUTO");
    setTopicPhotoMode(normalizeVisualMode(t.ai_photo_mode));
    setTopicImageAi(t.preferred_image_ai || "");
    setTopicPhotoPrompt(t.ai_photo_prompt || "");
    setTopicDays(t.schedule_days || [1, 3, 5]);
    setTopicTimes(parseScheduleTimesList(t.schedule_time, t.schedule_times));
    setTopicPublishToStories(
      Boolean(targets.ig_stories || targets.fb_stories)
    );
    setTopicActive(t.is_active);
  }

  function applyNicheTemplate(templateId: string) {
    setTopicTemplateId(templateId);
    const found = NICHE_TOPIC_TEMPLATES.find((tpl) => tpl.id === templateId);
    if (!found) return;
    setTopicTitle(found.title);
    setTopicPrice(found.offer_price);
    setTopicPrompt(
      mergePromptWithLegacyBenefits(found.prompt_instructions, found.benefits)
    );
    setTopicPhotoPrompt(found.ai_photo_prompt);
  }

  async function handleSaveTopic(e: React.FormEvent) {
    e.preventDefault();
    if (!workspace) return;
    setSavingTopic(true);
    setGlobalNotice(null);
    try {
      const res = await fetch("/api/saas/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upsert_topic",
          companyId: workspace.company.id,
          topic: {
            id: editingTopicId || undefined,
            title: topicTitle,
            niche_template: topicTemplateId,
            prompt_instructions: topicPrompt,
            offer_price: topicPrice,
            benefits_json: [],
            post_format: topicFormat,
            slides_count: topicFormat === "CAROUSEL" ? topicSlides : 1,
            aspect_ratio: deriveRatioFromTargets(topicPublishTargets),
            approval_mode: topicApproval,
            ai_photo_mode: topicPhotoMode,
            ai_photo_prompt: topicPhotoPrompt,
            preferred_image_ai: topicImageAi || null,
            publish_to_stories: Boolean(
              topicPublishTargets.ig_stories || topicPublishTargets.fb_stories
            ),
            publish_targets: topicPublishTargets,
            schedule_days: topicDays,
            schedule_time: topicTimes.join(","),
            schedule_times: topicTimes,
            is_active: topicActive,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await loadState(workspace.company.id);
      setGlobalNotice({
        type: "success",
        text: `Assunto "${data.topic.title}" salvo na agenda!`,
      });
    } catch (err) {
      setGlobalNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Erro ao salvar assunto.",
      });
    } finally {
      setSavingTopic(false);
    }
  }

  async function handleDeleteTopic(topicId: string) {
    if (!workspace) return;
    const res = await fetch("/api/saas/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "delete_topic",
        companyId: workspace.company.id,
        topicId,
      }),
    });
    if (res.ok) {
      await loadState(workspace.company.id);
      if (editingTopicId === topicId) startNewTopic();
    }
  }

  async function handleUploadTopicPhoto(topicId: string, file: File) {
    if (!workspace) return;
    setUploadingPhotoTopicId(topicId);
    try {
      const { base64, contentType } = await fileToBase64(file);
      const res = await fetch("/api/saas/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upload_topic_photo",
          companyId: workspace.company.id,
          topicId,
          fileBase64: base64,
          contentType,
          aiPromptUsed: topicPhotoPrompt,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await loadState(workspace.company.id);
      setGlobalNotice({
        type: "success",
        text: "Foto adicionada à fila de rodízio do produto no Cloudflare R2!",
      });
    } catch (err) {
      setGlobalNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Erro ao enviar foto.",
      });
    } finally {
      setUploadingPhotoTopicId(null);
    }
  }

  async function handleDeleteTopicPhoto(photoId: string) {
    if (!workspace) return;
    await fetch("/api/saas/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "delete_topic_photo",
        companyId: workspace.company.id,
        photoId,
      }),
    });
    await loadState(workspace.company.id);
  }

  function handleSelectStudioTopic(topicId: string) {
    setStudioTopicId(topicId);
    setStudioPreview(null);
    setStudioPhotoBase64(null);
    setStudioPhotoType("image/jpeg");
    if (topicId === "__free__") {
      setStudioTitle("");
      setStudioPrompt("");
      setStudioPrice("");
      setStudioPhotoPrompt("");
      return;
    }
    const found = workspace?.topics.find((t) => t.id === topicId);
    if (!found) return;
    const targets = defaultPublishTargets(
      found,
      workspace?.integrations.tiktok_enabled
    );
    setStudioTitle(found.title);
    setStudioPrompt(
      mergePromptWithLegacyBenefits(
        found.prompt_instructions,
        found.benefits_json
      )
    );
    setStudioPrice(found.offer_price || "");
    setStudioFormat(found.post_format);
    setStudioSlides(found.slides_count);
    setStudioPublishTargets(targets);
    setStudioRatio(deriveRatioFromTargets(targets));
    setStudioPhotoMode(normalizeVisualMode(found.ai_photo_mode));
    setStudioImageAi(found.preferred_image_ai || "");
    setStudioPublishToStories(
      Boolean(targets.ig_stories || targets.fb_stories)
    );
    setStudioPhotoPrompt("");
  }

  async function handleRunStudio(options: {
    previewOnly: boolean;
    useEditedContent?: boolean;
    saveAsDraft?: boolean;
    allowImageFallback?: boolean;
    aiPhotoModeOverride?: AIPhotoMode;
  }) {
    if (!workspace) return;
    const effectiveMode = options.aiPhotoModeOverride || studioPhotoMode;
    if (
      studioTopicId === "__free__" &&
      !studioPrompt.trim() &&
      effectiveMode !== "RAW_ART"
    ) {
      setGlobalNotice({
        type: "error",
        text: 'Digite ou cole o prompt no campo "Prompt para a IA" antes de gerar em Prompt Livre Avulso.',
      });
      return;
    }
    const actionKind = !options.previewOnly
      ? "publishing"
      : options.useEditedContent
        ? "updating_art"
        : "generating_preview";
    setStudioAction(actionKind);
    setGlobalNotice(null);
    setStudioCreditAlert(null);
    setStudioPublishLogs([]);

    try {
      const derivedFreeTitle =
        studioPrompt
          .trim()
          .split(/[\n.!?]/)[0]
          ?.slice(0, 60)
          .trim() || "Campanha Especial";
      const payload: Record<string, unknown> = {
        companyId: workspace.company.id,
        topicId: studioTopicId !== "__free__" ? studioTopicId : undefined,
        customTitle:
          studioTopicId === "__free__"
            ? derivedFreeTitle
            : studioTitle || "Post Especial",
        customPrompt: studioPrompt,
        offerPrice: studioPrice,
        format: studioFormat,
        slidesCount: studioFormat === "CAROUSEL" ? studioSlides : 1,
        aspectRatio: deriveRatioFromTargets(studioPublishTargets),
        aiPhotoMode: options.aiPhotoModeOverride || studioPhotoMode,
        preferredImageAI: studioImageAi || null,
        allowImageFallback: Boolean(options.allowImageFallback),
        publishToStories: Boolean(
          studioPublishTargets.ig_stories || studioPublishTargets.fb_stories
        ),
        publishTargets: studioPublishTargets,
        manualPhotoBase64: studioPhotoBase64,
        manualPhotoContentType: studioPhotoType,
        previewOnly: options.previewOnly,
        saveAsDraft: Boolean(options.saveAsDraft),
      };

      if (options.useEditedContent && studioPreview) {
        payload.editedContent = {
          ...studioPreview.post,
          beneficios: (studioPreview.post.beneficios || [])
            .map((b) => b.trim())
            .filter(Boolean),
        };
        if (
          !options.previewOnly &&
          Array.isArray(studioPreview.imageUrls) &&
          studioPreview.imageUrls.length > 0
        ) {
          payload.existingImageUrls = studioPreview.imageUrls;
          if (
            Array.isArray(studioPreview.storyImageUrls) &&
            studioPreview.storyImageUrls.length > 0
          ) {
            payload.existingStoryImageUrls = studioPreview.storyImageUrls;
          }
        }
        if (studioPreview.draftPostId) {
          payload.draftPostId = studioPreview.draftPostId;
        }
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 65_000);
      let res: Response;
      try {
        res = await fetch("/api/cron/gerar-e-postar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      const rawBody = await res.text();
      let data: Record<string, unknown> = {};
      try {
        data = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
      } catch {
        if (res.status === 504 || /timeout|an error occurred/i.test(rawBody)) {
          throw new Error(
            "O servidor atingiu o tempo limite (60s) ao gerar as imagens do carrossel. Tente novamente ou reduza a quantidade de slides."
          );
        }
        throw new Error(
          `Resposta inválida do servidor (HTTP ${res.status}). Tente novamente em instantes.`
        );
      }

      if (Array.isArray(data.logs)) setStudioPublishLogs(data.logs as string[]);
      if (!res.ok) {
        if (data.code === "AI_CREDIT_EXHAUSTED") {
          setStudioCreditAlert({
            message:
              typeof data.error === "string"
                ? data.error
                : "A IA selecionada está sem crédito ou faturamento ativo.",
            failedProvider:
              (data.failedProvider as "GEMINI" | "OPENAI") || "GEMINI",
            alternativeProvider:
              (data.alternativeProvider as "GEMINI" | "OPENAI" | null) || null,
            retryOptions: {
              previewOnly: options.previewOnly,
              useEditedContent: options.useEditedContent,
              saveAsDraft: options.saveAsDraft,
            },
          });
        }
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "Erro ao processar post."
        );
      }

      if (options.previewOnly) {
        const previewData = data as unknown as StudioPreviewState;
        setStudioPreview(previewData);
        if (previewData.draftPostId) {
          await loadState(workspace.company.id);
        }
        setGlobalNotice({
          type: "success",
          text:
            options.useEditedContent && previewData.draftPostId
              ? "Arte atualizada e salva como rascunho (sem publicar ainda)!"
              : "Prévia gerada! Revise ou edite qualquer texto abaixo antes de salvar ou publicar.",
        });
        scrollToStudioPreview();
      } else {
        setStudioPreview(null);
        setStudioReturnTab(null);
        await loadState(workspace.company.id);
        setGlobalNotice({
          type: "success",
          text: "Post publicado com sucesso no Instagram e Página do Facebook!",
        });
      }
    } catch (err) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      setGlobalNotice({
        type: "error",
        text: isAbort
          ? "A geração excedeu o limite de 65s no servidor. Tente novamente (se houver foto pesada, ela já foi comprimida)."
          : err instanceof Error
            ? err.message
            : "Erro no Estúdio.",
      });
    } finally {
      setStudioAction("idle");
    }
  }

  function scrollToStudioPreview() {
    if (typeof window === "undefined") return;
    setTimeout(() => {
      const el = document.getElementById("studio-preview-section");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}${window.location.search}#studio-preview-section`
        );
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }, 80);
  }

  function handleOpenDraftInStudio(post: PostHistoryItem) {
    const matchedTopic = post.topic_id
      ? workspace?.topics.find((t) => t.id === post.topic_id)
      : undefined;
    const savedStoryUrls =
      Array.isArray(post.story_image_urls_json) &&
      post.story_image_urls_json.length > 0
        ? post.story_image_urls_json
        : Array.isArray(post.content_json?.story_image_urls)
          ? post.content_json.story_image_urls
          : [];
    const savedTargets =
      post.publish_targets || post.content_json?.publish_targets;
    const targets = savedTargets
      ? { ...savedTargets }
      : defaultPublishTargets(
          matchedTopic || { aspect_ratio: post.aspect_ratio },
          workspace?.integrations.tiktok_enabled
        );
    if (
      savedStoryUrls.length > 0 &&
      !targets.ig_stories &&
      !targets.fb_stories &&
      !targets.tiktok_feed
    ) {
      targets.ig_stories = true;
      targets.fb_stories = true;
    }

    setStudioTopicId(matchedTopic ? matchedTopic.id : "__free__");
    setStudioTitle(matchedTopic?.title || post.headline || "");
    setStudioPrompt(
      matchedTopic
        ? mergePromptWithLegacyBenefits(
          matchedTopic.prompt_instructions,
          matchedTopic.benefits_json
        )
        : ""
    );
    setStudioPrice(matchedTopic?.offer_price || "");
    setStudioFormat(post.format);
    setStudioSlides(post.slides_count || post.image_urls_json.length || 3);
    setStudioPublishTargets(targets);
    setStudioRatio(post.aspect_ratio || deriveRatioFromTargets(targets));
    setStudioPublishToStories(
      Boolean(targets.ig_stories || targets.fb_stories)
    );
    setStudioPhotoMode(
      normalizeVisualMode(matchedTopic?.ai_photo_mode || "NONE")
    );
    setStudioPhotoPrompt(matchedTopic?.ai_photo_prompt || "");
    setStudioPhotoBase64(null);

    const isPendingDraft = post.status === "PENDING_APPROVAL";
    setStudioReturnTab(clientTab === "studio" ? "dashboard" : clientTab);
    setStudioPreview({
      companyId: post.company_id,
      draftPostId: isPendingDraft ? post.id : null,
      topicId: post.topic_id || null,
      topicTitle: matchedTopic?.title || post.topic_title || post.headline,
      providerUsed: post.ai_provider_used || "IA",
      imageProviderUsed: post.content_json?.image_provider_used || undefined,
      format: post.format,
      aspectRatio: post.aspect_ratio,
      slidesCount: post.slides_count || post.image_urls_json.length || 1,
      imageUrl: post.image_urls_json[0] || "",
      imageUrls: post.image_urls_json || [],
      storyImageUrls: savedStoryUrls,
      publishTargets: targets,
      post: {
        ...post.content_json,
        beneficios: post.content_json?.beneficios || [],
        slides: post.content_json?.slides || [],
        hashtags: post.content_json?.hashtags || "",
      },
      logs: post.logs_json || [],
    });
    setStudioPublishLogs(post.logs_json || []);
    setClientTab("studio");
    setGlobalNotice({
      type: "success",
      text: isPendingDraft
        ? "Rascunho aberto no Estúdio! Edite os textos/legenda, regenere a arte se quiser e clique em Aprovar e Publicar Agora."
        : "Post carregado no Estúdio para visualização ou reaproveitamento como novo post.",
    });
    scrollToStudioPreview();
  }

  function handleCancelStudioEdit() {
    setStudioPreview(null);
    setStudioPublishLogs([]);
    setGlobalNotice(null);
    setClientTab(studioReturnTab || "dashboard");
    setStudioReturnTab(null);
  }

  async function handleSaveDraftTextOnly() {
    if (!workspace || !studioPreview) return;
    setStudioAction("saving_draft");
    setGlobalNotice(null);
    try {
      const resolvedImgProvider = resolveStudioImageProvider(studioPreview);
      const cleanPost = {
        ...studioPreview.post,
        beneficios: (studioPreview.post.beneficios || [])
          .map((b) => b.trim())
          .filter(Boolean),
        ...(resolvedImgProvider !== "—"
          ? { image_provider_used: resolvedImgProvider }
          : {}),
      };
      const res = await fetch("/api/saas/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_draft_post",
          companyId: workspace.company.id,
          postId: studioPreview.draftPostId || undefined,
          topicId: studioPreview.topicId,
          topicTitle: studioPreview.topicTitle,
          providerUsed: studioPreview.providerUsed,
          format: studioPreview.format,
          aspectRatio: studioPreview.aspectRatio,
          slidesCount: studioPreview.slidesCount,
          editedContent: cleanPost,
          imageUrls: studioPreview.imageUrls,
          storyImageUrls: studioPreview.storyImageUrls || [],
          publishTargets: studioPublishTargets,
          logs: studioPreview.logs || [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.post?.id) {
        setStudioPreview({
          ...studioPreview,
          draftPostId: data.post.id,
          imageProviderUsed:
            resolvedImgProvider !== "—"
              ? resolvedImgProvider
              : studioPreview.imageProviderUsed,
          post: cleanPost,
        });
      }
      await loadState(workspace.company.id);
      setGlobalNotice({
        type: "success",
        text: "Rascunho salvo com sucesso (arte e textos salvos, sem publicar ainda)!",
      });
    } catch (err) {
      setGlobalNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Erro ao salvar rascunho.",
      });
    } finally {
      setStudioAction("idle");
    }
  }

  async function handleDeleteDraft(postId: string) {
    if (!workspace) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm("Deseja realmente excluir este rascunho?")
    ) {
      return;
    }
    setDeletingPostId(postId);
    setGlobalNotice(null);
    try {
      const res = await fetch("/api/saas/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_draft_post",
          companyId: workspace.company.id,
          postId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (studioPreview?.draftPostId === postId) {
        setStudioPreview(null);
      }
      await loadState(workspace.company.id);
      setGlobalNotice({
        type: "success",
        text: "Rascunho excluído com sucesso.",
      });
    } catch (err) {
      setGlobalNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Erro ao excluir rascunho.",
      });
    } finally {
      setDeletingPostId(null);
    }
  }

  async function handleApproveDraft(
    postId: string,
    customPreview?: StudioPreviewState
  ) {
    if (!workspace) return;
    setApprovingPostId(postId);
    if (customPreview) setStudioAction("publishing");
    setGlobalNotice(null);
    try {
      const cleanEdited = customPreview
        ? {
          ...customPreview.post,
          beneficios: (customPreview.post.beneficios || [])
            .map((b) => b.trim())
            .filter(Boolean),
        }
        : undefined;
      const res = await fetch("/api/saas/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve_draft_post",
          companyId: workspace.company.id,
          postId,
          editedContent: cleanEdited,
          imageUrls: customPreview?.imageUrls,
          storyImageUrls: customPreview?.storyImageUrls,
          publishToStories: customPreview
            ? Boolean(
              studioPublishTargets.ig_stories ||
              studioPublishTargets.fb_stories
            )
            : undefined,
          publishTargets: customPreview ? studioPublishTargets : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (Array.isArray(data.post?.logs_json)) {
        setStudioPublishLogs(data.post.logs_json);
      }
      if (customPreview || studioPreview?.draftPostId === postId) {
        setStudioPreview(null);
        setStudioReturnTab(null);
      }
      await loadState(workspace.company.id);
      setGlobalNotice({
        type: "success",
        text: "Rascunho aprovado e publicado no Instagram e Facebook!",
      });
    } catch (err) {
      setGlobalNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Erro ao publicar rascunho.",
      });
    } finally {
      setApprovingPostId(null);
      setStudioAction("idle");
    }
  }

  async function handleAdminSaveCompany(e: React.FormEvent) {
    e.preventDefault();
    setSavingAdminComp(true);
    setGlobalNotice(null);
    try {
      const res = await fetch("/api/saas/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "admin_save_company",
          company: {
            id: admCompId,
            name: admCompName,
            owner_name: admCompOwner,
            owner_whatsapp: admCompWhatsapp,
            admin_email: admCompEmail,
            admin_password: admCompPassword,
            plan_id: admCompPlanId,
            status: admCompStatus,
            expires_at: new Date(`${admCompExpires}T23:59:59Z`).toISOString(),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAdminSnapshot(data.adminSnapshot);
      setAdmCompId(undefined);
      setAdmCompName("");
      setAdmCompOwner("");
      setAdmCompWhatsapp("");
      setAdmCompEmail("");
      setAdmCompPassword("");
      setGlobalNotice({
        type: "success",
        text: `Empresa "${data.company.name}" salva no SaaS!`,
      });
    } catch (err) {
      setGlobalNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Erro ao salvar empresa.",
      });
    } finally {
      setSavingAdminComp(false);
    }
  }

  async function handleAdminQuickToggleBlock(c: AdminCompanyRow) {
    const nextStatus: CompanyStatus =
      c.status === "BLOCKED" ? "ACTIVE" : "BLOCKED";
    const res = await fetch("/api/saas/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "admin_save_company",
        company: {
          id: c.id,
          name: c.name,
          plan_id: c.plan_id,
          status: nextStatus,
          expires_at: c.expires_at,
        },
      }),
    });
    const data = await res.json();
    if (res.ok && data.adminSnapshot) setAdminSnapshot(data.adminSnapshot);
  }

  async function handleAdminSavePlan(p: Plan) {
    const res = await fetch("/api/saas/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "admin_save_plan", plan: p }),
    });
    const data = await res.json();
    if (res.ok && data.adminSnapshot) {
      setAdminSnapshot(data.adminSnapshot);
      setGlobalNotice({
        type: "success",
        text: `Plano "${p.name}" atualizado!`,
      });
    }
  }

  async function handleSubmitTip(e: React.FormEvent) {
    e.preventDefault();
    if (!workspace || !tipMessage.trim()) return;
    setSubmittingTip(true);
    setGlobalNotice(null);
    try {
      const res = await fetch("/api/saas/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit_improvement_tip",
          companyId: workspace.company.id,
          message: tipMessage,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao enviar dica.");
      if (data.workspace) setWorkspace(data.workspace);
      if (data.adminSnapshot) setAdminSnapshot(data.adminSnapshot);
      setTipMessage("");
      setGlobalNotice({
        type: "success",
        text: "Sua dica foi enviada para o painel administrativo! Obrigado por contribuir.",
      });
    } catch (err) {
      setGlobalNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Erro ao enviar dica.",
      });
    } finally {
      setSubmittingTip(false);
    }
  }

  async function handleMarkTipsSeen() {
    if (!workspace) return;
    try {
      const res = await fetch("/api/saas/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "mark_tips_seen",
          companyId: workspace.company.id,
        }),
      });
      const data = await res.json();
      if (res.ok && data.workspace) {
        setWorkspace(data.workspace);
      }
    } catch {
      // Ignora erro silencioso
    }
  }

  async function handleAdminUpdateTipStatus(
    tipId: string,
    nextStatus: "OPEN" | "COMPLETED"
  ) {
    setUpdatingTipId(tipId);
    setGlobalNotice(null);
    try {
      const res = await fetch("/api/saas/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "admin_update_tip_status",
          companyId: workspace?.company.id,
          tipId,
          status: nextStatus,
          adminReply:
            nextStatus === "COMPLETED"
              ? adminTipReplyDrafts[tipId] || ""
              : "",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao atualizar dica.");
      if (data.adminSnapshot) setAdminSnapshot(data.adminSnapshot);
      if (data.workspace) setWorkspace(data.workspace);
      setGlobalNotice({
        type: "success",
        text:
          nextStatus === "COMPLETED"
            ? "Dica marcada como concluída! O cliente receberá a notificação."
            : "Dica reaberta como pendente.",
      });
    } catch (err) {
      setGlobalNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Erro ao atualizar dica.",
      });
    } finally {
      setUpdatingTipId(null);
    }
  }

  async function handleCopySupportEmail() {
    try {
      await navigator.clipboard?.writeText(SUPPORT_EMAIL);
      setCopiedSupportEmail(true);
      setTimeout(() => setCopiedSupportEmail(false), 1800);
    } catch {
      setCopiedSupportEmail(false);
    }
  }

  if (bootLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-3 rounded-2xl border border-indigo-100 bg-white/90 px-6 py-4 shadow-lg shadow-indigo-500/10">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          <span className="text-sm font-semibold text-slate-700">
            Carregando Social PilotFlow SaaS...
          </span>
        </div>
      </div>
    );
  }

  // ==================== TELA DE LOGIN / CADASTRO / RECUPERAÇÃO ====================
  if (!user || !workspace) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-md rounded-3xl border border-white/80 bg-white/90 p-5 sm:p-8 shadow-2xl shadow-indigo-500/10 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <img
              src="/logo-pilotflow.jpg"
              alt="Social PilotFlow SaaS"
              className="h-12 w-12 rounded-2xl border border-slate-200 bg-white object-cover shadow-lg shadow-indigo-500/15"
            />
            <div>
              <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-indigo-700">
                Multi-IA &amp; Multi-Empresas
              </span>
              <h1 className="text-xl font-extrabold text-slate-900">
                Social PilotFlow SaaS
              </h1>
            </div>
          </div>

          {/* Navegação Principal da Tela de Acesso */}
          <div className="mt-5 grid grid-cols-3 gap-1.5 rounded-xl bg-slate-100 p-1">
            {(
              [
                ["login", "Entrar"],
                ["register", "Criar Conta"],
                ["recovery", "Recuperar Senha"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setAuthScreen(key);
                  setLoginError(null);
                  setAuthFeedback(null);
                }}
                className={`rounded-lg py-2 text-xs font-bold transition ${authScreen === key
                    ? "bg-white text-indigo-700 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                  }`}
              >
                {label}
              </button>
            ))}
          </div>

          {authFeedback && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800">
              {authFeedback}
            </div>
          )}

          {loginError && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
              {loginError}
            </div>
          )}

          {pendingConfirmEmail && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
              <span>
                Aguardando confirmação de{" "}
                <strong className="break-all">{pendingConfirmEmail}</strong>.
              </span>
              <button
                type="button"
                disabled={resendingConfirm}
                onClick={() => void handleResendConfirmation()}
                className="rounded-lg bg-amber-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-amber-700 disabled:opacity-60"
              >
                {resendingConfirm
                  ? "Reenviando..."
                  : "Reenviar e-mail de confirmação"}
              </button>
            </div>
          )}

          {/* TELA 1: ENTRAR */}
          {authScreen === "login" && (
            <>
              <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-indigo-50/70 p-1">
                <button
                  type="button"
                  onClick={() => setLoginMode("credentials")}
                  className={`rounded-lg py-1.5 text-[11px] font-bold transition ${loginMode === "credentials"
                      ? "bg-white text-indigo-700 shadow-xs"
                      : "text-slate-600"
                    }`}
                >
                  E-mail e Senha
                </button>
                <button
                  type="button"
                  onClick={() => setLoginMode("cron")}
                  className={`rounded-lg py-1.5 text-[11px] font-bold transition ${loginMode === "cron"
                      ? "bg-white text-indigo-700 shadow-xs"
                      : "text-slate-600"
                    }`}
                >
                  Token CRON_SECRET
                </button>
              </div>

              <form onSubmit={handleLogin} className="mt-4 space-y-4">
                {loginMode === "credentials" && (
                  <div>
                    <label
                      htmlFor="login-email"
                      className="block text-xs font-bold uppercase tracking-wider text-slate-600"
                    >
                      E-mail
                    </label>
                    <input
                      id="login-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="Digite seu e-mail..."
                      required
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
                    />
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="login-password"
                      className="block text-xs font-bold uppercase tracking-wider text-slate-600"
                    >
                      {loginMode === "cron" ? "Token CRON_SECRET" : "Senha"}
                    </label>
                    {loginMode === "credentials" && (
                      <button
                        type="button"
                        onClick={() => {
                          setAuthScreen("recovery");
                          setRecoveryEmail(loginEmail);
                          setLoginError(null);
                        }}
                        className="text-[11px] font-bold text-indigo-600 hover:underline"
                      >
                        Esqueci minha senha
                      </button>
                    )}
                  </div>
                  <div className="relative mt-1.5">
                    <input
                      id="login-password"
                      name="password"
                      type={showAuthPassword ? "text" : "password"}
                      autoComplete={
                        loginMode === "cron" ? "off" : "current-password"
                      }
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      required
                      placeholder={
                        loginMode === "cron"
                          ? "Cole seu CRON_SECRET..."
                          : "Digite sua senha..."
                      }
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 pr-20 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAuthPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500 hover:text-slate-800"
                    >
                      {showAuthPassword ? "Ocultar" : "Mostrar"}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={authSubmitting}
                  className="w-full rounded-xl bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 transition hover:opacity-95 disabled:opacity-60"
                >
                  {authSubmitting ? "Autenticando..." : "Entrar no Painel"}
                </button>
              </form>
            </>
          )}

          {/* TELA 2: CRIAR CONTA (SINCRONIZADA COM SUPABASE AUTH) */}
          {authScreen === "register" && (
            <form onSubmit={handleRegister} className="mt-4 space-y-3">
              <p className="text-xs text-slate-600">
                Cadastre sua empresa no <strong>Supabase Authentication</strong>{" "}
                com 14 dias de teste grátis no plano Pro IA. Você receberá um
                link de confirmação no seu e-mail antes de acessar o painel.
              </p>
              <input
                type="text"
                value={regCompanyName}
                onChange={(e) => setRegCompanyName(e.target.value)}
                placeholder="Nome da Empresa (ex: Loja Vitrine)"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500 focus:bg-white"
              />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  type="text"
                  required
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder="Seu Nome"
                  className="rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500 focus:bg-white"
                />
                <input
                  type="text"
                  value={regWhatsapp}
                  onChange={(e) => setRegWhatsapp(e.target.value)}
                  placeholder="WhatsApp (DDD)"
                  className="rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500 focus:bg-white"
                />
              </div>
              <input
                type="email"
                required
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                placeholder="Seu melhor e-mail"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500 focus:bg-white"
              />
              <input
                type="password"
                required
                minLength={6}
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                placeholder="Crie uma senha (mín. 6 caracteres)"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500 focus:bg-white"
              />
              <input
                type="password"
                value={regAdminSecret}
                onChange={(e) => setRegAdminSecret(e.target.value)}
                placeholder="Insira o Código Super Admin — só p/ Agência Parceira."
                className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-xs outline-none focus:border-indigo-500 focus:bg-white"
              />
              <button
                type="submit"
                disabled={authSubmitting}
                className="w-full rounded-xl bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 transition hover:opacity-95 disabled:opacity-60"
              >
                {authSubmitting ? "Criando conta..." : "Cadastrar e Entrar"}
              </button>
            </form>
          )}

          {/* TELA 3: RECUPERAR SENHA (E-MAIL SUPABASE OU REDEFINIÇÃO IMEDIATA) */}
          {authScreen === "recovery" && (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-indigo-50/70 p-1">
                <button
                  type="button"
                  onClick={() => setRecoveryMethod("email")}
                  className={`rounded-lg py-1.5 text-[11px] font-bold transition ${recoveryMethod === "email"
                      ? "bg-white text-indigo-700 shadow-xs"
                      : "text-slate-600"
                    }`}
                >
                  Enviar Link p/ E-mail
                </button>
                <button
                  type="button"
                  onClick={() => setRecoveryMethod("reset")}
                  className={`rounded-lg py-1.5 text-[11px] font-bold transition ${recoveryMethod === "reset"
                      ? "bg-white text-indigo-700 shadow-xs"
                      : "text-slate-600"
                    }`}
                >
                  Definir Nova Senha
                </button>
              </div>

              {recoveryMethod === "email" ? (
                <form onSubmit={handleForgotPassword} className="space-y-3">
                  <p className="text-xs text-slate-600">
                    O <strong>Supabase Authentication</strong> enviará um link
                    seguro para você redefinir sua senha.
                  </p>
                  <input
                    type="email"
                    required
                    value={recoveryEmail}
                    onChange={(e) => setRecoveryEmail(e.target.value)}
                    placeholder="E-mail da conta"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:bg-white"
                  />
                  <button
                    type="submit"
                    disabled={authSubmitting}
                    className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-500 py-3 text-sm font-bold text-white shadow-md"
                  >
                    {authSubmitting
                      ? "Enviando..."
                      : "Enviar E-mail de Recuperação"}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleResetPassword} className="space-y-3">
                  {!recoveryAccessToken ? (
                    <>
                      <p className="text-xs text-slate-600">
                        Se você é o administrador e ainda não configurou SMTP no
                        Supabase, redefina usando seu <code>CRON_SECRET</code>:
                      </p>
                      <input
                        type="email"
                        required
                        value={recoveryEmail}
                        onChange={(e) => setRecoveryEmail(e.target.value)}
                        placeholder="E-mail da conta"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500 focus:bg-white"
                      />
                      <input
                        type="password"
                        required
                        value={recoveryCronSecret}
                        onChange={(e) => setRecoveryCronSecret(e.target.value)}
                        placeholder="Cole o CRON_SECRET para autorizar"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500 focus:bg-white"
                      />
                    </>
                  ) : (
                    <p className="text-xs font-semibold text-emerald-700">
                      Token de recuperação do e-mail ativo! Escolha sua nova
                      senha abaixo:
                    </p>
                  )}

                  <input
                    type="password"
                    required
                    minLength={6}
                    value={recoveryNewPassword}
                    onChange={(e) => setRecoveryNewPassword(e.target.value)}
                    placeholder="Nova senha (mín. 6 caracteres)"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500 focus:bg-white"
                  />
                  <button
                    type="submit"
                    disabled={authSubmitting}
                    className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-md hover:bg-emerald-700"
                  >
                    {authSubmitting ? "Salvando..." : "Salvar Nova Senha"}
                  </button>
                </form>
              )}
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4 text-[11px] text-slate-500">
            <span>Meu Gestor Digital</span>
            <div className="flex items-center gap-3">
              <Link
                href="/suporte"
                className="font-semibold text-indigo-600 hover:underline"
              >
                Suporte
              </Link>
              <Link
                href="/termos"
                className="font-semibold text-slate-600 hover:text-indigo-600 hover:underline"
              >
                Termos de Serviço
              </Link>
              <Link
                href="/privacidade"
                className="font-semibold text-slate-600 hover:text-indigo-600 hover:underline"
              >
                Política de Privacidade
              </Link>
            </div>
            <span>
              Banco:{" "}
              <strong className="text-slate-700">
                {databaseMode === "supabase"
                  ? "Supabase Auth + DB"
                  : "Modo Demonstração Local"}
              </strong>
            </span>
          </div>
        </div>
      </main>
    );
  }

  const pendingDrafts = workspace.posts.filter(
    (p) => p.status === "PENDING_APPROVAL"
  );
  const unseenCompletedTips = (workspace.tips || []).filter(
    (t) => t.status === "COMPLETED" && !t.client_seen_at
  );
  const openAdminTipsCount = (adminSnapshot?.tips || []).filter(
    (t) => t.status === "OPEN"
  ).length;
  const metaDaysLeft = daysUntil(workspace.integrations.meta_token_expires_at);
  const planDaysLeft = daysUntil(workspace.company.expires_at);

  // ==================== INTERFACE LOGADA LUMINOSA ====================
  return (
    <div className="min-h-screen pb-16">
      {/* Barra Superior Glass */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3.5 md:px-8">
          <div className="flex items-center gap-3">
            <img
              src="/logo-pilotflow.jpg"
              alt="Social PilotFlow SaaS"
              className="h-10 w-10 rounded-xl border border-slate-200 bg-white object-cover shadow-sm"
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-extrabold text-slate-900">
                  Social PilotFlow SaaS
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${databaseMode === "supabase"
                      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                      : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                    }`}
                >
                  {databaseMode === "supabase"
                    ? "Supabase Ativo"
                    : "Memória (Falta Supabase)"}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Empresa ativa:{" "}
                <strong className="text-indigo-700">
                  {workspace.company.name}
                </strong>{" "}
                • Plano {workspace.plan.name}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {user.role === "SUPER_ADMIN" && adminSnapshot && (
              <>
                <select
                  value={workspace.company.id}
                  onChange={(e) => handleSwitchCompany(e.target.value)}
                  className="max-w-full truncate rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-indigo-500 sm:max-w-xs"
                  title="Trocar empresa ativa (Impersonate)"
                >
                  {adminSnapshot.companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      Empresa: {c.name} ({c.status})
                    </option>
                  ))}
                </select>

                <div className="flex rounded-xl bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setViewScope("client")}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${viewScope === "client"
                        ? "bg-white text-indigo-700 shadow-sm"
                        : "text-slate-600"
                      }`}
                  >
                    Painel da Empresa
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewScope("admin")}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${viewScope === "admin"
                        ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm"
                        : "text-slate-600"
                      }`}
                  >
                    Super Admin
                  </button>
                </div>
              </>
            )}

            <button
              type="button"
              onClick={handleLogout}
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 pt-6 md:px-8">
        {databaseMode === "memory" && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-4 text-xs text-amber-900 shadow-sm">
            <strong>Modo Demonstração:</strong> As variáveis{" "}
            <code>SUPABASE_URL</code> e <code>SUPABASE_SERVICE_ROLE_KEY</code>{" "}
            ainda não foram configuradas no ambiente. Você já pode testar todas
            as telas; assim que rodar o arquivo{" "}
            <code>supabase/schema.sql</code> no Supabase e adicionar essas duas
            variáveis, todos os dados ficam persistidos permanentemente no seu
            banco gratuito!
          </div>
        )}

        {globalNotice && (
          <div
            className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-sm font-semibold shadow-sm ${globalNotice.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
              }`}
          >
            <span>{globalNotice.text}</span>
            <button
              type="button"
              onClick={() => setGlobalNotice(null)}
              className="ml-4 text-xs underline opacity-75"
            >
              Fechar
            </button>
          </div>
        )}

        {/* ==================== VISÃO SUPER ADMIN ==================== */}
        {viewScope === "admin" && user.role === "SUPER_ADMIN" && adminSnapshot && (
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["overview", "Dashboard Executivo SaaS"],
                  ["companies", "Empresas Clientes"],
                  ["plans", "Planos & Limites"],
                  ["tips", "Dicas & Melhorias"],
                  ["audit", "Auditoria & Logs Globais"],
                ] as Array<[AdminTab, string]>
              ).map(([tabKey, label]) => (
                <button
                  key={tabKey}
                  type="button"
                  onClick={() => setAdminTab(tabKey)}
                  className={`rounded-xl px-4 py-2.5 text-xs font-bold transition ${adminTab === tabKey
                      ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/20"
                      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                >
                  {label}
                  {tabKey === "tips" && openAdminTipsCount > 0 && (
                    <span className="ml-2 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] text-slate-900">
                      {openAdminTipsCount}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {adminTab === "overview" && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      MRR Estimado (Ativas)
                    </p>
                    <p className="mt-2 text-3xl font-extrabold text-emerald-600">
                      R$ {adminSnapshot.metrics.mrr_brl.toFixed(2)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {adminSnapshot.metrics.active_companies} empresas pagantes
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Total de Empresas
                    </p>
                    <p className="mt-2 text-3xl font-extrabold text-indigo-600">
                      {adminSnapshot.metrics.total_companies}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {adminSnapshot.metrics.trial_companies} em Trial •{" "}
                      {adminSnapshot.metrics.blocked_or_due} bloqueadas/vencidas
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Posts Publicados (Mês)
                    </p>
                    <p className="mt-2 text-3xl font-extrabold text-cyan-600">
                      {adminSnapshot.metrics.total_posts_month}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Mídias 100% no Cloudflare R2
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Infraestrutura Free
                    </p>
                    <p className="mt-2 text-xl font-extrabold text-slate-900">
                      {databaseMode === "supabase"
                        ? "Supabase + R2 OK"
                        : "Aguardando Supabase"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Auditoria com retenção de 90 dias
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
                  <h2 className="text-base font-extrabold text-slate-900">
                    Saúde Rápida das Empresas
                  </h2>
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500">
                          <th className="pb-2">Empresa</th>
                          <th className="pb-2">Plano</th>
                          <th className="pb-2">Uso Mês</th>
                          <th className="pb-2">Vencimento</th>
                          <th className="pb-2">Status</th>
                          <th className="pb-2 text-right">Acesso</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {adminSnapshot.companies.map((c) => (
                          <tr key={c.id}>
                            <td className="py-3 font-bold text-slate-900">
                              {c.name}
                            </td>
                            <td className="py-3">{c.plan_name}</td>
                            <td className="py-3">
                              {c.posts_used_month}/{c.plan_limit}
                            </td>
                            <td className="py-3">
                              {new Date(c.expires_at).toLocaleDateString(
                                "pt-BR"
                              )}
                            </td>
                            <td className="py-3">
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${c.status === "ACTIVE"
                                    ? "bg-emerald-50 text-emerald-700"
                                    : c.status === "TRIAL"
                                      ? "bg-cyan-50 text-cyan-700"
                                      : "bg-rose-50 text-rose-700"
                                  }`}
                              >
                                {c.status}
                              </span>
                            </td>
                            <td className="py-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleSwitchCompany(c.id)}
                                className="rounded-lg bg-indigo-50 px-3 py-1 font-bold text-indigo-700 hover:bg-indigo-100"
                              >
                                Entrar no Painel
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {adminTab === "companies" && (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                <form
                  onSubmit={handleAdminSaveCompany}
                  className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm lg:col-span-4"
                >
                  <h2 className="text-base font-extrabold text-slate-900">
                    {admCompId ? "Editar Empresa" : "Cadastrar Nova Empresa"}
                  </h2>
                  <input
                    placeholder="Nome da Empresa (ex: Loja Bella)"
                    value={admCompName}
                    onChange={(e) => setAdmCompName(e.target.value)}
                    required
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                  />
                  <input
                    placeholder="Nome do Responsável"
                    value={admCompOwner}
                    onChange={(e) => setAdmCompOwner(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                  />
                  <input
                    placeholder="WhatsApp (com DDD)"
                    value={admCompWhatsapp}
                    onChange={(e) => setAdmCompWhatsapp(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                  />
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <select
                      value={admCompPlanId}
                      onChange={(e) => setAdmCompPlanId(e.target.value)}
                      className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold outline-none focus:border-indigo-500"
                    >
                      {adminSnapshot.plans.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} (R${p.price_brl})
                        </option>
                      ))}
                    </select>
                    <select
                      value={admCompStatus}
                      onChange={(e) =>
                        setAdmCompStatus(e.target.value as CompanyStatus)
                      }
                      className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold outline-none focus:border-indigo-500"
                    >
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="TRIAL">TRIAL</option>
                      <option value="PAST_DUE">PAST_DUE</option>
                      <option value="BLOCKED">BLOCKED</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600">
                      Data de Vencimento
                    </label>
                    <input
                      type="date"
                      value={admCompExpires}
                      onChange={(e) => setAdmCompExpires(e.target.value)}
                      required
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="border-t border-slate-100 pt-3">
                    <p className="mb-2 text-xs font-bold text-indigo-700">
                      Login da Empresa (Opcional ao editar)
                    </p>
                    <input
                      type="email"
                      placeholder="E-mail de acesso do cliente"
                      value={admCompEmail}
                      onChange={(e) => setAdmCompEmail(e.target.value)}
                      className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                    />
                    <input
                      type="password"
                      placeholder="Senha de acesso"
                      value={admCompPassword}
                      onChange={(e) => setAdmCompPassword(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={savingAdminComp}
                    className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 py-3 text-xs font-bold text-white shadow-md"
                  >
                    {savingAdminComp
                      ? "Salvando..."
                      : admCompId
                        ? "Atualizar Empresa"
                        : "Criar Empresa & Login"}
                  </button>
                </form>

                <div className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm lg:col-span-8">
                  <h2 className="text-base font-extrabold text-slate-900">
                    Empresas Cadastradas ({adminSnapshot.companies.length})
                  </h2>
                  <div className="space-y-3">
                    {adminSnapshot.companies.map((c) => (
                      <div
                        key={c.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-extrabold text-slate-900">
                              {c.name}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${c.status === "ACTIVE"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : c.status === "TRIAL"
                                    ? "bg-cyan-100 text-cyan-800"
                                    : "bg-rose-100 text-rose-800"
                                }`}
                            >
                              {c.status}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-600">
                            Plano: <strong>{c.plan_name}</strong> • Uso:{" "}
                            {c.posts_used_month}/{c.plan_limit} posts/mês • Vence em{" "}
                            {new Date(c.expires_at).toLocaleDateString("pt-BR")}{" "}
                            • Assuntos: {c.topics_count}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleSwitchCompany(c.id)}
                            className="rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
                          >
                            Acessar como Cliente
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAdmCompId(c.id);
                              setAdmCompName(c.name);
                              setAdmCompOwner(c.owner_name || "");
                              setAdmCompWhatsapp(c.owner_whatsapp || "");
                              setAdmCompPlanId(c.plan_id);
                              setAdmCompStatus(c.status);
                              setAdmCompExpires(c.expires_at.slice(0, 10));
                            }}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAdminQuickToggleBlock(c)}
                            className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700"
                          >
                            {c.status === "BLOCKED"
                              ? "Desbloquear"
                              : "Bloquear"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {adminTab === "plans" && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {adminSnapshot.plans.map((p) => (
                  <div
                    key={p.id}
                    className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
                  >
                    <h3 className="text-lg font-extrabold text-slate-900">
                      {p.name}
                    </h3>
                    <p className="text-2xl font-extrabold text-indigo-600">
                      R$ {Number(p.price_brl).toFixed(2)}/mês
                    </p>
                    <ul className="space-y-1 text-xs text-slate-600">
                      <li>Limite: {p.max_posts_month} posts/mês</li>
                      <li>
                        Carrosséis: {p.allow_carousel ? "Liberado" : "Bloqueado"}
                      </li>
                      <li>
                        Foto com IA:{" "}
                        {p.allow_ai_photo ? "Liberado" : "Bloqueado"}
                      </li>
                      <li>
                        Multi-IA (Claude/GPT/Gemini):{" "}
                        {p.allow_multi_ai ? "Liberado" : "Bloqueado"}
                      </li>
                    </ul>
                    <button
                      type="button"
                      onClick={() => {
                        const newLimit = prompt(
                          `Novo limite mensal para ${p.name}:`,
                          String(p.max_posts_month)
                        );
                        if (newLimit && !Number.isNaN(Number(newLimit))) {
                          void handleAdminSavePlan({
                            ...p,
                            max_posts_month: Number(newLimit),
                          });
                        }
                      }}
                      className="w-full rounded-xl border border-indigo-200 bg-indigo-50 py-2 text-xs font-bold text-indigo-700"
                    >
                      Ajustar Limite Mensal
                    </button>
                  </div>
                ))}
              </div>
            )}

            {adminTab === "tips" && (
              <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-extrabold text-slate-900">
                      Dicas e Melhorias dos Clientes ({(adminSnapshot.tips || []).length})
                    </h2>
                    <p className="text-xs text-slate-500">
                      Ordenadas por data de envio (mais recentes primeiro). Ao marcar
                      como concluído, o cliente recebe automaticamente o aviso de que
                      a dica foi atendida.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        ["ALL", "Todas"],
                        ["OPEN", "Pendentes"],
                        ["COMPLETED", "Concluídas"],
                      ] as const
                    ).map(([filterKey, filterLabel]) => (
                      <button
                        key={filterKey}
                        type="button"
                        onClick={() => setAdminTipFilter(filterKey)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${adminTipFilter === filterKey
                            ? "bg-indigo-600 text-white"
                            : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                          }`}
                      >
                        {filterLabel}
                      </button>
                    ))}
                  </div>
                </div>

                {(() => {
                  const sortedTips = [...(adminSnapshot.tips || [])]
                    .sort(
                      (a, b) =>
                        new Date(b.created_at).getTime() -
                        new Date(a.created_at).getTime()
                    )
                    .filter((t) =>
                      adminTipFilter === "ALL" ? true : t.status === adminTipFilter
                    );

                  if (sortedTips.length === 0) {
                    return (
                      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500">
                        Nenhuma dica encontrada neste filtro.
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-3">
                      {sortedTips.map((tip) => (
                        <div
                          key={tip.id}
                          className={`rounded-2xl border p-4 text-xs transition ${tip.status === "COMPLETED"
                              ? "border-emerald-200 bg-emerald-50/40"
                              : "border-slate-200 bg-slate-50/70"
                            }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${tip.status === "COMPLETED"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-amber-100 text-amber-800"
                                  }`}
                              >
                                {tip.status === "COMPLETED"
                                  ? "Concluída"
                                  : "Pendente"}
                              </span>
                              <span className="font-extrabold text-slate-900">
                                {tip.company_name}
                              </span>
                              <span className="text-slate-600">
                                • {tip.user_name} ({tip.user_email})
                              </span>
                            </div>
                            <span className="text-[11px] text-slate-500">
                              Enviada em{" "}
                              {new Date(tip.created_at).toLocaleString("pt-BR")}
                            </span>
                          </div>

                          <p className="mt-2.5 whitespace-pre-wrap rounded-xl border border-slate-200/80 bg-white p-3 text-sm text-slate-800">
                            {tip.message}
                          </p>

                          {tip.status === "COMPLETED" ? (
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                              <div className="space-y-0.5 text-[11px] font-semibold text-emerald-800">
                                <p>
                                  Concluída em:{" "}
                                  <strong>
                                    {tip.completed_at
                                      ? new Date(
                                        tip.completed_at
                                      ).toLocaleString("pt-BR")
                                      : "—"}
                                  </strong>
                                </p>
                                <p>
                                  Mensagem ao cliente:{" "}
                                  {tip.admin_reply ||
                                    TIP_COMPLETED_DEFAULT_MESSAGE}
                                </p>
                              </div>
                              <button
                                type="button"
                                disabled={updatingTipId === tip.id}
                                onClick={() =>
                                  void handleAdminUpdateTipStatus(tip.id, "OPEN")
                                }
                                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                              >
                                Reabrir
                              </button>
                            </div>
                          ) : (
                            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                              <input
                                value={adminTipReplyDrafts[tip.id] || ""}
                                onChange={(e) =>
                                  setAdminTipReplyDrafts((prev) => ({
                                    ...prev,
                                    [tip.id]: e.target.value,
                                  }))
                                }
                                placeholder="Mensagem opcional ao cliente (se vazio, envia: Sua dica foi atendida!)"
                                className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-indigo-500"
                              />
                              <button
                                type="button"
                                disabled={updatingTipId === tip.id}
                                onClick={() =>
                                  void handleAdminUpdateTipStatus(
                                    tip.id,
                                    "COMPLETED"
                                  )
                                }
                                className="shrink-0 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
                              >
                                {updatingTipId === tip.id
                                  ? "Salvando..."
                                  : "Marcar como concluído"}
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}

            {adminTab === "audit" && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-base font-extrabold text-slate-900">
                  Auditoria Global (Últimos Eventos)
                </h2>
                <div className="mt-4 space-y-2">
                  {adminSnapshot.audits.map((a) => (
                    <div
                      key={a.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 px-4 py-2.5 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="rounded bg-indigo-100 px-2 py-0.5 font-mono text-[11px] font-bold text-indigo-800">
                          {a.action}
                        </span>{" "}
                        <span className="ml-2 break-all text-slate-600">
                          {JSON.stringify(a.details_json)}
                        </span>
                      </div>
                      <span className="text-slate-400">
                        {new Date(a.created_at).toLocaleString("pt-BR")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================== VISÃO EMPRESA CLIENTE ==================== */}
        {viewScope === "client" && (
          <div className="space-y-6">
            {/* Abas Cliente */}
            <nav className="flex flex-wrap gap-2">
              {(
                [
                  ["dashboard", "Dashboard da Empresa"],
                  ["topics", "Meus Assuntos & Produtos"],
                  ["studio", "Estúdio Manual (Preview)"],
                  ["brand", "Identidade Visual"],
                  ["integrations", "Integrações (Multi-IA & Redes)"],
                  ["history", "Histórico de Posts"],
                  ["campaigns", "Campanhas"],
                  ["support", "Suporte & Dicas"],
                ] as Array<[ClientTab, string]>
              ).map(([tabKey, label]) => (
                <button
                  key={tabKey}
                  type="button"
                  onClick={() => setClientTab(tabKey)}
                  className={`rounded-xl px-4 py-2.5 text-xs font-bold transition ${clientTab === tabKey
                      ? "bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500 text-white shadow-md shadow-indigo-500/20"
                      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                >
                  {label}
                  {tabKey === "dashboard" && pendingDrafts.length > 0 && (
                    <span className="ml-2 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] text-slate-900">
                      {pendingDrafts.length}
                    </span>
                  )}
                  {tabKey === "support" && unseenCompletedTips.length > 0 && (
                    <span className="ml-2 rounded-full bg-emerald-400 px-1.5 py-0.5 text-[10px] text-slate-900">
                      {unseenCompletedTips.length}
                    </span>
                  )}
                </button>
              ))}
            </nav>

            {/* ---------- ABA 1: DASHBOARD DA EMPRESA ---------- */}
            {clientTab === "dashboard" && (
              <div className="space-y-6">
                {unseenCompletedTips.length > 0 && (
                  <div className="space-y-2 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-xs text-emerald-950 shadow-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-extrabold text-emerald-900">
                        Boa notícia! Sua dica de melhoria foi atendida
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setClientTab("support")}
                          className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100/60"
                        >
                          Ver em Suporte &amp; Dicas
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleMarkTipsSeen()}
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700"
                        >
                          Entendi
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {unseenCompletedTips.map((t) => (
                        <div
                          key={t.id}
                          className="rounded-xl border border-emerald-200 bg-white p-3"
                        >
                          <p className="font-semibold text-slate-800">
                            &ldquo;{t.message}&rdquo;
                          </p>
                          <p className="mt-1 text-[11px] font-bold text-emerald-700">
                            {t.admin_reply || TIP_COMPLETED_DEFAULT_MESSAGE}
                            {t.completed_at
                              ? ` • Concluída em ${new Date(
                                t.completed_at
                              ).toLocaleString("pt-BR")}`
                              : ""}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {(() => {
                  const latestCreditError = workspace.posts.find(
                    (p) =>
                      p.status === "ERROR" &&
                      (p.logs_json || []).some((line) =>
                        /cr[ée]dito|faturamento|quota|sem saldo/i.test(line)
                      )
                  );
                  if (!latestCreditError) return null;
                  const errDetail =
                    (latestCreditError.logs_json || []).find((line) =>
                      /cr[ée]dito|faturamento|quota|sem saldo/i.test(line)
                    ) ||
                    "Post não gerado: chave OpenAI/Gemini sem crédito.";
                  return (
                    <div className="rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm font-semibold text-rose-900">
                      <p>
                        <strong>Alerta do Piloto Automático:</strong>{" "}
                        {errDetail}
                      </p>
                      <p className="mt-1 text-xs font-normal text-rose-800">
                        Assunto: <strong>{latestCreditError.topic_title}</strong>{" "}
                        em{" "}
                        {new Date(latestCreditError.created_at).toLocaleString(
                          "pt-BR"
                        )}
                        . Nenhuma outra IA paga foi usada sem sua autorização.{" "}
                        <button
                          type="button"
                          onClick={() => setClientTab("integrations")}
                          className="font-bold underline"
                        >
                          Verificar Integrações e Chaves →
                        </button>
                      </p>
                    </div>
                  );
                })()}

                {metaDaysLeft !== null && metaDaysLeft <= 7 && (
                  <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
                    Alerta de Validade Meta: seu token expira em{" "}
                    {metaDaysLeft} dia(s). Vá em{" "}
                    <button
                      type="button"
                      onClick={() => setClientTab("integrations")}
                      className="underline"
                    >
                      Integrações
                    </button>{" "}
                    para atualizar com um Token Permanente.
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Uso do Plano ({workspace.plan.name})
                    </p>
                    <p className="mt-2 text-2xl font-extrabold text-indigo-600">
                      {workspace.company.posts_used_month} /{" "}
                      {workspace.plan.max_posts_month} posts/mês
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Vence em{" "}
                      {new Date(workspace.company.expires_at).toLocaleDateString(
                        "pt-BR"
                      )}{" "}
                      ({planDaysLeft ?? 0} dias)
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      IAs Conectadas
                    </p>
                    <p className="mt-2 text-lg font-extrabold text-slate-900">
                      {workspace.integrations.has_gemini_key ||
                        workspace.integrations.has_openai_key ||
                        workspace.integrations.has_anthropic_key ? (
                        <span className="text-emerald-600">Chave Ativa</span>
                      ) : (
                        <span className="text-rose-600">Configurar Chave</span>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Gemini:{" "}
                      {workspace.integrations.has_gemini_key ? "OK" : "—"} •
                      GPT: {workspace.integrations.has_openai_key ? "OK" : "—"}{" "}
                      • Claude:{" "}
                      {workspace.integrations.has_anthropic_key ? "OK" : "—"}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                    {(() => {
                      const fbOk = Boolean(
                        workspace.integrations.has_meta_token &&
                          workspace.integrations.fb_page_id
                      );
                      const igOk = Boolean(
                        workspace.integrations.has_meta_token &&
                          workspace.integrations.ig_user_id
                      );
                      const tiktokOk = Boolean(
                        workspace.integrations.has_tiktok_token
                      );
                      const r2Ok = Boolean(
                        (workspace.integrations.has_r2_access_key &&
                          workspace.integrations.r2_bucket_name) ||
                          workspace.integrations.using_global_r2_fallback
                      );
                      return (
                        <>
                          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                            Redes Sociais
                          </p>
                          <p className="mt-2 text-lg font-extrabold">
                            {fbOk || igOk || tiktokOk ? (
                              <span className="text-emerald-600">
                                Conectado
                              </span>
                            ) : (
                              <span className="text-amber-600">Pendente</span>
                            )}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Facebook: {fbOk ? "OK" : "—"} • Instagram:{" "}
                            {igOk ? "OK" : "—"} • TikTok:{" "}
                            {tiktokOk ? "OK" : "—"} • R2:{" "}
                            {r2Ok ? "Conectado" : "Pendente"}
                          </p>
                        </>
                      );
                    })()}
                  </div>

                  <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                    {(() => {
                      const totalTopics = workspace.topics.length;
                      const activeTopicsCount = workspace.topics.filter(
                        (t) => t.is_active
                      ).length;
                      const pausedTopicsCount = totalTopics - activeTopicsCount;
                      return (
                        <>
                          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                            Assuntos / Temas
                          </p>
                          <p className="mt-2 text-2xl font-extrabold text-cyan-600">
                            {totalTopics} {totalTopics === 1 ? "tema" : "temas"}
                          </p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">
                              {activeTopicsCount}{" "}
                              {activeTopicsCount === 1 ? "ativo" : "ativos"}
                            </span>
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
                              {pausedTopicsCount}{" "}
                              {pausedTopicsCount === 1 ? "pausado" : "pausados"}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setClientTab("studio")}
                            className="mt-2 text-xs font-bold text-indigo-600 hover:underline"
                          >
                            Abrir Estúdio Manual →
                          </button>
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* Rascunhos Aguardando Aprovação */}
                {pendingDrafts.length > 0 && (
                  <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-6">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="text-base font-extrabold text-indigo-950">
                        Rascunhos Aguardando Sua Aprovação ({pendingDrafts.length})
                      </h2>
                      <span className="text-xs font-semibold text-indigo-700">
                        Clique na imagem ou em &quot;Visualizar &amp; Editar&quot; para abrir, ampliar e ajustar textos antes de publicar
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                      {pendingDrafts.map((d) => (
                        <div
                          key={d.id}
                          className="flex flex-col gap-3 rounded-2xl border border-white bg-white p-4 shadow-sm transition hover:border-indigo-300"
                        >
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => handleOpenDraftInStudio(d)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                handleOpenDraftInStudio(d);
                              }
                            }}
                            className="flex cursor-pointer gap-4 text-left group"
                            title="Clique para visualizar todas as artes e editar textos no Estúdio"
                          >
                            {d.image_urls_json[0] && (
                              <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-slate-200">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={d.image_urls_json[0]}
                                  alt={d.headline}
                                  className="h-full w-full object-cover transition group-hover:scale-105"
                                />
                                <button
                                  type="button"
                                  disabled={Boolean(downloadingKey)}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleDownloadMedia(
                                      `draft-${d.id}`,
                                      d.image_urls_json,
                                      buildDownloadBaseName(
                                        "pilotflow-rascunho",
                                        d.headline
                                      )
                                    );
                                  }}
                                  onKeyDown={(e) => e.stopPropagation()}
                                  title={
                                    d.image_urls_json.length > 1
                                      ? `Baixar todos os ${d.image_urls_json.length} slides`
                                      : "Baixar imagem"
                                  }
                                  aria-label={
                                    d.image_urls_json.length > 1
                                      ? `Baixar todos os ${d.image_urls_json.length} slides`
                                      : "Baixar imagem"
                                  }
                                  className="absolute right-1 top-1 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900/80 text-white shadow-md transition hover:bg-indigo-600 disabled:opacity-50"
                                >
                                  <DownloadIcon className="h-3.5 w-3.5" />
                                </button>
                                <span className="absolute bottom-1 right-1 rounded bg-slate-900/80 px-1.5 py-0.5 text-[9px] font-bold text-white">
                                  {d.image_urls_json.length > 1
                                    ? `${d.image_urls_json.length} slides`
                                    : "Ampliar"}
                                </span>
                              </div>
                            )}
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                                  {d.format === "CAROUSEL"
                                    ? `Carrossel (${d.slides_count}x)`
                                    : "Imagem Única"}{" "}
                                  • {d.aspect_ratio}
                                </span>
                                <span className="text-[10px] font-semibold text-slate-400">
                                  {new Date(d.created_at).toLocaleString("pt-BR")}
                                </span>
                              </div>
                              <p className="break-words text-sm font-extrabold text-slate-900 group-hover:text-indigo-700">
                                {d.headline}
                              </p>
                              <p className="line-clamp-2 break-words text-xs text-slate-600">
                                {d.content_json.legenda}
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                            <button
                              type="button"
                              onClick={() => handleOpenDraftInStudio(d)}
                              className="rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
                            >
                              Visualizar &amp; Editar
                            </button>
                            <button
                              type="button"
                              disabled={approvingPostId === d.id}
                              onClick={() => handleApproveDraft(d.id)}
                              className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
                            >
                              {approvingPostId === d.id
                                ? "Publicando..."
                                : "Aprovar e Publicar Agora"}
                            </button>
                            <button
                              type="button"
                              disabled={deletingPostId === d.id}
                              onClick={() => handleDeleteDraft(d.id)}
                              className="ml-auto rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                            >
                              {deletingPostId === d.id ? "..." : "Excluir"}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Grade Semanal */}
                <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-extrabold text-slate-900">
                      Grade Semanal de Postagens Automáticas
                    </h2>
                    <button
                      type="button"
                      onClick={() => setClientTab("topics")}
                      className="text-xs font-bold text-indigo-600 hover:underline"
                    >
                      Editar Assuntos &amp; Horários →
                    </button>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
                    {WEEKDAY_LABELS.map((day) => {
                      const daySlots = workspace.topics
                        .filter(
                          (t) =>
                            t.is_active && t.schedule_days.includes(day.value)
                        )
                        .flatMap((t) =>
                          parseScheduleTimesList(
                            t.schedule_time,
                            t.schedule_times
                          ).map((time) => ({ t, time }))
                        )
                        .sort((a, b) => a.time.localeCompare(b.time));
                      return (
                        <div
                          key={day.value}
                          className="rounded-xl border border-slate-200 bg-slate-50/70 p-3"
                        >
                          <p className="text-xs font-extrabold uppercase text-slate-700">
                            {day.full}
                          </p>
                          <div className="mt-2 space-y-1.5">
                            {daySlots.length === 0 ? (
                              <p className="text-[11px] text-slate-400">
                                Sem agendamento
                              </p>
                            ) : (
                              daySlots.map(({ t, time }) => (
                                <div
                                  key={`${day.value}-${t.id}-${time}`}
                                  className="rounded-lg border border-indigo-100 bg-white p-2 text-[11px] shadow-xs"
                                >
                                  <span className="font-bold text-indigo-700">
                                    {time}
                                  </span>{" "}
                                  <span className="font-semibold text-slate-800">
                                    {t.title}
                                  </span>
                                  <p className="mt-0.5 text-[10px] text-slate-500">
                                    {t.post_format === "CAROUSEL"
                                      ? `Carrossel ${t.slides_count}x`
                                      : "Imagem"}{" "}
                                    • {formatTargetsSummary(t.publish_targets)}
                                  </p>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ---------- ABA 2: MEUS ASSUNTOS & PRODUTOS ---------- */}
            {clientTab === "topics" && (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                {/* Lista de assuntos */}
                <div className="space-y-3 lg:col-span-5">
                  {(() => {
                    const activeTopicsTotal = workspace.topics.filter(
                      (t) => t.is_active
                    ).length;
                    const pausedTopicsTotal =
                      workspace.topics.length - activeTopicsTotal;
                    const searchTerm = topicsSearch
                      .trim()
                      .normalize("NFD")
                      .replace(/[\u0300-\u036f]/g, "")
                      .toLowerCase();
                    const hasActiveTopicFilters = Boolean(
                      searchTerm ||
                        topicsStatusFilter !== "ACTIVE" ||
                        topicsFormatFilter !== "ALL" ||
                        topicsDayFilter.length > 0
                    );

                    const filteredTopics = workspace.topics.filter((t) => {
                      if (
                        topicsStatusFilter === "ACTIVE" &&
                        !t.is_active
                      ) {
                        return false;
                      }
                      if (
                        topicsStatusFilter === "PAUSED" &&
                        t.is_active
                      ) {
                        return false;
                      }
                      if (
                        topicsFormatFilter !== "ALL" &&
                        t.post_format !== topicsFormatFilter
                      ) {
                        return false;
                      }
                      if (
                        topicsDayFilter.length > 0 &&
                        !topicsDayFilter.some((day) =>
                          (t.schedule_days || []).includes(day)
                        )
                      ) {
                        return false;
                      }
                      if (searchTerm) {
                        const normalizedTitle = t.title
                          .normalize("NFD")
                          .replace(/[\u0300-\u036f]/g, "")
                          .toLowerCase();
                        if (!normalizedTitle.includes(searchTerm)) return false;
                      }
                      return true;
                    });

                    const visibleTopics = filteredTopics.slice(
                      0,
                      topicsVisibleCount
                    );
                    const remainingTopicsCount = Math.max(
                      0,
                      filteredTopics.length - visibleTopics.length
                    );

                    return (
                      <>
                        <div className="flex items-center justify-between">
                          <h2 className="text-base font-extrabold text-slate-900">
                            Assuntos &amp; Produtos ({workspace.topics.length})
                          </h2>
                          <button
                            type="button"
                            onClick={startNewTopic}
                            className="rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white"
                          >
                            + Novo Assunto
                          </button>
                        </div>

                        {/* Filtros da lista de assuntos */}
                        <div className="space-y-2.5 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs">
                          <input
                            type="text"
                            value={topicsSearch}
                            onChange={(e) => {
                              setTopicsSearch(e.target.value);
                              setTopicsVisibleCount(10);
                            }}
                            placeholder="Buscar assunto por título..."
                            className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs text-slate-800 outline-none focus:border-indigo-500 focus:bg-white"
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <select
                              value={topicsStatusFilter}
                              onChange={(e) => {
                                setTopicsStatusFilter(
                                  e.target.value as "ALL" | "ACTIVE" | "PAUSED"
                                );
                                setTopicsVisibleCount(10);
                              }}
                              className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-2.5 py-2 text-xs font-bold text-slate-700 outline-none focus:border-indigo-500"
                            >
                              <option value="ALL">
                                Todos ({workspace.topics.length})
                              </option>
                              <option value="ACTIVE">
                                Ativos ({activeTopicsTotal})
                              </option>
                              <option value="PAUSED">
                                Pausados ({pausedTopicsTotal})
                              </option>
                            </select>
                            <select
                              value={topicsFormatFilter}
                              onChange={(e) => {
                                setTopicsFormatFilter(
                                  e.target.value as "ALL" | "SINGLE" | "CAROUSEL"
                                );
                                setTopicsVisibleCount(10);
                              }}
                              className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-2.5 py-2 text-xs font-bold text-slate-700 outline-none focus:border-indigo-500"
                            >
                              <option value="ALL">Todos os formatos</option>
                              <option value="SINGLE">Imagem Única</option>
                              <option value="CAROUSEL">Carrossel</option>
                            </select>
                          </div>
                          <div>
                            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                              Dia da semana
                            </p>
                            <div className="flex flex-wrap gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setTopicsDayFilter([]);
                                  setTopicsVisibleCount(10);
                                }}
                                className={`rounded-lg px-2 py-1 text-[11px] font-bold transition ${
                                  topicsDayFilter.length === 0
                                    ? "bg-indigo-600 text-white"
                                    : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                                }`}
                              >
                                Todos
                              </button>
                              {WEEKDAY_LABELS.map((d) => {
                                const selected = topicsDayFilter.includes(
                                  d.value
                                );
                                return (
                                  <button
                                    key={d.value}
                                    type="button"
                                    onClick={() => {
                                      setTopicsDayFilter((prev) =>
                                        prev.includes(d.value)
                                          ? prev.filter((x) => x !== d.value)
                                          : [...prev, d.value].sort()
                                      );
                                      setTopicsVisibleCount(10);
                                    }}
                                    className={`rounded-lg px-2 py-1 text-[11px] font-bold transition ${
                                      selected
                                        ? "bg-indigo-600 text-white"
                                        : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                                    }`}
                                  >
                                    {d.short}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                            <span>
                              Mostrando <strong>{visibleTopics.length}</strong> de{" "}
                              <strong>{filteredTopics.length}</strong> assunto(s)
                              (10 por página)
                            </span>
                            {hasActiveTopicFilters && (
                              <button
                                type="button"
                                onClick={() => {
                                  setTopicsSearch("");
                                  setTopicsStatusFilter("ACTIVE");
                                  setTopicsFormatFilter("ALL");
                                  setTopicsDayFilter([]);
                                  setTopicsVisibleCount(10);
                                }}
                                className="font-bold text-indigo-600 hover:underline"
                              >
                                Limpar filtros
                              </button>
                            )}
                          </div>
                        </div>

                        {filteredTopics.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-xs text-slate-500">
                            {workspace.topics.length === 0
                              ? "Nenhum assunto cadastrado ainda."
                              : "Nenhum assunto encontrado com os filtros selecionados."}
                          </div>
                        ) : (
                          visibleTopics.map((t) => {
                            const topicPhotos = workspace.photos.filter(
                              (p) => p.topic_id === t.id
                            );
                            return (
                              <div
                                key={t.id}
                                className={`rounded-2xl border p-4 transition ${
                                  editingTopicId === t.id
                                    ? "border-indigo-500 bg-indigo-50/40 shadow-sm"
                                    : "border-slate-200 bg-white"
                                }`}
                              >
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <h3 className="break-words text-sm font-extrabold text-slate-900">
                                        {t.title}
                                      </h3>
                                      <span
                                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                          t.is_active
                                            ? "bg-emerald-100 text-emerald-700"
                                            : "bg-slate-200 text-slate-600"
                                        }`}
                                      >
                                        {t.is_active ? "Ativo" : "Pausado"}
                                      </span>
                                    </div>
                                    <p className="mt-1 text-xs text-slate-600">
                                      Dias:{" "}
                                      {t.schedule_days
                                        .map(
                                          (d) =>
                                            WEEKDAY_LABELS.find(
                                              (w) => w.value === d
                                            )?.short
                                        )
                                        .join(", ")}{" "}
                                      às{" "}
                                      <strong>
                                        {parseScheduleTimesList(
                                          t.schedule_time,
                                          t.schedule_times
                                        ).join(", ")}
                                      </strong>{" "}
                                      •{" "}
                                      {t.post_format === "CAROUSEL"
                                        ? `Carrossel (${t.slides_count} slides)`
                                        : "Imagem Única"}{" "}
                                      • {formatTargetsSummary(t.publish_targets)}
                                    </p>
                                    <p className="mt-1 text-[11px] text-slate-500">
                                      Modo:{" "}
                                      {t.approval_mode === "DRAFT"
                                        ? "Aprovação Manual"
                                        : "100% Automático"}{" "}
                                      • Fotos na fila: {topicPhotos.length}
                                    </p>
                                  </div>
                                  <div className="flex gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => loadTopicIntoEditor(t)}
                                      className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-indigo-100 hover:text-indigo-700"
                                    >
                                      Editar
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteTopic(t.id)}
                                      className="rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700"
                                    >
                                      Excluir
                                    </button>
                                  </div>
                                </div>

                                {/* Upload rápido de foto do produto para esse assunto */}
                                <div className="mt-3 border-t border-slate-100 pt-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="text-[11px] font-bold text-slate-600">
                                      Fotos do Produto (Fila sem Repetição):
                                    </span>
                                    <label className="cursor-pointer rounded-lg bg-cyan-50 px-2.5 py-1 text-[11px] font-bold text-cyan-800 hover:bg-cyan-100">
                                      {uploadingPhotoTopicId === t.id
                                        ? "Enviando ao R2..."
                                        : "+ Subir Foto Original"}
                                      <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => {
                                          const f = e.target.files?.[0];
                                          if (f)
                                            void handleUploadTopicPhoto(
                                              t.id,
                                              f
                                            );
                                        }}
                                      />
                                    </label>
                                  </div>
                                  {topicPhotos.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {topicPhotos.map((ph) => (
                                        <div
                                          key={ph.id}
                                          className="relative h-14 w-14 overflow-hidden rounded-lg border border-slate-200"
                                        >
                                          {/* eslint-disable-next-line @next/next/no-img-element */}
                                          <img
                                            src={
                                              ph.enhanced_url || ph.original_url
                                            }
                                            alt="Produto"
                                            className="h-full w-full object-cover"
                                          />
                                          <span className="absolute bottom-0 left-0 bg-slate-900/75 px-1 text-[9px] text-white">
                                            {ph.times_used}x
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleDeleteTopicPhoto(ph.id)
                                            }
                                            className="absolute right-0 top-0 bg-rose-600 px-1 text-[9px] font-bold text-white"
                                          >
                                            ×
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}

                        {(remainingTopicsCount > 0 ||
                          topicsVisibleCount > 10) && (
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                            {remainingTopicsCount > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setTopicsVisibleCount((prev) => prev + 10)
                                }
                                className="flex-1 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm hover:opacity-95"
                              >
                                + Carregar mais 10 assuntos (restam{" "}
                                {remainingTopicsCount})
                              </button>
                            )}
                            {topicsVisibleCount > 10 && (
                              <button
                                type="button"
                                onClick={() => setTopicsVisibleCount(10)}
                                className="rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-200"
                              >
                                Mostrar apenas 10
                              </button>
                            )}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>

                {/* Editor de Assunto */}
                <form
                  onSubmit={handleSaveTopic}
                  className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm lg:col-span-7"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-base font-extrabold text-slate-900">
                      {editingTopicId
                        ? "Editar Assunto / Produto"
                        : "Criar Novo Assunto / Produto"}
                    </h2>
                    <select
                      value={topicTemplateId}
                      onChange={(e) => applyNicheTemplate(e.target.value)}
                      className="max-w-full truncate rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-800 outline-none sm:w-auto"
                    >
                      <option value="custom">
                        Carregar Exemplo de Prompt...
                      </option>
                      {NICHE_TOPIC_TEMPLATES.map((tpl) => (
                        <option key={tpl.id} value={tpl.id}>
                          {tpl.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-600">
                        Nome do Assunto / Produto
                      </label>
                      <input
                        value={topicTitle}
                        onChange={(e) => setTopicTitle(e.target.value)}
                        required
                        placeholder="Ex: Calçados Femininos ou Tráfego Pago"
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600">
                        Preço / Condição na Arte (Opcional)
                      </label>
                      <input
                        value={topicPrice}
                        onChange={(e) => setTopicPrice(e.target.value)}
                        placeholder="Ex: 12x de R$149,90 ou A partir de R$99"
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="block text-xs font-bold text-slate-600">
                        Prompt / Briefing e Diferenciais para a IA (Arte e Legenda)
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setShowTopicPromptGuide((prev) => !prev)
                        }
                        className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold text-indigo-700 transition hover:bg-indigo-100"
                      >
                        {showTopicPromptGuide ? "Fechar guia" : "Guia de Prompt"}
                      </button>
                    </div>
                    {showTopicPromptGuide && (
                      <PromptGuidePanel
                        hasExistingText={Boolean(topicPrompt.trim())}
                        onReplace={(tpl) => {
                          setTopicPrompt(tpl);
                          setShowTopicPromptGuide(false);
                        }}
                        onAppend={(tpl) => {
                          setTopicPrompt((prev) =>
                            prev.trim() ? `${prev.trim()}\n\n${tpl}` : tpl
                          );
                          setShowTopicPromptGuide(false);
                        }}
                        onClose={() => setShowTopicPromptGuide(false)}
                      />
                    )}
                    <textarea
                      rows={5}
                      value={topicPrompt}
                      onChange={(e) => setTopicPrompt(e.target.value)}
                      required
                      placeholder="Descreva o produto/serviço, público-alvo, regras e principais diferenciais em tópicos..."
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Dias da Semana e Horário */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
                    <p className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                      Dia e Horas Exclusivos Deste Assunto (Horário de Brasília)
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {WEEKDAY_LABELS.map((d) => {
                        const checked = topicDays.includes(d.value);
                        return (
                          <button
                            key={d.value}
                            type="button"
                            onClick={() =>
                              setTopicDays((prev) =>
                                checked
                                  ? prev.filter((x) => x !== d.value)
                                  : [...prev, d.value].sort()
                              )
                            }
                            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${checked
                                ? "bg-indigo-600 text-white"
                                : "border border-slate-200 bg-white text-slate-600"
                              }`}
                          >
                            {d.short}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-200/80 pt-2.5">
                      <span className="text-[11px] font-bold text-slate-600">
                        Horários por dia:
                      </span>
                      {topicTimes.map((time) => (
                        <span
                          key={time}
                          className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-bold text-indigo-800"
                        >
                          {time}
                          {topicTimes.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                setTopicTimes((prev) =>
                                  prev.filter((t) => t !== time)
                                )
                              }
                              title="Remover horário"
                              className="ml-0.5 text-indigo-500 hover:text-rose-600"
                            >
                              ×
                            </button>
                          )}
                        </span>
                      ))}
                      <select
                        value=""
                        onChange={(e) => {
                          const val = e.target.value;
                          if (!val) return;
                          setTopicTimes((prev) =>
                            Array.from(new Set([...prev, val])).sort()
                          );
                        }}
                        className="ml-auto rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800"
                      >
                        <option value="">+ Adicionar horário</option>
                        {SCHEDULE_TIME_SLOTS.filter(
                          (slot) => !topicTimes.includes(slot)
                        ).map((slot) => (
                          <option key={slot} value={slot}>
                            {slot}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Formato e Automação */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-600">
                        Formato
                      </label>
                      <select
                        value={topicFormat}
                        onChange={(e) =>
                          setTopicFormat(e.target.value as PostFormat)
                        }
                        className="mt-1 w-full rounded-xl border border-slate-200 px-2.5 py-2 text-xs font-bold"
                      >
                        <option value="SINGLE">Imagem Única</option>
                        <option value="CAROUSEL">Carrossel</option>
                      </select>
                    </div>

                    {topicFormat === "CAROUSEL" && (
                      <div>
                        <label className="block text-xs font-bold text-slate-600">
                          Qtd. Slides (2-8)
                        </label>
                        <input
                          type="number"
                          min={2}
                          max={8}
                          value={topicSlides}
                          onChange={(e) =>
                            setTopicSlides(Number(e.target.value))
                          }
                          className="mt-1 w-full rounded-xl border border-slate-200 px-2.5 py-2 text-xs font-bold"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-bold text-slate-600">
                        Automação
                      </label>
                      <select
                        value={topicApproval}
                        onChange={(e) =>
                          setTopicApproval(e.target.value as ApprovalMode)
                        }
                        className="mt-1 w-full rounded-xl border border-slate-200 px-2.5 py-2 text-xs font-bold"
                      >
                        <option value="AUTO">100% Automático</option>
                        <option value="DRAFT">Aprovar Antes (Rascunho)</option>
                      </select>
                    </div>
                  </div>

                  {/* Seletor de Redes Sociais e Posicionamentos */}
                  <PublishTargetsSelector
                    value={topicPublishTargets}
                    onChange={(next) => {
                      setTopicPublishTargets(next);
                      setTopicRatio(deriveRatioFromTargets(next));
                      setTopicPublishToStories(
                        Boolean(next.ig_stories || next.fb_stories)
                      );
                    }}
                    availableNetworks={{
                      instagram: Boolean(
                        workspace.integrations.has_meta_token &&
                        workspace.integrations.ig_user_id
                      ),
                      facebook: Boolean(
                        workspace.integrations.has_meta_token &&
                        workspace.integrations.fb_page_id
                      ),
                      tiktok: Boolean(workspace.integrations.has_tiktok_token),
                    }}
                    onOpenIntegrations={() => setClientTab("integrations")}
                  />

                  {/* Estilo Visual da Arte */}
                  <div className="rounded-xl border border-cyan-200 bg-cyan-50/50 p-4 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="text-xs font-extrabold uppercase tracking-wider text-cyan-900">
                        Estilo Visual Padrão Deste Assunto
                      </label>
                      <select
                        value={topicPhotoMode}
                        onChange={(e) =>
                          setTopicPhotoMode(e.target.value as AIPhotoMode)
                        }
                        className="w-full max-w-full truncate rounded-lg border border-cyan-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800 sm:w-auto"
                      >
                        <option value="RAW_ART">
                          1 - Arte Pronta Enviada (Publicar imagem limpa sem textos)
                        </option>
                        <option value="AI_FULL_CREATIVE">
                          2 - Gerar Imagem 100% por IA via Prompt (Com Fallback Agência)
                        </option>
                        <option value="NONE">
                          3 - Padrão Original do App (Cards Luminosos — Sem Foto)
                        </option>
                      </select>
                    </div>
                    <p className="text-[11px] text-cyan-900/80">
                      O campo <strong>Prompt / Briefing para a IA</strong> acima é usado diretamente para gerar a arte e a legenda. Se houver fotos na fila deste assunto, elas serão usadas como arte pronta (modo 1) ou referência visual para a IA (modo 2).
                    </p>
                    {topicPhotoMode === "AI_FULL_CREATIVE" && (
                      <ImageModelGuide
                        value={topicImageAi}
                        onChange={setTopicImageAi}
                        allowDefault
                      />
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
                      <input
                        type="checkbox"
                        checked={topicActive}
                        onChange={(e) => setTopicActive(e.target.checked)}
                      />
                      Assunto ativo no agendador automático
                    </label>
                    <button
                      type="submit"
                      disabled={savingTopic}
                      className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-3 text-xs font-bold text-white shadow-md"
                    >
                      {savingTopic ? "Salvando..." : "Salvar Assunto"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* ---------- ABA 3: ESTÚDIO MANUAL & PREVIEW EDITÁVEL ---------- */}
            {clientTab === "studio" && (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm lg:col-span-5">
                  <h2 className="text-base font-extrabold text-slate-900">
                    Estúdio de Criação Manual
                  </h2>

                  <div>
                    <label className="block text-xs font-bold text-slate-600">
                      Basear em Assunto Cadastrado ou Prompt Livre
                    </label>
                    <select
                      value={studioTopicId}
                      onChange={(e) => handleSelectStudioTopic(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold outline-none focus:border-indigo-500"
                    >
                      <option value="__free__">
                        Prompt Livre Avulso (Escrever agora)
                      </option>
                      {workspace.topics
                        .filter((t) => t.is_active)
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.title}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="block text-xs font-bold text-slate-600">
                        Prompt para a IA (Arte, Diferenciais e Legenda)
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setShowStudioPromptGuide((prev) => !prev)
                        }
                        className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold text-indigo-700 transition hover:bg-indigo-100"
                      >
                        {showStudioPromptGuide ? "Fechar guia" : "Guia de Prompt"}
                      </button>
                    </div>
                    {showStudioPromptGuide && (
                      <PromptGuidePanel
                        hasExistingText={Boolean(studioPrompt.trim())}
                        onReplace={(tpl) => {
                          setStudioPrompt(tpl);
                          setShowStudioPromptGuide(false);
                        }}
                        onAppend={(tpl) => {
                          setStudioPrompt((prev) =>
                            prev.trim() ? `${prev.trim()}\n\n${tpl}` : tpl
                          );
                          setShowStudioPromptGuide(false);
                        }}
                        onClose={() => setShowStudioPromptGuide(false)}
                      />
                    )}
                    <textarea
                      rows={5}
                      value={studioPrompt}
                      onChange={(e) => setStudioPrompt(e.target.value)}
                      placeholder="Descreva ou cole o prompt completo com oferta, regras e diferenciais para a IA gerar a imagem e a legenda..."
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <input
                      value={studioPrice}
                      onChange={(e) => setStudioPrice(e.target.value)}
                      placeholder="Preço (ex: 12x R$149,90)"
                      className="rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-indigo-500"
                    />
                    <select
                      value={studioFormat}
                      onChange={(e) =>
                        setStudioFormat(e.target.value as PostFormat)
                      }
                      className="rounded-xl border border-slate-200 px-2.5 py-2 text-xs font-bold"
                    >
                      <option value="SINGLE">Imagem Única</option>
                      <option value="CAROUSEL">Carrossel</option>
                    </select>
                    {studioFormat === "CAROUSEL" && (
                      <input
                        type="number"
                        min={2}
                        max={8}
                        value={studioSlides}
                        onChange={(e) =>
                          setStudioSlides(Number(e.target.value))
                        }
                        title="Quantidade de slides (2 a 8)"
                        className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold"
                      />
                    )}
                  </div>

                  {/* Seletor de Redes Sociais e Posicionamentos */}
                  <PublishTargetsSelector
                    value={studioPublishTargets}
                    onChange={(next) => {
                      setStudioPublishTargets(next);
                      setStudioRatio(deriveRatioFromTargets(next));
                      setStudioPublishToStories(
                        Boolean(next.ig_stories || next.fb_stories)
                      );
                    }}
                    availableNetworks={{
                      instagram: Boolean(
                        workspace.integrations.has_meta_token &&
                        workspace.integrations.ig_user_id
                      ),
                      facebook: Boolean(
                        workspace.integrations.has_meta_token &&
                        workspace.integrations.fb_page_id
                      ),
                      tiktok: Boolean(workspace.integrations.has_tiktok_token),
                    }}
                    onOpenIntegrations={() => setClientTab("integrations")}
                  />

                  {/* Modo de Geração + Imagem Opcional (R2) */}
                  <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-700">
                        Modo de Criação da Imagem
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {studioPhotoBase64 && (
                          <button
                            type="button"
                            onClick={() => setStudioPhotoBase64(null)}
                            className="rounded-lg bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-700 hover:bg-rose-100"
                          >
                            Remover Imagem
                          </button>
                        )}
                        <label className="cursor-pointer rounded-lg bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700">
                          Selecionar Imagem
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={async (e) => {
                              const f = e.target.files?.[0];
                              if (!f) return;
                              const { base64, contentType } = await fileToBase64(
                                f
                              );
                              setStudioPhotoBase64(base64);
                              setStudioPhotoType(contentType);
                              if (studioPhotoMode === "NONE") {
                                setStudioPhotoMode("RAW_ART");
                              }
                            }}
                          />
                        </label>
                      </div>
                    </div>
                    {studioPhotoBase64 && (
                      <p className="text-[11px] font-semibold text-emerald-700">
                        Imagem carregada pronta para envio ao R2!
                      </p>
                    )}

                    <select
                      value={studioPhotoMode}
                      onChange={(e) =>
                        setStudioPhotoMode(e.target.value as AIPhotoMode)
                      }
                      className="w-full max-w-full truncate rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold"
                    >
                      <option value="RAW_ART">
                        1 - Arte Pronta Enviada (Publicar imagem limpa sem textos)
                      </option>
                      <option value="AI_FULL_CREATIVE">
                        2 - Gerar Imagem 100% por IA via Prompt (Com Fallback Agência)
                      </option>
                      <option value="NONE">
                        3 - Padrão Original do App (Cards Luminosos — Sem Foto)
                      </option>
                    </select>
                    {studioPhotoMode === "AI_FULL_CREATIVE" && (
                      <ImageModelGuide
                        value={studioImageAi}
                        onChange={setStudioImageAi}
                        allowDefault
                      />
                    )}
                  </div>

                  {studioCreditAlert && (
                    <div className="space-y-2 rounded-xl border border-rose-300 bg-rose-50 p-3.5 text-xs text-rose-900">
                      <p className="font-extrabold">
                        {studioCreditAlert.message}
                      </p>
                      <p className="text-[11px] text-rose-800">
                        O sistema não trocou de IA automaticamente para evitar
                        gastos sem sua autorização. Como deseja prosseguir?
                      </p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {studioCreditAlert.alternativeProvider && (
                          <button
                            type="button"
                            disabled={studioAction !== "idle"}
                            onClick={() =>
                              handleRunStudio({
                                ...studioCreditAlert.retryOptions,
                                allowImageFallback: true,
                              })
                            }
                            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-indigo-700"
                          >
                            Autorizar{" "}
                            {studioCreditAlert.alternativeProvider === "OPENAI"
                              ? "OpenAI"
                              : "Google Gemini"}{" "}
                            desta vez
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={studioAction !== "idle"}
                          onClick={() => {
                            setStudioPhotoMode("NONE");
                            void handleRunStudio({
                              ...studioCreditAlert.retryOptions,
                              aiPhotoModeOverride: "NONE",
                            });
                          }}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-800 hover:bg-slate-100"
                        >
                          Usar Cards Originais (Grátis)
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      disabled={studioAction !== "idle" || Boolean(approvingPostId)}
                      onClick={() => handleRunStudio({ previewOnly: true })}
                      className="rounded-xl border border-indigo-200 bg-indigo-50 py-3 text-xs font-extrabold text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
                    >
                      {studioAction === "generating_preview"
                        ? "Gerando Prévia..."
                        : "Gerar Nova Prévia (IA)"}
                    </button>
                    <button
                      type="button"
                      disabled={studioAction !== "idle" || Boolean(approvingPostId)}
                      onClick={() =>
                        studioPreview?.draftPostId
                          ? handleApproveDraft(
                            studioPreview.draftPostId,
                            studioPreview
                          )
                          : handleRunStudio({
                            previewOnly: false,
                            useEditedContent: Boolean(studioPreview),
                          })
                      }
                      className="rounded-xl bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500 py-3 text-xs font-extrabold text-white shadow-md disabled:opacity-60"
                    >
                      {studioAction === "publishing" || Boolean(approvingPostId)
                        ? "Publicando..."
                        : "Aprovar e Publicar Agora"}
                    </button>
                  </div>
                </div>

                {/* Preview Editável + Logs */}
                <div
                  id="studio-preview-section"
                  className="scroll-mt-24 space-y-4 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm lg:col-span-7"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-base font-extrabold text-slate-900">
                      Pré-visualização &amp; Edição Antes de Postar
                    </h2>
                    {studioPreview?.draftPostId && (
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-extrabold text-amber-800">
                        Editando Rascunho Pendente
                      </span>
                    )}
                  </div>

                  {!studioPreview ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-10 text-center text-xs text-slate-500">
                      Clique em <strong>&quot;Gerar Nova Prévia (IA)&quot;</strong>{" "}
                      para visualizar as artes geradas no Cloudflare R2, ou abra
                      um <strong>Rascunho Pendente</strong> no Dashboard para
                      visualizar, editar e aprovar.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3 space-y-2">
                        <div className="flex flex-wrap items-center gap-2 text-[11px]">
                          <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 font-bold text-indigo-800">
                            IA Texto: {studioPreview.providerUsed}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-0.5 font-bold text-cyan-800">
                            IA Imagem: {resolveStudioImageProvider(studioPreview)}
                          </span>
                        </div>
                        {studioPreview.logs && studioPreview.logs.length > 0 && (
                          <details className="text-[11px] text-slate-600">
                            <summary className="cursor-pointer font-semibold text-slate-500 hover:text-slate-700">
                              Ver log técnico da geração ({studioPreview.logs.length} etapas)
                            </summary>
                            <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-slate-900 p-2.5 text-[10px] leading-relaxed text-emerald-300">
                              {studioPreview.logs.join("\n")}
                            </pre>
                          </details>
                        )}
                      </div>
                      {(() => {
                        const activeTargets =
                          studioPreview.publishTargets || studioPublishTargets;
                        const hasFeedTarget =
                          activeTargets.ig_feed || activeTargets.fb_feed;
                        const hasVerticalTarget =
                          activeTargets.ig_stories ||
                          activeTargets.fb_stories ||
                          activeTargets.tiktok_feed;
                        const isNativeVerticalOnly =
                          !hasFeedTarget &&
                          studioPreview.aspectRatio === "9:16";
                        const feedUrls = isNativeVerticalOnly
                          ? []
                          : studioPreview.imageUrls || [];
                        const verticalUrls =
                          Array.isArray(studioPreview.storyImageUrls) &&
                            studioPreview.storyImageUrls.length > 0
                            ? studioPreview.storyImageUrls
                            : isNativeVerticalOnly
                              ? studioPreview.imageUrls || []
                              : [];

                        const feedNetworks = [
                          activeTargets.ig_feed ? "Instagram Feed" : null,
                          activeTargets.fb_feed ? "Facebook Feed" : null,
                        ].filter(Boolean);
                        const verticalNetworks = [
                          activeTargets.ig_stories ? "Instagram Story" : null,
                          activeTargets.fb_stories ? "Facebook Story" : null,
                          activeTargets.tiktok_feed
                            ? "TikTok Photo Mode"
                            : null,
                        ].filter(Boolean);

                        return (
                          <div className="space-y-4">
                            {feedUrls.length > 0 && (
                              <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="text-xs font-extrabold text-slate-900">
                                    Prévia Feed • 1080×1080 (1:1)
                                  </span>
                                  <div className="flex items-center gap-2">
                                    {feedUrls.length > 1 && (
                                      <button
                                        type="button"
                                        disabled={Boolean(downloadingKey)}
                                        onClick={() =>
                                          void handleDownloadMedia(
                                            "studio-feed-all",
                                            feedUrls,
                                            buildDownloadBaseName(
                                              "pilotflow-feed",
                                              studioPreview.post.headline_arte
                                            )
                                          )
                                        }
                                        className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[10px] font-bold text-slate-700 shadow-2xs transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-50"
                                        title={`Baixar todos os ${feedUrls.length} slides`}
                                      >
                                        <DownloadIcon className="h-3 w-3" />
                                        {downloadingKey === "studio-feed-all"
                                          ? "Baixando..."
                                          : "Baixar todos"}
                                      </button>
                                    )}
                                    <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-[10px] font-bold text-indigo-800">
                                      {feedNetworks.length > 0
                                        ? feedNetworks.join(" + ")
                                        : "Feed 1:1"}
                                    </span>
                                  </div>
                                </div>
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                  {feedUrls.map((url, idx) => (
                                    <div
                                      key={`feed-${url}-${idx}`}
                                      className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs"
                                    >
                                      <a
                                        href={url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="block"
                                        title="Clique para abrir imagem 1080×1080 em tamanho original"
                                      >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                          src={url}
                                          alt={`Arte Feed ${idx + 1}`}
                                          className="aspect-square w-full object-cover"
                                        />
                                        <span className="absolute bottom-2 right-2 rounded-lg bg-slate-900/80 px-2 py-1 text-[10px] font-bold text-white opacity-90 group-hover:opacity-100">
                                          Slide {idx + 1} (1080×1080) • HD ↗
                                        </span>
                                      </a>
                                      <button
                                        type="button"
                                        disabled={Boolean(downloadingKey)}
                                        onClick={() =>
                                          void handleDownloadMedia(
                                            `studio-feed-${idx}`,
                                            [url],
                                            buildDownloadBaseName(
                                              "pilotflow-feed",
                                              studioPreview.post.headline_arte
                                            ) +
                                            (feedUrls.length > 1
                                              ? `-slide-${idx + 1}`
                                              : "")
                                          )
                                        }
                                        title="Baixar imagem"
                                        aria-label={`Baixar imagem Feed Slide ${idx + 1}`}
                                        className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-slate-900/80 text-white shadow-md backdrop-blur-xs transition hover:bg-indigo-600 disabled:opacity-50"
                                      >
                                        <DownloadIcon className="h-4 w-4" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {hasVerticalTarget && verticalUrls.length > 0 && (
                              <div className="space-y-2 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-3.5">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="text-xs font-extrabold text-indigo-950">
                                    Prévia Stories &amp; TikTok • 1080×1920
                                    (9:16 Vertical)
                                  </span>
                                  <div className="flex items-center gap-2">
                                    {verticalUrls.length > 1 && (
                                      <button
                                        type="button"
                                        disabled={Boolean(downloadingKey)}
                                        onClick={() =>
                                          void handleDownloadMedia(
                                            "studio-vert-all",
                                            verticalUrls,
                                            buildDownloadBaseName(
                                              "pilotflow-story",
                                              studioPreview.post.headline_arte
                                            )
                                          )
                                        }
                                        className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-white px-2.5 py-0.5 text-[10px] font-bold text-indigo-700 shadow-2xs transition hover:bg-indigo-100 disabled:opacity-50"
                                        title={`Baixar todos os ${verticalUrls.length} slides`}
                                      >
                                        <DownloadIcon className="h-3 w-3" />
                                        {downloadingKey === "studio-vert-all"
                                          ? "Baixando..."
                                          : "Baixar todos"}
                                      </button>
                                    )}
                                    <span className="rounded-full bg-indigo-600 px-2.5 py-0.5 text-[10px] font-bold text-white">
                                      {verticalNetworks.join(" + ")}
                                    </span>
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                  {verticalUrls.map((url, idx) => (
                                    <div
                                      key={`vert-${url}-${idx}`}
                                      className="group relative overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-xs"
                                    >
                                      <a
                                        href={url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="block"
                                        title="Clique para abrir imagem 1080×1920 em tamanho original"
                                      >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                          src={url}
                                          alt={`Arte Vertical ${idx + 1}`}
                                          className="aspect-[9/16] w-full object-cover"
                                        />
                                        <span className="absolute bottom-2 right-2 rounded-lg bg-indigo-950/85 px-2 py-1 text-[10px] font-bold text-white opacity-90 group-hover:opacity-100">
                                          Slide {idx + 1} (1080×1920) ↗
                                        </span>
                                      </a>
                                      <button
                                        type="button"
                                        disabled={Boolean(downloadingKey)}
                                        onClick={() =>
                                          void handleDownloadMedia(
                                            `studio-vert-${idx}`,
                                            [url],
                                            buildDownloadBaseName(
                                              "pilotflow-story",
                                              studioPreview.post.headline_arte
                                            ) +
                                            (verticalUrls.length > 1
                                              ? `-slide-${idx + 1}`
                                              : "")
                                          )
                                        }
                                        title="Baixar imagem"
                                        aria-label={`Baixar imagem Vertical Slide ${idx + 1}`}
                                        className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-indigo-950/85 text-white shadow-md backdrop-blur-xs transition hover:bg-indigo-600 disabled:opacity-50"
                                      >
                                        <DownloadIcon className="h-4 w-4" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {hasVerticalTarget &&
                              verticalUrls.length === 0 &&
                              feedUrls.length > 0 && (
                                <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-3.5 text-xs text-indigo-900">
                                  <strong>Stories &amp; TikTok (9:16):</strong>{" "}
                                  Este post antigo foi salvo antes do histórico
                                  de miniaturas verticais. Ao clicar em{" "}
                                  <strong>Atualizar Prévia</strong> ou{" "}
                                  <strong>Publicar</strong>, o sistema gerará
                                  automaticamente as imagens 1080×1920 a partir
                                  do Feed acima.
                                </div>
                              )}
                          </div>
                        );
                      })()}

                      {studioPreview.post.original_photo_url &&
                        studioPreview.post.enhanced_photo_url && (
                          <div className="grid grid-cols-1 gap-3 rounded-xl border border-cyan-200 bg-cyan-50/50 p-3 sm:grid-cols-2">
                            <div>
                              <p className="mb-1 text-[11px] font-bold text-slate-600">
                                Foto Original
                              </p>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={studioPreview.post.original_photo_url}
                                alt="Original"
                                className="h-32 w-full rounded-lg object-cover"
                              />
                            </div>
                            <div>
                              <p className="mb-1 text-[11px] font-bold text-emerald-700">
                                Foto Ambientada pela IA
                              </p>
                              <div className="relative overflow-hidden rounded-lg">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={studioPreview.post.enhanced_photo_url}
                                  alt="Melhorada IA"
                                  className="h-32 w-full object-cover"
                                />
                                <button
                                  type="button"
                                  disabled={Boolean(downloadingKey)}
                                  onClick={() =>
                                    void handleDownloadMedia(
                                      "studio-enhanced",
                                      [studioPreview.post.enhanced_photo_url!],
                                      buildDownloadBaseName(
                                        "pilotflow-foto-ia",
                                        studioPreview.post.headline_arte
                                      )
                                    )
                                  }
                                  title="Baixar foto ambientada pela IA"
                                  aria-label="Baixar foto ambientada pela IA"
                                  className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-slate-900/80 text-white shadow-md transition hover:bg-emerald-600 disabled:opacity-50"
                                >
                                  <DownloadIcon className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                      <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                        <p className="text-xs font-extrabold text-indigo-700">
                          Editar Textos Gerados ({studioPreview.providerUsed})
                        </p>

                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <div>
                            <label className="block text-[11px] font-bold text-slate-600">
                              Badge Superior (Tema Visual)
                            </label>
                            <input
                              value={studioPreview.post.tema_visual}
                              onChange={(e) =>
                                setStudioPreview({
                                  ...studioPreview,
                                  post: {
                                    ...studioPreview.post,
                                    tema_visual: e.target.value,
                                  },
                                })
                              }
                              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-slate-600">
                              Selo de Destaque
                            </label>
                            <input
                              value={studioPreview.post.destaque_selo}
                              onChange={(e) =>
                                setStudioPreview({
                                  ...studioPreview,
                                  post: {
                                    ...studioPreview.post,
                                    destaque_selo: e.target.value,
                                  },
                                })
                              }
                              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-600">
                            {studioPreview.format === "CAROUSEL"
                              ? "Headline da Capa (Slide 1 do Carrossel)"
                              : "Headline Principal da Arte"}
                          </label>
                          <input
                            value={studioPreview.post.headline_arte}
                            onChange={(e) =>
                              setStudioPreview({
                                ...studioPreview,
                                post: {
                                  ...studioPreview.post,
                                  headline_arte: e.target.value,
                                },
                              })
                            }
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-600">
                            {studioPreview.format === "CAROUSEL"
                              ? "Subtítulo da Capa (Slide 1)"
                              : "Subtítulo da Arte"}
                          </label>
                          <input
                            value={studioPreview.post.subtitulo_arte}
                            onChange={(e) =>
                              setStudioPreview({
                                ...studioPreview,
                                post: {
                                  ...studioPreview.post,
                                  subtitulo_arte: e.target.value,
                                },
                              })
                            }
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-600">
                            {studioPreview.format === "CAROUSEL"
                              ? "Caixa de Destaque / Dor vs Solução (Capa Slide 1)"
                              : "Dor vs Solução"}
                          </label>
                          <input
                            value={studioPreview.post.dor_vs_solucao}
                            onChange={(e) =>
                              setStudioPreview({
                                ...studioPreview,
                                post: {
                                  ...studioPreview.post,
                                  dor_vs_solucao: e.target.value,
                                },
                              })
                            }
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-600">
                            Tópicos / Benefícios na Arte (1 por linha — aparece no último slide)
                          </label>
                          <textarea
                            rows={3}
                            value={(studioPreview.post.beneficios || []).join("\n")}
                            onChange={(e) =>
                              setStudioPreview({
                                ...studioPreview,
                                post: {
                                  ...studioPreview.post,
                                  beneficios: e.target.value.split("\n"),
                                },
                              })
                            }
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                          />
                        </div>

                        {studioPreview.format === "CAROUSEL" &&
                          Array.isArray(studioPreview.post.slides) &&
                          studioPreview.post.slides.some((_, idx) => idx >= 1) && (
                            <div className="space-y-2 rounded-xl border border-indigo-100 bg-white p-3">
                              <p className="text-[11px] font-extrabold text-indigo-800">
                                Textos dos Slides Seguintes (Slide 2 em diante)
                              </p>
                              {studioPreview.post.slides.map((sl, sIdx) => {
                                if (sIdx === 0) return null;
                                return (
                                  <div
                                    key={sIdx}
                                    className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50/70 p-2.5"
                                  >
                                    <p className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-600">
                                      Slide {sIdx + 1}
                                    </p>
                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                      <input
                                        value={sl.badge}
                                        placeholder={`Tag Slide ${sIdx + 1}`}
                                        onChange={(e) => {
                                          const nextSlides = [
                                            ...studioPreview.post.slides,
                                          ];
                                          nextSlides[sIdx] = {
                                            ...sl,
                                            badge: e.target.value,
                                          };
                                          setStudioPreview({
                                            ...studioPreview,
                                            post: {
                                              ...studioPreview.post,
                                              slides: nextSlides,
                                            },
                                          });
                                        }}
                                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold"
                                      />
                                      <input
                                        value={sl.highlight || ""}
                                        placeholder={`Selo Destaque Slide ${sIdx + 1} (opcional)`}
                                        onChange={(e) => {
                                          const nextSlides = [
                                            ...studioPreview.post.slides,
                                          ];
                                          nextSlides[sIdx] = {
                                            ...sl,
                                            highlight: e.target.value,
                                          };
                                          setStudioPreview({
                                            ...studioPreview,
                                            post: {
                                              ...studioPreview.post,
                                              slides: nextSlides,
                                            },
                                          });
                                        }}
                                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold"
                                      />
                                    </div>
                                    <input
                                      value={sl.title}
                                      placeholder={`Título Slide ${sIdx + 1}`}
                                      onChange={(e) => {
                                        const nextSlides = [
                                          ...studioPreview.post.slides,
                                        ];
                                        nextSlides[sIdx] = {
                                          ...sl,
                                          title: e.target.value,
                                        };
                                        setStudioPreview({
                                          ...studioPreview,
                                          post: {
                                            ...studioPreview.post,
                                            slides: nextSlides,
                                          },
                                        });
                                      }}
                                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold"
                                    />
                                    <textarea
                                      rows={2}
                                      value={sl.body}
                                      placeholder={`Texto Slide ${sIdx + 1}`}
                                      onChange={(e) => {
                                        const nextSlides = [
                                          ...studioPreview.post.slides,
                                        ];
                                        nextSlides[sIdx] = {
                                          ...sl,
                                          body: e.target.value,
                                        };
                                        setStudioPreview({
                                          ...studioPreview,
                                          post: {
                                            ...studioPreview.post,
                                            slides: nextSlides,
                                          },
                                        });
                                      }}
                                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px]"
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          )}

                        <div>
                          <label className="block text-[11px] font-bold text-slate-600">
                            Legenda do Post (Instagram &amp; Facebook)
                          </label>
                          <textarea
                            rows={4}
                            value={studioPreview.post.legenda}
                            onChange={(e) =>
                              setStudioPreview({
                                ...studioPreview,
                                post: {
                                  ...studioPreview.post,
                                  legenda: e.target.value,
                                },
                              })
                            }
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-600">
                            Hashtags
                          </label>
                          <input
                            value={studioPreview.post.hashtags || ""}
                            onChange={(e) =>
                              setStudioPreview({
                                ...studioPreview,
                                post: {
                                  ...studioPreview.post,
                                  hashtags: e.target.value,
                                },
                              })
                            }
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                          />
                        </div>

                        <div className="flex flex-wrap gap-2 pt-1">
                          <button
                            type="button"
                            disabled={studioAction !== "idle" || Boolean(approvingPostId)}
                            onClick={handleSaveDraftTextOnly}
                            className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
                          >
                            {studioAction === "saving_draft"
                              ? "Salvando Rascunho..."
                              : "Salvar Rascunho"}
                          </button>

                          <button
                            type="button"
                            disabled={studioAction !== "idle" || Boolean(approvingPostId)}
                            onClick={handleCancelStudioEdit}
                            className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-60"
                          >
                            Cancelar e Voltar
                          </button>

                          {studioPreview.draftPostId && (
                            <button
                              type="button"
                              disabled={
                                deletingPostId === studioPreview.draftPostId ||
                                studioAction !== "idle"
                              }
                              onClick={() =>
                                handleDeleteDraft(studioPreview.draftPostId!)
                              }
                              className="ml-auto rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100"
                            >
                              Excluir Rascunho
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {studioPublishLogs.length > 0 && (
                    <div className="overflow-x-auto break-words rounded-xl bg-slate-900 p-4 font-mono text-[11px] text-slate-200">
                      <p className="mb-1.5 font-bold text-cyan-400">
                        LOGS DE EXECUÇÃO &amp; META API
                      </p>
                      {studioPublishLogs.map((l, i) => (
                        <p key={i} className="break-words leading-relaxed">
                          {l}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ---------- ABA 4: IDENTIDADE VISUAL (BRAND KIT LUMINOSO) ---------- */}
            {clientTab === "brand" && brandForm && (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                <form
                  onSubmit={handleSaveBrand}
                  className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm lg:col-span-7"
                >
                  <h2 className="text-base font-extrabold text-slate-900">
                    Temas Luminosos &amp; Cores da Marca
                  </h2>

                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {LUMINOUS_THEME_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() =>
                          setBrandForm({
                            ...brandForm,
                            theme_preset: preset.id,
                            primary_color: preset.primary_color,
                            secondary_color: preset.secondary_color,
                            accent_color: preset.accent_color,
                            bg_color: preset.bg_color,
                            text_color: preset.text_color,
                          })
                        }
                        className={`rounded-xl border p-3 text-left transition ${brandForm.theme_preset === preset.id
                            ? "border-indigo-500 bg-indigo-50/50"
                            : "border-slate-200 bg-white hover:bg-slate-50"
                          }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-extrabold text-slate-900">
                            {preset.name}
                          </span>
                          <div className="flex gap-1">
                            {[
                              preset.primary_color,
                              preset.secondary_color,
                              preset.accent_color,
                            ].map((hex) => (
                              <span
                                key={hex}
                                className="h-3.5 w-3.5 rounded-full border border-white shadow-xs"
                                style={{ backgroundColor: hex }}
                              />
                            ))}
                          </div>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500">
                          {preset.description}
                        </p>
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                    {(
                      [
                        ["primary_color", "Primária"],
                        ["secondary_color", "Secundária"],
                        ["accent_color", "Selo/Sucesso"],
                        ["bg_color", "Fundo"],
                        ["text_color", "Texto"],
                      ] as Array<[keyof BrandSettings, string]>
                    ).map(([field, label]) => (
                      <div key={field}>
                        <label className="block text-[11px] font-bold text-slate-600">
                          {label}
                        </label>
                        <input
                          type="color"
                          value={String(brandForm[field] || "#4F46E5")}
                          onChange={(e) =>
                            setBrandForm({
                              ...brandForm,
                              theme_preset: "personalizado",
                              [field]: e.target.value,
                            })
                          }
                          className="mt-1 h-10 w-full cursor-pointer rounded-lg border border-slate-200"
                        />
                      </div>
                    ))}
                  </div>

                  {/* Logomarca Oficial da Empresa (PNG Sem Fundo — 2 Versões: Fundo Claro e Fundo Escuro) */}
                  <div className="space-y-3 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="text-xs font-extrabold uppercase tracking-wider text-indigo-950">
                          Logomarca Oficial da Empresa (PNG Sem Fundo)
                        </span>
                        <span
                          className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${brandForm.logo_url || brandForm.logo_dark_url
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-slate-200 text-slate-600"
                            }`}
                        >
                          {brandForm.logo_url && brandForm.logo_dark_url
                            ? "2 Versões Ativas (Claro + Escuro)"
                            : brandForm.logo_url || brandForm.logo_dark_url
                              ? "1 Versão Ativa (+ Contraste Automático)"
                              : "Usando Texto no Rodapé"}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {/* CARD 1: LOGO PARA FUNDO CLARO */}
                      <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-extrabold text-slate-800">
                              1. Logo p/ Fundo Claro
                            </span>
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-600">
                              Letras Escuras
                            </span>
                          </div>
                          <div className="mt-2 flex h-20 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/60 p-2">
                            {brandForm.logo_url ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                src={brandForm.logo_url}
                                alt="Logo Fundo Claro"
                                className="max-h-14 max-w-[190px] object-contain"
                              />
                            ) : (
                              <span className="text-[11px] text-slate-400">
                                Nenhuma logo enviada
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                          <label className="cursor-pointer rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-indigo-700">
                            {uploadingBrandLogo === "light"
                              ? "Enviando..."
                              : brandForm.logo_url
                                ? "Trocar PNG"
                                : "+ Subir PNG (Fundo Claro)"}
                            <input
                              type="file"
                              accept="image/png,image/webp,image/svg+xml"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) void handleUploadBrandLogo(f, "light");
                              }}
                            />
                          </label>
                          {brandForm.logo_url && (
                            <>
                              <a
                                href={brandForm.logo_url}
                                target="_blank"
                                rel="noreferrer"
                                download="logo-fundo-claro.png"
                                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100"
                              >
                                Baixar
                              </a>
                              <button
                                type="button"
                                disabled={
                                  savingBrand || Boolean(uploadingBrandLogo)
                                }
                                onClick={() => handleRemoveBrandLogo("light")}
                                className="ml-auto rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] font-bold text-rose-700 hover:bg-rose-100"
                              >
                                Remover
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* CARD 2: LOGO PARA FUNDO ESCURO */}
                      <div className="flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900 p-3.5 text-white shadow-xs">
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-extrabold text-white">
                              2. Logo p/ Fundo Escuro
                            </span>
                            <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-bold text-cyan-300">
                              Letras Brancas / Claras
                            </span>
                          </div>
                          <div className="mt-2 flex h-20 items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-950/60 p-2">
                            {brandForm.logo_dark_url ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                src={brandForm.logo_dark_url}
                                alt="Logo Fundo Escuro"
                                className="max-h-14 max-w-[190px] object-contain"
                              />
                            ) : brandForm.logo_url ? (
                              <div className="flex flex-col items-center gap-1">
                                <div className="rounded-lg bg-white/95 px-2.5 py-1">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={brandForm.logo_url}
                                    alt="Logo com etiqueta automática"
                                    className="max-h-9 max-w-[150px] object-contain"
                                  />
                                </div>
                                <span className="text-[9px] text-slate-400">
                                  Etiqueta clara automática (ou suba a versão
                                  branca abaixo)
                                </span>
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-500">
                                Nenhuma logo enviada
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                          <label className="cursor-pointer rounded-lg bg-cyan-500 px-2.5 py-1.5 text-[11px] font-bold text-slate-950 hover:bg-cyan-400">
                            {uploadingBrandLogo === "dark"
                              ? "Enviando..."
                              : brandForm.logo_dark_url
                                ? "Trocar PNG"
                                : "+ Subir PNG (Fundo Escuro)"}
                            <input
                              type="file"
                              accept="image/png,image/webp,image/svg+xml"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) void handleUploadBrandLogo(f, "dark");
                              }}
                            />
                          </label>
                          {brandForm.logo_dark_url && (
                            <>
                              <a
                                href={brandForm.logo_dark_url}
                                target="_blank"
                                rel="noreferrer"
                                download="logo-fundo-escuro.png"
                                className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-[11px] font-bold text-slate-200 hover:bg-slate-700"
                              >
                                Baixar
                              </a>
                              <button
                                type="button"
                                disabled={
                                  savingBrand || Boolean(uploadingBrandLogo)
                                }
                                onClick={() => handleRemoveBrandLogo("dark")}
                                className="ml-auto rounded-lg border border-rose-500/40 bg-rose-500/20 px-2 py-1.5 text-[11px] font-bold text-rose-200 hover:bg-rose-500/30"
                              >
                                Remover
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5 rounded-xl border border-indigo-100 bg-white p-3 text-[11px] leading-relaxed text-slate-600">
                      <p className="font-extrabold text-indigo-950">
                        Parâmetros &amp; Tamanhos Recomendados (Site, Posts e
                        Vídeos):
                      </p>
                      <ul className="list-disc space-y-1 pl-4">
                        <li>
                          <strong>Por que 2 versões separadas?</strong> O
                          cliente cria e sobe a versão normal (para artes claras)
                          e a versão com escrita branca/clara (para artes
                          escuras). O sistema mede automaticamente o brilho do
                          canto da arte gerada e escolhe a versão certa!
                        </li>
                        <li>
                          <strong>Formato obrigatório:</strong>{" "}
                          <code>PNG sem fundo (transparente)</code> ou{" "}
                          <code>WebP transparente</code> • Peso máximo:{" "}
                          <strong>2 MB</strong>.
                        </li>
                        <li>
                          <strong>
                            Logo Horizontal / Retangular (ideal p/ rodapé de
                            posts e vídeos):
                          </strong>{" "}
                          recomendado <strong>600×200 px</strong> (mínimo{" "}
                          <strong>250×100 px</strong> • máximo{" "}
                          <strong>1200×400 px</strong>).
                        </li>
                        <li>
                          <strong>Logo Quadrada / Ícone + Nome:</strong>{" "}
                          recomendado <strong>512×512 px</strong> (mínimo{" "}
                          <strong>250×250 px</strong> • máximo{" "}
                          <strong>1080×1080 px</strong>).
                        </li>
                        <li>
                          <strong>
                            Zona Reservada Anti-Sobreposição na IA:
                          </strong>{" "}
                          a IA fica proibida de colocar qualquer escrita, botão
                          ou logo inventada no{" "}
                          <strong>canto inferior esquerdo</strong> (máx.{" "}
                          <code>220×88 px</code>). Se o cliente enviar apenas 1
                          versão e a arte vier da mesma cor, o sistema aplica
                          uma etiqueta de contraste automática para a logo nunca
                          ficar apagada.
                        </li>
                      </ul>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-600">
                        Nome da Empresa / Assinatura (Usado nas legendas e
                        quando sem logo PNG)
                      </label>
                      <input
                        value={brandForm.footer_name}
                        onChange={(e) =>
                          setBrandForm({
                            ...brandForm,
                            footer_name: e.target.value,
                          })
                        }
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600">
                        CTA Padrão do Botão
                      </label>
                      <input
                        value={brandForm.cta_default}
                        onChange={(e) =>
                          setBrandForm({
                            ...brandForm,
                            cta_default: e.target.value,
                          })
                        }
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <input
                    value={brandForm.subtitle_default}
                    onChange={(e) =>
                      setBrandForm({
                        ...brandForm,
                        subtitle_default: e.target.value,
                      })
                    }
                    placeholder="Subtítulo no rodapé (ex: Enviamos para todo o Brasil)"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  />

                  <button
                    type="submit"
                    disabled={savingBrand}
                    className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-3 text-xs font-bold text-white shadow-md"
                  >
                    {savingBrand ? "Salvando..." : "Salvar Identidade Visual"}
                  </button>
                </form>

                {/* Preview ao vivo da identidade */}
                <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm lg:col-span-5">
                  <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                    Prévia ao Vivo das Cores Luminosas
                  </p>
                  <div
                    className="mt-4 flex aspect-square flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 p-3.5 shadow-inner sm:p-5"
                    style={{
                      backgroundColor: brandForm.bg_color,
                      color: brandForm.text_color,
                    }}
                  >
                    <div
                      className="rounded-2xl p-3.5 text-white sm:p-5"
                      style={{
                        backgroundImage: `linear-gradient(135deg, ${brandForm.primary_color} 0%, ${brandForm.secondary_color} 100%)`,
                      }}
                    >
                      <span
                        className="inline-block rounded-full px-3 py-1 text-[10px] font-extrabold uppercase"
                        style={{ backgroundColor: brandForm.accent_color }}
                      >
                        OFERTA EM DESTAQUE
                      </span>
                      <p className="mt-2.5 text-base font-extrabold leading-tight sm:mt-3 sm:text-xl">
                        Sua Headline Publicitária Aparece Aqui
                      </p>
                      <p className="mt-1 text-xs opacity-90">
                        Design moderno e luminoso gerado sob medida.
                      </p>
                    </div>

                    <div className="rounded-xl border border-slate-200/70 bg-white p-3 text-xs shadow-xs sm:p-4">
                      <p className="font-bold">Diferenciais da sua empresa</p>
                      <p className="mt-1 text-slate-500">
                        Cards luminosos com ícones nítidos e foto do produto.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-white p-3 shadow-xs sm:p-3.5">
                      <div className="flex items-center gap-2.5">
                        {brandForm.logo_url ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={brandForm.logo_url}
                            alt={brandForm.footer_name}
                            className="h-9 max-w-[140px] object-contain"
                          />
                        ) : (
                          <div>
                            <p className="text-xs font-extrabold">
                              {brandForm.footer_name}
                            </p>
                            <p className="text-[10px] text-slate-500">
                              {brandForm.subtitle_default}
                            </p>
                          </div>
                        )}
                      </div>
                      <span
                        className="rounded-lg px-3 py-1.5 text-[10px] font-extrabold text-white"
                        style={{
                          backgroundImage: `linear-gradient(135deg, ${brandForm.primary_color} 0%, ${brandForm.secondary_color} 100%)`,
                        }}
                      >
                        {brandForm.cta_default}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ---------- ABA 5: INTEGRAÇÕES (MULTI-IA + META + TIKTOK) ---------- */}
            {clientTab === "integrations" && (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                <form
                  onSubmit={handleSaveIntegrations}
                  className="space-y-5 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm lg:col-span-7"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-base font-extrabold text-slate-900">
                      Chaves Próprias da Empresa (Criptografia AES-256)
                    </h2>
                    <button
                      type="button"
                      disabled={testingInteg}
                      onClick={handleTestIntegrations}
                      className="rounded-xl border border-cyan-200 bg-cyan-50 px-3.5 py-2 text-xs font-bold text-cyan-800 hover:bg-cyan-100"
                    >
                      {testingInteg ? "Testando..." : "Testar Conexões"}
                    </button>
                  </div>

                  {integTestReport && (() => {
                    const testRows = buildIntegTestRows(integTestReport);
                    const okCount = testRows.filter(
                      (r) => r.status === "ok"
                    ).length;
                    const errCount = testRows.filter(
                      (r) => r.status === "error"
                    ).length;
                    const unconfiguredCount = testRows.filter(
                      (r) => r.status === "unconfigured"
                    ).length;

                    return (
                      <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-extrabold text-slate-900">
                              Resultado do Teste de Conexões
                            </span>
                            <span className="rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                              {okCount} OK
                            </span>
                            {errCount > 0 && (
                              <span className="rounded-full border border-rose-200 bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-800">
                                {errCount} Erro
                              </span>
                            )}
                            {unconfiguredCount > 0 && (
                              <span className="rounded-full border border-slate-300/70 bg-slate-200/80 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                                {unconfiguredCount} Não configurada
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => setIntegTestReport(null)}
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-100"
                          >
                            Fechar
                          </button>
                        </div>

                        <div className="space-y-2">
                          {testRows.map((row) => (
                            <div
                              key={row.key}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                                      row.status === "ok"
                                        ? "bg-emerald-500"
                                        : row.status === "error"
                                        ? "bg-rose-500"
                                        : "bg-slate-400"
                                    }`}
                                  />
                                  <p className="text-xs font-bold text-slate-900">
                                    {row.label}
                                  </p>
                                </div>
                                <p className="mt-0.5 pl-4.5 text-[11px] leading-snug text-slate-600">
                                  {row.detail}
                                </p>
                              </div>
                              <span
                                className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-extrabold ${
                                  row.status === "ok"
                                    ? "border border-emerald-200 bg-emerald-100 text-emerald-800"
                                    : row.status === "error"
                                    ? "border border-rose-200 bg-rose-100 text-rose-800"
                                    : "border border-slate-300/70 bg-slate-200/80 text-slate-600"
                                }`}
                              >
                                {row.status === "ok"
                                  ? "OK"
                                  : row.status === "error"
                                  ? "Erro"
                                  : "Não configurada"}
                              </span>
                            </div>
                          ))}
                        </div>

                        <details>
                          <summary className="cursor-pointer text-[11px] font-semibold text-slate-500 hover:text-slate-700">
                            Ver detalhes técnicos (JSON)
                          </summary>
                          <pre className="mt-2 overflow-x-auto rounded-xl bg-slate-900 p-3 text-[11px] text-emerald-300">
                            {JSON.stringify(integTestReport, null, 2)}
                          </pre>
                        </details>
                      </div>
                    );
                  })()}

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-600">
                        IA Principal de Texto / Copy
                      </label>
                      <select
                        value={integTextAi}
                        onChange={(e) =>
                          setIntegTextAi(e.target.value as AIProvider)
                        }
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold"
                      >
                        <option value="GEMINI">Google Gemini</option>
                        <option value="CLAUDE">Anthropic Claude</option>
                        <option value="OPENAI">OpenAI (ChatGPT)</option>
                      </select>
                    </div>
                    <div>
                      <ImageModelGuide
                        value={integImageAi}
                        onChange={(val) =>
                          setIntegImageAi((val || "GEMINI") as ImageAIProvider)
                        }
                        allowDefault={false}
                        label="IA de Imagem Padrão da Empresa"
                      />
                    </div>
                  </div>

                  <label className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-xs text-slate-800">
                    <input
                      type="checkbox"
                      checked={integAllowImageFallback}
                      onChange={(e) =>
                        setIntegAllowImageFallback(e.target.checked)
                      }
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600"
                    />
                    <span>
                      <strong>
                        Permitir usar a outra IA automaticamente como backup no
                        cron caso falte crédito
                      </strong>
                      <span className="mt-0.5 block text-[11px] text-slate-600">
                        Desmarcado por padrão: se a IA escolhida ficar sem
                        crédito no piloto automático, o post é pausado e um
                        alerta aparece no Dashboard sem gastar outra IA paga.
                      </span>
                    </span>
                  </label>

                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2">
                    <p className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                      Status e Saldo das IAs
                    </p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 text-xs">
                      <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <p className="font-bold text-slate-800">
                          OpenAI (ChatGPT / gpt-image)
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-600">
                          Chave:{" "}
                          <strong
                            className={
                              workspace.integrations.has_openai_key
                                ? "text-emerald-700"
                                : "text-slate-500"
                            }
                          >
                            {workspace.integrations.has_openai_key
                              ? `Configurada (${workspace.integrations.openai_key_mask})`
                              : "Não configurada"}
                          </strong>
                        </p>
                        <a
                          href="https://platform.openai.com/settings/organization/billing"
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1.5 inline-block text-[11px] font-bold text-indigo-600 underline"
                        >
                          Ver saldo em US$ no painel OpenAI →
                        </a>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <p className="font-bold text-slate-800">
                          Google Gemini
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-600">
                          Chave:{" "}
                          <strong
                            className={
                              workspace.integrations.has_gemini_key
                                ? "text-emerald-700"
                                : "text-slate-500"
                            }
                          >
                            {workspace.integrations.has_gemini_key
                              ? `Configurada (${workspace.integrations.gemini_key_mask})`
                              : "Não configurada"}
                          </strong>
                        </p>
                        <a
                          href="https://aistudio.google.com/"
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1.5 inline-block text-[11px] font-bold text-indigo-600 underline"
                        >
                          Ver faturamento no Google AI Studio →
                        </a>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <p className="font-bold text-slate-800">
                          Anthropic Claude (Texto/Copy)
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-600">
                          Chave:{" "}
                          <strong
                            className={
                              workspace.integrations.has_anthropic_key
                                ? "text-emerald-700"
                                : "text-slate-500"
                            }
                          >
                            {workspace.integrations.has_anthropic_key
                              ? `Configurada (${workspace.integrations.anthropic_key_mask})`
                              : "Não configurada"}
                          </strong>
                        </p>
                        <a
                          href="https://console.anthropic.com/settings/billing"
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1.5 inline-block text-[11px] font-bold text-indigo-600 underline"
                        >
                          Ver saldo em US$ na Anthropic →
                        </a>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Nota: por segurança das plataformas, chaves de API comuns (
                      <code>sk-proj-...</code> e <code>AIza...</code>) não
                      liberam consulta automática do saldo em dólares — o painel
                      avisa imediatamente sempre que alguma chamada retornar
                      falta de crédito.
                    </p>
                  </div>

                  <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                    <p className="text-xs font-extrabold uppercase tracking-wider text-indigo-700">
                      Provedores de Inteligência Artificial (BYOK)
                    </p>
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="block text-xs font-bold text-slate-700">
                          GEMINI_API_KEY{" "}
                          {workspace.integrations.has_gemini_key && (
                            <span className="ml-1 font-mono text-emerald-700">
                              (Salva: {workspace.integrations.gemini_key_mask})
                            </span>
                          )}
                        </label>
                        {workspace.integrations.has_gemini_key && (
                          <button
                            type="button"
                            disabled={savingInteg}
                            onClick={() => void handleRemoveAiKey("GEMINI")}
                            className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                          >
                            Remover chave
                          </button>
                        )}
                      </div>
                      <input
                        type="password"
                        value={integGeminiKey}
                        onChange={(e) => setIntegGeminiKey(e.target.value)}
                        placeholder="Cole para cadastrar ou substituir..."
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="block text-xs font-bold text-slate-700">
                          OPENAI_API_KEY (ChatGPT / gpt-image-1){" "}
                          {workspace.integrations.has_openai_key && (
                            <span className="ml-1 font-mono text-emerald-700">
                              (Salva: {workspace.integrations.openai_key_mask})
                            </span>
                          )}
                        </label>
                        {workspace.integrations.has_openai_key && (
                          <button
                            type="button"
                            disabled={savingInteg}
                            onClick={() => void handleRemoveAiKey("OPENAI")}
                            className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                          >
                            Remover chave
                          </button>
                        )}
                      </div>
                      <input
                        type="password"
                        value={integOpenAiKey}
                        onChange={(e) => setIntegOpenAiKey(e.target.value)}
                        placeholder="sk-..."
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="block text-xs font-bold text-slate-700">
                          ANTHROPIC_API_KEY (Claude){" "}
                          {workspace.integrations.has_anthropic_key && (
                            <span className="ml-1 font-mono text-emerald-700">
                              (Salva: {workspace.integrations.anthropic_key_mask})
                            </span>
                          )}
                        </label>
                        {workspace.integrations.has_anthropic_key && (
                          <button
                            type="button"
                            disabled={savingInteg}
                            onClick={() => void handleRemoveAiKey("CLAUDE")}
                            className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                          >
                            Remover chave
                          </button>
                        )}
                      </div>
                      <input
                        type="password"
                        value={integAnthropicKey}
                        onChange={(e) => setIntegAnthropicKey(e.target.value)}
                        placeholder="sk-ant-..."
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                      />
                    </div>
                  </div>

                  <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                    <p className="text-xs font-extrabold uppercase tracking-wider text-indigo-700">
                      Meta Graph API (Instagram Business &amp; Página Facebook)
                    </p>
                    <div>
                      <label className="block text-xs font-bold text-slate-700">
                        META_ACCESS_TOKEN{" "}
                        {workspace.integrations.has_meta_token && (
                          <span className="ml-1 font-mono text-emerald-700">
                            (Salvo: {workspace.integrations.meta_token_mask})
                          </span>
                        )}
                      </label>
                      <input
                        type="password"
                        value={integMetaToken}
                        onChange={(e) => setIntegMetaToken(e.target.value)}
                        placeholder="EAA..."
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <input
                        value={integIgUserId}
                        onChange={(e) => setIntegIgUserId(e.target.value)}
                        placeholder="IG_USER_ID"
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                      />
                      <input
                        value={integFbPageId}
                        onChange={(e) => setIntegFbPageId(e.target.value)}
                        placeholder="FB_PAGE_ID"
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                      />
                    </div>
                  </div>

                  {/* Cloudflare R2 Storage */}
                  <div className="space-y-3 rounded-xl border border-cyan-200 bg-cyan-50/40 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-extrabold uppercase tracking-wider text-cyan-900">
                        Cloudflare R2 Storage (Hospedagem de Mídias)
                      </p>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${workspace.integrations.has_r2_access_key &&
                            workspace.integrations.r2_bucket_name
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-slate-200 text-slate-700"
                          }`}
                      >
                        {workspace.integrations.has_r2_access_key &&
                          workspace.integrations.r2_bucket_name
                          ? "R2 Próprio Conectado"
                          : workspace.integrations.using_global_r2_fallback
                            ? "Usando R2 Padrão do Servidor"
                            : "Não Configurado"}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <input
                        value={integR2AccountId}
                        onChange={(e) => setIntegR2AccountId(e.target.value)}
                        placeholder="R2_ACCOUNT_ID"
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                      />
                      <input
                        value={integR2Bucket}
                        onChange={(e) => setIntegR2Bucket(e.target.value)}
                        placeholder="R2_BUCKET_NAME (ex: minha-loja-media)"
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                      />
                    </div>
                    <input
                      value={integR2PublicUrl}
                      onChange={(e) => setIntegR2PublicUrl(e.target.value)}
                      placeholder="R2_PUBLIC_URL (ex: https://pub-xxxx.r2.dev)"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                    />
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700">
                          R2_ACCESS_KEY_ID{" "}
                          {workspace.integrations.has_r2_access_key && (
                            <span className="font-mono text-emerald-700">
                              ({workspace.integrations.r2_access_key_mask})
                            </span>
                          )}
                        </label>
                        <input
                          type="password"
                          value={integR2AccessKey}
                          onChange={(e) => setIntegR2AccessKey(e.target.value)}
                          placeholder="Cole p/ salvar ou substituir..."
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700">
                          R2_SECRET_ACCESS_KEY{" "}
                          {workspace.integrations.has_r2_secret_key && (
                            <span className="font-mono text-emerald-700">
                              ({workspace.integrations.r2_secret_key_mask})
                            </span>
                          )}
                        </label>
                        <input
                          type="password"
                          value={integR2SecretKey}
                          onChange={(e) => setIntegR2SecretKey(e.target.value)}
                          placeholder="Cole p/ salvar ou substituir..."
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                        />
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Se o cliente deixar em branco, o sistema usa automaticamente
                      o bucket padrão da agência.
                    </p>
                  </div>

                  <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                          TikTok Photo &amp; Content API v2
                        </span>
                        <span
                          className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${workspace.integrations.has_tiktok_token
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-slate-200 text-slate-600"
                            }`}
                        >
                          {workspace.integrations.has_tiktok_token
                            ? `Ativo • Conectado (${workspace.integrations.tiktok_open_id
                              ? workspace.integrations.tiktok_open_id.slice(
                                0,
                                10
                              ) + "..."
                              : "Token ativo"
                            })`
                            : "Desconectado"}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={`/api/tiktok/auth?companyId=${encodeURIComponent(
                          workspace.company.id
                        )}`}
                        className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm hover:bg-slate-800"
                      >
                        {workspace.integrations.has_tiktok_token
                          ? "Reconectar Conta TikTok (1 Clique)"
                          : "Conectar Conta TikTok (1 Clique)"}
                      </a>
                      <span className="text-[11px] text-slate-500">
                        O cliente autoriza direto no TikTok dele e o token é
                        renovado automaticamente.
                      </span>
                    </div>

                    <details className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
                      <summary className="cursor-pointer text-[11px] font-bold text-slate-600">
                        Configuração manual avançada (opcional)
                      </summary>
                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <input
                          value={integTiktokOpenId}
                          onChange={(e) => setIntegTiktokOpenId(e.target.value)}
                          placeholder="TikTok Open ID"
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                        />
                        <input
                          type="password"
                          value={integTiktokToken}
                          onChange={(e) => setIntegTiktokToken(e.target.value)}
                          placeholder="TikTok Access Token"
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                        />
                      </div>
                    </details>
                  </div>

                  <button
                    type="submit"
                    disabled={savingInteg}
                    className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 py-3 text-xs font-bold text-white shadow-md"
                  >
                    {savingInteg
                      ? "Criptografando e Salvando..."
                      : "Salvar Credenciais com Criptografia AES-256"}
                  </button>
                </form>

                {/* Tutorial Guiado para o Cliente */}
                <div className="space-y-4 overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6 lg:col-span-5">
                  <h2 className="text-base font-extrabold text-slate-900">
                    Tutorial Rápido — Passo a Passo de Cada Campo
                  </h2>
                  <div className="space-y-3 break-words text-xs leading-relaxed text-slate-600">
                    <div className="rounded-xl bg-slate-50 p-3.5">
                      <p className="font-extrabold text-indigo-700">
                        1. Google Gemini (GEMINI_API_KEY)
                      </p>
                      <ol className="mt-1.5 list-decimal space-y-1 pl-4">
                        <li>
                          Acesse{" "}
                          <a
                            href="https://aistudio.google.com/"
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold text-indigo-600 underline"
                          >
                            aistudio.google.com
                          </a>{" "}
                          e faça login com sua conta Google.
                        </li>
                        <li>
                          No menu lateral, clique em <strong>Get API key</strong>{" "}
                          → <strong>Create API key</strong>.
                        </li>
                        <li>
                          Copie a chave (começa com <code>AIza...</code> ou{" "}
                          <code>AQ...</code>) e cole em{" "}
                          <code>GEMINI_API_KEY</code>.
                        </li>
                        <li>
                          <strong>Grátis para textos e legendas.</strong> Para
                          gerar imagens com Gemini, ative o faturamento (Billing)
                          no projeto Google Cloud.
                        </li>
                      </ol>
                    </div>

                    <div className="rounded-xl bg-slate-50 p-3.5">
                      <p className="font-extrabold text-indigo-700">
                        2. OpenAI — ChatGPT e Imagens (OPENAI_API_KEY)
                      </p>
                      <ol className="mt-1.5 list-decimal space-y-1 pl-4">
                        <li>
                          Acesse{" "}
                          <a
                            href="https://platform.openai.com/settings/organization/billing"
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold text-indigo-600 underline"
                          >
                            platform.openai.com
                          </a>{" "}
                          e entre na sua conta.
                        </li>
                        <li>
                          Em <strong>Settings → Billing</strong>, adicione um
                          saldo pré-pago (mínimo US$ 5) para liberar a geração
                          de imagens (<code>gpt-image-1.5</code> e{" "}
                          <code>gpt-image-1-mini</code>).
                        </li>
                        <li>
                          Vá em <strong>API Keys → Create new secret key</strong>
                          , dê um nome e copie a chave (<code>sk-proj-...</code>
                          ).
                        </li>
                        <li>
                          Cole no campo <code>OPENAI_API_KEY</code> e salve.
                        </li>
                      </ol>
                    </div>

                    <div className="rounded-xl bg-slate-50 p-3.5">
                      <p className="font-extrabold text-indigo-700">
                        3. Anthropic Claude (ANTHROPIC_API_KEY — Opcional)
                      </p>
                      <ol className="mt-1.5 list-decimal space-y-1 pl-4">
                        <li>
                          Acesse{" "}
                          <a
                            href="https://console.anthropic.com/"
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold text-indigo-600 underline"
                          >
                            console.anthropic.com
                          </a>{" "}
                          (usado apenas caso escolha Claude como IA de texto).
                        </li>
                        <li>
                          Adicione créditos em <strong>Billing</strong> e gere a
                          chave em <strong>API Keys</strong> (<code>sk-ant-...</code>
                          ).
                        </li>
                      </ol>
                    </div>

                    <div className="rounded-xl bg-slate-50 p-3.5">
                      <p className="font-extrabold text-indigo-700">
                        4. Meta Graph API (Token, IG_USER_ID e FB_PAGE_ID)
                      </p>
                      <ol className="mt-1.5 list-decimal space-y-1 pl-4">
                        <li>
                          Garanta que seu Instagram seja{" "}
                          <strong>Conta Profissional (Comercial/Criador)</strong>{" "}
                          e esteja vinculado à sua <strong>Página do Facebook</strong>.
                        </li>
                        <li>
                          No{" "}
                          <a
                            href="https://business.facebook.com/settings/system-users"
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold text-indigo-600 underline"
                          >
                            Meta Business Manager → Usuários do Sistema
                          </a>
                          , crie um usuário Admin, vincule a Página e a conta do
                          Instagram e clique em <strong>Gerar novo token</strong>{" "}
                          (sem expiração) marcando:{" "}
                          <code>
                            instagram_basic, instagram_content_publish,
                            pages_show_list, pages_read_engagement,
                            pages_manage_posts
                          </code>
                          . Cole em <code>META_ACCESS_TOKEN</code>.
                        </li>
                        <li>
                          <strong>FB_PAGE_ID (2º campo à direita):</strong> abra
                          sua Página no Facebook →{" "}
                          <em>Sobre → Transparência da Página</em> (ou no Graph
                          API Explorer rode <code>/me/accounts</code>) e copie o ID
                          numérico.
                        </li>
                        <li>
                          <strong>IG_USER_ID (1º campo à esquerda):</strong> no{" "}
                          <a
                            href="https://developers.facebook.com/tools/explorer/"
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold text-indigo-600 underline"
                          >
                            Graph API Explorer
                          </a>
                          , consulte{" "}
                          <code>
                            /SEU_FB_PAGE_ID?fields=instagram_business_account
                          </code>{" "}
                          e copie o <code>id</code> retornado.
                        </li>
                      </ol>
                    </div>

                    <div className="rounded-xl bg-cyan-50/70 p-3.5">
                      <p className="font-extrabold text-cyan-900">
                        5. Cloudflare R2 Storage (10 GB Grátis/mês)
                      </p>
                      <ol className="mt-1.5 list-decimal space-y-1 pl-4">
                        <li>
                          Acesse{" "}
                          <a
                            href="https://dash.cloudflare.com/"
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold text-cyan-800 underline"
                          >
                            dash.cloudflare.com
                          </a>{" "}
                          → menu <strong>R2 Object Storage</strong>.
                        </li>
                        <li>
                          <strong>R2_ACCOUNT_ID (1º campo):</strong> copie o{" "}
                          <em>Account ID</em> exibido na barra lateral direita do
                          R2.
                        </li>
                        <li>
                          <strong>R2_BUCKET_NAME (2º campo):</strong> clique em{" "}
                          <strong>Create bucket</strong>, dê um nome (ex.:{" "}
                          <code>minha-empresa-media</code>) e cole aqui.
                        </li>
                        <li>
                          <strong>R2_PUBLIC_URL (3º campo):</strong> dentro do
                          bucket, vá em <strong>Settings → Public Development URL</strong>
                          , clique em <strong>Enable</strong> e cole a URL (
                          <code>https://pub-xxxx.r2.dev</code>).
                        </li>
                        <li>
                          <strong>R2_ACCESS_KEY_ID e R2_SECRET_ACCESS_KEY:</strong>{" "}
                          na tela inicial do R2 clique em{" "}
                          <strong>Manage R2 API Tokens → Create API Token</strong>{" "}
                          com permissão <strong>Object Read &amp; Write</strong> e
                          cole as duas chaves geradas.
                        </li>
                      </ol>
                      <p className="mt-1.5 text-[11px] text-cyan-900/80">
                        * Se o cliente deixar o R2 em branco, o sistema usa
                        automaticamente o bucket padrão da agência.
                      </p>
                    </div>

                    <div className="rounded-xl bg-slate-100/80 p-3.5">
                      <p className="font-extrabold text-slate-900">
                        6. TikTok Photo &amp; Content API v2 (Conexão em 1 Clique)
                      </p>
                      <ol className="mt-1.5 list-decimal space-y-1 pl-4">
                        <li>
                          No card do TikTok ao lado, clique em{" "}
                          <strong>Conectar Conta TikTok (1 Clique)</strong>.
                        </li>
                        <li>
                          Faça login na sua conta do TikTok e clique em{" "}
                          <strong>Autorizar</strong> para liberar as permissões{" "}
                          <code>user.info.basic</code> e{" "}
                          <code>video.publish</code>.
                        </li>
                        <li>
                          Você voltará automaticamente para esta tela com o
                          status <strong>Ativo • Conectado</strong> e o TikTok
                          aparecerá liberado em{" "}
                          <strong>Redes Sociais &amp; Locais de Publicação</strong>.
                        </li>
                        <li>
                          <strong>Renovação automática:</strong> o sistema
                          renova o token sozinho antes de vencer as 24h, sem
                          precisar reconectar todo dia.
                        </li>
                        <li>
                          <strong>Configuração manual avançada (opcional):</strong>{" "}
                          só preencha <code>TikTok Open ID</code> e{" "}
                          <code>TikTok Access Token</code> manualmente se você
                          gerou um token de teste próprio via API/Sandbox.
                        </li>
                      </ol>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ---------- ABA 6: HISTÓRICO DE PUBLICAÇÕES ---------- */}
            {clientTab === "history" &&
              (() => {
                const hasActiveFilters = Boolean(
                  historyDateFrom ||
                  historyDateTo ||
                  historySearch.trim() ||
                  historyStatusFilter !== "ALL"
                );
                const query = historySearch.trim().toLowerCase();

                const filteredPosts = workspace.posts.filter((p) => {
                  const localDateStr = new Date(
                    p.created_at
                  ).toLocaleDateString("sv-SE");
                  if (historyDateFrom && localDateStr < historyDateFrom) {
                    return false;
                  }
                  if (historyDateTo && localDateStr > historyDateTo) {
                    return false;
                  }
                  if (
                    historyStatusFilter !== "ALL" &&
                    p.status !== historyStatusFilter
                  ) {
                    return false;
                  }
                  if (query) {
                    const haystack = [
                      p.headline,
                      p.topic_title,
                      p.content_json?.legenda,
                      p.ig_post_id,
                      p.fb_post_id,
                      p.tiktok_post_id,
                    ]
                      .filter(Boolean)
                      .join(" ")
                      .toLowerCase();
                    if (!haystack.includes(query)) return false;
                  }
                  return true;
                });

                const visiblePosts = filteredPosts.slice(
                  0,
                  historyVisibleCount
                );
                const remainingCount = Math.max(
                  0,
                  filteredPosts.length - visiblePosts.length
                );

                return (
                  <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h2 className="text-base font-extrabold text-slate-900">
                          Histórico de Publicações ({workspace.posts.length})
                        </h2>
                        <p className="text-xs text-slate-500">
                          Exibindo <strong>{visiblePosts.length}</strong> de{" "}
                          <strong>{filteredPosts.length}</strong> post(s)
                          {hasActiveFilters ? " filtrados" : " mais recentes"} (20
                          por página)
                        </p>
                      </div>
                      {hasActiveFilters && (
                        <button
                          type="button"
                          onClick={() => {
                            setHistoryDateFrom("");
                            setHistoryDateTo("");
                            setHistorySearch("");
                            setHistoryStatusFilter("ALL");
                            setHistoryVisibleCount(20);
                          }}
                          className="rounded-xl border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200"
                        >
                          Limpar Filtros
                        </button>
                      )}
                    </div>

                    {/* Barra de Filtros por Data, Status e Texto */}
                    <div className="grid grid-cols-1 gap-2.5 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600">
                          Data Inicial (De)
                        </label>
                        <input
                          type="date"
                          value={historyDateFrom}
                          onChange={(e) => {
                            setHistoryDateFrom(e.target.value);
                            setHistoryVisibleCount(20);
                          }}
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-600">
                          Data Final (Até)
                        </label>
                        <input
                          type="date"
                          value={historyDateTo}
                          onChange={(e) => {
                            setHistoryDateTo(e.target.value);
                            setHistoryVisibleCount(20);
                          }}
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-600">
                          Status da Publicação
                        </label>
                        <select
                          value={historyStatusFilter}
                          onChange={(e) => {
                            setHistoryStatusFilter(
                              e.target.value as
                              | "ALL"
                              | "PUBLISHED"
                              | "PENDING_APPROVAL"
                              | "ERROR"
                            );
                            setHistoryVisibleCount(20);
                          }}
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-indigo-500"
                        >
                          <option value="ALL">Todos os Status</option>
                          <option value="PUBLISHED">Publicados (PUBLISHED)</option>
                          <option value="PENDING_APPROVAL">
                            Rascunhos Pendentes
                          </option>
                          <option value="ERROR">Com Erro (ERROR)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-600">
                          Pesquisar Título / Legenda
                        </label>
                        <input
                          type="text"
                          value={historySearch}
                          onChange={(e) => {
                            setHistorySearch(e.target.value);
                            setHistoryVisibleCount(20);
                          }}
                          placeholder="Buscar palavra-chave..."
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    {filteredPosts.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center text-xs text-slate-500">
                        {workspace.posts.length === 0
                          ? "Nenhum post gerado ainda para esta empresa."
                          : "Nenhum post encontrado para a data ou filtro selecionado."}
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          {visiblePosts.map((p) => (
                            <div
                              key={p.id}
                              className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4"
                            >
                              <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
                                {p.image_urls_json[0] && (
                                  <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl border border-slate-200">
                                    <button
                                      type="button"
                                      onClick={() => handleOpenDraftInStudio(p)}
                                      className="block h-full w-full"
                                      title="Clique para visualizar e editar no Estúdio"
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={p.image_urls_json[0]}
                                        alt={p.headline}
                                        className="h-full w-full object-cover transition hover:scale-105"
                                      />
                                      {p.image_urls_json.length > 1 && (
                                        <span className="absolute bottom-1 right-1 rounded bg-slate-900/80 px-1.5 py-0.5 text-[9px] font-bold text-white">
                                          {p.image_urls_json.length} slides
                                        </span>
                                      )}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={Boolean(downloadingKey)}
                                      onClick={() =>
                                        void handleDownloadMedia(
                                          `history-${p.id}`,
                                          p.image_urls_json,
                                          buildDownloadBaseName(
                                            "pilotflow-post",
                                            p.headline
                                          )
                                        )
                                      }
                                      title={
                                        p.image_urls_json.length > 1
                                          ? `Baixar todos os ${p.image_urls_json.length} slides`
                                          : "Baixar imagem"
                                      }
                                      aria-label={
                                        p.image_urls_json.length > 1
                                          ? `Baixar todos os ${p.image_urls_json.length} slides`
                                          : "Baixar imagem"
                                      }
                                      className="absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-slate-900/80 text-white shadow-md transition hover:bg-indigo-600 disabled:opacity-50"
                                    >
                                      <DownloadIcon className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                )}
                                <div className="min-w-0 flex-1 space-y-1 text-xs">
                                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                                    <span
                                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${p.status === "PENDING_APPROVAL"
                                          ? "bg-amber-100 text-amber-800"
                                          : p.status === "ERROR"
                                            ? "bg-rose-100 text-rose-700"
                                            : "bg-emerald-100 text-emerald-700"
                                        }`}
                                    >
                                      {p.status === "PENDING_APPROVAL"
                                        ? "RASCUNHO PENDENTE"
                                        : p.status}
                                    </span>
                                    <span className="text-[11px] text-slate-400">
                                      {new Date(p.created_at).toLocaleString(
                                        "pt-BR"
                                      )}
                                    </span>
                                  </div>
                                  <p className="break-words text-sm font-extrabold text-slate-900">
                                    {p.headline}
                                  </p>
                                  <p className="text-[11px] text-slate-600">
                                    IA: {p.ai_provider_used} • {p.format} (
                                    {p.slides_count}x {p.aspect_ratio})
                                  </p>
                                  <p className="break-all font-mono text-[10px] text-indigo-700">
                                    IG: {p.ig_post_id || "—"} | FB:{" "}
                                    {p.fb_post_id || "—"} | TikTok:{" "}
                                    {p.tiktok_post_id || "—"}
                                  </p>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2 border-t border-slate-200/70 pt-2.5">
                                <button
                                  type="button"
                                  onClick={() => handleOpenDraftInStudio(p)}
                                  className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-[11px] font-bold text-indigo-700 hover:bg-indigo-50"
                                >
                                  {p.status === "PENDING_APPROVAL"
                                    ? "Visualizar & Editar Rascunho"
                                    : "Visualizar / Reabrir no Estúdio"}
                                </button>
                                {p.status === "PUBLISHED" &&
                                  (p.ig_post_id || p.fb_post_id) && (
                                    <button
                                      type="button"
                                      onClick={() => void handleOpenBoostModal(p)}
                                      className="rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-3 py-1.5 text-[11px] font-bold text-white shadow-xs hover:opacity-95"
                                    >
                                      Impulsionar / Criar Campanha
                                    </button>
                                  )}
                                {p.status === "PENDING_APPROVAL" && (
                                  <>
                                    <button
                                      type="button"
                                      disabled={approvingPostId === p.id}
                                      onClick={() => handleApproveDraft(p.id)}
                                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
                                    >
                                      {approvingPostId === p.id
                                        ? "Publicando..."
                                        : "Aprovar e Publicar"}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={deletingPostId === p.id}
                                      onClick={() => handleDeleteDraft(p.id)}
                                      className="ml-auto rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-bold text-rose-700 hover:bg-rose-100"
                                    >
                                      Excluir
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Rodapé de Paginação (20 em 20) */}
                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 pt-4">
                          <span className="text-xs font-semibold text-slate-600">
                            Mostrando <strong>{visiblePosts.length}</strong> de{" "}
                            <strong>{filteredPosts.length}</strong> post(s)
                          </span>
                          <div className="flex flex-wrap items-center gap-2">
                            {historyVisibleCount > 20 && (
                              <button
                                type="button"
                                onClick={() => setHistoryVisibleCount(20)}
                                className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200"
                              >
                                Mostrar apenas os últimos 20
                              </button>
                            )}
                            {remainingCount > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setHistoryVisibleCount((prev) => prev + 20)
                                }
                                className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-xs font-extrabold text-white shadow-sm hover:opacity-95"
                              >
                                + Carregar mais 20 posts (restam{" "}
                                {remainingCount})
                              </button>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })()}

            {/* ---------- ABA 7: CAMPANHAS (TRÁFEGO PAGO) ---------- */}
            {clientTab === "campaigns" && (
              <CampaignsPanel
                companyId={workspace.company.id}
                publishedPosts={workspace.posts}
                refreshKey={campaignsRefreshKey}
                onOpenBoostModal={(post) => void handleOpenBoostModal(post)}
                onOpenIntegrations={() => setClientTab("integrations")}
                onAccountsLoaded={setCompanyAdAccounts}
                onUseHookInStudio={(hookPrompt) => {
                  setStudioTopicId("__free__");
                  setStudioTitle("");
                  setStudioPrompt(hookPrompt);
                  setStudioPhotoMode("AI_FULL_CREATIVE");
                  setStudioPreview(null);
                  setClientTab("studio");
                  setGlobalNotice({
                    type: "success",
                    text: "Gancho vencedor carregado no Estúdio Manual! Ajuste se desejar e gere uma nova prévia.",
                  });
                }}
              />
            )}

            {/* ---------- ABA 8: SUPORTE & CAIXA DE DICAS ---------- */}
            {clientTab === "support" && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="flex flex-col justify-between gap-3 rounded-2xl border border-indigo-200 bg-white p-6 shadow-sm">
                    <div>
                      <span className="inline-flex rounded-full bg-indigo-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-700">
                        Suporte por E-mail
                      </span>
                      <h2 className="mt-2 text-base font-extrabold text-slate-900">
                        {SUPPORT_EMAIL}
                      </h2>
                      <p className="mt-1 text-xs text-slate-600">
                        Canal oficial para dúvidas técnicas, solicitações e suporte
                        da sua conta PilotFlow.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
                          `Suporte PilotFlow - ${workspace.company.name}`
                        )}`}
                        className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700"
                      >
                        Enviar E-mail
                      </a>
                      <button
                        type="button"
                        onClick={() => void handleCopySupportEmail()}
                        className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
                      >
                        {copiedSupportEmail ? "Copiado!" : "Copiar e-mail"}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col justify-between gap-3 rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
                    <div>
                      <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                        Suporte via WhatsApp
                      </span>
                      <h2 className="mt-2 text-base font-extrabold text-slate-900">
                        {SUPPORT_WHATSAPP_DISPLAY}
                      </h2>
                      <p className="mt-1 text-xs text-slate-600">
                        A mensagem já abre identificada para sabermos que você está
                        vindo do suporte do PilotFlow:
                      </p>
                      <p className="mt-1.5 rounded-lg border border-emerald-100 bg-emerald-50/70 px-2.5 py-1.5 text-[11px] font-medium text-emerald-900">
                        &ldquo;{buildSupportWhatsappPreviewText(workspace.company.name)}&rdquo;
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={buildSupportWhatsappUrl(workspace.company.name)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"
                      >
                        Falar no WhatsApp (Suporte PilotFlow) ↗
                      </a>
                      <Link
                        href="/suporte"
                        className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                      >
                        Abrir página /suporte ↗
                      </Link>
                    </div>
                  </div>
                </div>

                {/* Caixa de Dicas de Melhoria */}
                <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
                  <div>
                    <h2 className="text-base font-extrabold text-slate-900">
                      Dê sua dica para melhorar o projeto
                    </h2>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">
                      {TIP_ENCOURAGEMENT_TEXT}
                    </p>
                  </div>

                  {unseenCompletedTips.length > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-xs text-emerald-900">
                      <span className="font-bold">
                        Você tem {unseenCompletedTips.length} dica(s) marcada(s)
                        como atendida(s) abaixo!
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleMarkTipsSeen()}
                        className="rounded-lg bg-emerald-600 px-3 py-1 text-[11px] font-bold text-white hover:bg-emerald-700"
                      >
                        Marcar avisos como lidos
                      </button>
                    </div>
                  )}

                  <form onSubmit={handleSubmitTip} className="space-y-3">
                    <textarea
                      rows={4}
                      required
                      minLength={5}
                      maxLength={2000}
                      value={tipMessage}
                      onChange={(e) => setTipMessage(e.target.value)}
                      placeholder="Descreva sua dica, ideia ou necessidade com o máximo de detalhes (onde você usaria, como gostaria que funcionasse e qual problema isso resolve no seu dia a dia)..."
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] text-slate-500">
                        Sua dica vai direto para o painel administrativo do
                        PilotFlow em ordem de data.
                      </span>
                      <button
                        type="submit"
                        disabled={submittingTip}
                        className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:opacity-95 disabled:opacity-60"
                      >
                        {submittingTip ? "Enviando..." : "Enviar Dica"}
                      </button>
                    </div>
                  </form>

                  <div className="space-y-2 border-t border-slate-100 pt-4">
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                      Minhas Dicas Enviadas ({(workspace.tips || []).length})
                    </h3>
                    {(workspace.tips || []).length === 0 ? (
                      <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-4 text-center text-xs text-slate-500">
                        Você ainda não enviou nenhuma dica. Envie a primeira acima!
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {(workspace.tips || []).map((tip) => (
                          <div
                            key={tip.id}
                            className={`rounded-xl border p-4 text-xs ${tip.status === "COMPLETED"
                                ? "border-emerald-200 bg-emerald-50/50"
                                : "border-slate-200 bg-slate-50/60"
                              }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span
                                className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${tip.status === "COMPLETED"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-amber-100 text-amber-800"
                                  }`}
                              >
                                {tip.status === "COMPLETED"
                                  ? `Concluída${tip.completed_at
                                    ? ` em ${new Date(
                                      tip.completed_at
                                    ).toLocaleDateString("pt-BR")}`
                                    : ""
                                  }`
                                  : "Em análise"}
                              </span>
                              <span className="text-[11px] text-slate-400">
                                Enviada em{" "}
                                {new Date(tip.created_at).toLocaleString("pt-BR")}
                              </span>
                            </div>
                            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">
                              {tip.message}
                            </p>
                            {tip.status === "COMPLETED" && (
                              <div className="mt-2 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-[11px] font-bold text-emerald-800">
                                {tip.admin_reply || TIP_COMPLETED_DEFAULT_MESSAGE}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            {boostModalPost && workspace && (
              <BoostCampaignModal
                companyId={workspace.company.id}
                post={boostModalPost}
                adAccounts={companyAdAccounts}
                defaultAccountId={
                  companyAdAccounts.find((a) => a.is_default)?.ad_account_id ||
                  companyAdAccounts[0]?.ad_account_id ||
                  null
                }
                onClose={() => setBoostModalPost(null)}
                onOpenAccountSetup={() => setClientTab("campaigns")}
                onCreated={(campaign) => {
                  setBoostModalPost(null);
                  setCampaignsRefreshKey((prev) => prev + 1);
                  setClientTab("campaigns");
                  setGlobalNotice({
                    type: "success",
                    text: `Campanha "${campaign.name}" criada com sucesso na Meta Ads (status: PAUSED)! Ative quando estiver pronta.`,
                  });
                }}
              />
            )}
          </div>
        )}
      </main>

      <footer className="mx-auto mt-10 flex max-w-7xl flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 px-4 py-6 text-xs text-slate-500 md:px-8">
        <span>
          © {new Date().getFullYear()} Social PilotFlow SaaS • Meu Gestor
          Digital
        </span>
        <div className="flex items-center gap-4">
          <Link
            href="/suporte"
            className="font-semibold text-indigo-600 hover:underline"
          >
            Suporte &amp; Dicas
          </Link>
          <Link
            href="/termos"
            className="font-semibold text-slate-600 hover:text-indigo-600 hover:underline"
          >
            Termos de Serviço
          </Link>
          <Link
            href="/privacidade"
            className="font-semibold text-slate-600 hover:text-indigo-600 hover:underline"
          >
            Política de Privacidade
          </Link>
        </div>
      </footer>
    </div>
  );
}
