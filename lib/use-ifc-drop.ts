"use client";
/**
 * Drop-your-IFC state for the landing's instrument (ifcfast GH #172).
 * Runs the ifcfast wasm core in a Web Worker; the file never leaves the tab.
 *
 * v2: phased. "indexed" lands first (summary + type register), then geometry
 * streams into a StreamStore (kept out of React state — the viewer subscribes
 * directly), then "done" brings the real product graph and the mesh-derived
 * quantities. A v1 package (no streamMeshes) still works via one glb.
 *
 * While geometry streams the hook publishes a PROVISIONAL graph rebuilt from
 * the accumulated batch meta every PROVISIONAL_MS — enough for the quantities
 * strip, the entity treemap and a viewport pick. It is NOT the real graph:
 * materials and the storey list only exist once graphJson() has run, and only
 * meshed products appear in it. `provisional` says which one you are holding.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { StreamStore, type Progress, type StreamStats } from "./stream-store";

export const MAX_BYTES = 300 * 1024 * 1024; // browser-tab memory ceiling, stated up front

/** provisional-graph republish rate while geometry streams. Every tick is a
 * full instrument re-render, so this is a direct trade against the 60 fps the
 * viewer and the interlude need: 4 Hz reads as "live" and costs ~4 % of the
 * frame budget; per-batch (≈35 Hz on RIV) does not. */
const PROVISIONAL_MS = 250;

/** shape the instrument reads: a graph with no products yet. The storey list
 * and contained_in only exist once graphJson() has run — there is no wasm call
 * that yields storeys without building the whole graph, so STOREY SECTION and
 * MATERIALS stay pending until "done" by design. */
const EMPTY_GRAPH = { products: [] as unknown[], storeys: [] as unknown[], contained_in: [] as unknown[] };

export type DroppedModel = {
  name: string;
  summary: unknown;
  /** the product graph. While geometry streams this is the PROVISIONAL graph
   * folded from batch meta (no materials, no storeys, meshed products only);
   * `provisional` is true then. At "done" the real graphJson replaces it. */
  graph: unknown;
  /** true while `graph` is the batch-meta fold rather than graphJson's output */
  provisional: boolean;
  qto: unknown | null;
  manifest: unknown;
  bySource: Record<string, number>;
  stats: Record<string, number>;
  /** v1 packages only — v2 streams into `store` and never builds a glb */
  glbUrl: string | null;
  store: StreamStore | null;
  ms: { parse: number; mesh?: number; glb?: number; batches?: number };
  /** full per-phase budget (worker + main), surfaced in the pill tooltip */
  perf?: StreamStats;
  /** geometry still arriving */
  streaming: boolean;
  /** performance.now() when the file was picked — drives the live timer */
  startedAt: number;
  /** performance.now() when everything had landed (set at "done" / "glb") */
  finishedAt?: number;
};

export type DropState =
  | { status: "idle" }
  | { status: "working"; name: string; step: string; startedAt: number }
  | { status: "ready"; model: DroppedModel; progress: Progress }
  | { status: "error"; name: string; error: string };

export function useIfcDrop() {
  const [state, setState] = useState<DropState>({ status: "idle" });
  const workerRef = useRef<Worker | null>(null);
  const urlRef = useRef<string | null>(null);
  const provRef = useRef<number | null>(null);
  const stopProvisional = useCallback(() => {
    if (provRef.current !== null) {
      clearInterval(provRef.current);
      provRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      if (provRef.current !== null) clearInterval(provRef.current);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  const open = useCallback(async (file: File) => {
    if (!/\.(ifc|ifczip|step|stp)$/i.test(file.name)) {
      setState({ status: "error", name: file.name, error: "not an IFC file (.ifc / .ifczip)" });
      return;
    }
    if (file.size > MAX_BYTES) {
      setState({
        status: "error",
        name: file.name,
        error: `${(file.size / 1e6).toFixed(0)} MB is over the ${MAX_BYTES / 1024 / 1024} MB browser budget — run ifcfast locally for this one`,
      });
      return;
    }
    workerRef.current?.terminate();
    stopProvisional();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    const startedAt = performance.now();
    const s0 = performance.now();
    const worker = new Worker(new URL("./ifc-worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    const spawnMs = performance.now() - s0;
    setState({ status: "working", name: file.name, step: "reading", startedAt });
    // the read is awaited HERE, not in the worker: it is async (it never blocks
    // this thread) and it runs while the worker module is still compiling, so
    // moving it across the boundary only serialises the two.
    const r0 = performance.now();
    const bytes = await file.arrayBuffer();
    const readMs = performance.now() - r0;
    const store = new StreamStore();
    store.stats.read = readMs;
    store.stats.spawn = spawnMs;
    let model: DroppedModel | null = null;

    worker.onmessage = (ev: MessageEvent) => {
      const d = ev.data;
      // bare progress strings ("parsing", …) come before any phase; batch
      // messages also carry a `progress` field (JSON) — never confuse the two
      if (!d.phase && typeof d.progress === "string" && d.ok === undefined) {
        setState({ status: "working", name: file.name, step: d.progress, startedAt });
        return;
      }
      if (d.ok === false) {
        stopProvisional();
        setState({ status: "error", name: file.name, error: d.error });
        return;
      }
      switch (d.phase) {
        case "indexed": {
          const pj = performance.now();
          const parsedSummary = JSON.parse(d.summary);
          const parsedTypes = JSON.parse(d.types);
          store.stats.indexedParse = performance.now() - pj;
          model = {
            name: file.name,
            summary: parsedSummary,
            // the real product graph is a post-stream product (see ifc-worker:
            // graphJson() before the mesh pass costs 6.6-8.8 s on RIV). Until it
            // lands the instrument runs on the provisional fold below, so the
            // panels are never blank and never show the previous model's numbers.
            graph: EMPTY_GRAPH,
            provisional: true,
            qto: null,
            manifest: parsedTypes,
            bySource: {},
            stats: {},
            glbUrl: null,
            store,
            ms: d.ms,
            streaming: true,
            startedAt,
          };
          setState({ status: "ready", model, progress: store.progress });
          let published = -1;
          stopProvisional();
          provRef.current = window.setInterval(() => {
            if (!model || !model.provisional) return;
            const n = store.products.length;
            if (n === published) return; // nothing new since the last tick
            published = n;
            // a fresh array so the instrument's useMemos see a new identity;
            // slicing 35 789 refs is ~0.3 ms, folding them again is not
            model = { ...model, graph: { ...EMPTY_GRAPH, products: store.products.slice() } };
            setState({ status: "ready", model, progress: { ...store.progress } });
          }, PROVISIONAL_MS) as unknown as number;
          return;
        }
        case "batch": {
          // no React state here: the viewer subscribes to the store directly and
          // the pill polls store.progress — re-rendering the instrument per batch
          // is what made the interlude stutter on big files
          const h0 = performance.now();
          if (!store.stats.firstBatch) store.stats.firstBatch = h0 - startedAt;
          store.push({ meta: d.meta, positions: d.positions, indices: d.indices, normals: d.normals }, d.progress as Progress);
          const h1 = performance.now();
          store.stats.handle += h1 - h0;
          store.stats.lastBatch = h1 - startedAt;
          return;
        }
        case "done": {
          stopProvisional();
          const entered = performance.now();
          store.stats.doneLag = d.sentAt ? performance.timeOrigin + entered - d.sentAt : 0;
          store.shift = JSON.parse(d.shift);
          store.finish();
          if (!model) return;
          const j0 = performance.now();
          const graph = JSON.parse(d.graph);
          const qto = JSON.parse(d.qto);
          const bySource = JSON.parse(d.bySource);
          const stats = JSON.parse(d.stats);
          store.stats.doneParse = performance.now() - j0;
          const w = (d.ms?.w ?? {}) as Partial<StreamStats> & { recvAt?: number };
          if (w.recvAt) store.stats.handoff = w.recvAt - postedAt;
          delete w.recvAt;
          Object.assign(store.stats, w);
          model = {
            ...model,
            graph,
            provisional: false,
            qto,
            bySource,
            stats,
            ms: d.ms,
            perf: { ...store.stats },
            streaming: false,
            finishedAt: performance.now(),
          };
          setState({ status: "ready", model, progress: store.progress });
          return;
        }
        case "glb": {
          const glbUrl = URL.createObjectURL(new Blob([d.glb], { type: "model/gltf-binary" }));
          urlRef.current = glbUrl;
          stopProvisional();
          model = {
            name: file.name,
            summary: JSON.parse(d.summary),
            graph: JSON.parse(d.graph),
            provisional: false,
            qto: JSON.parse(d.qto),
            manifest: JSON.parse(d.types),
            bySource: JSON.parse(d.bySource),
            stats: JSON.parse(d.stats),
            glbUrl,
            store: null,
            ms: d.ms,
            streaming: false,
            startedAt,
            finishedAt: performance.now(),
          };
          setState({ status: "ready", model, progress: { seen: 0, meshed: 0, total: 0 } });
          return;
        }
      }
    };
    worker.onerror = (e) => {
      stopProvisional();
      setState({ status: "error", name: file.name, error: e.message || "worker crashed" });
    };
    const postedAt = performance.timeOrigin + performance.now();
    worker.postMessage({ bytes, name: file.name, batch: 200 }, [bytes]);
  }, [stopProvisional]);

  const reset = useCallback(() => {
    workerRef.current?.terminate();
    stopProvisional();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setState({ status: "idle" });
  }, [stopProvisional]);

  return { state, open, reset };
}
