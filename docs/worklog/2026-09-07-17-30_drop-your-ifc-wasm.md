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
