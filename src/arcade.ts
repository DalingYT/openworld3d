import { sfx } from './audio';
import * as THREE from 'three';
import type { World } from './world';
import './arcade.css';

export function createArcade(scene: THREE.Scene, world: World) {
  const machine = new THREE.Group();
  machine.position.set(10, world.groundHeight(10, -35), -35);
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.8, 1.3), new THREE.MeshLambertMaterial({color: 0x703dc1}));
  body.position.y = 1.4; machine.add(body);
  const art = document.createElement('canvas'); art.width = 256; art.height = 256;
  const ctx = art.getContext('2d')!;
  ctx.fillStyle = '#101c35'; ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#57f8ce'; ctx.textAlign = 'center'; ctx.font = 'bold 36px sans-serif'; ctx.fillText('ARCADE', 128, 65);
  ctx.font = '24px sans-serif'; ctx.fillText('BLOQUITO', 128, 107);
  ctx.fillStyle = '#ffdc57'; ctx.fillRect(100, 140, 56, 56);
  const texture = new THREE.CanvasTexture(art); texture.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 1.55), new THREE.MeshBasicMaterial({map: texture, side: THREE.DoubleSide}));
  screen.position.set(0, 1.85, 0.66); machine.add(screen); scene.add(machine);
  const trigger = document.createElement('button'); trigger.type = 'button'; trigger.textContent = 'Jugar arcade'; trigger.hidden = true;
  document.querySelector('#car-controls')!.append(trigger);
  const dialog = document.createElement('dialog'); dialog.id = 'arcade-panel';
  const title = document.createElement('h2'); title.textContent = 'Arcade · Atrapa al Bloquito';
  const description = document.createElement('p'); description.textContent = 'Toca el cuadro amarillo tantas veces como puedas en 20 segundos.';
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  const grid = document.createElement('div'); grid.className = 'arcade-grid';
  const start = document.createElement('button'); start.type = 'button'; start.textContent = 'Jugar';
  const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Cerrar';
  dialog.append(title, description, status, grid, start, close); document.body.append(dialog);
  let score = 0, best = 0, end = 0, active = -1, displayed = '';
  try { best = Math.max(0, Number(localStorage.getItem('openworld3d.arcade')) || 0); } catch {}
  const cells: HTMLButtonElement[] = [];
  function next() {
    const old = active;
    active = (Math.max(0, old) + 1 + Math.floor(Math.random() * 8)) % 9;
    cells.forEach((cell, i) => { cell.textContent = i === active ? '■' : ''; cell.setAttribute('aria-label', i === active ? 'Atrapar Bloquito' : 'Casilla vacía'); });
  }
  function finish() {
    if (end && performance.now() >= end) sfx('finish');
    end = 0; active = -1; start.disabled = false;
    cells.forEach(cell => { cell.disabled = true; cell.textContent = ''; });
    best = Math.max(best, score);
    try { localStorage.setItem('openworld3d.arcade', String(best)); } catch {}
    status.textContent = `Puntos: ${score} · Récord en este dispositivo: ${best}`;
  }
  for (let i = 0; i < 9; i++) {
    const cell = document.createElement('button'); cell.type = 'button'; cell.disabled = true;
    cell.addEventListener('click', () => {
      if (!end) return;
      if (performance.now() >= end) { finish(); return; }
      if (i === active) { score++; sfx('point'); next(); }
    });
    cells.push(cell); grid.append(cell);
  }
  start.addEventListener('click', () => { score = 0; end = performance.now() + 20000; displayed = ''; start.disabled = true; cells.forEach(cell => { cell.disabled = false; }); next(); });
  trigger.addEventListener('click', () => { if (document.pointerLockElement) document.exitPointerLock(); status.textContent = `Récord en este dispositivo: ${best}`; dialog.showModal(); });
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', finish);
  return {
    get open() { return dialog.open; },
    update(position: THREE.Vector3, available: boolean, time: number) {
      trigger.hidden = !available || position.distanceToSquared(machine.position) > 36;
      if (!available && dialog.open) dialog.close();
      if (!end) return;
      if (time >= end) { finish(); return; }
      const text = `Puntos: ${score} · Tiempo: ${Math.ceil((end-time)/1000)} s`;
      if (text !== displayed) { displayed = text; status.textContent = text; }
    }
  };
}
