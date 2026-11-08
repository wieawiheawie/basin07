# Build and measurement notes

## Commands

    npm install
    npm run dev
    npm test
    npm run typecheck
    npm run build

Development builds the WebAssembly module without Binaryen optimisation. The release script runs wasm-opt; the development script does not.

## Measurements

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
