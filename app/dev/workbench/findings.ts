/**
 * Findings — what's wrong (or smells wrong) in this IFC.
 *
 * The product position: ifcfast exposes everything in the file, including
 * the parts that are broken, sloppy, or wasteful. A coordinator reading
 * the demo should see them, click them, and know what to fix or whom to
 * ask. No silent drops, no "looks clean because we hid the mess".
 *
 * Categories implemented today (data-driven from graph.json + qto.json):
 *
 *   no_body              · entity class has products but null area + null volume
 *                          (existed in the IFC, body representation was never
 *                           authored — Beam / Covering / etc. in this sample)
 *   untyped              · per-entity products with no IfcRelDefinesByType link
 *                          ("Revit object-type by name only" pattern; sloppy
 *                           because downstream consumers can't link to a type)
 *   storeyless           · product with storey_guid === null
 *                          (won't appear in any storey-scoped view)
 *   spatial_orphan       · product with no contained_in row AND no aggregate
 *                          parent (lives outside the spatial structure;
 *                          IfcOpeningElement is expected here since it lives
 *                          via IfcRelVoidsElement which we don't graph yet,
 *                          but we still surface it — better an over-report
 *                          than a silent miss)
 *   unused_layer_set     · IfcMaterialLayerSet defined but not assigned to
 *                          any product (dead bytes, future maintenance trap)
 *
 * Categories on the roadmap (need additional data from ifcfast):
 *
 *   unused_type          · IfcTypeObject defined with zero instances
 *                          (requires m.types list separate from product type_name)
 *   orphan_opening_void  · IfcOpeningElement not pointed at any host
 *                          (requires IfcRelVoidsElement relation)
 *   duplicate_guid       · same GlobalId on two entities
 *                          (requires raw GUID list — currently dedup'd upstream)
 *
 * Click semantics: every finding has `entity` and/or `guids`. Clicking
 * a finding writes into SelectionProvider so the viewer, graph, and
 * inventory all converge on the affected products.
 */

export type Severity = "error" | "warn" | "info";

export interface Finding {
  id: string;
  severity: Severity;
  category: string;
  title: string;
  detail: string;
  entity?: string;
  guids: string[];
}

export interface QtoRow {
  entity: string;
  count: number;
  area_m2: number | null;
  volume_m3: number | null;
  // Optional fields produced by the comprehensive sidecar generator
  // (see ifcfast/scripts/generate_sample_sidecars.py). Older qto.json
  // files without these will fall back to the simple null check.
  source?: "mesh" | "none";
  products_with_mesh?: number;
  products_without_mesh?: number;
}

export interface GraphProduct {
  guid: string;
  entity: string;
  storey_guid?: string | null;
  typed?: boolean;
  type_source?: "ifctype" | "objecttype" | "none";
  layer_set?: string | null;
}

export interface GraphLike {
  products: GraphProduct[];
  contained_in?: { product_guid: string; storey_guid: string }[];
  aggregates?: { child_guid: string; parent_guid: string }[];
  voids?: { opening_guid: string; host_guid: string }[];
  material_layer_sets?: Record<string, unknown>;
  /** IfcSpace entities held alongside products. When the parser
   *  promotes them to first-class products this collection goes empty
   *  (or vanishes) and the capability-gap row for IfcSpace
   *  self-disables — see {@link buildCapabilityGaps}. */
  spaces?: { guid: string }[];
}

/** Entity classes whose normative IFC home is the void relation, not
 *  the spatial structure. Suppresses "no storey" false alarms on
 *  openings that are correctly linked via {@link GraphLike.voids}. */
const VOID_DOMAIN_ENTITIES = new Set<string>([
  "IfcOpeningElement",
  "IfcVoidingFeature",
  "IfcSurfaceFeature",
]);

/** Entity classes typically aggregated under a parent rather than
 *  contained in a storey directly (curtain wall members, stair
 *  flights, railings, structural members). Suppresses "no storey" on
 *  the ones that ARE correctly aggregated. */
const AGGREGATE_DOMAIN_ENTITIES = new Set<string>([
  "IfcMember",
  "IfcMemberStandardCase",
  "IfcStairFlight",
  "IfcRampFlight",
  "IfcCurtainWall",
  "IfcRailing",
]);

export interface QtoLike {
  rows: QtoRow[];
}

export function computeFindings(qto: QtoLike, graph: GraphLike): Finding[] {
  const findings: Finding[] = [];

  // Spatial-relation membership sets, hoisted so the storeyless and
  // spatial-orphan checks can both consult them. Building these once
  // up front also keeps complexity O(N) instead of O(N²) when an
  // entity ends up in multiple categories.
  const inContained = new Set((graph.contained_in ?? []).map((e) => e.product_guid));
  const inAgg = new Set((graph.aggregates ?? []).map((e) => e.child_guid));
  const inVoid = new Set((graph.voids ?? []).map((e) => e.opening_guid));

  // 1. no_mesh — ifcfast didn't extract geometry for these products.
  // Sourced from the comprehensive sidecar's per-class mesh counts:
  //   source === "none"               → 0 of N products meshed (class-wide gap)
  //   products_without_mesh > 0      → partial coverage (some unhandled)
  // The cause is almost always an unimplemented representation type
  // in ifcfast-mesh (e.g. IfcBooleanClippingResult) — tracked as
  // Phase 3 of the ifcfast roadmap. We expose the count and the
  // affected guids so consumers can see the gap; we don't pretend
  // the entities are absent.
  for (const r of qto.rows) {
    const noMesh = r.products_without_mesh ?? (
      r.area_m2 === null && r.volume_m3 === null ? r.count : 0
    );
    const withMesh = r.products_with_mesh ?? (
      r.area_m2 === null && r.volume_m3 === null ? 0 : r.count
    );
    if (noMesh === 0) continue;
    const guids = graph.products
      .filter((p) => p.entity === r.entity)
      .map((p) => p.guid);
    const isTotal = withMesh === 0;
    findings.push({
      id: `no-mesh:${r.entity}`,
      severity: isTotal ? "error" : "warn",
      category: isTotal ? "ifcfast-mesh: no geometry extracted" : "ifcfast-mesh: partial coverage",
      title: r.entity,
      detail: isTotal
        ? `${r.count} declared, 0 meshed — ifcfast-mesh hasn't implemented this product's representation type yet (likely IfcBooleanClippingResult / advanced BREP)`
        : `${withMesh} of ${r.count} meshed; ${noMesh} skipped — partial representation-type coverage`,
      entity: r.entity,
      guids,
    });
  }

  // 2. type linkage — split into two findings so a Revit-style
  // ObjectType-only export doesn't read as "63% of the model is
  // untyped". The strongest signal (IfcRelDefinesByType) wins; objects
  // that only carry IfcRoot.ObjectType are info-level (named, just not
  // formally linked); objects with neither are warn-level.
  const noTypeInfoByEntity = new Map<string, string[]>();
  const objectTypeOnlyByEntity = new Map<string, string[]>();
  for (const p of graph.products) {
    const source = p.type_source ?? "none";
    const isTyped = source === "ifctype" || p.typed === true;
    if (isTyped) continue;
    if (source === "objecttype") {
      const arr = objectTypeOnlyByEntity.get(p.entity) ?? [];
      arr.push(p.guid);
      objectTypeOnlyByEntity.set(p.entity, arr);
    } else {
      const arr = noTypeInfoByEntity.get(p.entity) ?? [];
      arr.push(p.guid);
      noTypeInfoByEntity.set(p.entity, arr);
    }
  }
  for (const [entity, guids] of noTypeInfoByEntity) {
    findings.push({
      id: `untyped-none:${entity}`,
      severity: "warn",
      category: "untyped: no type info",
      title: entity,
      detail: `${guids.length} instances with neither IfcRelDefinesByType nor IfcRoot.ObjectType — downstream consumers have nothing to key on`,
      entity,
      guids,
    });
  }
  for (const [entity, guids] of objectTypeOnlyByEntity) {
    findings.push({
      id: `untyped-objecttype:${entity}`,
      severity: "info",
      category: "object-type only",
      title: entity,
      detail: `${guids.length} instances carry a type name in IfcRoot.ObjectType but no IfcRelDefinesByType link — common Revit export pattern. type_name is populated; consumers that demand an IfcTypeObject GUID will still miss.`,
      entity,
      guids,
    });
  }

  // 3. storeyless — products with null storey_guid. Suppress for
  // entities whose normative IFC home is somewhere other than the
  // spatial structure: openings (voided host), curtain-wall members,
  // stair flights, etc. that ARE correctly linked via voids /
  // aggregates aren't actually missing a storey — they live one hop
  // away through their host. Only flag if (a) the entity is not in
  // the void/aggregate domain, OR (b) it's in that domain but isn't
  // actually linked through it (the genuinely orphaned subset).
  const storeylessByEntity = new Map<string, string[]>();
  for (const p of graph.products) {
    if (p.storey_guid) continue;
    if (VOID_DOMAIN_ENTITIES.has(p.entity) && inVoid.has(p.guid)) continue;
    if (AGGREGATE_DOMAIN_ENTITIES.has(p.entity) && inAgg.has(p.guid)) continue;
    const arr = storeylessByEntity.get(p.entity) ?? [];
    arr.push(p.guid);
    storeylessByEntity.set(p.entity, arr);
  }
  for (const [entity, guids] of storeylessByEntity) {
    findings.push({
      id: `storeyless:${entity}`,
      severity: "warn",
      category: "no storey",
      title: entity,
      detail: `${guids.length} products with no IfcBuildingStorey assignment — won't appear in any storey-scoped view`,
      entity,
      guids,
    });
  }

  // 4. spatial_orphan — not in contained_in, not aggregate child,
  // and not linked to a host via IfcRelVoidsElement. Anything still
  // floating after all three checks is a genuine spatial orphan.
  // (Sets hoisted above the storeyless check so we can consult them
  // for the false-alarm suppression there too.)
  const orphansByEntity = new Map<string, string[]>();
  for (const p of graph.products) {
    if (!inContained.has(p.guid) && !inAgg.has(p.guid) && !inVoid.has(p.guid)) {
      const arr = orphansByEntity.get(p.entity) ?? [];
      arr.push(p.guid);
      orphansByEntity.set(p.entity, arr);
    }
  }
  for (const [entity, guids] of orphansByEntity) {
    findings.push({
      id: `spatial-orphan:${entity}`,
      severity: "error",
      category: "spatial orphan",
      title: entity,
      detail: `${guids.length} products outside the spatial tree — no IfcRelContainedInSpatialStructure, no aggregate parent, no void host`,
      entity,
      guids,
    });
  }

  // 5. duplicate-naming aggregates — e.g. an IfcRoof that aggregates an
  // IfcSlab with the same name (Revit's "Roof family" export pattern).
  // Both entities are real and intentional: the wrapper provides
  // semantic context, the inner element carries the body. Surfaced as
  // info so users understand why two distinct GUIDs at the same
  // physical location both light up under different class filters.
  if (graph.aggregates) {
    const productByGuid = new Map(graph.products.map((p) => [p.guid, p]));
    for (const a of graph.aggregates) {
      const parent = productByGuid.get(a.parent_guid);
      const child = productByGuid.get(a.child_guid);
      if (!parent || !child) continue;
      if (parent.entity === child.entity) continue;
      const pname = (parent as { name?: string }).name;
      const cname = (child as { name?: string }).name;
      if (!pname || !cname) continue;
      if (pname === cname) {
        findings.push({
          id: `aggregate-twin:${a.parent_guid}:${a.child_guid}`,
          severity: "info",
          category: "modelling pattern: wrapper-with-body",
          title: `${parent.entity} ↔ ${child.entity}: ${pname}`,
          detail:
            `${parent.entity} aggregates a ${child.entity} with the same name. ` +
            `Two distinct GUIDs at the same physical location — the wrapper carries semantics, ` +
            `the inner element carries the body. Common in Revit exports (e.g. IfcRoof → IfcSlab(ROOF)).`,
          entity: parent.entity,
          guids: [parent.guid, child.guid],
        });
      }
    }
  }

  // 6. unused_layer_set — defined in material_layer_sets, no product references
  const definedLayerSets = new Set(Object.keys(graph.material_layer_sets ?? {}));
  const usedLayerSets = new Set(
    graph.products
      .map((p) => p.layer_set)
      .filter((s): s is string => typeof s === "string" && s.length > 0),
  );
  for (const ls of definedLayerSets) {
    if (!usedLayerSets.has(ls)) {
      findings.push({
        id: `unused-layer-set:${ls}`,
        severity: "warn",
        category: "unused layer set",
        title: ls,
        detail:
          "IfcMaterialLayerSet defined but no product references it — dead bytes in the file",
        guids: [],
      });
    }
  }

  // Sort: errors first, then warnings, then infos. Within the same
  // severity, group by category so all "untyped" rows cluster together
  // and a single "modelling pattern" row doesn't land between two
  // unrelated info categories. Within the same (severity, category),
  // biggest affected-count first.
  const sevRank = (s: Severity) => (s === "error" ? 0 : s === "warn" ? 1 : 2);
  findings.sort((a, b) => {
    const r = sevRank(a.severity) - sevRank(b.severity);
    if (r !== 0) return r;
    const c = a.category.localeCompare(b.category);
    if (c !== 0) return c;
    return b.guids.length - a.guids.length;
  });

  return findings;
}


/** Capability-gap rows derived from observable signals in the graph
 *  rather than hardcoded copy. When the parser closes a gap and the
 *  sidecar regenerates, the corresponding row disappears without a
 *  site code change. */
export function buildCapabilityGaps(graph: GraphLike): Finding[] {
  const gaps: Finding[] = [];

  // Typedness gap — fires if any product carries type info from
  // somewhere other than a formal IfcRelDefinesByType link. Pre-fix,
  // this was true for every product (the Rust indexer didn't extract
  // the relation at all). Post-fix, only the genuinely-untyped-or-
  // ObjectType-only subset trips it. When that subset is empty, no
  // row renders.
  const nonIfcType = graph.products.filter(
    (p) => (p.type_source ?? "none") !== "ifctype" && p.typed !== true,
  );
  if (nonIfcType.length > 0) {
    gaps.push({
      id: "parser:typedness-source:not-ifctype",
      severity: "info",
      category: "ifcfast: capability gap",
      title: "Not every product is linked via IfcRelDefinesByType",
      detail: `${nonIfcType.length} of ${graph.products.length} products fall back to IfcRoot.ObjectType or have no type info at all. ifcfast extracts IfcRelDefinesByType natively when present in the source IFC; rows below break out which products are affected.`,
      guids: [],
    });
  }

  // Space-promotion gap — fires only when the graph still keeps IfcSpace
  // outside the products collection. Once spaces show up in products[],
  // this row disappears automatically.
  const hasSpaceSidebar = (graph.spaces?.length ?? 0) > 0;
  const productsHaveSpaces = graph.products.some(
    (p) => p.entity === "IfcSpace",
  );
  if (hasSpaceSidebar && !productsHaveSpaces) {
    gaps.push({
      id: "parser:space-promotion",
      severity: "warn",
      category: "ifcfast: capability gap",
      title: "IfcSpace is a sibling collection, not a Product",
      detail: `${graph.spaces!.length} IfcSpace instances live in graph.spaces rather than in graph.products. Consumers iterating products will miss them; read from graph.spaces (or m.spaces in the Python API) until the parser promotes them.`,
      guids: [],
    });
  }

  return gaps;
}
