"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useSelection } from "./selection-context";

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

type Mode = "type" | "untyped" | "material" | "layer_set";

export function QtoPanel({ src: _src, metaSrc }: { src: string; metaSrc?: string }) {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [mode, setMode] = useState<Mode>("type");
  const [expandedSets, setExpandedSets] = useState<Set<string>>(() => new Set());
  const { selection, toggleType, toggleMaterial, toggleLayerSet, toggleEntity, clear } = useSelection();

  useEffect(() => {
    if (!metaSrc) return;
    fetch(metaSrc).then(r => r.json()).then(setGraph).catch(() => setGraph(null));
  }, [metaSrc]);

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
  const scopedProducts = useMemo(() => {
    if (!graph) return [];
    return scopeStorey
      ? graph.products.filter(p => p.storey_guid === scopeStorey)
      : graph.products;
  }, [graph, scopeStorey]);

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
  type Row = { entity: string; value: string; count: number };
  type Group = { entity: string; total: number; rows: Row[] };

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
      const cur = acc.get(key);
      if (cur) cur.count += 1;
      else acc.set(key, { entity: p.entity, value: v, count: 1 });
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
      const cur = acc.get(key);
      if (cur) cur.count += 1;
      else acc.set(key, { entity: p.entity, value: v, count: 1 });
    }
    return groupRows([...acc.values()]);
  }, [scopedProducts]);

  const materialGroups = useMemo(() => {
    const acc = new Map<string, Row>();
    for (const p of scopedProducts) {
      for (const m of p.materials ?? []) {
        const key = `${p.entity}::${m}`;
        const cur = acc.get(key);
        if (cur) cur.count += 1;
        else acc.set(key, { entity: p.entity, value: m, count: 1 });
      }
    }
    return groupRows([...acc.values()]);
  }, [scopedProducts]);

  const layerSetGroups = useMemo(() => {
    const acc = new Map<string, Row>();
    for (const p of scopedProducts) {
      if (!p.layer_set) continue;
      const key = `${p.entity}::${p.layer_set}`;
      const cur = acc.get(key);
      if (cur) cur.count += 1;
      else acc.set(key, { entity: p.entity, value: p.layer_set, count: 1 });
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
      <div className="px-5 py-3 border-b border-line flex items-baseline justify-between">
        <div>
          <div className="text-xs font-mono text-muted uppercase tracking-wider">
            {mode === "type" ? "m.type_summary()"
              : mode === "untyped" ? "m.objects[~m.is_typed]"
              : mode === "material" ? "m.materials"
              : "m.material_layer_sets"}
          </div>
          <div className="text-sm font-medium">
            {mode === "type" ? "Types"
              : mode === "untyped" ? "Untyped"
              : mode === "material" ? "Materials"
              : "Layer sets"}
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
      <div className="px-5 py-2 border-b border-line bg-bg/40 flex flex-wrap items-center gap-1 text-[11px] font-mono">
        <ModeTab label="Types" active={mode === "type"} onClick={() => setMode("type")} />
        <ModeTab label="Untyped" active={mode === "untyped"} onClick={() => setMode("untyped")} />
        <ModeTab label="Materials" active={mode === "material"} onClick={() => setMode("material")} />
        <ModeTab label="Layer sets" active={mode === "layer_set"} onClick={() => setMode("layer_set")} />
        <span
          className="ml-auto text-muted truncate"
          title={
            mode === "type"
              ? "Products with an IfcRelDefinesByType link to an IfcTypeObject — the formal IFC type."
              : mode === "untyped"
              ? "Not related to an IfcTypeObject. Rows show the IfcXxx.ObjectType string instead (Revit's type-by-name export pattern)."
              : mode === "material"
              ? "Linked to an IfcMaterial via IfcRelAssociatesMaterial (single material, layer-set, profile-set, or constituent-set). A product can appear under several materials."
              : "Grouped by IfcMaterialLayerSet name — the named construction stack a wall/floor/roof carries (e.g. \"Basic Wall:Interior - Partition\")."
          }
        >
          {mode === "type" ? "linked to IfcTypeObject"
            : mode === "untyped" ? "not related to an IfcTypeObject"
            : mode === "material" ? "via IfcRelAssociatesMaterial"
            : "IfcMaterialLayerSet"}
        </span>
      </div>
      <div className="flex-1 overflow-auto scroll-thin">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr className="text-[10px] font-mono text-muted uppercase tracking-wider">
              <th className="text-left font-normal px-4 py-2 sticky top-0 z-30 bg-card border-b border-line">
                {mode === "material" ? "material"
                  : mode === "layer_set" ? "layer set"
                  : "name"}
              </th>
              <th className="text-right font-normal px-4 py-2 w-16 sticky top-0 z-30 bg-card border-b border-line">
                count
              </th>
            </tr>
          </thead>
          <tbody>
            {activeGroups.length === 0 && (
              <tr>
                <td colSpan={2} className="px-4 py-6 text-center text-muted text-[12px] font-mono">
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
                      className={`px-3 pt-2 pb-1 font-mono text-[11px] uppercase tracking-wider border-t border-line ${
                        isEntSel ? "text-accent font-medium" : "text-fg"
                      }`}
                    >
                      {g.entity}
                    </td>
                    <td
                      className={`px-4 pt-2 pb-1 text-right tabular-nums text-[11px] font-mono border-t border-line ${
                        isEntSel ? "text-accent" : "text-muted"
                      }`}
                    >
                      {g.total}
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
                              ? "bg-accent-soft text-fg"
                              : isDim
                              ? "opacity-35 hover:opacity-100 hover:bg-bg/60"
                              : "hover:bg-bg/60"
                          }`}
                        >
                          <td className={`pl-8 pr-4 py-1.5 font-mono text-[12px] ${isSel ? "text-accent font-medium" : ""}`}>
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
                          <td className="px-4 py-1.5 text-right tabular-nums">{r.count}</td>
                        </tr>
                        {isExpanded && lsDef && lsDef.layers.map((ly, i) => (
                          <tr key={`${g.entity}::${r.value}::layer-${i}`} className="bg-bg/30">
                            <td className="pl-16 pr-4 py-1 font-mono text-[11px] text-muted">
                              <span className="flex items-center gap-2">
                                <span className="tabular-nums w-12 text-right text-fg/70">
                                  {ly.thickness_mm.toFixed(0)} mm
                                </span>
                                <span className="truncate">{ly.material}</span>
                              </span>
                            </td>
                            <td className="px-4 py-1"></td>
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
      <div className="border-t border-line px-5 py-2 bg-bg/40 text-[11px] font-mono text-muted">
        {selection
          ? "↳ also filters the model and graph"
          : "click a row to filter across panels"}
      </div>
    </div>
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
