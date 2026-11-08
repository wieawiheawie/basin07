# Build and measurement notes

## Commands

    npm ci
    npm run dev
    npm test
    npm run typecheck
    npm run build

Development builds the WebAssembly module without Binaryen optimisation. The release script runs wasm-opt; the development script does not.

## Tavern model measurements

The 12 GLB files under `public/models/tavern/` total **471,696 bytes (460.6 KiB)**. Their source geometries contain **5,996 triangles** with one of each model. Current placements (one table, three stools, two tankards and one of each remaining model) contain **6,928 model triangles**.

The in-game performance line shows the current scene-geometry triangle count, plus separate Normal and Low frame-interval averages. Triangle counting includes Mesh and InstancedMesh geometry, multiplying by each instanced mesh's count. Frame averages use the most recent 120 requestAnimationFrame intervals for each graphics mode; they are browser frame intervals, not a GPU timer-query measurement. Switch to each graphics mode and leave it active long enough to populate its average before comparing.

## Codespace measurements

No browser runtime measurement has been performed in this environment. The live HUD is included so the target Codespace/browser can report the scene triangle count and Normal/Low frame intervals on the actual device. No frame-time figures are claimed here.

No WASM size, cold build duration, or incremental rebuild duration has been measured on the target 2-core / 7.8 GB Codespace. No estimates are recorded here.

After rebuilding the devcontainer, stop any running Vite process and measure the release build:

    /usr/bin/time -v npm run build
    find dist -type f -name '*.wasm' -exec sh -c 'ls -lh "$1"; gzip -c "$1" | wc -c' _ {} \;

For a cold development build, remove only generated WASM output first:

    rm -rf pkg sim/target/wasm32-unknown-unknown/debug
    /usr/bin/time -v npm run wasm:dev

For an incremental rebuild, make a small edit in sim/src/lib.rs and run:

    /usr/bin/time -v npm run wasm:dev

Record wall time, maximum resident set size, raw WASM bytes and gzipped bytes here only after measuring them on the Codespace. Keep cold and incremental results separate.
