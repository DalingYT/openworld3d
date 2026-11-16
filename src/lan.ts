import * as THREE from 'three';
import { createChat } from './chat';
import { createSettings } from './settings';

const serverUrl = (import.meta.env.VITE_MULTIPLAYER_URL ?? '').replace(/\/+$/, '');

type PlayerState = {
  id: string;
  name: string;
  color: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
};

function makeNameTag(name: string) {
  const image = document.createElement('canvas');
  image.width = 256;
  image.height = 48;
  const ctx = image.getContext('2d')!;
  ctx.font = '600 24px system-ui';
  const width = Math.min(252, Math.ceil(ctx.measureText(name).width) + 20);
  ctx.fillStyle = '#162739e8';
  ctx.beginPath();
  ctx.roundRect((256 - width) / 2, 3, width, 42, 9);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 128, 24, 232);

  const map = new THREE.CanvasTexture(image);
  map.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({
    map,
    transparent: true,
    depthWrite: false
  }));
  label.position.y = 2.45;
  label.scale.set(3.2, 0.6, 1);
  return label;
}

export function createLan(
  scene: THREE.Scene,
  player: THREE.Group,
  makeAvatar: (color: number) => THREE.Group,
  spawn: (x: number, z: number) => void,
  setColor: (color: number) => void
) {
  const dialog = document.querySelector<HTMLDialogElement>('#apodo')!;
  const form = dialog.querySelector('form')!;
  const input = form.querySelector('input')!;
  const button = form.querySelector('button')!;
  const status = form.querySelector('p')!;
  const networkStatus = document.querySelector<HTMLElement>('#lan-status')!;
  const others = new Map<string, {
    avatar: THREE.Group;
    label: THREE.Sprite;
    name: string;
    target: THREE.Vector3;
    yaw: number;
  }>();

  let stream: EventSource | null = null;
  let token: string | null = null;
  let joined = false;
  let nextSend = 0;
  let lastSent = '';
  let sending = false;
  let playerId = '';
  let clockStart = performance.now();
  const settings = createSettings(async data => {
    if (!token) return 404;
    try {
      const result = await fetch(serverUrl + '/lan/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ...data })
      });
      return result.status;
    } catch {
      return 0;
    }
  });
  const chat = createChat(scene, async phrase => {
    if (!token) return false;
    try {
      const response = await fetch(serverUrl + '/lan/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, phrase })
      });
      return response.ok;
    } catch {
      return false;
    }
  });

  function removePlayer(key: string) {
    const other = others.get(key);
    if (!other) return;
    other.avatar.removeFromParent();
    disposeNameTag(other.label);
    others.delete(key);
  }

  function disposeNameTag(label: THREE.Sprite) {
    label.removeFromParent();
    label.material.map?.dispose();
    label.material.dispose();
  }

  function updatePlayers(states: PlayerState[]) {
    settings.setPlayers(states.map(({ id, name }) => ({ id, name })));
    const ids = new Set(states.map(state => state.id));
    for (const key of others.keys()) {
      if (!ids.has(key)) removePlayer(key);
    }
    for (const state of states) {
      let other = others.get(state.id);
      if (!other) {
        const avatar = makeAvatar(state.color);
        avatar.position.set(state.x, state.y, state.z);
        avatar.rotation.y = state.yaw;
        const label = makeNameTag(state.name);
        avatar.add(label);
        scene.add(avatar);
        other = { avatar, label, name: state.name, target: new THREE.Vector3(), yaw: state.yaw };
        others.set(state.id, other);
      }
      if (other.name !== state.name) {
        disposeNameTag(other.label);
        other.name = state.name;
        other.label = makeNameTag(state.name);
        other.avatar.add(other.label);
      }
      other.target.set(state.x, state.y, state.z);
      other.yaw = state.yaw;
    }
  }

  dialog.addEventListener('cancel', event => event.preventDefault());
  input.addEventListener('input', () => input.setCustomValidity(''));
  form.addEventListener('submit', event => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name || /[\p{Cc}\p{Cf}]/u.test(name)) {
      input.setCustomValidity('Escribe un apodo válido.');
      input.reportValidity();
      return;
    }

    button.disabled = true;
    status.textContent = 'Conectando…';
    const connection = new EventSource(serverUrl + '/lan/join?' + new URLSearchParams({ name }));
    stream = connection;

    connection.addEventListener('ready', event => {
      const ready = JSON.parse(event.data) as {
        id: string; token: string; x: number; z: number; color: number; worldTime?: number; moderation?: boolean;
      };
      token = ready.token;
      settings.setConnected(true, ready.moderation);
      playerId = ready.id;
      if (ready.worldTime !== undefined) clockStart = performance.now() - ready.worldTime;
      chat.setConnected(ready.worldTime !== undefined);
      setColor(ready.color);
      lastSent = '';
      nextSend = 0;
      networkStatus.hidden = true;
      if (joined) return;
      joined = true;
      spawn(ready.x, ready.z);
      dialog.close();
    });
    connection.addEventListener('players', event => {
      if (token) updatePlayers(JSON.parse(event.data) as PlayerState[]);
    });
    connection.addEventListener('renamed', event => {
      input.value = (JSON.parse(event.data) as { name: string }).name;
    });
    connection.addEventListener('kicked', () => {
      connection.close();
      stream = null;
      token = null;
      joined = false;
      settings.setConnected(false);
      chat.setConnected(false);
      updatePlayers([]);
      button.disabled = false;
      status.textContent = 'Un administrador te expulsó de la partida.';
      dialog.showModal();
    });
    connection.addEventListener('chat', event => {
      if (!token) return;
      const { id, name, phrase } = JSON.parse(event.data) as { id: string; name: string; phrase: string };
      const avatar = id === playerId ? player : others.get(id)?.avatar;
      chat.receive(name, phrase, avatar?.position);
    });
    connection.addEventListener('error', () => {
      token = null;
      settings.setConnected(false);
      chat.setConnected(false);
      updatePlayers([]);
      if (joined) {
        networkStatus.textContent = connection.readyState === EventSource.CLOSED
          ? 'Conexión cerrada. Recarga para volver a entrar.'
          : 'Reconectando a la partida LAN…';
        networkStatus.hidden = false;
        return;
      }
      connection.close();
      stream = null;
      button.disabled = false;
      status.textContent = 'No se pudo entrar. Comprueba el servidor o vuelve a intentar.';
    });
  });
  window.addEventListener('pagehide', event => {
    if (!event.persisted) stream?.close();
  });
  dialog.showModal();

  return {
    get entering() { return dialog.open; },
    get settingsOpen() { return settings.open; },
    worldTime(time: number) { return time - clockStart; },
    update(time: number, delta: number) {
      chat.update(delta);
      const mix = 1 - Math.exp(-delta * 16);
      for (const { avatar, target, label, yaw } of others.values()) {
        avatar.position.lerp(target, mix);
        const difference = yaw - avatar.rotation.y;
        avatar.rotation.y += Math.atan2(Math.sin(difference), Math.cos(difference)) * mix;
        label.visible = avatar.position.distanceToSquared(player.position) <= 55 ** 2;
      }

      if (!token || sending || time < nextSend) return;
      nextSend = time + 80;
      const { x, y, z } = player.position;
      const body = JSON.stringify({ token, x, y, z, yaw: player.rotation.y });
      if (body === lastSent) return;
      sending = true;
      void fetch(serverUrl + '/lan/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
      }).then(response => {
        if (response.ok) lastSent = body;
      }).catch(() => {
        // The next update retries if the server is reachable again.
      }).finally(() => { sending = false; });
    }
  };
}
