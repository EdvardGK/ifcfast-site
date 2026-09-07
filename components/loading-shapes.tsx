"use client";
/**
 * LoadingShapes — the instrument's "parsing in this tab" interlude.
 *
 * ONE fixed cloud of points is the whole show. It rests as a shape,
 * then every point flies to the nearest free spot on the next shape
 * (greedy nearest-target assignment on a spatial grid, so nothing
 * scrambles — the cloud visibly flows from sphere to pyramid to
 * tetrahedron to torus to cube to cone). A faint solid fades in under
 * the resting cloud so the shape reads as a body, and drops out the
 * instant the points leave. Off-white solid, amber points, three only.
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";

const N = 1600; // points in the cloud — fixed for the whole run
const HOLD = 1.0; // s resting as a shape
const FLY = 0.55; // s points travel to the next shape
const PERIOD = HOLD + FLY;

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

/** N area-weighted surface samples of a geometry. */
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
  const out = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    let r = rng() * total, t = 0;
    while (t < tris - 1 && r > areas[t]) r -= areas[t++];
    a.fromBufferAttribute(pos, 3 * t);
    b.fromBufferAttribute(pos, 3 * t + 1);
    c.fromBufferAttribute(pos, 3 * t + 2);
    let u = rng(), v = rng();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    out[3 * i] = a.x + u * (b.x - a.x) + v * (c.x - a.x);
    out[3 * i + 1] = a.y + u * (b.y - a.y) + v * (c.y - a.y);
    out[3 * i + 2] = a.z + u * (b.z - a.z) + v * (c.z - a.z);
  }
  if (g !== geom) g.dispose();
  return out;
}

/** For each point in `from` pick the nearest still-unclaimed point of
 * `to` (grid-hashed, expanding search). Returns `to` reordered so index i
 * is where point i travels — short paths, no scramble. */
function assign(from: Float32Array, to: Float32Array, seed: number): Float32Array {
  const cell = 0.18;
  const key = (x: number, y: number, z: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  const grid = new Map<string, number[]>();
  for (let j = 0; j < N; j++) {
    const k = key(to[3 * j], to[3 * j + 1], to[3 * j + 2]);
    (grid.get(k) ?? grid.set(k, []).get(k)!).push(j);
  }
  const claimed = new Uint8Array(N);
  const out = new Float32Array(N * 3);
  // visit points in a shuffled order so early claims are not spatially biased
  const order = Array.from({ length: N }, (_, i) => i);
  const rng = mulberry32(seed);
  for (let i = N - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  let unclaimedLeft = N;
  for (const i of order) {
    const x = from[3 * i], y = from[3 * i + 1], z = from[3 * i + 2];
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
    let best = -1, bestD = Infinity;
    for (let r = 0; r <= 12 && best < 0; r++) {
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== r) continue; // shell only
        const bucket = grid.get(`${cx + dx},${cy + dy},${cz + dz}`);
        if (!bucket) continue;
        for (const j of bucket) {
          if (claimed[j]) continue;
          const d = (to[3 * j] - x) ** 2 + (to[3 * j + 1] - y) ** 2 + (to[3 * j + 2] - z) ** 2;
          if (d < bestD) { bestD = d; best = j; }
        }
      }
    }
    if (best < 0) { // exhausted the search radius: take any unclaimed
      for (let j = 0; j < N; j++) if (!claimed[j]) { best = j; break; }
    }
    claimed[best] = 1;
    unclaimedLeft--;
    out[3 * i] = to[3 * best]; out[3 * i + 1] = to[3 * best + 1]; out[3 * i + 2] = to[3 * best + 2];
  }
  void unclaimedLeft;
  return out;
}

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
    scene.add(new THREE.HemisphereLight(0xfff4e6, 0x1a1c20, 0.8));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(2.5, 3.5, 2.0);
    scene.add(keyLight);

    const geoms = [
      new THREE.SphereGeometry(1.0, 48, 32),
      new THREE.ConeGeometry(1.15, 1.7, 4, 1), // square pyramid
      new THREE.TetrahedronGeometry(1.25),
      new THREE.TorusGeometry(0.8, 0.32, 24, 64),
      new THREE.BoxGeometry(1.45, 1.45, 1.45),
      new THREE.ConeGeometry(0.95, 1.8, 40, 1),
    ];
    const samples = geoms.map((g, i) => surfacePoints(g, 700 + i));
    const solids = geoms.map((g) => {
      const m = new THREE.Mesh(
        g,
        new THREE.MeshStandardMaterial({ color: 0xe9e7e1, roughness: 0.7, metalness: 0.05, transparent: true, opacity: 0, flatShading: true }),
      );
      m.visible = false;
      return m;
    });

    // the one cloud: current resting positions, and the assigned targets for the flight in progress
    let rest: Float32Array = new Float32Array(samples[0]);
    let target: Float32Array = rest;
    let targetFor = -1; // shape index the current `target` was assigned for
    const pointPos = new Float32Array(rest);
    const pointGeom = new THREE.BufferGeometry();
    pointGeom.setAttribute("position", new THREE.BufferAttribute(pointPos, 3));
    const pointMat = new THREE.PointsMaterial({ color: 0xff8f3a, size: 0.04, sizeAttenuation: true, transparent: true, opacity: 0.95 });
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
    let lastCycle = -1;
    const frame = (now: number) => {
      if (disposed) return;
      const t = Math.max(0, now - t0) / 1000;
      const cycle = Math.floor(t / PERIOD);
      const k = cycle % geoms.length;
      const next = (k + 1) % geoms.length;
      const ph = t % PERIOD;
      if (cycle !== lastCycle) {
        // a new cycle: whatever we were flying to is now where we rest
        if (lastCycle >= 0) rest = target;
        lastCycle = cycle;
        targetFor = -1;
      }
      const flying = ph >= HOLD;
      if (flying && targetFor !== next) {
        target = assign(rest, samples[next], 1000 + cycle);
        targetFor = next;
      }
      // solid: fades in quickly once the points have settled, drops out the instant they leave
      const solidOpacity = flying ? 0 : Math.min(1, ph / 0.18) * 0.6;
      solids.forEach((s, i) => {
        const on = i === k && solidOpacity > 0.01;
        s.visible = on;
        if (on) (s.material as THREE.MeshStandardMaterial).opacity = solidOpacity;
      });
      if (flying) {
        const u = easeInOut((ph - HOLD) / FLY);
        const bulge = Math.sin(u * Math.PI) * 0.12; // slight outward breath mid-flight
        for (let i = 0; i < N; i++) {
          const o = 3 * i;
          const x = rest[o] + (target[o] - rest[o]) * u;
          const y = rest[o + 1] + (target[o + 1] - rest[o + 1]) * u;
          const z = rest[o + 2] + (target[o + 2] - rest[o + 2]) * u;
          const len = Math.hypot(x, y, z) || 1;
          pointPos[o] = x + (x / len) * bulge;
          pointPos[o + 1] = y + (y / len) * bulge;
          pointPos[o + 2] = z + (z / len) * bulge;
        }
      } else {
        pointPos.set(rest);
      }
      (pointGeom.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
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
