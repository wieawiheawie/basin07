import { defineConfig } from "vitest/config";

export default defineConfig({
  server: { host: "0.0.0.0", port: 5173, strictPort: true },
  build: { target: "es2022", outDir: "dist", sourcemap: false },
  test: { include: ["src/**/*.test.ts"] }
});
