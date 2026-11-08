# BASIN 07 — Build and iteration performance

## Fast browser iteration (default)

Run the development server without `--release`:

```bash
trunk serve
```

The `index.html` Rust asset selects Cargo's `wasm-dev` profile for development. It enables incremental compilation, omits debug information, compiles the BASIN 07 client crate at `opt-level = 1`, and compiles external dependencies at `opt-level = 3` once. Cargo's package-wide dependency override also takes precedence for matching build/proc-macro crates, so this may increase cold build time; the Codespace benchmark is needed to validate the trade-off. Cargo is capped at two parallel jobs.

Trunk does not run `wasm-opt` in this dev path. The `data-wasm-opt="z"` setting is only applied in release mode. Dev builds skip release minification and content hashing, and Trunk's watcher ignores Cargo/build output directories. Codespaces post-create fetches dependencies and primes the same WASM profile.

Trunk provides the file watcher and browser reload; a separate `cargo watch` process is not needed.

Useful quick commands:

```bash
cargo check-web
cargo test-core
cargo validate-core
```

The headless commands do not enable Bevy, so they work in a Codespace with no display.

## Release and final distribution

Normal optimized WebGL2 release:

```bash
trunk build --release
```

Final distribution build (thin LTO, separate output directory):

```bash
trunk --config Trunk.dist.toml build --release
```

These commands are intentionally slower than `trunk serve`. The normal release uses the existing memory-light `[profile.release]`; the final distribution uses `[profile.dist]`, which inherits release and enables thin LTO. `wasm-opt -Oz` is limited to release builds.

## Native and headless development

Optional native desktop client (requires an X11/Wayland display):

```bash
cargo run-desktop
```

Headless simulation checks:

```bash
cargo test-core
cargo validate-core
```

The Codespaces setup installs clang/lld and X11/Wayland development headers. `.cargo/config.toml` selects clang + lld for `x86_64-unknown-linux-gnu`; the `wasm32-unknown-unknown` target uses Rust's bundled `rust-lld` by default.

## Repeatable cold and incremental benchmark

Stop any running `trunk serve` process first, then run:

```bash
bash scripts/bench-build.sh
```

The script deletes only `target/wasm32-unknown-unknown/wasm-dev`, then measures a cold Cargo/Trunk build with the Rust toolchain, Trunk, wasm-bindgen and crate sources already downloaded. It records GNU `time -v` elapsed time and maximum resident set size (RSS), measures raw and gzip WASM sizes, appends one temporary comment line to `src/game/mod.rs`, measures a second Trunk build using the warm incremental cache, and restores the original file bytes. Results are saved under `.build-metrics/` (git-ignored).

This is representative of a typical Rust client-module edit: the line change touches the client library crate, while Bevy and other external dependencies remain cached. It measures build/repackage duration, not first browser paint or exact websocket reload latency. Run it in the target 2-core/7.8 GB Codespace for target-specific numbers.

## Measurements

### Before these iteration changes

GitHub Actions run [#48](https://github.com/wieawiheawie/basin07/actions/runs/42438783108) provides historical hosted-runner observations (not the user's Codespace):

| Measurement | Observed value | Notes |
|---|---:|---|
| WASM release compile | 5m 30s | `cargo build --release`; hosted-runner cache state was not controlled as a cold baseline |
| Trunk source installation | about 5m 26s | `cargo install trunk --locked`; replaced in Codespaces setup with prebuilt binaries |
| Trunk optimized release packaging | about 62s | `trunk build --release`, including wasm-bindgen and wasm-opt |
| Pre-Trunk WASM | 90,295,893 B raw / 14,475,783 B gzip | Before wasm-opt |
| Regular release WASM | 30,131,532 B raw / 9,006,989 B gzip | After Trunk release optimization |
| Thin-LTO dist WASM | 30,446,751 B raw / 9,015,782 B gzip | Slightly larger than regular release in this run |
| One-line incremental rebuild | Not recorded | No probe existed |
| Peak memory | Not recorded | CI did not capture maximum RSS |

The 5m30 compile and related timings are observations from GitHub's hosted runner, not a measured cold build on a 2-core/7.8 GB Codespace.

### After these changes — Codespace measurement pending

| Measurement | Result |
|---|---|
| Cold `wasm-dev` Trunk build | Run `bash scripts/bench-build.sh` |
| One-line incremental Trunk rebuild | Run `bash scripts/bench-build.sh` |
| Peak RSS, cold / incremental | GNU `time -v` values in `.build-metrics/` |
| `wasm-dev` raw / gzip WASM size | Same benchmark output |
| Release WASM raw / gzip | Previous verified value remains 30,131,532 B / 9,006,989 B until a new release build is intentionally run |

No speedup or target-memory improvement is claimed until this benchmark has run in the actual Codespace.

## What changed, and what did not

- **Fast profile:** the client crate gets an incremental WASM profile with app opt-level 1 and external dependency opt-level 3.
- **Warm Codespaces target:** post-create fetches the locked WASM dependency graph and builds the same `wasm-dev` profile.
- **Prebuilt tools:** Trunk 0.22.1 and `wasm-bindgen-cli` matching the `wasm-bindgen` version in Cargo.lock are installed with `cargo-binstall`.
- **Linkers:** WASM continues to use Rust's bundled rust-lld. Native Linux links use clang + lld.
- **Less development asset work:** no release minification, content hashing or wasm-opt in the dev loop; watcher ignores output folders.
- **Dependency pruning:** Bevy already used `default-features = false` and an explicit feature list; audio, gamepad, animation, glTF and scene defaults were not enabled. The unused `web-sys/HtmlElement` feature was removed. No Rust crate was removed.
- **Duplicate versions:** the lockfile contains transitive versions across platform-specific and semver dependency paths. Setup reports `cargo tree -d`, the WASM-target duplicate graph and `cargo machete`; no semver unification was forced without evidence the duplicate versions coexist in the WASM graph and can be safely unified.
- **Workspace split:** deferred until local measurements show whether the client crate remains the edit-loop bottleneck. Splitting crates without measured benefit would add refactor risk and invalidate warmed build outputs.
- **CI:** remains a cheap content/format/test/validator/WASM-check pipeline. It does not run the full release or dist build.
