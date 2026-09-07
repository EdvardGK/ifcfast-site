/**
 * StreamStore — geometry batches from the ifcfast worker, kept OUT of React
 * state (a 200 MB model is ~100 batches; re-rendering the instrument per
 * batch would be the bottleneck). The viewer subscribes directly; React
 * only sees throttled progress counters.
 */
export type ProductMeta = {
  guid: string;
  entity: string;
  storey_guid: string | null;
  type_name: string | null;
  m3: number | null;
  m2: number | null;
  tri: number;
  v0: number;
  vn: number;
  i0: number;
  in: number;
  rgba: [number, number, number, number];
};

export type Batch = { meta: ProductMeta[]; positions: Float32Array; indices: Uint32Array; normals?: Float32Array };
export type Progress = { seen: number; meshed: number; total: number };

/** Millisecond budget for one dropped model. Worker-side numbers arrive in the
 * "done" message; main-side numbers are accumulated here as batches land. All
 * of it ends up in the pill's title so a slow drop is diagnosable in the wild. */
export type StreamStats = {
  /* before a single byte is parsed */
  read: number; // File.arrayBuffer() on the main thread (async — overlaps worker boot)
  spawn: number; // new Worker(...) construction
  handoff: number; // main postMessage → worker onmessage entry
  load: number; // wasm fetch + instantiate in the worker
  /* the "indexed" payload — critical path, before a single triangle streams */
  idxSummary: number;
  idxGraph: number;
  idxTypes: number;
  idxPost: number;
  /* worker */
  wasm: number; // inside streamMeshes, outside our callback
  copy: number; // typed-array slice out of wasm memory
  normals: number; // vertex-normal pass (0 once flat shading lands)
  meta: number; // JSON.parse of the per-batch meta + progress
  post: number; // postMessage (structured clone + transfer)
  final: number; // graphJson/qtoJson/statsJson/bySourceJson at "done"
  finalGraph: number; // just graphJson(), post-stream
  /* main */
  firstBatch: number; // ms from file pick to the first batch handled
  lastBatch: number; // ms from file pick to the last batch handled
  handle: number; // total time in the batch onmessage handler
  upload: number; // BufferGeometry construction (GPU upload is deferred to draw)
  paint: number; // per-batch colour attribute writes
  refit: number; // computeBoundingBox + camera fit bookkeeping
  doneLag: number; // worker "done" postMessage → main handler entry
  indexedParse: number; // main-thread JSON.parse of summary/graph/types at "indexed"
  doneParse: number; // main-thread JSON.parse of graph/qto/stats at "done"
  vertices: number;
  triangles: number;
};

export function emptyStats(): StreamStats {
  return {
    read: 0, spawn: 0, handoff: 0, load: 0,
    idxSummary: 0, idxGraph: 0, idxTypes: 0, idxPost: 0,
    wasm: 0, copy: 0, normals: 0, meta: 0, post: 0, final: 0, finalGraph: 0,
    firstBatch: 0, lastBatch: 0, handle: 0, upload: 0, paint: 0, refit: 0,
    doneLag: 0, indexedParse: 0, doneParse: 0, vertices: 0, triangles: 0,
  };
}

export class StreamStore {
  batches: Batch[] = [];
  /** every product meta seen so far, in arrival order. This is the PROVISIONAL
   * product graph: the batch meta already carries guid / entity / storey_guid /
   * type_name / m3 / m2, which is everything the quantities, the entity
   * distribution and a viewport pick need. Only materials and the storey list
   * are missing (they come with the real graphJson at "done"). Accumulating the
   * existing meta objects costs one array push per product — no allocation. */
  products: ProductMeta[] = [];
  progress: Progress = { seen: 0, meshed: 0, total: 0 };
  shift: [number, number, number] = [0, 0, 0];
  done = false;
  /** mutable perf budget — written by the drop hook and the viewer, read by the pill */
  stats: StreamStats = emptyStats();
  private listeners = new Set<(b: Batch | null) => void>();

  push(b: Batch, p: Progress) {
    this.batches.push(b);
    for (const m of b.meta) this.products.push(m);
    this.progress = p;
    for (const l of this.listeners) l(b);
  }
  finish() {
    this.done = true;
    for (const l of this.listeners) l(null);
  }
  /** `fn(batch)` for each existing batch immediately, then for each new one; `fn(null)` on finish. */
  subscribe(fn: (b: Batch | null) => void) {
    this.listeners.add(fn);
    for (const b of this.batches) fn(b);
    if (this.done) fn(null);
    return () => {
      this.listeners.delete(fn);
    };
  }
}
