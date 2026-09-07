/**
 * Type surface of the ifcfast wasm package (ifcfast repo, crates/wasm,
 * built with `wasm-bindgen --target web` and copied to public/wasm/ by
 * scripts/sync-wasm.sh). Mirrors ifcfast/docs/plans/2026-09-07_wasm-client-side.md.
 */
export default function init(
  module?: URL | Request | Response | BufferSource | string,
): Promise<unknown>;

export class IfcModel {
  static fromBytes(bytes: Uint8Array, name: string): IfcModel;
  summaryJson(): string;
  graphJson(): string;
  qtoJson(): string;
  typesJson(): string;
  toGlb(perProductMaterials?: boolean, instancing?: boolean): Uint8Array;
  bySourceJson(): string;
  statsJson(): string;
  free(): void;
}
