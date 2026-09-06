"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { InstrumentModel, ViewportFilter } from "./types";
import s from "./instrument.module.css";

/* ------------------------------------------------------------------ *
 * Viewport - three.js, poster first, one discipline at a time.
 *
 * Nothing here runs until the reader taps Load. Then the enabled
 * disciplines are HEAD-probed (so a missing GLB is a state, not a
 * console error loop) and loaded on demand; switching a discipline on
 * later fetches only that file.
 *
 * Selection is a raycast, and a tap is told apart from an orbit
 * explicitly: pointerdown records position and time, pointerup selects
 * only if the pointer moved under 6 px in under 400 ms. Hits resolve
 * through the glTF node's `extras.guid`, which three.js surfaces as
 * `userData.guid` - never through material names, which ifcfast does
 * not guarantee (GH #146).
 *
 * Before activation the canvas wrapper is `touch-action: pan-y`, so a
 * vertical swipe over the poster still scrolls the page. Orbit takes
 * the gestures only once the reader has asked for the model.
 * ------------------------------------------------------------------ */

const ACCENT = 0x9d86ff;
const LIT = 0x8d949e;
const DIM = 0.055;
const TAP_PX = 6;
const TAP_MS = 400;

export type ModelState = "idle" | "loading" | "ready" | "missing" | "failed";

type Status = "poster" | "starting" | "live" | "pending" | "error";

export type ViewportProps = {
  models: InstrumentModel[];
  poster?: string;
  filter: ViewportFilter;
  onSelect: (guid: string | null) => void;
  /** Disciplines the reader has switched on. Loaded lazily. */
  enabled: Set<string>;
  /** Per-discipline load state, so the chips can report themselves. */
  onModelState?: (name: string, state: ModelState) => void;
};

type SceneApi = {
  add: (model: InstrumentModel) => Promise<ModelState>;
  setVisible: (names: Set<string>) => void;
  apply: (f: ViewportFilter, enabled: Set<string>) => void;
  dispose: () => void;
};

export function Viewport({
  models,
  poster,
  filter,
  onSelect,
  enabled,
  onModelState,
}: ViewportProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<SceneApi | null>(null);
  const loadedRef = useRef<Set<string>>(new Set());
  // `active` flips once and drives the build; `status` is display only, so
  // a status change can never tear down the scene it describes.
  const [active, setActive] = useState(false);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<Status>("poster");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const filterRef = useRef(filter);
  const enabledRef = useRef(enabled);
  const selectRef = useRef(onSelect);
  const stateRef = useRef(onModelState);
  filterRef.current = filter;
  enabledRef.current = enabled;
  selectRef.current = onSelect;
  stateRef.current = onModelState;

  const activate = useCallback(() => {
    setActive(true);
    setStatus("starting");
  }, []);

  /* -------- build the scene once the reader asks for it -------- */
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let dispose: (() => void) | undefined;

    (async () => {
      const host = hostRef.current;
      if (!host) return;

      const THREE = await import("three");
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      const { OrbitControls } = await import(
        "three/examples/jsm/controls/OrbitControls.js"
      );
      if (cancelled) return;

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(0x0b0c0e, 1);
      const canvas = renderer.domElement;
      canvas.style.display = "block";
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      host.appendChild(canvas);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 4000);
      scene.add(new THREE.HemisphereLight(0xdfe4ee, 0x1a1d22, 2.2));
      const key = new THREE.DirectionalLight(0xffffff, 1.3);
      key.position.set(1, 2.2, 1.4);
      scene.add(key);

      const controls = new OrbitControls(camera, canvas);
      controls.enableDamping = true;
      controls.autoRotate = false; // static rig: the camera never moves itself
      controls.update();

      type Entry = { meshes: import("three").Mesh[]; model: string };
      const byGuid = new Map<string, Entry>();
      const pickables: import("three").Object3D[] = [];
      const roots = new Map<string, import("three").Object3D>();
      const loader = new GLTFLoader();

      const frame = () => {
        const box = new THREE.Box3();
        let any = false;
        for (const [, root] of roots) {
          if (!root.visible) continue;
          box.expandByObject(root);
          any = true;
        }
        if (!any || box.isEmpty()) return;
        const size = box.getSize(new THREE.Vector3());
        const centre = box.getCenter(new THREE.Vector3());
        const radius = Math.max(size.length() / 2, 1);
        controls.target.copy(centre);
        camera.position.set(
          centre.x + radius * 1.1,
          centre.y + radius * 0.7,
          centre.z + radius * 1.1,
        );
        camera.near = radius / 400;
        camera.far = radius * 80;
        camera.updateProjectionMatrix();
        controls.update();
      };

      const apply = (f: ViewportFilter, on: Set<string>) => {
        const hasSel = !!f.selected;
        for (const [guid, e] of byGuid) {
          const shown = on.has(e.model);
          const inScope = !f.active || f.active.has(guid);
          const isSel = f.selected === guid;
          const opacity = isSel ? 1 : !shown || !inScope ? DIM : hasSel ? 0.3 : 1;
          for (const mesh of e.meshes) {
            const mat = mesh.material as import("three").MeshStandardMaterial;
            mat.color.setHex(isSel ? ACCENT : LIT);
            mat.opacity = opacity;
            mat.transparent = opacity < 1;
            mat.depthWrite = opacity >= 1;
          }
        }
      };

      const add = async (m: InstrumentModel): Promise<ModelState> => {
        if (roots.has(m.name)) return "ready";
        try {
          const probe = await fetch(m.glb, { method: "HEAD", cache: "force-cache" });
          const type = probe.headers.get("content-type") ?? "";
          if (!probe.ok || type.includes("html")) return "missing";
        } catch {
          return "missing";
        }
        let gltf;
        try {
          gltf = await loader.loadAsync(m.glb);
        } catch {
          return "failed";
        }
        if (cancelled) return "failed";
        const root = gltf.scene;
        root.name = m.name;
        root.traverse((o) => {
          const mesh = o as import("three").Mesh;
          if (!(mesh as { isMesh?: boolean }).isMesh) return;
          // walk up until a node carries the glTF extras ifcfast writes
          let guid: string | undefined;
          let entity: string | undefined;
          let node: import("three").Object3D | null = mesh;
          while (node && !guid) {
            const ud = node.userData as { guid?: string; entity?: string };
            if (ud?.guid) {
              guid = ud.guid;
              entity = ud.entity;
            }
            node = node.parent;
          }
          mesh.material = new THREE.MeshStandardMaterial({
            color: LIT,
            roughness: 0.84,
            metalness: 0.02,
          });
          mesh.userData.__guid = guid ?? null;
          mesh.userData.__entity = entity ?? null;
          pickables.push(mesh);
          if (guid) {
            const e = byGuid.get(guid) ?? { meshes: [], model: m.name };
            e.meshes.push(mesh);
            byGuid.set(guid, e);
          }
        });
        roots.set(m.name, root);
        scene.add(root);
        frame();
        apply(filterRef.current, enabledRef.current);
        return "ready";
      };

      const setVisible = (names: Set<string>) => {
        for (const [name, root] of roots) root.visible = names.has(name);
        frame();
      };

      /* ---- tap versus orbit ---- */
      const raycaster = new THREE.Raycaster();
      const ndc = new THREE.Vector2();
      let down: { x: number; y: number; t: number } | null = null;
      const onDown = (ev: PointerEvent) => {
        down = { x: ev.clientX, y: ev.clientY, t: performance.now() };
      };
      const onUp = (ev: PointerEvent) => {
        const d = down;
        down = null;
        if (!d) return;
        const moved = Math.hypot(ev.clientX - d.x, ev.clientY - d.y);
        if (moved >= TAP_PX || performance.now() - d.t >= TAP_MS) return; // orbit
        const rect = canvas.getBoundingClientRect();
        ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(ndc, camera);
        for (const hit of raycaster.intersectObjects(pickables, false)) {
          let node: import("three").Object3D | null = hit.object;
          let visible = true;
          while (node) {
            if (!node.visible) visible = false;
            node = node.parent;
          }
          if (!visible) continue;
          const guid = hit.object.userData.__guid as string | null;
          if (guid) {
            selectRef.current(guid);
            return;
          }
        }
        selectRef.current(null); // a tap on empty space clears
      };
      const onCancel = () => {
        down = null;
      };
      canvas.addEventListener("pointerdown", onDown);
      canvas.addEventListener("pointerup", onUp);
      canvas.addEventListener("pointercancel", onCancel);

      const resize = () => {
        const w = host.clientWidth || 1;
        const h = host.clientHeight || 1;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(host);

      let raf = requestAnimationFrame(function tick() {
        controls.update();
        renderer.render(scene, camera);
        raf = requestAnimationFrame(tick);
      });

      const api: SceneApi = {
        add,
        setVisible,
        apply,
        dispose: () => {
          cancelAnimationFrame(raf);
          ro.disconnect();
          canvas.removeEventListener("pointerdown", onDown);
          canvas.removeEventListener("pointerup", onUp);
          canvas.removeEventListener("pointercancel", onCancel);
          controls.dispose();
          scene.traverse((o) => {
            const mesh = o as import("three").Mesh;
            if ((mesh as { isMesh?: boolean }).isMesh) {
              mesh.geometry?.dispose();
              (mesh.material as { dispose?: () => void })?.dispose?.();
            }
          });
          renderer.dispose();
          canvas.remove();
        },
      };
      sceneRef.current = api;
      dispose = api.dispose;
      setReady(true);
      setStatus("live");
    })().catch(() => {
      if (!cancelled) {
        setStatus("error");
        setMessage("the viewer could not start in this browser");
      }
    });

    return () => {
      cancelled = true;
      dispose?.();
      sceneRef.current = null;
      loadedRef.current = new Set();
      setReady(false);
    };
  }, [active]);

  /* -------- load and show the enabled disciplines -------- */
  useEffect(() => {
    if (!ready) return;
    const scene = sceneRef.current;
    if (!scene) return;
    let cancelled = false;

    (async () => {
      let attempted = false;
      for (const m of models) {
        if (cancelled) return;
        if (!enabled.has(m.name) || loadedRef.current.has(m.name)) continue;
        attempted = true;
        loadedRef.current.add(m.name);
        setBusy(m.name);
        stateRef.current?.(m.name, "loading");
        const result = await scene.add(m);
        if (cancelled) return;
        stateRef.current?.(m.name, result);
        if (result !== "ready") loadedRef.current.delete(m.name);
      }
      if (cancelled) return;
      setBusy(null);
      scene.setVisible(enabled);
      scene.apply(filterRef.current, enabled);
      if (!attempted) return;
      if (loadedRef.current.size === 0) {
        setStatus("pending");
        setMessage("the discipline models are not published yet");
      } else {
        setStatus("live");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, models, enabled]);

  /* -------- push filter changes into the live scene -------- */
  useEffect(() => {
    if (!ready) return;
    sceneRef.current?.apply(filter, enabled);
  }, [ready, filter, enabled]);

  const idle = status === "poster";
  const blocked = status === "pending" || status === "error";
  const loadingNow = busy !== null;
  const overlay = idle || blocked || status === "starting" || loadingNow;

  return (
    <div className={s.viewport}>
      <div
        ref={hostRef}
        className={s.canvasHost}
        // Before activation the page owns vertical gestures; after it,
        // OrbitControls does.
        style={{ touchAction: ready ? "none" : "pan-y" }}
        aria-hidden={idle || blocked}
      />

      {overlay && (
        <div
          className={`${s.posterLayer} ${loadingNow ? s.posterGhost : ""}`}
          style={
            poster && !loadingNow ? { backgroundImage: `url(${poster})` } : undefined
          }
        >
          {idle && (
            <button type="button" className={s.loadBtn} onClick={activate}>
              Load the model
              <span className={s.loadHint}>
                {models[0]?.name ?? "one discipline"} first
              </span>
            </button>
          )}
          {status === "starting" && <p className={s.posterMsg}>starting viewer…</p>}
          {loadingNow && <p className={s.posterMsg}>loading {busy}…</p>}
          {blocked && (
            <div className={s.posterMsgBlock}>
              <p className={s.posterMsgStrong}>
                {status === "pending" ? "Model pending" : "Viewer unavailable"}
              </p>
              <p className={s.posterMsg}>{message}</p>
              <p className={s.posterMsg}>
                Every other cell reads the substrate and still works.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
