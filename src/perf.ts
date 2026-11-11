import type * as THREE from "three";

/** Small stats panel: toggle with F3 (or P). Shows what the renderer is really doing so tuning is measured, not guessed. */
export function createPerfOverlay(renderer: THREE.WebGLRenderer, extra: () => string): { frame(dt: number): void; toggle(): void } {
  const el = document.createElement("pre");
  el.id = "perf";
  el.hidden = !new URLSearchParams(location.search).has("perf");
  document.body.appendChild(el);

  let accum = 0;
  let frames = 0;
  let worst = 0;
  return {
    frame(dt: number): void {
      accum += dt;
      frames += 1;
      worst = Math.max(worst, dt);
      if (accum < 0.5) return;
      if (!el.hidden) {
        const info = renderer.info;
        el.textContent =
          `${(frames / accum).toFixed(0)} fps  ${((accum / frames) * 1000).toFixed(1)} ms  (worst ${(worst * 1000).toFixed(0)} ms)\n` +
          `draw calls ${info.render.calls}  triangles ${(info.render.triangles / 1000).toFixed(0)}k\n` +
          extra();
      }
      accum = 0;
      frames = 0;
      worst = 0;
    },
    toggle(): void {
      el.hidden = !el.hidden;
    }
  };
}
