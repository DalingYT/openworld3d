import * as THREE from 'three';
import phrases from '../shared/phrases.json';
import './chat.css';

export function createChat(scene: THREE.Scene, send: (phrase: string) => Promise<boolean>) {
  const panel = document.createElement('details');
  panel.id = 'game-chat';
  panel.hidden = true;
  const toggle = document.createElement('summary');
  toggle.textContent = 'Chat';
  const messages = document.createElement('ol');
  messages.setAttribute('role', 'log');
  messages.setAttribute('aria-label', 'Mensajes de la partida');
  const buttons = document.createElement('div');
  const notice = document.createElement('p');
  notice.setAttribute('role', 'status');
  panel.append(toggle, messages, buttons, notice);
  document.body.append(panel);

  const reactions = new Map<THREE.Vector3, { sprite: THREE.Sprite; age: number }>();
  function removeReaction(position: THREE.Vector3) {
    const reaction = reactions.get(position); if (!reaction) return;
    reaction.sprite.removeFromParent(); reaction.sprite.material.map?.dispose(); reaction.sprite.material.dispose(); reactions.delete(position);
  }
  const reactionButtons = document.createElement('div');
  const reactionTitle = document.createElement('strong'); reactionTitle.textContent = 'Reacciones';
  panel.append(reactionTitle, reactionButtons);
  let sending = false;
  for (const [phrase, text] of Object.entries(phrases)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    button.addEventListener('click', async () => {
      if (sending) return;
      sending = true;
      notice.textContent = '';
      if (!await send(phrase)) notice.textContent = 'Espera un momento e inténtalo de nuevo.';
      sending = false;
    });
    (phrase.startsWith('emoji') ? reactionButtons : buttons).append(button);
  }

  // Every burst uses the same material and one draw call.
  const particles = new THREE.PointsMaterial({ size: 0.13, vertexColors: true });
  const colors = [0xffdc57, 0xff55a5, 0x55dcff, 0xb6fb76].map(value => new THREE.Color(value));
  const bursts = new Set<{ points: THREE.Points; velocity: Float32Array; age: number }>();

  function celebrate(position: THREE.Vector3) {
    const count = 24;
    const locations = new Float32Array(count * 3);
    const velocity = new Float32Array(count * 3);
    const rgb = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 2.5;
      velocity.set([Math.cos(angle) * speed, 2.5 + Math.random() * 3, Math.sin(angle) * speed], i * 3);
      colors[i % colors.length].toArray(rgb, i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(locations, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
    const points = new THREE.Points(geometry, particles);
    points.position.copy(position);
    points.position.y += 2.3;
    points.frustumCulled = false;
    scene.add(points);
    bursts.add({ points, velocity, age: 0 });
  }

  return {
    setConnected(value: boolean) {
      panel.hidden = !value;
      if (!value) {
        panel.open = false;
        messages.replaceChildren();
        for (const position of reactions.keys()) removeReaction(position);
        toggle.textContent = 'Chat';
      }
    },
    receive(name: string, phrase: string, position?: THREE.Vector3) {
      if (!Object.hasOwn(phrases, phrase)) return;
      const line = document.createElement('li');
      const speaker = document.createElement('strong');
      speaker.textContent = name + ' ';
      line.append(speaker, phrases[phrase as keyof typeof phrases]);
      messages.append(line);
      if (messages.childElementCount > 5) messages.firstElementChild?.remove();
      toggle.textContent = panel.open ? 'Chat' : name + ' · ' + phrases[phrase as keyof typeof phrases];
      if (phrase === 'party' && position) celebrate(position);
      if (phrase.startsWith('emoji') && position) {
        removeReaction(position);
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
        const ctx = canvas.getContext('2d')!;
        ctx.font = '90px "Segoe UI Emoji", "Apple Color Emoji", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(phrases[phrase as keyof typeof phrases], 64, 68);
        const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, depthWrite: false }));
        sprite.scale.setScalar(1.5); sprite.position.copy(position); sprite.position.y += 3.8;
        scene.add(sprite); reactions.set(position, {sprite, age: 0});
      }
    },
    update(delta: number) {
      for (const [position, reaction] of reactions) {
        reaction.age += delta;
        if (reaction.age > 3) { removeReaction(position); continue; }
        reaction.sprite.position.copy(position); reaction.sprite.position.y += 3.8;
      }
      for (const burst of bursts) {
        burst.age += delta;
        if (burst.age >= 1.5) {
          burst.points.removeFromParent();
          burst.points.geometry.dispose();
          bursts.delete(burst);
          continue;
        }
        const positions = burst.points.geometry.getAttribute('position');
        for (let i = 0; i < burst.velocity.length; i += 3) {
          burst.velocity[i + 1] -= 7 * delta;
          positions.array[i] += burst.velocity[i] * delta;
          positions.array[i + 1] += burst.velocity[i + 1] * delta;
          positions.array[i + 2] += burst.velocity[i + 2] * delta;
        }
        positions.needsUpdate = true;
      }
    }
  };
}
