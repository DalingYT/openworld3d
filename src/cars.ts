import * as THREE from 'three';
import { hitsBuilding } from './city';
import { World, waterSpeed } from './world';
import { makeNameTag, disposeNameTag } from './name-tag';

export type CarState = {
  id: string; owner: string; name: string; color: number;
  x: number; y?: number; z: number; yaw: number; driver: string | null;
  impact: number; vx: number; vz: number;
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

function makeCar(color: number) {
  let body = bodyMaterials.get(color);
  if (!body) {
    body = new THREE.MeshLambertMaterial({ color });
    bodyMaterials.set(color, body);
  }
  const car = new THREE.Group();
  function piece(material: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number) {
    const mesh = new THREE.Mesh(box, material);
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
      car.add(tire);
    }
  }
  return car;
}

export function createCars(scene: THREE.Scene, world: World) {
  function alignToTerrain(mesh: THREE.Group, yaw: number, level = false) {
    const { x, z } = mesh.position;
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    const front = world.groundHeight(x - sin * 1.2, z - cos * 1.2);
    const rear = world.groundHeight(x + sin * 1.2, z + cos * 1.2);
    const right = world.groundHeight(x + cos, z - sin);
    const left = world.groundHeight(x - cos, z + sin);
    const pitch = Math.atan2(front - rear, 2.4);
    const roll = Math.atan2(right - left, 2);
    mesh.rotation.set(level ? 0 : pitch, yaw, level ? 0 : roll, 'YXZ');
    return Math.abs(roll) > 0.85 || Math.abs(pitch) > 1.05;
  }

  const cars = new Map<string, {
    mesh: THREE.Group; label: THREE.Sprite; state: CarState; lift: number; targetLift: number;
  }>();
  let driverId = '';
  let speed = 0;
  let lastDriven: string | null = null;
  let verticalSpeed: number | null = null;
  let blockedTime = 0;
  let recoveryUsed = false;
  let bumpX = 0;
  let bumpZ = 0;

  function driven() {
    if (!driverId) return;
    for (const car of cars.values()) {
      if (car.state.driver === driverId) return car;
    }
  }

  function blocked(x: number, z: number, yaw: number) {
    const fx = Math.sin(yaw) * 1.2;
    const fz = Math.cos(yaw) * 1.2;
    return hitsBuilding(x + fx, z + fz, 1.15) || hitsBuilding(x - fx, z - fz, 1.15);
  }

  return {
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
        if (car.state.name !== state.name) {
          disposeNameTag(car.label);
          car.label = makeNameTag(state.name);
          car.mesh.add(car.label);
        }
        const tookWheel = state.driver === driverId && car.state.driver !== driverId;
        const hit = state.driver === driverId && car.state.impact !== state.impact;
        if (tookWheel || hit) {
          car.mesh.position.set(state.x, world.groundHeight(state.x, state.z), state.z);
          alignToTerrain(car.mesh, state.yaw);
          speed = 0;
          bumpX = hit ? state.vx : 0;
          bumpZ = hit ? state.vz : 0;
        }
        car.state = state;
        car.targetLift = state.y === undefined ? 0
          : THREE.MathUtils.clamp(state.y - world.groundHeight(state.x, state.z), 0, 2.3);
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
    update(player: THREE.Group, moveX: number, moveZ: number, delta: number) {
      const own = driven();
      const mix = 1 - Math.exp(-delta * 13);
      for (const car of cars.values()) {
        car.label.visible = car.mesh.position.distanceToSquared(player.position) < 55 ** 2;
        if (car === own) continue;
        const { state, mesh } = car;
        if (mesh.position.x === state.x && mesh.position.z === state.z &&
            car.lift === car.targetLift && mesh.rotation.y === state.yaw) continue;
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
        alignToTerrain(mesh, yaw, car.lift > 0.2);
      }

      if (!own) {
        if (lastDriven) {
          speed = 0;
          bumpX = 0;
          bumpZ = 0;
          verticalSpeed = null;
          blockedTime = 0;
          recoveryUsed = false;
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
      const input = Math.min(1, Math.hypot(moveX, moveZ));
      const direction = input ? Math.atan2(-moveX, -moveZ) - rotation.y : 0;
      const angle = Math.atan2(Math.sin(direction), Math.cos(direction));
      const turn = THREE.MathUtils.clamp(angle, -5.5 * delta, 5.5 * delta);
      const yaw = rotation.y + turn;
      const floor = world.groundHeight(position.x, position.z);
      const ahead = world.groundHeight(position.x - Math.sin(yaw) * 2, position.z - Math.cos(yaw) * 2);
      const grade = Math.abs(ahead - floor) * 0.5;
      const traction = 1 - 0.5 * THREE.MathUtils.smoothstep(grade, 0.45, 1.35);
      const alignment = Math.max(0, Math.cos(angle - turn));
      const goal = 24 * input * waterSpeed(floor, 0.28) * traction * alignment;
      speed = verticalSpeed === null ? THREE.MathUtils.lerp(speed, goal, 1 - Math.exp(-delta * 4.8)) : 0;
      if (Math.abs(angle) > Math.PI / 2) speed = Math.min(speed, 1);
      const x = position.x + (bumpX - Math.sin(yaw) * speed) * delta;
      const z = position.z + (bumpZ - Math.cos(yaw) * speed) * delta;
      const collision = (x !== position.x || z !== position.z) && blocked(x, z, yaw);
      if (collision) {
        speed = 0;
        bumpX = 0;
        bumpZ = 0;
        blockedTime = input ? blockedTime + delta : 0;
      } else {
        position.x = x;
        position.z = z;
        blockedTime = 0;
      }
      const damping = Math.exp(-delta * 4.5);
      bumpX *= damping;
      bumpZ *= damping;
      const ground = world.groundHeight(position.x, position.z);
      if (verticalSpeed === null) position.y = ground;
      const tipped = alignToTerrain(mesh, yaw, verticalSpeed !== null);
      if (!recoveryUsed && (tipped || blockedTime >= 0.8)) {
        recoveryUsed = true;
        verticalSpeed = RECOVERY_SPEED;
        speed = 0;
      }
      if (verticalSpeed !== null) {
        position.y += verticalSpeed * delta - 0.5 * RECOVERY_GRAVITY * delta * delta;
        verticalSpeed -= RECOVERY_GRAVITY * delta;
        if (position.y <= ground && verticalSpeed <= 0) {
          position.y = ground;
          verticalSpeed = null;
        }
        alignToTerrain(mesh, yaw, verticalSpeed !== null);
      } else if (!collision && !tipped) {
        recoveryUsed = false;
      }
      player.position.copy(position);
      player.rotation.y = rotation.y;
      return rotation.y;
    }
  };
}

export type Cars = ReturnType<typeof createCars>;
