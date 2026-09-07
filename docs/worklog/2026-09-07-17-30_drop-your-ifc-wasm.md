## Agent signature
- **Agent**: `claude-fable-5-1`
- **Working tree**: `/home/edkjo/workspace/inbox/ifcfast-site`
- **Branch**: `master` @ `5ddb42b` → `66b0bd6` (+ this follow-up)
- **Session scope**: "drop your IFC" on the landing's instrument, parsed client-side by the ifcfast wasm core (ifcfast GH #172)
- **Touched paths**: app/mockups/ab/page.tsx, lib/{ifc-worker.ts, use-ifc-drop.ts, ifcfast-wasm.d.ts}, scripts/sync-wasm.sh, public/wasm/
- **Parallel sessions observed**: none
- **Supersedes / superseded by**: none

## Summary
Ed: client-side only, no backend. The instrument (chapter 06) now takes a
dropped .ifc/.ifczip → Web Worker → `IfcModel.fromBytes` (wasm from
/wasm/, ~1 MB) → the same summary/graph/qto/types JSON + glb the sample
sidecars provide → every instrument panel and the viewport switch to
the dropped model; the film keeps the Duplex. Verified with Playwright:
Clinic_Architectural (13 MB) ~730 ms in-browser, cross-filter works on
3 439 GUID-named materials, zero console errors.

Gotchas: glb must be baked (instancing off) for model-viewer's
material API; model-viewer only loads when in view (`loading="auto"`);
the wasm glue is loaded by runtime URL from public/ (webpackIgnore +
turbopackIgnore) so Turbopack never tries to bundle it. Sync the package
with `scripts/sync-wasm.sh` after every parser wasm rebuild.

## Next
- Progress UI is text-only (reading / parsing / tessellating); a real
  progress bar needs a streaming core API.
- Per-type mini-glbs (register hover preview) are absent for dropped
  models by design (v1).

## Evening: streaming viewer, interlude v2, cache pinning (`dc57330`, `95dce5d`)
- Streaming: see the parser worklog addendum (RIV 130 MB: 5.5 s, 105 MB heap).
- Interlude v2 after Ed's "really bad" on v1: one flat-shaded solid at a
  time dissolving into an amber cloud that reforms as the next shape
  (sphere → pyramid → tetrahedron → torus → cube → cone). `?interlude`
  keeps it on screen. Frames verified in DevTools Chrome.
- Ed's Windows PC: "WebAssembly.instantiate(): Import #0 … requires a
  callable" = cached v1 glue + v2 wasm. `sync-wasm.sh` now writes
  `public/wasm/version.json` (wasm content hash); the worker fetches it
  `no-store` and loads glue + wasm with `?v=<hash>` — the pair is atomic.
  Rerun `scripts/sync-wasm.sh` after every parser wasm rebuild or the
  hash goes stale (the worker still works, just unpinned).
- Interlude v3 (`27889df`) after Ed's second pass ("way too slow", "points
  change from shape to shape"): one fixed 1 600-point cloud, nearest-
  target assignment per transition (grid-hashed greedy), 1.0 s rest /
  0.55 s flight, faint solid under the resting cloud. v2's per-shape
  resampling matched by index was the scramble.
- Interlude v4 (final for tonight): Ed clarified — keep the v2 cadence,
  fixed point set, points hidden whenever the mesh shows, and NO pause
  between "points formed" and "mesh appears" (crossfade during the last
  38 % of the gather); plus "explode into a blob between each shape"
  (radial shell 1.4–1.85) and "zoom out" (camera distance from viewport
  aspect so the blob fits the portrait desktop cell).
- Smoothness pass after "laggy and choppy": interlude lap precomputed
  (the per-transition assignment was the stall), 900 points, dpr ≤ 1.5,
  Lambert; stream path: meta parsed + normals computed in the worker,
  batches never touch React state (StreamingPill polls the store).
  Measured: preview 60.3 fps / max 16.8 ms; RIV parse+stream 58.6 fps,
  p99 16.8 ms, one 267 ms hitch at the "indexed" graph parse.
- Interlude tuning with Ed live: no pulse, no hang (explode → immediate
  contraction), points hidden 0.5 s before the gather ends, solid in over
  the last 0.6 s. Live parsing timer (10 Hz) in the pill, the interlude
  caption and the title-block PARSE cell; final elapsed kept in the pill.
  Verified on G55_RIE: all three tick together, PARSE settles on the
  engine's own number (1 267 ms) once indexed. The model itself starts
  rendering at the first geometry batch, ~150 ms after "indexed".
- Pick semantics (`458e760`), Ed: "click in the viewer highlights; the
  cross-filter UI isolates. We don't hide the thing we're interfacing
  with." A pick is now a separate selection drawn in a brighter accent on
  top of the filters (both viewers); nothing is hidden by a pick; the
  raycast prefers the first product INSIDE the active filter along the
  ray, falling back to a ghosted one. Verified with a `__debugPick`
  hook: batch index offsets sorted, binary-search product == brute
  force, projected-vertex ray hits (6), no-filter pick == nearest hit,
  filter survives a pick. Lesson: MEP models are mostly air — a ray
  through the model centre often hits nothing; that is not a bug.
  Note: a stale canvas rect after the filter button appears shifted a
  synthetic click; real clicks read the live rect.

## Late evening — two agents in parallel (Fable coordinating, per Ed)
- **Perf (opus, main tree, `01a3eb3`)**: the 20 s RIV was NOT the
  normals — `graphJson()` called before the mesh pass to build the
  "indexed" message cost 6.6–8.8 s (eager graph build the mesh pass
  repeats); after the stream it costs 342 ms. Graph now built once,
  after the stream; normals dropped in favour of dFdx/dFdy flat
  shading; Uint8 colours; converging camera fit; root matrix baked once.
  RIV 20.3 → 10.8 s wall, first triangle 13.2 → 6.1 s, 60 fps streaming;
  Clinic ARK 2.43 → 1.44 s. Open: panels empty while streaming (~4 s on
  RIV, graph lands at "done"); ~830 ms React hitch rendering 35 789 rows
  after "done".
- **Treemap (opus, isolated worktree `agent/entity-treemap`, `db76567`,
  merged `24fb9c5`)**: MATERIALS on top, entity distribution as a
  d3-hierarchy squarified treemap under it; column 0.72fr, viewport
  1.6fr (+132 px at 1440); hover/click/keyboard like the bars.
- Coordinator: spaces / openings are never pick targets on either
  viewer (the translucent room volume won every click — a big part of
  "picks random things").
- Ed's rule, recorded in memory: Fable plans and coordinates, opus /
  sonnet write the code.
