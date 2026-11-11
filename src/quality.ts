export type PresetName = "low" | "medium" | "high";

export interface Preset {
  name: PresetName;
  pixelRatio: number;
  grass: number;
  shadowMap: number;
  shafts: boolean;
}

export function presets(devicePixelRatio: number): Record<PresetName, Preset> {
  return {
    low: { name: "low", pixelRatio: 0.75, grass: 0.3, shadowMap: 1024, shafts: false },
    medium: { name: "medium", pixelRatio: 1, grass: 0.7, shadowMap: 2048, shafts: true },
    high: { name: "high", pixelRatio: Math.min(devicePixelRatio, 1.5), grass: 1, shadowMap: 4096, shafts: true }
  };
}

export const PRESET_ORDER: PresetName[] = ["low", "medium", "high"];
