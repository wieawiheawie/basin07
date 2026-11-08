import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import type { Plugin } from "vite";

const VIRTUAL_ID = "virtual:medieval-props";
const RESOLVED_ID = "\0" + VIRTUAL_ID;

function embeddedMedievalProps(): Plugin {
  const assetRoot = resolve(process.cwd(), ".local-assets/medieval");
  return {
    name: "deskbound-embedded-medieval-props",
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : null;
    },
    load(id) {
      if (id !== RESOLVED_ID) return null;

      const manifestPath = resolve(assetRoot, "manifest.json");
      const modelBase64: Record<string, string> = {};
      let textureBase64 = "";

      if (existsSync(manifestPath)) {
        try {
          const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
            models?: Record<string, string>;
            texture?: string;
          };
          for (const [key, relativePath] of Object.entries(manifest.models ?? {})) {
            const assetPath = resolve(assetRoot, relativePath);
            if (!assetPath.startsWith(assetRoot + "/") || !existsSync(assetPath)) continue;
            modelBase64[key] = readFileSync(assetPath).toString("base64");
          }
          if (manifest.texture) {
            const texturePath = resolve(assetRoot, manifest.texture);
            if (texturePath.startsWith(assetRoot + "/") && existsSync(texturePath)) {
              textureBase64 = readFileSync(texturePath).toString("base64");
            }
          }
        } catch (error) {
          this.error("The local medieval asset manifest is invalid: " + String(error));
        }
      }

      return [
        "export const medievalModelBase64 = " + JSON.stringify(modelBase64) + ";",
        "export const medievalTextureBase64 = " + JSON.stringify(textureBase64) + ";",
        "export const medievalPackAvailable = " + (Object.keys(modelBase64).length > 0) + ";"
      ].join("\n");
    }
  };
}

export default defineConfig({
  plugins: [embeddedMedievalProps()],
  server: { host: "0.0.0.0", port: 5173, strictPort: true },
  build: { target: "es2022", outDir: "dist", sourcemap: false },
  test: { include: ["src/**/*.test.ts"] }
});
