"use client";

import { useCallback, useMemo, useState } from "react";
import { Viewport, type ModelState } from "./Viewport";
import type { InstrumentData, InstrumentProduct } from "./types";
import s from "./instrument.module.css";

/* ------------------------------------------------------------------ *
 * Instrument - a cross-filtering read of one federated slice.
 *
 * Every cell is both a readout and a control. Tap a storey, a class, a
 * material or a register row and the model dims to the match; tap a
 * product in the model and its receipt appears here. Discipline chips
 * decide what is loaded as well as what is counted, so the reader pays
 * for the geometry they asked for and nothing else.
 *
 * Nothing outside this folder is imported: the component lifts into
 * another app with its data file and its stylesheet.
 * ------------------------------------------------------------------ */

const nf = new Intl.NumberFormat("en-US");
const int = (n: number) => nf.format(Math.round(n)).replace(/,/g, " ");
const dec = (n: number, d: number) =>
  n
    .toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })
    .replace(/,/g, " ");
const short = (entity: string) => entity.replace(/^Ifc/, "");
const mb = (n: number) => `${(n / 1e6).toFixed(1)} MB`;
const HEAVY_BYTES = 5e6;

const classKey = (entity: string, model: string) => `${entity} ${model}`;

export type InstrumentProps = {
  data: InstrumentData;
  /** Discipline loaded first. Defaults to the first model in the file. */
  initialModel?: string;
};

export function Instrument({ data, initialModel }: InstrumentProps) {
  const first = initialModel ?? data.models[0]?.name;
  const [disciplines, setDisciplines] = useState<Set<string>>(
    () => new Set(first ? [first] : []),
  );
  const [modelState, setModelState] = useState<Record<string, ModelState>>({});
  const [storey, setStorey] = useState<string | null>(null);
  const [cls, setCls] = useState<string | null>(null);
  const [material, setMaterial] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const entries = useMemo(
    () => Object.entries(data.products) as [string, InstrumentProduct][],
    [data.products],
  );

  const inDiscipline = useCallback(
    (model: string) => disciplines.size === 0 || disciplines.has(model),
    [disciplines],
  );

  const filtered = useMemo(
    () =>
      entries.filter(([, p]) => {
        if (!inDiscipline(p.model)) return false;
        if (storey && p.storey !== storey) return false;
        if (cls && classKey(p.entity, p.model) !== cls) return false;
        if (material && p.material !== material) return false;
        return true;
      }),
    [entries, inDiscipline, storey, cls, material],
  );

  const narrowed = !!storey || !!cls || !!material;
  const anyFilter = narrowed || !!selected;

  const activeGuids = useMemo(
    () => (narrowed ? new Set(filtered.map(([g]) => g)) : null),
    [filtered, narrowed],
  );

  const viewportFilter = useMemo(
    () => ({ active: activeGuids, selected }),
    [activeGuids, selected],
  );

  const totals = useMemo(() => {
    let volume = 0;
    let reliable = 0;
    const mats = new Set<string>();
    for (const [, p] of filtered) {
      volume += p.volume_m3;
      if (p.volume_reliable) reliable += 1;
      if (p.material) mats.add(p.material);
    }
    return {
      products: filtered.length,
      volume,
      reliable: filtered.length ? (reliable / filtered.length) * 100 : 100,
      materials: mats.size,
    };
  }, [filtered]);

  const storeyRows = useMemo(() => {
    const counts = new Map<string, number>();
    for (const [, p] of entries) {
      if (!inDiscipline(p.model)) continue;
      counts.set(p.storey, (counts.get(p.storey) ?? 0) + 1);
    }
    return data.storeys.map((st) => ({ ...st, inView: counts.get(st.name) ?? 0 }));
  }, [data.storeys, entries, inDiscipline]);
  const storeyMax = Math.max(1, ...storeyRows.map((x) => x.products));

  const classRows = useMemo(() => {
    const seen = new Map<string, { entity: string; model: string; n: number; v: number }>();
    for (const c of data.classes) {
      if (!inDiscipline(c.model)) continue;
      const k = classKey(c.entity, c.model);
      const cur = seen.get(k) ?? { entity: c.entity, model: c.model, n: 0, v: 0 };
      cur.n += c.n;
      cur.v += c.volume_m3;
      seen.set(k, cur);
    }
    return [...seen.entries()]
      .map(([k, v]) => ({ key: k, ...v }))
      .sort((a, b) => b.n - a.n);
  }, [data.classes, inDiscipline]);
  const classMax = Math.max(1, ...classRows.map((c) => c.n));

  const materialRows = useMemo(() => {
    if (disciplines.size === 0) return data.materials;
    const counts = new Map<string, number>();
    for (const [, p] of entries) {
      if (!p.material || !inDiscipline(p.model)) continue;
      counts.set(p.material, (counts.get(p.material) ?? 0) + 1);
    }
    return data.materials.filter((m) => counts.has(m.name));
  }, [data.materials, disciplines, entries, inDiscipline]);
  const matMax = Math.max(1, ...materialRows.map((m) => m.n));

  const showModel = disciplines.size !== 1;
  const sel = selected ? data.products[selected] : null;
  const onPick = useCallback((guid: string | null) => setSelected(guid), []);
  const onModelState = useCallback(
    (name: string, state: ModelState) =>
      setModelState((prev) => (prev[name] === state ? prev : { ...prev, [name]: state })),
    [],
  );

  const clear = () => {
    setStorey(null);
    setCls(null);
    setMaterial(null);
    setSelected(null);
  };

  const toggleDiscipline = (name: string) => {
    setSelected(null);
    setDisciplines((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const scope = [
    storey,
    cls ? short(cls.split(" ")[0]) : null,
    material,
    selected ? "1 product" : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className={s.instrument}>
      <div className={s.grid}>
        {/* ── title block ───────────────────────────────────────── */}
        <section className={`${s.cell} ${s.title}`}>
          <Head label="Instrument" meta={`ifcfast ${data.ifcfast_version}`} />
          <div className={s.tb}>
            <Field k="Slice" v={data.scope} wide />
            <Field k="Filter" v={anyFilter ? scope : "none"} accent={anyFilter} wide />
          </div>
          <div className={s.chips}>
            {data.models.map((m) => {
              const on = disciplines.has(m.name);
              const st = modelState[m.name];
              const heavy = m.bytes >= HEAVY_BYTES;
              return (
                <button
                  key={m.name}
                  type="button"
                  aria-pressed={on}
                  className={`${s.chip} ${on ? s.chipOn : ""}`}
                  onClick={() => toggleDiscipline(m.name)}
                  title={`${m.name} — ${int(m.products)} products, ${mb(m.bytes)}`}
                >
                  <span className={s.chipName}>{m.name}</span>
                  <span className={s.chipMeta}>
                    {st === "loading"
                      ? "loading"
                      : st === "missing"
                        ? "pending"
                        : st === "failed"
                          ? "failed"
                          : mb(m.bytes)}
                  </span>
                  {heavy && <span className={s.chipHeavy}>heavy</span>}
                </button>
              );
            })}
          </div>
        </section>

        {/* ── quantities readout ────────────────────────────────── */}
        <section className={`${s.cell} ${s.quant}`}>
          <Head label="Quantities" meta={storey ?? "all storeys"} />
          <div className={s.readouts}>
            <Readout k="Products" v={int(totals.products)} />
            <Readout k="Volume" v={dec(totals.volume, 1)} u="m³" />
            <Readout k="Reliable" v={dec(totals.reliable, 0)} u="%" />
            <Readout k="Materials" v={int(totals.materials)} />
          </div>
        </section>

        {/* ── viewport ──────────────────────────────────────────── */}
        <section className={`${s.cell} ${s.view}`}>
          <Head
            label="Viewport"
            meta={selected ? "product selected" : narrowed ? "filtered" : "glTF"}
            accent={anyFilter}
          />
          <Viewport
            models={data.models}
            poster={data.poster}
            filter={viewportFilter}
            onSelect={onPick}
            enabled={disciplines}
            onModelState={onModelState}
          />
        </section>

        {/* ── selection receipt ─────────────────────────────────── */}
        <section className={`${s.cell} ${s.sel}`}>
          <Head label="Selection" meta={sel ? short(sel.entity) : "none"} accent={!!sel} />
          {!sel ? (
            <p className={s.empty}>
              Tap a product in the viewport, or a row in the product register, to pull
              its receipt.
            </p>
          ) : (
            <dl className={s.selBody}>
              <Field k="GlobalId" v={selected!} mono wide />
              <Field k="Class" v={sel.entity} />
              <Field k="Discipline" v={sel.model} />
              <Field k="Storey" v={sel.storey} />
              <Field k="Material" v={sel.material ?? "—"} />
              <Field k="Volume" v={`${dec(sel.volume_m3, 3)} m³`} />
              <Field
                k="volume_reliable"
                v={sel.volume_reliable ? "true" : "false, prism fallback"}
                accent={!sel.volume_reliable}
              />
              <div className={`${s.field} ${s.fieldWide}`}>
                <dt className={s.fieldK}>Clash partners</dt>
                <dd className={s.fieldV}>
                  {sel.clash_partners.length === 0 ? (
                    "none"
                  ) : (
                    <span className={s.partners}>
                      {sel.clash_partners.map((g) => {
                        const p = data.products[g];
                        return (
                          <button
                            key={g}
                            type="button"
                            className={s.partner}
                            onClick={() => setSelected(g)}
                          >
                            {p ? `${short(p.entity)} in ${p.model}` : g}
                          </button>
                        );
                      })}
                    </span>
                  )}
                </dd>
              </div>
              <div className={`${s.field} ${s.fieldWide}`}>
                <button type="button" className={s.clear} onClick={clear}>
                  Clear selection
                </button>
              </div>
            </dl>
          )}
        </section>

        {/* ── storeys ───────────────────────────────────────────── */}
        <section className={`${s.cell} ${s.storey}`}>
          <Head label="Storeys" meta={`${data.storeys.length} levels`} />
          <div className={s.rows}>
            {storeyRows.map((st) => {
              const on = storey === st.name;
              return (
                <button
                  key={st.guid}
                  type="button"
                  aria-pressed={on}
                  className={`${s.row} ${on ? s.rowOn : ""}`}
                  onClick={() => {
                    setSelected(null);
                    setStorey(on ? null : st.name);
                  }}
                >
                  <span className={s.rowElev}>
                    {st.elevation_m >= 0 ? "+" : "−"}
                    {dec(Math.abs(st.elevation_m), 2)}
                  </span>
                  <span className={s.rowName}>{st.name}</span>
                  <span className={s.track}>
                    <span
                      className={s.fill}
                      style={{ width: `${(st.products / storeyMax) * 100}%` }}
                    />
                  </span>
                  <span className={s.rowN}>{int(st.products)}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── class distribution ────────────────────────────────── */}
        <section className={`${s.cell} ${s.dist}`}>
          <Head label="Classes" meta={`${classRows.length} in view`} />
          <div className={s.rows}>
            {classRows.length === 0 && (
              <p className={s.empty}>Switch on a discipline to see its classes.</p>
            )}
            {classRows.map((c) => {
              const on = cls === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  aria-pressed={on}
                  className={`${s.row} ${on ? s.rowOn : ""}`}
                  onClick={() => {
                    setSelected(null);
                    setCls(on ? null : c.key);
                  }}
                  title={`${c.entity} — ${int(c.n)} products, ${dec(c.v, 1)} m³`}
                >
                  <span className={s.rowName}>
                    {short(c.entity)}
                    {showModel && <span className={s.rowSub}>{c.model}</span>}
                  </span>
                  <span className={s.track}>
                    <span
                      className={s.fill}
                      style={{ width: `${(c.n / classMax) * 100}%` }}
                    />
                  </span>
                  <span className={s.rowN}>{int(c.n)}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── material register ─────────────────────────────────── */}
        <section className={`${s.cell} ${s.mat}`}>
          <Head label="Materials" meta={`${materialRows.length} distinct`} />
          <div className={s.rows}>
            {materialRows.length === 0 && (
              <p className={s.empty}>No material assignments in view.</p>
            )}
            {materialRows.map((m) => {
              const on = material === m.name;
              return (
                <button
                  key={m.name}
                  type="button"
                  aria-pressed={on}
                  className={`${s.row} ${on ? s.rowOn : ""}`}
                  onClick={() => {
                    setSelected(null);
                    setMaterial(on ? null : m.name);
                  }}
                >
                  <span className={s.rowName}>{m.name}</span>
                  <span className={s.track}>
                    <span
                      className={s.fill}
                      style={{ width: `${(m.n / matMax) * 100}%` }}
                    />
                  </span>
                  <span className={s.rowN}>{int(m.n)}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── product register ──────────────────────────────────── */}
        <section className={`${s.cell} ${s.reg}`}>
          <Head
            label="Products"
            meta={`${int(filtered.length)} rows`}
            action={
              anyFilter ? { label: "Clear filter", onClick: clear } : undefined
            }
          />
          <div className={s.rows}>
            {filtered.length === 0 && (
              <p className={s.empty}>Nothing matches this filter.</p>
            )}
            {filtered.slice(0, 150).map(([guid, p]) => {
              const on = selected === guid;
              return (
                <button
                  key={guid}
                  type="button"
                  aria-pressed={on}
                  className={`${s.row} ${s.regRow} ${on ? s.rowOn : ""}`}
                  onClick={() => setSelected(on ? null : guid)}
                >
                  <span className={s.rowName}>
                    {short(p.entity)}
                    {showModel && <span className={s.rowSub}>{p.model}</span>}
                  </span>
                  <span className={s.rowV}>{dec(p.volume_m3, 3)}</span>
                  <span
                    className={`${s.flag} ${p.volume_reliable ? s.flagOk : s.flagWarn}`}
                  >
                    {p.volume_reliable ? "mesh" : "prism"}
                  </span>
                </button>
              );
            })}
            {filtered.length > 150 && (
              <p className={s.empty}>
                {int(filtered.length - 150)} more rows. Narrow the filter to see them.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ------------------------------- parts ------------------------------- */

function Head({
  label,
  meta,
  accent,
  action,
}: {
  label: string;
  meta?: string;
  accent?: boolean;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className={s.head}>
      <h4 className={s.headL}>{label}</h4>
      {action ? (
        <button type="button" className={s.headBtn} onClick={action.onClick}>
          {action.label}
        </button>
      ) : (
        meta && <span className={`${s.headM} ${accent ? s.headAcc : ""}`}>{meta}</span>
      )}
    </div>
  );
}

function Field({
  k,
  v,
  wide,
  mono,
  accent,
}: {
  k: string;
  v: string;
  wide?: boolean;
  mono?: boolean;
  accent?: boolean;
}) {
  return (
    <div className={`${s.field} ${wide ? s.fieldWide : ""}`}>
      <dt className={s.fieldK}>{k}</dt>
      <dd
        className={`${s.fieldV} ${mono ? s.fieldMono : ""} ${accent ? s.fieldAcc : ""}`}
        title={v}
      >
        {v}
      </dd>
    </div>
  );
}

function Readout({ k, v, u }: { k: string; v: string; u?: string }) {
  return (
    <div className={s.ro}>
      <div className={s.roV}>
        {v}
        {u && <span className={s.roU}>{u}</span>}
      </div>
      <div className={s.roK}>{k}</div>
    </div>
  );
}
