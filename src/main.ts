import init, { Simulation, wasmMemory } from "../pkg/deskbound_sim.js";
import glossary from "../glossary.json";
import { setupConsole } from "./console";
import { createDeskScene } from "./scene";
import "./style.css";

async function start(): Promise<void> {
  await init();
  const simulation = new Simulation();
  for (const [id, word] of Object.entries(glossary)) {
    simulation.setKeyword(id, word);
  }
  const memory = wasmMemory() as WebAssembly.Memory;
  const ui = setupConsole(simulation);
  const sceneContainer = document.getElementById("scene");
  if (!sceneContainer) throw new Error("The scene container is missing.");
  const scene = createDeskScene(simulation, memory, sceneContainer, ui.setHover, ui.setInteraction);
  let previousTime = 0;

  function frame(now: number): void {
    const delta = previousTime === 0 ? 0 : Math.min((now - previousTime) / 1000, 0.1);
    previousTime = now;
    simulation.tick(delta);
    scene.sync();
    scene.render(now / 1000);
    ui.update();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

start().catch((error: unknown) => {
  const status = document.getElementById("loading-status");
  if (status) status.textContent = "The desk could not start: " + String(error);
  console.error(error);
});
