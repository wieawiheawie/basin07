# Deskbound progress

## Tavern model pass

**Status: implemented and pushed; GitHub CI passed. Target-browser appearance and live frame measurements still need to be checked in the Codespace/browser.**

- Loads each of the twelve GLB files once through Three.js `GLTFLoader`, caches the source scene, and clones it for each placed object. A marked procedural fallback remains visible if any load fails.
- Loading progress and fallback counts are shown by the scene's loading status. The model library is rescaled with a single `PACK_SCALE = RESIDENT_HEIGHT / 5` constant and floor-point normalization.
- Replaces the old blank corner with a plank-floor platform, table, three stools, tableware, food, candle and lantern. Five residents are directed to stool/idle destinations; the resident transform buffer now includes a seated flag.
- Adds garden-side crate and sack props and a finite rain barrel. `tap barrel_1` opens the barrel and transfers its stored water into the existing water grid. A conservation test checks the source-plus-grid amount over the first simulation step.
- Uses the pack's named pieces/materials (Wood, Iron, Cloth, Glass, Flame, etc.) for a shared warm grade. The lantern has a flickering warm PointLight; the candle flame is emissive. Normal graphics uses a bloom pass; Low graphics renders directly without bloom, shadows or dust.
- Object roots retain their simulation names for hover, `list`, and `look`. The help panel describes newly discovered `tap` and `help` commands; parser errors suggest the nearest glossary action.
- Existing people are rendered with InstancedMesh. The small number of tavern stools/tableware use cached GLB clones rather than creating a large instance batch.

## Existing simulation and known limits

- Rust `deskbound-sim` crate with a 128 × 128 height grid, fixed 60 Hz stepping, water depth grid, bottle state, smallfolk positions, command queue and energy recovery.
- Hand-written lexer, glossary-driven parser, AST and interpreter for carve, uncap, tap, tip, upright, help, look and list.
- Terrain and water vertex buffers are owned by Rust and exposed as WebAssembly memory views; frontend binds Three.js attributes to those views without copying the grid into new arrays each frame.
- Prompt history, autocomplete, structured command replies and discovered-word panel.
- The garden is decorative: sprouts do not grow or consume water.
- People have a simple one-off tavern walk target and then sit or idle. They do not have needs, jobs, social behaviour or long-term goals.
- Water uses a shallow downhill flow approximation. It conserves internal source/grid volume during transfers, apart from configured evaporation and edge spilling; it is not a full fluid solver.
- Mug contents are not simulated; the mug remains a decorative model.
- `when` triggers, save files, per-save glossary persistence and scenario progression are not started.

## Verification notes

- Earlier runs passed Rust tests, Clippy, the WASM target check and TypeScript typecheck.
- Current model pass includes a browser HUD for scene triangle count and 120-frame averages for Normal and Low requestAnimationFrame intervals. Actual device/browser frame times are not measured by CI and must be read from that HUD on the target Codespace.
- Build size and target-Codespace cold/incremental build timing are not measured here.
