import { randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import phrases from '../shared/phrases.json' with { type: 'json' };

const colors = [
  0x3366ff, 0xf04b54, 0x13b8b2, 0xf5ad28, 0xa45bec, 0xf065ae,
  0x256955, 0x6b4362, 0xff784b, 0x77b93c, 0xc5c8f5, 0x5038b7
];

const codeFormat = /^[0-9]{8}$/;
const ADMIN_WINDOW = 60_000;

export function createRoom({ adminCode = process.env.ADMIN_CODE } = {}) {
  const players = new Map();
  const slots = new Set();
  const secret = typeof adminCode === 'string' && codeFormat.test(adminCode) ? Buffer.from(adminCode) : null;
  const failedAttempts = [];
  let dirty = false;
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
        ({ id, name, color, state }) => ({ id, name, color, ...state })
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
    if (ping) lastPing = Date.now();
  }, 80);
  timer.unref();


  function join(request, response) {
    if (request.method !== 'GET') {
      response.writeHead(405).end();
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
    players.set(token, { id, name, color, response, state: null });
    response.on('close', () => {
      players.delete(token);
      slots.delete(slot);
      dirty = true;
    });

    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no'
    });
    send(response, 'ready', { id, token, color, worldTime: Date.now() - startTime,
      x: [0, 3, -3, 6][slot % 4], z: -35 - Math.floor(slot / 4) * 3 });
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

  const move = withPlayer((player, { x, y, z, yaw, phrase }, response) => {
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

    const previous = player.state;
    if (!previous || x !== previous.x || y !== previous.y || z !== previous.z || yaw !== previous.yaw) {
      player.state = { x, y, z, yaw };
      dirty = true;
    }
    response.writeHead(204).end();
  });

  const admin = withPlayer((player, { code }, response) => {
    response.setHeader('Cache-Control', 'no-store');
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
