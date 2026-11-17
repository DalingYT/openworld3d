import houses from '../shared/houses.json' with { type: 'json' };
import buildings from '../shared/city-buildings.json' with { type: 'json' };

const motion = new WeakMap();

function reach(yaw, nx, nz) {
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  return Math.abs(nx * sin + nz * cos) * 2 + Math.abs(nx * cos - nz * sin) * 1.05;
}

function outsideBuildings(x, z, yaw) {
  const marginX = reach(yaw, 1, 0);
  const marginZ = reach(yaw, 0, 1);
  return !houses.some(h => Math.abs(x - h.x) < 4.2 + marginX && Math.abs(z - h.z) < 5.2 + marginZ)
    && !buildings.some(block => Math.abs(x - block.x) < 4 + marginX
    && Math.abs(z - block.z) < 6 + marginZ);
}

function contact(car, other, dx, dz, yaw) {
  let start = -Infinity;
  let end = Infinity;
  let nx = 0;
  let nz = 0;
  const ox = other.x - car.x;
  const oz = other.z - car.z;

  for (const angle of [yaw, yaw + Math.PI / 2, other.yaw, other.yaw + Math.PI / 2]) {
    const x = Math.sin(angle);
    const z = Math.cos(angle);
    const distance = ox * x + oz * z;
    const step = dx * x + dz * z;
    const limit = reach(yaw, x, z) + reach(other.yaw, x, z);
    if (Math.abs(step) < 1e-8) {
      if (Math.abs(distance) >= limit) return;
      continue;
    }
    const a = (distance - limit) / step;
    const b = (distance + limit) / step;
    const entry = Math.min(a, b);
    if (entry > start) {
      start = entry;
      nx = x * Math.sign(step);
      nz = z * Math.sign(step);
    }
    end = Math.min(end, Math.max(a, b));
    if (start > end) return;
  }
  if (end <= 0 || start > 1 || start === -Infinity) return;
  // If already overlapping, allow inputs that separate the cars.
  if (start < 0 && ox * dx + oz * dz <= 0) return;
  return { time: Math.max(0, start), nx, nz };
}

function overlap(x, z, yaw, other) {
  const dx = other.x - x;
  const dz = other.z - z;
  return [yaw, yaw + Math.PI / 2, other.yaw, other.yaw + Math.PI / 2].every(angle => {
    const nx = Math.sin(angle);
    const nz = Math.cos(angle);
    return Math.abs(dx * nx + dz * nz) < reach(yaw, nx, nz) + reach(other.yaw, nx, nz);
  });
}

export function carSpaceFree(cars, x, z, yaw, ignored) {
  if (!outsideBuildings(x, z, yaw)) return false;
  for (const car of cars.values()) {
    if (car !== ignored && overlap(x, z, yaw, car)) return false;
  }
  return true;
}

function updateMotion(car, vx, vz, now) {
  motion.set(car, { vx, vz, at: now });
}

function velocityOf(car, now) {
  if (!car.driver) return { vx: car.vx, vz: car.vz };
  const sample = motion.get(car);
  if (sample && now - sample.at < 300) return sample;
  return { vx: 0, vz: 0 };
}

export function releaseCar(car, now = performance.now()) {
  const velocity = velocityOf(car, now);
  car.vx = velocity.vx;
  car.vz = velocity.vz;
  car.driver = null;
}

// Stop at the first point of contact, then exchange momentum along its normal.
export function moveCar(cars, car, { x, y, z, yaw }, now = performance.now(), stepSeconds) {
  const dx = x - car.x;
  const dz = z - car.z;
  const elapsed = (now - (motion.get(car)?.at ?? now - 80)) / 1000;
  const dt = stepSeconds ?? Math.max(0.055, Math.min(0.25, elapsed));
  const scale = Math.min(1 / dt, 30 / (Math.hypot(dx, dz) || 1));
  const vx = dx * scale;
  const vz = dz * scale;
  let hit;
  for (const other of cars.values()) {
    if (car === other) continue;
    if (car.y !== undefined && other.y !== undefined && Math.abs(car.y - other.y) > 1.45) continue;
    const result = contact(car, other, dx, dz, yaw);
    if (result && (!hit || result.time < hit.time)) hit = { ...result, other };
  }
  if (!hit) {
    Object.assign(car, { x, y, z, yaw, vx, vz });
    updateMotion(car, vx, vz, now);
    return;
  }

  const { nx, nz, time, other } = hit;
  const target = velocityOf(other, now);
  const closingSpeed = (vx - target.vx) * nx + (vz - target.vz) * nz;
  const impulse = Math.max(0, closingSpeed) * 0.52;
  const backoff = Math.max(0, time - 0.004 / (Math.hypot(dx, dz) || 1));
  car.x += dx * backoff;
  car.z += dz * backoff;
  car.y = y;
  car.yaw = yaw;
  car.vx = vx - impulse * nx;
  car.vz = vz - impulse * nz;
  car.impact++;
  updateMotion(car, car.vx, car.vz, now);
  if (impulse > 0) {
    other.vx = target.vx + impulse * nx;
    other.vz = target.vz + impulse * nz;
    other.impact++;
    updateMotion(other, other.vx, other.vz, now);
  }
}

export function coastParkedCars(cars, dt) {
  let moved = false;
  for (const car of cars.values()) {
    if (car.driver || Math.hypot(car.vx, car.vz) < 0.08) continue;
    const x = car.x + car.vx * dt;
    const z = car.z + car.vz * dt;
    if (outsideBuildings(x, z, car.yaw)) {
      delete car.y;
      moveCar(cars, car, { x, z, yaw: car.yaw }, performance.now(), dt);
      const speed = Math.hypot(car.vx, car.vz);
      const damping = speed > 0 ? Math.max(0, 1 - (1.1 + 0.012 * speed * speed) * dt / speed) : 0;
      car.vx *= damping;
      car.vz *= damping;
      moved = true;
    } else {
      car.vx = 0;
      car.vz = 0;
    }
  }
  return moved;
}
