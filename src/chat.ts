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
    buttons.append(button);
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
    },
    update(delta: number) {
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
