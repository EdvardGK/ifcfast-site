"use client";
/**
 * LoadingShapes — the instrument's "parsing in this tab" interlude.
 *
 * One solid at a time. It dissolves into a cloud of points, the cloud
 * drifts, then gathers into the next solid, which fades back in:
 * sphere → pyramid → tetrahedron → torus → cube → cone → sphere …
 * Off-white solid, amber points, the film's palette. three only.
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";

const N = 1200; // points in the cloud
const HOLD = 1.1; // s the solid rests
const DISSOLVE = 0.7; // s solid → cloud
const DRIFT = 0.5; // s the cloud hangs
const GATHER = 0.9; // s cloud → next solid
const REFORM = 0.4; // s the next solid fades in
const PERIOD = HOLD + DISSOLVE + DRIFT + GATHER + REFORM;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** N surface points (area-weighted) ordered by direction so index i is
 * spatially coherent across shapes — the gather reads as a flow. */
function surfacePoints(geom: THREE.BufferGeometry, seed: number): Float32Array {
  const g = geom.index ? geom.toNonIndexed() : geom;
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  const tris = pos.count / 3;
  const areas = new Float32Array(tris);
  let total = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < tris; t++) {
    a.fromBufferAttribute(pos, 3 * t);
    b.fromBufferAttribute(pos, 3 * t + 1);
    c.fromBufferAttribute(pos, 3 * t + 2);
    areas[t] = b.sub(a).cross(c.sub(a)).length() / 2;
    total += areas[t];
  }
  const rng = mulberry32(seed);
  const pts: { x: number; y: number; z: number; key: number }[] = [];
  for (let i = 0; i < N; i++) {
    let r = rng() * total, t = 0;
    while (t < tris - 1 && r > areas[t]) r -= areas[t++];
    a.fromBufferAttribute(pos, 3 * t);
    b.fromBufferAttribute(pos, 3 * t + 1);
    c.fromBufferAttribute(pos, 3 * t + 2);
    let u = rng(), v = rng();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const x = a.x + u * (b.x - a.x) + v * (c.x - a.x);
    const y = a.y + u * (b.y - a.y) + v * (c.y - a.y);
    const z = a.z + u * (b.z - a.z) + v * (c.z - a.z);
    const lat = Math.atan2(y, Math.hypot(x, z));
    const lon = Math.atan2(z, x);
    pts.push({ x, y, z, key: Math.round((lat + Math.PI / 2) * 5) * 10 + (lon + Math.PI) / (2 * Math.PI) });
  }
  pts.sort((p, q) => p.key - q.key);
  const out = new Float32Array(N * 3);
  pts.forEach((p, i) => { out[3 * i] = p.x; out[3 * i + 1] = p.y; out[3 * i + 2] = p.z; });
  if (g !== geom) g.dispose();
  return out;
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function LoadingShapes({ caption }: { caption?: string }) {
  const host = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let raf = 0;
    let disposed = false;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
    camera.position.set(0, 0.9, 5.2);
    camera.lookAt(0, 0, 0);
    scene.add(new THREE.HemisphereLight(0xfff4e6, 0x1a1c20, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(2.5, 3.5, 2.0);
    scene.add(key);

    const geoms = [
      new THREE.SphereGeometry(1.0, 48, 32),
      new THREE.ConeGeometry(1.15, 1.7, 4, 1), // square pyramid
      new THREE.TetrahedronGeometry(1.25),
      new THREE.TorusGeometry(0.8, 0.32, 24, 64),
      new THREE.BoxGeometry(1.45, 1.45, 1.45),
      new THREE.ConeGeometry(0.95, 1.8, 40, 1),
    ];
    const clouds = geoms.map((g, i) => surfacePoints(g, 700 + i));
    // per-point scatter direction (unit-ish, deterministic)
    const rng = mulberry32(42);
    const scatter = new Float32Array(N * 3);
    for (let i = 0; i < N * 3; i++) scatter[i] = (rng() - 0.5) * 2;

    const solidMat = new THREE.MeshStandardMaterial({
      color: 0xe9e7e1,
      roughness: 0.62,
      metalness: 0.05,
      transparent: true,
      opacity: 1,
      flatShading: true,
    });
    const solids = geoms.map((g) => {
      const m = new THREE.Mesh(g, solidMat.clone());
      m.visible = false;
      return m;
    });
    const pointPos = new Float32Array(clouds[0]);
    const pointGeom = new THREE.BufferGeometry();
    pointGeom.setAttribute("position", new THREE.BufferAttribute(pointPos, 3));
    const pointMat = new THREE.PointsMaterial({ color: 0xff8f3a, size: 0.032, sizeAttenuation: true, transparent: true, opacity: 0 });
    const points = new THREE.Points(pointGeom, pointMat);
    const pivot = new THREE.Group();
    pivot.add(points, ...solids);
    scene.add(pivot);

    const resize = () => {
      const w = el.clientWidth || 300, h = el.clientHeight || 200;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    const t0 = performance.now();
    const frame = (now: number) => {
      if (disposed) return;
      const t = Math.max(0, now - t0) / 1000;
      const k = Math.floor(t / PERIOD) % geoms.length;
      const next = (k + 1) % geoms.length;
      const ph = t % PERIOD;
      const from = clouds[k], to = clouds[next];

      // phase → solid opacity / cloud state
      let solidIdx = k, solidOpacity = 1, cloudOpacity = 0, gather = 0, spread = 0;
      if (ph < HOLD) {
        // rest
      } else if (ph < HOLD + DISSOLVE) {
        const u = smooth((ph - HOLD) / DISSOLVE);
        solidOpacity = 1 - u;
        cloudOpacity = Math.min(1, u * 1.6);
        spread = easeOut(u) * 0.55;
      } else if (ph < HOLD + DISSOLVE + DRIFT) {
        const u = (ph - HOLD - DISSOLVE) / DRIFT;
        solidOpacity = 0;
        cloudOpacity = 1;
        spread = 0.55 + u * 0.12;
      } else if (ph < HOLD + DISSOLVE + DRIFT + GATHER) {
        const u = easeInOut((ph - HOLD - DISSOLVE - DRIFT) / GATHER);
        solidOpacity = 0;
        cloudOpacity = 1;
        gather = u;
        spread = 0.67 * (1 - u);
      } else {
        const u = smooth((ph - HOLD - DISSOLVE - DRIFT - GATHER) / REFORM);
        solidIdx = next;
        solidOpacity = u;
        cloudOpacity = 1 - u;
        gather = 1;
        spread = 0;
      }
      // cloud positions: lerp from → to, plus scatter along the noise vector
      for (let i = 0; i < N * 3; i++) {
        const base = from[i] + (to[i] - from[i]) * gather;
        pointPos[i] = base + scatter[i] * spread;
      }
      (pointGeom.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
      pointMat.opacity = cloudOpacity;
      points.visible = cloudOpacity > 0.01;
      solids.forEach((s, i) => {
        const on = i === solidIdx && solidOpacity > 0.01;
        s.visible = on;
        if (on) (s.material as THREE.MeshStandardMaterial).opacity = solidOpacity;
      });
      pivot.rotation.y = t * 0.35;
      pivot.rotation.x = -0.28 + Math.sin(t * 0.25) * 0.12;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      pointGeom.dispose();
      pointMat.dispose();
      solids.forEach((s) => (s.material as THREE.Material).dispose());
      geoms.forEach((g) => g.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);
  return (
    <div className="ls-host" ref={host} aria-hidden>
      {caption ? <div className="ls-cap">{caption}</div> : null}
    </div>
  );
}
