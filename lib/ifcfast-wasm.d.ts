/**
 * Type surface of the ifcfast wasm package (ifcfast repo, crates/wasm,
 * built with `wasm-bindgen --target web` and copied to public/wasm/ by
 * scripts/sync-wasm.sh). Mirrors ifcfast/docs/plans/2026-09-07_wasm-client-side.md.
 */
export default function init(
  module?: URL | Request | Response | BufferSource | string,
): Promise<unknown>;

/** One product's span inside a `streamMeshes` batch. */
export interface StreamBatchMeta {
  guid: string;
  entity: string;
  storey_guid: string | null;
  type_name: string | null;
  /** Volume m³ / area m² — the same numbers `graphJson()` reports as m3_direct / m2_direct. */
  m3: number | null;
  m2: number | null;
  tri: number;
  /** Vertex offset / count inside `positions` (xyz triples). */
  v0: number;
  vn: number;
  /** Index offset / count inside `indices`. Indices are already offset by `v0`. */
  i0: number;
  in: number;
  /** Resolved surface colour — the glTF writer's cascade (item style → material → palette). */
  rgba: [number, number, number, number];
}

/**
 * `{seen, meshed, total}` — products handed to the mesh sink so far, of
 * those the ones that had drawable geometry, and the index's product count.
 */
export interface StreamProgress {
  seen: number;
  meshed: number;
  total: number;
}

export class IfcModel {
  /**
   * v2: parse + index + extractors only — no tessellation. Cheap enough to
   * show identity immediately; geometry comes from `streamMeshes()`, or is
   * pulled in on demand by the first geometry-derived surface below.
   */
  static fromBytes(bytes: Uint8Array, name: string): IfcModel;
  /**
   * Never meshes — this is what the drop zone paints the instant parsing
   * finishes. Its `tables.drift` / `tables.segments` therefore read
   * `{rows: 0, loaded: false}` until geometry has actually run.
   */
  summaryJson(): string;
  /** Runs the batch mesh pass if none has run; reuses streamed stats after `streamMeshes()`. */
  graphJson(): string;
  /** Runs the batch mesh pass if none has run; reuses streamed stats after `streamMeshes()`. */
  qtoJson(): string;
  /** Never meshes. */
  typesJson(): string;
  /**
   * Needs the retained meshes, which a streamed model released — calling
   * this after `streamMeshes()` re-runs the batch pass. Same numbers.
   */
  toGlb(perProductMaterials?: boolean, instancing?: boolean): Uint8Array;
  /** Runs the batch mesh pass if none has run. */
  bySourceJson(): string;
  /** Runs the batch mesh pass if none has run. */
  statsJson(): string;
  /**
   * v2: run the mesh pass once, streaming merged batches as they are
   * tessellated (see plan doc). `cb` is called synchronously from inside the
   * pass — a Worker postMessages from it, so the main thread builds the model
   * up instead of waiting on one baked GLB.
   *
   * `positions` (world metres minus `streamShiftJson()`) and `indices`
   * (batch-local, already offset by each product's `v0`) are COPIES in JS
   * memory, safe to keep or transfer. `metaJson` parses to
   * `StreamBatchMeta[]`, `progressJson` to `StreamProgress`. Every meshed
   * product streams — `IfcSpace` and opening solids included — so filter on
   * `entity` in the viewer.
   */
  streamMeshes(
    productsPerBatch: number,
    cb: (metaJson: string, positions: Float32Array, indices: Uint32Array, progressJson: string) => void,
  ): void;
  /**
   * v2: `[sx, sy, sz]` metres — the global shift subtracted from streamed
   * positions; add it back for absolute world coordinates. `[0, 0, 0]` before
   * the stream starts and for any model within 10 km of the origin.
   */
  streamShiftJson(): string;
  free(): void;
}
