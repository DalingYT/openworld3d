export function setupTouch(
  canvas: HTMLCanvasElement,
  actions: { look: (dx: number, dy: number) => void; jump: () => void; camera: () => void }
) {
  const joystick = document.querySelector<HTMLDivElement>('#joystick')!;
  const knob = joystick.querySelector<HTMLElement>('span')!;
  const run = document.querySelector<HTMLButtonElement>('#touch-run')!;
  const touch = { x: 0, y: 0, running: false };
  let stickId: number | null = null;
  let lookId: number | null = null;
  let lookX = 0;
  let lookY = 0;

  function moveStick(event: PointerEvent) {
    const { left, top, width, height } = joystick.getBoundingClientRect();
    const radius = width * 0.34;
    const x = (event.clientX - left - width / 2) / radius;
    const y = (event.clientY - top - height / 2) / radius;
    const scale = Math.max(1, Math.hypot(x, y));
    const dx = x / scale;
    const dy = y / scale;
    touch.x = Math.abs(dx) < 0.08 ? 0 : dx;
    touch.y = Math.abs(dy) < 0.08 ? 0 : -dy;
    knob.style.translate = dx * radius + 'px ' + dy * radius + 'px';
  }

  function resetStick() {
    stickId = null;
    touch.x = 0;
    touch.y = 0;
    knob.style.translate = '';
  }

  joystick.addEventListener('pointerdown', event => {
    if (event.button !== 0 || stickId !== null) return;
    event.preventDefault();
    stickId = event.pointerId;
    joystick.setPointerCapture(stickId);
    moveStick(event);
  });
  joystick.addEventListener('pointermove', event => {
    if (event.pointerId === stickId) moveStick(event);
  });

  canvas.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' || lookId !== null) return;
    document.documentElement.classList.add('touch-input');
    event.preventDefault();
    lookId = event.pointerId;
    lookX = event.clientX;
    lookY = event.clientY;
    canvas.setPointerCapture(lookId);
  });
  canvas.addEventListener('pointermove', event => {
    if (event.pointerId !== lookId) return;
    actions.look(event.clientX - lookX, event.clientY - lookY);
    lookX = event.clientX;
    lookY = event.clientY;
  });

  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
    joystick.addEventListener(type, event => {
      if (event.pointerId === stickId) resetStick();
    });
    canvas.addEventListener(type, event => {
      if (event.pointerId === lookId) lookId = null;
    });
  }

  function setRunning(running: boolean) {
    touch.running = running;
    run.setAttribute('aria-pressed', String(running));
  }

  document.querySelector('#touch-jump')!.addEventListener('click', actions.jump);
  document.querySelector('#touch-camera')!.addEventListener('click', actions.camera);
  run.addEventListener('click', () => setRunning(!touch.running));
  window.addEventListener('blur', () => {
    resetStick();
    lookId = null;
    setRunning(false);
  });

  return touch;
}
