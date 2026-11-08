# BASIN 07 — Progress Tracker

> Read this file and inspect the latest git log before continuing. Do not repeat completed work.

## Current status — 2026-11-08

- Repository: https://github.com/wieawiheawie/basin07, branch `main`.
- Milestone 1 was confirmed running in Chrome/WebGL2 on Intel ADL-N; the first-frame B0001 panic was traced to overlapping mutable queries in render and HUD systems.
- Fixed overlapping mutable material queries in `sync_scene_materials` using reciprocal `Without` filters for GroundVisual, TileVisual and ServiceVisual.
- Fixed mutable `Text` queries in `update_hud` with reciprocal `Without` filters for HudText and OverlayText.
- Added `dev-debug = ["client", "bevy/debug"]`; only the development HTML target enables this feature so panic diagnostics include ECS system/component names without inflating release/dist builds.
- Added a native headless app smoke test which adds `MinimalPlugins`, `AssetPlugin`, mesh/material asset registries and input resources, starts `BasinGamePlugin`, then calls `app.update()` three times. CI runs it with client + desktop + dev-debug features.
- Fast browser serving now uses `index.dev.html`; normal release uses `Trunk.release.toml` and release HTML without ECS debug names; final dist remains thin-LTO with no debug names.
- Query fix commit: `f493329988de1083294e08c218c204af81bf9239`. Dev profile/config commit: `a0c7b9d5f89ac9be79d490be934ae567f6c386ce`. CI/setup commit: `8bde9d1854256aec6ed2aedb78919841ba8de270`.
- The next CI run must confirm the new native headless Bevy test and WASM dev-debug check; do not treat earlier core-only tests as proof of the query fix.
- Build-speed target measurements (2-core/7.8 GB Codespace cold build, one-line incremental rebuild, peak RSS) remain pending. Run `bash scripts/bench-build.sh` after setup. No speedup is claimed until actual output is captured.

## Exact Codespace commands

```bash
git pull --ff-only origin main
bash .devcontainer/setup.sh
trunk serve
```

Open forwarded port **8080** and verify the 3D scene renders without a first-frame panic. Run the native headless regression before launching the browser:

```bash
cargo test-client
```

For a cold/incremental build and peak-memory benchmark, stop Trunk and run:

```bash
bash scripts/bench-build.sh
```

Release commands (without ECS debug names):

```bash
trunk --config Trunk.release.toml build --release
trunk --config Trunk.dist.toml build --release
```

## Milestone and build tracker

- [x] Milestone 1 interactive scene user-confirmed running in Chrome/WebGL2.
- [x] Diagnose/fix render material and HUD text B0001 conflicts.
- [x] Enable Bevy ECS diagnostic names only in the fast development target.
- [x] Add native headless `App` test for the full game plugin.
- [ ] Verify the query fix, native test and dev-debug WASM check via current CI.
- [ ] Re-run Chrome/WebGL2 after pulling the fix.
- [ ] Measure Codespace cold build, one-line incremental rebuild and peak RSS.
- [ ] Continue build-speed optimisation from measured local results.

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
