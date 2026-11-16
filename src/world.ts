import * as THREE from 'three';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';

const CHUNK_SIZE = 64;
const SEGMENTS = 24;
const CELL_SIZE = CHUNK_SIZE / SEGMENTS;
const VIEW_RADIUS = 3;
const WATER_LEVEL = 0;

const noise = new ImprovedNoise();
const { lerp, smoothstep } = THREE.MathUtils;

function terrainHeight(x: number, z: number) {
  const coast = noise.noise(x / 230 + 14.7, z / 230 - 8.3, 0.41);
  const hills = noise.noise(x / 87 - 6.1, z / 87 + 13.2, 0.67);
  const detail = noise.noise(x / 28 + 9.4, z / 28 + 4.8, 0.23);
  const inland = smoothstep(coast, -0.13, 0.32);
  const mountains = smoothstep(hills, -0.08, 0.55);

  return Math.max(-12, 2.5 + coast * 40 + inland * (mountains * 64 + detail * 7));
}

const terrainMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
const waterMaterial = new THREE.MeshBasicMaterial({
  color: 0x3598b4,
  transparent: true,
  opacity: 0.67,
  depthWrite: false,
  side: THREE.DoubleSide
});
const waterGeometry = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE);
waterGeometry.rotateX(-Math.PI / 2);

const sand = new THREE.Color(0xe8c98d);
const grass = new THREE.Color(0x73944d);
const rock = new THREE.Color(0x817e72);
const snow = new THREE.Color(0xe5edef);

const indices: number[] = [];
const stride = SEGMENTS + 1;
for (let z = 0; z < SEGMENTS; z++) {
  for (let x = 0; x < SEGMENTS; x++) {
    const a = z * stride + x;
    const b = a + 1;
    const c = a + stride;
    const d = c + 1;
    indices.push(a, c, b, b, c, d);
  }
}
const indexAttribute = new THREE.Uint16BufferAttribute(indices, 1);

function makeChunk(cx: number, cz: number) {
  const originX = cx * CHUNK_SIZE;
  const originZ = cz * CHUNK_SIZE;
  const count = stride * stride;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const heights = new Float32Array(count);

  // One extra sample on each edge gives neighbouring chunks identical shading.
  const paddedStride = stride + 2;
  const samples = new Float32Array(paddedStride * paddedStride);
  for (let z = -1; z <= SEGMENTS + 1; z++) {
    for (let x = -1; x <= SEGMENTS + 1; x++) {
      samples[(z + 1) * paddedStride + x + 1] = terrainHeight(
        (cx * SEGMENTS + x) * CELL_SIZE,
        (cz * SEGMENTS + z) * CELL_SIZE
      );
    }
  }

  let wet = false;
  const color = new THREE.Color();
  for (let z = 0; z <= SEGMENTS; z++) {
    for (let x = 0; x <= SEGMENTS; x++) {
      const i = z * stride + x;
      const s = (z + 1) * paddedStride + x + 1;
      const height = samples[s];
      heights[i] = height;
      positions[i * 3] = x * CELL_SIZE;
      positions[i * 3 + 1] = height;
      positions[i * 3 + 2] = z * CELL_SIZE;
      wet ||= height < WATER_LEVEL;

      const dx = (samples[s + 1] - samples[s - 1]) / (2 * CELL_SIZE);
      const dz = (samples[s + paddedStride] - samples[s - paddedStride]) / (2 * CELL_SIZE);
      const slope = Math.hypot(dx, dz);
      const light = (0.44 * dx + 0.82 + 0.36 * dz) / Math.hypot(slope, 1);

      color.copy(sand)
        .lerp(grass, smoothstep(height, WATER_LEVEL + 0.6, WATER_LEVEL + 4))
        .lerp(rock, smoothstep(height, 22, 43) * smoothstep(slope, 0.42, 1.25))
        .lerp(snow, smoothstep(height, 51, 68) * (1 - 0.5 * smoothstep(slope, 0.7, 1.5)))
        .multiplyScalar(0.65 + 0.42 * Math.max(0, light));
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  // Each geometry owns its GPU index buffer so unloading one cannot affect another.
  geometry.setIndex(indexAttribute.clone());
  const ground = new THREE.Mesh(geometry, terrainMaterial);
  ground.position.set(originX, 0, originZ);
  ground.matrixAutoUpdate = false;
  ground.updateMatrix();

  const water = wet ? new THREE.Mesh(waterGeometry, waterMaterial) : null;
  if (water) {
    water.position.set(originX + CHUNK_SIZE / 2, WATER_LEVEL, originZ + CHUNK_SIZE / 2);
    water.matrixAutoUpdate = false;
    water.updateMatrix();
  }

  return { ground, water, heights };
}

const chunkKey = (x: number, z: number) => x + ',' + z;

export class World {
  private readonly scene: THREE.Scene;
  private readonly chunks = new Map<string, ReturnType<typeof makeChunk>>();
  private pending: { x: number; z: number }[] = [];
  private centerX = Infinity;
  private centerZ = Infinity;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  update(x: number, z: number) {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    if (cx !== this.centerX || cz !== this.centerZ) {
      this.centerX = cx;
      this.centerZ = cz;
      this.pending = [];

      const visible = new Set<string>();
      for (let dz = -VIEW_RADIUS; dz <= VIEW_RADIUS; dz++) {
        for (let dx = -VIEW_RADIUS; dx <= VIEW_RADIUS; dx++) {
          const key = chunkKey(cx + dx, cz + dz);
          visible.add(key);
          if (!this.chunks.has(key)) this.pending.push({ x: cx + dx, z: cz + dz });
        }
      }

      for (const [key, chunk] of this.chunks) {
        if (visible.has(key)) continue;
        chunk.ground.removeFromParent();
        chunk.ground.geometry.dispose();
        chunk.water?.removeFromParent();
        this.chunks.delete(key);
      }

      this.pending.sort((a, b) =>
        Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz)
      );

      // The player and camera can cross an edge before the next frame.
      while (this.pending.length && Math.hypot(this.pending[0].x - cx, this.pending[0].z - cz) <= Math.SQRT2) {
        this.loadNext();
      }
    }
    this.loadNext();
  }

  private loadNext() {
    const next = this.pending.shift();
    if (!next) return;
    const chunk = makeChunk(next.x, next.z);
    this.chunks.set(chunkKey(next.x, next.z), chunk);
    this.scene.add(chunk.ground);
    if (chunk.water) this.scene.add(chunk.water);
  }

  groundHeight(x: number, z: number) {
    const gridX = x / CELL_SIZE;
    const gridZ = z / CELL_SIZE;
    const ix = Math.floor(gridX);
    const iz = Math.floor(gridZ);
    const cx = Math.floor(ix / SEGMENTS);
    const cz = Math.floor(iz / SEGMENTS);
    const heights = this.chunks.get(chunkKey(cx, cz))?.heights;
    const i = (iz - cz * SEGMENTS) * stride + ix - cx * SEGMENTS;
    const fx = gridX - ix;
    const fz = gridZ - iz;

    const a = heights?.[i] ?? Math.fround(terrainHeight(ix * CELL_SIZE, iz * CELL_SIZE));
    const b = heights?.[i + 1] ?? Math.fround(terrainHeight((ix + 1) * CELL_SIZE, iz * CELL_SIZE));
    const c = heights?.[i + stride] ?? Math.fround(terrainHeight(ix * CELL_SIZE, (iz + 1) * CELL_SIZE));
    const d = heights?.[i + stride + 1] ?? Math.fround(terrainHeight((ix + 1) * CELL_SIZE, (iz + 1) * CELL_SIZE));

    // Match the diagonal of the rendered triangles.
    return fx + fz <= 1
      ? a + (b - a) * fx + (c - a) * fz
      : lerp(b, d, fz) + (c - d) * (1 - fx);
  }
}
