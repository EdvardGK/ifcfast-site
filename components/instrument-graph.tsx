"use client";
/**
 * InstrumentGraph — the spatial graph as the instrument's second viewport.
 * ----------------------------------------------------------------------
 * A props-driven descendant of components/vector-graph.tsx (the original
 * site's d3 projection). The workbench copy is untouched: it is bound to
 * SelectionProvider's single-`Selection` model, while the instrument holds
 * FIVE independent channels (scope · entitySel · typeSel · hotEntity ·
 * picked) and a dark palette. Forking was cheaper than an adapter that had
 * to satisfy both.
 *
 * Differences from the original, all deliberate:
 *
 *  • A CLASS TIER. project → site → building → storey → class → product.
 *    The instrument's whole vocabulary is entity-class-shaped (hotEntity,
 *    entitySel, the treemap), so the class node is the thing a hover and a
 *    click need to land on. It also gives the graph a leaf that survives a
 *    35 000-product model.
 *  • A PRODUCT CAP. Above PRODUCT_CAP products the class nodes ARE the
 *    leaves — a force layout of 35 789 circles is not a visualization.
 *  • NO aggregate / void edges. The class tier already parents every
 *    product, which is the only job those edges did in the original (they
 *    kept openings from being banished off-canvas).
 *  • THE SIMULATION DOES NOT RUN. The layout is settled synchronously at
 *    build time (sim.tick × N) and the simulation is stopped; it only
 *    restarts while a node is being dragged, and a drag is only reachable
 *    when this pane has focus. So an unfocused inset costs exactly zero
 *    frames.
 *  • STREAMING DEGRADE. While a dropped model streams, the graph it is
 *    handed is the provisional batch-meta fold: products, no storeys, no
 *    containment. Storey names simply do not exist yet, so the graph shows
 *    one class node per entity under a single STREAMING root, sized by
 *    count — real information about the model actually arriving, at ~40
 *    nodes instead of 35 000. It is rebuilt only when the class SET
 *    changes (not on every 4 Hz republish), and the real spatial graph
 *    replaces it at "done".
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { select, type Selection as D3Sel } from "d3-selection";
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior } from "d3-zoom";
import { drag as d3drag } from "d3-drag";

/* ------------------------------------------------------------------ */
/* data in                                                             */
/* ------------------------------------------------------------------ */
export type IgProduct = {
  guid: string;
  entity: string;
  name?: string | null;
  storey_guid: string | null;
  type_name?: string | null;
  m3?: number | null;
  m2?: number | null;
};
export type IgGraph = {
  products: IgProduct[];
  storeys: { guid: string; name: string; elevation: number }[];
  buildings?: { guid: string; name?: string | null }[];
  sites?: { guid: string; name?: string | null }[];
  projects?: { guid: string; name?: string | null }[];
  storey_building?: { storey_guid: string; building_guid: string }[];
};

/** the instrument's five selection channels, verbatim */
export type IgState = {
  /** "ALL" | "UNPLACED" | storey guid */
  scope: string;
  entitySel: string | null;
  typeSel: string | null;
  hotEntity: string | null;
  pickedGuid: string | null;
  pickedEntity: string | null;
  /** storey guid of the picked product, or "UNPLACED" */
  pickedStorey: string | null;
};

export type IgPick = {
  guid: string;
  entity: string;
  type_name: string | null;
  storey_guid: string | null;
  m3: number | null;
  m2: number | null;
};

const UNPLACED = "UNPLACED";
/** above this, class nodes are the leaves (no per-product dots) */
const PRODUCT_CAP = 900;

const C_ACC = "#ff8f3a";
const C_ACC_DIM = "#b3671f";
const C_PICK = "#ffeab8";
const C_LN2 = "#2c313a";
const BASE_FILL: Record<NodeKind, string> = {
  root: "#6b7480",
  site: "#5b636d",
  building: "#525a64",
  storey: "#454d56",
  class: "#39404a",
  product: "#2e343c",
};

type NodeKind = "root" | "site" | "building" | "storey" | "class" | "product";

type IgNode = SimulationNodeDatum & {
  id: string;
  kind: NodeKind;
  label: string;
  /** IFC class for class + product nodes */
  entity: string | null;
  /** storey guid, "UNPLACED", or null for the spine above the storeys */
  storeyKey: string | null;
  type_name: string | null;
  guid: string | null;
  count: number;
  r: number;
  m3: number | null;
  m2: number | null;
  /** class nodes only: the set of type names underneath, for typeSel matching */
  types?: Set<string>;
};
type IgLink = SimulationLinkDatum<IgNode> & { tier: number };

type Built = {
  nodes: IgNode[];
  links: IgLink[];
  labelClasses: boolean;
  /** class leaves rather than per-product dots */
  clustered: boolean;
  productCount: number;
};

/* ------------------------------------------------------------------ */
/* build                                                               */
/* ------------------------------------------------------------------ */
const shortName = (e: string) => e.replace(/^Ifc/i, "").toUpperCase();
const classId = (storeyKey: string, entity: string) => `c::${storeyKey}::${entity}`;

function buildStreaming(products: IgProduct[]): Built {
  const nodes: IgNode[] = [];
  const links: IgLink[] = [];
  const counts = new Map<string, number>();
  for (const p of products) counts.set(p.entity, (counts.get(p.entity) ?? 0) + 1);
  const root: IgNode = {
    id: "__stream",
    kind: "root",
    label: "STREAMING",
    entity: null,
    storeyKey: null,
    type_name: null,
    guid: null,
    count: products.length,
    r: 12,
    m3: null,
    m2: null,
  };
  nodes.push(root);
  const max = Math.max(1, ...counts.values());
  for (const [entity, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    const id = classId("__stream", entity);
    nodes.push({
      id,
      kind: "class",
      label: shortName(entity),
      entity,
      storeyKey: null,
      type_name: null,
      guid: null,
      count,
      r: 3.5 + 5 * Math.sqrt(count / max),
      m3: null,
      m2: null,
      types: new Set<string>(),
    });
    links.push({ source: id, target: root.id, tier: 1 });
  }
  return { nodes, links, labelClasses: nodes.length <= 64, clustered: true, productCount: products.length };
}

function buildSpatial(g: IgGraph): Built {
  const nodes: IgNode[] = [];
  const links: IgLink[] = [];
  const byId = new Set<string>();
  const push = (n: IgNode) => {
    if (byId.has(n.id)) return;
    byId.add(n.id);
    nodes.push(n);
  };
  const mk = (o: Partial<IgNode> & { id: string; kind: NodeKind; label: string }): IgNode => ({
    entity: null,
    storeyKey: null,
    type_name: null,
    guid: null,
    count: 0,
    r: 6,
    m3: null,
    m2: null,
    ...o,
  });

  /* ── spine: project → site → building ─────────────────────────── */
  const projects = g.projects ?? [];
  const sites = g.sites ?? [];
  const buildings = g.buildings ?? [];
  let spineTop: string | null = null;
  if (projects.length) {
    for (const p of projects) push(mk({ id: p.guid, kind: "root", label: p.name || "PROJECT", r: 12 }));
    spineTop = projects[0].guid;
  }
  for (const s of sites) {
    push(mk({ id: s.guid, kind: "site", label: s.name || "SITE", r: 10 }));
    if (spineTop) links.push({ source: s.guid, target: spineTop, tier: 0 });
  }
  const siteAnchor = sites[0]?.guid ?? spineTop;
  for (const b of buildings) {
    push(mk({ id: b.guid, kind: "building", label: b.name || "BUILDING", r: 9 }));
    if (siteAnchor) links.push({ source: b.guid, target: siteAnchor, tier: 0 });
  }
  // no spatial containers at all (some exports) → a synthetic root so the
  // storeys have something to hang from rather than floating apart
  if (!byId.size) {
    push(mk({ id: "__model", kind: "root", label: "MODEL", r: 12 }));
    spineTop = "__model";
  }

  /* ── storeys ──────────────────────────────────────────────────── */
  const storeyBuilding = new Map<string, string>();
  for (const sb of g.storey_building ?? []) storeyBuilding.set(sb.storey_guid, sb.building_guid);
  const buildingAnchor = buildings[0]?.guid ?? siteAnchor ?? spineTop ?? "__model";
  const storeyName = new Map<string, string>();
  for (const s of [...g.storeys].sort((a, b) => b.elevation - a.elevation)) {
    storeyName.set(s.guid, s.name || s.guid.slice(0, 8));
    push(mk({ id: s.guid, kind: "storey", label: s.name || s.guid.slice(0, 8), storeyKey: s.guid, r: 8 }));
    const parent = storeyBuilding.get(s.guid) ?? buildingAnchor;
    if (byId.has(parent)) links.push({ source: s.guid, target: parent, tier: 1 });
  }

  /* ── class tier ───────────────────────────────────────────────── */
  const classes = new Map<string, IgNode>();
  let needUnplaced = false;
  for (const p of g.products) {
    const sk = p.storey_guid && storeyName.has(p.storey_guid) ? p.storey_guid : UNPLACED;
    if (sk === UNPLACED) needUnplaced = true;
    const id = classId(sk, p.entity);
    let n = classes.get(id);
    if (!n) {
      n = mk({
        id,
        kind: "class",
        label: shortName(p.entity),
        entity: p.entity,
        storeyKey: sk,
        r: 4,
        types: new Set<string>(),
      });
      classes.set(id, n);
    }
    n.count += 1;
    if (p.type_name) n.types!.add(p.type_name);
  }
  if (needUnplaced) {
    push(mk({ id: UNPLACED, kind: "storey", label: "UNPLACED", storeyKey: UNPLACED, r: 7 }));
    if (byId.has(buildingAnchor)) links.push({ source: UNPLACED, target: buildingAnchor, tier: 1 });
  }
  const classMax = Math.max(1, ...[...classes.values()].map((c) => c.count));
  for (const n of classes.values()) {
    n.r = 3.2 + 4.8 * Math.sqrt(n.count / classMax);
    push(n);
    const parent = n.storeyKey!;
    if (byId.has(parent)) links.push({ source: n.id, target: parent, tier: 2 });
  }

  /* ── product leaves, only under the cap ───────────────────────── */
  const clustered = g.products.length > PRODUCT_CAP;
  if (!clustered) {
    for (const p of g.products) {
      const sk = p.storey_guid && storeyName.has(p.storey_guid) ? p.storey_guid : UNPLACED;
      const cid = classId(sk, p.entity);
      push(
        mk({
          id: p.guid,
          kind: "product",
          label: p.name || shortName(p.entity),
          entity: p.entity,
          storeyKey: sk,
          type_name: p.type_name ?? null,
          guid: p.guid,
          count: 1,
          r: 2.3,
          m3: p.m3 ?? null,
          m2: p.m2 ?? null,
        }),
      );
      if (byId.has(cid)) links.push({ source: p.guid, target: cid, tier: 3 });
    }
  }

  return {
    nodes,
    links,
    labelClasses: classes.size <= 64,
    clustered,
    productCount: g.products.length,
  };
}

/* ------------------------------------------------------------------ */
/* highlight resolution — mirrors InstrumentChapter's `highlight` memo  */
/* ------------------------------------------------------------------ */
type Hl =
  | { mode: "storey"; value: string }
  | { mode: "entity"; value: string; storeyScope?: string }
  | { mode: "type"; value: string; storeyScope?: string }
  | null;

function hlOf(s: IgState): Hl {
  const storeyScope = s.scope === "ALL" ? undefined : s.scope;
  const ent = s.hotEntity ?? s.entitySel;
  if (ent) return { mode: "entity", value: ent, storeyScope };
  if (s.typeSel) return { mode: "type", value: s.typeSel, storeyScope };
  if (s.scope !== "ALL") return { mode: "storey", value: s.scope };
  return null;
}

function inScope(n: IgNode, scope?: string) {
  if (!scope) return true;
  return n.storeyKey === scope;
}

function matches(n: IgNode, hl: Hl): boolean {
  if (!hl) return true;
  // the spine above the storeys is structure, never filtered away
  if (n.kind === "root" || n.kind === "site" || n.kind === "building") return true;
  if (hl.mode === "storey") return n.storeyKey === hl.value;
  if (n.kind === "storey") return inScope(n, hl.storeyScope);
  if (hl.mode === "entity") {
    return (n.entity ?? "").toLowerCase() === hl.value.toLowerCase() && inScope(n, hl.storeyScope);
  }
  // type
  if (!inScope(n, hl.storeyScope)) return false;
  if (n.kind === "product") return (n.type_name ?? "—") === hl.value;
  return !!n.types?.has(hl.value);
}

/* ------------------------------------------------------------------ */
/* component                                                           */
/* ------------------------------------------------------------------ */
export function InstrumentGraph({
  graph,
  provisional,
  focused,
  state,
  onPickProduct,
  onHotEntity,
  onSelectEntity,
  onSelectStorey,
  onClear,
}: {
  graph: IgGraph | null;
  provisional: boolean;
  /** this pane owns the cell (the other one is the inset) */
  focused: boolean;
  state: IgState;
  onPickProduct: (p: IgPick) => void;
  onHotEntity: (entity: string | null) => void;
  onSelectEntity: (entity: string) => void;
  /** storey guid or "UNPLACED" */
  onSelectStorey: (storeyKey: string) => void;
  onClear: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // live props inside d3 callbacks without re-binding the scene
  const cbRef = useRef({ onPickProduct, onHotEntity, onSelectEntity, onSelectStorey, onClear });
  cbRef.current = { onPickProduct, onHotEntity, onSelectEntity, onSelectStorey, onClear };
  const stateRef = useRef(state);
  stateRef.current = state;
  const focusedRef = useRef(focused);
  focusedRef.current = focused;

  /* ── the build. While a model streams, the class SET is the identity:
       the 4 Hz provisional republish adds products, not classes, and
       relaying out the graph four times a second would be the opposite of
       "keep the layout". ── */
  const streamKey = useMemo(() => {
    if (!provisional || !graph) return "";
    const s = new Set<string>();
    for (const p of graph.products) s.add(p.entity);
    return [...s].sort().join("|");
  }, [provisional, graph]);

  const built = useMemo<Built | null>(() => {
    if (!graph) return null;
    if (provisional) return buildStreaming(graph.products);
    return buildSpatial(graph);
    // streamKey is the deliberate identity while provisional
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provisional ? streamKey : graph, provisional]);

  type Scene = {
    node: D3Sel<SVGCircleElement, IgNode, SVGGElement, unknown>;
    link: D3Sel<SVGLineElement, IgLink, SVGGElement, unknown>;
    label: D3Sel<SVGTextElement, IgNode, SVGGElement, unknown>;
    sim: Simulation<IgNode, IgLink>;
    zoom: ZoomBehavior<SVGSVGElement, unknown>;
    svg: D3Sel<SVGSVGElement, unknown, null, undefined>;
    nodes: IgNode[];
    draw: () => void;
    paint: () => void;
    fit: () => void;
  };
  const sceneRef = useRef<Scene | null>(null);

  /* ── scene: built once per `built`. Never re-created by focus, resize or
       a selection change. ── */
  useEffect(() => {
    const wrap = wrapRef.current;
    const svgEl = svgRef.current;
    if (!built || !wrap || !svgEl) return;
    const { nodes, links } = built;

    const sizeOf = () => {
      const r = wrap.getBoundingClientRect();
      return { w: Math.max(r.width, 320), h: Math.max(r.height, 240) };
    };
    let { w: W, h: H } = sizeOf();

    const svg = select(svgEl).attr("width", "100%").attr("height", "100%").attr("viewBox", `0 0 ${W} ${H}`);
    svg.selectAll("*").remove();
    const root = svg.append("g");

    const zoom = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 9])
      .on("zoom", (e) => root.attr("transform", e.transform.toString()));
    svg.call(zoom);

    const link = root
      .append("g")
      .attr("class", "ig-links")
      .selectAll<SVGLineElement, IgLink>("line")
      .data(links)
      .join("line")
      .attr("stroke", C_LN2)
      .attr("stroke-width", (d) => (d.tier <= 1 ? 1.0 : 0.7));

    const labelled = nodes.filter(
      (n) => n.kind !== "product" && (n.kind !== "class" || built.labelClasses),
    );
    const label = root
      .append("g")
      .attr("class", "ig-labels")
      .selectAll<SVGTextElement, IgNode>("text")
      .data(labelled)
      .join("text")
      .text((d) => d.label)
      .attr("dy", (d) => -(d.r + 4))
      .attr("text-anchor", "middle")
      .attr("font-size", (d) => (d.kind === "class" ? 7 : 8.5))
      .attr("letter-spacing", "0.08em")
      .attr("pointer-events", "none");

    const node = root
      .append("g")
      .attr("class", "ig-nodes")
      .selectAll<SVGCircleElement, IgNode>("circle")
      .data(nodes)
      .join("circle")
      .attr("class", "ig-node")
      .attr("r", (d) => d.r)
      .attr("stroke-width", 0.8)
      .on("mouseenter", (e, d) => {
        const tip = wrap.querySelector(".ig-tip") as HTMLDivElement | null;
        if (tip) {
          tip.style.display = "block";
          tip.textContent =
            d.kind === "product"
              ? `${d.entity} · ${d.label}${d.type_name ? ` · ${d.type_name}` : ""}`
              : d.kind === "class"
                ? `${d.entity} · ${d.count}`
                : `${d.kind.toUpperCase()} · ${d.label}`;
        }
        // hot semantics == a panel hover, and only class nodes carry it: a
        // hotEntity repaints every vertex of the model, so a product-node
        // hover deliberately stays a tooltip
        if (d.kind === "class" && d.entity) cbRef.current.onHotEntity(d.entity);
      })
      .on("mousemove", (e) => {
        const tip = wrap.querySelector(".ig-tip") as HTMLDivElement | null;
        if (!tip) return;
        const wr = wrap.getBoundingClientRect();
        tip.style.left = `${(e as MouseEvent).clientX - wr.left + 12}px`;
        tip.style.top = `${(e as MouseEvent).clientY - wr.top + 12}px`;
      })
      .on("mouseleave", (e, d) => {
        const tip = wrap.querySelector(".ig-tip") as HTMLDivElement | null;
        if (tip) tip.style.display = "none";
        if (d.kind === "class") cbRef.current.onHotEntity(null);
      })
      .on("click", (e, d) => {
        (e as MouseEvent).stopPropagation();
        const cb = cbRef.current;
        if (d.kind === "product" && d.guid) {
          cb.onPickProduct({
            guid: d.guid,
            entity: d.entity ?? "",
            type_name: d.type_name,
            storey_guid: d.storeyKey === UNPLACED ? null : d.storeyKey,
            m3: d.m3,
            m2: d.m2,
          });
        } else if (d.kind === "storey" && d.storeyKey) {
          cb.onSelectStorey(d.storeyKey);
        } else if (d.kind === "class" && d.entity) {
          cb.onSelectEntity(d.entity);
        } else {
          cb.onClear();
        }
      });

    svg.on("click", () => cbRef.current.onClear());

    node.call(
      d3drag<SVGCircleElement, IgNode>()
        .on("start", (e, d) => {
          if (!e.active && focusedRef.current) sim.alphaTarget(0.25).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (e, d) => {
          d.fx = e.x;
          d.fy = e.y;
        })
        .on("end", (e, d) => {
          if (!e.active) sim.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }),
    );

    const draw = () => {
      link
        .attr("x1", (d) => (d.source as IgNode).x ?? 0)
        .attr("y1", (d) => (d.source as IgNode).y ?? 0)
        .attr("x2", (d) => (d.target as IgNode).x ?? 0)
        .attr("y2", (d) => (d.target as IgNode).y ?? 0);
      node.attr("cx", (d) => d.x ?? 0).attr("cy", (d) => d.y ?? 0);
      label.attr("x", (d) => d.x ?? 0).attr("y", (d) => d.y ?? 0);
    };

    const paint = () => {
      const s = stateRef.current;
      const hl = hlOf(s);
      const isPick = (n: IgNode) =>
        (!!n.guid && n.guid === s.pickedGuid) ||
        (n.kind === "class" && !!s.pickedEntity && n.entity === s.pickedEntity && n.storeyKey === s.pickedStorey) ||
        (n.kind === "storey" && !!s.pickedStorey && n.storeyKey === s.pickedStorey);
      const isHotClass = (n: IgNode) => n.kind === "class" && !!s.hotEntity && n.entity === s.hotEntity;
      const isPinned = (n: IgNode) =>
        (n.kind === "class" && !!s.entitySel && n.entity === s.entitySel) ||
        (n.kind === "storey" && s.scope !== "ALL" && n.storeyKey === s.scope);

      node
        .attr("fill", (n) => {
          if (isPick(n)) return C_PICK;
          if (hl && matches(n, hl) && (n.kind === "class" || n.kind === "product")) return C_ACC;
          if (hl && matches(n, hl) && n.kind === "storey") return C_ACC_DIM;
          return BASE_FILL[n.kind];
        })
        .attr("opacity", (n) => (hl && !matches(n, hl) && !isPick(n) ? 0.16 : 1))
        .attr("stroke", (n) =>
          isPick(n) ? C_PICK : isHotClass(n) || isPinned(n) ? C_ACC : "rgba(11,12,14,.65)",
        )
        .attr("stroke-width", (n) => (isPick(n) ? 2.2 : isHotClass(n) || isPinned(n) ? 1.8 : 0.8))
        .attr("r", (n) => (isPick(n) ? n.r * 1.7 : n.r));
      link.attr("opacity", (l) => {
        const a = l.source as IgNode;
        const b = l.target as IgNode;
        return !hl || (matches(a, hl) && matches(b, hl)) ? 0.6 : 0.06;
      });
      label
        .attr("fill", (n) => (isPick(n) ? C_PICK : isHotClass(n) || isPinned(n) ? C_ACC : "#8b9199"))
        .attr("opacity", (n) => (hl && !matches(n, hl) && !isPick(n) ? 0.2 : 1));
    };

    const fit = () => {
      const s = sizeOf();
      W = s.w;
      H = s.h;
      svg.attr("viewBox", `0 0 ${W} ${H}`);
      let x0 = Infinity,
        y0 = Infinity,
        x1 = -Infinity,
        y1 = -Infinity;
      for (const n of nodes) {
        if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) continue;
        x0 = Math.min(x0, n.x! - n.r);
        y0 = Math.min(y0, n.y! - n.r);
        x1 = Math.max(x1, n.x! + n.r);
        y1 = Math.max(y1, n.y! + n.r);
      }
      if (!Number.isFinite(x0)) return;
      const bw = Math.max(x1 - x0, 1);
      const bh = Math.max(y1 - y0, 1);
      const margin = focusedRef.current ? 34 : 10;
      let k = Math.min((W - 2 * margin) / bw, (H - 2 * margin) / bh);
      k = Math.max(0.15, Math.min(4, k));
      svg.call(
        zoom.transform,
        zoomIdentity.translate(W / 2 - (k * (x0 + x1)) / 2, H / 2 - (k * (y0 + y1)) / 2).scale(k),
      );
    };

    /* The layout is a one-shot: settle it synchronously, draw once, stop.
       Nothing ticks afterwards, focused or not — the only restart is a
       node drag, which is unreachable while this pane is the inset. */
    const sim = forceSimulation<IgNode>(nodes)
      .force(
        "link",
        forceLink<IgNode, IgLink>(links)
          .id((d) => d.id)
          .distance((d) => [42, 32, 26, 11][d.tier] ?? 24)
          .strength(0.6),
      )
      .force("charge", forceManyBody<IgNode>().strength((d) => (d.kind === "product" ? -7 : -70)))
      .force("center", forceCenter(W / 2, H / 2))
      .force("collide", forceCollide<IgNode>().radius((d) => d.r + 2.2))
      .alphaDecay(0.028)
      .stop();
    const ticks = nodes.length <= 500 ? 300 : nodes.length <= 1200 ? 190 : 130;
    sim.tick(ticks);
    sim.on("tick", draw);

    draw();
    paint();
    fit();

    sceneRef.current = { node, link, label, sim, zoom, svg, nodes, draw, paint, fit };

    const ro = new ResizeObserver(() => fit());
    ro.observe(wrap);
    return () => {
      ro.disconnect();
      sim.stop();
      sim.on("tick", null);
      sceneRef.current = null;
    };
  }, [built]);

  /* selection channels → restyle only, never a relayout */
  useEffect(() => {
    sceneRef.current?.paint();
  }, [state]);

  /* focus swap: the pane's box changes shape by ~3×, so refit. The layout
     itself is untouched — swapping does not move a single node. */
  useEffect(() => {
    if (!focused) sceneRef.current?.sim.stop();
    const id = requestAnimationFrame(() => sceneRef.current?.fit());
    return () => cancelAnimationFrame(id);
  }, [focused]);

  const onLeave = useCallback(() => onHotEntity(null), [onHotEntity]);

  const caption = !graph
    ? "NO GRAPH"
    : provisional
      ? `STREAMING · ${built ? built.nodes.length - 1 : 0} CLASSES`
      : built
        ? `${built.nodes.length} NODES · ${built.links.length} EDGES${built.clustered ? " · CLASS LEAVES" : ""}`
        : "…";

  return (
    <div className="ig-host" ref={wrapRef} onMouseLeave={onLeave}>
      <style>{IG_CSS}</style>
      <svg ref={svgRef} className="ig-svg" />
      <div className="ig-tip" style={{ display: "none" }} />
      <div className="ig-cap">
        <span className="ig-dot" data-on={!!built} />
        {caption}
      </div>
      {built && built.clustered && !provisional && (
        <div className="ig-note">
          {built.productCount.toLocaleString("en-US")} PRODUCTS — CLASS NODES ARE THE LEAVES
        </div>
      )}
    </div>
  );
}

const IG_CSS = `
#inst-b .ig-host{
  position:absolute; inset:0; overflow:hidden;
  background:radial-gradient(ellipse 120% 90% at 50% 8%, #191d22 0%, #121519 45%, #0b0d10 100%);
}
#inst-b .ig-svg{ display:block; width:100%; height:100%; cursor:crosshair; }
#inst-b .ig-node{ cursor:pointer; transition:fill .14s linear, opacity .14s linear; }
#inst-b .ig-labels text{ font-family:var(--mono); }
#inst-b .ig-tip{
  position:absolute; z-index:10; pointer-events:none;
  background:rgba(9,11,13,.94); border:1px solid var(--ln2); padding:2px 6px;
  font-family:var(--mono); font-size:8.5px; letter-spacing:.06em; color:var(--fg); white-space:nowrap;
}
#inst-b .ig-cap{
  position:absolute; left:8px; bottom:7px; display:flex; align-items:center; gap:6px;
  font-family:var(--mono); font-size:8.5px; letter-spacing:.13em; color:var(--mut);
  background:rgba(9,11,13,.72); padding:3px 7px; border:1px solid var(--ln);
  white-space:nowrap; max-width:calc(100% - 16px); overflow:hidden; text-overflow:ellipsis;
}
#inst-b .ig-dot{ width:5px; height:5px; border-radius:50%; background:var(--mut2); flex:0 0 auto; }
#inst-b .ig-dot[data-on="true"]{ background:var(--acc); box-shadow:0 0 6px var(--acc); }
/* top-left, not bottom-right: bottom-right is where the other view's inset
   sits when the graph has focus */
#inst-b .ig-note{
  position:absolute; left:8px; top:7px;
  font-family:var(--mono); font-size:7.5px; letter-spacing:.13em; color:var(--mut2);
  background:rgba(9,11,13,.72); padding:3px 7px; border:1px solid var(--ln); white-space:nowrap;
}
`;

export default InstrumentGraph;
