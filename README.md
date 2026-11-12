# Deskbound

A miniature meadow on a wooden table, in the browser. Three.js rendering, Rapier physics.

## Run

    npm install
    npm run dev

Open the forwarded port 5173. Press `H` in the game for all controls.

- Drag a crate to carry it; drag the ground to orbit; scroll or pinch to zoom; right-drag or Shift-drag to move.
- `1` / `2` / `3` (or `T`): Move / Dig / Fill. Drag to edit, or hold Space to edit at the pointer. Alt flips dig and fill, `[` `]` resize the brush, Ctrl+Z undoes.
- On touch: one finger edits in Dig/Fill; use the on-screen camera pad or switch to Move to look around.

## Scripts

- `npm run dev` – dev server
- `npm run build` – typecheck and production build
- `npm test` – unit tests
- Add `?blades=N` to the URL to fix the grass blade count.

## Layout

- `src/terrain.ts` – procedural hills and hollows (`HALF` sets the table size) and the editable heightmap
- `src/dig.ts`, `src/ui.ts` – dig/fill tool and the on-screen UI
- `src/grass.ts` – instanced grass with wind, crate collision and lighting
- `src/physics.ts` – Rapier world, heightfield collider, crate grab
- `src/crate.ts`, `src/table.ts`, `src/wood.ts` – procedural models and textures
- `src/main.ts` – scene, sky, lighting, input, adaptive quality

Third-party model packs are never committed; `.glb`/`.fbx` files are git-ignored.
