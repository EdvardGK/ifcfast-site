"use client";

/**
 * Mini dashboard tile for the QTO Workbench.
 *
 * Three sections, all scope-aware (respect the global Selection):
 *
 *   1. KPI cluster — volume, area, products, materials, layer-sets,
 *      classified % — recomputed against the currently filtered
 *      product set.
 *   2. IFC-class treemap — tiles sized by the active metric
 *      (m³ / m² / count). Click a tile to filter by that class.
 *   3. Materials bar chart — top materials by total volume in the
 *      current scope. Click a row to filter by that material.
 *
 * Data is pulled from the comprehensive sidecar generator's outputs
 * (qto.json + graph.json + bundle.json). Where ifcfast didn't
 * extract geometry for a class, the value is null and the tile
 * shows "—" so the absence is visible, not hidden.
 */

import { useEffect, useMemo, useState } from "react";
import * as d3 from "d3";
import { useSelection } from "@/components/selection-context";
import {
  rangePalette,
  DEFAULT_RANGE,
  COLOR_CALLOUT,
  COLOR_CALLOUT_SOFT,
} from "@/components/ifc-palette";

interface QtoRow {
  entity: string;
  count: number;
  area_m2: number | null;
  volume_m3: number | null;
  source?: "mesh" | "none";
  products_with_mesh?: number;
}

interface QtoFile {
  rows: QtoRow[];
}

interface GraphProduct {
  guid: string;
  entity: string;
  storey_guid?: string | null;
  typed?: boolean;
  type_name?: string;
  type_source?: "ifctype" | "objecttype" | "none" | "unknown";
  materials?: string[];
  layer_set?: string | null;
  m3?: number | null;        // effective — direct OR aggregate-rollup
  m2?: number | null;
  lm?: number | null;
  m_source?: "direct" | "aggregate-rollup" | "none";
  m3_direct?: number | null; // raw, for unique-contribution totals
  m2_direct?: number | null;
  lm_direct?: number | null;
}

interface GraphFile {
  products: GraphProduct[];
  storeys: { guid: string; name: string | null }[];
  material_layer_sets?: Record<string, unknown>;
}

type Metric = "volume_m3" | "area_m2" | "count";

const METRIC_LABEL: Record<Metric, string> = {
  volume_m3: "m³",
  area_m2: "m²",
  count: "count",
};

export function DashTile({ qtoSrc, graphSrc }: { qtoSrc: string; graphSrc: string }) {
  const [qto, setQto] = useState<QtoFile | null>(null);
  const [graph, setGraph] = useState<GraphFile | null>(null);
  const [metric, setMetric] = useState<Metric>("volume_m3");
  const { selection, toggleEntity, toggleMaterial, clear } = useSelection();

  useEffect(() => {
    fetch(qtoSrc).then((r) => r.json()).then(setQto).catch(() => setQto(null));
    fetch(graphSrc).then((r) => r.json()).then(setGraph).catch(() => setGraph(null));
  }, [qtoSrc, graphSrc]);

  // Filter products against the current selection. Every downstream
  // aggregation reads from this list so KPIs, treemap and material
  // bars all stay in sync with whatever the user has filtered on.
  const filtered = useMemo<GraphProduct[]>(() => {
    if (!graph) return [];
    if (!selection) return graph.products;
    return graph.products.filter((p) => {
      if (selection.kind === "entity") {
        if (p.entity.toLowerCase() !== selection.value.toLowerCase()) return false;
        if (selection.storey_guid && p.storey_guid !== selection.storey_guid) return false;
        return true;
      }
      if (selection.kind === "storey") return p.storey_guid === selection.value;
      if (selection.kind === "type")
        return (p.type_name ?? "") === selection.value && (p.type_source ?? "none") === "ifctype";
      if (selection.kind === "material") return (p.materials ?? []).includes(selection.value);
      if (selection.kind === "layer_set") return (p.layer_set ?? null) === selection.value;
      if (selection.kind === "untyped") return (p.type_source ?? "none") !== "ifctype";
      if (selection.kind === "instance") return p.guid === selection.value;
      return true;
    });
  }, [graph, selection]);

  // When the active selection came FROM this widget, the widget
  // keeps its full data and only highlights the picked element.
  // Other widgets adapt to the filter. This is the "click here →
  // others adapt, I stay" pattern: a treemap doesn't reduce itself
  // to a single tile when you click one of its tiles.
  const TREEMAP_SOURCE = "dash-treemap";
  const MATERIALS_SOURCE = "dash-materials";
  const isTreemapSource = selection?.source === TREEMAP_SOURCE;
  const isMaterialsSource = selection?.source === MATERIALS_SOURCE;

  // Per-entity stats. Treemap reads from full data if it's the source
  // of the current selection; otherwise from the scope-narrowed set.
  const filteredByEntity = useMemo(() => {
    if (!graph) return [];
    // Treemap stays full when it's the source; otherwise it narrows.
    const productSet = isTreemapSource ? graph.products : filtered;
    // Sum per entity directly from products — picks up
    // aggregate-rollup values (IfcRoof reads as its aggregated
    // IfcSlab's m³, etc.) instead of dropping the row because the
    // direct mesh sum is null. The `source` tag is set to
    // "aggregate-rollup" if ANY product in the class contributed
    // via rollup, so the UI can flag it.
    type Acc = { entity: string; count: number; m3: number; m2: number; sourceUsesRollup: boolean };
    const byEntity = new Map<string, Acc>();
    for (const p of productSet) {
      let row = byEntity.get(p.entity);
      if (!row) {
        row = { entity: p.entity, count: 0, m3: 0, m2: 0, sourceUsesRollup: false };
        byEntity.set(p.entity, row);
      }
      row.count += 1;
      if (typeof p.m3 === "number") row.m3 += p.m3;
      if (typeof p.m2 === "number") row.m2 += p.m2;
      if (p.m_source === "aggregate-rollup") row.sourceUsesRollup = true;
    }
    return [...byEntity.values()].map((r) => ({
      entity: r.entity,
      count: r.count,
      m3: r.m3,
      m2: r.m2,
      source: r.sourceUsesRollup ? "rollup" : "mesh",
    }));
  }, [graph, filtered, isTreemapSource]);

  // KPIs (always recomputed against the filtered scope).
  const kpis = useMemo(() => {
    const totalVolume = filteredByEntity.reduce((s, r) => s + r.m3, 0);
    const totalArea = filteredByEntity.reduce((s, r) => s + r.m2, 0);
    const products = filtered.length;
    const typed = filtered.filter((p) => (p.type_source ?? "none") === "ifctype").length;
    const classifiedPct = products > 0 ? (typed / products) * 100 : 0;
    const materials = new Set(filtered.flatMap((p) => p.materials ?? [])).size;
    const layerSets = new Set(filtered.map((p) => p.layer_set).filter((x): x is string => !!x)).size;
    return [
      { label: "Volume", value: totalVolume.toFixed(1), unit: "m³" },
      { label: "Area", value: totalArea.toFixed(0), unit: "m²" },
      { label: "Products", value: String(products), unit: "" },
      { label: "Materials", value: String(materials), unit: "uniq" },
      { label: "Layer sets", value: String(layerSets), unit: "" },
      { label: "Classified", value: classifiedPct.toFixed(0), unit: "%" },
    ];
  }, [filtered, filteredByEntity]);

  // Treemap layout — squarified algorithm over the filtered class set
  // sized by the active metric. Colors come from the rangePalette
  // formula: N entities → N evenly-spaced colors from dark to light
  // along the DEFAULT_RANGE. Biggest entity → darkest. Same entity
  // can shade differently across views (its position-in-sorted-set
  // is what determines the slot); for cross-view consistency on the
  // graph and viewer we use stableEntityPalette instead.
  const treemap = useMemo(() => {
    const raw = filteredByEntity.map((r) => ({
      entity: r.entity,
      value: metric === "volume_m3" ? r.m3 : metric === "area_m2" ? r.m2 : r.count,
      source: r.source,
      count: r.count,
    }));
    // Don't filter zero-value classes — exposing the gap is the
    // point. Replace zero with a small floor so the squarified
    // layout still gives them a visible tile, then mark the tile
    // as "no data for this metric" so the visual reads correctly.
    const maxVal = raw.reduce((m, r) => Math.max(m, r.value), 0);
    const floor = Math.max(maxVal * 0.015, 0.5); // ~1.5% of the biggest tile
    const sized = raw
      .map((r) => ({
        ...r,
        layoutValue: r.value > 0 ? r.value : floor,
        hasValue: r.value > 0,
      }))
      .sort((a, b) => b.layoutValue - a.layoutValue);
    const colors = rangePalette(DEFAULT_RANGE, sized.length);
    return sized.map((t, i) => ({ ...t, color: colors[i] }));
  }, [filteredByEntity, metric]);

  // Materials bar — same source-aware pattern as the treemap.
  // Stays full when it was the source of the current selection.
  const materialBars = useMemo(() => {
    if (!qto || !graph) return [];
    const productSet = isMaterialsSource ? graph.products : filtered;
    const m3ByEntity = new Map(qto.rows.map((r) => [r.entity, r.volume_m3 ?? 0]));
    const countByEntity = new Map(qto.rows.map((r) => [r.entity, r.count]));
    const acc = new Map<string, { m3: number; count: number }>();
    for (const p of productSet) {
      const per = (m3ByEntity.get(p.entity) ?? 0) / Math.max(1, countByEntity.get(p.entity) ?? 1);
      for (const m of p.materials ?? []) {
        const cur = acc.get(m) ?? { m3: 0, count: 0 };
        cur.m3 += per;
        cur.count += 1;
        acc.set(m, cur);
      }
    }
    return [...acc.entries()]
      .map(([material, v]) => ({ material, ...v }))
      .sort((a, b) => b.m3 - a.m3 || b.count - a.count)
      .slice(0, 8);
  }, [qto, graph, filtered, isMaterialsSource]);

  if (!qto || !graph) {
    return (
      <div className="h-full flex items-center justify-center text-xs font-mono text-muted">
        loading…
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-card min-h-0">
      {/* KPI strip (flush row of six) */}
      <div className="grid grid-cols-3 sm:grid-cols-6 border-b border-line">
        {kpis.map((k, i) => (
          <div
            key={k.label}
            className={`px-3 py-2.5 ${i < kpis.length - 1 ? "border-r border-line" : ""} ${i >= 3 ? "border-t border-line sm:border-t-0" : ""}`}
          >
            <div className="text-[10px] font-mono text-muted uppercase tracking-wider">
              {k.label}
            </div>
            <div className="mt-0.5 flex items-baseline gap-1">
              <span className="text-base font-semibold tracking-tight tabular-nums leading-none">
                {k.value}
              </span>
              {k.unit && (
                <span className="text-[10px] font-mono text-muted">{k.unit}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Scope chip + metric toggle */}
      <div className="px-4 py-2 border-b border-line flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2 text-[10px] font-mono">
          <span className="text-muted uppercase tracking-wider">Scope</span>
          {selection ? (
            <button
              onClick={clear}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 hover:opacity-80"
              style={{ background: COLOR_CALLOUT_SOFT, color: COLOR_CALLOUT }}
            >
              {describeSel(selection)} ×
            </button>
          ) : (
            <span className="text-muted">all {graph.products.length} products</span>
          )}
        </div>
        <div className="flex items-center text-[10px] font-mono">
          {(["volume_m3", "area_m2", "count"] as Metric[]).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={`px-2 py-0.5 rounded transition ${
                metric === m ? "bg-fg text-bg" : "text-muted hover:text-fg"
              }`}
            >
              {METRIC_LABEL[m]}
            </button>
          ))}
        </div>
      </div>

      {/* Treemap (left) + Materials (right) — square-ish columns */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2">
        {/* Treemap by IFC class */}
        <div className="flex flex-col min-h-0 border-b border-line lg:border-b-0 lg:border-r">
          <div className="px-4 pt-2 pb-1 text-[10px] font-mono text-muted uppercase tracking-wider flex items-center justify-between flex-shrink-0">
            <span>IFC class · {METRIC_LABEL[metric]}</span>
            <span className="normal-case tracking-normal">{treemap.length} in scope</span>
          </div>
          <div className="flex-1 min-h-0 px-3 pb-3">
            {treemap.length === 0 ? (
              <div className="h-full flex items-center justify-center text-[11px] text-muted font-mono">
                no measurable values in this scope
              </div>
            ) : (
              <Treemap
                tiles={treemap}
                metricUnit={METRIC_LABEL[metric]}
                onPick={(e) => toggleEntity(e, undefined, undefined, TREEMAP_SOURCE)}
                selectedEntity={selection?.kind === "entity" ? selection.value : null}
              />
            )}
          </div>
        </div>

        {/* Materials bar */}
        <div className="flex flex-col min-h-0">
          <div className="px-4 pt-2 pb-1 text-[10px] font-mono text-muted uppercase tracking-wider flex items-center justify-between flex-shrink-0">
            <span>Materials · m³ (proportional)</span>
            <span className="normal-case tracking-normal">{materialBars.length}</span>
          </div>
          <div className="flex-1 min-h-0 overflow-auto px-4 pb-3 flex flex-col gap-1.5">
            {materialBars.length === 0 && (
              <div className="text-[11px] font-mono text-muted text-center py-4">
                no materials in scope
              </div>
            )}
            {materialBars.map((b) => {
              const max = materialBars[0]?.m3 || 1;
              const pct = (b.m3 / max) * 100;
              const isSel = selection?.kind === "material" && selection.value === b.material;
              return (
                <button
                  key={b.material}
                  onClick={() => toggleMaterial(b.material, MATERIALS_SOURCE)}
                  className="flex items-center gap-2 text-left transition hover:opacity-80"
                >
                  <span
                    className={`flex-1 min-w-0 truncate text-[11px] font-mono ${
                      isSel ? "font-medium" : "text-fg"
                    }`}
                    style={isSel ? { color: COLOR_CALLOUT } : undefined}
                    title={b.material}
                  >
                    {b.material}
                  </span>
                  <div className="w-16 h-2 rounded-sm bg-bg overflow-hidden flex-shrink-0">
                    <div
                      className="h-full transition-all"
                      style={{
                        width: `${pct}%`,
                        background: isSel ? COLOR_CALLOUT : "rgba(13,13,12,0.7)",
                      }}
                    />
                  </div>
                  <span className="w-12 text-right text-[10px] font-mono text-muted tabular-nums flex-shrink-0">
                    {b.m3 > 0 ? b.m3.toFixed(1) : "—"}
                  </span>
                  <span className="w-7 text-right text-[10px] font-mono text-muted tabular-nums flex-shrink-0">
                    {b.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Treemap (squarified) ─────────────────────────────────────────────

function Treemap({
  tiles,
  metricUnit,
  onPick,
  selectedEntity,
}: {
  tiles: {
    entity: string;
    value: number;
    layoutValue: number;
    hasValue: boolean;
    color: string;
    source: string;
    count: number;
  }[];
  metricUnit: string;
  onPick: (entity: string) => void;
  selectedEntity: string | null;
}) {
  // Logical canvas — viewBox stretches to fit the parent. 4:3 so
  // squarified tiles read well in both narrow and wide containers.
  const W = 400;
  const H = 300;

  // d3.treemap (squarified algorithm, well-tested) replaces a
  // hand-rolled version that was silently dropping tiles when the
  // remaining rectangle hit zero. d3 handles all 15 entity classes
  // including the tiny "no data" tiles at their floor value.
  type Tile = typeof tiles[number];
  type Node = { tile?: Tile; children?: Node[] };
  const root = d3
    .hierarchy<Node>({ children: tiles.map((t) => ({ tile: t })) }, (d) => d.children)
    .sum((d) => (d.tile ? d.tile.layoutValue : 0));
  d3.treemap<Node>()
    .size([W, H])
    .padding(1.5)
    .tile(d3.treemapSquarify.ratio(1))(root);

  const lays = (root.leaves() as d3.HierarchyRectangularNode<Node>[])
    .filter((n) => !!n.data.tile)
    .map((n) => ({
      tile: n.data.tile as Tile,
      x: n.x0,
      y: n.y0,
      w: n.x1 - n.x0,
      h: n.y1 - n.y0,
    }));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none">
      {lays.map((l) => {
        const label = l.tile.entity.replace("Ifc", "");
        const minDim = Math.min(l.w, l.h);
        const showLabel = minDim > 22;
        const showVal = minDim > 38;
        const isSel = selectedEntity === l.tile.entity;
        const isDim = selectedEntity !== null && !isSel;
        const noData = !l.tile.hasValue;
        // No-data tiles get a muted gray fill + a diagonal hatch so
        // they read as "class exists, no measurable m³ for this
        // metric" rather than competing visually with real data.
        const fill = noData ? "#a39e93" : l.tile.color;
        return (
          <g key={l.tile.entity} onClick={() => onPick(l.tile.entity)} className="cursor-pointer">
            <rect
              x={l.x}
              y={l.y}
              width={l.w}
              height={l.h}
              fill={fill}
              fillOpacity={noData ? 0.25 : isDim ? 0.35 : 0.85}
              stroke={isSel ? COLOR_CALLOUT : "#fafaf7"}
              strokeWidth={isSel ? 3 : 1.5}
              strokeDasharray={noData ? "3 2" : undefined}
            />
            {showLabel && (
              <text
                x={l.x + 4}
                y={l.y + 12}
                fill={noData ? "#56524a" : "#fff"}
                style={{ fontSize: 10, fontFamily: "system-ui, sans-serif", fontWeight: 600 }}
              >
                {label}
              </text>
            )}
            {showVal && (
              <text
                x={l.x + 4}
                y={l.y + 24}
                fill={noData ? "#56524a" : "#fff"}
                fillOpacity={noData ? 0.85 : 0.9}
                style={{ fontSize: 9, fontFamily: "system-ui, sans-serif" }}
              >
                {noData ? "no data" : `${l.tile.value.toFixed(1)} ${metricUnit}`}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function describeSel(s: ReturnType<typeof useSelection>["selection"]): string {
  if (!s) return "all";
  if (s.kind === "entity") return `${s.value}${s.storey_label ? ` @ ${s.storey_label}` : ""}`;
  if (s.kind === "storey") return `storey ${s.label ?? s.value.slice(0, 8)}`;
  if (s.kind === "type") return `type ${s.value}`;
  if (s.kind === "material") return `mat ${s.value}`;
  if (s.kind === "layer_set") return `set ${s.value}`;
  if (s.kind === "untyped") return "untyped";
  if (s.kind === "instance") {
    const label = s.name ?? s.value.slice(0, 10);
    return `${s.entity ?? "instance"} · ${label}`;
  }
  return "?";
}
