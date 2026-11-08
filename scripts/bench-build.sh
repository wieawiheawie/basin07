#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

command -v trunk >/dev/null 2>&1 || { echo "trunk is not installed; run bash .devcontainer/setup.sh" >&2; exit 1; }
[[ -x /usr/bin/time ]] || { echo "/usr/bin/time is required (GNU time)" >&2; exit 1; }

TARGET_DIR="${CARGO_TARGET_DIR:-$ROOT/target}"
if [[ "$TARGET_DIR" != /* ]]; then TARGET_DIR="$ROOT/$TARGET_DIR"; fi
export CARGO_TARGET_DIR="$TARGET_DIR"
export CARGO_BUILD_JOBS=2
export CARGO_INCREMENTAL=1

STAMP="$(date -u +%Y%m%d-%H%M%S)"
OUT="$ROOT/.build-metrics/$STAMP"
PROFILE_DIR="$CARGO_TARGET_DIR/wasm32-unknown-unknown/wasm-dev"
mkdir -p "$OUT"

# Cold Rust compilation with the toolchain and crates pre-fetched. Only the
# wasm-dev cross-target artifacts are removed; release/native caches survive.
echo "[BASIN 07] Clearing only $PROFILE_DIR"
rm -rf "$PROFILE_DIR"
rm -rf "$ROOT/dist"

/usr/bin/time -v -o "$OUT/cold.time" trunk build 2>&1 | tee "$OUT/cold.log"

wasm_file() {
  find "$ROOT/dist" -type f -name '*.wasm' -print -quit
}
measure_size() {
  local file="$1"
  [[ -n "$file" && -f "$file" ]] || { echo "No WASM output found in dist/" >&2; return 1; }
  stat -c '%s' "$file"
}
gzip_size() {
  gzip -n -c "$1" | wc -c | tr -d ' '
}
report_time() {
  local file="$1"
  local elapsed rss
  elapsed="$(awk -F': ' '/Elapsed \(wall clock\) time/ {print $2; exit}' "$file")"
  rss="$(awk -F': ' '/Maximum resident set size \(kbytes\)/ {print $2; exit}' "$file")"
  printf '%s | %s kB' "${elapsed:-unknown}" "${rss:-unknown}"
}

COLD_WASM="$(wasm_file)"
COLD_RAW="$(measure_size "$COLD_WASM")"
COLD_GZIP="$(gzip_size "$COLD_WASM")"

# Append a temporary comment to a module in the client library crate so the
# incremental pass must recompile the edited crate, but not Bevy dependencies.
SOURCE="$ROOT/src/game/mod.rs"
BACKUP="$(mktemp)"
cp -- "$SOURCE" "$BACKUP"
restore_source() {
  cp -- "$BACKUP" "$SOURCE"
  rm -f "$BACKUP"
}
trap restore_source EXIT INT TERM

printf '\n// BASIN 07 temporary incremental compile probe\n' >> "$SOURCE"
/usr/bin/time -v -o "$OUT/incremental.time" trunk build 2>&1 | tee "$OUT/incremental.log"
restore_source
trap - EXIT INT TERM

INCR_WASM="$(wasm_file)"
INCR_RAW="$(measure_size "$INCR_WASM")"
INCR_GZIP="$(gzip_size "$INCR_WASM")"

{
  echo "BASIN 07 wasm-dev build benchmark"
  echo "Date UTC: $STAMP"
  echo "Profile: wasm-dev"
  echo "Target: wasm32-unknown-unknown"
  echo "Jobs: 2"
  echo "Incremental: enabled"
  echo
  echo "Cold compile (empty wasm-dev target; tools and crates pre-fetched): $(report_time "$OUT/cold.time")"
  echo "Cold WASM: $COLD_RAW bytes raw; $COLD_GZIP bytes gzip"
  echo "One-line incremental Trunk rebuild: $(report_time "$OUT/incremental.time")"
  echo "Incremental WASM: $INCR_RAW bytes raw; $INCR_GZIP bytes gzip"
  echo
  echo "Logs: $OUT"
} | tee "$OUT/summary.txt"

echo
echo "Benchmark complete. The temporary Rust comment has been restored."
