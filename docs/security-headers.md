# Security headers

Set in `next.config.ts` via `headers()`, applied to `/:path*` (works
unchanged on Vercel — no middleware/proxy involved).

- `Content-Security-Policy`: `default-src 'self'`; `script-src 'self'
  'unsafe-inline' 'wasm-unsafe-eval'`; `worker-src 'self'`; `style-src
  'self' 'unsafe-inline'`; `img-src 'self' data: blob:`; `font-src 'self'
  data:`; `connect-src 'self' blob:`; `object-src 'none'`; `base-uri
  'self'`; `frame-ancestors 'none'`; `form-action 'self'`.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  strict-origin-when-cross-origin`, `Permissions-Policy: camera=(),
  microphone=(), geolocation=(), payment=()`, `X-Frame-Options: DENY`
  (belt and braces alongside `frame-ancestors 'none'`).
- No COOP/COEP — reserved for the wasm-threads work (#175); not needed by
  today's single-threaded `wasm-bindgen` build.

## Why `'unsafe-inline'` stays in `script-src`

Next emits inline bootstrap scripts (`self.__next_f.push(...)`) with no
nonce. A nonce requires per-request header injection, i.e. middleware —
explicitly out of scope here. Trade-off: `'unsafe-inline'` widens
`script-src` to any inline script, but `default-src 'self'` plus
`object-src 'none'` and `base-uri 'self'` still block the classic
injection vectors (remote script tags, base-tag hijack, plugins). When
wasm threads land and this gets revisited, consider moving to
middleware-issued nonces and dropping `'unsafe-inline'`.

## Evidence (2026-09-08, `next dev -p 3114`, Chrome DevTools MCP)

Every request observed across `/`, `/receipts`, `/mockups/ab` — full
scroll, the drop-instrument, and a real `.ifc` drop through the Web
Worker + wasm path — was same-origin (`localhost:3114`, prod:
`ifcfast.com`). Zero CSP violations in the console. Confirmed:

- `<model-viewer environment-image="neutral">` fetches only local chunks
  and the local `/sample/*.glb` assets — no Google CDN (draco/environment
  image) requests, so `connect-src`/`img-src` need nothing external.
- The `ifc-worker.ts` Web Worker (created same-origin via `new
  Worker(new URL(...))`) fetched `/wasm/version.json`,
  `/wasm/ifcfast_wasm.js`, `/wasm/ifcfast_wasm_bg.wasm` — all same-origin,
  all 200/304 — proving `worker-src 'self'`, `script-src ...
  'wasm-unsafe-eval'`, and `connect-src 'self'` are sufficient for the
  parse → tessellate → stream path.
- Fonts are self-hosted via `next/font` (IBM Plex, Geist for
  `next/dev` overlay) — no external stylesheet, so no `fonts.googleapis.com`
  in `style-src`/`font-src`.
- The PyPI version fetch (`components/receipts/pypi.tsx`,
  `PypiBadge`/`pypiVersion`) runs server-side (`fetch` in an `async`
  Server Component, ISR-revalidated) — invisible to the browser, not
  CSP-relevant. `components/pypi-version.tsx` (`PypiVersion`, a
  `"use client"` component that fetches `pypi.org` in the browser) is
  currently unused anywhere in the app — if it's ever wired in, add
  `https://pypi.org` to `connect-src`.

Build note: production `npm run build` was blocked during this pass by
transient TypeScript errors in `app/mockups/ab/page.tsx` /
`components/stream-viewer.tsx` from a concurrent edit in progress
elsewhere; verification above used `next dev` instead, which applies the
same `next.config.ts` `headers()`. Re-run the build once that work lands
to confirm headers survive a production build (they should — `headers()`
is a static route config, not build-mode-dependent).
