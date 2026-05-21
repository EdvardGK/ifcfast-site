"use client";

import { useEffect, useState, useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { useSelection } from "./selection-context";

type Graph = {
  project_name: string | null;
  schema: string;
  products: { guid: string; entity: string; name: string | null; storey_guid: string | null }[];
  storeys: { guid: string; name: string | null; elevation: number | null; building_guid: string | null }[];
  buildings: { guid: string; name: string }[];
  sites: { guid: string; name: string }[];
  projects: { guid: string; name: string }[];
};

type TreeNode = {
  id: string;
  label: string;
  kind: "project" | "site" | "building" | "storey" | "type" | "product";
  count?: number;
  meta?: string;
  children?: TreeNode[];
  entity?: string;        // for type nodes — drives cross-filter
  storey_guid?: string;   // for storey + type nodes — type nodes inherit
                          //   their parent storey so an entity click scopes
                          //   to that storey instead of all storeys
  storey_label?: string;  // human-readable storey name for type nodes
};

export function GraphView({ src, compact = false }: { src: string; compact?: boolean }) {
  const [data, setData] = useState<Graph | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const { selection, toggleEntity, toggleStorey, clear } = useSelection();

  useEffect(() => {
    fetch(src).then(r => r.json()).then((d: Graph) => {
      setData(d);
      // Default-expand project + site + building + first storey.
      const next = new Set<string>();
      if (d.projects[0]) next.add("p:" + d.projects[0].guid);
      if (d.sites[0]) next.add("s:" + d.sites[0].guid);
      if (d.buildings[0]) next.add("b:" + d.buildings[0].guid);
      setExpanded(next);
    }).catch(() => setData(null));
  }, [src]);

  const tree = useMemo(() => (data ? buildTree(data) : null), [data]);

  if (!data || !tree) {
    return (
      <div className="h-full flex items-center justify-center text-xs font-mono text-muted">
        loading...
      </div>
    );
  }

  function isMatch(n: TreeNode): boolean {
    if (!selection) return true;
    if (selection.kind === "entity") {
      if (!collectEntities(n).has(selection.value.toLowerCase())) return false;
      // Storey-scoped entity selection: also require the storey to match.
      if (selection.storey_guid) return collectStoreys(n).has(selection.storey_guid);
      return true;
    }
    if (selection.kind === "storey") {
      return collectStoreys(n).has(selection.value);
    }
    return true;
  }

  function isExact(n: TreeNode): boolean {
    if (!selection) return false;
    if (selection.kind === "entity" && n.kind === "type") {
      if ((n.entity ?? "").toLowerCase() !== selection.value.toLowerCase()) return false;
      // Only the type node under the matching storey is "exact"; same
      // entity under other storeys is just an entity-name match.
      if (selection.storey_guid) return n.storey_guid === selection.storey_guid;
      return true;
    }
    if (selection.kind === "storey" && n.kind === "storey") {
      return n.storey_guid === selection.value;
    }
    return false;
  }

  function ensureExpanded(id: string) {
    setExpanded(s => (s.has(id) ? s : new Set(s).add(id)));
  }

  function onNodeClick(n: TreeNode, e: React.MouseEvent) {
    e.stopPropagation();
    // Row clicks on storey/type both filter AND drill in. Chevron click
    // (in the Row component) still toggles expansion on its own.
    if (n.kind === "type" && n.entity) {
      toggleEntity(n.entity, n.storey_guid, n.storey_label);
      ensureExpanded(n.id);
    } else if (n.kind === "storey" && n.storey_guid) {
      toggleStorey(n.storey_guid, n.label);
      ensureExpanded(n.id);
    } else {
      toggleNode(n.id);
    }
  }

  function toggleNode(id: string) {
    setExpanded(s => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  return (
    <div className="h-full flex flex-col bg-card">
      {!compact && (
        <div className="px-5 py-3 border-b border-line flex items-baseline justify-between">
          <div>
            <div className="text-xs font-mono text-muted uppercase tracking-wider">
              m.aggregates + m.contained_in
            </div>
            <div className="text-sm font-medium">Model tree</div>
          </div>
          {selection ? (
            <button onClick={clear} className="font-mono text-xs text-accent hover:underline">
              clear
            </button>
          ) : (
            <div className="font-mono text-xs text-muted tabular-nums">
              {data.storeys.length} storeys · {data.products.length} products
            </div>
          )}
        </div>
      )}
      <div className="flex-1 overflow-auto scroll-thin py-2">
        <Row
          node={tree}
          depth={0}
          expanded={expanded}
          onToggleExpand={toggleNode}
          onNodeClick={onNodeClick}
          isMatch={isMatch}
          isExact={isExact}
          hasSelection={!!selection}
        />
      </div>
      {!compact && (
        <div className="border-t border-line px-5 py-2 bg-bg/40 text-[11px] font-mono text-muted">
          click an entity or storey to cross-filter
        </div>
      )}
    </div>
  );
}

function Row({
  node, depth, expanded, onToggleExpand, onNodeClick, isMatch, isExact, hasSelection,
}: {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  onToggleExpand: (id: string) => void;
  onNodeClick: (n: TreeNode, e: React.MouseEvent) => void;
  isMatch: (n: TreeNode) => boolean;
  isExact: (n: TreeNode) => boolean;
  hasSelection: boolean;
}) {
  const hasChildren = !!(node.children && node.children.length);
  const isOpen = expanded.has(node.id);
  const dimmed = hasSelection && !isMatch(node);
  const exact = isExact(node);
  const KIND_DOT: Record<TreeNode["kind"], string> = {
    project: "bg-accent",
    site: "bg-fg",
    building: "bg-fg",
    storey: "bg-fg",
    type: "bg-muted",
    product: "bg-line",
  };

  const KIND_TEXT_WEIGHT: Record<TreeNode["kind"], string> = {
    project: "font-semibold",
    site: "font-medium",
    building: "font-medium",
    storey: "font-medium",
    type: "font-mono text-[13px]",
    product: "font-mono text-[12px] text-muted",
  };

  return (
    <>
      <div
        onClick={e => {
          if (hasChildren && node.kind !== "type" && node.kind !== "storey") {
            onToggleExpand(node.id);
          } else {
            onNodeClick(node, e);
          }
        }}
        style={{ paddingLeft: 12 + depth * 14 }}
        className={`group flex items-center gap-1.5 py-1 pr-3 cursor-pointer transition-opacity ${
          dimmed ? "opacity-20 hover:opacity-100" : ""
        } ${exact ? "bg-accent-soft" : "hover:bg-bg/50"}`}
      >
        {hasChildren ? (
          <button
            onClick={e => {
              e.stopPropagation();
              onToggleExpand(node.id);
            }}
            className="-ml-1 p-0.5 rounded hover:bg-line"
            aria-label={isOpen ? "Collapse" : "Expand"}
          >
            <ChevronRight
              size={12}
              className={`transition-transform ${isOpen ? "rotate-90" : ""} text-muted`}
            />
          </button>
        ) : (
          <span className="w-[16px] inline-block" />
        )}
        <span className={`w-1.5 h-1.5 rounded-full flex-none ${exact ? "bg-accent" : KIND_DOT[node.kind]}`}></span>
        <span className={`text-sm ${KIND_TEXT_WEIGHT[node.kind]} ${exact ? "text-accent" : ""}`}>
          {node.label}
        </span>
        {node.meta && (
          <span className="text-[11px] font-mono text-muted ml-1">{node.meta}</span>
        )}
        {typeof node.count === "number" && (
          <span className="font-mono text-[11px] text-muted ml-auto tabular-nums">
            {node.count}
          </span>
        )}
      </div>
      {hasChildren && isOpen &&
        node.children!.map(c => (
          <Row
            key={c.id}
            node={c}
            depth={depth + 1}
            expanded={expanded}
            onToggleExpand={onToggleExpand}
            onNodeClick={onNodeClick}
            isMatch={isMatch}
            isExact={isExact}
            hasSelection={hasSelection}
          />
        ))
      }
    </>
  );
}

// ----------------------------------------------------------------------
// Build the hierarchical tree
// ----------------------------------------------------------------------

function buildTree(d: Graph): TreeNode {
  const productsByStorey = new Map<string, typeof d.products>();
  for (const p of d.products) {
    if (!p.storey_guid) continue;
    if (!productsByStorey.has(p.storey_guid)) productsByStorey.set(p.storey_guid, []);
    productsByStorey.get(p.storey_guid)!.push(p);
  }
  const storeysSorted = [...d.storeys].sort(
    (a, b) => (b.elevation ?? 0) - (a.elevation ?? 0)
  );
  const storeyNodes: TreeNode[] = storeysSorted.map(s => {
    const products = productsByStorey.get(s.guid) ?? [];
    // Group products by entity type.
    const byEntity = new Map<string, typeof d.products>();
    for (const p of products) {
      if (!byEntity.has(p.entity)) byEntity.set(p.entity, []);
      byEntity.get(p.entity)!.push(p);
    }
    const typeChildren: TreeNode[] = [...byEntity.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([entity, prods]) => ({
        id: `t:${s.guid}::${entity}`,
        label: entity,
        kind: "type",
        count: prods.length,
        entity,
        storey_guid: s.guid,
        storey_label: s.name ?? undefined,
        children: prods.map(p => ({
          id: `prod:${p.guid}`,
          label: p.name || p.guid,
          kind: "product",
        })),
      }));
    return {
      id: "st:" + s.guid,
      label: s.name || "Storey",
      kind: "storey",
      meta: s.elevation !== null ? `${s.elevation.toFixed(1)} m` : undefined,
      count: products.length,
      storey_guid: s.guid,
      children: typeChildren,
    };
  });

  const building = d.buildings[0];
  const site = d.sites[0];
  const project = d.projects[0];

  const buildingNode: TreeNode = {
    id: "b:" + (building?.guid ?? "none"),
    label: building?.name ?? "Building",
    kind: "building",
    count: storeyNodes.length,
    children: storeyNodes,
  };
  const siteNode: TreeNode = {
    id: "s:" + (site?.guid ?? "none"),
    label: site?.name ?? "Site",
    kind: "site",
    children: [buildingNode],
  };
  const projectNode: TreeNode = {
    id: "p:" + (project?.guid ?? "none"),
    label: d.project_name ?? "Project",
    kind: "project",
    children: [siteNode],
  };
  return projectNode;
}

// ----------------------------------------------------------------------
// Filter helpers
// ----------------------------------------------------------------------

function collectEntities(n: TreeNode): Set<string> {
  const out = new Set<string>();
  function walk(nn: TreeNode) {
    if (nn.kind === "type" && nn.entity) out.add(nn.entity.toLowerCase());
    nn.children?.forEach(walk);
  }
  walk(n);
  return out;
}

function collectStoreys(n: TreeNode): Set<string> {
  const out = new Set<string>();
  function walk(nn: TreeNode) {
    if (nn.kind === "storey" && nn.storey_guid) out.add(nn.storey_guid);
    nn.children?.forEach(walk);
  }
  walk(n);
  return out;
}
