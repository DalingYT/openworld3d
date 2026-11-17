import { sfx } from './audio';
import * as THREE from 'three';
import { hitsBuilding } from './city';
import { World, waterSpeed } from './world';
import { makeNameTag, disposeNameTag } from './name-tag';

export type CarState = {
  id: string; owner: string; name: string; color: number;
  x: number; y?: number; z: number; yaw: number; driver: string | null;
  impact: number; vx: number; vz: number; pitch?: number; roll?: number;
};

const RECOVERY_GRAVITY = 18;
const RECOVERY_SPEED = 9;

const box = new THREE.BoxGeometry(1, 1, 1);
const wheel = new THREE.CylinderGeometry(0.42, 0.42, 0.34, 8);
wheel.rotateZ(Math.PI / 2);
const rubber = new THREE.MeshLambertMaterial({ color: 0x22242a });
const glass = new THREE.MeshLambertMaterial({ color: 0x80aabb });
const headlight = new THREE.MeshBasicMaterial({ color: 0xffecaa });
const taillight = new THREE.MeshBasicMaterial({ color: 0xd32835 });
const bodyMaterials = new Map<number, THREE.MeshLambertMaterial>();

function bodyMaterial(color: number) {
  let body = bodyMaterials.get(color);
  if (!body) {
    body = new THREE.MeshLambertMaterial({ color });
    bodyMaterials.set(color, body);
  }
  return body;
}

function makeCar(color: number) {
  const body = bodyMaterial(color);
  const car = new THREE.Group();
  function piece(material: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number) {
    const mesh = new THREE.Mesh(box, material);
    if (material === body) mesh.name = 'paint';
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    car.add(mesh);
  }
  piece(body, 0, 0.66, 0, 2.12, 0.63, 4.02);
  piece(glass, 0, 1.12, 0.27, 1.76, 0.47, 1.9);
  piece(body, 0, 1.39, 0.27, 1.84, 0.13, 2.03);
  for (const side of [-1, 1]) {
    piece(headlight, 0.72 * side, 0.72, -2.025, 0.44, 0.2, 0.06);
    piece(taillight, 0.72 * side, 0.72, 2.025, 0.44, 0.2, 0.06);
    for (const axle of [-1.2, 1.2]) {
      const tire = new THREE.Mesh(wheel, rubber);
      tire.position.set(side * 1.03, 0.41, axle);
      if (axle < 0) tire.name = 'front-wheel';
      car.add(tire);
    }
  }
  return car;
}

export function createCars(scene: THREE.Scene, world: World) {
  function alignToTerrain(mesh: THREE.Group, yaw: number, level = false, delta = 1) {
    const { x, z } = mesh.position;
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    const front = world.groundHeight(x - sin * 1.2, z - cos * 1.2);
    const rear = world.groundHeight(x + sin * 1.2, z + cos * 1.2);
    const right = world.groundHeight(x + cos, z - sin);
    const left = world.groundHeight(x - cos, z + sin);
    const pitch = Math.atan2(front - rear, 2.4);
    const roll = Math.atan2(right - left, 2);
    const blend = 1 - Math.exp(-delta * 9);
    mesh.rotation.set(THREE.MathUtils.lerp(mesh.rotation.x, level ? 0 : pitch, blend), yaw,
      THREE.MathUtils.lerp(mesh.rotation.z, level ? 0 : roll, blend), 'YXZ');
    return Math.abs(roll) > 1.25 || Math.abs(pitch) > 1.4;
  }

  const cars = new Map<string, {
    mesh: THREE.Group; label: THREE.Sprite; state: CarState; lift: number; targetLift: number;
  }>();
  let driverId = '';
  let speed = 0;
  let lastDriven: string | null = null;
  let verticalSpeed: number | null = null;
  let bumpX = 0;
  let bumpZ = 0;
  let steeringAngle = 0;
  let pitchRate = 0, rollRate = 0;
  let groundVelocity = 0;

  function driven() {
    if (!driverId) return;
    for (const car of cars.values()) {
      if (car.state.driver === driverId) return car;
    }
  }

  const corner = new THREE.Vector3();
  function supportHeight(mesh: THREE.Group) {
    let height = world.groundHeight(mesh.position.x, mesh.position.z);
    for (const x of [-1.06, 1.06]) for (const y of [0.1, 1.5]) for (const z of [-2.01, 2.01]) {
      corner.set(x, y, z).applyEuler(mesh.rotation);
      height = Math.max(height, world.groundHeight(mesh.position.x + corner.x, mesh.position.z + corner.z) - corner.y);
    }
    return height;
  }

  function blocked(x: number, z: number, yaw: number) {
    const fx = Math.sin(yaw) * 1.2;
    const fz = Math.cos(yaw) * 1.2;
    return hitsBuilding(x + fx, z + fz, 1.15) || hitsBuilding(x - fx, z - fz, 1.15);
  }

  return {
    jump() {
      if (driven() && verticalSpeed === null) { verticalSpeed = RECOVERY_SPEED; sfx('jump'); }
    },
    get attitude() { const car = driven(); return car ? { pitch: car.mesh.rotation.x, roll: car.mesh.rotation.z } : {}; },
    get driving() { return Boolean(driven()); },
    get drivingId() { return driven()?.state.id ?? null; },
    get impactRevision() { return driven()?.state.impact; },
    setDriver(id: string) {
      driverId = id;
    },
    receive(states: CarState[]) {
      const active = new Set(states.map(state => state.id));
      for (const [id, car] of cars) {
        if (active.has(id)) continue;
        disposeNameTag(car.label);
        car.mesh.removeFromParent();
        cars.delete(id);
      }
      for (const state of states) {
        let car = cars.get(state.id);
        if (!car) {
          const mesh = makeCar(state.color);
          const label = makeNameTag(state.name);
          mesh.position.set(state.x, world.groundHeight(state.x, state.z), state.z);
          alignToTerrain(mesh, state.yaw);
          mesh.add(label);
          scene.add(mesh);
          car = { mesh, label, state, lift: 0, targetLift: 0 };
          cars.set(state.id, car);
        }
        if (car.state.color !== state.color) {
          for (const part of car.mesh.children) {
            if (part.name === 'paint') (part as THREE.Mesh).material = bodyMaterial(state.color);
          }
        }
        if (car.state.name !== state.name) {
          disposeNameTag(car.label);
          car.label = makeNameTag(state.name);
          car.mesh.add(car.label);
        }
        const tookWheel = state.driver === driverId && car.state.driver !== driverId;
        const hit = state.driver === driverId && car.state.impact !== state.impact;
        if (hit) sfx('crash');
        if (tookWheel || hit) {
          car.mesh.position.set(state.x, state.y ?? world.groundHeight(state.x, state.z), state.z);
          alignToTerrain(car.mesh, state.yaw);
          const forwardX = -Math.sin(state.yaw);
          const forwardZ = -Math.cos(state.yaw);
          speed = state.vx * forwardX + state.vz * forwardZ;
          bumpX = state.vx - forwardX * speed;
          bumpZ = state.vz - forwardZ * speed;
        }
        car.state = state;
        car.targetLift = state.y === undefined ? 0
          : THREE.MathUtils.clamp(state.y - world.groundHeight(state.x, state.z), 0, 80);
      }
    },
    nearby(position: THREE.Vector3) {
      let closest: string | null = null;
      let distance = 4.5;
      for (const [id, { mesh, state }] of cars) {
        if (state.driver || state.owner !== driverId) continue;
        const d = mesh.position.distanceTo(position);
        if (d < distance) {
          closest = id;
          distance = d;
        }
      }
      return closest;
    },
    update(player: THREE.Group, steering: number, throttle: number, delta: number) {
      const own = driven();
      const mix = 1 - Math.exp(-delta * 13);
      for (const car of cars.values()) {
        car.label.visible = car.mesh.position.distanceToSquared(player.position) < 55 ** 2;
        if (car === own) continue;
        const { state, mesh } = car;
        if (mesh.position.x === state.x && mesh.position.z === state.z &&
            car.lift === car.targetLift && mesh.rotation.y === state.yaw && state.pitch === undefined && state.roll === undefined) continue;
        const approach = (from: number, to: number) =>
          Math.abs(from - to) < 0.01 ? to : THREE.MathUtils.lerp(from, to, mix);
        mesh.position.x = approach(mesh.position.x, state.x);
        mesh.position.z = approach(mesh.position.z, state.z);
        const floor = world.groundHeight(mesh.position.x, mesh.position.z);
        car.lift = approach(car.lift, car.targetLift);
        mesh.position.y = floor + car.lift;
        const angle = state.yaw - mesh.rotation.y;
        const shortest = Math.atan2(Math.sin(angle), Math.cos(angle));
        const yaw = Math.abs(shortest) < 0.01 ? state.yaw : mesh.rotation.y + shortest * mix;
        if (state.pitch !== undefined && state.roll !== undefined) {
          const angleTo = (from: number, to: number) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * mix;
          mesh.rotation.set(angleTo(mesh.rotation.x, state.pitch), yaw, angleTo(mesh.rotation.z, state.roll), 'YXZ');
        } else alignToTerrain(mesh, yaw, car.lift > 0.2, delta);
      }

      if (!own) {
        if (lastDriven) {
          speed = 0;
          bumpX = 0;
          bumpZ = 0;
          verticalSpeed = null;
          groundVelocity = 0;
          steeringAngle = 0;
          pitchRate = rollRate = 0;
          lastDriven = null;
          const side = player.rotation.y + Math.PI / 2;
          for (const sign of [1, -1]) {
            const x = player.position.x + Math.sin(side) * 2.5 * sign;
            const z = player.position.z + Math.cos(side) * 2.5 * sign;
            if (!hitsBuilding(x, z, 0.45)) {
              player.position.set(x, world.groundHeight(x, z), z);
              break;
            }
          }
        }
        return null;
      }

      const { mesh, state } = own;
      lastDriven = state.id;
      const { position, rotation } = mesh;
      const pedal = THREE.MathUtils.clamp(throttle, -1, 1);
      const steer = THREE.MathUtils.clamp(steering, -1, 1);
      const oldYaw = rotation.y;
      const oldVX = bumpX - Math.sin(oldYaw) * speed;
      const oldVZ = bumpZ - Math.cos(oldYaw) * speed;
      steeringAngle = THREE.MathUtils.lerp(steeringAngle, steer * 0.48, 1 - Math.exp(-delta * 7));
      const turning = THREE.MathUtils.clamp(speed * Math.tan(steeringAngle) / 2.4, -1.7, 1.7);
      const yaw = oldYaw - (verticalSpeed === null ? turning : 0) * delta;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      const rx = Math.cos(yaw), rz = -Math.sin(yaw);
      // Carry world momentum through a turn; tires gradually remove sideways slip.
      speed = oldVX * fx + oldVZ * fz;
      const sideways = oldVX * rx + oldVZ * rz;
      const grip = THREE.MathUtils.lerp(9, 2.2, THREE.MathUtils.smoothstep(Math.abs(speed * steeringAngle), 3, 10));
      const lateral = sideways * Math.exp(-delta * (verticalSpeed === null ? grip : 0));
      bumpX = lateral * rx;
      bumpZ = lateral * rz;
      const floor = world.groundHeight(position.x, position.z);
      const ahead = world.groundHeight(position.x + fx * 2, position.z + fz * 2);
      const slope = (ahead - floor) / 2;
      if (verticalSpeed === null) {
        const wet = waterSpeed(floor, 0.28);
        const limit = (pedal < 0 ? 9 : 24) * wet;
        const braking = pedal !== 0 && pedal * speed < -0.2;
        if (braking) {
          const amount = 22 * Math.abs(pedal) * delta;
          speed = Math.sign(speed) * Math.max(0, Math.abs(speed) - amount);
        } else if (pedal) {
          speed += pedal * 8.5 * delta;
        }
        const resistance = (1.1 + 0.012 * speed * speed + (1 - wet) * 12) * delta;
        speed = Math.sign(speed) * Math.max(0, Math.abs(speed) - resistance);
        speed -= 5 * slope / Math.hypot(1, slope) * delta;
        // Soft speed governor retains impacts and downhill momentum.
        if (Math.abs(speed) > limit) speed *= Math.exp(-delta * 1.5);
      }
      for (const part of mesh.children) {
        if (part.name === 'front-wheel') {
          part.rotation.y = THREE.MathUtils.lerp(part.rotation.y, -steeringAngle, 1 - Math.exp(-delta * 14));
        }
      }
      const x = position.x + (bumpX - Math.sin(yaw) * speed) * delta;
      const z = position.z + (bumpZ - Math.cos(yaw) * speed) * delta;
      const collision = (x !== position.x || z !== position.z) && blocked(x, z, yaw);
      if (collision) {
        if (Math.abs(speed) > 2) sfx('crash');
        speed = 0;
        bumpX = 0;
        bumpZ = 0;
      } else {
        position.x = x;
        position.z = z;
      }
      const ground = world.groundHeight(position.x, position.z);
      if (verticalSpeed === null) {
        const projected = floor + groundVelocity * delta;
        if (!collision && projected - ground > 0.18 && Math.abs(speed) > 2) {
          verticalSpeed = Math.max(-12, Math.min(12, groundVelocity));
        } else {
          groundVelocity = delta > 0 ? (ground - floor) / delta : 0;
          position.y = ground;
        }
      }
      if (verticalSpeed === null) {
        const oldPitch = rotation.x, oldRoll = rotation.z;
        alignToTerrain(mesh, yaw, false, delta * 0.55);
        pitchRate = delta > 0 ? THREE.MathUtils.clamp((rotation.x - oldPitch) / delta, -0.8, 0.8) : 0;
        rollRate = delta > 0 ? THREE.MathUtils.clamp((rotation.z - oldRoll) / delta, -0.6, 0.6) : 0;
      }
      if (verticalSpeed !== null) {
        // The body follows the flight arc gently, retaining the slope's angular momentum.
        const flightPitch = THREE.MathUtils.clamp(Math.atan2(verticalSpeed, Math.max(8, Math.hypot(speed, bumpX, bumpZ))), -0.5, 0.5);
        const pitchError = Math.atan2(Math.sin(flightPitch - rotation.x), Math.cos(flightPitch - rotation.x));
        pitchRate = THREE.MathUtils.clamp((pitchRate + pitchError * 3 * delta) * Math.exp(-delta * 1.8), -1, 1);
        rollRate *= Math.exp(-delta * 1.4);
        rotation.set(rotation.x + pitchRate * delta, yaw, rotation.z + rollRate * delta, 'YXZ');
        position.y += verticalSpeed * delta - 0.5 * RECOVERY_GRAVITY * delta * delta;
        verticalSpeed -= RECOVERY_GRAVITY * delta;
        // Rising terrain can meet the car before the upward jump ends.
        const contactHeight = supportHeight(mesh);
        if (position.y <= contactHeight) {
          sfx(ground < 0 ? 'splash' : 'land');
          position.y = contactHeight;
          verticalSpeed = null;
          groundVelocity = 0;
          pitchRate = rollRate = 0;
          rotation.x = Math.atan2(Math.sin(rotation.x), Math.cos(rotation.x));
          rotation.z = Math.atan2(Math.sin(rotation.z), Math.cos(rotation.z));
          speed *= 0.85;
        }
        if (verticalSpeed === null) alignToTerrain(mesh, yaw, false, delta);
      }
      if (verticalSpeed === null) position.y = Math.max(position.y, supportHeight(mesh));
      player.position.copy(position);
      player.rotation.y = rotation.y;
      return rotation.y;
    }
  };
}

export type Cars = ReturnType<typeof createCars>;
