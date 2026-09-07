"use client";
/**
 * Drop-your-IFC state for the landing's instrument (ifcfast GH #172).
 * Runs the ifcfast wasm core in a Web Worker; the file never leaves the tab.
 *
 * v2: phased. "indexed" lands first (summary / storeys / register fill in),
 * then geometry streams into a StreamStore (kept out of React state — the
 * viewer subscribes directly), then "done" brings the mesh-derived
 * quantities. A v1 package (no streamMeshes) still works via one glb.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { StreamStore, type Progress } from "./stream-store";

export const MAX_BYTES = 300 * 1024 * 1024; // browser-tab memory ceiling, stated up front

export type DroppedModel = {
  name: string;
  summary: unknown;
  graph: unknown;
  qto: unknown | null;
  manifest: unknown;
  bySource: Record<string, number>;
  stats: Record<string, number>;
  /** v1 packages only — v2 streams into `store` and never builds a glb */
  glbUrl: string | null;
  store: StreamStore | null;
  ms: { parse: number; mesh?: number; glb?: number; batches?: number };
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

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
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
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    const worker = new Worker(new URL("./ifc-worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    const startedAt = performance.now();
    setState({ status: "working", name: file.name, step: "reading", startedAt });
    const bytes = await file.arrayBuffer();
    const store = new StreamStore();
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
        setState({ status: "error", name: file.name, error: d.error });
        return;
      }
      switch (d.phase) {
        case "indexed": {
          model = {
            name: file.name,
            summary: JSON.parse(d.summary),
            graph: JSON.parse(d.graph),
            qto: null,
            manifest: JSON.parse(d.types),
            bySource: {},
            stats: {},
            glbUrl: null,
            store,
            ms: d.ms,
            streaming: true,
            startedAt,
          };
          setState({ status: "ready", model, progress: store.progress });
          return;
        }
        case "batch": {
          // no React state here: the viewer subscribes to the store directly and
          // the pill polls store.progress — re-rendering the instrument per batch
          // is what made the interlude stutter on big files
          store.push({ meta: d.meta, positions: d.positions, indices: d.indices, normals: d.normals }, d.progress as Progress);
          return;
        }
        case "done": {
          store.shift = JSON.parse(d.shift);
          store.finish();
          if (!model) return;
          model = {
            ...model,
            graph: JSON.parse(d.graph),
            qto: JSON.parse(d.qto),
            bySource: JSON.parse(d.bySource),
            stats: JSON.parse(d.stats),
            ms: d.ms,
            streaming: false,
            finishedAt: performance.now(),
          };
          setState({ status: "ready", model, progress: store.progress });
          return;
        }
        case "glb": {
          const glbUrl = URL.createObjectURL(new Blob([d.glb], { type: "model/gltf-binary" }));
          urlRef.current = glbUrl;
          model = {
            name: file.name,
            summary: JSON.parse(d.summary),
            graph: JSON.parse(d.graph),
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
    worker.onerror = (e) => setState({ status: "error", name: file.name, error: e.message || "worker crashed" });
    worker.postMessage({ bytes, name: file.name, batch: 200 }, [bytes]);
  }, []);

  const reset = useCallback(() => {
    workerRef.current?.terminate();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setState({ status: "idle" });
  }, []);

  return { state, open, reset };
}
