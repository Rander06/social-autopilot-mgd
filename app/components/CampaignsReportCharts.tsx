"use client";

import { useMemo, useState } from "react";
import {
  AdAccountConfig,
  AdCampaignRecord,
  AdInsightsDailyPoint,
  AdInsightsWindow,
  AdInsightsWindowMetrics,
} from "@/lib/types";

type CompareMetricKey = "spend" | "clicks" | "conversions" | "cpa";
type SecondaryChartMetric = "clicks" | "conversions";

const WINDOW_DAYS: Record<AdInsightsWindow, number> = {
  "4d": 4,
  "7d": 7,
  "14d": 14,
  "30d": 30,
};

const WINDOW_LABELS: Record<AdInsightsWindow, string> = {
  "4d": "4 dias",
  "7d": "7 dias",
  "14d": "14 dias",
  "30d": "30 dias",
};

function formatMoney(value: number | null | undefined, currency = "BRL"): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const prefix = currency.toUpperCase() === "USD" ? "US$" : "R$";
  return `${prefix} ${Number(value).toFixed(2).replace(".", ",")}`;
}

function formatInt(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return Math.round(Number(value)).toLocaleString("pt-BR");
}

function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${Number(value).toFixed(2).replace(".", ",")}%`;
}

function formatShortDate(isoDate: string): string {
  const parts = isoDate.split("-");
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}`;
}

function escapeHtml(raw: string): string {
  return String(raw || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeCsvCell(raw: string | number | null | undefined): string {
  const text = raw === null || raw === undefined ? "" : String(raw);
  if (/[;"\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function getWindowMetrics(
  cmp: AdCampaignRecord,
  win: AdInsightsWindow
): Partial<AdInsightsWindowMetrics> {
  return (
    cmp.last_insights_json?.windows?.[win] ||
    cmp.last_insights_json ||
    {}
  );
}

interface CampaignRowSummary {
  campaign: AdCampaignRecord;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number | null;
  cpm: number | null;
  frequency: number;
  conversions: number;
  revenue: number;
  cpa: number | null;
  roas: number | null;
}

export function CampaignsReportCharts({
  companyName,
  accountName,
  currency,
  adAccounts = [],
  campaigns,
  selectedWindow,
  onSelectWindow,
  cpaMaximo = 35,
  roasMinimo = 2,
}: {
  companyName: string;
  accountName?: string | null;
  currency: string;
  adAccounts?: AdAccountConfig[];
  campaigns: AdCampaignRecord[];
  selectedWindow: AdInsightsWindow;
  onSelectWindow: (win: AdInsightsWindow) => void;
  cpaMaximo?: number;
  roasMinimo?: number;
}) {
  const [selectedAccountId, setSelectedAccountId] = useState<string>("ALL");
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("ALL");
  const [secondarySeries, setSecondarySeries] =
    useState<SecondaryChartMetric>("clicks");
  const [compareMetric, setCompareMetric] =
    useState<CompareMetricKey>("spend");
  const [hoveredDayIndex, setHoveredDayIndex] = useState<number | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const accountOptions = useMemo(() => {
    const map = new Map<string, { id: string; label: string }>();
    for (const acc of adAccounts) {
      const base = acc.account_name?.trim() || acc.ad_account_id;
      const bm = acc.business_name?.trim();
      map.set(acc.ad_account_id, {
        id: acc.ad_account_id,
        label: bm ? `${bm} › ${base} (${acc.ad_account_id})` : `${base} (${acc.ad_account_id})`,
      });
    }
    for (const cmp of campaigns) {
      if (cmp.ad_account_id && !map.has(cmp.ad_account_id)) {
        map.set(cmp.ad_account_id, {
          id: cmp.ad_account_id,
          label: cmp.ad_account_id,
        });
      }
    }
    return Array.from(map.values());
  }, [adAccounts, campaigns]);

  const effectiveAccountId =
    selectedAccountId === "ALL" ||
    accountOptions.some((opt) => opt.id === selectedAccountId)
      ? selectedAccountId
      : "ALL";

  const validCampaignsInAccount = useMemo(
    () =>
      campaigns.filter(
        (c) =>
          c.status !== "ERROR" &&
          (effectiveAccountId === "ALL" || c.ad_account_id === effectiveAccountId)
      ),
    [campaigns, effectiveAccountId]
  );

  const effectiveCampaignId =
    selectedCampaignId === "ALL" ||
    validCampaignsInAccount.some((c) => c.id === selectedCampaignId)
      ? selectedCampaignId
      : "ALL";

  const scopedCampaigns = useMemo(
    () =>
      effectiveCampaignId === "ALL"
        ? validCampaignsInAccount
        : validCampaignsInAccount.filter((c) => c.id === effectiveCampaignId),
    [validCampaignsInAccount, effectiveCampaignId]
  );

  const selectedCampaignObj = useMemo(
    () =>
      effectiveCampaignId === "ALL"
        ? null
        : validCampaignsInAccount.find((c) => c.id === effectiveCampaignId) || null,
    [validCampaignsInAccount, effectiveCampaignId]
  );

  const activeAccount = useMemo(() => {
    const targetAccId =
      effectiveAccountId !== "ALL"
        ? effectiveAccountId
        : selectedCampaignObj?.ad_account_id || null;
    if (!targetAccId) return null;
    return adAccounts.find((a) => a.ad_account_id === targetAccId) || null;
  }, [adAccounts, effectiveAccountId, selectedCampaignObj]);

  const effectiveCurrency =
    activeAccount?.currency || selectedCampaignObj?.currency || currency;
  const effectiveCpaMaximo = activeAccount?.cpa_maximo ?? cpaMaximo;
  const effectiveRoasMinimo = activeAccount?.roas_minimo ?? roasMinimo;
  const effectiveAccountLabel =
    effectiveAccountId !== "ALL"
      ? activeAccount?.business_name?.trim()
        ? `${activeAccount.business_name.trim()} › ${activeAccount.account_name}`
        : activeAccount?.account_name || effectiveAccountId
      : selectedCampaignObj && activeAccount
        ? activeAccount.business_name?.trim()
          ? `${activeAccount.business_name.trim()} › ${activeAccount.account_name}`
          : activeAccount.account_name
        : accountOptions.length > 1
          ? `Todas as Contas (${accountOptions.length})`
          : accountName || null;

  const report = useMemo(() => {
    const validCampaigns = scopedCampaigns;

    const rows: CampaignRowSummary[] = validCampaigns.map((cmp) => {
      const w = getWindowMetrics(cmp, selectedWindow);
      const spend = Number(w.spend || 0);
      const impressions = Number(w.impressions || 0);
      const clicks = Number(w.clicks || 0);
      const conversions = Number(w.conversions || 0);
      const revenue = Number(w.revenue || 0);
      const ctr =
        w.ctr !== undefined && w.ctr !== null
          ? Number(w.ctr)
          : impressions > 0
            ? (clicks / impressions) * 100
            : 0;
      const cpc =
        w.cpc !== undefined && w.cpc !== null && Number(w.cpc) > 0
          ? Number(w.cpc)
          : clicks > 0
            ? spend / clicks
            : null;
      const cpm =
        w.cpm !== undefined && w.cpm !== null && Number(w.cpm) > 0
          ? Number(w.cpm)
          : impressions > 0
            ? (spend / impressions) * 1000
            : null;
      const cpa =
        w.cpa !== undefined && w.cpa !== null
          ? Number(w.cpa)
          : conversions > 0
            ? spend / conversions
            : null;
      const roas =
        w.roas !== undefined && w.roas !== null
          ? Number(w.roas)
          : spend > 0 && revenue > 0
            ? revenue / spend
            : null;

      return {
        campaign: cmp,
        spend,
        impressions,
        clicks,
        ctr,
        cpc,
        cpm,
        frequency: Number(w.frequency || 0),
        conversions,
        revenue,
        cpa,
        roas,
      };
    });

    let totalSpend = 0;
    let totalImpressions = 0;
    let totalClicks = 0;
    let totalConversions = 0;
    let totalRevenue = 0;
    let weightedRoasNumerator = 0;
    let weightedRoasDenominator = 0;

    for (const r of rows) {
      totalSpend += r.spend;
      totalImpressions += r.impressions;
      totalClicks += r.clicks;
      totalConversions += r.conversions;
      totalRevenue += r.revenue;
      if (r.roas !== null && r.spend > 0) {
        weightedRoasNumerator += r.roas * r.spend;
        weightedRoasDenominator += r.spend;
      }
    }

    const avgCtr =
      totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : null;
    const avgCpm =
      totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : null;
    const avgCpa =
      totalConversions > 0 ? totalSpend / totalConversions : null;
    const convRate =
      totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0;
    const consolidatedRoas =
      totalRevenue > 0 && totalSpend > 0
        ? totalRevenue / totalSpend
        : weightedRoasDenominator > 0
          ? weightedRoasNumerator / weightedRoasDenominator
          : null;

    const activeCount = validCampaigns.filter(
      (c) => c.status === "ACTIVE"
    ).length;
    const pausedCount = validCampaigns.filter(
      (c) => c.status === "PAUSED"
    ).length;
    const escalarCount = validCampaigns.filter(
      (c) => c.last_verdict === "ESCALAR"
    ).length;
    const manterCount = validCampaigns.filter(
      (c) => c.last_verdict === "MANTER"
    ).length;
    const pausarCount = validCampaigns.filter(
      (c) => c.last_verdict === "PAUSAR"
    ).length;

    let lastUpdatedAt: string | null = null;
    for (const c of scopedCampaigns.length > 0 ? scopedCampaigns : campaigns) {
      if (
        c.last_insights_at &&
        (!lastUpdatedAt || c.last_insights_at > lastUpdatedAt)
      ) {
        lastUpdatedAt = c.last_insights_at;
      }
    }

    // Série diária consolidada para os últimos N dias da janela selecionada
    const daysCount = WINDOW_DAYS[selectedWindow];
    const dailyMap = new Map<string, AdInsightsDailyPoint>();
    const today = new Date();
    const orderedDates: string[] = [];
    for (let i = daysCount - 1; i >= 0; i -= 1) {
      const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
      const iso = d.toISOString().slice(0, 10);
      orderedDates.push(iso);
      dailyMap.set(iso, {
        date: iso,
        spend: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        revenue: 0,
        ctr: 0,
        cpc: 0,
      });
    }

    let hasDailyData = false;
    for (const cmp of validCampaigns) {
      const points = cmp.last_insights_json?.daily || [];
      for (const pt of points) {
        const key = String(pt.date || "").slice(0, 10);
        const target = dailyMap.get(key);
        if (!target) continue;
        target.spend += Number(pt.spend || 0);
        target.impressions += Number(pt.impressions || 0);
        target.clicks += Number(pt.clicks || 0);
        target.conversions += Number(pt.conversions || 0);
        target.revenue += Number(pt.revenue || 0);
        if (
          Number(pt.spend || 0) > 0 ||
          Number(pt.impressions || 0) > 0 ||
          Number(pt.clicks || 0) > 0 ||
          Number(pt.conversions || 0) > 0
        ) {
          hasDailyData = true;
        }
      }
    }

    const dailySeries: AdInsightsDailyPoint[] = orderedDates.map((iso) => {
      const item = dailyMap.get(iso)!;
      return {
        ...item,
        spend: Number(item.spend.toFixed(2)),
        revenue: Number(item.revenue.toFixed(2)),
        ctr:
          item.impressions > 0 ? (item.clicks / item.impressions) * 100 : 0,
        cpc: item.clicks > 0 ? item.spend / item.clicks : 0,
      };
    });

    // Totais por janela (4d, 7d, 14d, 30d) para fallback visual antes de haver série diária
    const windowTotals = (["4d", "7d", "14d", "30d"] as AdInsightsWindow[]).map(
      (winKey) => {
        let spend = 0;
        let clicks = 0;
        let conversions = 0;
        for (const cmp of validCampaigns) {
          const w = getWindowMetrics(cmp, winKey);
          spend += Number(w.spend || 0);
          clicks += Number(w.clicks || 0);
          conversions += Number(w.conversions || 0);
        }
        return {
          key: winKey,
          label: WINDOW_LABELS[winKey],
          spend,
          clicks,
          conversions,
        };
      }
    );

    const hasAnyWindowData = windowTotals.some(
      (w) => w.spend > 0 || w.clicks > 0 || w.conversions > 0
    );

    return {
      rows,
      totalSpend,
      totalImpressions,
      totalClicks,
      totalConversions,
      totalRevenue,
      avgCtr,
      avgCpc,
      avgCpm,
      avgCpa,
      convRate,
      consolidatedRoas,
      activeCount,
      pausedCount,
      escalarCount,
      manterCount,
      pausarCount,
      lastUpdatedAt,
      dailySeries,
      hasDailyData,
      windowTotals,
      hasAnyWindowData,
    };
  }, [scopedCampaigns, campaigns, selectedWindow]);

  function handleExportCsv() {
    setExportNotice(null);
    const header = [
      "Campanha",
      "Canal",
      "Status",
      "Objetivo",
      "Orcamento_Diario",
      "Moeda",
      "Janela",
      "Gasto",
      "Impressoes",
      "Cliques",
      "CTR_Percent",
      "CPC",
      "CPM",
      "Frequencia",
      "Conversoes",
      "CPA_CPL",
      "ROAS",
      "Veredito",
    ];

    const summaryRow = [
      selectedCampaignObj
        ? `RESUMO (${companyName} — ${selectedCampaignObj.name})`
        : `RESUMO CONSOLIDADO (${companyName})`,
      selectedCampaignObj ? selectedCampaignObj.channel : "TODAS",
      `${report.activeCount} ativa(s) / ${scopedCampaigns.length} exibida(s)`,
      "—",
      "—",
      effectiveCurrency,
      WINDOW_LABELS[selectedWindow],
      report.totalSpend.toFixed(2).replace(".", ","),
      Math.round(report.totalImpressions),
      Math.round(report.totalClicks),
      report.avgCtr.toFixed(2).replace(".", ","),
      report.avgCpc !== null ? report.avgCpc.toFixed(2).replace(".", ",") : "—",
      report.avgCpm !== null ? report.avgCpm.toFixed(2).replace(".", ",") : "—",
      "—",
      Math.round(report.totalConversions),
      report.avgCpa !== null ? report.avgCpa.toFixed(2).replace(".", ",") : "—",
      report.consolidatedRoas !== null
        ? report.consolidatedRoas.toFixed(2).replace(".", ",")
        : "—",
      `${report.escalarCount} ESCALAR / ${report.manterCount} MANTER / ${report.pausarCount} PAUSAR`,
    ];

    const campaignRows = report.rows.map((r) => [
      r.campaign.name,
      r.campaign.channel,
      r.campaign.status,
      r.campaign.objective,
      (r.campaign.daily_budget_cents / 100).toFixed(2).replace(".", ","),
      r.campaign.currency || effectiveCurrency,
      WINDOW_LABELS[selectedWindow],
      r.spend.toFixed(2).replace(".", ","),
      Math.round(r.impressions),
      Math.round(r.clicks),
      r.ctr.toFixed(2).replace(".", ","),
      r.cpc !== null ? r.cpc.toFixed(2).replace(".", ",") : "—",
      r.cpm !== null ? r.cpm.toFixed(2).replace(".", ",") : "—",
      r.frequency.toFixed(2).replace(".", ","),
      Math.round(r.conversions),
      r.cpa !== null ? r.cpa.toFixed(2).replace(".", ",") : "—",
      r.roas !== null ? r.roas.toFixed(2).replace(".", ",") : "—",
      r.campaign.last_verdict || "—",
    ]);

    const csvLines = [header, summaryRow, ...campaignRows]
      .map((line) => line.map(escapeCsvCell).join(";"))
      .join("\r\n");

    const blob = new Blob([`\uFEFF${csvLines}`], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const slug = companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/(^-|-$)/g, "");
    const cmpSlug = selectedCampaignObj
      ? `-${selectedCampaignObj.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/gi, "-")
          .replace(/(^-|-$)/g, "")
          .slice(0, 32)}`
      : "";
    const todayIso = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `relatorio-campanhas-${slug || "empresa"}${cmpSlug}-${selectedWindow}-${todayIso}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setExportNotice("Arquivo CSV baixado com sucesso.");
  }

  function handlePrintReport() {
    setExportNotice(null);
    const win = window.open("", "_blank", "width=1024,height=780");
    if (!win) {
      setExportNotice(
        "Seu navegador bloqueou a janela de impressão. Libere pop-ups para este site ou use Exportar CSV."
      );
      return;
    }

    const nowFormatted = new Date().toLocaleString("pt-BR");
    const safeCompany = escapeHtml(companyName);
    const safeAccount = escapeHtml(effectiveAccountLabel || "Todas as Contas");
    const safeCampaignScope = selectedCampaignObj
      ? ` • Campanha: <strong>${escapeHtml(selectedCampaignObj.name)}</strong>`
      : "";
    const safeWindow = escapeHtml(WINDOW_LABELS[selectedWindow]);

    const rowsHtml =
      report.rows.length === 0
        ? `<tr><td colspan="10" style="text-align:center;color:#64748b;padding:18px;">Nenhuma campanha encontrada para este filtro.</td></tr>`
        : report.rows
            .map(
              (r) => `
          <tr>
            <td><strong>${escapeHtml(r.campaign.name)}</strong><br/><span style="color:#64748b;font-size:11px;">${escapeHtml(
              r.campaign.channel
            )} • ${escapeHtml(r.campaign.status)}</span></td>
            <td>${escapeHtml(formatMoney(r.spend, r.campaign.currency || effectiveCurrency))}</td>
            <td>${escapeHtml(formatInt(r.impressions))}</td>
            <td>${escapeHtml(formatInt(r.clicks))}</td>
            <td>${escapeHtml(formatPct(r.ctr))}</td>
            <td>${escapeHtml(formatMoney(r.cpc, r.campaign.currency || effectiveCurrency))}</td>
            <td>${escapeHtml(formatMoney(r.cpm, r.campaign.currency || effectiveCurrency))}</td>
            <td>${escapeHtml(formatInt(r.conversions))}</td>
            <td>${escapeHtml(formatMoney(r.cpa, r.campaign.currency || effectiveCurrency))}</td>
            <td>${escapeHtml(r.campaign.last_verdict || "—")}</td>
          </tr>`
            )
            .join("");

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Relatório de Tráfego Pago — ${safeCompany}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; margin: 28px; }
    h1 { margin: 0; font-size: 22px; }
    .meta { color: #475569; font-size: 12px; margin-top: 4px; }
    .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 20px 0; }
    .kpi { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; background: #f8fafc; }
    .kpi-label { font-size: 11px; color: #64748b; font-weight: 700; text-transform: uppercase; }
    .kpi-val { font-size: 18px; font-weight: 800; margin-top: 4px; }
    .funnel { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 16px 0 22px; }
    .funnel-step { border: 1px solid #cbd5e1; border-radius: 10px; padding: 10px 12px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
    th, td { border-bottom: 1px solid #e2e8f0; padding: 8px 6px; text-align: left; }
    th { background: #f1f5f9; font-size: 11px; text-transform: uppercase; color: #475569; }
    @media print { body { margin: 12px; } }
  </style>
</head>
<body>
  <h1>Relatório de Performance — Tráfego Pago</h1>
  <div class="meta">Empresa: <strong>${safeCompany}</strong> • Conta: ${safeAccount}${safeCampaignScope} • Janela: <strong>${safeWindow}</strong> • Gerado em ${escapeHtml(
      nowFormatted
    )}</div>

  <div class="kpis">
    <div class="kpi"><div class="kpi-label">Gasto Total</div><div class="kpi-val">${escapeHtml(
      formatMoney(report.totalSpend, effectiveCurrency)
    )}</div></div>
    <div class="kpi"><div class="kpi-label">Impressões</div><div class="kpi-val">${escapeHtml(
      formatInt(report.totalImpressions)
    )}</div></div>
    <div class="kpi"><div class="kpi-label">Cliques (CTR ${escapeHtml(
      formatPct(report.avgCtr)
    )})</div><div class="kpi-val">${escapeHtml(
      formatInt(report.totalClicks)
    )}</div></div>
    <div class="kpi"><div class="kpi-label">CPC Médio</div><div class="kpi-val">${escapeHtml(
      formatMoney(report.avgCpc, effectiveCurrency)
    )}</div></div>
    <div class="kpi"><div class="kpi-label">Conversões</div><div class="kpi-val">${escapeHtml(
      formatInt(report.totalConversions)
    )}</div></div>
    <div class="kpi"><div class="kpi-label">CPA / CPL Médio</div><div class="kpi-val">${escapeHtml(
      formatMoney(report.avgCpa, effectiveCurrency)
    )}</div></div>
    <div class="kpi"><div class="kpi-label">ROAS Consolidado</div><div class="kpi-val">${
      report.consolidatedRoas !== null
        ? escapeHtml(`${report.consolidatedRoas.toFixed(2).replace(".", ",")}x`)
        : "—"
    }</div></div>
    <div class="kpi"><div class="kpi-label">Vereditos IA</div><div class="kpi-val">${report.escalarCount} Escalar • ${report.manterCount} Manter • ${report.pausarCount} Pausar</div></div>
  </div>

  <div class="funnel">
    <div class="funnel-step"><strong>1. Impressões:</strong> ${escapeHtml(
      formatInt(report.totalImpressions)
    )} (CPM ${escapeHtml(formatMoney(report.avgCpm, effectiveCurrency))})</div>
    <div class="funnel-step"><strong>2. Cliques:</strong> ${escapeHtml(
      formatInt(report.totalClicks)
    )} (CTR ${escapeHtml(formatPct(report.avgCtr))})</div>
    <div class="funnel-step"><strong>3. Conversões:</strong> ${escapeHtml(
      formatInt(report.totalConversions)
    )} (Taxa ${escapeHtml(formatPct(report.convRate))})</div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Campanha</th>
        <th>Gasto</th>
        <th>Impr.</th>
        <th>Cliques</th>
        <th>CTR</th>
        <th>CPC</th>
        <th>CPM</th>
        <th>Conv.</th>
        <th>CPA</th>
        <th>Veredito</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
</body>
</html>`;

    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
    }, 250);
  }

  // Geometria do gráfico SVG de evolução diária
  const chartWidth = 720;
  const chartHeight = 220;
  const padLeft = 48;
  const padRight = 40;
  const padTop = 18;
  const padBottom = 34;
  const plotW = chartWidth - padLeft - padRight;
  const plotH = chartHeight - padTop - padBottom;

  const dailyPoints = report.dailySeries;
  const maxDailySpend = Math.max(
    1,
    ...dailyPoints.map((d) => Number(d.spend || 0))
  );
  const maxDailySecondary = Math.max(
    1,
    ...dailyPoints.map((d) =>
      secondarySeries === "clicks"
        ? Number(d.clicks || 0)
        : Number(d.conversions || 0)
    )
  );
  const slotW = dailyPoints.length > 0 ? plotW / dailyPoints.length : plotW;
  const barW = Math.max(6, Math.min(28, slotW * 0.56));

  const lineCoords = dailyPoints.map((d, idx) => {
    const val = secondarySeries === "clicks" ? d.clicks : d.conversions;
    const cx = padLeft + slotW * idx + slotW / 2;
    const cy = padTop + plotH - (val / maxDailySecondary) * plotH;
    return { cx, cy, val, point: d };
  });
  const linePath = lineCoords
    .map((pt, idx) => `${idx === 0 ? "M" : "L"}${pt.cx.toFixed(1)},${pt.cy.toFixed(1)}`)
    .join(" ");

  const hoveredPoint =
    hoveredDayIndex !== null && dailyPoints[hoveredDayIndex]
      ? dailyPoints[hoveredDayIndex]
      : null;

  // Comparativo horizontal entre campanhas
  const sortedCampaigns = useMemo(() => {
    const list = [...report.rows];
    list.sort((a, b) => {
      if (compareMetric === "cpa") {
        const av = a.cpa ?? Number.POSITIVE_INFINITY;
        const bv = b.cpa ?? Number.POSITIVE_INFINITY;
        return av - bv;
      }
      return b[compareMetric] - a[compareMetric];
    });
    return list.slice(0, 8);
  }, [report.rows, compareMetric]);

  const maxCompareValue = useMemo(() => {
    if (sortedCampaigns.length === 0) return 1;
    const vals = sortedCampaigns.map((r) => {
      if (compareMetric === "cpa") return r.cpa || 0;
      return r[compareMetric];
    });
    return Math.max(
      1,
      effectiveCpaMaximo && compareMetric === "cpa" ? effectiveCpaMaximo : 0,
      ...vals
    );
  }, [sortedCampaigns, compareMetric, effectiveCpaMaximo]);

  const ctrRatioWidth = Math.min(
    100,
    report.totalImpressions > 0
      ? Math.max(4, (report.totalClicks / report.totalImpressions) * 100 * 6)
      : 0
  );
  const convRatioWidth = Math.min(
    100,
    report.totalImpressions > 0
      ? Math.max(
          report.totalConversions > 0 ? 3 : 0,
          (report.totalConversions / report.totalImpressions) * 100 * 14
        )
      : report.totalClicks > 0 && report.totalConversions > 0
        ? Math.max(4, (report.totalConversions / report.totalClicks) * 100)
        : 0
  );

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
      {/* Cabeçalho do Relatório */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h3 className="text-sm font-extrabold text-slate-900">
            Relatório de Performance &amp; Gráficos
          </h3>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {companyName}
            {effectiveAccountLabel ? ` • ${effectiveAccountLabel}` : ""}
            {selectedCampaignObj ? ` • ${selectedCampaignObj.name}` : ""} •
            Janela: <strong>{WINDOW_LABELS[selectedWindow]}</strong>
            {report.lastUpdatedAt
              ? ` • Última sinc.: ${new Date(report.lastUpdatedAt).toLocaleString("pt-BR")}`
              : " • Clique em Sincronizar Meta & Métricas para atualizar"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
            {(["4d", "7d", "14d", "30d"] as AdInsightsWindow[]).map((win) => (
              <button
                key={win}
                type="button"
                onClick={() => onSelectWindow(win)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                  selectedWindow === win
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "text-slate-600 hover:bg-white"
                }`}
              >
                {WINDOW_LABELS[win]}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleExportCsv}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
          >
            Exportar CSV
          </button>
          <button
            type="button"
            onClick={handlePrintReport}
            className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100"
          >
            Imprimir / PDF
          </button>
        </div>
      </div>

      {/* Filtros do Relatório (Conta/BM & Campanha) */}
      <div className="space-y-2.5">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-[1fr_1.4fr_auto]">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Filtrar por Conta / BM
            </label>
            <select
              value={effectiveAccountId}
              onChange={(e) => {
                setSelectedAccountId(e.target.value);
                setSelectedCampaignId("ALL");
              }}
              aria-label="Filtrar relatório por conta ou BM"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800"
            >
              <option value="ALL">
                Todas as Contas ({accountOptions.length})
              </option>
              {accountOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Selecionar Campanha do Relatório
            </label>
            <select
              value={effectiveCampaignId}
              onChange={(e) => setSelectedCampaignId(e.target.value)}
              aria-label="Selecionar campanha do relatório"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800"
            >
              <option value="ALL">
                Todas as Campanhas ({validCampaignsInAccount.length})
              </option>
              {validCampaignsInAccount.map((cmp) => (
                <option key={cmp.id} value={cmp.id}>
                  {cmp.name} ({cmp.status})
                </option>
              ))}
            </select>
          </div>

          {(effectiveAccountId !== "ALL" || effectiveCampaignId !== "ALL") && (
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => {
                  setSelectedAccountId("ALL");
                  setSelectedCampaignId("ALL");
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                Limpar filtros
              </button>
            </div>
          )}
        </div>

        <details className="rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2 text-[11px] text-slate-600">
          <summary className="cursor-pointer font-bold text-slate-700 hover:text-indigo-700">
            Como usar os filtros e exportar o Relatório?
          </summary>
          <p className="mt-1.5 leading-relaxed">
            Use <strong>Filtrar por Conta / BM</strong> e{" "}
            <strong>Selecionar Campanha do Relatório</strong> (junto com a janela{" "}
            <strong>4 / 7 / 14 / 30 dias</strong>) para gerar números de uma
            campanha específica ou consolidados por conta/empresa. Todos os 8
            KPIs, a Evolução Diária, o Funil Visual, <strong>Exportar CSV</strong>{" "}
            e <strong>Imprimir / PDF</strong> geram exatamente o recorte
            selecionado aqui.
          </p>
        </details>
      </div>

      {exportNotice && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-[11px] font-semibold text-indigo-800">
          {exportNotice}
        </div>
      )}

      {/* Grid de KPIs Consolidados (8 cards) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Gasto Total
          </p>
          <p className="mt-1 text-lg font-extrabold text-slate-900">
            {formatMoney(report.totalSpend, effectiveCurrency)}
          </p>
          <p className="mt-0.5 text-[10px] text-slate-500">
            {report.activeCount} ativa(s) • {report.pausedCount} pausada(s)
          </p>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Impressões
          </p>
          <p className="mt-1 text-lg font-extrabold text-slate-900">
            {formatInt(report.totalImpressions)}
          </p>
          <p className="mt-0.5 text-[10px] text-slate-500">
            CPM médio: {formatMoney(report.avgCpm, effectiveCurrency)}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Cliques
          </p>
          <p className="mt-1 text-lg font-extrabold text-slate-900">
            {formatInt(report.totalClicks)}
          </p>
          <p className="mt-0.5 text-[10px] text-slate-500">
            CTR médio: <strong>{formatPct(report.avgCtr)}</strong>
          </p>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            CPC Médio
          </p>
          <p className="mt-1 text-lg font-extrabold text-slate-900">
            {formatMoney(report.avgCpc, effectiveCurrency)}
          </p>
          <p className="mt-0.5 text-[10px] text-slate-500">
            Custo médio por clique
          </p>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Conversões
          </p>
          <p className="mt-1 text-lg font-extrabold text-slate-900">
            {formatInt(report.totalConversions)}
          </p>
          <p className="mt-0.5 text-[10px] text-slate-500">
            Taxa de conv.: {formatPct(report.convRate)}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            CPA / CPL Médio
          </p>
          <p
            className={`mt-1 text-lg font-extrabold ${
              report.avgCpa === null
                ? "text-slate-900"
                : report.avgCpa <= effectiveCpaMaximo
                  ? "text-emerald-700"
                  : "text-rose-700"
            }`}
          >
            {formatMoney(report.avgCpa, effectiveCurrency)}
          </p>
          <p className="mt-0.5 text-[10px] text-slate-500">
            Meta teto: {formatMoney(effectiveCpaMaximo, effectiveCurrency)}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            ROAS Consolidado
          </p>
          <p
            className={`mt-1 text-lg font-extrabold ${
              report.consolidatedRoas === null
                ? "text-slate-900"
                : report.consolidatedRoas >= effectiveRoasMinimo
                  ? "text-emerald-700"
                  : "text-amber-700"
            }`}
          >
            {report.consolidatedRoas !== null
              ? `${report.consolidatedRoas.toFixed(2).replace(".", ",")}x`
              : "—"}
          </p>
          <p className="mt-0.5 text-[10px] text-slate-500">
            Meta mínima: {effectiveRoasMinimo.toFixed(1).replace(".", ",")}x
          </p>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Vereditos IA
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1 text-[10px] font-extrabold">
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">
              {report.escalarCount} Escalar
            </span>
            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-slate-700">
              {report.manterCount} Manter
            </span>
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-800">
              {report.pausarCount} Pausar
            </span>
          </div>
          <p className="mt-1 text-[10px] text-slate-500">
            {report.rows.length} campanha(s) no relatório
          </p>
        </div>
      </div>

      {/* Gráfico 1: Evolução Diária */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-xs font-extrabold text-slate-900">
              Evolução Diária ({WINDOW_LABELS[selectedWindow]})
            </h4>
            <p className="text-[11px] text-slate-500">
              Barras em roxo/indigo mostram o <strong>Gasto diário</strong>; a
              linha mostra{" "}
              <strong>
                {secondarySeries === "clicks" ? "Cliques" : "Conversões"}
              </strong>{" "}
              por dia.
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setSecondarySeries("clicks")}
              className={`rounded-md px-2.5 py-1 font-bold ${
                secondarySeries === "clicks"
                  ? "bg-cyan-600 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              Cliques
            </button>
            <button
              type="button"
              onClick={() => setSecondarySeries("conversions")}
              className={`rounded-md px-2.5 py-1 font-bold ${
                secondarySeries === "conversions"
                  ? "bg-emerald-600 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              Conversões
            </button>
          </div>
        </div>

        {report.hasDailyData ? (
          <div className="mt-3">
            <div className="relative overflow-x-auto">
              <svg
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                className="h-56 w-full min-w-[460px]"
                role="img"
                aria-label="Gráfico de evolução diária de gasto e performance"
              >
                <defs>
                  <linearGradient id="pilotSpendBar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.92" />
                    <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.45" />
                  </linearGradient>
                </defs>

                {/* Linhas guia horizontais */}
                {[0, 0.25, 0.5, 0.75, 1].map((step) => {
                  const y = padTop + plotH * (1 - step);
                  const valLabel = formatMoney(
                    maxDailySpend * step,
                    effectiveCurrency
                  );
                  return (
                    <g key={step}>
                      <line
                        x1={padLeft}
                        y1={y}
                        x2={chartWidth - padRight}
                        y2={y}
                        stroke="#e2e8f0"
                        strokeDasharray={step === 0 ? undefined : "3 3"}
                      />
                      <text
                        x={padLeft - 6}
                        y={y + 3}
                        textAnchor="end"
                        fontSize="9"
                        fill="#64748b"
                      >
                        {valLabel}
                      </text>
                    </g>
                  );
                })}

                {/* Barras de Gasto Diário */}
                {dailyPoints.map((d, idx) => {
                  const x = padLeft + slotW * idx + (slotW - barW) / 2;
                  const h = (Number(d.spend || 0) / maxDailySpend) * plotH;
                  const y = padTop + plotH - h;
                  const showLabel =
                    dailyPoints.length <= 10 ||
                    idx % Math.ceil(dailyPoints.length / 8) === 0 ||
                    idx === dailyPoints.length - 1;

                  return (
                    <g
                      key={d.date}
                      onMouseEnter={() => setHoveredDayIndex(idx)}
                      onMouseLeave={() => setHoveredDayIndex(null)}
                      className="cursor-pointer"
                    >
                      <rect
                        x={padLeft + slotW * idx}
                        y={padTop}
                        width={slotW}
                        height={plotH}
                        fill={
                          hoveredDayIndex === idx
                            ? "rgba(79,70,229,0.06)"
                            : "transparent"
                        }
                      />
                      <rect
                        x={x}
                        y={y}
                        width={barW}
                        height={Math.max(2, h)}
                        rx={3}
                        fill="url(#pilotSpendBar)"
                      />
                      {showLabel && (
                        <text
                          x={padLeft + slotW * idx + slotW / 2}
                          y={chartHeight - 10}
                          textAnchor="middle"
                          fontSize="9"
                          fill="#475569"
                        >
                          {formatShortDate(d.date)}
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* Linha da série secundária (Cliques ou Conversões) */}
                {lineCoords.length > 1 && (
                  <path
                    d={linePath}
                    fill="none"
                    stroke={
                      secondarySeries === "clicks" ? "#06b6d4" : "#10b981"
                    }
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {lineCoords.map((pt, idx) => (
                  <circle
                    key={pt.point.date}
                    cx={pt.cx}
                    cy={pt.cy}
                    r={hoveredDayIndex === idx ? 5 : 3.2}
                    fill={secondarySeries === "clicks" ? "#0891b2" : "#059669"}
                    stroke="#ffffff"
                    strokeWidth="1.5"
                    onMouseEnter={() => setHoveredDayIndex(idx)}
                    onMouseLeave={() => setHoveredDayIndex(null)}
                    className="cursor-pointer"
                  />
                ))}
              </svg>
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-[11px]">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
                  <span className="h-2.5 w-2.5 rounded-xs bg-indigo-600" />
                  Gasto (R$)
                </span>
                <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      secondarySeries === "clicks"
                        ? "bg-cyan-500"
                        : "bg-emerald-500"
                    }`}
                  />
                  {secondarySeries === "clicks" ? "Cliques" : "Conversões"}
                </span>
              </div>

              {hoveredPoint ? (
                <div className="font-semibold text-slate-800">
                  <strong>{formatShortDate(hoveredPoint.date)}:</strong>{" "}
                  {formatMoney(hoveredPoint.spend, effectiveCurrency)} •{" "}
                  {formatInt(hoveredPoint.impressions)} impr. •{" "}
                  {formatInt(hoveredPoint.clicks)} cliques (
                  {formatPct(hoveredPoint.ctr)}) •{" "}
                  {formatInt(hoveredPoint.conversions)} conv.
                </div>
              ) : (
                <span className="text-slate-400">
                  Passe o mouse sobre o gráfico para detalhar o dia
                </span>
              )}
            </div>
          </div>
        ) : report.hasAnyWindowData ? (
          <div className="mt-3 space-y-3">
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
              Exibindo comparativo acumulado por janela. Clique em{" "}
              <strong>Atualizar Métricas</strong> no topo para carregar a série
              dia a dia da Meta.
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {report.windowTotals.map((wt) => {
                const maxWinSpend = Math.max(
                  1,
                  ...report.windowTotals.map((item) => item.spend)
                );
                const pct = Math.max(6, (wt.spend / maxWinSpend) * 100);
                return (
                  <div
                    key={wt.key}
                    className="rounded-xl border border-slate-200 bg-white p-3 text-xs"
                  >
                    <div className="flex items-center justify-between font-bold text-slate-700">
                      <span>{wt.label}</span>
                      <span>{formatMoney(wt.spend, effectiveCurrency)}</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-indigo-600"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-[10px] text-slate-500">
                      {formatInt(wt.clicks)} cliques •{" "}
                      {formatInt(wt.conversions)} conv.
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center text-xs text-slate-500">
            Ainda não há dados de entrega registrados para desenhar a evolução
            diária. Assim que uma campanha estiver ativa e você clicar em{" "}
            <strong>Atualizar Métricas</strong>, os gráficos serão preenchidos
            automaticamente.
          </div>
        )}
      </div>

      {/* Grid 2 Colunas: Funil Visual + Comparativo entre Campanhas */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Gráfico 2: Funil Visual */}
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
          <div>
            <h4 className="text-xs font-extrabold text-slate-900">
              Funil Visual de Conversão
            </h4>
            <p className="text-[11px] text-slate-500">
              Passagem de público entre alcance, interesse e ação na janela{" "}
              {WINDOW_LABELS[selectedWindow]}.
            </p>
          </div>

          <div className="space-y-3 pt-1">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700">1. Impressões</span>
                <span className="font-extrabold text-slate-900">
                  {formatInt(report.totalImpressions)}
                </span>
              </div>
              <div className="h-6 overflow-hidden rounded-lg bg-slate-200/70">
                <div
                  className="flex h-full items-center rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-2.5 text-[10px] font-bold text-white transition-all"
                  style={{
                    width: report.totalImpressions > 0 ? "100%" : "0%",
                  }}
                >
                  {report.totalImpressions > 0
                    ? `CPM ${formatMoney(report.avgCpm, effectiveCurrency)}`
                    : ""}
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700">2. Cliques</span>
                <span className="font-extrabold text-slate-900">
                  {formatInt(report.totalClicks)}{" "}
                  <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-bold text-cyan-800">
                    CTR {formatPct(report.avgCtr)}
                  </span>
                </span>
              </div>
              <div className="h-6 overflow-hidden rounded-lg bg-slate-200/70">
                <div
                  className="flex h-full items-center rounded-lg bg-gradient-to-r from-cyan-600 to-sky-500 px-2.5 text-[10px] font-bold text-white transition-all"
                  style={{ width: `${ctrRatioWidth}%` }}
                >
                  {report.totalClicks > 0
                    ? `CPC ${formatMoney(report.avgCpc, effectiveCurrency)}`
                    : ""}
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700">3. Conversões</span>
                <span className="font-extrabold text-slate-900">
                  {formatInt(report.totalConversions)}{" "}
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                    Taxa {formatPct(report.convRate)}
                  </span>
                </span>
              </div>
              <div className="h-6 overflow-hidden rounded-lg bg-slate-200/70">
                <div
                  className="flex h-full items-center rounded-lg bg-gradient-to-r from-emerald-600 to-teal-500 px-2.5 text-[10px] font-bold text-white transition-all"
                  style={{ width: `${convRatioWidth}%` }}
                >
                  {report.totalConversions > 0
                    ? `CPA ${formatMoney(report.avgCpa, effectiveCurrency)}`
                    : ""}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Gráfico 3: Comparativo entre Campanhas */}
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-extrabold text-slate-900">
                Comparativo entre Campanhas
              </h4>
              <p className="text-[11px] text-slate-500">
                Ranking das campanhas na janela selecionada.
              </p>
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5 text-[10px]">
              {(
                [
                  { id: "spend", label: "Gasto" },
                  { id: "clicks", label: "Cliques" },
                  { id: "conversions", label: "Conv." },
                  { id: "cpa", label: "CPA" },
                ] as Array<{ id: CompareMetricKey; label: string }>
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCompareMetric(tab.id)}
                  className={`rounded-md px-2 py-1 font-bold ${
                    compareMetric === tab.id
                      ? "bg-indigo-600 text-white"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {sortedCampaigns.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center text-xs text-slate-500">
              Crie sua primeira campanha para comparar desempenho entre posts e
              públicos.
            </div>
          ) : (
            <div className="space-y-2.5">
              {sortedCampaigns.map((row) => {
                const val =
                  compareMetric === "cpa"
                    ? row.cpa ?? 0
                    : row[compareMetric];
                const barWidth =
                  compareMetric === "cpa" && row.cpa === null
                    ? 0
                    : Math.max(4, Math.min(100, (val / maxCompareValue) * 100));
                const cpaOverLimit =
                  compareMetric === "cpa" &&
                  row.cpa !== null &&
                  row.cpa > effectiveCpaMaximo;

                const formattedVal =
                  compareMetric === "spend"
                    ? formatMoney(
                        row.spend,
                        row.campaign.currency || effectiveCurrency
                      )
                    : compareMetric === "cpa"
                      ? formatMoney(
                          row.cpa,
                          row.campaign.currency || effectiveCurrency
                        )
                      : formatInt(row[compareMetric]);

                return (
                  <div
                    key={row.campaign.id}
                    className="rounded-xl border border-slate-200/80 bg-white p-2.5 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="shrink-0 rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-extrabold text-indigo-700">
                          {row.campaign.channel === "INSTAGRAM" ? "IG" : "FB"}
                        </span>
                        <span className="truncate font-bold text-slate-800">
                          {row.campaign.name}
                        </span>
                        {row.campaign.last_verdict && (
                          <span
                            className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-extrabold ${
                              row.campaign.last_verdict === "ESCALAR"
                                ? "bg-emerald-100 text-emerald-800"
                                : row.campaign.last_verdict === "PAUSAR"
                                  ? "bg-rose-100 text-rose-800"
                                  : "bg-slate-200 text-slate-700"
                            }`}
                          >
                            {row.campaign.last_verdict}
                          </span>
                        )}
                      </div>
                      <span
                        className={`shrink-0 font-extrabold ${
                          cpaOverLimit ? "text-rose-700" : "text-slate-900"
                        }`}
                      >
                        {formattedVal}
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full transition-all ${
                          cpaOverLimit
                            ? "bg-rose-500"
                            : compareMetric === "conversions"
                              ? "bg-emerald-500"
                              : compareMetric === "clicks"
                                ? "bg-cyan-500"
                                : "bg-indigo-600"
                        }`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                );
              })}

              {compareMetric === "cpa" && (
                <p className="text-[10px] text-slate-500">
                  Referência de meta: CPA Máximo{" "}
                  <strong>
                    {formatMoney(effectiveCpaMaximo, effectiveCurrency)}
                  </strong>{" "}
                  (barras em vermelho estão acima do teto).
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
