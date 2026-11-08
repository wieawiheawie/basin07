# Deskbound

Deskbound is a small living world on a wooden desk. You speak to the desk through a command language; a Rust/WebAssembly simulation decides what happens, and Three.js mirrors its state.

## Run in a Codespace

After rebuilding the devcontainer once, install the JavaScript dependencies:

    npm install

The medieval props pack is not stored as a standalone model library in this repository. Upload your licensed Unity package into the Codespace repository root, then import only the models used by the game:

    python3 scripts/import_medieval_props.py LowPolyMedievalPropsLite_2020.3.0_SRP_v1.0.unitypackage

The importer writes the selected FBX models and shared texture to the ignored .local-assets/ directory. Vite embeds those files into the compiled game bundle; it does not publish separate model files. Do not commit the Unity package or extracted assets.

Then run:

    npm run dev

Open forwarded port 5173. Without a local asset import, procedural props remain available.

## Playing with the desk

The main interaction is direct mouse manipulation. Left-drag any item to move it. Right-click an item to pick it up, move it with the pointer, then right-click again to put it down. Hold both mouse buttons and drag over the wooden tabletop to carve a groove, or over the garden soil to cut a visible furrow. Hold both buttons on a bottle to uncap it. Middle-drag rotates the camera and the scroll wheel zooms. Click the **journal book** to open the wordbook, or click the **desk lamp** to switch between High and Low graphics. The floating controls remain available too. The **Commands** button opens the optional scripting console when you want precise or automated actions.

## Commands

    list
    look bottle_1
    uncap bottle_1
    tip bottle_1 at (10,10)
    upright bottle_1
    tap barrel_1
    paint pencil_1 red
    set pencil_1 colour to 'blue'
    pencil_1 -> roll_east -> paint green
    carve from (2,3) to (8,3) depth 0.2 width 0.5

Desk coordinates run from (0,0) to (10,10).

### Script syntax

Chain actions in sequence. The complete action cost is checked and deducted before the first queued action runs:

    uncap bottle_1 ; tip bottle_1 at (10,10)

Repeat a block up to 50 times (a script may expand to at most 64 actions):

    repeat 5 { carve (1,2) to (7,2) ; shift_down }

if evaluates its garden-moisture condition once when the script is compiled:

    if garden.moisture < 20% { tip bottle_1 }

when registers a Rust-side persistent listener. It checks the condition each simulation tick and fires on a false-to-true transition:

    when garden.moisture < 20% { tip bottle_1 }

Aliases are temporary for the current simulation session:

    let trench = (1,2) to (7,2)
    carve from trench depth 0.1

Functional pipes pass one object's context through supported actions:

    pencil_1 -> roll_east -> paint red

The paint palette is red, blue, green, yellow, brown, purple, white, and black. In this build only pencils, books and bottles can be painted. The Rust simulation stores the colour index and Three.js changes the corresponding per-object material colour.

The help command lists discovered commands. Unknown command words produce a closest-command suggestion.

## Models and physics

The medieval pack integration uses Furniture_01.fbx as the tavern table. The pack does not include an exact stool, bread-basket or lantern asset, so the closest included seat/container/fire props are used, with procedural fallbacks for missing or unsuitable models. See ASSETS.md for the mapping and licence.

The Rust simulation owns fixed-step physics for the loose pencils: mass, friction, restitution, collisions, slope response and water-flow drag. Three.js reads object transforms and colour bytes from WASM memory. This is a compact custom tabletop solver, not a full 3D rigid-body engine. The garden remains decorative; mugs do not yet store water.

## Project layout

- sim/ — fixed-step heightmap, water, objects, people, scripting lexer/parser/interpreter and pencil physics in Rust.
- src/scene.ts — Three.js room, model loading, procedural fallbacks and WASM-memory views.
- src/console.ts — prompt, history, autocomplete, discovered-word help and queue feedback.
- glossary.json — display words mapped to internal action/syntax IDs.
- scripts/import_medieval_props.py — selective local-only Unity package importer.
- vite.config.ts — embeds local model bytes into the application bundle.

## Scripts

| Command | Purpose |
| --- | --- |
| npm run dev | Build debug WASM and start Vite. |
| npm run build | Build release WASM, optimise it, typecheck and bundle the site. |
| npm test | Run Rust tests and Vitest. |
| npm run typecheck | Typecheck the TypeScript frontend and Vite config. |
