/**
 * Build-time reads of public/receipts/*.json.
 *
 * Nothing on the page is a hand-typed number: every figure below is
 * imported from the generated receipts, so a regeneration updates the
 * page and a missing regeneration is visible (`generated` is stamped
 * next to each receipt).
 */
import parseJson from "@/public/receipts/parse.json";
import qtoJson from "@/public/receipts/qto.json";
import clashJson from "@/public/receipts/clash.json";
import writeJson from "@/public/receipts/write.json";
import mcpJson from "@/public/receipts/mcp.json";

export type ParseModel = {
  discipline: string;
  file: string;
  size_mb: number;
  schema: string;
  authoring_app: string | null;
  products: number;
  storeys: number;
  unit: string;
  open_cold_s: number;
  open_warm_s: number | null;
  bundle_s: number;
  top_types: [string, number][];
};

export const parse = parseJson as unknown as {
  generated: string;
  values: "measured" | "example";
  ifcfast_version: string;
  machine: string;
  project: string;
  license: string;
  models: ParseModel[];
  total_size_mb: number;
  total_products: number;
  total_open_cold_s: number;
  command: string;
};

export const qto = qtoJson as unknown as {
  generated: string;
  values: "measured" | "example";
  ifcfast_version: string;
  model: string;
  mesh_qto_s: number;
  products: number;
  volume_reliable_share: number;
  ifcopenshell_version: string;
  classes: {
    entity: string;
    n: number;
    ifcfast_m3: number;
    ifcopenshell_m3: number;
    ratio: number;
    open_shell: number;
    reference_exceeds_aabb: number;
  }[];
  command: string;
};

export const clash = clashJson as unknown as {
  generated: string;
  values: "measured" | "example";
  federate_s: number;
  clash_s: number;
  tolerance_m: number;
  unit_note: string;
  pairs_total: number;
  pairs_cross_model: number;
  by_category: Record<string, number>;
  by_model_pair: [string, string, number][];
  by_class_pair: [string, string, number][];
  top_rows: {
    guid_a: string;
    class_a: string;
    model_a: string;
    guid_b: string;
    class_b: string;
    model_b: string;
    category: string;
    kind: string;
    storey: string;
  }[];
  oracle: {
    project: string;
    rounds: number;
    pair_recall: [number, number][];
    truth: string;
  };
  command: string;
};

export const write = writeJson as unknown as {
  generated: string;
  values: "measured" | "example";
  model: string;
  subset: {
    guids: number;
    storey: string;
    products_out: number;
    bytes_out: number;
    seconds: number;
  };
  hotswap: {
    guid: string;
    class: string;
    seconds: number;
    untouched_bytes_identical: boolean;
    round_trip: string;
  };
  mutate: { ops: number; seconds: number; placements_cloned: number };
  command: string;
};

export const mcp = mcpJson as unknown as {
  generated: string;
  values: "measured" | "example";
  tools: number;
  groups: Record<string, string[]>;
  resource: string;
  row_limit_default: number;
  model_cache: number;
  config: unknown;
};

/* ---------------------------------- format ---------------------------------- */

const groupInt = new Intl.NumberFormat("en-US");

/** 37772 -> "37 772" — a thin space, so long counts stay readable. */
export function int(n: number): string {
  return groupInt.format(Math.round(n)).replace(/,/g, " ");
}

export function dec(n: number, digits: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Volumes span five orders of magnitude in one table; keep them legible. */
export function m3(n: number): string {
  if (n === 0) return "0";
  if (n >= 1000) return int(n);
  if (n >= 10) return dec(n, 1);
  return dec(n, 2);
}

export function bytes(n: number): string {
  return `${dec(n / 1e6, 2)} MB`;
}

export const PENDING = "PLACEHOLDER";

/** Never print "PLACEHOLDER" as if it were a date. */
export function stamp(generated: string): string {
  return generated === PENDING ? "not yet regenerated" : generated;
}
