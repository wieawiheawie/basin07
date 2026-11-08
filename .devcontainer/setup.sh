#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
export PATH="${HOME}/.cargo/bin:${PATH}"

echo "[BASIN 07] Installing prebuilt Rust developer tools..."
if ! command -v cargo-binstall >/dev/null 2>&1; then
  curl -L --proto '=https' --tlsv1.2 -sSf \
    https://raw.githubusercontent.com/cargo-bins/cargo-binstall/main/install-from-binstall-release.sh | bash
fi
export PATH="${HOME}/.cargo/bin:${PATH}"

# Keep wasm-bindgen-cli exactly aligned with the wasm-bindgen crate in Cargo.lock.
WB_VERSION="$(awk '
  $0 == "name = \"wasm-bindgen\"" { getline; sub(/^version = \"/, ""); sub(/\"$/, ""); print; exit }
' Cargo.lock)"
if [[ -z "${WB_VERSION}" ]]; then
  echo "[BASIN 07] Could not determine wasm-bindgen version from Cargo.lock." >&2
  exit 1
fi

cargo binstall --no-confirm --locked \
  "trunk@0.22.1" \
  "wasm-bindgen-cli@${WB_VERSION}" \
  cargo-machete

# The optional native desktop build uses clang + lld and X11/Wayland headers.
if command -v sudo >/dev/null 2>&1 && command -v apt-get >/dev/null 2>&1; then
  missing=()
  command -v clang >/dev/null 2>&1 || missing+=(clang)
  command -v ld.lld >/dev/null 2>&1 || missing+=(lld)
  command -v pkg-config >/dev/null 2>&1 || missing+=(pkg-config)
  if (("${#missing[@]}" > 0)) || ! dpkg -s libxkbcommon-dev libwayland-dev libx11-dev libxrandr-dev libxi-dev libxcursor-dev libxinerama-dev >/dev/null 2>&1; then
    echo "[BASIN 07] Installing native linker and window-system development packages..."
    sudo apt-get update -qq
    sudo apt-get install -y --no-install-recommends clang lld pkg-config \
      libxkbcommon-dev libwayland-dev libx11-dev libxrandr-dev \
      libxi-dev libxcursor-dev libxinerama-dev
  fi
fi

rustup target add wasm32-unknown-unknown
echo "[BASIN 07] Fetching locked WebAssembly dependencies..."
cargo fetch --locked --target wasm32-unknown-unknown

echo "[BASIN 07] Priming the incremental WebAssembly build cache..."
CARGO_BUILD_JOBS=2 cargo build --locked --profile wasm-dev \
  --target wasm32-unknown-unknown --no-default-features \
  --features client,webgl2 --bin basin07

echo "[BASIN 07] Setup complete. Run: trunk serve"
