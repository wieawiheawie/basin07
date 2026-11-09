declare module "*deskbound_sim.js" {
  export class Simulation {
    constructor();
    setKeyword(actionId: string, displayWord: string): void;
    discoverAction(actionId: string): void;
    isDiscovered(actionId: string): boolean;
    enqueueCommand(source: string): boolean;
    moveObject(index: number, x: number, z: number): boolean;
    beginGrab(index: number, x: number, z: number): boolean;
    setGrabTarget(index: number, x: number, z: number): boolean;
    releaseGrab(index: number): boolean;
    uncapObject(index: number): boolean;
    carveStroke(fromX: number, fromZ: number, toX: number, toZ: number): boolean;
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
    objectTransformsPtr(): number;
    objectColoursPtr(): number;
    peopleCount(): number;
    objectCount(): number;
    objectName(index: number): string;
    objectKind(index: number): string;
    objectX(index: number): number;
    objectZ(index: number): number;
    objectCapOn(index: number): boolean;
    objectActive(index: number): boolean;
    objectTilt(index: number): number;
    objectYaw(index: number): number;
    objectVolume(index: number): number;
    objectColour(index: number): number;
    objectVelocityX(index: number): number;
    objectVelocityZ(index: number): number;
    waterVolume(): number;
    terrainRevision(): number;
    waterRevision(): number;
  }

  export function wasmMemory(): WebAssembly.Memory;
  export default function init(input?: RequestInfo | URL | Response | BufferSource | WebAssembly.Module): Promise<unknown>;
}


declare module "virtual:medieval-props" {
  export const medievalModelBase64: Readonly<Record<string, string>>;
  export const medievalTextureBase64: string;
  export const medievalPackAvailable: boolean;
}
