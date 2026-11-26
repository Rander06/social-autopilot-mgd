"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  buildSupportWhatsappPreviewText,
  buildSupportWhatsappUrl,
  SUPPORT_EMAIL,
  SUPPORT_WHATSAPP_DISPLAY,
  TIP_COMPLETED_DEFAULT_MESSAGE,
  TIP_ENCOURAGEMENT_TEXT,
} from "@/lib/support";
import { ImprovementTip } from "@/lib/types";

interface SupportSessionState {
  authenticated: boolean;
  companyName?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  tips: ImprovementTip[];
}

export default function SuportePage() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<SupportSessionState>({
    authenticated: false,
    tips: [],
  });
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [tipMessage, setTipMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await fetch("/api/saas/state", { cache: "no-store" });
        const data = await res.json();
        if (!active) return;
        if (res.ok && data.authenticated && data.workspace) {
          setSession({
            authenticated: true,
            companyName: data.workspace.company?.name || null,
            userName: data.user?.name || null,
            userEmail: data.user?.email || null,
            tips: Array.isArray(data.workspace.tips)
              ? (data.workspace.tips as ImprovementTip[])
              : [],
          });
        } else {
          setSession({ authenticated: false, tips: [] });
        }
      } catch {
        if (active) setSession({ authenticated: false, tips: [] });
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  async function handleCopyEmail() {
    try {
      await navigator.clipboard?.writeText(SUPPORT_EMAIL);
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 1800);
    } catch {
      setCopiedEmail(false);
    }
  }

  async function handleSubmitTip(e: React.FormEvent) {
    e.preventDefault();
    if (!tipMessage.trim()) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/saas/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit_improvement_tip",
          message: tipMessage,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao enviar dica.");
      setTipMessage("");
      setSession((prev) => ({
        ...prev,
        tips: Array.isArray(data.workspace?.tips)
          ? (data.workspace.tips as ImprovementTip[])
          : prev.tips,
      }));
      setFeedback({
        type: "success",
        text: "Dica enviada com sucesso para o painel administrativo! Obrigado por contribuir.",
      });
    } catch (err) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Erro ao enviar dica.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMarkSeen() {
    try {
      const res = await fetch("/api/saas/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_tips_seen" }),
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.workspace?.tips)) {
        setSession((prev) => ({
          ...prev,
          tips: data.workspace.tips as ImprovementTip[],
        }));
      }
    } catch {
      // Ignora falha silenciosa
    }
  }

  const unseenCompleted = session.tips.filter(
    (t) => t.status === "COMPLETED" && !t.client_seen_at
  );

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:py-12 text-slate-800">
      <div className="space-y-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <img
              src="/logo-pilotflow.jpg"
              alt="Social PilotFlow SaaS"
              className="h-10 w-10 rounded-xl border border-slate-200 object-cover"
            />
            <div>
              <h1 className="text-xl font-extrabold text-slate-900">
                Suporte &amp; Caixa de Dicas
              </h1>
              <p className="text-xs text-slate-500">
                Social PilotFlow SaaS • Atendimento oficial e sugestões de melhoria
              </p>
            </div>
          </div>
          <Link
            href="/"
            className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
          >
            ← Voltar ao Painel
          </Link>
        </div>

        {/* Canais Oficiais de Suporte */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col justify-between gap-3 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-5">
            <div>
              <span className="inline-flex rounded-full bg-indigo-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-700">
                Suporte por E-mail
              </span>
              <h2 className="mt-2 text-base font-extrabold text-slate-900">
                {SUPPORT_EMAIL}
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                Envie dúvidas técnicas, solicitações de conta ou anexos diretamente
                para nossa equipe.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
                  "Suporte PilotFlow"
                )}`}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-indigo-700"
              >
                Enviar E-mail
              </a>
              <button
                type="button"
                onClick={() => void handleCopyEmail()}
                className="rounded-xl border border-indigo-200 bg-white px-3.5 py-2 text-xs font-bold text-indigo-700 transition hover:bg-indigo-100/60"
              >
                {copiedEmail ? "E-mail copiado!" : "Copiar e-mail"}
              </button>
            </div>
          </div>

          <div className="flex flex-col justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5">
            <div>
              <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                Suporte via WhatsApp
              </span>
              <h2 className="mt-2 text-base font-extrabold text-slate-900">
                {SUPPORT_WHATSAPP_DISPLAY}
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                Ao clicar no botão abaixo, a conversa já abre identificada para o
                atendimento:
              </p>
              <p className="mt-1.5 rounded-lg border border-emerald-200/80 bg-white px-2.5 py-1.5 text-[11px] font-medium text-emerald-900">
                &ldquo;{buildSupportWhatsappPreviewText(session.companyName)}&rdquo;
              </p>
            </div>
            <div>
              <a
                href={buildSupportWhatsappUrl(session.companyName)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700"
              >
                Falar no WhatsApp (Suporte PilotFlow) ↗
              </a>
            </div>
          </div>
        </section>

        {/* Caixa de Dicas */}
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
          <div>
            <h2 className="text-base font-extrabold text-slate-900">
              Dê sua dica para melhorar o projeto
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              {TIP_ENCOURAGEMENT_TEXT}
            </p>
          </div>

          {loading ? (
            <p className="text-xs text-slate-500">Verificando sessão...</p>
          ) : !session.authenticated ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
              <span>
                Faça login na sua conta PilotFlow para enviar sua dica identificada
                e acompanhar quando ela for atendida.
              </span>
              <Link
                href="/"
                className="rounded-xl bg-indigo-600 px-4 py-2 font-bold text-white hover:bg-indigo-700"
              >
                Entrar no Painel
              </Link>
            </div>
          ) : (
            <>
              {unseenCompleted.length > 0 && (
                <div className="space-y-2 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-xs text-emerald-950">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-extrabold">
                      Boa notícia! {unseenCompleted.length} dica(s) sua(s) foram
                      atendidas:
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleMarkSeen()}
                      className="rounded-lg bg-emerald-600 px-3 py-1 font-bold text-white hover:bg-emerald-700"
                    >
                      Entendi
                    </button>
                  </div>
                  {unseenCompleted.map((t) => (
                    <div
                      key={t.id}
                      className="rounded-lg border border-emerald-200 bg-white p-2.5"
                    >
                      <p className="font-semibold text-slate-800">{t.message}</p>
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
              )}

              {feedback && (
                <div
                  className={`rounded-xl border px-4 py-3 text-xs font-semibold ${
                    feedback.type === "success"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                      : "border-rose-200 bg-rose-50 text-rose-900"
                  }`}
                >
                  {feedback.text}
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
                  placeholder="Descreva sua ideia, melhoria ou necessidade com o máximo de detalhes (onde acontece, como gostaria que funcionasse e qual problema resolve)..."
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500"
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-500">
                    Enviando como <strong>{session.userName}</strong> (
                    {session.companyName})
                  </span>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:opacity-95 disabled:opacity-60"
                  >
                    {submitting ? "Enviando..." : "Enviar Dica"}
                  </button>
                </div>
              </form>

              {session.tips.length > 0 && (
                <div className="space-y-2 border-t border-slate-200 pt-4">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                    Suas Dicas Enviadas ({session.tips.length})
                  </h3>
                  <div className="space-y-2">
                    {session.tips.map((tip) => (
                      <div
                        key={tip.id}
                        className="rounded-xl border border-slate-200 bg-white p-3.5 text-xs"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                              tip.status === "COMPLETED"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {tip.status === "COMPLETED"
                              ? `Concluída${
                                  tip.completed_at
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
                        <p className="mt-2 whitespace-pre-wrap text-slate-800">
                          {tip.message}
                        </p>
                        {tip.status === "COMPLETED" && (
                          <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-800">
                            {tip.admin_reply || TIP_COMPLETED_DEFAULT_MESSAGE}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4 text-xs text-slate-500">
          <span>Social PilotFlow SaaS • Meu Gestor Digital</span>
          <div className="flex items-center gap-4">
            <Link
              href="/termos"
              className="font-semibold text-indigo-600 underline"
            >
              Termos de Serviço
            </Link>
            <Link
              href="/privacidade"
              className="font-semibold text-indigo-600 underline"
            >
              Política de Privacidade
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
