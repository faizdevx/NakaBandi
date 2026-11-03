import { useEffect, useRef, useState } from "react";
import { downloadCard, renderCityCard } from "../cityCard";
import type { Report } from "../types";

export function CardPreview({ report, onClose }: { report: Report; onClose: () => void }) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    close.current?.focus();
    let made: string | null = null;
    let live = true;
    renderCityCard(report).then(
      (b) => {
        if (!live) return;
        made = URL.createObjectURL(b);
        setBlob(b);
        setUrl(made);
      },
      (e: Error) => live && setError(e.message),
    );
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [report]);

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Traffic card for ${report.area}`}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div className="panel flex max-h-full flex-col gap-3 p-3">
        <div className="flex items-center justify-between gap-3">
          <span className="plate">Your area</span>
          <div className="flex gap-1">
            <button className="btn" disabled={!blob} onClick={() => blob && downloadCard(blob, report)}>
              Save card
            </button>
            <button ref={close} className="btn" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        {error && <p className="text-heavy text-sm">{error}</p>}
        {!url && !error && <div className="font-pixel text-sign px-16 py-16 text-center text-sm">PRINTING CARD…</div>}
        {url && <img src={url} alt={`Traffic card for ${report.area}`} className="aspect-square min-h-0 w-[min(80vh,calc(100vw-4rem))] max-w-full" />}
      </div>
    </div>
  );
}
