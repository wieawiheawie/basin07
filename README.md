# Deskbound

A miniature meadow on a wooden table, in the browser. Three.js rendering, Rapier physics.

## Run

    npm install
    npm run dev

Open the forwarded port 5173. Left-drag the crate to pick it up, right-drag to orbit, scroll to zoom.

## Scripts

- `npm run dev` – dev server
- `npm run build` – typecheck and production build
- `npm test` – unit tests
- Add `?blades=N` to the URL to fix the grass blade count.

## Layout

- `src/terrain.ts` – procedural hills and hollows (`HALF` sets the table size)
- `src/grass.ts` – instanced grass with wind, crate collision and lighting
- `src/physics.ts` – Rapier world, heightfield collider, crate grab
- `src/crate.ts`, `src/table.ts`, `src/wood.ts` – procedural models and textures
- `src/main.ts` – scene, sky, lighting, input, adaptive quality

Third-party model packs are never committed; `.glb`/`.fbx` files are git-ignored.
