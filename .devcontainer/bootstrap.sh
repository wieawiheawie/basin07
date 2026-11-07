#!/usr/bin/env bash
set -euo pipefail

ARCHIVE=/tmp/basin07-source.tar.xz
EXPECTED_SHA256=3d1365524c77962c5730191d244542753745e314c618b3146f2843ae6410d771

if [[ -f .bootstrap/chunk-00.txt ]]; then
  echo "[BASIN 07] Verifying and expanding the committed source archive..."
  cat .bootstrap/chunk-*.txt | tr -d '\r\n' | base64 --decode > "$ARCHIVE"
  echo "$EXPECTED_SHA256  $ARCHIVE" | sha256sum --check
  tar -xJf "$ARCHIVE" --no-same-owner
  rm -rf .bootstrap
  rm -f "$ARCHIVE"

  cat >> PROGRESS.md <<'NOTE'

## CODESPACE SOURCE IMPORT

- The source/data/docs archive was expanded from the temporary committed .bootstrap/chunk-*.txt transport files using SHA-256 verification.
- The working tree now contains the normal repository layout. The transport files have been removed.
- The source import is being committed from the authenticated Codespace so the normal GitHub Actions push trigger can run.
- Remote Actions API commits created one failed zero-job run (run 42369736730) and did not provide job logs; no Rust compile result can be inferred from it.
- Run from the repository root:
  - python3 scripts/validate_content.py --stage all --seeds 256
  - cargo fmt --all -- --check
  - cargo test --no-default-features --lib
  - cargo run --no-default-features --bin basin-validator -- --seeds 256
  - cargo build --release --target wasm32-unknown-unknown --no-default-features --features client,webgl2 --bin basin07
  - trunk serve --open
NOTE

  git config user.name "${GIT_AUTHOR_NAME:-BASIN 07 Codespace}"
  git config user.email "${GIT_AUTHOR_EMAIL:-codespace@users.noreply.github.com}"
  git add -A
  git commit -m "chore: expand BASIN 07 source, data and documentation"
  git push origin HEAD:main
else
  echo "[BASIN 07] Source archive already expanded; leaving the working tree intact."
fi

rustup target add wasm32-unknown-unknown
cargo install trunk --locked
echo "[BASIN 07] Toolchain ready. Run cargo test --no-default-features --lib"
