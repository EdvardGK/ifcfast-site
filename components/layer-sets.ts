/**
 * Layer-set derivation from the bundle sidecar.
 *
 * The `graph.json` the demo ships with carries `layer_set: null` on
 * every product and an empty `material_layer_sets` map — the layered
 * construction data lands only in `bundle.json` (one `materials` row
 * per layer, keyed by product GUID, with `role: "layer"`, an ordered
 * `layer_index`, and a `layer_thickness_mm`). Without this routing the
 * LAYER SETS lens is silently empty even though the Duplex is a
 * canonically layered-wall model, and those same layers double-list in
 * the MATERIALS lens (issue #8 bug 2 / #7 finding 4).
 *
 * This module reconstructs the IfcMaterialLayerSet view the UI expects:
 * it assigns each layered product a `layer_set` name (the product's
 * own type name — the construction-stack label a wall/floor/roof
 * carries) and builds the named `material_layer_sets` definition map
 * (ordered layers + total thickness) the QtoPanel renders. It is the
 * single source consulted by both the dashboard tile and the data
 * panel so the two lenses agree on what a layer set is.
 *
 * The bundle is authoritative and matches graph GUIDs 1:1; if it is
 * missing or carries no layer rows the helpers degrade to "no layer
 * sets" cleanly so the lens shows an explicit empty state rather than
 * a misleading zero.
 */

export interface LayerSetLayer {
  material: string;
  thickness_mm: number;
}

export interface LayerSetDef {
  layers: LayerSetLayer[];
  total_thickness_mm: number;
}

interface BundleMaterialRow {
  guid: string;
  role: string;
  layer_index: number;
  material_name: string;
  layer_thickness_mm: number | null;
}

interface BundleFile {
  materials?: BundleMaterialRow[];
}

export interface DerivedLayerSets {
  /** product GUID → layer-set name (only for products that carry layers) */
  layerSetByGuid: Map<string, string>;
  /** layer-set name → ordered layer definition */
  definitions: Record<string, LayerSetDef>;
}

const EMPTY: DerivedLayerSets = {
  layerSetByGuid: new Map(),
  definitions: {},
};

/**
 * Build the layer-set view from a bundle and a GUID→name resolver.
 *
 * @param bundle   parsed bundle.json (may be null/partial — degrades to empty)
 * @param nameFor  resolves a product GUID to the name its layer set should
 *                 carry (typically the product's IfcType / type_name; falls
 *                 back to the entity class). Products the resolver can't name
 *                 are grouped under a stable synthetic key so they still
 *                 surface rather than vanish.
 */
export function deriveLayerSets(
  bundle: BundleFile | null | undefined,
  nameFor: (guid: string) => string | null | undefined,
): DerivedLayerSets {
  const rows = bundle?.materials;
  if (!rows || rows.length === 0) return EMPTY;

  // Group ordered layer rows per product GUID.
  const layersByGuid = new Map<string, BundleMaterialRow[]>();
  for (const r of rows) {
    if (r.role !== "layer") continue;
    const arr = layersByGuid.get(r.guid) ?? [];
    arr.push(r);
    layersByGuid.set(r.guid, arr);
  }
  if (layersByGuid.size === 0) return EMPTY;

  const layerSetByGuid = new Map<string, string>();
  const definitions: Record<string, LayerSetDef> = {};

  for (const [guid, rawLayers] of layersByGuid) {
    const name = (nameFor(guid) || "").trim() || `Layer set ${guid.slice(0, 8)}`;
    layerSetByGuid.set(guid, name);

    // First product to claim a name defines its stack. Layer sets are
    // named by construction type, so every product of the same type
    // carries the same ordered stack — defining it once is correct and
    // keeps the definition stable regardless of iteration order.
    if (definitions[name]) continue;

    const ordered = [...rawLayers].sort((a, b) => a.layer_index - b.layer_index);
    const layers: LayerSetLayer[] = ordered.map((l) => ({
      material: l.material_name,
      // bundle thickness is in metres; the UI renders millimetres.
      thickness_mm: (l.layer_thickness_mm ?? 0) * 1000,
    }));
    const total = layers.reduce((s, l) => s + l.thickness_mm, 0);
    definitions[name] = { layers, total_thickness_mm: total };
  }

  return { layerSetByGuid, definitions };
}
