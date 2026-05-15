"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { useSelection } from "./selection-context";

type Product = {
  guid: string;
  entity: string;
  name: string | null;
  storey_guid: string | null;
  type_name?: string;
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
};

type NodeKind = "project" | "site" | "building" | "storey" | "product";

type Node = d3.SimulationNodeDatum & {
  id: string;
  kind: NodeKind;
  entity: string;
  name: string;
  storey_guid: string | null;
};

type Link = d3.SimulationLinkDatum<Node> & {
  kind: "agg" | "cont";
};

// Muted, theme-aligned palette. The site is warm cream (#fafaf7) with rust
// accent (#e07c2f) reserved for selection state — so the graph stays earthy
// and low-saturation: container hierarchy in deepening browns, element
// classes in a cool gray-green family, accent reserved for the selected
// node's stroke.
const PALETTE: Record<string, string> = {
  IfcProject:           "#4a3a2a",   // deep walnut — root
  IfcSite:              "#6b5640",   // dark brown
  IfcBuilding:          "#8a7257",   // mid bronze
  IfcBuildingStorey:    "#a6896b",   // clay
  IfcSpace:             "#a89c8c",   // taupe
  IfcElementAssembly:   "#6c7670",   // pewter
  IfcSlab:              "#7a7d72",   // sage gray
  IfcCovering:          "#9c9684",   // sandstone
  IfcWall:              "#8a8478",   // warm stone
  IfcWallStandardCase:  "#8a8478",
  IfcRoof:              "#a06550",   // muted terracotta
  IfcDoor:              "#7a5c44",   // wood
  IfcWindow:            "#8aa3ad",   // muted slate-blue
  IfcBeam:              "#5e6770",   // steel
  IfcColumn:            "#525a62",   // dark steel
  IfcMember:            "#5e6770",
  IfcPlate:             "#6a737c",
  IfcRailing:           "#65615b",   // charcoal-warm
  IfcStair:             "#7a6f60",
  IfcStairFlight:       "#7a6f60",
  IfcFooting:           "#4d4944",   // dark earth
  IfcOpeningElement:    "#b8a896",   // light warm gray
  IfcFurnishingElement: "#a08566",   // tan
};
const colorFor = (e: string) => PALETTE[e] ?? "#7a7975";

const RADIUS: Record<string, number> = {
  IfcProject: 14, IfcSite: 12, IfcBuilding: 10, IfcBuildingStorey: 8,
  IfcSpace: 6, IfcElementAssembly: 5,
};
const radiusFor = (e: string) => RADIUS[e] ?? 3;

const LABEL_ENTITIES = new Set(["IfcProject", "IfcSite", "IfcBuilding", "IfcBuildingStorey"]);

export function VectorGraph({ src }: { src: string }) {
  const [data, setData] = useState<Graph | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const { selection, toggleEntity, toggleStorey, clear } = useSelection();
  // We need the live selection inside d3 callbacks without re-binding the
  // simulation on every selection change — keep a ref.
  const selectionRef = useRef(selection);
  useEffect(() => { selectionRef.current = selection; }, [selection]);

  useEffect(() => {
    fetch(src).then(r => r.json()).then(setData).catch(() => setData(null));
  }, [src]);

  const built = useMemo(() => (data ? buildGraph(data) : null), [data]);

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
      // Both link kinds use the theme's line colour family; aggregation is
      // a touch darker than containment so the spatial structure reads
      // first. Dashed = product → storey containment, solid = aggregation.
      .attr("stroke", d => d.kind === "agg" ? "#9a948b" : "#bdb6ab")
      .attr("stroke-dasharray", d => d.kind === "cont" ? "2 3" : "")
      .attr("stroke-width", d => d.kind === "agg" ? 1.0 : 0.7)
      .attr("stroke-opacity", 0.75);

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
        if (d.kind === "storey") toggleStorey(d.id, d.name);
        else if (d.kind === "product") toggleEntity(d.entity, d.storey_guid ?? undefined);
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

    // Apply current selection on initial mount, and react to changes by
    // updating opacities/strokes without rebuilding the simulation.
    const applySelection = () => {
      const sel = selectionRef.current;
      node
        .attr("opacity", n => isMatch(n, sel) ? 1.0 : 0.15)
        // Selected node gets the rust accent stroke; everything else keeps
        // its soft warm-dark default.
        .attr("stroke", n => isExact(n, sel) ? "#e07c2f" : "rgba(13,13,12,0.45)")
        .attr("stroke-width", n => isExact(n, sel) ? 2.2 : 0.8);
      link.attr("opacity", l => {
        const s = l.source as Node, t = l.target as Node;
        return (isMatch(s, sel) && isMatch(t, sel)) ? 0.75 : 0.08;
      });
      label.attr("opacity", n => isMatch(n, sel) ? 1.0 : 0.2);
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
  }, [built, toggleEntity, toggleStorey, clear]);

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
      <div ref={wrapRef} className="relative flex-1 min-h-0 bg-bg overflow-hidden">
        <svg ref={svgRef} className="block w-full h-full" />
        <div
          className="ifcfast-tip pointer-events-none absolute z-10 bg-card/95 border border-line rounded px-2 py-1 text-[11px] font-mono text-fg"
          style={{ display: "none" }}
        />
      </div>
      <div className="border-t border-line px-5 py-2 bg-bg/40 text-[11px] font-mono text-muted">
        scroll = zoom · drag bg = pan · drag node = move · click = filter
      </div>
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
  // type/material/layer_set/untyped don't propagate into the spatial graph
  // (those are kind-level filters that need per-product type/material data
  // we haven't wired into the graph yet). For now: leave everything visible.
  return true;
}

function isExact(n: Node, sel: Selection): boolean {
  if (!sel) return false;
  if (sel.kind === "storey") return n.kind === "storey" && n.id === sel.value;
  return false;
}
