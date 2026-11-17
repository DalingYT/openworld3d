import { hitsHouse } from './life';
import { sfx } from './audio';
import * as THREE from 'three';
import { hitsBuilding } from './city';
import { World, waterSpeed } from './world';
import { makeNameTag, disposeNameTag } from './name-tag';

export type CarState = {
  kind?: 'car' | 'taxi' | 'boat' | 'boat4'; passengers?: (string | null)[];
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
const glass = new THREE.MeshLambertMaterial({ color: 0x80aabb, transparent:true, opacity:.28, depthWrite:false });
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

function makeCar(color: number, taxi = false) {
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
  piece(glass,0,1.48,-.72,1.76,.85,.04);
  piece(glass,0,1.48,1.22,1.76,.85,.04);
  piece(glass,-.88,1.48,.27,.04,.85,1.9);
  piece(glass,.88,1.48,.27,.04,.85,1.9);
  piece(body,0,1.95,.27,1.84,.13,2.03);
  piece(rubber,0,1.04,-.62,1.7,.16,.36);
  for(const x of [-.46,.46])for(const z of [.15,1])piece(rubber,x,1.12,z,.62,.55,.18);
  const steeringWheel=new THREE.Mesh(new THREE.TorusGeometry(.19,.035,6,12),rubber);
  steeringWheel.position.set(-.46,1.25,-.48);steeringWheel.rotation.x=-.35;car.add(steeringWheel);
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
  if (taxi) {
    piece(headlight, 0, 2.18, 0.27, 1.1, 0.35, 0.45);
    const sign = makeNameTag('TAXI'); sign.position.set(0, 2.6, 0.27); sign.scale.set(1.5, 0.3, 1); car.add(sign); car.userData.taxiSign = sign;
    for (const side of [-1,1]) piece(rubber,side*1.065,.76,0,.03,.15,3.5);
  }
  return car;
}

function makeBoat(color: number) {
  const boat = new THREE.Group();
  for (const [x,y,z,w,h,d,mat] of [
    [0,.12,0,2.1,.5,4,bodyMaterial(color)],
    [-1,.55,0,.18,.65,4,bodyMaterial(color)], [1,.55,0,.18,.65,4,bodyMaterial(color)],
    [0,.5,-1.85,2,.6,.3,bodyMaterial(color)], [0,.5,1.85,2,.6,.3,bodyMaterial(color)],
    [0,.45,.7,1.6,.4,.5,rubber], [0,.9,-.4,1.5,.65,.1,glass]
  ] as const) { const mesh = new THREE.Mesh(box,mat); mesh.position.set(x,y,z); mesh.scale.set(w,h,d); if(mat===bodyMaterial(color))mesh.name='paint'; boat.add(mesh); }
  return boat;
}

export function createCars(scene: THREE.Scene, world: World) {
  function waterClear(x: number,z: number,yaw: number) {
    for(const side of [-1,1]) for(const end of [-2,0,2]) {
      const px=x+side*Math.cos(yaw)+end*Math.sin(yaw), pz=z-side*Math.sin(yaw)+end*Math.cos(yaw);
      if(world.groundHeight(px,pz)>-.3)return false;
    }
    return true;
  }

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
  let wasFlying = false;
  let activeMode = 1;
  let jumpsUsed = 0, nitro = 1, nitroExhausted = false;
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

  function ridden() {
    return [...cars.values()].find(c => c.state.driver === driverId || c.state.passengers?.includes(driverId));
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
    return hitsHouse(x + fx,z + fz,1.15,true) || hitsHouse(x - fx,z - fz,1.15,true) || hitsBuilding(x + fx, z + fz, 1.15) || hitsBuilding(x - fx, z - fz, 1.15);
  }

  return {
    boatSpawn(position: THREE.Vector3, yaw: number) {
      for(const radius of [5.75,8,10]) for(let i=0;i<16;i++) {
        const angle=yaw+i*Math.PI/8, x=position.x-Math.sin(angle)*radius, z=position.z-Math.cos(angle)*radius;
        if(waterClear(x,z,yaw))return {x,z};
      }
      return null;
    },
    get speedMode() { return activeMode; },
    setFirstPerson(enabled: boolean) {
      const current = ridden();
      for(const car of cars.values()) { car.mesh.visible=true; if(enabled && car===current)car.label.visible=false; }
    },
    firstPersonPosition(out: THREE.Vector3) {
      const car=ridden();if(!car)return false;
      const seat=car.state.driver===driverId ? 0 : 1+(car.state.passengers?.indexOf(driverId) ?? 0);
      const boat=['boat','boat4'].includes(car.state.kind ?? '');
      out.set(seat%2===0?-.46:.46,boat?1.45:1.55,seat<2?-.15:.75).applyEuler(car.mesh.rotation).add(car.mesh.position);
      return true;
    },
    jump() {
      if (!driven() || ['boat','boat4'].includes(driven()?.state.kind ?? '') || wasFlying || jumpsUsed >= 2) return;
      jumpsUsed = verticalSpeed === null ? 1 : 2;
      verticalSpeed = RECOVERY_SPEED; sfx('jump');
    },
    get attitude() { const car = driven(); return car ? { pitch: car.mesh.rotation.x, roll: car.mesh.rotation.z } : {}; },
    get nitro() { return nitro; },
    get speed() { return Math.abs(speed); },
    get driving() { return Boolean(driven()); },
    get riding() { return Boolean(ridden()); },
    get drivingId() { return ridden()?.state.id ?? null; },
    get impactRevision() { return ridden()?.state.impact; },
    setDriver(id: string) {
      driverId = id;
    },
    receive(states: CarState[]) {
      const active = new Set(states.map(state => state.id));
      for (const [id, car] of cars) {
        if (active.has(id)) continue;
        disposeNameTag(car.label);
        if (car.mesh.userData.taxiSign) disposeNameTag(car.mesh.userData.taxiSign);
        car.mesh.removeFromParent();
        cars.delete(id);
      }
      for (const state of states) {
        let car = cars.get(state.id);
        if (!car) {
          const mesh = (state.kind === 'boat' || state.kind === 'boat4') ? makeBoat(state.color) : makeCar(state.color, state.kind === 'taxi');
          const label = makeNameTag((state.kind === 'taxi' || state.kind === 'boat4') ? `${state.kind === 'boat4' ? 'Barco' : 'Taxi'} ${state.name} · ${Number(Boolean(state.driver)) + (state.passengers?.filter(Boolean).length ?? 0)}/4` : state.name);
          mesh.position.set(state.x, (state.kind === 'boat' || state.kind === 'boat4') ? 0 : world.groundHeight(state.x, state.z), state.z);
          if((state.kind !== 'boat' && state.kind !== 'boat4')) alignToTerrain(mesh, state.yaw);
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
        if (car.state.name !== state.name || car.state.driver !== state.driver || JSON.stringify(car.state.passengers) !== JSON.stringify(state.passengers)) {
          disposeNameTag(car.label);
          car.label = makeNameTag((state.kind === 'taxi' || state.kind === 'boat4') ? `${state.kind === 'boat4' ? 'Barco' : 'Taxi'} ${state.name} · ${Number(Boolean(state.driver)) + (state.passengers?.filter(Boolean).length ?? 0)}/4` : state.name);
          car.mesh.add(car.label);
        }
        const tookWheel = state.driver === driverId && car.state.driver !== driverId;
        const hit = state.driver === driverId && car.state.impact !== state.impact;
        if (hit) sfx('crash');
        if (tookWheel || hit) {
          car.mesh.position.set(state.x, (state.kind === 'boat' || state.kind === 'boat4') ? 0 : state.y ?? world.groundHeight(state.x, state.z), state.z);
          if((state.kind !== 'boat' && state.kind !== 'boat4')) alignToTerrain(car.mesh, state.yaw);
          const forwardX = -Math.sin(state.yaw);
          const forwardZ = -Math.cos(state.yaw);
          speed = state.vx * forwardX + state.vz * forwardZ;
          bumpX = state.vx - forwardX * speed;
          bumpZ = state.vz - forwardZ * speed;
        }
        car.state = state;
        car.targetLift = (state.kind === 'boat' || state.kind === 'boat4') || state.y === undefined ? 0
          : THREE.MathUtils.clamp(state.y - world.groundHeight(state.x, state.z), 0, 80);
      }
    },
    nearby(position: THREE.Vector3) {
      let closest: string | null = null;
      let distance = 4.5;
      for (const [id, { mesh, state }] of cars) {
        const driverSeat = state.owner === driverId && !state.driver;
        const passengerSeat = (state.kind === 'taxi' || state.kind === 'boat4') && state.owner !== driverId && state.passengers?.includes(null);
        if (!driverSeat && !passengerSeat) continue;
        const d = ['boat','boat4'].includes(state.kind ?? '') ? Math.hypot(mesh.position.x-position.x,mesh.position.z-position.z) : mesh.position.distanceTo(position);
        if (d < distance) {
          closest = id;
          distance = d;
        }
      }
      return closest;
    },
    update(player: THREE.Group, steering: number, throttle: number, delta: number, flying = false, verticalInput = 0, boost = false, speedMode = 1, admin = false) {
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
        const floor = (state.kind === 'boat' || state.kind === 'boat4') ? 0 : world.groundHeight(mesh.position.x, mesh.position.z);
        car.lift = approach(car.lift, car.targetLift);
        mesh.position.y = floor + car.lift;
        const angle = state.yaw - mesh.rotation.y;
        const shortest = Math.atan2(Math.sin(angle), Math.cos(angle));
        const yaw = Math.abs(shortest) < 0.01 ? state.yaw : mesh.rotation.y + shortest * mix;
        if (state.pitch !== undefined && state.roll !== undefined) {
          const angleTo = (from: number, to: number) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * mix;
          mesh.rotation.set(angleTo(mesh.rotation.x, state.pitch), yaw, angleTo(mesh.rotation.z, state.roll), 'YXZ');
        } else if((state.kind === 'boat' || state.kind === 'boat4')) mesh.rotation.set(0,yaw,0); else alignToTerrain(mesh, yaw, car.lift > 0.2, delta);
      }

      const passengerCar = !own ? ridden() : undefined;
      if (passengerCar) {
        lastDriven = passengerCar.state.id;
        player.position.copy(passengerCar.mesh.position);
        player.rotation.y = passengerCar.mesh.rotation.y;
        return player.rotation.y;
      }
      if (!own) {
        activeMode = 1;
        wasFlying = false; jumpsUsed = 0; nitro = 1; nitroExhausted = false;
        if (lastDriven) {
          speed = 0;
          bumpX = 0;
          bumpZ = 0;
          verticalSpeed = null;
          jumpsUsed = 0;
          groundVelocity = 0;
          steeringAngle = 0;
          pitchRate = rollRate = 0;
          lastDriven = null;
          const side = player.rotation.y + Math.PI / 2;
          for (const sign of [1, -1]) {
            const x = player.position.x + Math.sin(side) * 2.5 * sign;
            const z = player.position.z + Math.cos(side) * 2.5 * sign;
            if (!hitsBuilding(x, z, 0.45) && !hitsHouse(x, z, 0.45, true)) {
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
      const pace = [0.65, 1, 1.35, 3, 5, ...(admin ? [8] : [])].includes(speedMode) ? speedMode : 1;
      activeMode = pace;
      if (!boost) nitroExhausted = false;
      const boosting = boost && pedal > 0 && nitro > 0 && !nitroExhausted;
      nitro = THREE.MathUtils.clamp(nitro + (boosting ? -delta / 3 : delta / 6), 0, 1);
      if (nitro === 0) nitroExhausted = true;
      const power = boosting ? 1.65 : 1;
      if ((state.kind === 'boat' || state.kind === 'boat4')) {
        const heading=rotation.y-steer*delta*1.25;
        speed=THREE.MathUtils.lerp(speed,pedal*(pedal<0?6:14)*Math.min(pace,3)*power,1-Math.exp(-delta*1.6));
        const distance=speed*delta, steps=Math.max(1,Math.ceil(Math.abs(distance)/.5));
        let clear=true;
        for(let i=1;i<=steps;i++)if(!waterClear(position.x-Math.sin(heading)*distance*i/steps,position.z-Math.cos(heading)*distance*i/steps,heading)){clear=false;break;}
        if(clear){position.x-=Math.sin(heading)*distance;position.z-=Math.cos(heading)*distance;rotation.set(0,heading,0);}else speed=0;
        position.y=0; verticalSpeed=null; wasFlying=false;
        player.position.copy(position);player.rotation.y=rotation.y;return rotation.y;
      }
      if (flying) {
        wasFlying = true; verticalSpeed = null; pitchRate = rollRate = 0;
        const heading = rotation.y - steer * delta * 1.6;
        speed = THREE.MathUtils.lerp(speed, pedal * 18 * pace * power, 1 - Math.exp(-delta * 3));
        const nextX = position.x - Math.sin(heading) * speed * delta;
        const nextZ = position.z - Math.cos(heading) * speed * delta;
        if (position.y > world.groundHeight(nextX,nextZ)+18 || !blocked(nextX,nextZ,heading)) { position.x = nextX; position.z = nextZ; }
        position.y = THREE.MathUtils.clamp(position.y + verticalInput * 8 * delta, world.groundHeight(position.x,position.z), Math.max(200,world.groundHeight(position.x,position.z)));
        rotation.set(0,heading,0,'YXZ'); bumpX = bumpZ = 0;
        player.position.copy(position); player.rotation.y = heading;
        return heading;
      }
      if (wasFlying) { wasFlying = false; verticalSpeed = 0; groundVelocity = 0; }
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
        const limit = (pedal < 0 ? 9 : 24 * power) * wet * pace;
        const braking = pedal !== 0 && pedal * speed < -0.2;
        if (braking) {
          const amount = (pace === 8 ? 88 : pace === 5 ? 66 : pace === 3 ? 44 : 22) * Math.abs(pedal) * delta;
          speed = Math.sign(speed) * Math.max(0, Math.abs(speed) - amount);
        } else if (pedal) {
          speed += pedal * 8.5 * pace * (pace === 3 ? 2 : 1) * (boosting ? (pace === 8 ? 4 : pace === 5 ? 3.5 : 2.5) : 1) * delta;
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
      let collision = false;
      const travelSteps = Math.max(1,Math.ceil(Math.hypot(x-position.x,z-position.z)));
      for(let i=1;i<=travelSteps;i++)if(blocked(THREE.MathUtils.lerp(position.x,x,i/travelSteps),THREE.MathUtils.lerp(position.z,z,i/travelSteps),yaw)){collision=true;break;}
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
          jumpsUsed = 0;
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
