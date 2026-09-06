import type { ReactNode } from "react";

/* ------------------------------------------------------------------ *
 * The page is a stack of receipts. Every receipt has the same three
 * parts and they always appear in the same order: the claim, the number
 * that proves it, the command that reproduces it. The primitives below
 * are that structure — there is no decorative container in this file.
 * ------------------------------------------------------------------ */

export function Shell({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[70rem] px-5 sm:px-8">{children}</div>;
}

/** One receipt. `source` is the file or model the numbers came from. */
export function Receipt({
  id,
  claim,
  source,
  children,
}: {
  id: string;
  claim: ReactNode;
  source?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="border-t border-rule">
      <Shell>
        <div className="py-12 sm:py-20">
          <header className="mb-7 sm:mb-9 lg:flex lg:items-baseline lg:justify-between lg:gap-10">
            <h2 className="max-w-[22ch] text-[1.5rem] leading-[1.2] font-semibold tracking-[-0.022em] sm:text-[2rem]">
              {claim}
            </h2>
            {source && (
              <p className="num mt-3 text-[0.7rem] tracking-[0.06em] text-ink-3 lg:mt-0 lg:shrink-0 lg:text-right">
                {source}
              </p>
            )}
          </header>
          {children}
        </div>
      </Shell>
    </section>
  );
}

/** Body prose. Never wider than a comfortable measure. */
export function Prose({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-[38rem] space-y-4 text-[0.9375rem] sm:text-base leading-[1.65] text-ink-2 [&_strong]:font-medium [&_strong]:text-ink">
      {children}
    </div>
  );
}

/** A ruled grid of measurements: two up on the phone, four on desktop. */
export function Figures({ children }: { children: ReactNode }) {
  return (
    <dl className="grid grid-cols-2 border-t border-l border-rule sm:grid-cols-4">
      {children}
    </dl>
  );
}

export function Fig({
  value,
  unit,
  label,
  note,
}: {
  value: string;
  unit?: string;
  label: string;
  note?: string;
}) {
  return (
    <div className="border-b border-r border-rule px-3 py-4 sm:px-4 sm:py-5">
      <dd className="num text-[1.5rem] sm:text-[1.75rem] leading-none font-medium text-ink">
        {value}
        {unit && (
          <span className="ml-1 text-[0.8125rem] font-normal text-ink-3">{unit}</span>
        )}
      </dd>
      <dt className="mt-2 text-[0.75rem] leading-tight text-ink-2">{label}</dt>
      {note && <p className="mt-1 text-[0.6875rem] leading-tight text-ink-3">{note}</p>}
    </div>
  );
}

/** The command that reproduces the numbers above it. Always wraps. */
export function Command({
  children,
  shell = false,
  label,
}: {
  children: string;
  shell?: boolean;
  label?: string;
}) {
  return (
    <div className="mt-6 max-w-[46rem] border-l-2 border-accent bg-paper-2">
      {label && (
        <div className="num border-b border-rule px-3 pt-2 pb-1.5 text-[0.6875rem] uppercase tracking-[0.08em] text-ink-3">
          {label}
        </div>
      )}
      <pre className="cmd px-3 py-3 text-ink">
        {shell ? <span className="text-ink-3 select-none">$ </span> : null}
        {children}
      </pre>
    </div>
  );
}

/** A table wider than the phone: scrolls inside itself, with a fade. */
export function Scroller({
  children,
  minWidth = "34rem",
}: {
  children: ReactNode;
  minWidth?: string;
}) {
  return (
    <div className="fade-right -mx-5 sm:mx-0">
      <div className="scroller px-5 pb-2 sm:px-0">
        <div style={{ minWidth }}>{children}</div>
      </div>
    </div>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <p className="mt-5 max-w-[38rem] text-[0.8125rem] leading-[1.6] text-ink-3">
      {children}
    </p>
  );
}

/** Provenance line: which receipt file, and how much to trust it yet. */
export function Stamp({
  generated,
  file,
  values,
}: {
  generated: string;
  file: string;
  values: "measured" | "example";
}) {
  const pending = generated === "PLACEHOLDER";
  return (
    <p className="num mt-6 text-[0.6875rem] text-ink-3">
      {file}
      <span className="mx-2 text-rule-2">/</span>
      {!pending ? (
        <>generated {generated}</>
      ) : values === "measured" ? (
        <span className="text-ink-2">measured, date stamp pending</span>
      ) : (
        <span className="text-ink-2">example values, pending regeneration</span>
      )}
    </p>
  );
}

export function Link({ href, children }: { href: string; children: ReactNode }) {
  const external = href.startsWith("http");
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      className="text-accent underline decoration-accent/35 underline-offset-[3px] hover:decoration-accent"
    >
      {children}
    </a>
  );
}
