import buildings from '../shared/city-buildings.json' with { type: 'json' };

function reach(yaw, nx, nz) {
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  return Math.abs(nx * sin + nz * cos) * 2 + Math.abs(nx * cos - nz * sin) * 1.05;
}

export function carSpaceFree(cars, x, z, yaw, ignored) {
  const marginX = reach(yaw, 1, 0);
  const marginZ = reach(yaw, 0, 1);
  if (buildings.some(block => Math.abs(x - block.x) < 4 + marginX
      && Math.abs(z - block.z) < 6 + marginZ)) return false;
  for (const car of cars.values()) {
    if (car === ignored) continue;
    const dx = x - car.x;
    const dz = z - car.z;
    const distance = Math.hypot(dx, dz);
    if (!distance || distance < reach(yaw, dx / distance, dz / distance)
        + reach(car.yaw, dx / distance, dz / distance)) return false;
  }
  return true;
}

function bump(car, vx, vz) {
  car.vx = vx;
  car.vz = vz;
  car.impact++;
}

// Proposals come from the current driver. The room resolves shared-vehicle contacts.
export function moveCar(cars, car, { x, y, z, yaw }) {
  const dx = x - car.x;
  const dz = z - car.z;
  const squaredStep = dx * dx + dz * dz;
  for (const other of cars.values()) {
    if (car === other || !squaredStep) continue;
    const ox = other.x - car.x;
    const oz = other.z - car.z;
    const toward = ox * dx + oz * dz;
    if (toward <= 0) continue;
    const t = Math.min(toward / squaredStep, 1);

    const gap = Math.hypot(ox, oz);
    const step = Math.sqrt(squaredStep);
    const nx = gap ? ox / gap : dx / step;
    const nz = gap ? oz / gap : dz / step;
    if (Math.hypot(ox - dx * t, oz - dz * t) >= reach(yaw, nx, nz) + reach(other.yaw, nx, nz)) continue;
    const force = Math.min(11, Math.max(1.2, (nx * dx + nz * dz) * 8));
    bump(other, nx * force, nz * force);
    bump(car, -nx * force * 0.42, -nz * force * 0.42);
    car.yaw = yaw;
    return;
  }
  Object.assign(car, { x, y, z, yaw });
}

export function coastParkedCars(cars, dt) {
  let moved = false;
  for (const car of cars.values()) {
    if (car.driver || Math.hypot(car.vx, car.vz) < 0.08) continue;
    const x = car.x + car.vx * dt;
    const z = car.z + car.vz * dt;
    if (carSpaceFree(cars, x, z, car.yaw, car)) {
      car.x = x;
      car.z = z;
      car.vx *= 0.77;
      car.vz *= 0.77;
      delete car.y;
      moved = true;
    } else {
      car.vx = 0;
      car.vz = 0;
    }
  }
  return moved;
}
