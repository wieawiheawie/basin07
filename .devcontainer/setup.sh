#!/usr/bin/env bash
set -euo pipefail

BIN_DIR="$HOME/.cargo/bin"
mkdir -p "$BIN_DIR"
export PATH="$BIN_DIR:$PATH"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 24 LTS is required. Rebuild the Codespace using the Node feature." >&2
  exit 1
fi

if ! command -v rustup >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain stable
  # shellcheck disable=SC1091
  source "$HOME/.cargo/env"
fi

rustup toolchain install stable --profile minimal --target wasm32-unknown-unknown
rustup default stable
rustup target add wasm32-unknown-unknown

install_release_binary() {
  local url="$1"
  local binary_name="$2"
  local temp_dir
  temp_dir="$(mktemp -d)"
  curl -fsSL "$url" -o "$temp_dir/archive.tar.gz"
  tar -xzf "$temp_dir/archive.tar.gz" -C "$temp_dir"
  local binary_path
  binary_path="$(find "$temp_dir" -type f -name "$binary_name" -print -quit)"
  if [[ -z "$binary_path" ]]; then
    echo "Could not find $binary_name in $url" >&2
    rm -rf "$temp_dir"
    return 1
  fi
  install -m 0755 "$binary_path" "$BIN_DIR/$binary_name"
  rm -rf "$temp_dir"
}

# Download the official prebuilt Linux binaries; cargo is not used to compile toolchains.
install_release_binary \
  "https://github.com/wasm-bindgen/wasm-pack/releases/download/v0.15.1/wasm-pack-v0.15.1-x86_64-unknown-linux-musl.tar.gz" \
  "wasm-pack"
install_release_binary \
  "https://github.com/wasm-bindgen/wasm-bindgen/releases/download/0.2.130/wasm-bindgen-0.2.130-x86_64-unknown-linux-musl.tar.gz" \
  "wasm-bindgen"
install_release_binary \
  "https://github.com/WebAssembly/binaryen/releases/download/version_133/binaryen-version_133-x86_64-linux.tar.gz" \
  "wasm-opt"

cat > "$HOME/.profile.deskbound" <<'EOF'
export PATH="$HOME/.cargo/bin:$PATH"
EOF

if ! grep -q 'profile.deskbound' "$HOME/.bashrc" 2>/dev/null; then
  printf '\n[ -f "$HOME/.profile.deskbound" ] && . "$HOME/.profile.deskbound"\n' >> "$HOME/.bashrc"
fi

echo "Deskbound toolchain ready:"
node --version
rustc --version
cargo --version
wasm-pack --version
wasm-bindgen --version
wasm-opt --version
