"use client";

import { useEffect, useState } from "react";
import { useSelection } from "./selection-context";

type Row = {
  entity: string;
  count: number;
  storeys: number;
  predefined: string;
  area_m2: number | null;
  volume_m3: number | null;
  source: "mesh" | "authored" | "—";
};

type QualityFlag = { entity: string; total: number; no_geometry: number; untyped: number };

type Payload = {
  schema: string;
  products: number;
  rows: Row[];
  materials: string[];
  quality_flags?: QualityFlag[];
  quality_summary?: { products: number; no_geometry: number; untyped: number };
};

type Graph = {
  products: { guid: string; entity: string; storey_guid: string | null; typed?: boolean }[];
  storeys: { guid: string; name: string | null }[];
};

export function QtoPanel({ src, metaSrc }: { src: string; metaSrc?: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [graph, setGraph] = useState<Graph | null>(null);
  const { selection, toggleEntity, toggleUntyped, clear } = useSelection();

  useEffect(() => {
    fetch(src).then(r => r.json()).then(setData).catch(() => setData(null));
  }, [src]);
  useEffect(() => {
    if (!metaSrc) return;
    fetch(metaSrc).then(r => r.json()).then(setGraph).catch(() => setGraph(null));
  }, [metaSrc]);

  if (!data) return <Loading />;
  const selectedEntity = selection?.kind === "entity" ? selection.value : null;
  const selectedEntityStorey =
    selection?.kind === "entity" ? selection.storey_guid ?? null : null;
  const selectedEntityStoreyLabel =
    selection?.kind === "entity" ? selection.storey_label ?? null : null;
  const selectedStorey = selection?.kind === "storey" ? selection.value : null;
  const isUntypedSelected = selection?.kind === "untyped";

  // Build a quick lookup so we can decorate each row with its quality flag.
  const flagByEntity = new Map<string, QualityFlag>();
  for (const f of data.quality_flags ?? []) flagByEntity.set(f.entity, f);
  const summary = data.quality_summary;

  // Scope rows to a storey if one is selected — recompute entity counts
  // from the products in that storey alone. Entity selections that carry
  // a storey_guid (clicked from the spatial tree under a storey) scope
  // the same way so the panel reflects what's actually highlighted.
  let rows = data.rows;
  let header = `${data.rows.length} types`;
  let scopeLabel: string | null = null;
  const scopeStorey = selectedStorey ?? selectedEntityStorey ?? null;
  if (scopeStorey && graph) {
    const scoped = graph.products.filter(p => p.storey_guid === scopeStorey);
    const byEntity = new Map<string, number>();
    for (const p of scoped) byEntity.set(p.entity, (byEntity.get(p.entity) ?? 0) + 1);
    rows = [...byEntity.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([entity, count]) => ({
        entity,
        count,
        storeys: 1,
        predefined: "—",
        area_m2: null,
        volume_m3: null,
        source: "—" as const,
      }));
    header = `${rows.length} types in storey`;
    scopeLabel =
      selectedEntityStoreyLabel
      ?? graph.storeys.find(s => s.guid === scopeStorey)?.name
      ?? "storey";
  }
  // Total untyped product count for the synthetic "Untyped" row. Falls back
  // to summing the per-entity flags when quality_summary is absent.
  const untypedTotal =
    summary?.untyped
    ?? (data.quality_flags ?? []).reduce((acc, f) => acc + f.untyped, 0);
  return (
    <div className="h-full flex flex-col bg-card">
      <div className="px-5 py-3 border-b border-line flex items-baseline justify-between">
        <div>
          <div className="text-xs font-mono text-muted uppercase tracking-wider">
            m.type_summary()
          </div>
          <div className="text-sm font-medium">
            QTO rollup
            {scopeLabel && (
              <span className="ml-2 text-xs font-mono text-accent">
                · {scopeLabel}
              </span>
            )}
          </div>
        </div>
        {selection ? (
          <button onClick={clear} className="font-mono text-xs text-accent hover:underline">
            clear
          </button>
        ) : (
          <div className="font-mono text-xs text-muted tabular-nums">
            {header}
          </div>
        )}
      </div>
      {summary && (summary.no_geometry > 0 || summary.untyped > 0) && (
        <div className="px-5 py-2 border-b border-line bg-bg/40 flex items-center gap-3 text-[11px] font-mono">
          {summary.no_geometry > 0 && (
            <span
              className="inline-flex items-center gap-1 text-accent"
              title="instances with no Representation in the IFC — broken / empty types"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-accent"></span>
              {summary.no_geometry} no-geom
            </span>
          )}
          {summary.untyped > 0 && (
            <span
              className="inline-flex items-center gap-1 text-muted"
              title="instances without IfcRelDefinesByType — geometry is fine, just not linked to an IfcTypeObject"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-muted"></span>
              {summary.untyped} untyped
            </span>
          )}
        </div>
      )}
      <div className="flex-1 overflow-auto scroll-thin">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card border-b border-line">
            <tr className="text-[10px] font-mono text-muted uppercase tracking-wider">
              <th className="text-left font-normal px-4 py-2">entity</th>
              <th className="text-right font-normal px-4 py-2 w-16">count</th>
              <th className="text-right font-normal px-4 py-2 w-20">m²</th>
              <th className="text-center font-normal px-2 py-2 w-10" title="Data quality flags"></th>
            </tr>
          </thead>
          <tbody>
            {untypedTotal > 0 && (
              <tr
                onClick={() => toggleUntyped()}
                className={`border-b border-line/60 cursor-pointer transition-colors ${
                  isUntypedSelected
                    ? "bg-accent-soft text-fg"
                    : selectedEntity !== null
                    ? "opacity-35 hover:opacity-100 hover:bg-bg/60"
                    : "hover:bg-bg/60"
                }`}
                title="Products without an IfcRelDefinesByType — geometry is fine, just not linked to an IfcTypeObject"
              >
                <td className={`px-4 py-2 font-mono text-[13px] ${isUntypedSelected ? "text-accent font-medium" : "text-muted italic"}`}>
                  Untyped
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{untypedTotal}</td>
                <td className="px-4 py-2 text-right tabular-nums text-muted">—</td>
                <td className="px-2 py-2 text-center">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-muted"></span>
                </td>
              </tr>
            )}
            {rows.map(r => {
              const isSel = selectedEntity === r.entity;
              const isDim = (selectedEntity !== null && !isSel) || isUntypedSelected;
              const fl = flagByEntity.get(r.entity);
              return (
                <tr
                  key={r.entity}
                  onClick={() => toggleEntity(r.entity)}
                  className={`border-b border-line/60 cursor-pointer transition-colors ${
                    isSel
                      ? "bg-accent-soft text-fg"
                      : isDim
                      ? "opacity-35 hover:opacity-100 hover:bg-bg/60"
                      : "hover:bg-bg/60"
                  }`}
                >
                  <td className={`px-4 py-2 font-mono text-[13px] ${isSel ? "text-accent font-medium" : ""}`}>
                    {r.entity.replace(/^Ifc/, "Ifc")}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.count}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted">
                    {r.area_m2 !== null ? r.area_m2.toFixed(0) : "—"}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <span className="inline-flex items-center gap-1">
                      {fl && fl.no_geometry > 0 && (
                        <span
                          className="inline-block w-1.5 h-1.5 rounded-full bg-accent"
                          title={`${fl.no_geometry} of ${fl.total} have no geometry`}
                        ></span>
                      )}
                      {fl && fl.untyped > 0 && (
                        <span
                          className="inline-block w-1.5 h-1.5 rounded-full bg-muted"
                          title={`${fl.untyped} of ${fl.total} untyped (no IfcRelDefinesByType — geometry is fine, but the products aren't linked to an IfcTypeObject)`}
                        ></span>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="border-t border-line px-5 py-2 bg-bg/40 text-[11px] font-mono text-muted">
        {selectedEntity
          ? "↳ also filters the model and graph"
          : "click a row to filter across panels"}
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
