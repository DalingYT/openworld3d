import { createJumpInput } from './jump-input';
import { createDrivingHud } from './driving-hud';
import { hitsHouse } from './life';
import { setupTextures } from './textures';
import { createGamepad } from './gamepad';
import { setupAudio, updateAudio, sfx } from './audio';
import * as THREE from 'three';
import { World, setTerrainLight, waterSpeed, zoneName } from './world';
import { addCity, hitsBuilding } from './city';
import { createArcade } from './arcade';
import { createCars } from './cars';
import { createLan } from './lan';
import { setupTouch } from './touch';
import './touch.css';

setupAudio();
setupTextures();
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

const zone = document.createElement('p');
zone.id = 'zone-name';
zone.hidden = true;
zone.setAttribute('role', 'status');
coordinates.after(zone);
let candidateZone = '', currentZone = '', zoneSince = 0;

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
const arcade = createArcade(scene, world);
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
}, cars, world);

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
let jumpsUsed = 0;
const drivingHud = createDrivingHud();
let jumpQueued = false;
const acceptJump = createJumpInput();
function requestJump(source: 'keyboard' | 'gamepad' | 'touch') {
  if (acceptJump(source)) jumpQueued = true;
}
const keys = new Set<string>();
let flyUp = false, flyDown = false, flyPulse = 0;
const flyControls = document.createElement('span'); flyControls.hidden = true;
for (const [label, up] of [['Volar ↑', true], ['Bajar ↓', false]] as const) {
  const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.style.touchAction = 'none';
  button.addEventListener('pointerdown', e => { e.preventDefault(); button.setPointerCapture(e.pointerId); if(up)flyUp=true;else flyDown=true; });
  for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>{if(up)flyUp=false;else flyDown=false;});
  flyControls.append(button);
}
document.querySelector('#car-controls')!.append(flyControls);
window.addEventListener('blur',()=>{flyUp=flyDown=false;});
const blockedAt = (x:number,z:number,radius:number) => (lan.flying && player.position.y > world.groundHeight(x,z)+18) ? false : hitsBuilding(x,z,radius) || hitsHouse(x,z,radius,false,player.position.x,player.position.z);
const cameraButton = document.querySelector<HTMLButtonElement>('#touch-camera')!;
const carAction = document.querySelector<HTMLButtonElement>('#car-action')!;
const carActionText = carAction.querySelector('b')!;
const spawnCar = document.querySelector<HTMLButtonElement>('#car-spawn')!;
const tiendini = document.createElement('button'); tiendini.type = 'button'; tiendini.textContent = 'Entrar a Gubo Tiendini'; tiendini.hidden = true;
document.querySelector('#car-controls')!.append(tiendini);
tiendini.addEventListener('click', () => { unlockPointer(); (document.querySelector('#hat-shop') as HTMLDialogElement).showModal(); });
let ridePending = false;
let lastCanvasPointer = 'mouse';

async function toggleRide() {
  if (ridePending || lan.entering || (lan.settingsOpen || arcade.open || gamepad.open) || !lan.carsAvailable) return;
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
  if (ridePending || (lan.settingsOpen || arcade.open || gamepad.open) || !lan.carsAvailable || cars.driving) return;
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
  jump: () => { if (!lan.entering) requestJump('touch'); },
  camera: () => toggleCamera(false)
});

const gamepad = createGamepad({
  jump: () => { requestJump('gamepad'); },
  camera: () => toggleCamera(false),
  ride: () => { void toggleRide(); }
});

window.addEventListener('keydown', (event) => {
  if (lan.entering || (lan.settingsOpen || arcade.open || gamepad.open)) return;
  if (event.target instanceof HTMLSelectElement) return;
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
    if (!event.repeat) requestJump('keyboard');
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
let footstepDistance = 0;
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

  gamepad.update(!lan.entering && !lan.settingsOpen && !arcade.open);
  if (!lan.entering && !lan.settingsOpen && !arcade.open && !gamepad.open) {
    turn(gamepad.input.lookX * delta, gamepad.input.lookY * delta, 2.1);
  }
  tiendini.hidden = lan.entering || cars.driving || lan.settingsOpen || arcade.open || gamepad.open || Math.hypot(player.position.x + 24, player.position.z + 51) > 4;
  arcade.update(player.position, !lan.entering && !cars.driving && !lan.settingsOpen, time);
  if (lan.settingsOpen || arcade.open || gamepad.open) { keys.clear(); jumpQueued = false; }
  const previousX = player.position.x, previousZ = player.position.z;
  const moveX = Number(keys.has('KeyD')) - Number(keys.has('KeyA')) + gamepad.input.x + ((lan.settingsOpen || arcade.open || gamepad.open) ? 0 : touch.x);
  const moveZ = Number(keys.has('KeyW')) - Number(keys.has('KeyS')) + gamepad.input.y + ((lan.settingsOpen || arcade.open || gamepad.open) ? 0 : touch.y);
  const sinYaw = Math.sin(yaw);
  const cosYaw = Math.cos(yaw);
  direction.set(cosYaw * moveX - sinYaw * moveZ, 0, -sinYaw * moveX - cosYaw * moveZ);
  if (!(lan.settingsOpen || arcade.open || gamepad.open) && !lan.entering && jumpQueued && cars.driving && !lan.flying) cars.jump();
  flyControls.hidden = !lan.flying || lan.entering;
  if (lan.flying && jumpQueued) flyPulse = 0.25;
  flyPulse = Math.max(0, flyPulse - delta);
  const verticalInput = (lan.settingsOpen || arcade.open || gamepad.open) ? 0 : Number(flyUp || flyPulse > 0 || keys.has('Space')) - Number(flyDown || keys.has('ControlLeft') || keys.has('ControlRight'));
  const boost = !lan.entering && !lan.settingsOpen && !arcade.open && !gamepad.open && (drivingHud.boost || gamepad.input.running || keys.has('ShiftLeft') || keys.has('ShiftRight'));
  const carYaw = cars.update(player, (lan.settingsOpen || arcade.open || gamepad.open) ? 0 : moveX, (lan.settingsOpen || arcade.open || gamepad.open) ? 0 : moveZ, delta, lan.flying, verticalInput, boost, drivingHud.speedMode);
  drivingHud.update(time, cars.driving, cars.nitro, cars.speed);
  const driving = carYaw !== null;
  if (driving) {
    verticalVelocity = 0;
    grounded = true;
    jumpsUsed = 0;
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
    const running = touch.running || gamepad.input.running || keys.has('ShiftLeft') || keys.has('ShiftRight');
    const distance = (lan.flying ? 10 : MOVE_SPEED) * (running ? RUN_MULTIPLIER : 1) * waterSpeed(position.y, 0.46) * delta;
    step.copy(direction).multiplyScalar(distance);
    if (!blockedAt(position.x + step.x, position.z, 0.45)) position.x += step.x;
    if (!blockedAt(position.x, position.z + step.z, 0.45)) position.z += step.z;

    if (thirdPerson) {
      const angle = Math.atan2(-direction.x, -direction.z);
      const difference = Math.atan2(Math.sin(angle - player.rotation.y), Math.cos(angle - player.rotation.y));
      player.rotation.y += difference * Math.min(1, delta * ROTATION_SPEED);
    }
  }
  if (!thirdPerson && !driving) player.rotation.y = yaw;

  world.update(position.x, position.z);
  const floor = world.groundHeight(position.x, position.z);
  if (!driving && !lan.flying && jumpQueued && (grounded || jumpsUsed < 2)) {
    position.y = Math.max(position.y, floor);
    jumpsUsed = grounded ? 1 : 2;
    verticalVelocity = JUMP_FORCE;
    grounded = false;
    sfx('jump');
  }
  jumpQueued = false;

  if (!driving && lan.flying) {
    position.y = THREE.MathUtils.clamp(position.y + verticalInput * 8 * delta, floor, Math.max(floor, 200));
    verticalVelocity = 0; grounded = false;
  }
  // Follow gentle downhill slopes and let gravity take over on steeper drops.
  if (!driving && !lan.flying && grounded && position.y - floor <= 9 * delta) {
    position.y = floor;
  } else if (!driving && !lan.flying) {
    verticalVelocity += GRAVITY * delta;
    position.y += verticalVelocity * delta;
    const landed = !grounded && position.y <= floor && verticalVelocity < -2;
    grounded = position.y <= floor;
    if (landed) sfx(floor < 0 ? 'splash' : 'land');
    if (grounded) {
      jumpsUsed = 0;
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
    const nextZone = zoneName(position.x, position.z, floor);
    if (nextZone !== candidateZone) { candidateZone = nextZone; zoneSince = time; }
    if (nextZone !== currentZone && time - zoneSince > 1000) {
      currentZone = nextZone;
      zone.textContent = currentZone;
      zone.hidden = false;
    }
    const text = `X ${Math.round(position.x)} · Y ${Math.round(position.y)} · Z ${Math.round(position.z)}`;
    if (text !== coordinateText) {
      coordinateText = text;
      coordinates.textContent = text;
      coordinates.hidden = false;
    }
  }
  const moved = Math.hypot(position.x - previousX, position.z - previousZ);
  if (!driving && !lan.flying && grounded && !lan.entering) {
    footstepDistance += moved;
    if (footstepDistance > 1.7) { footstepDistance = 0; sfx(floor < 0 ? 'splash' : 'step'); }
  } else footstepDistance = 0;
  updateAudio(!lan.entering, driving, delta > 0 ? moved / delta : 0);
  updateDaylight(time);
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);
