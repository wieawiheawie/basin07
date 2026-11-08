# Deskbound progress

## Milestone 1 — initial implementation

**Status: source committed; verification pending.**

### Present in the source

- Rust deskbound-sim crate with a 128 × 128 height grid, fixed 60 Hz stepping, water depth grid, bottle state, smallfolk positions, command queue and energy recovery.
- Hand-written lexer, glossary-driven parser, AST and interpreter for carve, uncap, tip, upright, look and list.
- Three.js room and desk scene, procedural low-poly books, bottles, pencils, garden sprouts and five tiny people.
- Terrain and water vertex buffers are owned by Rust and exposed as WebAssembly memory views; the frontend binds Three.js attributes to those views without copying the grid into new arrays each frame.
- Prompt history, autocomplete, structured command replies and a discovered-words panel.
- Low-graphics switch disables shadows and dust.

### Explicitly limited or not implemented

- The garden is decorative: sprouts do not grow or consume water.
- People use simple deterministic steering and water avoidance; they do not have needs, jobs, social behaviour or long-term goals.
- Water uses a shallow virtual-pipe flow approximation. Internal flow conserves volume apart from configured evaporation and edge spilling; it is not a full fluid solver.
- No external models or textures are included. All milestone-one props are procedural placeholders designed to be replaceable.
- when triggers, save files, per-save glossary persistence and scenario progression are not started.
- Build size and build-time metrics are deliberately blank until measured on the target Codespace.

### Verification

- Source tests cover lexer, parser, interpreter, water volume, groove channeling and prompt helpers.
- GitHub Actions results are required before this milestone can be called verified.
- Actual Codespace WebGL2 startup and visual quality still need a browser check after rebuilding the container.
