import * as THREE from 'three';
type Surface = THREE.MeshBasicMaterial | THREE.MeshLambertMaterial;
const materials = new Map<Surface, 'ground' | 'wall'>();
const maps = new Map<string, THREE.Texture>();
let enabled = false;
function texture(kind: 'ground' | 'wall') {
  let map = maps.get(kind); if (map) return map;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 64, 64);
  let seed = 31;
  for (let i = 0; i < 400; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; const x = seed % 64;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; const y = seed % 64;
    ctx.fillStyle = i % 3 ? '#e6e6e6' : '#cfcfcf'; ctx.fillRect(x, y, 1, kind === 'ground' ? 2 : 1);
  }
  if (kind === 'wall') {
    ctx.strokeStyle = '#d4d4d4'; ctx.lineWidth = 1;
    for (let y = 0; y < 64; y += 16) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(64, y); ctx.stroke();
      for (let x = (y / 16 % 2) * 16; x < 64; x += 32) { ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x,y+16); ctx.stroke(); }
    }
  }
  map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping; maps.set(kind, map); return map;
}
export function textured<T extends Surface>(material: T, kind: 'ground' | 'wall'): T {
  materials.set(material, kind); if (enabled) material.map = texture(kind); return material;
}
export function setupTextures() {
  try { enabled = localStorage.getItem('openworld3d.textures') !== 'false'; } catch { enabled = true; }
  const label = document.createElement('label'), input = document.createElement('input'); input.type = 'checkbox'; input.checked = enabled;
  label.append(input, ' Texturas del terreno y edificios'); document.querySelector('#settings-admin')!.before(label);
  const apply = () => { for (const [material, kind] of materials) { material.map = enabled ? texture(kind) : null; material.needsUpdate = true; } };
  input.addEventListener('change', () => { enabled = input.checked; apply(); try { localStorage.setItem('openworld3d.textures', String(enabled)); } catch {} }); apply();
}
