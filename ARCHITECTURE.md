# ARCHITECTURE — BASIN 07

**Architecture revision:** Phase 2, 7 November 2026  
**Status:** renderer/build path verified on GitHub Actions; Codespace runtime smoke test pending; runtime content migration is not yet complete.

## 1. Decision summary

BASIN 07 will use:

- **Rust 2024** for the authoritative simulation and application.
- **Bevy 0.20.1** for the 3D renderer, camera, input, scene/UI lifecycle and asset plumbing.
- **`wasm32-unknown-unknown` + Trunk** for the browser build.
- **WebGL2 as the default browser renderer** and a separately compiled **WebGPU** build as an optional performance path.
- **Rhai 1.27** for player-authored controller programs, restricted to a tiny sensor/actuator API and bounded per-tick execution.
- **JSON + Serde + JSON Schema** for modder-facing content. Existing content is JSON already; the planned loader will parse registries at startup, resolve stable string IDs to compact runtime IDs, and validate cross-references before play.
- A renderer-independent, deterministic simulation core with fixed-tick bulk-flow networks. Bevy entities are presentation and interaction objects, not the source of truth for chemistry or material inventory.

The current code does **not yet** meet the final data-driven target: `catalog.rs` contains compile-time product/machine enums and prices, `chemistry.rs` contains hard-coded formulas/reactions, and the JSON files are currently used by the Python validator rather than loaded into `PlantSim`. Phase 2 defines the replacement contract; the next engine milestone must move those registries into startup-loaded data before catalogue expansion begins.

## 2. 3D stack comparison

| Option | Strengths | Trade-offs | Decision |
|---|---|---|---|
| Direct `wgpu` | Lower-level control over render passes, GPU buffers, materials and instancing; Rust-native; supports browser GPU paths. | The project would need to build and maintain camera controls, picking, scene graph, UI, asset loading, window lifecycle, input and much of the renderer tooling itself. | Not selected for the first playable slice. Reconsider only if profiling identifies Bevy overhead as a real bottleneck. |
| Bevy 0.20.1 | Full Rust ECS and 3D stack; browser support; input, camera, PBR meshes, UI and asset server; renderer-independent simulation remains easy to test. | Larger WASM and longer compile times than a bespoke renderer; fast release changes mean the version must be pinned and migrations tracked. | **Selected.** It materially reduces engine work while keeping all gameplay/simulation in Rust. |
| WebGPU-only | Modern API and feature set; good long-term path for large plants and more demanding visuals. | Browser/device coverage is not universal. Bevy documents WebGPU browser examples as desktop Chrome-only in its current support note. | Optional, separate build only. |
| WebGL2 | Broadly available desktop browser fallback and sufficient for the first low-poly factory scene. | Lower feature/performance ceiling than WebGPU; no general compute-shader path for this simulation design. | **Default build.** Keep simulation on the CPU and use instancing for repeated geometry. |

Bevy 0.20 was released on 8 October 2026; Bevy 0.20.1 is the package version pinned in `Cargo.toml`. The 0.20.1 package declares Rust 1.97.1 as its minimum supported version, now mirrored in this project's `rust-version`. Bevy's `webgpu` and `webgl2` Cargo features select different WASM backends: enabling WebGPU overrides the WebGL2 path. They are therefore two build artifacts, not a runtime backend switch inside one WASM binary. The compatibility-first WebGL2 build remains the primary deployment.\n\n**Build evidence and renderer decision (8 November 2026):** GitHub Actions run [#48](https://github.com/wieawiheawie/basin07/actions/runs/42438783108) passed the WASM check/build, `trunk build --release` and separate thin-LTO distribution build. The regular release WASM measured 30,131,532 bytes raw / 9,006,989 bytes gzip. This is not tiny, but the build completed and the scene uses shared meshes/materials with a low-graphics preset. Keep Bevy for the first playable slice; revisit only if the 7.8 GB Codespace build is OOM-killed or browser profiling shows unacceptable runtime overhead. The hosted-runner result does not prove the user's Codespace memory limit.

## 3. Build profiles and commands

Install a Rust toolchain at or above the Bevy MSRV, plus the WASM target and Trunk:

```bash
rustup update stable
rustup target add wasm32-unknown-unknown
cargo install trunk --locked
```

Run the web client in development mode:

```bash
trunk serve --open
```

Build the default WebGL2 site:

```bash
trunk build --release
```

The `webgpu` Cargo feature is a separate backend selection. Build/test the Rust target with the feature selection below; Trunk packaging must use the same feature selection when producing the browser artifact:

```bash
cargo build --release --target wasm32-unknown-unknown --no-default-features --features client,webgpu --bin basin07
```

Run the headless core without compiling Bevy:

```bash
cargo test --no-default-features --lib
cargo run --no-default-features --bin basin-validator -- --seeds 256
```

GitHub Actions run #48 verified the 19 Rust tests, Python content/economy validator, Rust headless validator, WASM `cargo check`, WASM release compile, Trunk release packaging and thin-LTO distribution packaging. The user's Codespace is a separate 7.8 GB/no-swap environment; run `trunk serve --release` there before claiming the target memory ceiling or browser runtime is confirmed.

## 4. Rhai controller integration and sandbox

Rhai 1.27 supports WebAssembly targets and exposes evaluation limits for operations, call depth, variables, functions, expression depth, strings, arrays and maps. It is an appropriate fit for small industrial control programs: the scripts can read a bounded sensor snapshot and set actuator targets, but cannot directly edit inventory or bypass process physics.

### Allowed controller API

```rhai
if read("bed.breakthrough") > 0.12 || read("bed.loading") > 0.72 {
    set("feed_valve", 0.0);
    set("wash_valve", 0.55);
    set("elution_valve", 0.85);
} else {
    set("feed_valve", 1.0);
    set("wash_valve", 0.0);
    set("elution_valve", 0.0);
}
```

Only these host functions are planned:

- `read(sensor_id) -> number`: read an existing sensor value from a bounded snapshot.
- `set(actuator_id, value)`: set an actuator target, clamped to its allowed range.
- `alarm(code)`: emit a bounded diagnostic code.

The simulation still applies real connection, power, pressure, flow, range and interlock rules. A script cannot create materials, spend money, teleport product, or write directly into a machine buffer.

### Limits

The Rust prototype has been tightened to the following initial limits (they require runtime/build verification once a compiler is available):

| Limit | Initial value |
|---|---:|
| Source bytes | 4,096 |
| Operations per invocation | 2,000 |
| Call depth | 16 |
| Variables | 64 |
| Script functions | 8 |
| Expression depth | 32 (function expression depth 32) |
| String length | 1,024 bytes |
| Array length | 32 |
| Map entries | 32 |
| Interned strings | 128 |
| Module imports | Disabled at compile time (`no_module`) |

Print and debug callbacks are redirected to no-ops; no filesystem, network, browser-JS, dynamic module or arbitrary Rust functions are registered. Compile once when the player presses **Compile**; evaluate at a fixed controller interval (initially 4 Hz game control cadence), never once per render frame. Runtime errors put that controller into a safe state and surface the cause in the UI.

These limits are **not a substitute for a process boundary**. Rhai's operation counter cannot pre-empt a blocking host function, and operation counts alone do not constitute a byte-accurate memory quota. All registered host functions must remain bounded, non-blocking and allocation-light. Also enforce a total per-simulation-tick script budget across all controllers; the per-controller limit must not multiply into an unbounded worst case as the player expands.

Preset PLCs use the same read/write interface and are not granted a weaker physics model. Their deliberate disadvantage is fixed, conservative sequencing, slower sampling and less effective reagent/energy setpoints. A well-designed coded controller saves reagent/utility cost and raises throughput, but costs more to research/build and carries a small script-error risk. The economy harness must show both paths can win.

## 5. Data-driven content engine

### 5.1 File format decision

Use **JSON** rather than RON or TOML for the content package.

- JSON is already used by the current product/reaction/reagent records and is straightforward to fetch through a browser asset server.
- JSON Schema gives a standard, external validation contract for community content packs.
- Serde's JSON support gives typed deserialization without runtime reflection.
- RON is readable and supports comments and Rust-like enum/struct forms, but its own documentation notes restrictions around some Serde representations (including `flatten` and untagged/tagged enum forms). It would add a second format without a compelling advantage for a modder-facing cross-tool format.
- TOML is excellent for compact configuration, but the repeating arrays and nested stoichiometry/port/process records are more naturally represented as JSON arrays/objects.

JSON has no comments; explanations belong in `description`, `notes`, and documentation fields. The schema is versioned so content can evolve without silently changing old saves.

### 5.2 Planned package layout

```text
content/
  manifest.json             # schema version and registry file list
  elements.json             # atomic masses and identifiers
  compounds.json            # formulas, composition, physical/hazard properties
  resources.json             # reservoir/raw feed, water, imported feed, energy sources
  reagents.json              # purchased or recovered reagents and utilities
  products.json              # saleable goods and intermediate items
  machines.json              # placed equipment, ports, costs, power and rule class
  processes.json             # process definitions, conditions, stoichiometry and wastes
  schema/
    catalog.schema.json      # JSON Schema for package v1
```

The current `reactions.json` is the legacy reaction registry and will be migrated to `processes.json`; it is not silently considered the finished generic process system. `sectors/*.json` currently duplicate subsets of `products.json`; during runtime migration one canonical registry will become authoritative and duplicates will be removed.

### 5.3 Runtime model

On startup:

1. Load and parse `manifest.json`, then fetch the referenced registries.
2. Validate schema version, stable IDs, all references, numeric ranges and required properties. Fail to a visible content-load error if the package is invalid; never skip broken records silently.
3. Build compact runtime lookup tables (`ElementId`, `CompoundId`, `ItemId`, `MachineDefId`, `ProcessDefId` as small integer newtypes) from stable string IDs.
4. Precompute formula vectors, molar masses, reaction stoichiometry, compatible port tables, process lookup tables, material/element dependency edges and market indexes.
5. Freeze the catalog for the running save. Saves store the content package/version hash and string IDs for migration safety.

**No product-specific Rust implementation:** product, element, reagent and machine *definitions* are data. Rust contains a finite set of reusable process rule implementations (for example precipitation, adsorption/desorption, electrolysis, gas synthesis, ion exchange, crystallisation, filtration, drying, calcination, slaking and neutralisation). A process data record chooses one rule and supplies the inputs, outputs, operating window, catalysts, energy, quality effects and waste/byproduct streams. A new lithium salt or magnesium product should require data only; a genuinely new physical unit operation may require a new reusable engine rule.

### 5.4 Substance and item properties

Each element stores atomic mass. Each compound stores an explicit elemental composition vector and formula plus, where applicable:

- phase/state at reference conditions;
- melting/freezing and boiling points;
- density and reference temperature/pressure;
- hazard class, exposure/containment tags and incompatibilities;
- reactivity tags and relevant pH, oxidation or thermal sensitivities;
- purity/impurity composition and assay basis.

Each commercial item links to a substance or declared mixture, carries mass/volume units, target purity and permitted impurity maxima, reference price, demand class and saleable/byproduct/waste role. Variable brine is a mixture with a per-seed composition, not a fake single pure compound.

### 5.5 Generic process record

A process definition contains:

- `operation`: reusable Rust rule class;
- `machine`: required machine definition or capability tag;
- `inputs`: compound/item/reagent IDs and stoichiometric or mass/volume basis;
- `outputs`: product, intermediate, byproduct and waste streams;
- `conditions`: temperature, pressure, pH, concentration, ratio, residence time, catalyst and purity windows;
- `energy`: electrical work, heat input, recovered heat and declared thermal losses;
- `quality`: impurity rejection/transfer, yield and purity effects;
- `hazards`: required containment, scrubber, vent, interlocks and waste handling.

A process with no explicitly accounted byproduct/waste route is invalid unless its output definition demonstrates that no secondary stream exists. There is no invisible deletion of slag, brine, filter cake, fines, off-gas or spent reagent. Unhandled streams must fill capacity, contaminate other streams, corrode equipment, incur disposal charges or create safety incidents as appropriate.

## 6. Quality, markets and codex

Lots carry product quantity plus assay/purity and impurity fields. Buyers have acceptance windows; an off-spec batch is discounted, downgraded, rejected or incurs a penalty. The selling price therefore cannot be a lookup of product ID alone.

The market contains per-product demand, NPC supply, player supply, stock buffers, price momentum and contracts with quality/time/quantity terms. A sale affects later market state. Demand and prices are bounded; the validator reports products that are always or never profitable under the tested price/quality/energy scenarios.

The in-game codex is generated from the same loaded registries. Each entry displays composition/formula, physical properties, hazards, processes that make it, inputs, outputs/byproducts, quality specs and known uses. Research, surveying and plant experiments unlock catalog entries progressively; the entire registry is not exposed in the first minute.

## 7. Simulation performance and determinism

### 7.1 Fixed timestep

The current client advances the process core in fixed 0.5-game-minute steps at two simulation ticks per real second while Bevy renders independently. Keep this split. Accumulate elapsed time, cap catch-up steps after tab stalls, and drop excess backlog rather than entering a long catch-up loop.

Substep order:

1. Reservoir/feed variability, ambient environment and market conditions.
2. Controller sampling and bounded actuator setpoints.
3. Power-network allocation, breaker trips and machine availability.
4. Fluid/utility network flow, pressure drop, leaks and contamination.
5. Generic process operations and material/energy transformations.
6. Wear, scale, corrosion, thermal state and safety interlocks.
7. Product lots/quality, contracts, shipments and cash.
8. Bounded event/diagnostic ring buffer for readable cause → effect → repair messages.

### 7.2 Data layout

- Use dense `Vec<T>` storage indexed by compact IDs for authoritative simulation state; no one-entity-per-molecule or one-entity-per-item design.
- Store chemical quantities in contiguous arrays. Precompute a flat `node_count × compound_count` composition buffer or compact sparse composition for each stream; select the layout from profiling and catalogue scale.
- Represent pipes, power cables and logic wires as typed graph edges. Build adjacency lists when the player edits the network; do not rebuild graph topology every tick.
- Resolve bulk flows through edge capacities, pressure/temperature/viscosity approximations, source availability and destination capacity. Use reusable input/output delta buffers so update order does not create/consume a stream twice in one pass.
- Cache per-machine compatible ports, connected components, path lengths and power networks after topology edits.
- Reuse all flow, material, market, alarm and controller scratch arrays. No per-frame or per-fixed-step heap allocation in hot paths after initialization.
- Run controllers on a lower fixed cadence and budget their total operations. Sensor snapshots should be dense numeric buffers rather than freshly cloned `BTreeMap<String, f64>` collections.
- Use a spatial occupancy grid for machine placement and a spatial hash/grid for selecting nearby ports/edges. The current fixed 18×14 plot can use a direct array.

### 7.3 Rendering

- Use shared low-poly meshes/materials per machine definition and instanced rendering for repeated pipe sections, support frames and lights where the material/layout permits.
- Avoid per-machine unique materials if an instance buffer can carry status tint; use a small material palette and per-instance status attribute.
- Build/edit visual connection meshes only when a network edge is created, removed or changed; do not allocate an endpoint-position `Vec` each render frame.
- Cap dynamic lights and real-time shadows. Use emissive alarm indicators and decal/particle pools for readable leaks, gas releases and process activity.
- Update HUD text at a low fixed cadence or on state changes, not every render frame.

The renderer uses shared mesh handles and a small shared material palette rather than creating one material per machine. Some simulation/network paths still allocate temporary vectors/maps; profile and remove hot-path allocations before claiming a large-factory frame-rate target or scaling to hundreds of machines.

## 8. Content validation and economy reports

The validator becomes a build/CI gate and reads exactly the same package as the game. At minimum it will:

1. Validate JSON Schema, unique stable IDs, enum/range correctness and all cross-file references.
2. Verify every product/intermediate has a path back to raw resources or explicitly imported feed/reagent. Flag orphan records and recipes whose only source is a closed circular dependency.
3. Compute element vectors and molecular masses from `elements.json` + `compounds.json`; check every reaction's stoichiometric balance and mass closure within tolerance.
4. Check declared energy: electrical and external heat input versus recoverable heat, stored useful energy and declared losses. Where reaction enthalpy is unknown, flag energy validation as incomplete rather than inventing a value.
5. Require byproduct and waste streams to have a declared route, reusable consumer or priced disposal/handling sink.
6. Generate `reports/dependency_graph.dot` and a per-product raw-material tree with conversion yields, utility cost and estimated contribution margin.
7. Evaluate margins across multiple seed grades, quality outcomes, market prices, power prices and reagent prices; flag always-unprofitable and never-unprofitable products for balance review.
8. Run the headless economy across many seeds and multiple opening strategies with both scripted and preset controllers; verify variation, bounded prices, positive/finite inventories, no cyclic money/material exploits and viable win rates for both controller paths.

After each added process family/sector, rerun the schema/content validator and the economy simulator. Record the summary in `PROGRESS.md` before beginning the next sector.

## 9. Save/load and package compatibility

Save a versioned snapshot of the plant, machine/network IDs, inventory assays, reservoirs, contracts, market state, research, player scripts, seed and `content_hash`. The browser uses `localStorage` with size/error handling; native test mode can use a file. On load, reject a mismatched incompatible catalog hash or run a documented ID migration; never reinterpret an old string ID by array position.

## 10. Research sources

- Bevy 0.20 release (8 October 2026): <https://bevy.org/news/bevy-0-20/>
- Bevy 0.20.1 package metadata and MSRV 1.97.1: <https://docs.rs/crate/bevy/0.20.1/source/Cargo.toml>
- Bevy renderer feature flags (`webgl2`, `webgpu`): <https://docs.rs/crate/bevy/0.20.1/source/docs/cargo_features.md>
- Bevy WebGPU browser support warning: <https://bevy.org/examples-webgpu/>
- Bevy `AssetServer` and custom loader route: <https://docs.rs/bevy_asset/0.20.1/bevy_asset/struct.AssetServer.html> and <https://bevy.org/examples/assets/custom-asset/>
- Rust `wasm32-unknown-unknown` support/limitations: <https://doc.rust-lang.org/rustc/platform-support/wasm32-unknown-unknown.html>
- Rhai 1.27 target support: <https://docs.rs/crate/rhai/1.27.0>
- Rhai operation/call-depth/collection/string limits: <https://docs.rs/rhai/1.27.0/rhai/struct.Engine.html>
- Serde data model and format split: <https://serde.rs/data-format.html> and <https://docs.rs/serde/latest/serde/>
- RON 0.12 format and Serde limitations (comparison): <https://docs.rs/ron/latest/ron/>
- Trunk build pipeline and commands: <https://trunk-rs.github.io/trunk/guide/commands/>; asset wasm-opt options: <https://trunk-rs.github.io/trunk/guide/assets/index.html>

## 11. Current implementation gap register

| Requirement | Current state | Required next change |
|---|---|---|
| Rust/Bevy 3D browser client | Source exists; no compiler available to verify | Obtain Rust ≥1.97.1, compile/test and fix API or borrow errors. |
| Physical typed pipes and cable links | Static `LineKind` checks and drawn direct links | Keep starter slice; upgrade to node/edge networks with branch connectivity and pressure/power distribution. |
| Dynamic products and compounds | Static Rust enums/arrays; JSON only read by Python | Implement manifest loader and dynamic ID registry before adding new products. |
| Generic process engine | Five hard-coded Rust process handlers + JSON stoichiometry | Move process parameters to data; retain only reusable operation-rule handlers. |
| Mass/energy validation | Python elemental atom checks; Rust chemistry checks atom balance | Build one data-driven validator with mass, energy and waste closure reporting. |
| Purity/quality | Product ID and quantity only | Add lot assays, impurity vectors and buyer specifications/price effects. |
| Byproduct/waste consequences | Some NaCl, mineral cake, steam and leaks | Make every process stream explicit and add disposal/reuse, scale/contamination/fines/hazard consequences. |
| Performance | Fixed tick and bounded event queue; temporary allocations remain | Preallocate graph/sensor/scratch arrays, pool visuals and profile at factory scale. |
