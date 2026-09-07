/* tslint:disable */
/* eslint-disable */

export class IfcModel {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * `{tag: count}` — what the mesh pass saw, including
     * `unhandled:IFCXXX` markers for representations it could not
     * tessellate (GH #166).
     */
    bySourceJson(): string;
    /**
     * Parse from bytes — plain STEP or `.ifczip`, dispatched on magic
     * bytes exactly like the native `source::open`. Throws an `Error`
     * carrying the core's message (truncated file, no STEP trailer,
     * broken zip) rather than serving a partial model.
     */
    static fromBytes(bytes: Uint8Array, name: string): IfcModel;
    /**
     * `<prefix>.graph.json` — per-product rows (measures joined from the
     * mesh pass) plus the spatial graph.
     */
    graphJson(): string;
    /**
     * `<prefix>.qto.json` — per-entity-class aggregates over the same
     * per-product mesh stats.
     */
    qtoJson(): string;
    /**
     * Engine counters for the UI: products seen / meshed / deferred,
     * triangles, mesh milliseconds.
     */
    statsJson(): string;
    /**
     * `<prefix>.summary.json` — identity, counts, top types, and the
     * shape + loaded-state of every table.
     */
    summaryJson(): string;
    /**
     * glTF binary, same writer as `m.to_gltf()`:
     * `KHR_mesh_quantization`, `EXT_mesh_gpu_instancing` (when
     * `instancing` is on), `node.extras.guid`, and GUID-named materials
     * when `perProductMaterials` is on (GH #146).
     *
     * Two product classes are held back, matching what the desktop
     * `to_gltf()` default produces:
     *
     *   * `IfcSpace` — translucent space volumes envelop the building
     *     and read as clutter in a viewport. The sidecar generator
     *     carves a space-free subset before exporting for the same
     *     reason.
     *   * products on the `RelatedOpeningElement` side of an
     *     `IfcRelVoidsElement` — subtracted geometry, never element
     *     geometry. `cut_openings` folds them into the host; with no
     *     boolean kernel on wasm the honest approximation is to drop
     *     them rather than render a door-shaped solid inside the wall.
     *     The hole itself is therefore NOT cut in v1.
     *
     * Nothing is hidden from the data surfaces: openings and spaces
     * keep their rows in `graphJson` / `qtoJson` and their counts in
     * `statsJson`.
     */
    toGlb(per_product_materials?: boolean | null, instancing?: boolean | null): Uint8Array;
    /**
     * `types/manifest.json` — the type roster. `glb` / `bytes` are empty
     * in v1; see the module docs.
     */
    typesJson(): string;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_ifcmodel_free: (a: number, b: number) => void;
    readonly ifcmodel_bySourceJson: (a: number) => [number, number];
    readonly ifcmodel_fromBytes: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly ifcmodel_graphJson: (a: number) => [number, number];
    readonly ifcmodel_qtoJson: (a: number) => [number, number];
    readonly ifcmodel_statsJson: (a: number) => [number, number];
    readonly ifcmodel_summaryJson: (a: number) => [number, number];
    readonly ifcmodel_toGlb: (a: number, b: number, c: number) => [number, number, number, number];
    readonly ifcmodel_typesJson: (a: number) => [number, number];
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
