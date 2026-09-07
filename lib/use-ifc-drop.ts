"use client";
/**
 * Drop-your-IFC state for the landing's instrument (ifcfast GH #172).
 * Runs the ifcfast wasm core in a Web Worker; the file never leaves the tab.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export const MAX_BYTES = 300 * 1024 * 1024; // browser-tab memory ceiling, stated up front

export type DroppedModel = {
  name: string;
  summary: unknown;
  graph: unknown;
  qto: unknown;
  manifest: unknown;
  bySource: Record<string, number>;
  stats: Record<string, number>;
  glbUrl: string;
  ms: { parse: number; glb: number };
};

export type DropState =
  | { status: "idle" }
  | { status: "working"; name: string; step: string }
  | { status: "ready"; model: DroppedModel }
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
    const worker = new Worker(new URL("./ifc-worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    setState({ status: "working", name: file.name, step: "reading" });
    const bytes = await file.arrayBuffer();
    worker.onmessage = (ev: MessageEvent) => {
      const d = ev.data;
      if (d.progress) {
        setState({ status: "working", name: file.name, step: d.progress });
        return;
      }
      if (!d.ok) {
        setState({ status: "error", name: file.name, error: d.error });
        return;
      }
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const glbUrl = URL.createObjectURL(new Blob([d.glb], { type: "model/gltf-binary" }));
      urlRef.current = glbUrl;
      setState({
        status: "ready",
        model: {
          name: file.name,
          summary: JSON.parse(d.summary),
          graph: JSON.parse(d.graph),
          qto: JSON.parse(d.qto),
          manifest: JSON.parse(d.types),
          bySource: JSON.parse(d.bySource),
          stats: JSON.parse(d.stats),
          glbUrl,
          ms: d.ms,
        },
      });
    };
    worker.onerror = (e) => setState({ status: "error", name: file.name, error: e.message || "worker crashed" });
    worker.postMessage({ bytes, name: file.name }, [bytes]);
  }, []);

  const reset = useCallback(() => {
    workerRef.current?.terminate();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setState({ status: "idle" });
  }, []);

  return { state, open, reset };
}
