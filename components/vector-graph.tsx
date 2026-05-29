"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { useSelection } from "./selection-context";
import {
  stableEntityPalette,
  COLOR_CALLOUT,
  DEFAULT_RANGE,
} from "./ifc-palette";

type Product = {
  guid: string;
  entity: string;
  name: string | null;
  storey_guid: string | null;
  type_name?: string;
  type_source?: "ifctype" | "objecttype" | "none";
  materials?: string[];
  layer_set?: string | null;
};
type Storey = { guid: string; name: string | null; elevation?: number | null };
type Building = { guid: string; name: string };
type Site = { guid: string; name: string };
type Project = { guid: string; name: string };

type Graph = {
  project_name: string | null;
  products: Product[];
  storeys: Storey[];
  buildings: Building[];
  sites: Site[];
  projects: Project[];
  contained_in: { product_guid: string; storey_guid: string }[];
  aggregates: { child_guid: string; parent_guid: string; parent_kind: string }[];
  storey_building: { storey_guid: string; building_guid: string }[];
  voids?: { opening_guid: string; host_guid: string }[];
};

type NodeKind = "project" | "site" | "building" | "storey" | "product";

type Node = d3.SimulationNodeDatum & {
  id: string;
  kind: NodeKind;
  entity: string;
  name: string;
  storey_guid: string | null;
  // Product-only fields, populated for nodes with kind === "product".
  // Needed for cross-filter from QtoPanel (type / material / layer_set /
  // untyped selections — see isMatch). Other node kinds leave these unset.
  type_name?: string;
  type_source?: "ifctype" | "objecttype" | "none";
  materials?: string[];
  layer_set?: string | null;
};

type Link = d3.SimulationLinkDatum<Node> & {
  kind: "agg" | "cont" | "void";
};

// Color per entity class derived from the shared palette formula in
// ifc-palette. stableEntityPalette gives the same class the same
// color across runs and across visualizations, so a node coloured
// rust-mid in the spatial graph reads the same way in the dash
// treemap. Selection state uses COLOR_CALLOUT (teal, complementary
// to the rust accent) — reserved exclusively for "you focused this".
let _colorMap: Map<string, string> | null = null;
function rebuildColorMap(entities: string[]) {
  _colorMap = stableEntityPalette(entities, DEFAULT_RANGE);
}
const colorFor = (e: string) => _colorMap?.get(e) ?? "#7a7975";

const RADIUS: Record<string, number> = {
  IfcProject: 14, IfcSite: 12, IfcBuilding: 10, IfcBuildingStorey: 8,
  IfcSpace: 6, IfcElementAssembly: 5,
};
const radiusFor = (e: string) => RADIUS[e] ?? 3;

const LABEL_ENTITIES = new Set(["IfcProject", "IfcSite", "IfcBuilding", "IfcBuildingStorey"]);

export function VectorGraph({ src, compact = false }: { src: string; compact?: boolean }) {
  const [data, setData] = useState<Graph | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const { selection, toggleEntity, toggleStorey, toggleInstance, clear } = useSelection();
  // We need the live selection inside d3 callbacks without re-binding the
  // simulation on every selection change — keep a ref.
  const selectionRef = useRef(selection);
  useEffect(() => { selectionRef.current = selection; }, [selection]);

  useEffect(() => {
    fetch(src).then(r => r.json()).then(setData).catch(() => setData(null));
  }, [src]);

  const built = useMemo(() => {
    if (!data) return null;
    const g = buildGraph(data);
    // Seed the shared color map with every entity class present in
    // this graph — derived colors stay stable for the lifetime of
    // this view so the same node doesn't shift hue on re-render.
    rebuildColorMap(g.nodes.map((n) => n.entity));
    return g;
  }, [data]);

  // Force simulation: built once per data load. Re-renders driven by ticks
  // mutate node x/y in place — React doesn't re-render those.
  useEffect(() => {
    if (!built || !wrapRef.current || !svgRef.current) return;
    const { nodes, links } = built;

    const wrap = wrapRef.current;
    const svgEl = svgRef.current;

    // DataTabs hides inactive tabs with display:none, which means the wrap
    // can have zero width/height at mount. Fall back to a sane default so
    // the sim has a centre to settle around; a ResizeObserver below
    // re-centres once the tab actually shows.
    const sizeOf = () => {
      const r = wrap.getBoundingClientRect();
      return { w: Math.max(r.width, 400), h: Math.max(r.height, 400) };
    };
    let { w: W, h: H } = sizeOf();

    // Let the SVG fill the wrapper via CSS; we only need width/height
    // numerically for the sim's centre force.
    const svg = d3.select(svgEl)
      .attr("width", "100%")
      .attr("height", "100%")
      .attr("viewBox", `0 0 ${W} ${H}`);
    svg.selectAll("*").remove();
    const root = svg.append("g");

    // Pan / zoom.
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 8])
      .on("zoom", (e) => root.attr("transform", e.transform.toString()));
    svg.call(zoom);

    const link = root.append("g").selectAll("line")
      .data(links).join("line")
      .attr("class", d => "ifcfast-link " + d.kind)
      // Three link kinds, theme-aligned strokes. Visual hierarchy:
      //   agg  (solid mid-warm)  — strongest structural relationship
      //   cont (dashed light)    — product → storey containment
      //   void (dotted rust)     — opening cuts into host element
      .attr("stroke", d =>
        d.kind === "agg" ? "#9a948b"
          : d.kind === "void" ? "#e07c2f"
          : "#bdb6ab",
      )
      .attr("stroke-dasharray", d =>
        d.kind === "cont" ? "2 3"
          : d.kind === "void" ? "1 2"
          : "",
      )
      .attr("stroke-width", d => d.kind === "agg" ? 1.0 : 0.7)
      .attr("stroke-opacity", d => d.kind === "void" ? 0.5 : 0.75);

    const node = root.append("g").selectAll<SVGCircleElement, Node>("circle")
      .data(nodes).join("circle")
      .attr("class", "ifcfast-node")
      .attr("r", d => radiusFor(d.entity))
      .attr("fill", d => colorFor(d.entity))
      // Subtle warm-dark stroke instead of pure black — lets the cream
      // background read as a paper-like field rather than a hard contrast.
      .attr("stroke", "rgba(13,13,12,0.45)")
      .attr("stroke-width", 0.8)
      .style("cursor", "pointer")
      .on("mouseenter", (e, d) => {
        const tip = wrap.querySelector(".ifcfast-tip") as HTMLDivElement | null;
        if (!tip) return;
        tip.style.display = "block";
        tip.textContent = `${d.entity} · ${d.name}`;
      })
      .on("mousemove", (e) => {
        const tip = wrap.querySelector(".ifcfast-tip") as HTMLDivElement | null;
        if (!tip) return;
        const wr = wrap.getBoundingClientRect();
        tip.style.left = (e.clientX - wr.left + 12) + "px";
        tip.style.top = (e.clientY - wr.top + 12) + "px";
      })
      .on("mouseleave", () => {
        const tip = wrap.querySelector(".ifcfast-tip") as HTMLDivElement | null;
        if (tip) tip.style.display = "none";
      })
      .on("click", (e, d) => {
        e.stopPropagation();
        // Modifier-click on a product node falls back to entity-class
        // filter (old behaviour); plain click drills to the specific
        // instance guid. Storey clicks stay storey-level.
        const wantEntityClass = (e as MouseEvent).shiftKey || (e as MouseEvent).altKey;
        if (d.kind === "storey") {
          toggleStorey(d.id, d.name, "vector-graph");
        } else if (d.kind === "product") {
          if (wantEntityClass) {
            toggleEntity(d.entity, d.storey_guid ?? undefined, undefined, "vector-graph");
          } else {
            toggleInstance(d.id, {
              entity: d.entity,
              storey_guid: d.storey_guid ?? undefined,
              name: d.name,
              source: "vector-graph",
            });
          }
        }
        // project / site / building click clears.
        else clear();
      });

    // Empty-canvas click clears any selection.
    svg.on("click", () => clear());

    const label = root.append("g").selectAll<SVGTextElement, Node>("text")
      .data(nodes.filter(n => LABEL_ENTITIES.has(n.entity)))
      .join("text")
      .text(d => d.name || d.entity)
      .attr("dy", -10)
      .attr("text-anchor", "middle")
      .attr("font-family", "ui-monospace, monospace")
      .attr("font-size", 9)
      .attr("fill", "#3d3a35")
      .attr("pointer-events", "none");

    const sim = d3.forceSimulation<Node>(nodes)
      .force("link", d3.forceLink<Node, Link>(links).id(d => d.id)
        .distance(d => d.kind === "agg" ? 22 : 32).strength(0.55))
      .force("charge", d3.forceManyBody<Node>().strength(-22))
      .force("center", d3.forceCenter(W / 2, H / 2))
      .force("collide", d3.forceCollide<Node>().radius(d => radiusFor(d.entity) + 2))
      .alphaDecay(0.025)
      .on("tick", () => {
        link
          .attr("x1", d => (d.source as Node).x ?? 0)
          .attr("y1", d => (d.source as Node).y ?? 0)
          .attr("x2", d => (d.target as Node).x ?? 0)
          .attr("y2", d => (d.target as Node).y ?? 0);
        node.attr("cx", d => d.x ?? 0).attr("cy", d => d.y ?? 0);
        label.attr("x", d => d.x ?? 0).attr("y", d => d.y ?? 0);
      });

    node.call(
      d3.drag<SVGCircleElement, Node>()
        .on("start", (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on("drag",  (e, d) => { d.fx = e.x; d.fy = e.y; })
        .on("end",   (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; })
    );

    // When a filter fires, frame the highlighted nodes to fit. A filter only
    // changes opacity/stroke — leaving the camera put means matches can light
    // up scattered, mostly off-frame, with the view looking unchanged just
    // because one match happens to be on screen. So always animate the camera
    // to fit the full set of matches into the viewport.
    const ensureMatchVisible = () => {
      const sel = selectionRef.current;
      if (!sel) return; // a clear() shouldn't move the camera
      const matches = nodes.filter(
        n => isMatch(n, sel) && Number.isFinite(n.x) && Number.isFinite(n.y),
      );
      if (matches.length === 0) return;

      const t = d3.zoomTransform(svgEl);

      // Fit all matches: bbox in graph space → a transform that fits it
      // into the viewport with margin, clamped to the zoom scale extent.
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const n of matches) {
        x0 = Math.min(x0, n.x!); y0 = Math.min(y0, n.y!);
        x1 = Math.max(x1, n.x!); y1 = Math.max(y1, n.y!);
      }
      const bw = Math.max(x1 - x0, 1e-3);
      const bh = Math.max(y1 - y0, 1e-3);
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const margin = 48;
      let k = Math.min((W - 2 * margin) / bw, (H - 2 * margin) / bh);
      if (!Number.isFinite(k) || k <= 0) k = 1.5;
      // A single node (or tiny cluster) yields a huge fit-scale; cap it so
      // we recenter at a readable zoom rather than slamming to max.
      if (bw < 2 && bh < 2) k = Math.min(k, Math.max(t.k, 1.6));
      k = Math.max(0.1, Math.min(8, k)); // respect zoom.scaleExtent
      const target = d3.zoomIdentity
        .translate(W / 2 - k * cx, H / 2 - k * cy)
        .scale(k);
      svg.transition().duration(500).call(zoom.transform, target);
    };

    // Apply current selection on initial mount, and react to changes by
    // updating opacities/strokes without rebuilding the simulation.
    const applySelection = () => {
      const sel = selectionRef.current;
      node
        .attr("opacity", n => isMatch(n, sel) ? 1.0 : 0.15)
        // Selected node gets the callout stroke (teal — complementary
        // to the rust accent) + a bumped radius so partial-match
        // selections (e.g. "type X" matching 18 of 268 products) are
        // immediately visible instead of getting lost.
        .attr("stroke", n => isExact(n, sel) ? COLOR_CALLOUT : "rgba(13,13,12,0.45)")
        .attr("stroke-width", n => isExact(n, sel) ? 2.4 : 0.8)
        .attr("r", n => {
          const base = radiusFor(n.entity);
          return isExact(n, sel) ? base * 1.6 : base;
        });
      link.attr("opacity", l => {
        const s = l.source as Node, t = l.target as Node;
        return (isMatch(s, sel) && isMatch(t, sel)) ? 0.75 : 0.08;
      });
      label.attr("opacity", n => isMatch(n, sel) ? 1.0 : 0.2);
      ensureMatchVisible();
    };
    applySelection();

    // Re-apply on selection change without restarting the sim.
    const obs = new MutationObserver(applySelection);
    // Cheap proxy: tag a hidden attribute on wrap whenever selection changes
    // (set below in an effect). Observe attribute changes only.
    obs.observe(wrap, { attributes: true, attributeFilter: ["data-selection-key"] });

    const onResize = () => {
      const s = sizeOf();
      W = s.w; H = s.h;
      svg.attr("viewBox", `0 0 ${W} ${H}`);
      sim.force("center", d3.forceCenter(W / 2, H / 2)).alpha(0.3).restart();
    };
    // Both window resize AND DataTabs reveal — the latter is what bites us
    // when the tab is hidden at mount (zero dims) and then shown.
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(wrap);

    return () => {
      sim.stop();
      obs.disconnect();
      ro.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [built, toggleEntity, toggleStorey, toggleInstance, clear]);

  // Push selection changes to the d3 layer via a data attribute (the
  // MutationObserver inside the d3 effect re-applies styles). This avoids
  // rebuilding the simulation on every selection change.
  useEffect(() => {
    if (!wrapRef.current) return;
    wrapRef.current.setAttribute(
      "data-selection-key",
      selection
        ? `${selection.kind}::${"value" in selection ? selection.value : ""}::${"storey_guid" in selection ? selection.storey_guid ?? "" : ""}`
        : "none"
    );
  }, [selection]);

  if (!data || !built) {
    return (
      <div className="h-full flex items-center justify-center text-xs font-mono text-muted">
        loading...
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-card">
      {!compact && (
        <div className="px-5 py-3 border-b border-line flex items-baseline justify-between">
          <div>
            <div className="text-xs font-mono text-muted uppercase tracking-wider">
              m.aggregates ∪ m.contained_in
            </div>
            <div className="text-sm font-medium">Spatial graph</div>
          </div>
          {selection ? (
            <button onClick={clear} className="font-mono text-xs text-accent hover:underline">
              clear
            </button>
          ) : (
            <div className="font-mono text-xs text-muted tabular-nums">
              {built.nodes.length} nodes · {built.links.length} edges
            </div>
          )}
        </div>
      )}
      <div ref={wrapRef} className="relative flex-1 min-h-0 bg-bg overflow-hidden">
        <svg ref={svgRef} className="block w-full h-full" />
        <div
          className="ifcfast-tip pointer-events-none absolute z-10 bg-card/95 border border-line rounded px-2 py-1 text-[11px] font-mono text-fg"
          style={{ display: "none" }}
        />
      </div>
      {!compact && (
        <div className="border-t border-line px-5 py-2 bg-bg/40 text-[11px] font-mono text-muted">
          scroll = zoom · drag bg = pan · drag node = move · click = filter
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function buildGraph(d: Graph): { nodes: Node[]; links: Link[] } {
  const nodes: Node[] = [];
  const seen = new Set<string>();
  const push = (n: Node) => {
    if (seen.has(n.id)) return;
    seen.add(n.id);
    nodes.push(n);
  };

  for (const p of d.projects) push({ id: p.guid, kind: "project", entity: "IfcProject", name: p.name, storey_guid: null });
  for (const s of d.sites) push({ id: s.guid, kind: "site", entity: "IfcSite", name: s.name, storey_guid: null });
  for (const b of d.buildings) push({ id: b.guid, kind: "building", entity: "IfcBuilding", name: b.name, storey_guid: null });
  for (const s of d.storeys) push({ id: s.guid, kind: "storey", entity: "IfcBuildingStorey", name: s.name ?? "Storey", storey_guid: s.guid });
  for (const p of d.products) push({
    id: p.guid, kind: "product", entity: p.entity,
    name: p.name ?? p.guid, storey_guid: p.storey_guid,
    type_name: p.type_name,
    type_source: p.type_source,
    materials: p.materials,
    layer_set: p.layer_set,
  });

  const links: Link[] = [];
  for (const e of d.contained_in) {
    if (seen.has(e.product_guid) && seen.has(e.storey_guid)) {
      links.push({ source: e.product_guid, target: e.storey_guid, kind: "cont" });
    }
  }
  for (const e of d.aggregates) {
    if (seen.has(e.child_guid) && seen.has(e.parent_guid)) {
      links.push({ source: e.child_guid, target: e.parent_guid, kind: "agg" });
    }
  }
  for (const e of d.storey_building) {
    if (seen.has(e.storey_guid) && seen.has(e.building_guid)) {
      links.push({ source: e.storey_guid, target: e.building_guid, kind: "agg" });
    }
  }
  // IfcRelVoidsElement — opening cuts into host. Without these, the
  // opening products are spatial orphans and the force layout banishes
  // them off the canvas. The link kind is rendered with its own
  // styling so the visual distinction stays: cont = dashed,
  // agg = solid, void = dotted-warm.
  for (const e of d.voids ?? []) {
    if (seen.has(e.opening_guid) && seen.has(e.host_guid)) {
      links.push({ source: e.opening_guid, target: e.host_guid, kind: "void" });
    }
  }
  return { nodes, links };
}

import type { Selection } from "./selection-context";

function isMatch(n: Node, sel: Selection): boolean {
  if (!sel) return true;
  if (sel.kind === "entity") {
    if (n.entity.toLowerCase() !== sel.value.toLowerCase()) return false;
    if (sel.storey_guid) return n.storey_guid === sel.storey_guid;
    return true;
  }
  if (sel.kind === "storey") {
    return n.id === sel.value || n.storey_guid === sel.value;
  }
  // Instance selection — exact GUID match only.
  if (sel.kind === "instance") {
    return n.id === sel.value;
  }
  // Type / material / layer_set / untyped filters: only product nodes can
  // match (the container hierarchy carries none of those properties). Dim
  // every project/site/building/storey node when one of these is active,
  // same way an entity selection dims containers — that keeps the visual
  // language consistent across all cross-filter kinds.
  if (n.kind !== "product") return false;
  if (sel.kind === "type") {
    return (n.type_name ?? "") === sel.value && (n.type_source ?? "none") === "ifctype";
  }
  if (sel.kind === "material") {
    return (n.materials ?? []).includes(sel.value);
  }
  if (sel.kind === "layer_set") {
    return (n.layer_set ?? null) === sel.value;
  }
  if (sel.kind === "untyped") {
    if (sel.entity && n.entity.toLowerCase() !== sel.entity.toLowerCase()) return false;
    return (n.type_source ?? "none") !== "ifctype";
  }
  return true;
}

function isExact(n: Node, sel: Selection): boolean {
  if (!sel) return false;
  if (sel.kind === "storey") return n.kind === "storey" && n.id === sel.value;
  // For type/material/layer_set/untyped/entity selections, any matching
  // product node IS the selection target — give it the accent stroke so
  // a small-percentage highlight (e.g. 18 of 268 products) actually
  // pops visually instead of being lost in the field.
  if (n.kind === "product") return isMatch(n, sel);
  return false;
}
