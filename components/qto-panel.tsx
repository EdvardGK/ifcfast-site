"use client";

import { useEffect, useMemo, useState } from "react";
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
};

type Graph = {
  products: Product[];
  storeys: { guid: string; name: string | null }[];
};

type Mode = "type" | "material";

export function QtoPanel({ src: _src, metaSrc }: { src: string; metaSrc?: string }) {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [mode, setMode] = useState<Mode>("type");
  const { selection, toggleType, toggleMaterial, clear } = useSelection();

  useEffect(() => {
    if (!metaSrc) return;
    fetch(metaSrc).then(r => r.json()).then(setGraph).catch(() => setGraph(null));
  }, [metaSrc]);

  const selectedType = selection?.kind === "type" ? selection.value : null;
  const selectedMaterial = selection?.kind === "material" ? selection.value : null;
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

  // Per-mode aggregation: type-name → count + entity hint + type_source.
  // For materials, count instances that reference each material (one product
  // can carry several materials — e.g. wall layer sets — and contributes
  // one tick to each material it touches).
  const typeRows = useMemo(() => {
    type T = { type_name: string; count: number; entity: string; source: string };
    const acc = new Map<string, T>();
    for (const p of scopedProducts) {
      const k = p.type_name && p.type_name !== "" ? p.type_name : "—";
      const cur = acc.get(k);
      if (cur) { cur.count += 1; }
      else acc.set(k, { type_name: k, count: 1, entity: p.entity, source: p.type_source ?? "none" });
    }
    return [...acc.values()].sort((a, b) => b.count - a.count);
  }, [scopedProducts]);

  const materialRows = useMemo(() => {
    const acc = new Map<string, number>();
    for (const p of scopedProducts) {
      for (const m of p.materials ?? []) acc.set(m, (acc.get(m) ?? 0) + 1);
    }
    return [...acc.entries()]
      .map(([material, count]) => ({ material, count }))
      .sort((a, b) => b.count - a.count);
  }, [scopedProducts]);

  if (!graph) return <Loading />;

  const scopeLabel = scopeStorey
    ? selectedEntityStoreyLabel
      ?? graph.storeys.find(s => s.guid === scopeStorey)?.name
      ?? "storey"
    : null;

  const rowCount = mode === "type" ? typeRows.length : materialRows.length;
  const productsWithoutMaterial = scopedProducts.length - new Set(
    scopedProducts.filter(p => (p.materials?.length ?? 0) > 0).map(p => p.guid)
  ).size;

  return (
    <div className="h-full flex flex-col bg-card">
      <div className="px-5 py-3 border-b border-line flex items-baseline justify-between">
        <div>
          <div className="text-xs font-mono text-muted uppercase tracking-wider">
            {mode === "type" ? "m.type_summary()" : "m.materials"}
          </div>
          <div className="text-sm font-medium">
            {mode === "type" ? "Types" : "Materials"}
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
            {rowCount} {mode === "type" ? "types" : "materials"}
          </div>
        )}
      </div>
      <div className="px-5 py-2 border-b border-line bg-bg/40 flex items-center gap-1 text-[11px] font-mono">
        <ModeTab label="Type" active={mode === "type"} onClick={() => setMode("type")} />
        <ModeTab label="Material" active={mode === "material"} onClick={() => setMode("material")} />
        <span className="ml-auto text-muted">
          {mode === "type"
            ? <span title="IfcTypeObject when present, ObjectType string otherwise. Dot indicates type source.">
                ● IfcType · ○ name-only
              </span>
            : <span title="Products with no IfcRelAssociatesMaterial association.">
                {productsWithoutMaterial} w/o material
              </span>}
        </span>
      </div>
      <div className="flex-1 overflow-auto scroll-thin">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card border-b border-line">
            <tr className="text-[10px] font-mono text-muted uppercase tracking-wider">
              <th className="text-left font-normal px-4 py-2">
                {mode === "type" ? "type" : "material"}
              </th>
              <th className="text-right font-normal px-4 py-2 w-16">count</th>
              <th className="text-left font-normal px-4 py-2 w-28 text-muted/70">
                {mode === "type" ? "entity" : ""}
              </th>
            </tr>
          </thead>
          <tbody>
            {mode === "type" && typeRows.map(r => {
              const isSel = selectedType === r.type_name;
              const isDim = selectedType !== null && !isSel;
              const dotClass = r.source === "ifctype" ? "bg-fg" : "bg-transparent border border-muted";
              return (
                <tr
                  key={r.type_name}
                  onClick={() => toggleType(r.type_name)}
                  className={`border-b border-line/60 cursor-pointer transition-colors ${
                    isSel
                      ? "bg-accent-soft text-fg"
                      : isDim
                      ? "opacity-35 hover:opacity-100 hover:bg-bg/60"
                      : "hover:bg-bg/60"
                  }`}
                  title={
                    r.source === "ifctype"
                      ? "Linked to an IfcTypeObject via IfcRelDefinesByType"
                      : r.source === "objecttype"
                      ? "Type-by-name only — IFC's ObjectType string, no IfcTypeObject"
                      : "No type info"
                  }
                >
                  <td className={`px-4 py-2 font-mono text-[12px] flex items-center gap-2 ${isSel ? "text-accent font-medium" : ""}`}>
                    <span className={`inline-block w-1.5 h-1.5 rounded-full flex-none ${dotClass}`}></span>
                    <span className="truncate">{r.type_name}</span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.count}</td>
                  <td className="px-4 py-2 font-mono text-[11px] text-muted truncate">{r.entity}</td>
                </tr>
              );
            })}
            {mode === "material" && materialRows.map(r => {
              const isSel = selectedMaterial === r.material;
              const isDim = selectedMaterial !== null && !isSel;
              return (
                <tr
                  key={r.material}
                  onClick={() => toggleMaterial(r.material)}
                  className={`border-b border-line/60 cursor-pointer transition-colors ${
                    isSel
                      ? "bg-accent-soft text-fg"
                      : isDim
                      ? "opacity-35 hover:opacity-100 hover:bg-bg/60"
                      : "hover:bg-bg/60"
                  }`}
                >
                  <td className={`px-4 py-2 font-mono text-[12px] ${isSel ? "text-accent font-medium" : ""}`}>
                    {r.material}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.count}</td>
                  <td className="px-4 py-2"></td>
                </tr>
              );
            })}
            {mode === "material" && materialRows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-muted text-[12px] font-mono">
                  no materials in this scope
                </td>
              </tr>
            )}
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
