"use client";

import { useEffect, useState, useMemo } from "react";

type Graph = {
  project_name: string | null;
  schema: string;
  products: { guid: string; entity: string; name: string | null; storey_guid: string | null }[];
  storeys: { guid: string; name: string | null; elevation: number | null; building_guid: string | null }[];
  buildings: { guid: string; name: string }[];
  sites: { guid: string; name: string }[];
  projects: { guid: string; name: string }[];
};

type Node = {
  guid: string;
  label: string;
  kind: "project" | "site" | "building" | "storey" | "product";
  count?: number;
};

export function GraphView({ src }: { src: string }) {
  const [data, setData] = useState<Graph | null>(null);

  useEffect(() => {
    fetch(src).then(r => r.json()).then(setData).catch(() => setData(null));
  }, [src]);

  const tree = useMemo(() => (data ? build(data) : null), [data]);

  if (!data || !tree) {
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
            m.aggregates + m.contained_in
          </div>
          <div className="text-sm font-medium">Spatial graph</div>
        </div>
        <div className="font-mono text-xs text-muted tabular-nums">
          {data.products.length} products
        </div>
      </div>
      <div className="flex-1 overflow-auto scroll-thin p-4">
        <NodeView node={tree} depth={0} />
      </div>
    </div>
  );
}

function build(d: Graph): Node & { children: Node[] } {
  // Aggregate counts: storey → number of products contained.
  const productsByStorey = new Map<string, number>();
  const productsByEntity = new Map<string, Map<string, number>>();
  for (const p of d.products) {
    if (!p.storey_guid) continue;
    productsByStorey.set(p.storey_guid, (productsByStorey.get(p.storey_guid) ?? 0) + 1);
    if (!productsByEntity.has(p.storey_guid)) {
      productsByEntity.set(p.storey_guid, new Map());
    }
    const m = productsByEntity.get(p.storey_guid)!;
    m.set(p.entity, (m.get(p.entity) ?? 0) + 1);
  }

  const storeysByBuilding = new Map<string, typeof d.storeys>();
  for (const s of d.storeys) {
    if (!s.building_guid) continue;
    if (!storeysByBuilding.has(s.building_guid)) {
      storeysByBuilding.set(s.building_guid, []);
    }
    storeysByBuilding.get(s.building_guid)!.push(s);
  }

  const project = d.projects[0];
  const site = d.sites[0];
  const building = d.buildings[0];

  const buildingNode: Node & { children: Node[] } = {
    guid: building?.guid ?? "no-building",
    label: building?.name ?? "Building",
    kind: "building",
    count: storeysByBuilding.get(building?.guid ?? "")?.length ?? 0,
    children: (storeysByBuilding.get(building?.guid ?? "") ?? [])
      .sort((a, b) => (b.elevation ?? 0) - (a.elevation ?? 0))
      .map(s => {
        const entities = productsByEntity.get(s.guid);
        const entityNodes: Node[] = entities
          ? Array.from(entities.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([entity, count]) => ({
                guid: `${s.guid}::${entity}`,
                label: entity,
                kind: "product",
                count,
              }))
          : [];
        return {
          guid: s.guid,
          label: `${s.name ?? "Storey"}${s.elevation !== null ? `  (${s.elevation.toFixed(1)} m)` : ""}`,
          kind: "storey",
          count: productsByStorey.get(s.guid) ?? 0,
          children: entityNodes,
        };
      }),
  };

  const siteNode: Node & { children: Node[] } = {
    guid: site?.guid ?? "no-site",
    label: site?.name ?? "Site",
    kind: "site",
    children: [buildingNode],
  };

  const projectNode: Node & { children: Node[] } = {
    guid: project?.guid ?? "no-project",
    label: d.project_name ?? project?.name ?? "Project",
    kind: "project",
    children: [siteNode],
  };

  return projectNode;
}

function NodeView({
  node, depth,
}: {
  node: Node & { children?: Node[] };
  depth: number;
}) {
  const indent = depth * 16;
  const KIND_COLOR: Record<Node["kind"], string> = {
    project: "bg-accent",
    site: "bg-fg",
    building: "bg-muted",
    storey: "bg-line",
    product: "bg-line/60",
  };
  return (
    <div>
      <div
        style={{ paddingLeft: indent }}
        className="flex items-center gap-2 py-1.5 group hover:bg-bg/50 -mx-2 px-2 rounded"
      >
        <span className={`w-1.5 h-1.5 rounded-full ${KIND_COLOR[node.kind]}`}></span>
        <span
          className={`text-sm ${
            node.kind === "product"
              ? "font-mono text-[13px] text-muted"
              : node.kind === "storey"
              ? "font-medium"
              : ""
          }`}
        >
          {node.label}
        </span>
        {typeof node.count === "number" && (
          <span className="font-mono text-[11px] text-muted ml-auto tabular-nums">
            {node.count}
          </span>
        )}
      </div>
      {node.children?.map(c => (
        <NodeView
          key={c.guid}
          node={c as Node & { children?: Node[] }}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}
