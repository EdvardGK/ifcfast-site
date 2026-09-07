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
