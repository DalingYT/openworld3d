import './settings.css';

type Player = { id: string; name: string; freeChat?: boolean };
type AdminRequest = { code: string } | { action: 'kick' | 'rename' | 'chat_allow' | 'chat_block'; targetId: string; name?: string };

export function createSettings(request: (data: AdminRequest) => Promise<number>) {
  const trigger = document.querySelector<HTMLButtonElement>('#game-settings')!;
  const adminTrigger = document.querySelector<HTMLButtonElement>('#game-admin')!;
  const dialog = document.querySelector<HTMLDialogElement>('#settings-panel')!;
  const adminPanel = document.querySelector<HTMLDialogElement>('#admin-panel')!;
  const admin = dialog.querySelector<HTMLDetailsElement>('#settings-admin')!;
  const sizes = document.createElement('fieldset');
  const sizesTitle = document.createElement('legend'); sizesTitle.textContent = 'Tamaño de controles'; sizes.append(sizesTitle);
  const defaults = { joystick: 140, chat: 100 };
  let saved: Record<string, unknown> = {};
  try { const value = JSON.parse(localStorage.getItem('openworld3d.ui') ?? '{}'); if (value && typeof value === 'object') saved = value; } catch {}
  const sliders: HTMLInputElement[] = [];
  function persist() {
    try { localStorage.setItem('openworld3d.ui', JSON.stringify(Object.fromEntries(sliders.map(slider => [slider.name, Number(slider.value)])))); } catch {}
  }
  for (const [key, min, max, title] of [['joystick', 90, 190, 'Joystick'], ['chat', 85, 150, 'Chat']] as const) {
    const label = document.createElement('label'), caption = document.createElement('span'), slider = document.createElement('input');
    slider.type = 'range'; slider.name = key; slider.min = String(min); slider.max = String(max); slider.step = '5';
    const value = saved[key];
    slider.value = String(typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : defaults[key]);
    const apply = () => {
      const value = Number(slider.value);
      caption.textContent = `${title}: ${value}${key === 'joystick' ? ' px' : '%'}`;
      document.documentElement.style.setProperty(key === 'joystick' ? '--joystick-size' : '--chat-scale', key === 'joystick' ? value + 'px' : String(value / 100));
    };
    slider.addEventListener('input', () => { apply(); persist(); });
    label.append(caption, slider); sizes.append(label); sliders.push(slider); apply();
  }
  const resetSizes = document.createElement('button'); resetSizes.type = 'button'; resetSizes.textContent = 'Restablecer tamaños';
  resetSizes.addEventListener('click', () => {
    for (const slider of sliders) { slider.value = String(defaults[slider.name as keyof typeof defaults]); slider.dispatchEvent(new Event('input')); }
  });
  const sizeHint = document.createElement('p'); sizeHint.textContent = 'Se ajustan al espacio disponible en tu pantalla.';
  sizes.append(sizeHint, resetSizes); admin.before(sizes);
  const form = dialog.querySelector<HTMLFormElement>('#admin-form')!;
  const input = form.querySelector<HTMLInputElement>('input')!;
  const submit = form.querySelector<HTMLButtonElement>('button')!;
  const status = dialog.querySelector<HTMLElement>('#admin-status')!;
  const coordinates = dialog.querySelector<HTMLInputElement>('#settings-coordinates')!;
  const moderation = adminPanel.querySelector<HTMLFormElement>('#admin-moderation')!;
  const commands = adminPanel.querySelector<HTMLFormElement>('#admin-commands')!;
  const command = commands.querySelector<HTMLInputElement>('input')!;
  const resultStatus = adminPanel.querySelector<HTMLElement>('#moderation-status')!;
  const select = moderation.querySelector<HTMLSelectElement>('select')!;
  const nickname = moderation.querySelector<HTMLInputElement>('input')!;
  const kick = moderation.querySelector<HTMLButtonElement>('#admin-kick')!;
  let players: Player[] = [];
  let busy = false;
  let canModerate = false;
  let playerList = '';
  let session = 0;

  function updatePlayers() {
    if (adminTrigger.hidden) return;
    const list = JSON.stringify(players);
    if (list === playerList) return;
    playerList = list;
    const selected = select.value;
    select.replaceChildren(new Option(players.length ? 'Selecciona un jugador' : 'No hay otros jugadores', ''));
    for (const player of players) {
      const duplicate = players.some(other => other !== player && other.name === player.name);
      select.add(new Option((duplicate ? player.name + ' · ' + player.id.slice(0, 5) : player.name) + (player.freeChat ? ' (chat libre)' : ''), player.id));
    }
    select.value = players.some(player => player.id === selected) ? selected : '';
  }

  async function moderate(action: 'kick' | 'rename' | 'chat_allow' | 'chat_block', name = nickname.value.trim()) {
    if (busy || adminTrigger.hidden) return false;
    const target = players.find(player => player.id === select.value);
    if (!target) {
      select.focus();
      resultStatus.textContent = 'Selecciona un jugador.';
      return false;
    }
    if (action === 'rename' && !name) {
      resultStatus.textContent = 'Escribe un nuevo apodo.';
      return false;
    }
    if (action === 'kick' && !window.confirm('¿Expulsar a ' + target.name + ' de la partida?')) return false;
    const requestSession = session;
    busy = true;
    const result = await request({ action, targetId: target.id, name });
    if (requestSession !== session) return false;
    busy = false;
    if (result === 204) {
      nickname.value = '';
      resultStatus.textContent = action === 'chat_allow' ? 'Chat libre habilitado durante esta sesión.' : action === 'chat_block' ? 'Chat libre bloqueado.' : action === 'kick' ? 'Jugador expulsado.' : 'Apodo cambiado.';
      return true;
    } else {
      resultStatus.textContent = result === 404 ? 'Ese jugador ya salió de la partida.'
        : result === 409 ? 'Los administradores siempre tienen chat libre.' : result === 400 ? 'El apodo no es válido.' : 'No se pudo aplicar la acción.';
      return false;
    }
  }

  moderation.addEventListener('submit', event => {
    event.preventDefault();
    void moderate('rename');
  });
  kick.addEventListener('click', () => { void moderate('kick'); });
  for (const [action, label] of [['chat_allow', 'Permitir chat libre'], ['chat_block', 'Bloquear chat libre']] as const) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    button.addEventListener('click', () => { void moderate(action); });
    kick.parentElement!.append(button);
  }
  commands.addEventListener('submit', async event => {
    event.preventDefault();
    const text = command.value.trim();
    const rename = /^\/rename\s+(.+)$/.exec(text);
    if (text !== '/kick' && !rename) {
      resultStatus.textContent = 'Usa /kick o /rename seguido del nuevo apodo.';
      return;
    }
    if (await (rename ? moderate('rename', rename[1]) : moderate('kick'))) command.value = '';
  });

  trigger.addEventListener('click', () => dialog.showModal());
  adminTrigger.addEventListener('click', () => adminPanel.showModal());
  dialog.querySelector('#settings-close')!.addEventListener('click', () => dialog.close());
  adminPanel.querySelector('#admin-close')!.addEventListener('click', () => adminPanel.close());
  dialog.addEventListener('close', () => { input.value = ''; });
  admin.addEventListener('toggle', () => {
    if (admin.open && !form.hidden) input.focus();
  });
  coordinates.addEventListener('change', () => {
    document.body.classList.toggle('hide-coordinates', !coordinates.checked);
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submit.disabled) return;
    const requestSession = session;
    const code = input.value;
    input.value = '';
    submit.disabled = true;
    status.textContent = 'Comprobando…';
    const result = await request({ code });
    if (requestSession !== session) return;
    submit.disabled = false;

    if (result === 204) {
      form.hidden = true;
      adminTrigger.hidden = !canModerate;
      updatePlayers();
      status.textContent = 'Sesión de administrador activa.';
      return;
    }
    status.textContent = result === 403 ? 'Código incorrecto.'
      : result === 429 ? 'Demasiados intentos. Espera un minuto.'
        : result === 503 ? 'El servidor aún no tiene un código de administrador.'
          : 'No se pudo verificar el código.';
  });

  return {
    get open() { return dialog.open || adminPanel.open; },
    setPlayers(value: Player[]) {
      players = value;
      updatePlayers();
    },
    setConnected(connected: boolean, moderationAvailable = false) {
      session++;
      canModerate = moderationAvailable;
      trigger.hidden = !connected;
      adminTrigger.hidden = true;
      dialog.close();
      adminPanel.close();
      admin.open = false;
      form.reset();
      form.hidden = false;
      moderation.reset();
      commands.reset();
      resultStatus.textContent = '';
      playerList = '';
      busy = false;
      submit.disabled = false;
      status.textContent = '';
    }
  };
}
