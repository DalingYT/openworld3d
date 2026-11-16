export function createGamepad(actions: { jump: () => void; camera: () => void; ride: () => void }) {
  const dialog = document.createElement('dialog'); dialog.id = 'controller-panel';
  const heading = document.createElement('h2'); heading.textContent = 'Hemos detectado un control en este dispositivo, ¿qué control es el adecuado?';
  const notice = document.createElement('p'); notice.textContent = 'Si apareció este mensaje y no tienes un control conectado, solo cierra este menú.';
  const help = document.createElement('p');
  const choices = document.createElement('div');
  const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Cerrar';
  dialog.append(heading, choices, help, notice, close); document.body.append(dialog);
  const connected = new Map<number, string>(), accepted = new Set<number>();
  let selected = -1, pending = -1, previous = new Set<number>();
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
      const pad = pads().find(p => p.index === pending);
      if (!pad) { help.textContent = 'Conecta un mando y pulsa uno de sus botones para que el navegador lo detecte.'; return; }
      if (pad.mapping !== 'standard') { help.textContent = 'Este mando no tiene un mapa estándar en el navegador. Prueba su modo XInput o un mando compatible.'; return; }
      selected = pad.index; accepted.add(selected); previous = new Set(pad.buttons.flatMap((b, i) => b.pressed ? [i] : []));
      status.textContent = `${name}: stick izquierdo mover · derecho mirar · ${jump} saltar · ${camera} cámara · ${ride} subir/bajar · L3 correr`;
      dialog.close();
    });
    choices.append(button);
  }
  close.addEventListener('click', () => dialog.close());
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
      const pad = list.find(p => p.index === selected && accepted.has(p.index));
      if (!pad) return;
      const pressed = new Set(pad.buttons.flatMap((b, i) => b.pressed ? [i] : []));
      if (available && !dialog.open && !document.hidden) {
        input.x = axis(pad.axes[0]); input.y = -axis(pad.axes[1]);
        input.lookX = axis(pad.axes[2]); input.lookY = axis(pad.axes[3]);
        input.running = pressed.has(10);
        if (pressed.has(0) && !previous.has(0)) actions.jump();
        if (pressed.has(3) && !previous.has(3)) actions.camera();
        if (pressed.has(2) && !previous.has(2)) actions.ride();
      }
      previous = pressed;
    }
  };
}
