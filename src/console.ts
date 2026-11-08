import type { Simulation } from "../pkg/deskbound_sim.js";
import glossary from "../glossary.json";
import { getSuggestions, parseReply } from "./command";

const HELP_TEXT: Record<string, string> = {
  "action.carve": "Make a shallow channel between two coordinates or named objects.",
  "action.uncap": "Remove a bottle cap. The cap stays on the desk.",
  "action.tap": "Open the rain barrel tap; water flows from the barrel into the desk.",
  "action.tip": "Tip an uncapped bottle; add a target after the toward word to aim it.",
  "action.upright": "Return a bottle to its standing position.",
  "action.look": "Read an object's state and desk coordinates.",
  "action.paint": "Recolour a movable object with red, blue, green, yellow, brown, purple, white or black.",
  "action.roll_east": "Give a pencil an eastward push; slopes and flowing water affect its motion.",
  "action.shift_down": "Nudge all loose pencils down the desk.",
  "action.help": "List discovered commands and show the script syntax.",
  "action.list": "List the names of things on the desk."
};

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error("Missing interface element: #" + id);
  return element as T;
}

export function setupConsole(simulation: Simulation) {
  const form = byId<HTMLFormElement>("command-form");
  const input = byId<HTMLInputElement>("command-input");
  const log = byId<HTMLDivElement>("prompt-log");
  const suggestions = byId<HTMLDivElement>("suggestions");
  const helpPanel = byId<HTMLDivElement>("help-panel");
  const helpList = byId<HTMLDivElement>("help-list");
  const energyFill = byId<HTMLDivElement>("energy-fill");
  const energyLabel = byId<HTMLSpanElement>("energy-label");
  const queueLabel = byId<HTMLSpanElement>("queue-label");
  const hoverLabel = byId<HTMLDivElement>("hover-label");
  const lowButton = byId<HTMLButtonElement>("low-toggle");
  const helpButton = byId<HTMLButtonElement>("help-toggle");
  const commandPanel = byId<HTMLElement>("command-panel");
  const commandButton = byId<HTMLButtonElement>("commands-toggle");
  const commandClose = byId<HTMLButtonElement>("commands-close");
  const interactionHint = byId<HTMLSpanElement>("interaction-hint");

  const vocabulary = [
    ...Object.values(glossary),
    ...Array.from({ length: simulation.objectCount() }, (_, index) => simulation.objectName(index))
  ];
  const history: string[] = [];
  let historyIndex = 0;
  let lastSequence = simulation.resultSequence();
  let helpSignature = "";

  function appendLog(text: string, kind: "command" | "success" | "error" | "note"): void {
    const line = document.createElement("div");
    line.className = "log-line log-" + kind;
    line.textContent = text;
    log.append(line);
    while (log.childElementCount > 5) log.firstElementChild?.remove();
    log.scrollTop = log.scrollHeight;
  }

  function renderSuggestions(): void {
    const words = getSuggestions(input.value, vocabulary);
    suggestions.replaceChildren();
    if (words.length === 0) {
      suggestions.classList.remove("visible");
      return;
    }
    for (const word of words) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "suggestion";
      item.textContent = word;
      item.addEventListener("click", () => {
        const parts = input.value.split(/\s+/);
        parts[parts.length - 1] = word;
        input.value = parts.join(" ") + " ";
        suggestions.replaceChildren();
        suggestions.classList.remove("visible");
        input.focus();
      });
      suggestions.append(item);
    }
    suggestions.classList.add("visible");
  }

  function renderHelp(): void {
    const discovered = Object.keys(HELP_TEXT).filter((id) => simulation.isDiscovered(id));
    const signature = discovered.join("|");
    if (signature === helpSignature) return;
    helpSignature = signature;
    helpList.replaceChildren();
    for (const actionId of discovered) {
      const row = document.createElement("div");
      row.className = "help-entry";
      const word = (glossary as Record<string, string>)[actionId] ?? actionId;
      const title = document.createElement("strong");
      title.textContent = word;
      const description = document.createElement("p");
      description.textContent = HELP_TEXT[actionId];
      const example = document.createElement("code");
      const syntax = (id: string) => (glossary as Record<string, string>)[id] ?? id;
      if (actionId === "action.carve") {
        example.textContent = word + " " + syntax("syntax.from") + " (2,3) " +
          syntax("syntax.to") + " (8,3) " + syntax("option.depth") + " 0.2 " +
          syntax("option.width") + " 0.5";
      } else if (actionId === "action.uncap") {
        example.textContent = word + " bottle_1";
      } else if (actionId === "action.tap") {
        example.textContent = word + " barrel_1";
      } else if (actionId === "action.tip") {
        example.textContent = word + " bottle_1 " + syntax("syntax.toward") + " " + syntax("direction.east");
      } else if (actionId === "action.paint") {
        example.textContent = word + " pencil_1 red";
      } else if (actionId === "action.roll_east") {
        example.textContent = word + " pencil_1";
      } else if (actionId === "action.upright" || actionId === "action.look") {
        example.textContent = word + " bottle_1";
      } else {
        example.textContent = word;
      }
      row.append(title, description, example);
      helpList.append(row);
    }
    if (discovered.length === 0) {
      const empty = document.createElement("p");
      empty.className = "help-empty";
      empty.textContent = "No words have been learned yet. Look around the desk and listen.";
      helpList.append(empty);
    }
    const scripts = document.createElement("p");
    scripts.className = "help-empty";
    scripts.textContent = "Script syntax: command ; command · repeat 5 { ... } · if/when garden.moisture < 20% { ... } · let name = value · pencil_1 -> roll_east -> paint red";
    helpList.append(scripts);
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const source = input.value.trim();
    if (source.length === 0) return;
    if (!simulation.enqueueCommand(source)) {
      appendLog("The command queue is full. Let the desk finish a thought first.", "error");
      return;
    }
    history.push(source);
    historyIndex = history.length;
    appendLog("› " + source, "command");
    input.value = "";
    renderSuggestions();
    input.focus();
  });

  input.addEventListener("input", renderSuggestions);
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (history.length > 0) {
        historyIndex = Math.max(0, historyIndex - 1);
        input.value = history[historyIndex] ?? "";
        renderSuggestions();
      }
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      historyIndex = Math.min(history.length, historyIndex + 1);
      input.value = history[historyIndex] ?? "";
      renderSuggestions();
    } else if (event.key === "Tab") {
      const first = suggestions.querySelector<HTMLButtonElement>(".suggestion");
      if (first) {
        event.preventDefault();
        first.click();
      }
    } else if (event.key === "Escape") {
      suggestions.replaceChildren();
      suggestions.classList.remove("visible");
      setCommandsOpen(false);
    }
  });

  function setCommandsOpen(open: boolean): void {
    commandPanel.classList.toggle("open", open);
    commandButton.setAttribute("aria-expanded", String(open));
    if (open) {
      window.setTimeout(() => input.focus(), 60);
    }
  }

  commandButton.addEventListener("click", () => {
    setCommandsOpen(!commandPanel.classList.contains("open"));
  });
  commandClose.addEventListener("click", () => setCommandsOpen(false));

  helpButton.addEventListener("click", () => {
    const open = helpPanel.classList.toggle("open");
    helpButton.setAttribute("aria-expanded", String(open));
    renderHelp();
  });

  function setLowGraphics(low: boolean): void {
    lowButton.setAttribute("aria-pressed", String(low));
    lowButton.textContent = low ? "Low graphics · on" : "Low graphics";
    document.dispatchEvent(new CustomEvent("deskbound:graphics", { detail: { low } }));
  }

  lowButton.addEventListener("click", () => {
    setLowGraphics(lowButton.getAttribute("aria-pressed") !== "true");
  });

  document.addEventListener("deskbound:toggle-graphics", () => {
    setLowGraphics(lowButton.getAttribute("aria-pressed") !== "true");
  });

  document.addEventListener("deskbound:open-journal", () => {
    helpPanel.classList.add("open");
    helpButton.setAttribute("aria-expanded", "true");
    renderHelp();
  });

  appendLog("Left-drag to move things. Right-click to pick them up. Hold both mouse buttons to carve the tabletop or uncap a bottle.", "note");
  renderHelp();

  return {
    update(): void {
      const energy = Math.round(simulation.energy());
      energyFill.style.width = energy + "%";
      energyLabel.textContent = energy + " energy";
      queueLabel.textContent = simulation.queueLength() + " queued";
      const sequence = simulation.resultSequence();
      if (sequence !== lastSequence) {
        lastSequence = sequence;
        const reply = parseReply(simulation.lastResult());
        appendLog(reply.message, reply.ok ? "success" : "error");
        renderHelp();
      }
    },
    setHover(name: string): void {
      hoverLabel.textContent = name;
      hoverLabel.classList.toggle("visible", name.length > 0);
      renderHelp();
    },
    setInteraction(message: string): void {
      interactionHint.textContent = message.length > 0
        ? message.toUpperCase()
        : "LEFT-DRAG MOVE · RIGHT-CLICK PICK UP · BOTH BUTTONS DIG / UNCAP · BOOK = JOURNAL · LAMP = GRAPHICS";
    }
  };
}
