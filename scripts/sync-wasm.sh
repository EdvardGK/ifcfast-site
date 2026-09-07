#!/bin/bash
# Copy the ifcfast wasm package (built by ifcfast/crates/wasm/build.sh) into
# public/wasm/ and stamp public/wasm/version.json with the wasm's content
# hash. The worker loads BOTH files with ?v=<hash> so a cached glue can
# never be paired with a newer .wasm (the "function import requires a
# callable" failure).
set -eu
SRC="${1:-$HOME/workspace/inbox/ifcfast/crates/wasm/pkg}"
DST="$(dirname "$0")/../public/wasm"
mkdir -p "$DST"
cp "$SRC"/ifcfast_wasm.js "$SRC"/ifcfast_wasm_bg.wasm "$DST"/
[ -f "$SRC"/ifcfast_wasm.d.ts ] && cp "$SRC"/ifcfast_wasm.d.ts "$DST"/ || true
HASH=$(sha256sum "$DST/ifcfast_wasm_bg.wasm" | cut -c1-16)
printf '{"v":"%s","bytes":%s,"built":"%s"}\n' "$HASH" "$(stat -c %s "$DST/ifcfast_wasm_bg.wasm")" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$DST/version.json"
cat "$DST/version.json"
ls -la "$DST"
