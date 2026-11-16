import { defineConfig } from 'vite';
import { createRoom } from './server/room.mjs';

function installLan(server) {
  const room = createRoom();
  server.httpServer?.once('close', room.close);
  server.middlewares.use('/lan/join', room.join);
  server.middlewares.use('/lan/move', room.move);
}

export default defineConfig({
  base: './',
  server: { host: '::' },
  plugins: [{
    name: 'openworld-lan',
    configureServer: installLan,
    configurePreviewServer: installLan
  }]
});
