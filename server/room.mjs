import { createChatModeration } from './chat-moderation.mjs';
import { createSessionFeatures } from './session-features.mjs';
import { randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import phrases from '../shared/phrases.json' with { type: 'json' };
import { carSpaceFree, moveCar, coastParkedCars, releaseCar } from './car-physics.mjs';
import hats from '../shared/hats.json' with { type: 'json' };

import colors from '../shared/colors.json' with { type: 'json' };
const codeFormat = /^[0-9]{8}$/;
const ADMIN_WINDOW = 60_000;

export function createRoom({ adminCode = process.env.ADMIN_CODE } = {}) {
  const players = new Map();
  const chatModeration = createChatModeration();
  const slots = new Set();
  const cars = new Map();
  const secret = typeof adminCode === 'string' && codeFormat.test(adminCode) ? Buffer.from(adminCode) : null;
  const failedAttempts = [];
  let dirty = false;
  let carsDirty = false;
  let lastAnnouncement = -Infinity;
  let lastPing = Date.now();
  const startTime = lastPing;

  function send(response, event, data) {
    if (response.writableLength > 64 * 1024) {
      response.destroy();
      return;
    }
    response.write('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n');
  }

  const features = createSessionFeatures(players, send);
  const timer = setInterval(() => {
    features.tick();
    chatModeration.prune();
    const ping = Date.now() - lastPing >= 10_000;
    if (dirty) {
      const snapshot = [...players.values()].filter(player => player.state).map(
        ({ id, name, color, state, car, hat, admin, freeChat }) => ({ id, name, color, ...state, car, hat, freeChat: Boolean(admin || freeChat) })
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
      const owned = cars.get(player.ownedCar);
      if (owned) for (const rider of players.values()) if (rider.car === owned.id) leaveCar(rider);
      cars.delete(player.ownedCar);
      carsDirty = true;
    }
    features.remove(player);
    players.delete(token);
    features.broadcast();
    slots.delete(slot);
    dirty = true;
  }

  function leaveCar(player) {
    if (!player.car) return;
    const car = cars.get(player.car);
    if (car) {
      if (car.driver === player.id) {
        releaseCar(car);
        if(['boat','boat4'].includes(car.kind))car.vx=car.vz=0;
        delete car.y; delete car.pitch; delete car.roll;
      } else if (car.passengers) {
        car.passengers = car.passengers.map(id => id === player.id ? null : id);
      }
      player.state = {x:car.x,y:car.y ?? player.state?.y ?? 0,z:car.z,yaw:car.yaw};
    }
    player.car = null;
    carsDirty = true;
    dirty = true;
  }

  function spawnCar(player, response, selectedColor = player.color, vehicleType = 'car', boatSpawn) {
    if (!player.state || player.car || Date.now() < (player.nextSpawn ?? 0)) {
      return response.writeHead(409).end();
    }
    if(['boat','boat4'].includes(vehicleType) && (!boatSpawn || !Number.isFinite(boatSpawn.x) || !Number.isFinite(boatSpawn.z) || Math.hypot(boatSpawn.x-player.state.x,boatSpawn.z-player.state.z)>10.5))return response.writeHead(400).end();
    const previous = cars.get(player.ownedCar);
    if (previous && (previous.driver || previous.passengers?.some(Boolean))) return response.writeHead(409).end();
    const { x, z, yaw } = player.state;
    for (const offset of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) {
      const angle = yaw + offset;
      const carX = ['boat','boat4'].includes(vehicleType) ? boatSpawn.x : x - Math.sin(angle) * 5.75;
      const carZ = ['boat','boat4'].includes(vehicleType) ? boatSpawn.z : z - Math.cos(angle) * 5.75;
      if (!carSpaceFree(cars, carX, carZ, yaw, previous)) continue;
      player.color = selectedColor;
      dirty = true;
      if (previous) cars.delete(previous.id);
      const id = randomUUID();
      cars.set(id, {
        id, owner: player.id, name: player.name, color: vehicleType === 'taxi' ? 0xffcb32 : player.color, driver: null,
        kind: vehicleType, passengers: ['taxi','boat4'].includes(vehicleType) ? [null,null,null] : [],
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
    const rawClientId = url.searchParams.get('clientId') ?? '';
    const clientId = /^[a-zA-Z0-9-]{16,64}$/.test(rawClientId) ? rawClientId : 'ip:' + request.socket.remoteAddress;
    const until = chatModeration.bannedUntil(clientId);
    if (until) { response.writeHead(200, {'Content-Type':'text/event-stream','Cache-Control':'no-store'}); send(response,'kicked',{until});response.end();return; }
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
    players.set(token, { id, clientId, name, color, response, slot, state: null, car: null, hat: null });
    features.start(players.get(token));
    response.on('close', () => disconnect(token, slot));

    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no'
    });
    send(response, 'ready', { id, token, color, sessionFeatures: true, freeChat: false, moderation: true, spawnCars: true, worldTime: Date.now() - startTime,
      x: [0, 3, -3, 6][slot % 4], z: -35 - Math.floor(slot / 4) * 3 });
    send(response, 'cars', [...cars.values()]);
    features.broadcast();
    dirty = true;
  }

  function moderatedText(player,text) {
    const result=chatModeration.check(player.clientId,text.trim());
    if(result.strikes && !result.until)send(player.response,'announcement',{name:'Moderación',text:`Mensaje filtrado (${result.strikes}/3). Respeta las reglas; otra infracción puede provocar un veto de 10 minutos.`});
    if(result.until) {
      for(const [token,other] of players) if(other.clientId===player.clientId) {
        send(other.response,'kicked',{until:result.until});other.response.end();disconnect(token,other.slot);
      }
    }
    return result;
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

  const move = withPlayer((player, { x, y, z, yaw, phrase, text, ride, drivingCar, carImpact, hat, color, pitch, roll, social, vehicleType, boatSpawn, speedMode }, response) => {
    if (social !== undefined) return features.action(player, social, response);
    if (ride === 'spawn') {
      if (color !== undefined && !colors.includes(color)) return response.writeHead(400).end();
      if (vehicleType !== undefined && !['car','taxi','boat','boat4'].includes(vehicleType)) return response.writeHead(400).end();
      return spawnCar(player, response, color, vehicleType, boatSpawn);
    }
    if (ride === 'exit') {
      leaveCar(player);
      return response.writeHead(204).end();
    }
    if (typeof ride === 'string') {
      const car = cars.get(ride);
      if (!car || player.car || !player.state) {
        return response.writeHead(409).end();
      }
      if (Math.hypot(player.state.x - car.x, player.state.z - car.z) > 5.5) {
        return response.writeHead(409).end();
      }
      if (car.owner === player.id && !car.driver) car.driver = player.id;
      else if (['taxi','boat4'].includes(car.kind) && car.owner !== player.id && car.passengers.includes(null)) {
        car.passengers[car.passengers.indexOf(null)] = player.id;
      } else return response.writeHead(409).end();
      player.car = car.id;
      carsDirty = true;
      dirty = true;
      return response.writeHead(204).end();
    }
    if (phrase !== undefined || text !== undefined) {
      if (text !== undefined && !player.admin && !player.freeChat) return response.writeHead(403).end();
      if (text !== undefined && (typeof text !== 'string' || !text.trim() || text.length > 160 || /[\p{Cc}\p{Cf}]/u.test(text))) return response.writeHead(400).end();
      if (text !== undefined && phrase !== undefined) return response.writeHead(400).end();
      if (text === undefined && (typeof phrase !== 'string' || !Object.hasOwn(phrases, phrase))) {
        response.writeHead(400).end();
        return;
      }
      const now = Date.now();
      if (now < (player.nextChat ?? 0)) {
        response.writeHead(429).end();
        return;
      }
      player.nextChat = now + 1800;
      const filtered = text === undefined ? null : moderatedText(player,text);
      if(filtered?.until)return response.writeHead(403).end();
      const message = text === undefined ? { id: player.id, name: player.name, phrase } : { id: player.id, name: player.name, text: filtered.text };
      for (const other of players.values()) send(other.response, 'chat', message);
      response.writeHead(204).end();
      return;
    }
    if ([pitch, roll].some(value => value !== undefined && !Number.isFinite(value))) return response.writeHead(400).end();
    if (![x, y, z, yaw].every(Number.isFinite)) {
      response.writeHead(400).end();
      return;
    }
    if (speedMode === 8 && !player.admin) return response.writeHead(403).end();
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
      if (owned && owned.kind !== 'taxi') { owned.color = color; carsDirty = true; }
    }
    if (hat !== undefined && hat !== player.hat) {
      player.hat = hat;
      dirty = true;
    }

    if (player.car) {
      const car = cars.get(player.car);
      if (car.driver !== player.id) {
        player.state = {x:car.x,y:car.y ?? y,z:car.z,yaw:car.yaw};
        dirty = true;
        return response.writeHead(204).end();
      }
      moveCar(cars, car, { x, y, z, yaw });
      car.pitch = Math.atan2(Math.sin(pitch ?? 0), Math.cos(pitch ?? 0));
      car.roll = Math.atan2(Math.sin(roll ?? 0), Math.cos(roll ?? 0));
      carsDirty = true;
    }
    const previous = player.state;
    if (!previous || x !== previous.x || y !== previous.y || z !== previous.z || yaw !== previous.yaw) {
      player.state = { x, y, z, yaw };
      dirty = true;
    }
    response.writeHead(204).end();
  });

  function moderate(player, { action, targetId, name, text }, response) {
    if (!player.admin) return response.writeHead(403).end();
    if (action === 'announce') {
      if (typeof text !== 'string' || !text.trim() || text.trim().length > 160 || /[\p{Cc}\p{Cf}]/u.test(text)) return response.writeHead(400).end();
      if (Date.now() - lastAnnouncement < 5000) return response.writeHead(429).end();
      const filtered = moderatedText(player,text);
      if(filtered.until)return response.writeHead(403).end();
      lastAnnouncement = Date.now();
      for (const recipient of players.values()) send(recipient.response, 'announcement', {name:player.name,text:filtered.text});
      return response.writeHead(204).end();
    }
    if (action === 'fly' || action === 'unfly') {
      const target = targetId === 'me' ? player : [...players.values()].find(q => q.id === targetId);
      if (!target) return response.writeHead(404).end();
      target.flying = action === 'fly';
      send(target.response, 'permissions', {freeChat:Boolean(target.admin || target.freeChat), flying:target.flying});
      features.broadcast();
      return response.writeHead(204).end();
    }
    if (!['rename', 'kick', 'chat_allow', 'chat_block'].includes(action)) return response.writeHead(400).end();
    const targetEntry = [...players].find(([, target]) => target.id === targetId && target !== player);
    if (!targetEntry) return response.writeHead(404).end();
    const [targetToken, target] = targetEntry;

    if (action === 'chat_allow' || action === 'chat_block') {
      if (target.admin) return response.writeHead(409).end();
      target.freeChat = action === 'chat_allow';
      send(target.response, 'permissions', { freeChat: target.freeChat, flying:Boolean(target.flying) });
      dirty = true;
    } else if (action === 'rename') {
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
      features.broadcast();
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
    dirty = true;
    send(player.response, 'permissions', { freeChat: true, admin:true, flying:Boolean(player.flying) });
    response.writeHead(204).end();
  });

  return { join, move, admin, close: () => clearInterval(timer) };
}
