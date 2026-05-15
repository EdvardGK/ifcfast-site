"use client";

import { Children, useState, type ReactNode } from "react";

export function DataTabs({
  labels,
  children,
}: {
  labels: { id: string; label: string }[];
  children: ReactNode;
}) {
  const [active, setActive] = useState(labels[0].id);
  const items = Children.toArray(children);
  const activeIdx = Math.max(0, labels.findIndex(l => l.id === active));
  return (
    <div className="h-full flex flex-col bg-card">
      <div className="flex border-b border-line bg-bg/40">
        {labels.map(t => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            className={`px-4 py-2.5 text-xs font-mono uppercase tracking-wider transition-colors ${
              t.id === active
                ? "text-fg border-b-2 border-accent -mb-px"
                : "text-muted hover:text-fg"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 relative">
        {items.map((node, i) => (
          <div
            key={labels[i]?.id ?? i}
            style={{ display: i === activeIdx ? "block" : "none" }}
            className="absolute inset-0"
          >
            {node}
          </div>
        ))}
      </div>
    </div>
  );
}
