import type { PresetName } from "./quality";

export type Tool = "move" | "dig" | "fill";

export interface UiHandlers {
  setTool(tool: Tool): void;
  setRadius(value: number): void;
  setStrength(value: number): void;
  setPreset(preset: PresetName): void;
  toggleNight(): void;
  toggleStats(): void;
  resetView(): void;
  undo(): void;
  resetGround(): void;
  /** Press or release a virtual keyboard key (drives the on-screen camera pad). */
  press(code: string, down: boolean): void;
}

export interface Ui {
  setTool(tool: Tool): void;
  setRadius(value: number): void;
  setStrength(value: number): void;
  setPreset(preset: PresetName): void;
  setNight(night: boolean): void;
  toast(message: string): void;
}

const icon = (path: string): string =>
  `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;

const ICONS = {
  move: icon('<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>'),
  dig: icon('<path d="M4 20l9-9M13 11l-2-5 5-3 4 4-3 5zM4 20h6"/>'),
  fill: icon('<path d="M4 18h16M7 18c0-4 2-7 5-7s5 3 5 7M12 11V5M9 8l3-3 3 3"/>'),
  gear: icon('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>'),
  help: icon('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 015 .5c0 1.7-2.5 2-2.5 3.5M12 17h.01"/>'),
  cam: icon('<path d="M3 8h4l2-3h6l2 3h4v11H3z"/><circle cx="12" cy="13" r="3.5"/>')
};

const TOOL_NAMES: Record<Tool, string> = { move: "Move", dig: "Dig", fill: "Fill" };
const TOOL_KEYS: Record<Tool, string> = { move: "1", dig: "2", fill: "3" };

/** All the on-screen UI: tools, brush, camera pad, settings and help. Built to work with touch, mouse, trackpad and keyboard alone. */
export function createUi(handlers: UiHandlers, initial: { tool: Tool; radius: number; strength: number; preset: PresetName }): Ui {
  const coarse = matchMedia("(pointer: coarse)").matches;
  const root = document.createElement("div");
  root.id = "ui";
  root.innerHTML = `
    <div class="top">
      <button class="round" id="u-cam" aria-label="On-screen camera controls" aria-pressed="false" title="Camera controls">${ICONS.cam}</button>
      <button class="round" id="u-set" aria-label="Settings" aria-haspopup="dialog" title="Settings">${ICONS.gear}</button>
      <button class="round" id="u-help" aria-label="Help and controls" aria-haspopup="dialog" title="Help (H)">${ICONS.help}</button>
    </div>

    <div class="pad" id="u-pad" hidden aria-label="Camera controls">
      <button data-k="KeyQ" aria-label="Rotate left">⟲</button>
      <button data-k="ArrowUp" aria-label="Move forward">▲</button>
      <button data-k="KeyE" aria-label="Rotate right">⟳</button>
      <button data-k="ArrowLeft" aria-label="Move left">◀</button>
      <button data-k="KeyV" aria-label="Reset view" class="reset">⌂</button>
      <button data-k="ArrowRight" aria-label="Move right">▶</button>
      <button data-k="KeyZ" aria-label="Zoom in">＋</button>
      <button data-k="ArrowDown" aria-label="Move back">▼</button>
      <button data-k="KeyX" aria-label="Zoom out">－</button>
      <button data-k="KeyR" aria-label="Tilt up">⤒</button>
      <span></span>
      <button data-k="KeyF" aria-label="Tilt down">⤓</button>
    </div>

    <div class="bottom">
      <div class="hint" id="u-hint" role="status"></div>
      <div class="brush" id="u-brush" hidden>
        <label>Size <input id="u-size" type="range" min="0.5" max="4" step="0.25" aria-label="Brush size" /></label>
        <label>Strength <input id="u-str" type="range" min="0.4" max="3" step="0.2" aria-label="Brush strength" /></label>
        <button id="u-undo" aria-label="Undo last stroke" title="Undo (Ctrl+Z)">Undo</button>
      </div>
      <div class="tools" id="u-tools" role="toolbar" aria-label="Tools">
        ${(["move", "dig", "fill"] as Tool[])
          .map((t) => `<button data-tool="${t}" aria-pressed="false">${ICONS[t]}<span>${TOOL_NAMES[t]}</span><kbd>${TOOL_KEYS[t]}</kbd></button>`)
          .join("")}
      </div>
    </div>

    <div class="panel" id="u-settings" role="dialog" aria-label="Settings" hidden>
      <h2>Settings</h2>
      <div class="row"><span>Quality</span>
        <div class="seg" id="u-quality">
          <button data-q="low" aria-pressed="false">Low</button><button data-q="medium" aria-pressed="false">Medium</button><button data-q="high" aria-pressed="false">High</button>
        </div>
      </div>
      <div class="row"><span>Time of day</span><button class="wide" id="u-night" aria-pressed="false">Day</button></div>
      <div class="row"><span>Camera</span><button class="wide" id="u-reset">Reset view</button></div>
      <div class="row"><span>Ground</span><button class="wide" id="u-ground">Reset ground</button></div>
      <div class="row"><span>Stats</span><button class="wide" id="u-stats">Show / hide</button></div>
      <button class="close" data-close aria-label="Close">Close</button>
    </div>

    <div class="panel" id="u-helpbox" role="dialog" aria-label="Controls" hidden>
      <h2>Controls</h2>
      <h3>Touch</h3>
      <p>Drag a crate to carry it. Drag the ground to look around. Double-tap the ground to fly there. Pinch to zoom, two fingers to move. In Dig or Fill, one finger edits the ground — switch to Move to look around, or use the camera buttons.</p>
      <h3>Mouse &amp; trackpad</h3>
      <p>Drag to orbit or carry a crate. Scroll or pinch to zoom. Right-drag or Shift-drag to move. Double-click the ground to fly there. In Dig or Fill: drag to edit, or just hover and hold <kbd>Space</kbd> — no click needed.</p>
      <h3>Keyboard</h3>
      <p><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> tools · <kbd>W A S D</kbd> or arrows move · <kbd>Q</kbd> <kbd>E</kbd> rotate · <kbd>R</kbd> <kbd>F</kbd> tilt · <kbd>Z</kbd> <kbd>X</kbd> zoom · <kbd>[</kbd> <kbd>]</kbd> brush · <kbd>T</kbd> next tool · <kbd>Alt</kbd> flips dig/fill · <kbd>Ctrl</kbd>+<kbd>Z</kbd> undo · <kbd>Space</kbd> dig at the pointer (or screen centre) · <kbd>V</kbd> reset · <kbd>N</kbd> day/night · <kbd>G</kbd> quality · <kbd>F3</kbd> stats · <kbd>H</kbd> this help</p>
      <button class="close" data-close aria-label="Close">Close</button>
    </div>
    <div class="toast" id="u-toast" role="status" aria-live="polite"></div>`;
  document.body.append(root);

  const $ = <T extends HTMLElement>(id: string): T => root.querySelector<T>(`#${id}`)!;
  const settings = $("u-settings");
  const helpBox = $("u-helpbox");
  const pad = $("u-pad");
  const camButton = $("u-cam");
  const hint = $("u-hint");
  const brush = $("u-brush");
  const size = $<HTMLInputElement>("u-size");
  const strength = $<HTMLInputElement>("u-str");
  const night = $("u-night");

  // Buttons should not keep keyboard focus after a click, or Space would "press" them again.
  root.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest("button");
    if (button && event.detail > 0) button.blur();
  });

  // Tools
  const toolButtons = [...root.querySelectorAll<HTMLButtonElement>("[data-tool]")];
  toolButtons.forEach((b) => b.addEventListener("click", () => handlers.setTool(b.dataset.tool as Tool)));

  const hints: Record<Tool, string> = {
    move: coarse ? "Drag a crate to carry it · drag the ground to look around" : "Drag a crate · drag the ground to orbit · scroll to zoom",
    dig: coarse ? "Drag to dig · switch to Move to look around" : "Drag or hold Space to dig · Alt fills · Ctrl+Z undoes · [ ] brush size",
    fill: coarse ? "Drag to build the ground up" : "Drag or hold Space to build up · Alt digs · Ctrl+Z undoes · [ ] brush size"
  };
  let hintTimer = 0;
  function showHint(tool: Tool): void {
    hint.textContent = hints[tool];
    hint.classList.add("show");
    clearTimeout(hintTimer);
    hintTimer = window.setTimeout(() => hint.classList.remove("show"), 9000);
  }

  // Brush
  size.value = String(initial.radius);
  strength.value = String(initial.strength);
  size.addEventListener("input", () => handlers.setRadius(Number(size.value)));
  strength.addEventListener("input", () => handlers.setStrength(Number(strength.value)));

  // Camera pad: press and hold.
  pad.querySelectorAll<HTMLButtonElement>("button").forEach((b) => {
    const code = b.dataset.k!;
    const release = (): void => {
      b.classList.remove("held");
      if (code !== "KeyV") handlers.press(code, false);
    };
    b.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      b.setPointerCapture(event.pointerId);
      b.classList.add("held");
      if (code === "KeyV") handlers.resetView();
      else handlers.press(code, true);
    });
    b.addEventListener("pointerup", release);
    b.addEventListener("pointercancel", release);
    b.addEventListener("keydown", (event) => {
      if (event.code === "Enter" || event.code === "Space") {
        event.preventDefault();
        if (code === "KeyV") handlers.resetView();
        else if (!event.repeat) handlers.press(code, true);
      }
    });
    b.addEventListener("keyup", (event) => {
      if ((event.code === "Enter" || event.code === "Space") && code !== "KeyV") handlers.press(code, false);
    });
  });
  function setPad(on: boolean): void {
    pad.hidden = !on;
    camButton.setAttribute("aria-pressed", String(on));
    try {
      localStorage.setItem("deskbound.pad", on ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  }
  let saved: string | null = null;
  try {
    saved = localStorage.getItem("deskbound.pad");
  } catch {
    /* storage unavailable */
  }
  setPad(saved === null ? coarse : saved === "1");
  camButton.addEventListener("click", () => setPad(pad.hidden));

  // Panels
  const panels = [settings, helpBox];
  function openPanel(panel: HTMLElement | null): void {
    panels.forEach((p) => (p.hidden = p !== panel || !p.hidden ? true : false));
    if (panel && !panel.hidden) panel.querySelector<HTMLButtonElement>("button")?.focus();
  }
  $("u-set").addEventListener("click", () => openPanel(settings));
  $("u-help").addEventListener("click", () => openPanel(helpBox));
  root.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => openPanel(null)));
  window.addEventListener("keydown", (event) => {
    if (event.code === "Escape") openPanel(null);
    else if (event.code === "KeyH" && !(event.target instanceof HTMLInputElement)) openPanel(helpBox);
  });
  document.addEventListener("pointerdown", (event) => {
    const t = event.target as HTMLElement;
    if (!t.closest(".panel, .top")) panels.forEach((p) => (p.hidden = true));
  });

  // Settings
  const qualityButtons = [...root.querySelectorAll<HTMLButtonElement>("[data-q]")];
  qualityButtons.forEach((b) => b.addEventListener("click", () => handlers.setPreset(b.dataset.q as PresetName)));
  night.addEventListener("click", () => handlers.toggleNight());
  $("u-reset").addEventListener("click", () => handlers.resetView());
  $("u-stats").addEventListener("click", () => handlers.toggleStats());
  $("u-undo").addEventListener("click", () => handlers.undo());
  $("u-ground").addEventListener("click", () => handlers.resetGround());

  let toastTimer = 0;
  const toastEl = $("u-toast");

  const ui: Ui = {
    setTool(tool) {
      toolButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tool === tool)));
      brush.hidden = tool === "move";
      showHint(tool);
    },
    setRadius(value) {
      size.value = String(value);
    },
    setStrength(value) {
      strength.value = String(value);
    },
    setPreset(preset) {
      qualityButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.q === preset)));
    },
    setNight(isNight) {
      night.textContent = isNight ? "Night" : "Day";
      night.setAttribute("aria-pressed", String(isNight));
    },
    toast(message) {
      toastEl.textContent = message;
      toastEl.classList.add("show");
      clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => toastEl.classList.remove("show"), 1600);
    }
  };
  ui.setTool(initial.tool);
  ui.setPreset(initial.preset);
  ui.setNight(false);
  return ui;
}
