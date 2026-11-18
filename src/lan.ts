import { createPhone } from './phone';
import { outfit, poseEmote } from './customization';
import { createVehicleRoster } from './vehicle-roster';
import { createAnnouncements } from './announcements';
import { createLife } from './life';
import type { World } from './world';
import * as THREE from 'three';
import { createChat } from './chat';
import { createSettings } from './settings';
import { createHatShop, equipHat } from './hats';
import type { CarState, Cars } from './cars';
import { makeNameTag, disposeNameTag } from './name-tag';

const serverUrl = (import.meta.env.VITE_MULTIPLAYER_URL ?? '').replace(/\/+$/, '');

type PlayerState = {
  id: string;
  name: string;
  color: number;
  freeChat?: boolean;
  x: number;
  y: number;
  z: number;
  yaw: number;
  car?: string | null;
  outfit?: string;
  hat?: string | null;
};

export function createLan(
  scene: THREE.Scene,
  player: THREE.Group,
  makeAvatar: (color: number) => THREE.Group,
  spawn: (x: number, z: number) => void,
  setColor: (color: number) => void,
  cars: Cars,
  world: World
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

  const roster = document.createElement('details');
  roster.id = 'player-list';
  roster.hidden = true;
  const rosterTitle = document.createElement('summary');
  const rosterNames = document.createElement('ul');
  roster.append(rosterTitle, rosterNames);
  document.querySelector('#game-status')!.append(roster);
  roster.addEventListener('pointerdown', () => { if (document.pointerLockElement) document.exitPointerLock(); });
  let rosterSignature = '';
  function showRoster(states: PlayerState[]) {
    roster.hidden = !token;
    const names = [input.value.trim() + ' (tú)', ...states.map(state => state.name)];
    const signature = JSON.stringify(names);
    if (signature === rosterSignature) return;
    rosterSignature = signature;
    rosterTitle.textContent = 'Jugadores · ' + names.length;
    rosterNames.replaceChildren(...names.map(name => {
      const item = document.createElement('li'); item.textContent = name; return item;
    }));
  }

  let stream: EventSource | null = null;
  let token: string | null = null;
  let joined = false;
  let nextSend = 0;
  let lastSent = '';
  let sending = false;
  let playerId = '';
  let carsAvailable = false;
  const vehicleRoster = createVehicleRoster(async targetId => {
    if(!token)return false;
    try {return (await fetch(serverUrl+'/lan/move',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,ride:'eject',targetId})})).ok;}catch{return false;}
  });
  let flying = false;
  let isAdmin = false;
  let noclip = false;
  let groundCar = false;
  let waterproof = false;
  let reloadPending = false;
  let clientId: string = Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
  try { clientId = localStorage.getItem('openworld3d.client') || clientId; localStorage.setItem('openworld3d.client',clientId); } catch {}
  const announcements = createAnnouncements();
  const life = createLife(scene, world, async social => {
    if (!token) return 404;
    try { return (await fetch(serverUrl + '/lan/move', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,social})})).status; } catch { return 0; }
  }, spawn);
  const shop = createHatShop(player, setColor);
  const emotes = new Map<string,{id:string;until:number}>();
  const phone=createPhone(scene,async activity=>{
    if(!token)return 404;
    try{return (await fetch(serverUrl+'/lan/move',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,activity})})).status;}catch{return 0;}
  });
  const seatedSelf = makeAvatar(0x3366ff); seatedSelf.visible=false; scene.add(seatedSelf);
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
  const chat = createChat(scene, async message => {
    if (!token) return false;
    try {
      const response = await fetch(serverUrl + '/lan/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ...message })
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

  function updatePlayers(states: PlayerState[]) {
    showRoster(states);
    vehicleRoster.setPlayers(states);
    life.setPlayers(states.map(({id,name})=>({id,name})));
    settings.setPlayers(states.map(({ id, name, freeChat }) => ({ id, name, freeChat })));
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
      const body = other.avatar.getObjectByName('body') as THREE.Mesh<THREE.BoxGeometry, THREE.MeshLambertMaterial>;
      if (body.material.color.getHex() !== state.color) {
        const template = makeAvatar(state.color).getObjectByName('body') as THREE.Mesh;
        body.material = template.material as THREE.MeshLambertMaterial;
      }
      other.target.set(state.x, state.y, state.z);
      other.yaw = state.yaw;
      equipHat(other.avatar, state.hat);
      outfit(other.avatar,state.outfit??'none');
      other.label.position.y = state.hat ? 3.02 : 2.45;
      other.avatar.visible = true;
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
    const connection = new EventSource(serverUrl + '/lan/join?' + new URLSearchParams({ name, clientId }));
    stream = connection;

    connection.addEventListener('ready', event => {
      const ready = JSON.parse(event.data) as {
        id: string; token: string; x: number; z: number; color: number;
        sessionFeatures?: boolean; worldTime?: number; moderation?: boolean; spawnCars?: boolean;
      };
      token = ready.token;
      shop.setConnected(true);
      settings.setConnected(true, ready.moderation);
      playerId = ready.id;
      phone.setConnected(ready.id);emotes.clear();
      vehicleRoster.setSelf(ready.id,name);
      flying = false;
      isAdmin = false; noclip = false; groundCar = false; waterproof = false;
      life.setConnected(ready.id, ready.sessionFeatures === true);
      carsAvailable = ready.spawnCars === true;
      cars.setDriver(ready.id);
      if (ready.worldTime !== undefined) clockStart = performance.now() - ready.worldTime;
      chat.setConnected(ready.worldTime !== undefined);
      shop.initializeColor(ready.color);
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
    connection.addEventListener('cars', event => {
      if (token && carsAvailable) {const data=JSON.parse(event.data) as CarState[];cars.receive(data);vehicleRoster.setCars(data);}
    });
    connection.addEventListener('renamed', event => {
      input.value = (JSON.parse(event.data) as { name: string }).name;
      vehicleRoster.setSelf(playerId,input.value);
    });
    connection.addEventListener('kicked', event => {
      const removal = event.data ? JSON.parse(event.data) : {};
      connection.close();
      stream = null;
      token = null;
      announcements.clear();
      flying = false;
      isAdmin = false; noclip = false; groundCar = false; waterproof = false;
      life.setConnected('', false);
      shop.setConnected(false);
      carsAvailable = false;
      cars.setDriver('');
      cars.receive([]);
      phone.setConnected('');emotes.clear();
      vehicleRoster.setCars([]);
      joined = false;
      settings.setConnected(false);
      chat.setConnected(false);
      updatePlayers([]);
      button.disabled = false;
      status.textContent = removal.reason ?? (removal.until ? 'Veto temporal por mensajes filtrados. Podrás volver a las ' + new Date(removal.until).toLocaleTimeString() + '.' : 'Un administrador te expulsó de la partida.');
      dialog.showModal();
    });
    connection.addEventListener('teleport', event => {if(token){const data=JSON.parse(event.data);spawn(data.x,data.z);cars.teleport(data.x,data.z);lastSent='';}});
    connection.addEventListener('reload', () => {
      if(!token || reloadPending)return;
      reloadPending=true;
      announcements.show('Sistema','Un administrador recargará la partida para todos en 3 segundos. Se reiniciará tu sesión.');
      window.setTimeout(()=>location.reload(),3000);
    });
    connection.addEventListener('activities',event=>{if(token)phone.receiveProfile(JSON.parse(event.data));});
    connection.addEventListener('football',event=>{if(token)phone.receiveFootball(JSON.parse(event.data));});
    connection.addEventListener('emote',event=>{if(token){const data=JSON.parse(event.data);emotes.set(data.id,{id:data.emote,until:performance.now()+data.duration});}});
    connection.addEventListener('announcement', event => {
      if (token) { const data = JSON.parse(event.data); announcements.show(data.name, data.text); }
    });
    connection.addEventListener('permissions', event => {
      if (!token) return;
      const permissions = JSON.parse(event.data);
      if(permissions.waterproof !== undefined)waterproof=permissions.waterproof===true;
      if(permissions.groundCar !== undefined)groundCar=permissions.groundCar===true;
      if(permissions.noclip !== undefined)noclip=permissions.noclip===true;
      if(permissions.admin !== undefined)isAdmin=permissions.admin===true;
      chat.setFreeChat(permissions.freeChat === true);
      flying = permissions.flying === true;
    });
    connection.addEventListener('profile', event => { if(token){const data=JSON.parse(event.data);flying=data.flying===true;life.receiveProfile(data);} });
    connection.addEventListener('houses', event => { if(token)life.receiveHomes(JSON.parse(event.data)); });
    connection.addEventListener('home_visit', event => { if(token)life.visit(JSON.parse(event.data).houseId); });
    connection.addEventListener('chat', event => {
      if (!token) return;
      const { id, name, phrase, text } = JSON.parse(event.data) as { id: string; name: string; phrase?: string; text?: string };
      const avatar = id === playerId ? player : others.get(id)?.avatar;
      chat.receive(name, phrase, avatar?.position, text);
    });
    connection.addEventListener('error', () => {
      token = null;
      announcements.clear();
      flying = false;
      isAdmin = false; noclip = false; groundCar = false; waterproof = false;
      life.setConnected('', false);
      shop.setConnected(false);
      carsAvailable = false;
      cars.setDriver('');
      cars.receive([]);
      phone.setConnected('');emotes.clear();
      vehicleRoster.setCars([]);
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
    get waterproof() { return waterproof; },
    get groundCar() { return groundCar; },
    get noclip() { return noclip; },
    get admin() { return isAdmin; },
    get flying() { return flying; },
    get entering() { return dialog.open; },
    get canRun(){return phone.canRun;},
    get sleeping(){return phone.sleeping;},
    get footballField(){return phone.field;},
    get settingsOpen() { return phone.open || phone.sleeping || settings.open || shop.open || chat.typing || life.open; },
    get carsAvailable() { return carsAvailable; },
    async ride(ride: string, vehicleType: 'car' | 'taxi' | 'boat' | 'boat4' = 'car') {
      if (!token || !carsAvailable) return false;
      try {
        const response = await fetch(serverUrl + '/lan/move', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, ride, vehicleType, boatSpawn: ['boat','boat4'].includes(vehicleType) ? cars.boatSpawn(player.position,player.rotation.y) : undefined, color: shop.color })
        });
        return response.ok;
      } catch {
        return false;
      }
    },
    worldTime(time: number) { return time - clockStart; },
    update(time: number, delta: number, thirdPerson = false) {
      chat.update(delta);phone.update(time,delta);
      outfit(player,phone.outfit);outfit(seatedSelf,phone.outfit);
      for(const [id,emote]of emotes)if(emote.until<time)emotes.delete(id);
      if(!cars.riding)poseEmote(player,emotes.get(playerId)?.id??null,time);
      const mix = 1 - Math.exp(-delta * 16);
      seatedSelf.visible = thirdPerson && cars.seatAvatar(playerId,seatedSelf);
      if(seatedSelf.visible) {
        (seatedSelf.getObjectByName('body') as THREE.Mesh).material=(player.getObjectByName('body') as THREE.Mesh).material;
        equipHat(seatedSelf,shop.selected);
      }
      for (const [id,{ avatar, target, label, yaw }] of others) {
        if(cars.seatAvatar(id,avatar)) {
          avatar.visible=true;label.visible=avatar.position.distanceToSquared(player.position)<=55**2;continue;
        }
        avatar.scale.set(1,1,1);avatar.rotation.x=avatar.rotation.z=0;
        avatar.position.lerp(target, mix);
        const difference = yaw - avatar.rotation.y;
        avatar.rotation.y += Math.atan2(Math.sin(difference), Math.cos(difference)) * mix;
        poseEmote(avatar,emotes.get(id)?.id??null,time);
        label.visible = avatar.position.distanceToSquared(player.position) <= 55 ** 2;
      }

      if (!token || sending || time < nextSend) return;
      nextSend = time + 80;
      const { x, y, z } = player.position;
      const body = JSON.stringify({
        token, x, y, z, yaw: player.rotation.y, drivingCar: cars.drivingId,
        ...cars.attitude, carImpact: cars.impactRevision, speedMode: cars.speedMode, hat: shop.selected, color: shop.color
      });
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
