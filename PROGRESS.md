# BASIN 07 — Progress Tracker

> Read this file and inspect the latest git log before continuing. Do not repeat completed work.

## Current status — 2026-11-07

- Repository: https://github.com/wieawiheawie/basin07, branch `main`.
- Normal source tree, data, docs, Python validator, Cargo manifest and lockfile are present on `main`. The temporary nine-chunk transport archive was SHA-256 verified and removed by GitHub Actions.
- This session cannot open the user's authenticated Codespace terminal. GitHub Actions is being used as the remote build environment.
- Latest verified code commit before this documentation update: `db4b2def706fee4f9021372d138e11eb6facb8cd` (seeded economy and powered adsorption test repairs).
- Latest relevant CI run: [42370602681](https://github.com/wieawiheawie/basin07/actions/runs/42370602681), testing commit `db4b2def706fee4f9021372d138e11eb6facb8cd`.
- **PASS:** archive extraction and checksum, Cargo.lock generation, Python content/economy validator, rustfmt, `cargo test --no-default-features --lib`, and `cargo run --no-default-features --bin basin-validator -- --seeds 256`.
- The Rust unit suite has 19 tests; all tests passed in this run.
- **IN PROGRESS at last check:** `cargo build --release --target wasm32-unknown-unknown --no-default-features --features client,webgl2 --bin basin07`.
- Trunk install, `trunk build --release`, browser artifact upload, warning review and runtime/browser smoke test have not yet been confirmed. Do not call BASIN 07 playable yet.
- The CI run's current step is the WebAssembly compile. Logs are only available after the job finishes, so warnings from that step cannot yet be reviewed.

## Exact commands

Run from the repository root after Codespaces post-create setup:

1. `bash .devcontainer/bootstrap.sh` — only if initial source extraction/toolchain setup did not run.
2. `python3 scripts/validate_content.py --stage all --seeds 256`
3. `cargo fmt --all -- --check`
4. `cargo test --no-default-features --lib`
5. `cargo run --no-default-features --bin basin-validator -- --seeds 256`
6. `cargo build --release --target wasm32-unknown-unknown --no-default-features --features client,webgl2 --bin basin07`
7. `cargo install trunk --locked`
8. `trunk build --release`
9. `trunk serve --open` — browser/runtime smoke test on port 8080.

The CI workflow runs steps 2–8 (Trunk is installed in the runner before packaging). It also uploads the `dist/` output as the `basin07-web` artifact on success.

## Completed

- [x] BASIN 07 source, assets/data, documentation and validator committed to this repository.
- [x] Temporary archive expanded; SHA-256 verified against `3d1365524c77962c5730191d244542753745e314c618b3146f2843ae6410d771`.
- [x] `.github/workflows/ci.yml` added. Pushes to `main` run validation, formatting, unit tests, Rust headless validator, WASM build and Trunk packaging.
- [x] `.devcontainer/devcontainer.json` and `.devcontainer/bootstrap.sh` added. New Codespaces install stable Rust, rustfmt, clippy, `wasm32-unknown-unknown`, and Trunk.
- [x] Rust formatting repaired and committed by CI as `9d1f75bcda61901f91d05897e18319b341bb4723`.
- [x] Leak probability numeric mismatch repaired in `src/sim/plant.rs` by promoting the stress sum from f32 to f64 (commit `db05fe3dc062545d1a642ed0d3614b1e10548b5c`).
- [x] Economy trial diversity/contract threshold corrected and adsorption unit tests updated to use powered controller links and normal fixed-tick processing (commit `db4b2def706fee4f9021372d138e11eb6facb8cd`).
- [x] Latest CI run reports all 19 Rust unit tests PASS.
- [x] Latest CI run reports Rust headless validator PASS.
- [x] Python content validator PASS: 10 marketable products, 2 connected sectors, 5 atom-balanced reactions, and 512 seeded controller-path runs (256 seeds per control path).

## Remaining work

1. Wait for the current WebAssembly build step to report success/failure; inspect the job logs for compiler errors and warnings.
2. If WASM fails, repair the cause in a separate source/CI commit and update this tracker in the same commit. Keep memory bounded for the 8 GiB target.
3. After WASM passes, verify Trunk install and `trunk build --release`; fix errors/warnings and commit each repair.
4. Confirm a successful `basin07-web` artifact, then run `trunk serve --open` in Codespaces and smoke-test the actual browser runtime. The assistant cannot use the authenticated Codespace terminal directly, so this last smoke test requires the user's Codespace session unless a suitable remote runner is added.

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
