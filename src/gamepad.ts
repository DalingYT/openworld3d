export function createGamepad(actions: { jump: () => void; camera: () => void; ride: () => void }) {
  const dialog = document.createElement('dialog'); dialog.id = 'controller-panel';
  const heading = document.createElement('h2'); heading.textContent = 'Hemos detectado un control en este dispositivo, ¿qué control es el adecuado?';
  const notice = document.createElement('p'); notice.textContent = 'Si apareció este mensaje y no tienes un control conectado, solo cierra este menú.';
  const help = document.createElement('p');
  const choices = document.createElement('div');
  const skipCamera = document.createElement('button'); skipCamera.type = 'button'; skipCamera.textContent = 'Mi mando no tiene stick derecho'; skipCamera.hidden = true;
  skipCamera.addEventListener('click', () => {
    if (!calibration || calibration.step < 6) return;
    mapping.axes.splice(2, 2, -1, -1); mapping.signs.splice(2, 2, 1, 1); mapping.centers.splice(2, 2, 0, 0);
    calibration.step = 8; calibration.release = true; skipCamera.hidden = true;
    help.textContent = 'Centra el stick para terminar. Puedes mover la cámara con el ratón o la pantalla táctil.';
  });
  const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Cerrar';
  dialog.append(heading, choices, help, skipCamera, notice, close); document.body.append(dialog);
  const connected = new Map<number, string>(), accepted = new Set<number>();
  let selected = -1, pending = -1, previous = new Set<number>();
  let mapping = { buttons: [0, 3, 2, 10], axes: [0, 1, 2, 3], signs: [1, -1, 1, 1], centers: [0, 0, 0, 0] };
  let calibration: { index: number; name: string; step: number; release: boolean; baseline: number[] } | null = null;
  const prompts = ['Pulsa el botón para saltar.', 'Pulsa el botón para cambiar de cámara.', 'Pulsa el botón para subir o bajar del carro.', 'Pulsa el botón para correr.', 'Mueve el stick izquierdo hacia la derecha.', 'Mueve el stick izquierdo hacia adelante.', 'Mueve el stick derecho hacia la derecha.', 'Mueve el stick derecho hacia abajo.'];
  function prompt() { skipCamera.hidden = !calibration || calibration.step < 6; if (calibration) help.textContent = `Configurar ${calibration.name} (${calibration.step + 1}/8): ${prompts[calibration.step]}`; }
  const input = { x: 0, y: 0, lookX: 0, lookY: 0, running: false };
  const axis = (value = 0) => Math.abs(value) < 0.18 ? 0 : Math.sign(value) * Math.min(1, (Math.abs(value) - 0.18) / 0.82);
  function pads() { try { return navigator.getGamepads ? Array.from(navigator.getGamepads()).filter((p): p is Gamepad => Boolean(p?.connected)) : []; } catch { return []; } }
  function brand(pad: Gamepad) {
    const id = pad.id.toLowerCase();
    if (/nintendo|switch|057e/.test(id)) return 'Nintendo';
    if (/playstation|dualsense|dualshock|054c|sony/.test(id)) return 'PlayStation';
    if (/xbox|xinput|045e|microsoft/.test(id)) return 'Xbox';
    return 'Genérico';
  }
  function suggest(pad?: Gamepad) {
    const detected = pad ? brand(pad) : 'Genérico';
    help.textContent = pad ? `Tipo detectado: ${detected}. Confirma cuál es tu control.` : 'Conecta un mando y pulsa un botón.';
    for (const button of choices.querySelectorAll('button')) {
      button.setAttribute('aria-pressed', String(button.textContent === detected));
    }
  }
  for (const [name, jump, camera, ride] of [['Xbox', 'A', 'Y', 'X'], ['PlayStation', '✕', '△', '□'], ['Nintendo', 'B', 'X', 'Y'], ['Genérico', '1', '4', '3']]) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = name;
    button.addEventListener('click', () => {
      const pad = pads().find(p => p.index === pending) ?? pads()[0];
      if (!pad) { help.textContent = 'Conecta un mando y pulsa uno de sus botones para que el navegador lo detecte.'; return; }
      if (pad.mapping !== 'standard') {
        selected = -1; previous.clear();
        mapping = { buttons: [], axes: [], signs: [], centers: [] };
        calibration = { index: pad.index, name, step: 0, release: true, baseline: [...pad.axes] };
        choices.hidden = true; prompt(); return;
      }
      mapping = { buttons: [0, 3, 2, 10], axes: [0, 1, 2, 3], signs: [1, -1, 1, 1], centers: [0, 0, 0, 0] };
      selected = pad.index; accepted.add(selected); previous = new Set(pad.buttons.flatMap((b, i) => b.pressed ? [i] : []));
      status.textContent = `${name}: stick izquierdo mover · derecho mirar · ${jump} saltar · ${camera} cámara · ${ride} subir/bajar · L3 correr`;
      dialog.close();
    });
    choices.append(button);
  }
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { calibration = null; choices.hidden = false; skipCamera.hidden = true; });
  const status = document.createElement('p'); status.textContent = 'Conecta un mando y pulsa un botón para detectarlo.';
  const configure = document.createElement('button'); configure.type = 'button'; configure.textContent = 'Configurar mando';
  configure.addEventListener('click', () => {
    pending = pads()[0]?.index ?? -1;
    (document.querySelector('#settings-panel') as HTMLDialogElement).close();
    suggest(pads().find(p => p.index === pending));
    dialog.showModal();
  });
  const section = document.createElement('fieldset'), legend = document.createElement('legend'); legend.textContent = 'Mando'; section.append(legend, status, configure);
  document.querySelector('#settings-admin')!.before(section);
  return {
    get open() { return dialog.open; },
    input,
    update(available: boolean) {
      input.x = input.y = input.lookX = input.lookY = 0; input.running = false;
      const list = pads();
      for (const index of connected.keys()) if (!list.some(p => p.index === index)) {
        connected.delete(index); accepted.delete(index);
        if (selected === index) { selected = -1; previous.clear(); status.textContent = 'Mando desconectado.'; }
      }
      const fresh = list.find(p => connected.get(p.index) !== p.id);
      if (fresh && available && !document.querySelector('dialog[open]')) {
        connected.set(fresh.index, fresh.id); pending = fresh.index;
        suggest(fresh);
        if (document.pointerLockElement) document.exitPointerLock(); dialog.showModal();
      }
      if (calibration) {
        const c = calibration, device = list.find(p => p.index === c.index);
        if (!device) { calibration = null; choices.hidden = false; skipCamera.hidden = true; help.textContent = 'Mando desconectado. Vuelve a conectarlo y selecciona su tipo.'; return; }
        const deltas = device.axes.map((v, i) => v - (c.baseline[i] ?? 0));
        if (c.release) {
          if (!device.buttons.some(b => b.pressed) && deltas.every(v => Math.abs(v) < 0.2)) {
            c.release = false;
            if (c.step === 8) {
              selected = device.index; accepted.add(selected); previous.clear();
              status.textContent = `${c.name} configurado: controles personalizados activos.`;
              dialog.close(); calibration = null; choices.hidden = false; skipCamera.hidden = true;
            } else prompt();
          }
          return;
        }
        if (c.step < 4) {
          const index = device.buttons.findIndex(b => b.pressed);
          if (index < 0) return;
          if (mapping.buttons.includes(index)) { help.textContent = 'Elige otro botón: ese ya está asignado.'; c.release = true; return; }
          mapping.buttons.push(index);
        } else {
          const index = deltas.findIndex((v, i) => Math.abs(v) > 0.65 && !mapping.axes.includes(i));
          if (index < 0) return;
          mapping.axes.push(index); mapping.signs.push(Math.sign(deltas[index])); mapping.centers.push(c.baseline[index]);
        }
        c.step++; c.release = true; help.textContent = 'Suelta el botón y centra los sticks para continuar.';
        return;
      }
      const pad = list.find(p => p.index === selected && accepted.has(p.index));
      if (!pad) return;
      const pressed = new Set(pad.buttons.flatMap((b, i) => b.pressed ? [i] : []));
      if (available && !dialog.open && !document.hidden) {
        input.x = axis((pad.axes[mapping.axes[0]] ?? 0) - mapping.centers[0]) * mapping.signs[0]; input.y = axis((pad.axes[mapping.axes[1]] ?? 0) - mapping.centers[1]) * mapping.signs[1];
        input.lookX = axis((pad.axes[mapping.axes[2]] ?? 0) - mapping.centers[2]) * mapping.signs[2]; input.lookY = axis((pad.axes[mapping.axes[3]] ?? 0) - mapping.centers[3]) * mapping.signs[3];
        input.running = pressed.has(mapping.buttons[3]);
        if (pressed.has(mapping.buttons[0]) && !previous.has(mapping.buttons[0])) actions.jump();
        if (pressed.has(mapping.buttons[1]) && !previous.has(mapping.buttons[1])) actions.camera();
        if (pressed.has(mapping.buttons[2]) && !previous.has(mapping.buttons[2])) actions.ride();
      }
      previous = pressed;
    }
  };
}
