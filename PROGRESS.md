# BASIN 07 — Progress Tracker

> Read this file and inspect the latest git log before continuing. Do not repeat completed work.

## Current status — 2026-11-08

- Repository: https://github.com/wieawiheawie/basin07, branch `main`.
- Existing simulation core, data files and 19-test Rust suite are retained.
- Milestone 1 scene is implemented: low-poly ground, 18×14 shared-mesh construction grid, 3D camera, five service markers, machine selection and click-to-place.
- `R` rotates the selected machine in 90° steps. The stored simulation rotation is now applied to the rendered machine. Backspace restarts the site.
- Release profile is the requested memory-light configuration: `opt-level = "s"`, `lto = false`, `codegen-units = 16`, `panic = "abort"`, `strip = true`, `debug = false`. `profile.dist` inherits release and uses thin LTO.
- Bevy 0.20.1 remains the renderer. It passed WASM check/build and Trunk packaging in GitHub Actions; no renderer rewrite is justified yet.
- **Last verified parent commit:** `fe1cdfa818560770bbd1d3afb7344e9fd00a10fc`; GitHub Actions run [#48](https://github.com/wieawiheawie/basin07/actions/runs/42438783108) succeeded.
- **Run #48 passed:** Python content/economy validator; Rust formatting; all 19 Rust unit tests; Rust headless validator; WASM `cargo check`; WASM release build; `trunk build --release`; and separate thin-LTO distribution packaging.
- **WASM sizes from run #48:** pre-Trunk 90,295,893 bytes raw / 14,475,783 bytes gzip; regular release 30,131,532 / 9,006,989; dist build 30,446,751 / 9,015,782.
- These are hosted-runner results, **not** proof of the user's 7.8 GB/no-swap Codespace limit. That environment and the actual browser runtime still need a smoke test.
- CI is now scoped to content validation, formatting, Rust tests, headless validator and WASM `cargo check`; it no longer runs the long release build or Trunk packaging. The first run on commit `081a8c12` stopped at a rustfmt-only layout difference in the rotation expression before the Rust tests; that formatting has now been corrected and the rerun is pending.
- **Milestone 1 status:** scene/placement source and an earlier Trunk release artifact are verified. Final confirmation is pending `trunk serve --release` in the user's Codespace.

## Exact Codespace commands

Run from the repository root:

```bash
git pull --ff-only origin main
trunk serve --release
```

Open the forwarded port **8080**. Test: press **Space** to open the lease, press **1** to select the Well Pump, then left-click an empty grid tile. Select the placed machine and press **R** to rotate it. **WASD** moves the camera target, **Q/E** orbits, and **+/-** zooms.

Paste the complete `trunk serve --release` terminal output, plus whether the 3D plot appeared and whether the Well Pump could be placed and rotated. Do not mark Milestone 1 fully browser-verified until this is confirmed.

## Milestone tracker

- [x] Milestone 1 source: ground plane, 3D camera, construction grid, service markers, placeable machine and selection.
- [x] Milestone 1 Trunk release artifact: packaging passed on GitHub Actions run #48.
- [ ] Milestone 1 Codespace/browser smoke test: awaiting the user's `trunk serve --release` output and interaction confirmation.
- [ ] Milestone 2: grid placement and typed physical networks with visible flow.
- [ ] Milestone 3: starter lithium chain, shipping and money loop.
- [ ] Milestone 4: preset controller and sandboxed Rhai editor wired to sensors/actuators.
- [ ] Milestone 5: market, pollution, wear and visible failure explanations.
- [ ] Milestone 6: visual polish and data-driven content expansion.

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
