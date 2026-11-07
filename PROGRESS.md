# BASIN 07 — Progress Tracker

> Resume first: read this file, inspect the latest git log, then run the build. Do not repeat completed work.

## CURRENT STATE

- Repository: https://github.com/wieawiheawie/basin07 (public, branch main).
- The full source snapshot is currently committed as a SHA-256-verified compressed archive split across .bootstrap/chunk-00.txt through chunk-08.txt. The normal source tree has not yet been expanded on the remote branch.
- .devcontainer/devcontainer.json and .devcontainer/bootstrap.sh are committed. Rebuild/create the Codespace with this devcontainer; its post-create hook expands the archive, commits the normal source tree, pushes to main, installs wasm32-unknown-unknown and Trunk.
- Local source snapshot: /mnt/data/basin07. Local Python content validator passed DLE and integrated two-sector stages (256 seeds/controller path).
- Rust build/test has NOT been executed. This assistant cannot access a terminal in the authenticated Codespace. The first GitHub Actions run failed before creating a job (run 42369736730, zero jobs and no job logs), so it provides no Rust compiler result.
- Exact bootstrap command if post-create did not run: bash .devcontainer/bootstrap.sh
- After bootstrap, run from the repo root:
  - python3 scripts/validate_content.py --stage all --seeds 256
  - cargo fmt --all -- --check
  - cargo test --no-default-features --lib
  - cargo run --no-default-features --bin basin-validator -- --seeds 256
  - cargo build --release --target wasm32-unknown-unknown --no-default-features --features client,webgl2 --bin basin07
  - trunk serve --open

## DONE

- [x] Initial BASIN 07 source, data, and docs snapshot prepared and archived; SHA-256 3d1365524c77962c5730191d244542753745e314c618b3146f2843ae6410d771.
- [x] Nine transport chunks committed (source archive) and verified against the expected SHA-256 by the Codespace bootstrap script.
- [x] Codespaces devcontainer and bootstrap script committed; Rust, rustfmt, clippy, WebAssembly target and Trunk provisioned by post-create.
- [x] CI workflow was created and first run observed; it failed with zero jobs before execution, not a compile/test failure.
- [x] Local Python content validator passed: 10 products, 2 connected sectors, 5 balanced reactions, 512 seeded controller-path runs.
- [ ] Expand the transport archive into the normal source tree on main (post-create bootstrap).
- [ ] Obtain a genuine GitHub Actions run with jobs; then fix each compile/test failure in a separate commit.

## IN PROGRESS

1. Open/rebuild the Codespace using .devcontainer/devcontainer.json; allow .devcontainer/bootstrap.sh to verify, expand, commit and push the source tree.
2. Apply rustfmt as a dedicated auto-committed source-formatting repair, then inspect and fix Rust tests, validator, WASM build and Trunk errors one at a time; update this file at every commit.
3. Once CI passes, run the client with trunk serve --open and verify basic placement/network/controller/selling flows in the forwarded browser port.

## KNOWN ISSUES

- No Rust compiler result yet: cargo build, cargo test, rustfmt, clippy, headless Rust validator, WASM build and Trunk packaging remain unverified.
- One previous Actions run (42369736730) is completed failure with zero jobs and no logs. The available connected GitHub API did not allow dispatching a workflow or opening a terminal in the user's Codespace; a Codespace git push is needed to trigger the regular CI workflow.
- The full Rust client/simulation has not been proven runnable in a browser. Do not describe it as playable until the WASM build and browser runtime are tested.
- The runtime catalog migration remains incomplete: JSON definitions are validated by Python, but Rust still contains hard-coded starter enums/recipes.
- DLE selectivity, adsorption/regeneration, silica scaling, reservoir decline, hydraulic losses and market dynamics are simplified models, not a full chemical-process simulator.
- Soda ash, hydrated lime, magnesium chloride and process water are imported inputs in the starter slice.
- Economy balance is preliminary; broader exploit and strategy coverage remains.

## DECISIONS LOG

- 2026-11-07 — Industry: geothermal direct lithium extraction, selected for its brine coproducts, reagent use, adsorption/regeneration chemistry and reinjection/water constraints.
- 2026-11-07 — Initial content gate: 10 saleable products in DLE/battery materials and basic inorganic chemicals, with shared NaCl and recovered heat links.
- 2026-11-07 — Renderer: Bevy 0.20.1 compiled to WASM; WebGL2 is the primary compatibility build; WebGPU is a separate feature build, not an assumed runtime fallback.
- 2026-11-07 — Browser bundler: Trunk.
- 2026-11-07 — Controller language: Rhai with whitelisted sensor/actuator API, disabled module imports and operation/call-depth limits; preset controllers remain less efficient but viable.
- 2026-11-07 — Content authoring direction: JSON + Serde, later gated with JSON Schema; the first slice is not yet fully runtime-data-driven.
- 2026-11-07 — Remote build environment: use GitHub Actions and a Codespaces post-create bootstrap because this assistant cannot use the browser-authenticated Codespace terminal directly.
- 2026-11-07 — Source transport: nine base64 text chunks are concatenated, SHA-256 checked, extracted, and removed by .devcontainer/bootstrap.sh.

## CONTENT COUNT

- Marketable products: 10.
- Sectors: 2 — DLE/battery materials (5) and basic inorganic chemicals (5).
- Imported reagents/utilities: 7.
- Balanced reactions/processes: 5, verified by local Python validator.
- Declared machine/controller types: 12 (including controller types).
- Validator: Python DLE and integrated stage PASS (256 seeds per controller); Rust validator NOT RUN; content runtime schema validation NOT YET IMPLEMENTED.
- Latest Actions run 42370332727: archive bootstrap, content validator, Cargo.lock and rustfmt PASS; Rust crate compiled, but 16/19 unit tests passed. Three behavioural assertions failed: seed outcomes were quantized too coarsely and the opening order was trivial (256/256 both controller paths won); two adsorption tests called the process function without powering the bed/controller, so logic correctly returned default outputs. These are corrected in the current commit by using market-seed starter targets, recording quantity+cash+win signatures, and exercising grid-connected powered controllers through the normal fixed-tick `step()` path.

## REMOTE SOURCE IMPORT

- The original source/data/docs archive was expanded by GitHub Actions and SHA-256 verified.
- All ordinary project files are now present; temporary transport chunks were removed.
- Cargo build/test results are recorded in this tracker and the workflow run.

## RUST FORMAT REPAIR

- Applied rustfmt to all tracked Rust source and tests.
- Formatting-only changes were committed by the build runner before compile/test steps.

## RUST TYPE REPAIR

- Corrected the leak-probability calculation to promote f32 stress to f64 before multiplying by the f64 fixed timestep and comparing with the f64 RNG sample.
- Next: rerun cargo tests; then the headless Rust validator; then the WebAssembly build and Trunk package.

## RUST FORMAT REPAIR

- Applied rustfmt to all tracked Rust source and tests.
- Formatting-only changes were committed by the build runner before compile/test steps.


## RUST BEHAVIOUR TEST REPAIR

- The opening LiCl order now has a seed-dependent target centered at 0.15 t, instead of the trivially low fixed 0.05 t.
- Economy run diversity now compares sold quantity, closing cash, and contract result at useful precision, rather than truncating tonnes to 0.01 t.
- Adsorption tests now connect grid power to both the bed and the code controller and run the ordinary powered plant tick; they no longer bypass the real power interlock by calling a private process method directly.
- Current CI state before this repair: 16/19 Rust unit tests passed; the three failing behavioural assertions above are the reason for this commit.
- Next 3 steps: (1) rerun Rust unit tests; (2) fix/verify the headless Rust economy validator; (3) complete the WebAssembly client build and Trunk packaging.
