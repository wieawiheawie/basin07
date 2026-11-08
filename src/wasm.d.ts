declare module "*deskbound_sim.js" {
  export class Simulation {
    constructor();
    setKeyword(actionId: string, displayWord: string): void;
    discoverAction(actionId: string): void;
    isDiscovered(actionId: string): boolean;
    enqueueCommand(source: string): boolean;
    tick(frameSeconds: number): void;
    energy(): number;
    queueLength(): number;
    resultSequence(): number;
    lastResult(): string;
    gridSize(): number;
    heightPtr(): number;
    waterPtr(): number;
    terrainPositionsPtr(): number;
    terrainNormalsPtr(): number;
    waterPositionsPtr(): number;
    waterNormalsPtr(): number;
    peoplePtr(): number;
    peopleCount(): number;
    objectCount(): number;
    objectName(index: number): string;
    objectKind(index: number): string;
    objectX(index: number): number;
    objectZ(index: number): number;
    objectCapOn(index: number): boolean;
    objectTilt(index: number): number;
    objectYaw(index: number): number;
    objectVolume(index: number): number;
    waterVolume(): number;
  }

  export function wasmMemory(): WebAssembly.Memory;
  export default function init(input?: RequestInfo | URL | Response | BufferSource | WebAssembly.Module): Promise<unknown>;
}
