import type { NextConfig } from "next";

/**
 * Security headers (GH #175 prep: wasm-client-side plan, docs/plans/2026-09-07).
 * See docs/security-headers.md for the rationale and the measured hosts this
 * page actually contacts. Do NOT add COOP/COEP here — those are reserved for
 * the wasm-threads work and are not needed by the current single-threaded
 * wasm-bindgen build.
 */
const CSP = [
  "default-src 'self'",
  // Next emits inline bootstrap scripts (self.__next_f.push(...)) that have
  // no nonce today because this is a plain next.config.ts header, not
  // middleware — see docs/security-headers.md for the nonce trade-off.
  // 'wasm-unsafe-eval' is required for WebAssembly.instantiate() in the
  // ifc-worker Web Worker (crates/wasm, ifcfast wasm core).
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "worker-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
