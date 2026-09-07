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

export type Batch = { meta: ProductMeta[]; positions: Float32Array; indices: Uint32Array };
export type Progress = { seen: number; meshed: number; total: number };

export class StreamStore {
  batches: Batch[] = [];
  progress: Progress = { seen: 0, meshed: 0, total: 0 };
  shift: [number, number, number] = [0, 0, 0];
  done = false;
  private listeners = new Set<(b: Batch | null) => void>();

  push(b: Batch, p: Progress) {
    this.batches.push(b);
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
