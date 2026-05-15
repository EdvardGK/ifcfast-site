"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { Minus, Plus, Maximize2 } from "lucide-react";
import { useSelection } from "./selection-context";

type Graph = {
  project_name: string | null;
  products: { guid: string; entity: string; storey_guid: string | null }[];
  storeys: { guid: string; name: string | null; elevation: number | null }[];
  buildings: { guid: string; name: string }[];
  sites: { guid: string; name: string }[];
  projects: { guid: string; name: string }[];
};

type Kind = "project" | "site" | "building" | "storey" | "type" | "product";
type N = {
  id: string;
  label?: string;
  kind: Kind;
  x: number;
  y: number;
  r: number;
  count?: number;
  entity?: string;
  storey_guid?: string;
};
type E = { from: string; to: string; weak?: boolean };

const FILL: Record<Kind, string> = {
  project: "var(--color-accent)",
  site: "var(--color-fg)",
  building: "var(--color-fg)",
  storey: "var(--color-fg)",
  type: "var(--color-muted)",
  product: "var(--color-muted)",
};
const SIZE: Record<Kind, number> = {
  project: 11, site: 8, building: 8, storey: 7, type: 5, product: 1.8,
};

const CANVAS = 540;
const C = CANVAS / 2;

export function VectorGraph({ src }: { src: string }) {
  const [data, setData] = useState<Graph | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const { selection, toggleEntity, toggleStorey, clear } = useSelection();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetch(src).then(r => r.json()).then(setData).catch(() => setData(null));
  }, [src]);

  // Compute the initial layout ONCE per data load. After that, nodes live in
  // state so the user can drag them around without the layout resetting on
  // every selection change.
  const initial = useMemo(() => (data ? buildLayout(data) : null), [data]);
  const [nodePos, setNodePos] = useState<Map<string, { x: number; y: number }>>(new Map());

  useEffect(() => {
    if (!initial) return;
    const m = new Map<string, { x: number; y: number }>();
    for (const n of initial.nodes) m.set(n.id, { x: n.x, y: n.y });
    setNodePos(m);
  }, [initial]);

  // viewBox state — pan + zoom over an effectively infinite plane.
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: CANVAS, h: CANVAS });
  const dragBg = useRef<{ x: number; y: number; vbX: number; vbY: number } | null>(null);
  const dragNode = useRef<{ id: string; startX: number; startY: number; offX: number; offY: number; moved: boolean } | null>(null);

  const resetView = useCallback(() => setViewBox({ x: 0, y: 0, w: CANVAS, h: CANVAS }), []);

  const zoomBy = useCallback((factor: number) => {
    setViewBox(vb => {
      const newW = Math.max(40, Math.min(CANVAS * 8, vb.w * factor));
      const newH = (newW / vb.w) * vb.h;
      const cx = vb.x + vb.w / 2;
      const cy = vb.y + vb.h / 2;
      const k = newW / vb.w;
      return { x: cx - (cx - vb.x) * k, y: cy - (cy - vb.y) * k, w: newW, h: newH };
    });
  }, []);

  // Wheel zoom around cursor. We bind on the wrapper div with a
  // non-passive listener so the browser doesn't scroll the page while
  // we're zooming the canvas.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = wrap.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = (e.clientY - rect.top) / rect.height;
      const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
      setViewBox(vb => {
        const cx = vb.x + nx * vb.w;
        const cy = vb.y + ny * vb.h;
        const newW = Math.max(40, Math.min(CANVAS * 8, vb.w * factor));
        const newH = (newW / vb.w) * vb.h;
        const k = newW / vb.w;
        return { x: cx - (cx - vb.x) * k, y: cy - (cy - vb.y) * k, w: newW, h: newH };
      });
    };
    wrap.addEventListener("wheel", onWheel, { passive: false });
    return () => wrap.removeEventListener("wheel", onWheel);
  }, []);

  function screenToLayout(clientX: number, clientY: number): { x: number; y: number } {
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    return {
      x: viewBox.x + ((clientX - rect.left) / rect.width) * viewBox.w,
      y: viewBox.y + ((clientY - rect.top) / rect.height) * viewBox.h,
    };
  }

  // ---- background pan -------------------------------------------------
  function onBgPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    // Only start bg pan if the target wasn't a node (we tag with data-node-id).
    const node = (e.target as Element).closest("[data-node-id]");
    if (node) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    dragBg.current = { x: e.clientX, y: e.clientY, vbX: viewBox.x, vbY: viewBox.y };
  }
  function onBgPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    if (dragNode.current) {
      const cur = screenToLayout(e.clientX, e.clientY);
      const node = dragNode.current;
      const newX = cur.x - node.offX;
      const newY = cur.y - node.offY;
      const dx = newX - node.startX;
      const dy = newY - node.startY;
      if (Math.hypot(dx, dy) > 3) node.moved = true;
      setNodePos(prev => {
        const next = new Map(prev);
        next.set(node.id, { x: newX, y: newY });
        return next;
      });
      return;
    }
    if (dragBg.current) {
      const dxPx = e.clientX - dragBg.current.x;
      const dyPx = e.clientY - dragBg.current.y;
      const dx = (dxPx / rect.width) * viewBox.w;
      const dy = (dyPx / rect.height) * viewBox.h;
      setViewBox(vb => ({ ...vb, x: dragBg.current!.vbX - dx, y: dragBg.current!.vbY - dy }));
    }
  }
  function onBgPointerUp() {
    dragBg.current = null;
    // dragNode is finalized in the node-level handler
  }

  function onNodePointerDown(e: React.PointerEvent, n: { id: string }) {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const cur = screenToLayout(e.clientX, e.clientY);
    const pos = nodePos.get(n.id);
    if (!pos) return;
    dragNode.current = {
      id: n.id,
      startX: pos.x,
      startY: pos.y,
      offX: cur.x - pos.x,
      offY: cur.y - pos.y,
      moved: false,
    };
  }
  function onNodePointerUp(e: React.PointerEvent, n: N) {
    if (!dragNode.current || dragNode.current.id !== n.id) return;
    const wasDrag = dragNode.current.moved;
    dragNode.current = null;
    if (wasDrag) return; // a real drag — don't fire click
    // Treat as click → cross-filter.
    if (n.kind === "type" && n.entity) toggleEntity(n.entity);
    else if (n.kind === "storey" && n.storey_guid) toggleStorey(n.storey_guid, n.label);
  }

  if (!data || !initial) {
    return (
      <div className="h-full flex items-center justify-center text-xs font-mono text-muted">
        loading...
      </div>
    );
  }
  const { edges } = initial;
  const allNodes = initial.nodes.map(n => {
    const p = nodePos.get(n.id);
    return p ? { ...n, x: p.x, y: p.y } : n;
  });

  // Compute highlight set from hover + selection.
  const highlight = new Set<string>();
  let hasFilter = false;
  if (hover) {
    hasFilter = true;
    highlight.add(hover);
    for (const e of edges) {
      if (e.from === hover) highlight.add(e.to);
      if (e.to === hover) highlight.add(e.from);
    }
  }
  if (selection?.kind === "entity") {
    hasFilter = true;
    for (const n of allNodes) {
      const isMatch =
        (n.kind === "type" && (n.entity ?? "").toLowerCase() === selection.value.toLowerCase()) ||
        (n.kind === "product" && (n.entity ?? "").toLowerCase() === selection.value.toLowerCase());
      if (isMatch) {
        highlight.add(n.id);
        for (const e of edges) {
          if (e.from === n.id) highlight.add(e.to);
          if (e.to === n.id) highlight.add(e.from);
        }
      }
    }
  }
  if (selection?.kind === "storey") {
    hasFilter = true;
    for (const n of allNodes) {
      const isMatch =
        (n.kind === "storey" && n.storey_guid === selection.value) ||
        (n.kind === "type" && n.id.startsWith(`t:${selection.value}::`)) ||
        (n.kind === "product" && n.storey_guid === selection.value);
      if (isMatch) {
        highlight.add(n.id);
        for (const e of edges) {
          if (e.from === n.id) highlight.add(e.to);
          if (e.to === n.id) highlight.add(e.from);
        }
      }
    }
  }
  const zoomPct = Math.round((CANVAS / viewBox.w) * 100);

  return (
    <div className="h-full flex flex-col bg-card">
      <div className="px-5 py-3 border-b border-line flex items-baseline justify-between">
        <div>
          <div className="text-xs font-mono text-muted uppercase tracking-wider">
            m.aggregates ∪ m.contained_in
          </div>
          <div className="text-sm font-medium">Relationship canvas</div>
        </div>
        {selection ? (
          <button onClick={clear} className="font-mono text-xs text-accent hover:underline">
            clear filter
          </button>
        ) : (
          <div className="font-mono text-xs text-muted">
            {allNodes.length}n · {edges.length}e
          </div>
        )}
      </div>
      <div
        ref={wrapRef}
        className="flex-1 overflow-hidden relative"
        style={{ background: "radial-gradient(ellipse at center, #f5f3ec 0%, #e9e6dc 100%)" }}
      >
        <div className="absolute top-2 right-2 z-10 flex flex-col gap-px bg-card/85 backdrop-blur border border-line rounded-md overflow-hidden">
          <button onClick={() => zoomBy(1 / 1.25)} className="p-1.5 hover:bg-bg/70 text-muted hover:text-fg" title="Zoom in">
            <Plus size={12} />
          </button>
          <button onClick={() => zoomBy(1.25)} className="p-1.5 hover:bg-bg/70 text-muted hover:text-fg border-t border-line" title="Zoom out">
            <Minus size={12} />
          </button>
          <button onClick={resetView} className="p-1.5 hover:bg-bg/70 text-muted hover:text-fg border-t border-line" title="Reset view">
            <Maximize2 size={12} />
          </button>
        </div>
        <div className="absolute bottom-2 right-2 z-10 text-[10px] font-mono text-muted tabular-nums bg-card/70 backdrop-blur border border-line rounded px-1.5 py-0.5">
          {zoomPct}%
        </div>
        <svg
          ref={svgRef}
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
          width="100%"
          height="100%"
          onPointerDown={onBgPointerDown}
          onPointerMove={onBgPointerMove}
          onPointerUp={onBgPointerUp}
          onPointerCancel={onBgPointerUp}
          style={{ cursor: dragBg.current ? "grabbing" : "grab", touchAction: "none", display: "block" }}
        >
          {edges.map((e, i) => {
            const a = allNodes.find(n => n.id === e.from)!;
            const b = allNodes.find(n => n.id === e.to)!;
            const isLit = !hasFilter || (highlight.has(e.from) && highlight.has(e.to));
            return (
              <line
                key={i}
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={isLit ? (e.weak ? "var(--color-muted)" : "var(--color-fg)") : "var(--color-line)"}
                strokeWidth={isLit ? (e.weak ? 0.5 : 1.1) : 0.4}
                opacity={isLit ? (e.weak ? 0.35 : 0.65) : 0.1}
                style={{ transition: "stroke 100ms, opacity 100ms" }}
              />
            );
          })}
          {allNodes.map(n => {
            const isLit = !hasFilter || highlight.has(n.id);
            const labelDx = (n.x > viewBox.x + viewBox.w / 2) ? n.r + 6 : -(n.r + 6);
            const showLabel = (n.kind !== "product" || isLit) && n.label;
            return (
              <g
                key={n.id}
                data-node-id={n.id}
                onPointerDown={(e) => onNodePointerDown(e, n)}
                onPointerUp={(e) => onNodePointerUp(e, n)}
                onMouseEnter={() => setHover(n.id)}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: n.kind === "type" || n.kind === "storey" ? "pointer" : "grab" }}
              >
                <circle
                  cx={n.x} cy={n.y} r={n.r}
                  fill={FILL[n.kind]}
                  opacity={isLit ? 1 : 0.12}
                  style={{ transition: "opacity 120ms" }}
                />
                {showLabel && (
                  <text
                    x={n.x + labelDx} y={n.y + 3}
                    textAnchor={labelDx > 0 ? "start" : "end"}
                    fontSize={n.kind === "type" ? "9" : "10"}
                    fontFamily="var(--font-mono)"
                    fill="var(--color-fg)"
                    opacity={isLit ? 1 : 0.4}
                    style={{ pointerEvents: "none", transition: "opacity 120ms" }}
                  >
                    {n.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="border-t border-line px-5 py-2 bg-bg/40 text-[11px] font-mono text-muted">
        {hover && allNodes.find(n => n.id === hover)?.label ? (
          <span>{allNodes.find(n => n.id === hover)!.label}</span>
        ) : (
          <span>drag bg to pan · wheel to zoom · drag a node to move it · click a type or storey to filter</span>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// Layout (computed once — node positions then live in state)
// ----------------------------------------------------------------------

function buildLayout(d: Graph): { nodes: N[]; edges: E[]; size: number } {
  const nodes: N[] = [];
  const edges: E[] = [];
  const project = d.projects[0];
  const site = d.sites[0];
  const building = d.buildings[0];

  if (project) nodes.push({ id: "p:" + project.guid, label: d.project_name || "Project", kind: "project", x: C, y: C, r: SIZE.project });
  if (site) {
    nodes.push({ id: "s:" + site.guid, label: site.name || "Site", kind: "site", x: C, y: C - 48, r: SIZE.site });
    if (project) edges.push({ from: "p:" + project.guid, to: "s:" + site.guid });
  }
  if (building) {
    nodes.push({ id: "b:" + building.guid, label: building.name || "Building", kind: "building", x: C, y: C - 80, r: SIZE.building });
    if (site) edges.push({ from: "s:" + site.guid, to: "b:" + building.guid });
  }

  const storeys = [...d.storeys].sort((a, b) => (b.elevation ?? 0) - (a.elevation ?? 0));
  const storeyArc = 0.85 * Math.PI;
  storeys.forEach((s, i) => {
    const angle = -Math.PI / 2 + (i + 0.5 - storeys.length / 2) * (storeyArc / Math.max(storeys.length, 1));
    nodes.push({
      id: "st:" + s.guid,
      label: s.name || "Storey",
      kind: "storey",
      x: C + Math.cos(angle) * 140,
      y: C + Math.sin(angle) * 140,
      r: SIZE.storey,
      storey_guid: s.guid,
    });
    if (building) edges.push({ from: "b:" + building.guid, to: "st:" + s.guid });
  });

  const productsByStorey = new Map<string, typeof d.products>();
  for (const p of d.products) {
    if (!p.storey_guid) continue;
    if (!productsByStorey.has(p.storey_guid)) productsByStorey.set(p.storey_guid, []);
    productsByStorey.get(p.storey_guid)!.push(p);
  }
  storeys.forEach((s) => {
    const stNode = nodes.find(n => n.id === "st:" + s.guid);
    if (!stNode) return;
    const baseAngle = Math.atan2(stNode.y - C, stNode.x - C);
    const products = productsByStorey.get(s.guid) ?? [];
    const byEntity = new Map<string, typeof d.products>();
    for (const p of products) {
      if (!byEntity.has(p.entity)) byEntity.set(p.entity, []);
      byEntity.get(p.entity)!.push(p);
    }
    const typeEntries = [...byEntity.entries()].sort((a, b) => b[1].length - a[1].length);
    const typeArc = Math.PI / 2.8;
    typeEntries.forEach(([entity, prods], ti) => {
      const offset = (ti + 0.5 - typeEntries.length / 2) * (typeArc / Math.max(typeEntries.length, 1));
      const tAngle = baseAngle + offset;
      const typeId = `t:${s.guid}::${entity}`;
      nodes.push({
        id: typeId,
        label: entity.replace(/^Ifc/, ""),
        kind: "type",
        x: C + Math.cos(tAngle) * 200,
        y: C + Math.sin(tAngle) * 200,
        r: SIZE.type + Math.min(prods.length / 6, 3),
        count: prods.length,
        entity,
      });
      edges.push({ from: "st:" + s.guid, to: typeId });
      const prodArc = (typeArc / typeEntries.length) * 0.78;
      prods.forEach((p, pi) => {
        const pOffset = prods.length > 1
          ? (pi + 0.5 - prods.length / 2) * (prodArc / prods.length)
          : 0;
        const pAngle = tAngle + pOffset;
        const pid = `prod:${p.guid}`;
        nodes.push({
          id: pid,
          kind: "product",
          x: C + Math.cos(pAngle) * 250,
          y: C + Math.sin(pAngle) * 250,
          r: SIZE.product,
          entity: p.entity,
          storey_guid: s.guid,
        });
        edges.push({ from: typeId, to: pid, weak: true });
      });
    });
  });

  return { nodes, edges, size: CANVAS };
}
