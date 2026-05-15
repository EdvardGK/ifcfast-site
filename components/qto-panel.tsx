"use client";

import { useEffect, useState } from "react";

type Row = {
  entity: string;
  count: number;
  storeys: string[];
  predefined_types: string[];
  materials: string[];
  area_m2: number | null;
  volume_m3: number | null;
};

export function QtoPanel({ src }: { src: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    fetch(src)
      .then(r => r.json())
      .then((d: Row[]) => setRows(d))
      .catch(() => setRows([]));
  }, [src]);

  if (!rows) {
    return <Loading />;
  }
  const totalProducts = rows.reduce((s, r) => s + r.count, 0);
  return (
    <div className="h-full flex flex-col bg-card">
      <div className="px-5 py-3 border-b border-line flex items-baseline justify-between">
        <div>
          <div className="text-xs font-mono text-muted uppercase tracking-wider">
            m.type_summary()
          </div>
          <div className="text-sm font-medium">QTO rollup</div>
        </div>
        <div className="font-mono text-xs text-muted tabular-nums">
          {totalProducts} products · {rows.length} types
        </div>
      </div>
      <div className="flex-1 overflow-auto scroll-thin">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card border-b border-line">
            <tr className="text-xs font-mono text-muted uppercase tracking-wider">
              <th className="text-left font-normal px-4 py-2">entity</th>
              <th className="text-right font-normal px-4 py-2">count</th>
              <th className="text-right font-normal px-4 py-2 hidden sm:table-cell">m²</th>
              <th className="text-left font-normal px-4 py-2 hidden md:table-cell">materials</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.entity} className="border-b border-line/60 hover:bg-bg/50">
                <td className="px-4 py-2 font-mono text-[13px]">{r.entity}</td>
                <td className="px-4 py-2 text-right tabular-nums">{r.count}</td>
                <td className="px-4 py-2 text-right tabular-nums hidden sm:table-cell text-muted">
                  {r.area_m2 !== null ? r.area_m2.toFixed(0) : "—"}
                </td>
                <td className="px-4 py-2 hidden md:table-cell text-muted text-xs">
                  {r.materials.length
                    ? r.materials.slice(0, 2).join(", ") +
                      (r.materials.length > 2 ? `  +${r.materials.length - 2}` : "")
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div className="h-full flex items-center justify-center text-xs font-mono text-muted">
      loading...
    </div>
  );
}
