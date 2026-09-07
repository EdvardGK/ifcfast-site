#!/bin/bash
# Copy the ifcfast wasm package (built by ifcfast/crates/wasm/build.sh) into public/wasm/.
set -eu
SRC="${1:-$HOME/workspace/inbox/ifcfast/crates/wasm/pkg}"
DST="$(dirname "$0")/../public/wasm"
mkdir -p "$DST"
cp "$SRC"/ifcfast_wasm.js "$SRC"/ifcfast_wasm_bg.wasm "$DST"/
[ -f "$SRC"/ifcfast_wasm.d.ts ] && cp "$SRC"/ifcfast_wasm.d.ts "$DST"/ || true
ls -la "$DST"
