# Build and measurement notes

## Commands

    npm install
    python3 scripts/import_medieval_props.py LowPolyMedievalPropsLite_2020.3.0_SRP_v1.0.unitypackage
    npm run dev
    npm test
    npm run typecheck
    npm run build

The source Unity package must first be placed in the Codespace repository root. The importer extracts the selected FBX files and shared texture into .local-assets/, which is gitignored. Vite embeds them into the application bundle. With no local import, the procedural fallback scene still runs.

Development builds WebAssembly without Binaryen optimisation. Release builds use wasm-opt.

## Model and scene performance

No raw model files from the medieval pack are committed. See ASSETS.md for the author, source link, licence summary and exact model mapping.

The in-game performance HUD counts the current scene's mesh triangles and reports separate rolling 120-frame requestAnimationFrame intervals for Normal and Low graphics. The frame intervals are browser measurements, not GPU timer-query measurements. Switch to each graphics mode and leave it active long enough to populate its average.

No Codespace browser session was available for this change, so no measured full-scene triangle total or Normal/Low frame times are recorded here. No model-file sizes or polygon totals are claimed because the source models remain local to the user's package and the public repository intentionally does not contain them.

## Codespace build measurements

Cold and incremental build duration, peak memory use and WASM output size have not been measured on the target Codespace. Record the actual values here only after measuring on that machine.

For a release build:

    /usr/bin/time -v npm run build
    find dist -type f -name '*.wasm' -exec sh -c 'ls -lh "$1"; gzip -c "$1" | wc -c' _ {} \;

For a cold development build:

    rm -rf pkg sim/target/wasm32-unknown-unknown/debug
    /usr/bin/time -v npm run wasm:dev

For an incremental rebuild, make a small edit in sim/src/lib.rs and run:

    /usr/bin/time -v npm run wasm:dev
