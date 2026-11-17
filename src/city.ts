import { textured } from './textures';
import * as THREE from 'three';
import buildings from '../shared/city-buildings.json';

export const CITY_HEIGHT = 5.5;
export const CITY_LIMITS = { minX: -52, maxX: 52, minZ: -156, maxZ: -42 };

export function hitsBuilding(x: number, z: number, radius: number) {
  return buildings.some(block =>
    Math.abs(x - block.x) < 4 + radius && Math.abs(z - block.z) < 6 + radius
  );
}

export function addCity(scene: THREE.Scene) {
  const box = new THREE.BoxGeometry(1, 1, 1);
  const batches = new Map<number, number[][]>();
  function add(color: number, x: number, y: number, z: number, w: number, h: number, d: number) {
    let pieces = batches.get(color);
    if (!pieces) {
      pieces = [];
      batches.set(color, pieces);
    }
    pieces.push([x, y, z, w, h, d]);
  }

  const asphalt = 0x4a5159;
  const stripe = 0xf5db8f;
  const curb = 0xabaaa3;
  const y = CITY_HEIGHT;
  const streets = [-145, -112, -79];
  for (const x of [-36, 0, 36]) {
    add(asphalt, x, y + 0.025, -96, 10, 0.06, 106);
    for (let z = -144; z <= -46; z += 6) {
      if (streets.some(street => Math.abs(street - z) < 6)) continue;
      add(stripe, x, y + 0.066, z, 0.12, 0.025, 2.5);
    }
  }
  for (const z of streets) {
    add(asphalt, 0, y + 0.025, z, 88, 0.06, 10);
    for (let x = -42; x <= 42; x += 6) {
      if ([-36, 0, 36].some(street => Math.abs(street - x) < 6)) continue;
      add(stripe, x, y + 0.066, z, 2.5, 0.025, 0.12);
    }
  }
  add(asphalt, 18, y + 0.026, -53, 32, 0.06, 17);
  for (const x of [9.5, 14.5, 19.5, 24.5, 29.5]) {
    add(0xe2e6e8, x, y + 0.068, -53, 0.12, 0.026, 5.6);
  }
  add(0xe2e6e8, 19.5, y + 0.068, -55.8, 20, 0.026, 0.12);
  add(0x404e59, 6, y + 1.2, -47.5, 0.15, 2.4, 0.15);

  const sign = document.createElement('canvas');
  sign.width = 128;
  sign.height = 128;
  const ink = sign.getContext('2d')!;
  ink.fillStyle = '#225087';
  ink.fillRect(0, 0, 128, 128);
  ink.strokeStyle = '#f5fbff';
  ink.lineWidth = 6;
  ink.strokeRect(7, 7, 114, 114);
  ink.fillStyle = '#f5fbff';
  ink.font = 'bold 88px system-ui';
  ink.textAlign = 'center';
  ink.textBaseline = 'middle';
  ink.fillText('P', 64, 67);
  const signTexture = new THREE.CanvasTexture(sign);
  signTexture.colorSpace = THREE.SRGBColorSpace;
  const parkingSign = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 1.45),
    new THREE.MeshLambertMaterial({ map: signTexture, side: THREE.DoubleSide }));
  parkingSign.position.set(6, y + 2.25, -47.38);
  scene.add(parkingSign);

  const palette = [0xc28f76, 0x9fadb9, 0xd1bf9f, 0x92a89c];
  for (const [col, x] of [-18, 18].entries()) {
    for (const [row, z] of [-128.5, -95.5].entries()) {
      add(curb, x, y + 0.13, z, 24, 0.28, 21);
      for (const pair of [0, 1]) {
        const bx = buildings[(col * 2 + row) * 2 + pair].x;
        const height = 7 + ((row * 3 + col * 2 + pair * 4) % 9);
        add(palette[(row * 2 + col + pair) % palette.length], bx, y + height / 2, z, 8, height, 12);
        add(0x575e66, bx, y + height + 0.15, z, 8.2, 0.3, 12.2);
        for (let floor = 3; floor < height - 1; floor += 2.7) {
          for (const side of [-1, 1]) {
            add(0x56738a, bx, y + floor, z + side * 6.02, 5.4, 0.9, 0.06);
            add(0x56738a, bx + side * 4.02, y + floor, z, 0.06, 0.9, 8.5);
          }
        }
      }
    }
  }

  // Gubo Tiendini: approach the storefront to open the existing cosmetics shop.
  add(0xf1dfb0, -24, y + 2, -60, 8, 4, 12);
  add(0xb62943, -24, y + 4.15, -60, 8.6, 0.3, 12.6);
  add(0xb62943, -24, y + 3.05, -53.7, 8.5, 0.45, 1);
  add(0x37566b, -24, y + 1.3, -53.96, 1.8, 2.6, 0.1);
  add(0x8cc8da, -26.6, y + 1.8, -53.94, 2.1, 1.6, 0.1);
  add(0x8cc8da, -21.4, y + 1.8, -53.94, 2.1, 1.6, 0.1);
  const shopSign = document.createElement('canvas'); shopSign.width = 512; shopSign.height = 128;
  const shopInk = shopSign.getContext('2d')!;
  shopInk.fillStyle = '#b62943'; shopInk.fillRect(0, 0, 512, 128);
  shopInk.fillStyle = '#fff3c9'; shopInk.textAlign = 'center'; shopInk.font = 'bold 46px system-ui'; shopInk.fillText('GUBO TIENDINI', 256, 62);
  shopInk.font = '24px system-ui'; shopInk.fillText('Sombreros y colores', 256, 102);
  const shopMap = new THREE.CanvasTexture(shopSign); shopMap.colorSpace = THREE.SRGBColorSpace;
  const shopBoard = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.75), new THREE.MeshBasicMaterial({map: shopMap}));
  shopBoard.position.set(-24, y + 4.8, -53.8); scene.add(shopBoard);

  const matrix = new THREE.Matrix4();
  for (const [color, pieces] of batches) {
    const material = new THREE.MeshLambertMaterial({ color });
    if (palette.includes(color)) textured(material, 'wall');
    const mesh = new THREE.InstancedMesh(box, material, pieces.length);
    pieces.forEach(([x, y, z, w, h, d], i) => {
      matrix.makeScale(w, h, d).setPosition(x, y, z);
      mesh.setMatrixAt(i, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
  }
}
