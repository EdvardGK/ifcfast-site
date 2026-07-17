"use client";

import { useEffect, useState } from "react";

// Live version badge from PyPI, so the site never shows a stale
// hard-coded release number. Renders nothing until (and unless) the
// fetch succeeds.
export function PypiVersion({
  className = "",
  prefix,
  suffix,
}: {
  className?: string;
  prefix?: string;
  suffix?: string;
}) {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("https://pypi.org/pypi/ifcfast/json")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.info?.version) setVersion(d.info.version);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!version) return null;
  return (
    <>
      {prefix}
      <a
        href="https://pypi.org/project/ifcfast/"
        target="_blank"
        rel="noreferrer"
        className={className}
        title="Latest release on PyPI"
      >
        v{version}
      </a>
      {suffix}
    </>
  );
}
