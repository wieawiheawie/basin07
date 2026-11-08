# Deskbound progress

## Expanded command language

- Lexer recognises quoted strings, semicolons, braces, equals, arrows, comparison operators, percentages and dotted condition paths.
- Parser builds a statement tree for sequential commands, repeat, immediate if, persistent when, temporary let aliases and functional pipes.
- The complete queued action batch is compiled and its energy cost checked/deducted before execution begins. A batch with insufficient energy is rejected as a whole.
- if is evaluated once at script compilation. when compiles to a Rust/WASM listener polled on fixed simulation ticks and fires on a false-to-true condition edge.
- let aliases are expanded before individual commands are parsed. Aliases are temporary for the current simulation session.
- Supported conditions are currently limited to garden.moisture < N%. Repeat count is 1–50 and expanded scripts are limited to 64 actions.
- Supported functional pipes are currently object -> roll_east and object -> paint colour.
- help lists commands discovered so far; unknown action words suggest the closest glossary command.
- paint and set ... colour to ... support a fixed eight-colour palette. Pencils, books and bottles are paintable.

## Physics and renderer

- Rust owns the fixed-step height/water grids and object state. Full 4×4 object transform matrices and colour bytes are exposed as WebAssembly memory views; Three.js reads those views directly.
- A compact custom fixed-step rigid-body approximation is active for the four pencils: mass, friction, restitution, pairwise circle collision impulses, overlap resolution, boundary bounce, height-grid slope acceleration and water-flow drag.
- This is a 2D tabletop solver with visual 3D representation, not Rapier and not a full 3D rigid-body engine. Other props remain static except their scripted state.
- Water flow buffers expose an approximate local velocity used by the pencil drag calculation.
- Three.js reuses allocated typed-array views; no per-frame object-transform arrays are created in the renderer sync path.
- Scene triangles and separate 120-frame Normal/Low requestAnimationFrame interval averages are shown in the HUD. Real device/browser values remain to be measured in the target Codespace.

## Medieval tavern model replacement

- The new pack is Low Poly Simple Medieval Props by JustCreate3D (Oleh Lila). It is governed by the author's own licence, not CC0. The licence permits integrated use in compiled games/apps and prohibits standalone redistribution of the model files.
- Furniture_01.fbx supplies the tavern table. The pack has no exact stools, basket, cheese wheel or lantern, so bench, bucket, plate/cheese detail and brazier substitutes are used.
- The repository excludes the Unity package and extracted FBX/texture files. The selective importer writes them to ignored .local-assets/; Vite embeds them in the game bundle. No .blend files are included or generated.
- Model load failure or absent local imports keep procedural fallbacks visible.

## Existing simulation and known limits

- Rust crate with a 128 × 128 height grid, fixed 60 Hz stepping, water depth grid, bottle and rain-barrel state, smallfolk positions and command energy queue.
- Internal water transfers conserve volume apart from configured evaporation and edge spilling.
- The garden is decorative; sprouts do not grow or consume water.
- People follow simple deterministic tavern targets, then sit or idle; there are no needs, jobs, social behaviour or long-term goals.
- The mug is decorative and does not yet hold water. The rain barrel is a finite source operated by tap barrel_1.
- Commands and aliases are not persisted between page reloads; there are no save files or scenario progression yet.

## Verification notes

- CI is configured for Rust tests, Clippy, WASM target check and TypeScript typecheck.
- Browser rendering and target-device frame intervals are not tested by CI. No live visual or performance result is claimed until checked in the Codespace/browser.
