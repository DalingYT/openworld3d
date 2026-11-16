import * as THREE from 'three';
import { World, setTerrainLight, waterSpeed } from './world';
import { addCity, hitsBuilding } from './city';
import { createCars } from './cars';
import { createLan } from './lan';
import { setupTouch } from './touch';
import './touch.css';

const scene = new THREE.Scene();
const sky = new THREE.Color(0xa7cde3);
const daySky = sky.clone();
const sunsetSky = new THREE.Color(0xe39c7b);
const nightSky = new THREE.Color(0x263858);
const twilight = new THREE.Color();
scene.background = sky;
const fog = new THREE.Fog(sky, 90, 185);
scene.fog = fog;

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.08, 190);
const renderer = new THREE.WebGLRenderer({ powerPreference: 'low-power' });
const canvas = renderer.domElement;

function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  // Limit both HiDPI scaling and the number of pixels drawn on large displays.
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1, Math.sqrt(1_300_000 / (innerWidth * innerHeight))));
  renderer.setSize(innerWidth, innerHeight);
}
resize();
window.addEventListener('resize', resize);

document.body.style.margin = '0';
document.body.style.overflow = 'hidden';
const app = document.querySelector<HTMLDivElement>('#app')!;
app.append(canvas);
const coordinates = document.querySelector<HTMLParagraphElement>('#coordinates')!;

const controls = document.createElement('p');
controls.id = 'keyboard-controls';
controls.style.cssText = 'position:fixed;left:16px;bottom:16px;margin:0;padding:8px 12px;border-radius:6px;background:#162739d9;color:white;font:13px system-ui;pointer-events:none';
app.append(controls);

const ambient = new THREE.HemisphereLight(0xffffff, 0x668866, 2);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(10, 20, 10);
scene.add(sun);

const world = new World(scene);
addCity(scene);
const cars = createCars(scene, world);
const bodyGeometry = new THREE.BoxGeometry(1, 2, 1);
const bodyMaterials = new Map<number, THREE.MeshLambertMaterial>();
const faceGeometry = new THREE.PlaneGeometry(0.6, 0.6);
const faceMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x111111 });
const eyeGeometry = new THREE.BoxGeometry(0.1, 0.1, 0.02);

function avatarMaterial(color: number) {
  let material = bodyMaterials.get(color);
  if (!material) {
    material = new THREE.MeshLambertMaterial({ color });
    bodyMaterials.set(color, material);
  }
  return material;
}

function makeAvatar(color = 0x3366ff) {
  const avatar = new THREE.Group();
  const body = new THREE.Mesh(bodyGeometry, avatarMaterial(color));
  body.name = 'body';
  body.position.y = 1;
  const face = new THREE.Mesh(faceGeometry, faceMaterial);
  face.rotation.y = Math.PI;
  face.position.set(0, 1.3, -0.505);
  avatar.add(body, face);
  for (const x of [-0.15, 0.15]) {
    const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    eye.position.set(x, 1.4, -0.52);
    avatar.add(eye);
  }
  return avatar;
}

const player = makeAvatar();
scene.add(player);
function spawn(x: number, z: number) {
  world.update(x, z);
  player.position.set(x, world.groundHeight(x, z), z);
}
spawn(0, -35);
const lan = createLan(scene, player, makeAvatar, spawn, color => {
  const body = player.getObjectByName('body') as THREE.Mesh;
  body.material = avatarMaterial(color);
}, cars);

const MOVE_SPEED = 5;
const RUN_MULTIPLIER = 1.7;
const GRAVITY = -20;
const JUMP_FORCE = 8;
const ROTATION_SPEED = 12;
const SENSITIVITY = 0.0025;
const CAMERA_DISTANCE = 7;

let thirdPerson = false;
let orbiting = false;
let yaw = 0;
let pitch = 0;
let verticalVelocity = 0;
let grounded = true;
let jumpQueued = false;
const keys = new Set<string>();
const cameraButton = document.querySelector<HTMLButtonElement>('#touch-camera')!;
const carAction = document.querySelector<HTMLButtonElement>('#car-action')!;
const carActionText = carAction.querySelector('b')!;
const spawnCar = document.querySelector<HTMLButtonElement>('#car-spawn')!;
let ridePending = false;
let lastCanvasPointer = 'mouse';

async function toggleRide() {
  if (ridePending || lan.entering || lan.settingsOpen || !lan.carsAvailable) return;
  const ride = cars.driving ? 'exit' : cars.nearby(player.position);
  if (!ride) return;
  ridePending = true;
  carAction.disabled = true;
  await lan.ride(ride);
  carAction.disabled = false;
  ridePending = false;
}
carAction.addEventListener('click', () => { void toggleRide(); });
spawnCar.addEventListener('click', async () => {
  if (ridePending || lan.settingsOpen || !lan.carsAvailable || cars.driving) return;
  ridePending = true;
  spawnCar.disabled = true;
  if (!await lan.ride('spawn')) {
    spawnCar.textContent = 'No se pudo sacar el carro';
    window.setTimeout(() => { spawnCar.textContent = 'Sacar carro'; }, 1800);
  }
  spawnCar.disabled = false;
  ridePending = false;
});

function lockPointer() {
  if (document.pointerLockElement === canvas || !canvas.requestPointerLock) return;
  void canvas.requestPointerLock()?.catch(() => {
    // The browser can require another click after Escape or loss of focus.
  });
}

function unlockPointer() {
  if (document.pointerLockElement === canvas) document.exitPointerLock();
}

function showControls() {
  player.visible = thirdPerson;
  cameraButton.setAttribute('aria-pressed', String(thirdPerson));
  const cameraHint = thirdPerson ? 'Clic derecho para girar' :
    document.pointerLockElement === canvas ? 'Esc para liberar el cursor' : 'Haz clic para mirar';
  controls.textContent = 'WASD mover · Shift correr · Espacio saltar · T cámara · C chat · ' + cameraHint;
}
showControls();

function toggleCamera(usePointerLock: boolean) {
  if (lan.entering) return;
  thirdPerson = !thirdPerson;
  orbiting = false;
  if (thirdPerson || !usePointerLock) unlockPointer();
  else lockPointer();
  showControls();
}

function turn(dx: number, dy: number, sensitivity: number) {
  yaw -= dx * sensitivity;
  pitch = THREE.MathUtils.clamp(
    pitch - dy * sensitivity, -Math.PI / 2 + 0.1, Math.PI / 2 - 0.1
  );
}

const touch = setupTouch(canvas, {
  look: (dx, dy) => {
    if (!lan.entering) turn(dx, dy, Math.PI / Math.min(innerWidth, innerHeight));
  },
  jump: () => { if (!lan.entering) jumpQueued = true; },
  camera: () => toggleCamera(false)
});

window.addEventListener('keydown', (event) => {
  if (lan.entering || lan.settingsOpen) return;
  if (event.code === 'KeyE' && !event.repeat) {
    void toggleRide();
    return;
  }
  if (event.code === 'KeyC' && !event.repeat) {
    const chat = document.querySelector<HTMLDetailsElement>('#game-chat')!;
    if (chat.hidden) return;
    unlockPointer();
    chat.open = !chat.open;
    return;
  }
  if (event.code === 'Space') {
    if (event.target instanceof HTMLElement && event.target.closest('#game-chat')) return;
    event.preventDefault();
    if (!event.repeat) jumpQueued = true;
  }
  if (event.code === 'KeyT' && !event.repeat) {
    toggleCamera(lastCanvasPointer === 'mouse');
  }
  keys.add(event.code);
});
window.addEventListener('keyup', (event) => keys.delete(event.code));
window.addEventListener('blur', () => {
  keys.clear();
  jumpQueued = false;
  orbiting = false;
  unlockPointer();
});

canvas.addEventListener('pointerdown', event => {
  lastCanvasPointer = event.pointerType;
});
canvas.addEventListener('click', () => {
  if (!thirdPerson && !lan.entering && lastCanvasPointer === 'mouse') lockPointer();
});
canvas.addEventListener('contextmenu', (event) => event.preventDefault());
canvas.addEventListener('mousedown', (event) => {
  if (thirdPerson && event.button === 2) {
    orbiting = true;
    lockPointer();
  }
});
document.addEventListener('mouseup', (event) => {
  if (thirdPerson && event.button === 2) {
    orbiting = false;
    unlockPointer();
  }
});
document.addEventListener('pointerlockchange', () => {
  // A quick right click can end before the browser grants pointer lock.
  if (thirdPerson && !orbiting) unlockPointer();
  showControls();
});
document.addEventListener('mousemove', (event) => {
  if (thirdPerson && !orbiting) return;
  if (!thirdPerson && document.pointerLockElement !== canvas) return;

  turn(event.movementX, event.movementY, SENSITIVITY);
});

const direction = new THREE.Vector3();
const eyes = new THREE.Vector3();
const view = new THREE.Vector3();
const target = new THREE.Vector3();
const step = new THREE.Vector3();
let previousTime = performance.now();
let cameraFraction = 1;
let coordinateText = '';
const DAY_LENGTH = 8 * 60 * 1000;

function updateDaylight(time: number) {
  const angle = (lan.worldTime(time) / DAY_LENGTH) * Math.PI * 2;
  const altitude = Math.cos(angle);
  const daylight = THREE.MathUtils.smoothstep(altitude, -0.18, 0.46);
  const horizon = 1 - THREE.MathUtils.smoothstep(Math.abs(altitude), 0, 0.29);
  twilight.copy(nightSky).lerp(daySky, daylight);
  sky.copy(twilight).lerp(sunsetSky, horizon * 0.82);
  fog.color.copy(sky);
  ambient.intensity = 0.68 + daylight * 1.32;
  sun.intensity = 0.13 + daylight * 1.87;
  sun.position.set(20 * Math.sin(angle), Math.max(0.3, altitude) * 25, 10);
  setTerrainLight(0.29 + daylight * 0.71);
}

function animate(time: number) {
  const delta = THREE.MathUtils.clamp((time - previousTime) / 1000, 0, 0.05);
  previousTime = time;

  const moveX = Number(keys.has('KeyD')) - Number(keys.has('KeyA')) + touch.x;
  const moveZ = Number(keys.has('KeyW')) - Number(keys.has('KeyS')) + touch.y;
  const sinYaw = Math.sin(yaw);
  const cosYaw = Math.cos(yaw);
  direction.set(cosYaw * moveX - sinYaw * moveZ, 0, -sinYaw * moveX - cosYaw * moveZ);
  const carYaw = cars.update(player, lan.settingsOpen ? 0 : direction.x, lan.settingsOpen ? 0 : direction.z, delta);
  const driving = carYaw !== null;
  if (driving) {
    verticalVelocity = 0;
    grounded = true;
  }
  player.visible = thirdPerson && !driving;
  const showCarAction = lan.carsAvailable && (driving || Boolean(cars.nearby(player.position)));
  carAction.hidden = !showCarAction;
  spawnCar.hidden = !lan.carsAvailable || driving;
  const actionText = driving ? 'Bajar del carro' : 'Subir al carro';
  if (carActionText.textContent !== actionText) carActionText.textContent = actionText;
  const { position } = player;
  if (!driving && direction.lengthSq() > 0) {
    direction.clampLength(0, 1);
    const running = touch.running || keys.has('ShiftLeft') || keys.has('ShiftRight');
    const distance = MOVE_SPEED * (running ? RUN_MULTIPLIER : 1) * waterSpeed(position.y, 0.46) * delta;
    step.copy(direction).multiplyScalar(distance);
    if (!hitsBuilding(position.x + step.x, position.z, 0.45)) position.x += step.x;
    if (!hitsBuilding(position.x, position.z + step.z, 0.45)) position.z += step.z;

    if (thirdPerson) {
      const angle = Math.atan2(-direction.x, -direction.z);
      const difference = Math.atan2(Math.sin(angle - player.rotation.y), Math.cos(angle - player.rotation.y));
      player.rotation.y += difference * Math.min(1, delta * ROTATION_SPEED);
    }
  }
  if (!thirdPerson && !driving) player.rotation.y = yaw;

  world.update(position.x, position.z);
  const floor = world.groundHeight(position.x, position.z);
  if (!driving && (jumpQueued || keys.has('Space')) && grounded) {
    position.y = Math.max(position.y, floor);
    verticalVelocity = JUMP_FORCE;
    grounded = false;
  }
  jumpQueued = false;

  // Follow gentle downhill slopes and let gravity take over on steeper drops.
  if (grounded && position.y - floor <= 9 * delta) {
    position.y = floor;
  } else {
    verticalVelocity += GRAVITY * delta;
    position.y += verticalVelocity * delta;
    grounded = position.y <= floor;
    if (grounded) {
      position.y = floor;
      verticalVelocity = 0;
    }
  }

  eyes.copy(position);
  eyes.y += driving ? 2.05 : 1.65;
  view.set(-sinYaw * Math.cos(pitch), Math.sin(pitch), -cosYaw * Math.cos(pitch));

  if (thirdPerson || driving) {
    target.copy(view).multiplyScalar(driving ? -9.5 : -CAMERA_DISTANCE);
    target.y += driving ? 3.2 : 2;
    let clearFraction = 1;
    for (let step = 1; step <= 20; step++) {
      const fraction = step / 20;
      const ground = world.groundHeight(eyes.x + target.x * fraction, eyes.z + target.z * fraction);
      if (eyes.y + target.y * fraction < ground + 0.24) {
        clearFraction = (step - 0.5) / 20;
        break;
      }
    }
    cameraFraction = Math.min(clearFraction, cameraFraction + delta * 2.5);
    camera.position.copy(eyes).addScaledVector(target, cameraFraction);
    camera.lookAt(eyes);
  } else {
    cameraFraction = 1;
    camera.position.copy(eyes);
    camera.lookAt(target.copy(eyes).add(view));
  }

  lan.update(time, delta);
  if (!lan.entering) {
    const text = `X ${Math.round(position.x)} · Y ${Math.round(position.y)} · Z ${Math.round(position.z)}`;
    if (text !== coordinateText) {
      coordinateText = text;
      coordinates.textContent = text;
      coordinates.hidden = false;
    }
  }
  updateDaylight(time);
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);
