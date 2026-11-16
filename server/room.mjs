import { randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import phrases from '../shared/phrases.json' with { type: 'json' };
import { carSpaceFree, moveCar, coastParkedCars } from './car-physics.mjs';
import hats from '../shared/hats.json' with { type: 'json' };

import colors from '../shared/colors.json' with { type: 'json' };
const codeFormat = /^[0-9]{8}$/;
const ADMIN_WINDOW = 60_000;

export function createRoom({ adminCode = process.env.ADMIN_CODE } = {}) {
  const players = new Map();
  const slots = new Set();
  const cars = new Map();
  const secret = typeof adminCode === 'string' && codeFormat.test(adminCode) ? Buffer.from(adminCode) : null;
  const failedAttempts = [];
  let dirty = false;
  let carsDirty = false;
  let lastPing = Date.now();
  const startTime = lastPing;

  function send(response, event, data) {
    if (response.writableLength > 64 * 1024) {
      response.destroy();
      return;
    }
    response.write('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n');
  }

  const timer = setInterval(() => {
    const ping = Date.now() - lastPing >= 10_000;
    if (dirty) {
      const snapshot = [...players.values()].filter(player => player.state).map(
        ({ id, name, color, state, car, hat }) => ({ id, name, color, ...state, car, hat })
      );
      for (const player of players.values()) {
        send(player.response, 'players', snapshot.filter(other => other.id !== player.id));
      }
      dirty = false;
    } else if (ping) {
      for (const { response } of players.values()) {
        if (response.writableLength > 64 * 1024) response.destroy();
        else response.write(': ping\n\n');
      }
    }
    const parkedMoved = coastParkedCars(cars, 0.08);
    if (carsDirty || parkedMoved) {
      const snapshot = [...cars.values()];
      for (const player of players.values()) send(player.response, 'cars', snapshot);
      carsDirty = false;
    }
    if (ping) lastPing = Date.now();
  }, 80);
  timer.unref();

  function disconnect(token, slot) {
    const player = players.get(token);
    if (!player) return;
    leaveCar(player);
    if (player.ownedCar) {
      cars.delete(player.ownedCar);
      carsDirty = true;
    }
    players.delete(token);
    slots.delete(slot);
    dirty = true;
  }

  function leaveCar(player) {
    if (!player.car) return;
    const car = cars.get(player.car);
    car.driver = null;
    car.vx = 0;
    car.vz = 0;
    delete car.y;
    player.car = null;
    carsDirty = true;
    dirty = true;
  }

  function spawnCar(player, response) {
    if (!player.state || player.car || Date.now() < (player.nextSpawn ?? 0)) {
      return response.writeHead(409).end();
    }
    const previous = cars.get(player.ownedCar);
    const { x, z, yaw } = player.state;
    for (const offset of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) {
      const angle = yaw + offset;
      const carX = x - Math.sin(angle) * 5.75;
      const carZ = z - Math.cos(angle) * 5.75;
      if (!carSpaceFree(cars, carX, carZ, yaw, previous)) continue;
      if (previous) cars.delete(previous.id);
      const id = randomUUID();
      cars.set(id, {
        id, owner: player.id, name: player.name, color: player.color, driver: null,
        x: carX, z: carZ, yaw, vx: 0, vz: 0, impact: 0
      });
      player.ownedCar = id;
      player.nextSpawn = Date.now() + 1500;
      carsDirty = true;
      return response.writeHead(204).end();
    }
    response.writeHead(409).end();
  }

  function join(request, response) {
    if (request.method !== 'GET') {
      response.writeHead(405).end();
      return;
    }
    if (request.headers['last-event-id'] === 'kicked') {
      response.writeHead(204).end();
      return;
    }
    const url = new URL(request.url ?? '/', 'http://localhost');
    const name = url.searchParams.get('name')?.trim().slice(0, 24);
    if (!name || /[\p{Cc}\p{Cf}]/u.test(name)) {
      response.writeHead(400).end();
      return;
    }
    if (players.size >= colors.length) {
      response.writeHead(503).end();
      return;
    }

    let slot = 0;
    while (slots.has(slot)) slot++;
    slots.add(slot);
    const id = randomUUID();
    const token = randomUUID();
    const usedColors = new Set([...players.values()].map(player => player.color));
    const freeColors = colors.filter(color => !usedColors.has(color));
    const color = freeColors[randomInt(freeColors.length)];
    players.set(token, { id, name, color, response, slot, state: null, car: null, hat: null });
    response.on('close', () => disconnect(token, slot));

    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no'
    });
    send(response, 'ready', { id, token, color, moderation: true, spawnCars: true, worldTime: Date.now() - startTime,
      x: [0, 3, -3, 6][slot % 4], z: -35 - Math.floor(slot / 4) * 3 });
    send(response, 'cars', [...cars.values()]);
    dirty = true;
  }

  function withPlayer(handler) {
    return async (request, response) => {
      if (request.method !== 'POST') {
        response.writeHead(405).end();
        return;
      }
      if (request.headers['content-type'] !== 'application/json') {
        response.writeHead(415).end();
        return;
      }

      try {
        let body = '';
        for await (const piece of request) {
          body += piece;
          if (body.length > 512) {
            response.writeHead(413).end();
            return;
          }
        }
        const { token, ...data } = JSON.parse(body);
        const player = players.get(token);
        if (!player) {
          response.writeHead(404).end();
          return;
        }
        handler(player, data, response);
      } catch {
        if (!response.headersSent) response.writeHead(400).end();
      }
    };
  }

  const move = withPlayer((player, { x, y, z, yaw, phrase, ride, drivingCar, carImpact, hat, color }, response) => {
    if (ride === 'spawn') return spawnCar(player, response);
    if (ride === 'exit') {
      leaveCar(player);
      return response.writeHead(204).end();
    }
    if (typeof ride === 'string') {
      const car = cars.get(ride);
      if (!car || car.owner !== player.id || car.driver || player.car || !player.state) {
        return response.writeHead(409).end();
      }
      if (Math.hypot(player.state.x - car.x, player.state.z - car.z) > 5.5) {
        return response.writeHead(409).end();
      }
      car.driver = player.id;
      player.car = car.id;
      carsDirty = true;
      dirty = true;
      return response.writeHead(204).end();
    }
    if (phrase !== undefined) {
      if (typeof phrase !== 'string' || !Object.hasOwn(phrases, phrase)) {
        response.writeHead(400).end();
        return;
      }
      const now = Date.now();
      if (now < (player.nextChat ?? 0)) {
        response.writeHead(429).end();
        return;
      }
      player.nextChat = now + 1800;
      const message = { id: player.id, name: player.name, phrase };
      for (const other of players.values()) send(other.response, 'chat', message);
      response.writeHead(204).end();
      return;
    }
    if (![x, y, z, yaw].every(Number.isFinite)) {
      response.writeHead(400).end();
      return;
    }
    if (player.car !== (drivingCar ?? null)) return response.writeHead(409).end();
    if (player.car && carImpact !== cars.get(player.car).impact) return response.writeHead(409).end();
    if (hat !== undefined && hat !== null && (typeof hat !== 'string' || !Object.hasOwn(hats, hat))) {
      return response.writeHead(400).end();
    }
    if (color !== undefined && !colors.includes(color)) return response.writeHead(400).end();
    if (color !== undefined && color !== player.color) {
      player.color = color;
      dirty = true;
      const owned = cars.get(player.ownedCar);
      if (owned) { owned.color = color; carsDirty = true; }
    }
    if (hat !== undefined && hat !== player.hat) {
      player.hat = hat;
      dirty = true;
    }

    if (player.car) {
      const car = cars.get(player.car);
      moveCar(cars, car, { x, y, z, yaw });
      carsDirty = true;
    }
    const previous = player.state;
    if (!previous || x !== previous.x || y !== previous.y || z !== previous.z || yaw !== previous.yaw) {
      player.state = { x, y, z, yaw };
      dirty = true;
    }
    response.writeHead(204).end();
  });

  function moderate(player, { action, targetId, name }, response) {
    if (!player.admin) return response.writeHead(403).end();
    if (action !== 'rename' && action !== 'kick') return response.writeHead(400).end();
    const targetEntry = [...players].find(([, target]) => target.id === targetId && target !== player);
    if (!targetEntry) return response.writeHead(404).end();
    const [targetToken, target] = targetEntry;

    if (action === 'rename') {
      const nickname = typeof name === 'string' ? name.trim() : '';
      if (!nickname || nickname.length > 24 || /[\p{Cc}\p{Cf}]/u.test(nickname)) {
        return response.writeHead(400).end();
      }
      target.name = nickname;
      if (target.ownedCar) {
        cars.get(target.ownedCar).name = nickname;
        carsDirty = true;
      }
      send(target.response, 'renamed', { name: nickname });
      dirty = true;
    } else {
      target.response.write('id: kicked\n');
      send(target.response, 'kicked', {});
      target.response.end();
      disconnect(targetToken, target.slot);
    }
    response.writeHead(204).end();
  }

  const admin = withPlayer((player, data, response) => {
    response.setHeader('Cache-Control', 'no-store');
    if (data.action !== undefined) return moderate(player, data, response);
    const { code } = data;
    if (!secret) return response.writeHead(503).end();
    if (player.admin) return response.writeHead(204).end();
    if (typeof code !== 'string' || !codeFormat.test(code)) return response.writeHead(400).end();

    const now = Date.now();
    while (failedAttempts.length && now - failedAttempts[0] >= ADMIN_WINDOW) failedAttempts.shift();
    if (failedAttempts.length >= 20 || now < (player.nextAdminAttempt ?? 0)) {
      response.writeHead(429, { 'Retry-After': '60' }).end();
      return;
    }
    if (!timingSafeEqual(Buffer.from(code), secret)) {
      failedAttempts.push(now);
      player.nextAdminAttempt = now + 2500;
      response.writeHead(403).end();
      return;
    }
    player.admin = true;
    response.writeHead(204).end();
  });

  return { join, move, admin, close: () => clearInterval(timer) };
}
