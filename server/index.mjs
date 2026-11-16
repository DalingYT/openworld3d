import { createServer } from 'node:http';
import { createRoom } from './room.mjs';

const configuredOrigin = process.env.PAGES_ORIGIN;
const origin = configuredOrigin ? new URL(configuredOrigin).origin : null;
const port = Number(process.env.PORT ?? 10000);
const room = createRoom();

const server = createServer((request, response) => {
  const { pathname } = new URL(request.url, 'http://localhost');
  if (pathname === '/health' && request.method === 'GET') {
    if (origin && request.headers.origin === origin) {
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Vary', 'Origin');
    }
    response.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }).end('ok');
    return;
  }

  const handler = pathname === '/lan/join' ? room.join
    : pathname === '/lan/move' ? room.move
      : pathname === '/lan/admin' ? room.admin : null;
  if (!handler) {
    response.writeHead(404).end();
    return;
  }
  if (!origin || request.headers.origin !== origin) {
    response.writeHead(403).end();
    return;
  }

  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Vary', 'Origin');
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Methods': pathname === '/lan/join' ? 'GET' : 'POST',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '600'
    }).end();
    return;
  }
  void handler(request, response);
});

server.on('close', room.close);
server.listen(port, '0.0.0.0', () => console.log('OpenWorld3D listening on port ' + port));
