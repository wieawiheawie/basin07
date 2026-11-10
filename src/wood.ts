import * as THREE from "three";

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Procedural plank texture: tinted planks, fine grain, knots and dark seams. */
export function createWoodTexture(seed: number, base: [number, number, number], planks: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  const random = rng(seed);
  const plankHeight = size / planks;

  for (let p = 0; p < planks; p += 1) {
    const y0 = p * plankHeight;
    const shade = 0.82 + random() * 0.34;
    ctx.fillStyle = `rgb(${Math.round(base[0] * shade)},${Math.round(base[1] * shade)},${Math.round(base[2] * shade)})`;
    ctx.fillRect(0, y0, size, plankHeight);

    for (let g = 0; g < plankHeight * 1.6; g += 1) {
      const gy = y0 + random() * plankHeight;
      const wobble = random() * 6;
      ctx.strokeStyle = `rgba(${random() > 0.5 ? "40,24,10" : "255,225,180"},${0.04 + random() * 0.09})`;
      ctx.lineWidth = 0.6 + random() * 1.2;
      ctx.beginPath();
      ctx.moveTo(0, gy);
      for (let x = 0; x <= size; x += 64) ctx.lineTo(x, gy + Math.sin(x * 0.02 + wobble) * 1.6);
      ctx.stroke();
    }

    if (random() > 0.55) {
      const kx = random() * size;
      const ky = y0 + plankHeight * (0.3 + random() * 0.4);
      for (let r = 9; r > 1; r -= 2) {
        ctx.strokeStyle = `rgba(35,20,8,${0.08 + (9 - r) * 0.03})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(kx, ky, r * 1.8, r * 0.8, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    ctx.fillStyle = "rgba(20,10,3,0.55)";
    ctx.fillRect(0, y0, size, 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Scales a BoxGeometry's UVs so the texture keeps a constant world-space size on every face. */
export function scaleBoxUV(geometry: THREE.BoxGeometry, tile: number): void {
  const { width, height, depth } = geometry.parameters;
  const uv = geometry.getAttribute("uv") as THREE.BufferAttribute;
  const faces: Array<[number, number]> = [
    [depth, height], [depth, height], [width, depth], [width, depth], [width, height], [width, height]
  ];
  for (let face = 0; face < 6; face += 1) {
    const [u, v] = faces[face]!;
    for (let i = 0; i < 4; i += 1) {
      const index = face * 4 + i;
      uv.setXY(index, uv.getX(index) * (u / tile), uv.getY(index) * (v / tile));
    }
  }
  uv.needsUpdate = true;
}
