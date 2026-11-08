# Deskbound

Deskbound is a small living world on a wooden desk. You do not pick up or drag things. You speak to the desk through a tiny command language, and the Rust simulation decides what happens.

The browser is a window into the room; the simulation itself lives in Rust and WebAssembly.

## Run in a Codespace

After this replacement is pushed, rebuild the Codespace container once so the Node and Rust toolchain features are installed.

Then run:

    npm run dev

Open the forwarded Vite port **5173**. The development command builds the simulation for WebAssembly first, then starts Vite with hot reload.

On a plain Ubuntu machine:

    bash .devcontainer/setup.sh
    npm install
    npm run dev

## Commands

    list
    look bottle_1
    uncap bottle_1
    tip bottle_1
    tip bottle_1 toward east
    upright bottle_1
    carve from (2,3) to (8,3) depth 0.2 width 0.5
    carve from bottle_1 to book_2

Desk coordinates run from (0,0) to (10,10). A bottle must be uncapped before it can pour. Commands enter a small queue and spend attention; the queue and energy recover over time.

The ? wordbook shows only actions you have discovered. Hovering over props introduces their related words. The glossary lives in glossary.json, separate from the parser, so display words can be remapped without changing parser code.

## Project layout

- sim/ — fixed-step heightmap, water, object and people state, lexer, parser and interpreter in Rust.
- src/scene.ts — Three.js room, procedural props, camera and direct WASM buffer bindings.
- src/console.ts — command prompt, history, autocomplete, queue feedback and discovered-word panel.
- glossary.json — internal action IDs mapped to the words shown to the player.
- .devcontainer/ — Codespace setup using prebuilt wasm-pack, wasm-bindgen and wasm-opt binaries.

## Scripts

| Command | Purpose |
| --- | --- |
| npm run dev | Build debug WASM and start Vite. |
| npm run build | Build release WASM, run wasm-opt, typecheck and bundle the site. |
| npm test | Run Rust tests and Vitest. |
| npm run typecheck | Typecheck the TypeScript frontend. |

## Scope

Only milestone 1 is in scope. The garden sprouts are decorative; growth, needs, goals, triggers and scenario progression are later milestones. The people currently wander deterministically and avoid water and nearby obstacles. This is a small local steering model, not a needs or social simulation.
