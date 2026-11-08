# BASIN 07 — Progress Tracker

> Read this file and inspect the latest git log before continuing. Do not repeat completed work.

## Current status — 2026-11-08

- Repository: https://github.com/wieawiheawie/basin07, branch `main`.
- Milestone 1 scene and Trunk release artifact remain; the user's Codespace browser smoke test is still pending.
- Build iteration changes are committed: custom incremental `wasm-dev` profile; Trunk dev profile selection; release-only minification/wasm-opt; watch excludes for build outputs; Cargo two-job cap and incremental cache; Codespaces post-create fetch + warm compile; prebuilt Trunk/wasm-bindgen CLI; native clang/lld; and a cold/incremental benchmark script. The dependency opt-level override also applies to matching build/proc-macro crates under Cargo's package-override precedence, so cold compile cost needs measuring.
- `[profile.release]` remains the specified memory-light release profile; `[profile.dist]` remains thin-LTO only.
- Bevy remains `default-features = false` with explicit used features. Audio, gamepad, animation, glTF and scene defaults are not enabled. Removed only the unused `web-sys/HtmlElement` feature; no Rust crate was removed.
- Codespaces setup installs Trunk 0.22.1 and the wasm-bindgen CLI version matching Cargo.lock, runs `cargo tree -d`, WASM duplicate-tree inspection and `cargo machete`, fetches dependencies and primes the `wasm-dev` target.
- Last fully verified quick CI is commit `75a812e21c949411ecabdeccb8b9572f6c886e05`, run [#50](https://github.com/wieawiheawie/basin07/actions/runs/42460120938): content validator, formatting, all 19 Rust tests, headless validator passed.
- Later optimization commits are not considered green until their own Actions checks pass.
- Historical hosted-runner baseline from run #48: release WASM compile 5m30; Trunk source installation about 5m26; release Trunk packaging about 62s; regular release WASM 30,131,532 raw / 9,006,989 gzip.
- **No target Codespace before/after cold build, one-line incremental build, or peak RSS has been measured yet.** Run `bash scripts/bench-build.sh` in the actual 2-core/7.8 GB Codespace; `BUILD.md` documents the protocol and clearly separates hosted-runner observations from target measurements.

## Exact Codespace commands

After pulling latest `main`:

```bash
git pull --ff-only origin main
bash .devcontainer/setup.sh
trunk serve
```

Open forwarded port **8080**. For measured cold/incremental build performance, stop Trunk first and run:

```bash
bash scripts/bench-build.sh
```

Use `trunk build --release` for the regular optimized release, and `trunk --config Trunk.dist.toml build --release` for the final thin-LTO distribution. Do not add `--release` to the everyday dev loop.

## Build optimization tracker

- [x] Dedicated `wasm-dev` profile: client opt-level 1, dependencies opt-level 3, debug info off, incremental on.
- [x] Trunk dev asset selects `wasm-dev`; release-only wasm-opt/minification remain out of `trunk serve`.
- [x] Trunk ignores target/output directories while watching.
- [x] Codespaces post-create installs prebuilt tools, audits dependencies, fetches crates and warms the wasm target.
- [x] CI caches Cargo artifacts and remains limited to validators, formatting, tests, duplicate-dependency view and WASM check.
- [x] Native Linux linker selects clang/lld; WebAssembly uses Rust's bundled rust-lld.
- [x] Benchmark script records cold/warm one-line build time, peak RSS and WASM raw/gzip sizes.
- [ ] Run benchmark on the actual Codespace and enter measured values in `BUILD.md`.
- [ ] Review actual `cargo tree -d`, WASM duplicate graph and cargo-machete output; unify/remove only when safely proven.
- [ ] Consider a sim/client workspace split only if measured incremental results show a meaningful benefit.

## Known modelling limitations (not build blockers)

- The JSON catalogue is validated by Python, but the runtime catalog still contains hard-coded starter enums/recipes; the data migration is incomplete.
- DLE selectivity, adsorption/regeneration, silica scaling, reservoir decline, hydraulic losses and market dynamics are simplified simulation models, not a full chemical-process simulator.
- Soda ash, hydrated lime, magnesium chloride and process water are imported inputs in the starter slice.
- Economy balance is preliminary and needs broader exploit/strategy coverage.

## Decisions

- Industry: geothermal direct lithium extraction, with brine coproducts, reagent consumption, adsorption/regeneration, and reinjection/water constraints.
- Renderer: Bevy 0.20.1, compiled to WASM. WebGL2 is the primary compatibility build; WebGPU remains a separate feature build.
- Browser bundler: Trunk.
- Controller language: Rhai with a whitelisted sensor/actuator API, disabled module imports, and operation/call-depth limits.
- Content direction: JSON + Serde, with JSON Schema validation planned after the current build/test gates.

## RUST FORMAT REPAIR

- Applied rustfmt to all tracked Rust source and tests.
- Formatting-only changes were committed by the build runner before compile/test steps.

## RUST FORMAT REPAIR

- Applied rustfmt to all tracked Rust source and tests.
- Formatting-only changes were committed by the build runner before compile/test steps.

## RUST FORMAT REPAIR

- Applied rustfmt to all tracked Rust source and tests.
- Formatting-only changes were committed by the build runner before compile/test steps.
