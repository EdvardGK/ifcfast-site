/**
 * lib/crossfilter.ts — the instrument's ONE cross-filter model.
 * ==================================================================
 * Every consumer of the instrument (the model viewport, the stream
 * viewer, the spatial graph, the entity treemap, the storey stack, the
 * TYPE REGISTER and MATERIALS) derives its look from ONE `Sel` object
 * through the predicates below. Nothing may keep a second opinion about
 * what is selected — that is how the old five-channel model ended up
 * with a selection colour that ignored the cross-filter.
 *
 * ── COMPOSITION RULES (the contract; mirrored in the header of
 *    app/mockups/ab/page.tsx) ─────────────────────────────────────────
 *
 *  1. ONE STATE. `Sel = { storey, entity, type, product, hover }`.
 *     `storey` is a storey guid, "UNPLACED", or null (= whole model);
 *     `entity` / `type` are class / type names; `product` is a guid.
 *     `hover` is transient: it is written on enter and cleared on leave,
 *     and NEVER survives the pointer.
 *
 *  2. ISOLATION. storey / entity / type — set from the panels or the
 *     graph — ISOLATE: what matches is drawn in the amber accent, what
 *     does not is dimmed (ghost ON) or hidden (ghost OFF). Storey scopes
 *     an entity / type isolation (`storeyScope`), entity and type are
 *     mutually exclusive (setting one clears the other), and a storey
 *     change clears both — a storey is a new context, not a refinement.
 *
 *  3. A PRODUCT PICK IS A MEMBER OF THE SAME SYSTEM, NOT A SECOND ONE.
 *     A pick (viewport or graph click) HIGHLIGHTS its product and
 *     cross-highlights its storey / entity / type / material rows in the
 *     SAME amber those rows carry when pinned, plus a product marker (a
 *     small dot) so a picked product's rows read differently from an
 *     isolated class. A pick NEVER hides or dims anything: you must be
 *     able to click several things in a row to find out what they are.
 *
 *  4. ONE COLOUR VOCABULARY. Amber = selected / in-filter, for BOTH an
 *     isolated set and the picked product. `hot` = hover. DIM / HIDE =
 *     outside the filter, per the ghost toggle. There is no third
 *     (cream) selection colour; the picked product is separated from the
 *     amber set it belongs to by INTENSITY (`AMBER_HOT`) plus, where the
 *     renderer can draw one, a 1 px cream edge ring — an outline, never
 *     a fill.
 *
 *  5. PICK ⇄ ISOLATION. Picking while an isolation is active KEEPS the
 *     isolation. Picking a product outside the isolation is impossible
 *     (ghosted geometry does not take the click). If a later isolation
 *     change EXCLUDES the picked product, the pick is cleared
 *     automatically (`reconcile`), so a highlight can never survive
 *     outside the set it belongs to.
 *
 *  6. TOGGLES. Clicking the already-picked product unpicks it; clicking
 *     another product moves the pick; clicking empty space clears the
 *     pick ONLY. Same for the isolation facets: clicking the active
 *     storey / entity / type clears that facet.
 *
 *  7. ONE CLEAR. `clearAll()` resets every facet. It is reachable from
 *     exactly one control (the title bar's CLEAR, with a count badge)
 *     and from Escape. No panel carries its own clear affordance.
 */

/* ------------------------------------------------------------------ */
/* the state                                                           */
/* ------------------------------------------------------------------ */

export type HoverKind = "entity" | "type" | "product" | "storey";
export type Hover = { kind: HoverKind; value: string };

/** THE selection. Five facets, one object, one source of truth. */
export type Sel = {
  /** storey guid · "UNPLACED" · null (= whole model) */
  storey: string | null;
  /** IFC class name */
  entity: string | null;
  /** type name */
  type: string | null;
  /** picked product guid */
  product: string | null;
  /** transient pointer state — never persists past a mouseleave */
  hover: Hover | null;
};

export const EMPTY_SEL: Sel = {
  storey: null,
  entity: null,
  type: null,
  product: null,
  hover: null,
};

/** the storey key for a product with no storey */
export const UNPLACED = "UNPLACED";

/**
 * What a consumer must know about a product to be filtered. Every
 * consumer already has this: the graph's products, the substrate's
 * batch meta and the glb's guid lookup all carry exactly these fields.
 */
export type CfMeta = {
  guid: string;
  entity: string;
  storey_guid: string | null;
  type_name: string | null;
};

/**
 * The picked product's meta. `Sel.product` is the identity; this is the
 * same product's coordinates in the OTHER facets, written in the same
 * commit as `Sel.product` and cleared with it. It is a cache, never an
 * independent channel — nothing may set it alone.
 */
export type PickMeta = CfMeta & { m3: number | null; m2: number | null };

/* ------------------------------------------------------------------ */
/* the derived filter                                                  */
/* ------------------------------------------------------------------ */

/** the isolation, in the shape the viewers' per-product test wants */
export type Filter =
  | { mode: "storey"; value: string }
  | { mode: "entity"; value: string; storeyScope?: string }
  | { mode: "type"; value: string; storeyScope?: string }
  | null;

const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function storeyKeyOf(m: { storey_guid: string | null }): string {
  return m.storey_guid ?? UNPLACED;
}

function storeyHit(m: { storey_guid: string | null }, value: string): boolean {
  return value === UNPLACED ? m.storey_guid == null : m.storey_guid === value;
}

/** the PINNED isolation — hover excluded. This is the one a pick is reconciled against. */
export function pinnedFilter(sel: Sel): Filter {
  const storeyScope = sel.storey ?? undefined;
  if (sel.entity) return { mode: "entity", value: sel.entity, storeyScope };
  if (sel.type) return { mode: "type", value: sel.type, storeyScope };
  if (sel.storey) return { mode: "storey", value: sel.storey };
  return null;
}

/**
 * The isolation the eye currently sees. A hover PREVIEWS the isolation it
 * would pin (it is the same amber-and-dim treatment, applied for as long
 * as the pointer is down the row), which is why it takes precedence —
 * but it is never written to state on leave and never reconciles a pick.
 */
export function activeFilter(sel: Sel): Filter {
  const storeyScope = sel.storey ?? undefined;
  const h = sel.hover;
  if (h?.kind === "entity") return { mode: "entity", value: h.value, storeyScope };
  if (h?.kind === "type") return { mode: "type", value: h.value, storeyScope };
  if (h?.kind === "storey") return { mode: "storey", value: h.value };
  return pinnedFilter(sel);
}

/** does this product match a resolved filter? */
export function matchesFilter(m: CfMeta, f: Filter): boolean {
  if (!f) return true;
  if (f.mode === "storey") return storeyHit(m, f.value);
  const scoped = f.storeyScope ? storeyHit(m, f.storeyScope) : true;
  if (!scoped) return false;
  if (f.mode === "entity") return eq(m.entity, f.value);
  return (m.type_name ?? "—") === f.value;
}

/* ------------------------------------------------------------------ */
/* the predicates every consumer reads                                 */
/* ------------------------------------------------------------------ */

/** inside the isolation (true for everything when nothing is isolated) */
export function isInFilter(m: CfMeta, sel: Sel): boolean {
  return matchesFilter(m, activeFilter(sel));
}

/** the hovered thing — the `hot` treatment, never a selection */
export function isHot(m: CfMeta, sel: Sel): boolean {
  const h = sel.hover;
  if (!h) return false;
  if (h.kind === "entity") return eq(m.entity, h.value);
  if (h.kind === "type") return (m.type_name ?? "—") === h.value;
  if (h.kind === "storey") return storeyHit(m, h.value);
  return m.guid === h.value;
}

/** THE picked product (rule 3) */
export function isSelectedProduct(m: { guid: string }, sel: Sel): boolean {
  return !!sel.product && m.guid === sel.product;
}

/** true while any facet is set — what CLEAR is enabled by */
export function hasSelection(sel: Sel): boolean {
  return !!(sel.storey || sel.entity || sel.type || sel.product);
}

/** true while something ISOLATES (a pick alone does not) */
export function isIsolating(sel: Sel): boolean {
  return !!(sel.storey || sel.entity || sel.type);
}

/** the CLEAR badge: how many facets are active (hover is not a facet) */
export function facetCount(sel: Sel): number {
  return (
    (sel.storey ? 1 : 0) + (sel.entity ? 1 : 0) + (sel.type ? 1 : 0) + (sel.product ? 1 : 0)
  );
}

/* ------------------------------------------------------------------ */
/* the per-product look — the ONE place a colour decision is made       */
/* ------------------------------------------------------------------ */

/** translucent-by-nature classes: context, never a pick target */
export const GHOST_ENTITIES = new Set(["ifcspace", "ifcopeningelement"]);
export const isGhostEntity = (entity: string) => GHOST_ENTITIES.has(entity.toLowerCase());

/**
 * `pick`    — the picked product: amber at full intensity (+ an edge ring
 *             where the renderer can draw one)
 * `accent`  — inside the isolation: the amber accent
 * `natural` — no isolation: the product's authored colour
 * `dim`     — outside the isolation, ghost ON
 * `hide`    — outside the isolation, ghost OFF (or a ghost-by-nature
 *             class with ghost OFF)
 */
export type Look = "pick" | "accent" | "natural" | "dim" | "hide";

export function lookOf(m: CfMeta, sel: Sel, ghost: boolean): Look {
  if (!ghost && isGhostEntity(m.entity)) return "hide";
  // rule 3: a pick is drawn on top of the filter and never hides anything
  if (isSelectedProduct(m, sel)) return "pick";
  const f = activeFilter(sel);
  if (!f) return "natural";
  if (matchesFilter(m, f)) return "accent";
  return ghost ? "dim" : "hide";
}

/** rule 5: ghosted geometry does not take a click */
export function isPickable(m: CfMeta, sel: Sel, ghost: boolean): boolean {
  if (isGhostEntity(m.entity)) return false;
  const look = lookOf(m, sel, ghost);
  return look === "pick" || look === "accent" || look === "natural";
}

/* ------------------------------------------------------------------ */
/* class-level predicates — for the panels whose rows are CLASSES or    */
/* TYPES rather than products (treemap, register, storey stack)         */
/* ------------------------------------------------------------------ */

/** the entity of the pinned / hovered type, when the caller can resolve it */
export type ClassCtx = { typeEntity?: string | null };

/** is this IFC class inside the isolation? (rows are already storey-scoped) */
export function isClassInFilter(entity: string, sel: Sel, ctx?: ClassCtx): boolean {
  const f = activeFilter(sel);
  if (!f || f.mode === "storey") return true;
  if (f.mode === "entity") return eq(entity, f.value);
  return ctx?.typeEntity ? eq(entity, ctx.typeEntity) : true;
}

export function isClassHot(entity: string, sel: Sel, ctx?: ClassCtx): boolean {
  const h = sel.hover;
  if (!h) return false;
  if (h.kind === "entity") return eq(entity, h.value);
  if (h.kind === "type") return ctx?.typeEntity ? eq(entity, ctx.typeEntity) : false;
  return false;
}

/** is this type row inside the isolation? */
export function isTypeInFilter(entity: string, typeName: string, sel: Sel): boolean {
  const f = activeFilter(sel);
  if (!f || f.mode === "storey") return true;
  if (f.mode === "entity") return eq(entity, f.value);
  return typeName === f.value;
}

/* ------------------------------------------------------------------ */
/* transitions — every consumer produces a new Sel through these, so    */
/* the composition rules live in code, not in six call sites            */
/* ------------------------------------------------------------------ */

/** rule 2: a storey is a new context — it clears entity + type */
export function toggleStorey(sel: Sel, key: string): Sel {
  return { ...sel, storey: sel.storey === key ? null : key, entity: null, type: null };
}
/** rule 2: entity and type are mutually exclusive */
export function toggleEntity(sel: Sel, entity: string): Sel {
  return { ...sel, entity: sel.entity === entity ? null : entity, type: null };
}
export function toggleType(sel: Sel, type: string): Sel {
  return { ...sel, type: sel.type === type ? null : type, entity: null };
}
/** rule 6: the same product unpicks, another moves the pick */
export function toggleProduct(sel: Sel, guid: string | null): Sel {
  if (!guid) return { ...sel, product: null };
  return { ...sel, product: sel.product === guid ? null : guid };
}
/** identity-preserving: a repeated mouseleave must not repaint the model */
export function withHover(sel: Sel, hover: Hover | null): Sel {
  const cur = sel.hover;
  if (cur === hover) return sel;
  if (!cur && !hover) return sel;
  if (cur && hover && cur.kind === hover.kind && cur.value === hover.value) return sel;
  return { ...sel, hover };
}
export function clearAll(): Sel {
  return EMPTY_SEL;
}

/**
 * Rule 5, enforced in one place: an isolation change that excludes the
 * picked product drops the pick. Hover is deliberately not considered —
 * moving the pointer over a row must not destroy a selection.
 */
export function reconcile(sel: Sel, pick: PickMeta | null): Sel {
  if (!sel.product || !pick) return sel;
  if (matchesFilter(pick, pinnedFilter({ ...sel, product: null, hover: null }))) return sel;
  return { ...sel, product: null };
}
