import { defineConfig, loadEnv } from 'vite';
import { createRoom } from './server/room.mjs';

function installLan(server) {
  const { ADMIN_CODE } = loadEnv(server.config.mode, server.config.envDir, 'ADMIN_CODE');
  const room = createRoom({ adminCode: ADMIN_CODE });
  server.httpServer?.once('close', room.close);
  server.middlewares.use('/lan/join', room.join);
  server.middlewares.use('/lan/move', room.move);
  server.middlewares.use('/lan/admin', room.admin);
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
