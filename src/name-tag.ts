import * as THREE from 'three';

export function makeNameTag(name: string) {
  const image = document.createElement('canvas');
  image.width = 256;
  image.height = 48;
  const ctx = image.getContext('2d')!;
  ctx.font = '600 24px system-ui';
  const width = Math.min(252, Math.ceil(ctx.measureText(name).width) + 20);
  ctx.fillStyle = '#162739e8';
  ctx.beginPath();
  ctx.roundRect((256 - width) / 2, 3, width, 42, 9);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 128, 24, 232);

  const map = new THREE.CanvasTexture(image);
  map.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({
    map,
    transparent: true,
    depthWrite: false
  }));
  label.position.y = 2.45;
  label.scale.set(3.2, 0.6, 1);
  return label;
}

export function disposeNameTag(label: THREE.Sprite) {
  label.removeFromParent();
  label.material.map?.dispose();
  label.material.dispose();
}
