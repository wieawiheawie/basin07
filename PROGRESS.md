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
- Rust owns a fixed-step tabletop rigid-body approximation for bottles, books, pencils, tankards, mugs, food, stools, barrels, crates, sacks, candles and lanterns. Bodies have per-kind mass, radius, friction and restitution, with pairwise collision impulses, tangential friction, positional correction, angular response, boundary bounce, slope acceleration and water-flow drag.
- Picking up or dragging an object uses a spring constraint in WASM. Mass affects acceleration and lag; releasing a body preserves its velocity and collision momentum. This remains a compact 2D tabletop solver with visual 3D representation, not Rapier or a full 3D rigid-body engine.
- Uncapped bottles can be tipped by collisions and by resident pushes. Tilted bottles drain their finite volume into the water grid in the direction of their spout; internal transfer is volume-conserving apart from existing grid-edge spill/evaporation.
- Water flow buffers expose an approximate local velocity used by light-body drag.
- Three.js reuses allocated typed-array views; no per-frame object-transform arrays are created in the renderer sync path.
- Scene triangles and separate 120-frame Normal/Low requestAnimationFrame interval averages are shown in the HUD. Real device/browser values remain to be measured in the target Codespace.

## Medieval tavern model replacement

- The new pack is Low Poly Simple Medieval Props by JustCreate3D (Oleh Lila). It is governed by the author's own licence, not CC0. The licence permits integrated use in compiled games/apps and prohibits standalone redistribution of the model files.
- Furniture_01.fbx supplies the tavern table. The source FBX geometry is about 183.4 × 79.8 × 78.0 units; at the calibrated 0.005 desk scale this becomes about 0.92 × 0.40 × 0.39 world units. All imported models use the same source-unit scale rather than the old character scale, which was 16 times too large.
- Furniture_02.fbx supplies three bench-style seats. They are rotated and spaced around the table, and the three tavern residents now target those seat positions. The brazier/fire model is on the floor beside the table rather than on the tabletop.
- The pack has no exact stools, basket, cheese wheel or lantern, so bench, bucket, plate/cheese detail and brazier substitutes are used.
- The repository excludes the Unity package and extracted FBX/texture files. The selective importer writes them to ignored .local-assets/; Vite embeds them in the game bundle. No .blend files are included or generated.
- Model load failure or absent local imports keep procedural fallbacks visible.

## Direct mouse interaction

- The command console is an optional popup instead of the always-visible bottom dock. The wordbook remains available separately.
- Left-drag moves objects through a Rust/WASM spring constraint; the body's mass controls acceleration and drag lag.
- Right-click picks up an object; move the pointer while holding it and right-click again to release it. The physics body keeps its release momentum.
- Holding both mouse buttons and dragging cuts grooves into the tabletop height grid. Over the garden, the plot's subdivided soil plane is also deformed so the furrow is visible.
- Holding both mouse buttons on a bottle uncaps it directly. The cap becomes a separate named physics object that can be picked up and knocked around.
- Middle-drag orbits the camera; the wheel zooms. The right button is no longer used for camera orbit.
- Dragging, pickup and direct uncap update the same Rust simulation state used by the command interpreter.

## Rendering, digging and diegetic controls

- Fixed the startup crash by initialising the scene triangle counter before starting the synchronous local-model loading pass.
- Rust tabletop digging uses a single-pass nearest-point Gaussian brush per grid vertex; strokes deepen the height grid smoothly rather than stamping a hard quadratic edge. Live pointer strokes use a small per-event strength to avoid over-digging (0.0045 world-height per segment).
- The Rust fixed-step terrain refresh recalculates finite-difference height normals and updates the WASM normal buffer. Three.js marks the shared position/normal attributes dirty; normals are not redundantly recomputed in the renderer.
- Garden furrows use Gaussian falloff on the subdivided soil mesh and recompute vertex normals after each edit.
- Normal graphics uses half-resolution SSAO, 2048² PCF soft key-light shadows and low-amplitude procedural bump detail on wood. Low graphics disables SSAO, bloom, shadows, the desk lamp and dust.
- Clicking book_1 opens the journal/wordbook. Clicking the physical desk lamp switches High/Low graphics; the floating buttons remain as alternatives.
- Dragged and picked-up objects follow a damped spring constraint in Rust/WASM; there is no separate visual-only pointer interpolation.

## Existing simulation and known limits

- Rust crate with a 128 × 128 height grid, fixed 60 Hz stepping, water depth grid, bottle and rain-barrel state, smallfolk positions and command energy queue.
- Internal water transfers conserve volume apart from configured evaporation and edge spilling.
- The garden can be dug and watered, but crop growth and plant water consumption are not implemented.
- Five residents use four distinct CC0 Quaternius rigged GLB variants. Each unique GLB is loaded once, skeleton-cloned for reuse, and animated with Idle, Walk and Interact clips.
- Residents carry hunger, fatigue, diligence and curiosity values. Each periodically scores watering, digging, eating, resting and wandering tasks using current garden moisture, water availability, food proximity and their own traits. Tasks are not assigned by a fixed per-person schedule.
- Watering agents find a nearby bottle with remaining water, approach it, uncap it if needed, then push it toward the garden. The bottle is tipped through the same physics state as other collisions and pours into the height/water grid along its spout direction. Other agents may dig while the water is carried.
- Digging agents cut short Gaussian furrows in the simulation height grid. The visible garden soil mesh mirrors that grid and updates its normals, so resident digging is visible.
- Needs and task selection are simple emergent utility rules, not a full social or economic simulation.
- The mug is decorative and does not yet hold water. The rain barrel is a finite source operated by tap barrel_1.
- Commands and aliases are not persisted between page reloads; there are no save files or scenario progression yet.

## Verification notes

- CI is configured for Rust tests, Clippy, WASM target check and TypeScript typecheck.
- Browser rendering and target-device frame intervals are not tested by CI. No live visual or performance result is claimed until checked in the Codespace/browser.
