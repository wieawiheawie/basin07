# BASIN 07

A browser-first, real-time 3D factory game about geothermal direct lithium extraction (DLE). Build a process plant from an empty lease, physically connect typed fluid/power/logic lines, recover lithium from variable geothermal brine, manage reagent and water limits, and sell products into a changing market.

## Current implementation status

This repository is being built in milestones. See [`PROGRESS.md`](PROGRESS.md) first; it is the authoritative resume document. Source and design artifacts are provided, but this workspace did not include a Rust toolchain at the time of authoring. Do not treat a documented command as a tested build until `PROGRESS.md` records a passing result.

## Design documents

- [`DESIGN.md`](DESIGN.md) — game loop, chemistry, products, sectors, controllers and UX.
- [`RESEARCH.md`](RESEARCH.md) — market/prior-art survey, candidate concepts and qualified originality claim.
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — Rust/WASM/Bevy/Rhai architecture and performance plan.
- [`PROGRESS.md`](PROGRESS.md) — current state, commits, next work, known issues and content counts.

## Planned starter content

Exactly ten products in two connected sectors are registered in `content/products.json`:

- DLE & battery materials: LiCl eluate, lithium carbonate, lithium hydroxide monohydrate, magnesium hydroxide cake, calcium carbonate cake.
- Basic inorganic chemicals: sodium chloride, sodium hydroxide, chlorine gas, hydrogen gas, hydrochloric acid.

Imported soda ash and hydrated lime are reagents, not player-manufactured products in the first slice. Run the DLE gate before accepting the chemical-sector integration, then run the combined gate:

```bash
python scripts/validate_content.py --stage dle --seeds 256
python scripts/validate_content.py --stage all --seeds 256
```

The validator checks the ten-product/two-sector catalogue, per-sector safe/easy and high-hazard goods, cross-sector NaCl and recovered-heat links, atom balance for the five declared reactions, seeded market variation, and the custom-code / preset-controller economy comparison.

## Build prerequisites

- Rust stable toolchain (edition 2024)
- `wasm32-unknown-unknown` target
- Trunk
- A recent desktop browser with WebGL2 (default build) or WebGPU (optional build)

Install/build commands once a Rust toolchain is available:

```bash
rustup target add wasm32-unknown-unknown
cargo install trunk --locked
```

## Run in a browser

```bash
trunk serve --open
```

## Release builds

Default WebGL2 build:

```bash
trunk build --release
```

Optional WebGPU build (build separately; the Bevy backend feature is selected at compile time):

```bash
cargo build --release --target wasm32-unknown-unknown --no-default-features --features client,webgpu --bin basin07
```

## Headless validation

```bash
python scripts/validate_content.py --stage dle --seeds 256
python scripts/validate_content.py --stage all --seeds 256
cargo test --no-default-features --lib
cargo run --no-default-features --bin basin-validator -- --seeds 256
cargo build --release --target wasm32-unknown-unknown --no-default-features --features client,webgl2 --bin basin07
```

## Automated build environment

The repository includes a GitHub Actions workflow at `.github/workflows/ci.yml` and a Codespaces/devcontainer definition at `.devcontainer/devcontainer.json`. CI provisions stable Rust, the `wasm32-unknown-unknown` target and Trunk, then runs the content validator, Rust tests, headless validator and WebGL2 WebAssembly package build.

## Deployment

Build with `trunk build --release`, then publish the contents of `dist/` to GitHub Pages. Configure GitHub Pages to deploy from the `gh-pages` branch or a GitHub Actions workflow that uploads `dist/`. Because this build is client-side WASM, it needs only static hosting and correct MIME types for `.wasm`.

## Notes

- This is a game simulation, not engineering design software or operating instructions for an industrial plant.
- Chemistry and process performance are deliberately bounded, disclosed abstractions. Exact equipment design, process safety and commercial vendor-specific performance are out of scope.
