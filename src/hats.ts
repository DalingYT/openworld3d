import * as THREE from 'three';
import catalog from '../shared/hats.json';
import './hats.css';

type HatId = keyof typeof catalog;
type Piece = [color: number, x: number, y: number, z: number, w: number, h: number, depth: number];

const designs: Record<HatId, Piece[]> = {
  cap: [
    [0xc84042, 0, 0.14, 0.04, 1.02, 0.33, 0.94],
    [0xb72e35, 0, 0.02, -0.63, 0.92, 0.1, 0.55],
    [0xe76360, 0, 0.32, 0.08, 0.19, 0.07, 0.19]
  ],
  cowboy: [
    [0xcf9a52, 0, 0.04, 0, 1.56, 0.13, 1.38],
    [0xc89a63, 0, 0.26, 0, 0.87, 0.42, 0.82],
    [0x623e28, 0, 0.13, 0, 0.91, 0.11, 0.87]
  ],
  beanie: [
    [0x8a58c2, 0, 0.21, 0, 0.97, 0.36, 0.97],
    [0x684297, 0, 0.06, 0, 1.07, 0.14, 1.07],
    [0xb17ee7, 0, 0.45, 0, 0.24, 0.24, 0.24]
  ],
  top: [
    [0x252435, 0, 0.04, 0, 1.42, 0.12, 1.35],
    [0x242333, 0, 0.36, 0, 0.86, 0.63, 0.84],
    [0xb33e5c, 0, 0.15, 0, 0.91, 0.13, 0.89]
  ]
};

const geometry = new THREE.BoxGeometry(1, 1, 1);
const materials = new Map<number, THREE.MeshLambertMaterial>();
const attachments = new WeakMap<THREE.Group, { id: HatId; mesh: THREE.Group }>();
const preferenceKey = 'openworld3d.hat';

function isHat(id: unknown): id is HatId {
  return typeof id === 'string' && Object.hasOwn(catalog, id);
}

export function equipHat(avatar: THREE.Group, id: unknown) {
  const hat = attachments.get(avatar);
  if (hat?.id === id) return;
  hat?.mesh.removeFromParent();
  attachments.delete(avatar);
  if (!isHat(id)) return;
  const group = new THREE.Group();
  group.position.y = 2;
  for (const [color, x, y, z, w, h, depth] of designs[id]) {
    let material = materials.get(color);
    if (!material) {
      material = new THREE.MeshLambertMaterial({ color });
      materials.set(color, material);
    }
    const piece = new THREE.Mesh(geometry, material);
    piece.position.set(x, y, z);
    piece.scale.set(w, h, depth);
    group.add(piece);
  }
  avatar.add(group);
  attachments.set(avatar, { id, mesh: group });
}

export function createHatShop(player: THREE.Group) {
  const trigger = document.querySelector<HTMLButtonElement>('#game-shop')!;
  const dialog = document.querySelector<HTMLDialogElement>('#hat-shop')!;
  const list = dialog.querySelector<HTMLElement>('#hat-catalog')!;
  const buttons = new Map<HatId | null, HTMLButtonElement>();
  let selected: HatId | null = null;
  try {
    const saved = localStorage.getItem(preferenceKey);
    if (isHat(saved)) selected = saved;
  } catch {
    // Equipping remains available when storage is blocked.
  }

  function equip(id: HatId | null) {
    selected = id;
    equipHat(player, id);
    for (const [key, button] of buttons) {
      button.setAttribute('aria-pressed', String(key === selected));
    }
  }

  function addOption(id: HatId | null, label: string) {
    const button = document.createElement('button');
    button.type = 'button';
    const icon = document.createElement('span');
    icon.className = 'hat-icon';
    icon.dataset.shape = id ?? 'none';
    icon.setAttribute('aria-hidden', 'true');
    button.append(icon, label);
    button.addEventListener('click', () => {
      equip(id);
      try {
        if (id) localStorage.setItem(preferenceKey, id);
        else localStorage.removeItem(preferenceKey);
      } catch {
        // The selection still lasts for this session.
      }
    });
    buttons.set(id, button);
    list.append(button);
  }

  addOption(null, 'Sin sombrero');
  for (const id of Object.keys(catalog)) {
    if (isHat(id)) addOption(id, catalog[id]);
  }
  equip(selected);
  trigger.addEventListener('click', () => dialog.showModal());
  dialog.querySelector('#shop-close')!.addEventListener('click', () => dialog.close());

  return {
    get open() { return dialog.open; },
    get selected() { return selected; },
    setConnected(connected: boolean) {
      trigger.hidden = !connected;
      if (!connected) dialog.close();
    }
  };
}
