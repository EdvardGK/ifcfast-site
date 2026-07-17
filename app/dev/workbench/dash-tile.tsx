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
import { deriveLayerSets } from "@/components/layer-sets";

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

interface BundleFile {
  materials?: {
    guid: string;
    role: string;
    layer_index: number;
    material_name: string;
    layer_thickness_mm: number | null;
  }[];
}

export function DashTile({
  qtoSrc,
  graphSrc,
  bundleSrc,
}: {
  qtoSrc: string;
  graphSrc: string;
  /**
   * Optional bundle sidecar. When present, layered-construction data
   * (IfcMaterialLayerSet) is reconstructed from it so the LAYER SETS
   * KPI reflects the real stacks instead of a misleading 0 — the
   * graph.json the demo ships carries no layer-set assignments.
   */
  bundleSrc?: string;
}) {
  const [qto, setQto] = useState<QtoFile | null>(null);
  const [graph, setGraph] = useState<GraphFile | null>(null);
  const [bundle, setBundle] = useState<BundleFile | null>(null);
  const [metric, setMetric] = useState<Metric>("volume_m3");
  const { selection, toggleEntity, toggleMaterial, clear } = useSelection();

  useEffect(() => {
    fetch(qtoSrc).then((r) => r.json()).then(setQto).catch(() => setQto(null));
    fetch(graphSrc).then((r) => r.json()).then(setGraph).catch(() => setGraph(null));
  }, [qtoSrc, graphSrc]);

  useEffect(() => {
    if (!bundleSrc) {
      setBundle(null);
      return;
    }
    fetch(bundleSrc).then((r) => r.json()).then(setBundle).catch(() => setBundle(null));
  }, [bundleSrc]);

  // Reconstruct IfcMaterialLayerSet assignments from the bundle and
  // splice them onto the graph products. graph.json ships with
  // `layer_set: null` everywhere; the layered-wall data lives in the
  // bundle. Naming a layer set by the product's type_name matches the
  // QtoPanel convention ("Basic Wall:Interior - Partition…").
  const productsWithLayerSets = useMemo<GraphProduct[]>(() => {
    if (!graph) return [];
    if (!bundle) return graph.products;
    const typeNameByGuid = new Map(
      graph.products.map((p) => [p.guid, p.type_name ?? p.entity] as const),
    );
    const derived = deriveLayerSets(bundle, (guid) => typeNameByGuid.get(guid) ?? null);
    if (derived.layerSetByGuid.size === 0) return graph.products;
    return graph.products.map((p) =>
      derived.layerSetByGuid.has(p.guid)
        ? { ...p, layer_set: derived.layerSetByGuid.get(p.guid)! }
        : p,
    );
  }, [graph, bundle]);

  // Filter products against the current selection. Every downstream
  // aggregation reads from this list so KPIs, treemap and material
  // bars all stay in sync with whatever the user has filtered on.
  const filtered = useMemo<GraphProduct[]>(() => {
    if (!graph) return [];
    if (!selection) return productsWithLayerSets;
    return productsWithLayerSets.filter((p) => {
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
  }, [graph, selection, productsWithLayerSets]);

  // When the active selection came FROM this widget, the widget
  // keeps its full data and only highlights the picked element.
  // Other widgets adapt to the filter. This is the "click here →
  // others adapt, I stay" pattern: a treemap doesn't reduce itself
  // to a single tile when you click one of its tiles.
  const TREEMAP_SOURCE = "dash-treemap";
  const MATERIALS_SOURCE = "dash-materials";
  const isTreemapSource = selection?.source === TREEMAP_SOURCE;
  const isMaterialsSource = selection?.source === MATERIALS_SOURCE;

  // Per-entity stats. Geometry is partitioned EXACTLY ONCE: an
  // aggregate container (IfcRoof, IfcStair) carries `m_source =
  // "aggregate-rollup"` and its m³/m² are a copy of the child it
  // aggregates (an IfcSlab, an IfcStairFlight) which is itself a
  // separate product in the same set. Summing both double-counts the
  // same geometry — that's the Roof-under-Slab inflation in #7. We
  // therefore credit geometry only to the product that owns it
  // directly (`m_source !== "aggregate-rollup"`). The container still
  // appears as its own class with its own count and is flagged
  // `rolledUp` so the UI can render "geometry counted under the
  // aggregated child" rather than a misleading number.
  function aggregateByEntity(productSet: GraphProduct[]) {
    type Acc = { entity: string; count: number; m3: number; m2: number; rolledUp: boolean };
    const byEntity = new Map<string, Acc>();
    for (const p of productSet) {
      let row = byEntity.get(p.entity);
      if (!row) {
        row = { entity: p.entity, count: 0, m3: 0, m2: 0, rolledUp: false };
        byEntity.set(p.entity, row);
      }
      row.count += 1;
      const isRollup = p.m_source === "aggregate-rollup";
      if (isRollup) {
        row.rolledUp = true;
      } else {
        if (typeof p.m3 === "number") row.m3 += p.m3;
        if (typeof p.m2 === "number") row.m2 += p.m2;
      }
    }
    return [...byEntity.values()].map((r) => ({
      entity: r.entity,
      count: r.count,
      m3: r.m3,
      m2: r.m2,
      source: r.rolledUp ? "rollup" : "mesh",
    }));
  }

  // KPI tiles and the per-class table both read THIS set, which always
  // tracks the active scope (`filtered`). Keeping the KPIs off the
  // treemap's source-aware set is the fix for #8 bug 1: previously the
  // tiles shared the treemap's "stay full when I'm the source"
  // aggregation, so scoping by an IFC class (a treemap click) left the
  // VOLUME/AREA tiles showing whole-model totals while material scope
  // — which never set that source flag — updated them correctly.
  const scopedByEntity = useMemo(
    () => (graph ? aggregateByEntity(filtered) : []),
    [graph, filtered],
  );

  // Treemap stays full when it's the source of the current selection;
  // otherwise it narrows to scope. This is display-only behaviour and
  // must not leak into the KPI totals above.
  const treemapByEntity = useMemo(
    () => (graph ? aggregateByEntity(isTreemapSource ? productsWithLayerSets : filtered) : []),
    [graph, filtered, isTreemapSource, productsWithLayerSets],
  );

  // True if the model carries ANY layer-set assignment at all (after
  // bundle reconstruction). Lets the Layer-sets KPI tell "none in this
  // scope" apart from "this parse routed no layer-set data" — the
  // latter is the silent-empty case #8 bug 2 calls out, and must read
  // as an explicit unknown ("—"), not a confident zero.
  const modelHasLayerSets = useMemo(
    () => productsWithLayerSets.some((p) => !!p.layer_set),
    [productsWithLayerSets],
  );

  // KPIs (always recomputed against the filtered scope).
  const kpis = useMemo<
    { label: string; value: string; unit: string; title?: string }[]
  >(() => {
    const totalVolume = scopedByEntity.reduce((s, r) => s + r.m3, 0);
    const totalArea = scopedByEntity.reduce((s, r) => s + r.m2, 0);
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
      modelHasLayerSets
        ? { label: "Layer sets", value: String(layerSets), unit: "" }
        : {
            label: "Layer sets",
            value: "—",
            unit: "",
            title:
              "No IfcMaterialLayerSet data routed into this parse view. " +
              "The model may still carry layered constructions in its bundle sidecar.",
          },
      { label: "Classified", value: classifiedPct.toFixed(0), unit: "%" },
    ];
  }, [filtered, scopedByEntity, modelHasLayerSets]);

  // Treemap layout — squarified algorithm over the filtered class set
  // sized by the active metric. Colors come from the rangePalette
  // formula: N entities → N evenly-spaced colors from dark to light
  // along the DEFAULT_RANGE. Biggest entity → darkest. Same entity
  // can shade differently across views (its position-in-sorted-set
  // is what determines the slot); for cross-view consistency on the
  // graph and viewer we use stableEntityPalette instead.
  const treemap = useMemo(() => {
    const raw = treemapByEntity.map((r) => ({
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
  }, [treemapByEntity, metric]);

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
            title={k.title}
            className={`px-3 py-2.5 ${i < kpis.length - 1 ? "border-r border-line" : ""} ${i >= 3 ? "border-t border-line sm:border-t-0" : ""} ${k.title ? "cursor-help" : ""}`}
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
