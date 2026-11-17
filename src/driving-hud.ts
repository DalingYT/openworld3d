import './driving-hud.css';

export function createDrivingHud() {
  const panel = document.createElement('span');
  panel.id = 'driving-hud'; panel.hidden = true;
  const label = document.createElement('label'); label.textContent = 'Velocidad ';
  const select = document.createElement('select'); select.setAttribute('aria-label', 'Velocidad del carro');
  for (const [name, value] of [['Paseo', '0.65'], ['Normal', '1'], ['Deportivo', '1.35'], ['Extremo', '3'], ['Modo Inquientante', '5']]) {
    select.add(new Option(name, value));
  }
  select.value = '1'; label.append(select);
  const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Nitro (Shift)';
  button.title = 'Mantén pulsado para acelerar con nitro';
  const charge = document.createElement('progress'); charge.max = 1; charge.value = 1;
  charge.setAttribute('aria-label', 'Carga de nitro');
  const speed = document.createElement('span');
  panel.append(label, button, charge, speed);
  document.querySelector('#car-controls')!.append(panel);
  const fps = document.createElement('p'); fps.textContent = 'FPS: —';
  document.querySelector('#game-status')!.append(fps);
  let held = false, frames = 0, since = 0;
  button.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault(); button.setPointerCapture(event.pointerId); held = true;
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    button.addEventListener(type, () => { held = false; });
  }
  window.addEventListener('blur', () => { held = false; frames = 0; since = 0; });
  document.addEventListener('visibilitychange', () => { held = false; frames = 0; since = 0; });
  return {
    get boost() { return held; },
    get speedMode() { return Number(select.value); },
    update(time: number, driving: boolean, fuel: number, velocity: number, admin = false) {
      const death = select.querySelector('option[value="8"]');
      if (admin && !death) select.add(new Option('Muerte', '8'));
      if (!admin && death) { if(select.value === '8')select.value='1'; death.remove(); }
      panel.hidden = !driving;
      if (!driving) held = false;
      if (!since) since = time;
      frames++;
      if (time - since >= 500) {
        fps.textContent = `FPS: ${Math.round(frames * 1000 / (time - since))}`;
        frames = 0; since = time;
        if (driving) {
          charge.value = fuel;
          speed.textContent = `${Math.round(velocity * 3.6)} km/h`;
        }
      }
    }
  };
}
