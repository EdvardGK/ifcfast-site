/**
 * Live release number, read on the server from PyPI so the page never
 * advertises a version that is no longer the latest. Revalidated every
 * ten minutes; if PyPI is unreachable the badge renders nothing rather
 * than a stale or invented number.
 */
export async function pypiVersion(): Promise<string | null> {
  try {
    const r = await fetch("https://pypi.org/pypi/ifcfast/json", {
      next: { revalidate: 600 },
    });
    if (!r.ok) return null;
    const d = (await r.json()) as { info?: { version?: string } };
    return d.info?.version ?? null;
  } catch {
    return null;
  }
}

export async function PypiBadge() {
  const version = await pypiVersion();
  if (!version) return null;
  return (
    <a
      href="https://pypi.org/project/ifcfast/"
      target="_blank"
      rel="noreferrer"
      className="num border border-rule px-2 py-1 text-[0.6875rem] text-ink-2 hover:border-rule-2 hover:text-ink"
      title="Latest release on PyPI"
    >
      v{version}
    </a>
  );
}

export async function PypiLine() {
  const version = await pypiVersion();
  return (
    <span className="num">
      {version ? `ifcfast ${version} on PyPI` : "ifcfast on PyPI"}
    </span>
  );
}
