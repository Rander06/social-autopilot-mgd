"use client";

import { useEffect, useState } from "react";

export function ImageLightboxModal({
  images,
  title,
  initialIndex = 0,
  onClose,
}: {
  images: string[];
  title?: string | null;
  initialIndex?: number;
  onClose: () => void;
}) {
  const validImages = images.filter(Boolean);
  const [index, setIndex] = useState(() =>
    Math.min(Math.max(0, initialIndex), Math.max(0, validImages.length - 1))
  );

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowRight" && validImages.length > 1) {
        setIndex((prev) => (prev + 1) % validImages.length);
      } else if (e.key === "ArrowLeft" && validImages.length > 1) {
        setIndex((prev) => (prev - 1 + validImages.length) % validImages.length);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, validImages.length]);

  if (validImages.length === 0) return null;

  const safeIndex = Math.min(index, validImages.length - 1);
  const currentUrl = validImages[safeIndex];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-xs sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title ? `Imagem ampliada: ${title}` : "Imagem ampliada"}
      onClick={onClose}
    >
      <div
        className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900 text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-extrabold text-white sm:text-sm">
              {title || "Visualização da Arte"}
            </p>
            {validImages.length > 1 && (
              <p className="text-[11px] font-semibold text-slate-400">
                Slide {safeIndex + 1} de {validImages.length}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <a
              href={currentUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-[11px] font-bold text-slate-200 hover:bg-slate-700"
            >
              Abrir original ↗
            </a>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-white px-3 py-1.5 text-[11px] font-extrabold text-slate-900 hover:bg-slate-200"
            >
              Fechar
            </button>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center overflow-auto bg-slate-950/80 p-3 sm:p-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={currentUrl}
            alt={title || `Slide ${safeIndex + 1}`}
            className="max-h-[75vh] w-auto max-w-full rounded-xl object-contain shadow-lg"
          />
        </div>

        {validImages.length > 1 && (
          <div className="flex items-center justify-between gap-2 border-t border-slate-800 bg-slate-900 px-4 py-2.5">
            <button
              type="button"
              onClick={() =>
                setIndex(
                  (prev) => (prev - 1 + validImages.length) % validImages.length
                )
              }
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-700"
            >
              ← Anterior
            </button>
            <div className="flex items-center gap-1.5">
              {validImages.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Ir para slide ${i + 1}`}
                  onClick={() => setIndex(i)}
                  className={`h-2 rounded-full transition-all ${
                    i === safeIndex
                      ? "w-5 bg-indigo-400"
                      : "w-2 bg-slate-600 hover:bg-slate-500"
                  }`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                setIndex((prev) => (prev + 1) % validImages.length)
              }
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-700"
            >
              Próxima →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
