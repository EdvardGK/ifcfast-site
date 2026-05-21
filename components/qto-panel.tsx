"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useSelection } from "./selection-context";
import { FindingsView } from "./findings-view";

type Product = {
  guid: string;
  entity: string;
  name: string | null;
  storey_guid: string | null;
  typed?: boolean;
  type_name?: string;
  type_source?: "ifctype" | "objecttype" | "none";
  materials?: string[];
  layer_set?: string | null;
  m3?: number | null;
  m2?: number | null;
  lm?: number | null;
  is_external?: boolean | null;
  load_bearing?: boolean | null;
  fire_rating?: string | null;
};

type LayerSetDef = {
  layers: { material: string; thickness_mm: number }[];
  total_thickness_mm: number;
};

type Graph = {
  products: Product[];
  storeys: { guid: string; name: string | null }[];
  material_layer_sets?: Record<string, LayerSetDef>;
};

type QtoRow = {
  entity: string;
  count: number;
  area_m2: number | null;
  volume_m3: number | null;
};
type QtoFile = { rows: QtoRow[] };

type Mode = "type" | "untyped" | "material" | "layer_set" | "findings";

export function QtoPanel({ src, metaSrc, compact = false }: { src: string; metaSrc?: string; compact?: boolean }) {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [qto, setQto] = useState<QtoFile | null>(null);
  const [mode, setMode] = useState<Mode>("type");
  const [expandedSets, setExpandedSets] = useState<Set<string>>(() => new Set());
  const { selection, toggleType, toggleMaterial, toggleLayerSet, toggleEntity, clear } = useSelection();

  useEffect(() => {
    if (!metaSrc) return;
    fetch(metaSrc).then(r => r.json()).then(setGraph).catch(() => setGraph(null));
  }, [metaSrc]);

  useEffect(() => {
    fetch(src).then(r => r.json()).then(setQto).catch(() => setQto(null));
  }, [src]);

  const selectedType = selection?.kind === "type" ? selection.value : null;
  const selectedMaterial = selection?.kind === "material" ? selection.value : null;
  const selectedLayerSet = selection?.kind === "layer_set" ? selection.value : null;
  const selectedStorey = selection?.kind === "storey" ? selection.value : null;
  const selectedEntityStorey =
    selection?.kind === "entity" ? selection.storey_guid ?? null : null;
  const selectedEntityStoreyLabel =
    selection?.kind === "entity" ? selection.storey_label ?? null : null;

  // Storey scoping carries through from the spatial tree.
  const scopeStorey = selectedStorey ?? selectedEntityStorey ?? null;

  // Source-aware filtering. When QtoPanel itself triggered the active
  // selection (a click on one of its own type / material / layer-set
  // rows), the panel stays full and only highlights the picked row —
  // the "the widget you clicked doesn't change shape" rule. When the
  // selection came from elsewhere (treemap, viewer, graph), narrow
  // the visible row set so the panel reflects the active scope.
  const QTO_SOURCE = "qto-panel";
  const isOwnSelection = selection?.source === QTO_SOURCE;

  const scopedProducts = useMemo(() => {
    if (!graph) return [];
    if (!selection || isOwnSelection) {
      // No selection, or it came from this panel → no self-filtering.
      // Storey scoping from spatial tree clicks still applies though,
      // because that's the "show me only this floor" intent that
      // predates the cross-filter source mechanism.
      return scopeStorey
        ? graph.products.filter((p) => p.storey_guid === scopeStorey)
        : graph.products;
    }
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
  }, [graph, selection, isOwnSelection, scopeStorey]);

  // Per-mode aggregation. Type and Untyped split products by whether
  // an IfcRelDefinesByType link exists — that's the IFC-formal distinction.
  //   - Type:     products with type_source === "ifctype". Row key = IfcTypeObject.Name.
  //   - Untyped:  products with type_source !== "ifctype". Row key = ObjectType
  //               string (Revit's "type-by-name only" pattern); falls back to
  //               the entity class when even that's missing.
  // Materials: one product can carry several materials (e.g. wall layer sets);
  // it contributes one tick to each material it touches.
  // Each row is keyed by (entity, value). Rows are then grouped by entity
  // and rendered under an entity heading. The entity heading itself is
  // clickable — it selects all products of that entity class.
  // Row carries the aggregated QTO + pset attributes for the products
  // that fall under (entity, value). For booleans we count true / false /
  // null separately so a row showing "32 walls, 28 external + 4 not"
  // can render as a small composition badge instead of collapsing to
  // one value. FireRating is captured as the set of distinct strings
  // observed across the contributing products.
  type Row = {
    entity: string;
    value: string;
    count: number;
    m3: number;     // sum
    m2: number;     // sum
    lm: number;     // sum (longest extent)
    m3Coverage: number; // how many products contributed a non-null m3
    m2Coverage: number;
    lmCoverage: number;
    extTrue: number; extFalse: number; extNull: number;
    lbTrue: number; lbFalse: number; lbNull: number;
    fireRatings: Set<string>;
  };
  type Group = { entity: string; total: number; rows: Row[] };

  function emptyRow(entity: string, value: string): Row {
    return {
      entity, value, count: 0,
      m3: 0, m2: 0, lm: 0,
      m3Coverage: 0, m2Coverage: 0, lmCoverage: 0,
      extTrue: 0, extFalse: 0, extNull: 0,
      lbTrue: 0, lbFalse: 0, lbNull: 0,
      fireRatings: new Set<string>(),
    };
  }
  function addProduct(row: Row, p: Product) {
    row.count += 1;
    if (typeof p.m3 === "number") { row.m3 += p.m3; row.m3Coverage += 1; }
    if (typeof p.m2 === "number") { row.m2 += p.m2; row.m2Coverage += 1; }
    if (typeof p.lm === "number") { row.lm += p.lm; row.lmCoverage += 1; }
    if (p.is_external === true) row.extTrue += 1;
    else if (p.is_external === false) row.extFalse += 1;
    else row.extNull += 1;
    if (p.load_bearing === true) row.lbTrue += 1;
    else if (p.load_bearing === false) row.lbFalse += 1;
    else row.lbNull += 1;
    if (p.fire_rating) row.fireRatings.add(String(p.fire_rating));
  }

  function groupRows(rows: Row[]): Group[] {
    const byEnt = new Map<string, Group>();
    for (const r of rows) {
      const g = byEnt.get(r.entity)
        ?? (byEnt.set(r.entity, { entity: r.entity, total: 0, rows: [] }), byEnt.get(r.entity)!);
      g.rows.push(r);
      g.total += r.count;
    }
    for (const g of byEnt.values()) g.rows.sort((a, b) => b.count - a.count);
    return [...byEnt.values()].sort((a, b) => b.total - a.total);
  }

  const typeGroups = useMemo(() => {
    const acc = new Map<string, Row>();
    for (const p of scopedProducts) {
      if ((p.type_source ?? "none") !== "ifctype") continue;
      const v = p.type_name && p.type_name !== "" ? p.type_name : "—";
      const key = `${p.entity}::${v}`;
      let cur = acc.get(key);
      if (!cur) { cur = emptyRow(p.entity, v); acc.set(key, cur); }
      addProduct(cur, p);
    }
    return groupRows([...acc.values()]);
  }, [scopedProducts]);

  const untypedGroups = useMemo(() => {
    const acc = new Map<string, Row>();
    for (const p of scopedProducts) {
      if ((p.type_source ?? "none") === "ifctype") continue;
      const v = p.type_name && p.type_name !== "" && p.type_name !== "—"
        ? p.type_name
        : "(no name)";
      const key = `${p.entity}::${v}`;
      let cur = acc.get(key);
      if (!cur) { cur = emptyRow(p.entity, v); acc.set(key, cur); }
      addProduct(cur, p);
    }
    return groupRows([...acc.values()]);
  }, [scopedProducts]);

  const materialGroups = useMemo(() => {
    const acc = new Map<string, Row>();
    for (const p of scopedProducts) {
      for (const m of p.materials ?? []) {
        const key = `${p.entity}::${m}`;
        let cur = acc.get(key);
        if (!cur) { cur = emptyRow(p.entity, m); acc.set(key, cur); }
        addProduct(cur, p);
      }
    }
    return groupRows([...acc.values()]);
  }, [scopedProducts]);

  const layerSetGroups = useMemo(() => {
    const acc = new Map<string, Row>();
    for (const p of scopedProducts) {
      if (!p.layer_set) continue;
      const key = `${p.entity}::${p.layer_set}`;
      let cur = acc.get(key);
      if (!cur) { cur = emptyRow(p.entity, p.layer_set); acc.set(key, cur); }
      addProduct(cur, p);
    }
    return groupRows([...acc.values()]);
  }, [scopedProducts]);

  if (!graph) return <Loading />;

  const scopeLabel = scopeStorey
    ? selectedEntityStoreyLabel
      ?? graph.storeys.find(s => s.guid === scopeStorey)?.name
      ?? "storey"
    : null;

  const activeGroups =
    mode === "type" ? typeGroups
    : mode === "untyped" ? untypedGroups
    : mode === "material" ? materialGroups
    : layerSetGroups;
  const rowCount = activeGroups.reduce((s, g) => s + g.rows.length, 0);
  const itemLabel =
    mode === "type" ? "types"
    : mode === "untyped" ? "kinds"
    : mode === "material" ? "materials"
    : "layer sets";
  const selectedEntity = selection?.kind === "entity" ? selection.value : null;

  function handleRowClick(value: string) {
    if (mode === "material") return toggleMaterial(value);
    if (mode === "layer_set") return toggleLayerSet(value);
    return toggleType(value);
  }
  function rowSelectedValue(): string | null {
    if (mode === "material") return selectedMaterial;
    if (mode === "layer_set") return selectedLayerSet;
    return selectedType;
  }

  return (
    <div className="h-full flex flex-col bg-card">
      {!compact && (
        <div className="px-5 py-3 border-b border-line flex items-baseline justify-between">
          <div>
            <div className="text-xs font-mono text-muted uppercase tracking-wider">
              {mode === "type" ? "m.type_summary()"
                : mode === "untyped" ? "m.objects[~m.is_typed]"
                : mode === "material" ? "m.materials"
                : mode === "layer_set" ? "m.material_layer_sets"
                : "m.findings()"}
            </div>
            <div className="text-sm font-medium">
              {mode === "type" ? "Types"
                : mode === "untyped" ? "Untyped"
                : mode === "material" ? "Materials"
                : mode === "layer_set" ? "Layer sets"
                : "Findings"}
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
              {rowCount} {itemLabel}
            </div>
          )}
        </div>
      )}
      <div className="px-5 py-2 border-b border-line bg-bg/40 flex flex-wrap items-center gap-1 text-[11px] font-mono">
        <ModeTab label="Types" active={mode === "type"} onClick={() => setMode("type")} />
        <ModeTab label="Untyped" active={mode === "untyped"} onClick={() => setMode("untyped")} />
        <ModeTab label="Materials" active={mode === "material"} onClick={() => setMode("material")} />
        <ModeTab label="Layer sets" active={mode === "layer_set"} onClick={() => setMode("layer_set")} />
        <ModeTab label="Findings" active={mode === "findings"} onClick={() => setMode("findings")} />
        <span
          className="ml-auto text-muted truncate"
          title={
            mode === "type"
              ? "Products with an IfcRelDefinesByType link to an IfcTypeObject — the formal IFC type."
              : mode === "untyped"
              ? "Not related to an IfcTypeObject. Rows show the IfcXxx.ObjectType string instead (Revit's type-by-name export pattern)."
              : mode === "material"
              ? "Linked to an IfcMaterial via IfcRelAssociatesMaterial (single material, layer-set, profile-set, or constituent-set). A product can appear under several materials."
              : mode === "layer_set"
              ? "Grouped by IfcMaterialLayerSet name — the named construction stack a wall/floor/roof carries (e.g. \"Basic Wall:Interior - Partition\")."
              : "Structural integrity findings derived from the IFC + ifcfast's self-report. Click a row to highlight affected products everywhere."
          }
        >
          {mode === "type" ? "linked to IfcTypeObject"
            : mode === "untyped" ? "not related to an IfcTypeObject"
            : mode === "material" ? "via IfcRelAssociatesMaterial"
            : mode === "layer_set" ? "IfcMaterialLayerSet"
            : "QC · expose, don't curate"}
        </span>
      </div>
      {mode === "findings" ? (
        <FindingsView qto={qto} graph={graph} toggleEntity={toggleEntity} selection={selection} />
      ) : (
      <div className="flex-1 overflow-auto scroll-thin">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr className="text-[10px] font-mono text-muted uppercase tracking-wider">
              <th className="text-left font-normal px-3 py-2 sticky top-0 z-30 bg-card border-b border-line">
                {mode === "material" ? "material"
                  : mode === "layer_set" ? "layer set"
                  : "name"}
              </th>
              <th className="text-right font-normal px-2 py-2 w-12 sticky top-0 z-30 bg-card border-b border-line">n</th>
              <th className="text-right font-normal px-2 py-2 w-16 sticky top-0 z-30 bg-card border-b border-line">m³</th>
              <th className="text-right font-normal px-2 py-2 w-16 sticky top-0 z-30 bg-card border-b border-line">m²</th>
              <th className="text-right font-normal px-2 py-2 w-14 sticky top-0 z-30 bg-card border-b border-line">m</th>
              <th className="text-center font-normal px-2 py-2 w-14 sticky top-0 z-30 bg-card border-b border-line" title="IsExternal · true / false / unknown counts">ext</th>
              <th className="text-center font-normal px-2 py-2 w-14 sticky top-0 z-30 bg-card border-b border-line" title="LoadBearing · true / false / unknown counts">lb</th>
              <th className="text-left font-normal px-2 py-2 w-20 sticky top-0 z-30 bg-card border-b border-line" title="FireRating values observed across products in this row">fire</th>
            </tr>
          </thead>
          <tbody>
            {activeGroups.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-muted text-[12px] font-mono">
                  nothing in this scope
                </td>
              </tr>
            )}
            {activeGroups.map(g => {
              const isEntSel = selectedEntity === g.entity;
              const selVal = rowSelectedValue();
              return (
                <Fragment key={g.entity}>
                  <tr
                    onClick={() => toggleEntity(g.entity)}
                    className={`cursor-pointer transition-colors ${
                      isEntSel
                        ? "bg-accent-soft"
                        : "bg-bg hover:bg-bg/80"
                    }`}
                    title={`Click to filter every ${g.entity} across panels`}
                  >
                    <td
                      colSpan={8}
                      className={`px-3 pt-2 pb-1 font-mono text-[11px] uppercase tracking-wider border-t border-line ${
                        isEntSel ? "text-accent font-medium" : "text-fg"
                      }`}
                    >
                      <span className="inline-flex items-center gap-2">
                        <span>{g.entity}</span>
                        <span className={`tabular-nums text-[10px] ${isEntSel ? "text-accent" : "text-muted"}`}>
                          {g.total}
                        </span>
                      </span>
                    </td>
                  </tr>
                  {g.rows.map(r => {
                    const isSel = selVal === r.value;
                    const isDim = selVal !== null && !isSel;
                    const lsDef =
                      mode === "layer_set"
                        ? graph.material_layer_sets?.[r.value]
                        : undefined;
                    const isExpanded = mode === "layer_set" && expandedSets.has(r.value);
                    const detail =
                      lsDef
                        ? `${lsDef.layers.length} layers · ${lsDef.total_thickness_mm.toFixed(0)} mm`
                        : null;
                    return (
                      <Fragment key={`${g.entity}::${r.value}`}>
                        <tr
                          onClick={() => handleRowClick(r.value)}
                          className={`cursor-pointer transition-colors ${
                            isSel
                              ? "text-fg"
                              : isDim
                              ? "opacity-35 hover:opacity-100 hover:bg-bg/60"
                              : "hover:bg-bg/60"
                          }`}
                          style={isSel ? { background: "var(--color-accent-soft, #fce8d4)" } : undefined}
                        >
                          <td className={`pl-8 pr-3 py-1.5 font-mono text-[12px] ${isSel ? "text-accent font-medium" : ""}`}>
                            <span className="flex items-center gap-2 min-w-0">
                              {lsDef && (
                                <button
                                  onClick={e => {
                                    e.stopPropagation();
                                    setExpandedSets(s => {
                                      const n = new Set(s);
                                      if (n.has(r.value)) n.delete(r.value);
                                      else n.add(r.value);
                                      return n;
                                    });
                                  }}
                                  className="text-muted hover:text-fg flex-none w-3 text-center"
                                  aria-label={isExpanded ? "Collapse layers" : "Expand layers"}
                                >
                                  {isExpanded ? "▾" : "▸"}
                                </button>
                              )}
                              <span className="truncate">{r.value}</span>
                              {detail && (
                                <span className="ml-auto pl-3 text-[10px] text-muted whitespace-nowrap flex-none">
                                  {detail}
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-[11px]">{r.count}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-[11px]" title={`${r.m3Coverage}/${r.count} meshed`}>
                            {r.m3Coverage > 0 ? r.m3.toFixed(1) : <span className="text-muted">—</span>}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-[11px]" title={`${r.m2Coverage}/${r.count} meshed`}>
                            {r.m2Coverage > 0 ? r.m2.toFixed(1) : <span className="text-muted">—</span>}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-[11px]" title={`Sum of longest-axis (max extent) across ${r.lmCoverage}/${r.count} meshed products`}>
                            {r.lmCoverage > 0 ? r.lm.toFixed(1) : <span className="text-muted">—</span>}
                          </td>
                          <td className="px-2 py-1.5 text-center text-[10px] tabular-nums">
                            <BoolBadge t={r.extTrue} f={r.extFalse} n={r.extNull} />
                          </td>
                          <td className="px-2 py-1.5 text-center text-[10px] tabular-nums">
                            <BoolBadge t={r.lbTrue} f={r.lbFalse} n={r.lbNull} />
                          </td>
                          <td className="px-2 py-1.5 text-left text-[10px] font-mono text-muted">
                            {r.fireRatings.size === 0
                              ? "—"
                              : r.fireRatings.size === 1
                              ? [...r.fireRatings][0]
                              : `${r.fireRatings.size} vals`}
                          </td>
                        </tr>
                        {isExpanded && lsDef && lsDef.layers.map((ly, i) => (
                          <tr key={`${g.entity}::${r.value}::layer-${i}`} className="bg-bg/30">
                            <td colSpan={8} className="pl-16 pr-4 py-1 font-mono text-[11px] text-muted">
                              <span className="flex items-center gap-2">
                                <span className="tabular-nums w-12 text-right text-fg/70">
                                  {ly.thickness_mm.toFixed(0)} mm
                                </span>
                                <span className="truncate">{ly.material}</span>
                              </span>
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      )}
      {!compact && mode !== "findings" && (
        <div className="border-t border-line px-5 py-2 bg-bg/40 text-[11px] font-mono text-muted">
          {selection
            ? "↳ also filters the model and graph"
            : "click a row to filter across panels"}
        </div>
      )}
    </div>
  );
}

/**
 * Compact tri-state badge for boolean pset attributes (IsExternal /
 * LoadBearing). Shows true/false/null counts as a stacked
 * dash-separated triple — keeps the column narrow while making the
 * composition visible. "32·4·12" means 32 true, 4 false, 12 unknown.
 * Pure null → muted dash so the absence is visible, not hidden.
 */
function BoolBadge({ t, f, n }: { t: number; f: number; n: number }) {
  if (t === 0 && f === 0 && n === 0) return <span className="text-muted">—</span>;
  if (t > 0 && f === 0 && n === 0) return <span className="text-fg">{t} ✓</span>;
  if (f > 0 && t === 0 && n === 0) return <span className="text-fg">{f} ✗</span>;
  if (n > 0 && t === 0 && f === 0) return <span className="text-muted">{n} —</span>;
  return (
    <span className="text-fg" title={`${t} true · ${f} false · ${n} unknown`}>
      {t}·{f}·{n}
    </span>
  );
}

function ModeTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 rounded uppercase tracking-wider transition-colors ${
        active ? "bg-fg text-bg" : "text-muted hover:text-fg"
      }`}
    >
      {label}
    </button>
  );
}

function Loading() {
  return (
    <div className="h-full flex items-center justify-center text-xs font-mono text-muted">
      loading...
    </div>
  );
}
