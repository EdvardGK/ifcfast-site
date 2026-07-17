"use client";

import { useEffect, useState } from "react";
import { Maximize2, X } from "lucide-react";

// Instrument chrome: a slim mono-labelled header strip with an
// expand-to-fullscreen toggle, wrapped around a workbench tile.
// Children are NOT remounted on toggle — the tile consumers
// (d3 svg, model-viewer) carry their own ResizeObservers, and a
// remount would re-measure a zero-height container mid-layout.
export function TileChrome({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const [full, setFull] = useState(false);

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFull(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [full]);

  return (
    <div
      className={
        full
          ? "fixed inset-0 z-50 bg-bg flex flex-col"
          : "flex flex-col h-full min-h-0"
      }
    >
      <div className="flex items-center justify-between border-b border-line bg-bg/40 px-3 py-1 flex-shrink-0">
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted">
          {label}
        </span>
        <button
          onClick={() => setFull((f) => !f)}
          aria-label={full ? `Close fullscreen ${label}` : `Expand ${label}`}
          className="p-1 rounded text-muted hover:text-fg hover:bg-line/60 focus-visible:outline-2 focus-visible:outline-accent"
        >
          {full ? <X size={13} /> : <Maximize2 size={12} />}
        </button>
      </div>
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
