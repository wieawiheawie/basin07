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
2. Inspect the new push-triggered GitHub Actions run and fix Rust formatting, tests, validator, WASM build and Trunk errors one at a time; update this file at every commit.
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
