import * as THREE from 'three';
import models from '../shared/cars.json';
import { hitsBuilding } from './city';
import { World, waterSpeed } from './world';

export type CarState = { id: string; x: number; z: number; yaw: number; driver: string | null };

const box = new THREE.BoxGeometry(1, 1, 1);
const wheel = new THREE.CylinderGeometry(0.42, 0.42, 0.34, 8);
wheel.rotateZ(Math.PI / 2);
const rubber = new THREE.MeshLambertMaterial({ color: 0x22242a });
const glass = new THREE.MeshLambertMaterial({ color: 0x80aabb });
const headlight = new THREE.MeshBasicMaterial({ color: 0xffecaa });
const taillight = new THREE.MeshBasicMaterial({ color: 0xd32835 });

function makeCar(color: number) {
  const body = new THREE.MeshLambertMaterial({ color });
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
  const cars = new Map(models.map(model => {
    const mesh = makeCar(model.color);
    mesh.position.set(model.x, world.groundHeight(model.x, model.z), model.z);
    mesh.rotation.y = model.yaw;
    scene.add(mesh);
    return [model.id, { mesh, state: { ...model, driver: null } as CarState }];
  }));
  let driverId = '';
  let speed = 0;
  let lastDriven: string | null = null;

  function driven() {
    if (!driverId) return;
    for (const car of cars.values()) {
      if (car.state.driver === driverId) return car;
    }
  }

  function blocked(x: number, z: number, yaw: number, id: string) {
    const fx = Math.sin(yaw) * 1.2;
    const fz = Math.cos(yaw) * 1.2;
    if (hitsBuilding(x + fx, z + fz, 1.15) || hitsBuilding(x - fx, z - fz, 1.15)) return true;
    for (const [key, car] of cars) {
      if (key !== id && Math.hypot(x - car.mesh.position.x, z - car.mesh.position.z) < 3.1) return true;
    }
    return false;
  }

  return {
    get driving() { return Boolean(driven()); },
    get drivingId() { return driven()?.state.id ?? null; },
    setDriver(id: string) { driverId = id; },
    receive(states: CarState[]) {
      for (const state of states) {
        const car = cars.get(state.id);
        if (!car) continue;
        if (state.driver === driverId && car.state.driver !== driverId) {
          car.mesh.position.set(state.x, world.groundHeight(state.x, state.z), state.z);
          car.mesh.rotation.y = state.yaw;
        }
        car.state = state;
      }
    },
    nearby(position: THREE.Vector3) {
      let closest: string | null = null;
      let distance = 4.5;
      for (const [id, { mesh, state }] of cars) {
        if (state.driver) continue;
        const d = mesh.position.distanceTo(position);
        if (d < distance) {
          closest = id;
          distance = d;
        }
      }
      return closest;
    },
    update(player: THREE.Group, throttle: number, steer: number, delta: number) {
      const own = driven();
      const mix = 1 - Math.exp(-delta * 13);
      for (const car of cars.values()) {
        if (car === own) continue;
        const { state, mesh } = car;
        if (mesh.position.x !== state.x || mesh.position.z !== state.z) {
          mesh.position.x = Math.abs(mesh.position.x - state.x) < 0.01 ? state.x
            : THREE.MathUtils.lerp(mesh.position.x, state.x, mix);
          mesh.position.z = Math.abs(mesh.position.z - state.z) < 0.01 ? state.z
            : THREE.MathUtils.lerp(mesh.position.z, state.z, mix);
          mesh.position.y = world.groundHeight(mesh.position.x, mesh.position.z);
        }
        const angle = state.yaw - mesh.rotation.y;
        mesh.rotation.y += Math.atan2(Math.sin(angle), Math.cos(angle)) * mix;
      }

      if (!own) {
        if (lastDriven) {
          speed = 0;
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
      const water = waterSpeed(position.y, 0.28);
      const goal = THREE.MathUtils.clamp(throttle, -1, 1) * (throttle < 0 ? 8 : 24) * water;
      const turning = 1.9 * Math.min(1, Math.abs(speed) / 4);
      const yaw = rotation.y - THREE.MathUtils.clamp(steer, -1, 1) * turning * Math.sign(speed) * delta;
      speed = THREE.MathUtils.lerp(speed, goal, 1 - Math.exp(-delta * 4.8));
      const x = position.x - Math.sin(yaw) * speed * delta;
      const z = position.z - Math.cos(yaw) * speed * delta;
      const floor = world.groundHeight(x, z);
      if (!blocked(x, z, yaw, state.id) && Math.abs(floor - position.y) <= 0.4 + Math.abs(speed) * delta * 0.9) {
        position.set(x, floor, z);
        rotation.y = yaw;
      } else {
        speed = 0;
      }
      player.position.copy(position);
      player.rotation.y = rotation.y;
      return rotation.y;
    }
  };
}

export type Cars = ReturnType<typeof createCars>;
