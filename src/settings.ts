import './settings.css';

type Player = { id: string; name: string; freeChat?: boolean };
type AdminRequest = {action:'tp'|'bring';targetId:string} | { code: string } | {action:'announce';text:string} | {action:'noclip'|'clip'|'groundcar'|'freecar'|'waterproof'|'waternormal'|'reloadall';targetId?:string} | { action: 'kick' | 'rename' | 'chat_allow' | 'chat_block' | 'fly' | 'unfly'; targetId: string; name?: string };

export function createSettings(sendRequest: (data: AdminRequest) => Promise<number>) {
  const trigger = document.querySelector<HTMLButtonElement>('#game-settings')!;
  const adminTrigger = document.querySelector<HTMLButtonElement>('#game-admin')!;
  const dialog = document.querySelector<HTMLDialogElement>('#settings-panel')!;
  const adminPanel = document.querySelector<HTMLDialogElement>('#admin-panel')!;
  const admin = dialog.querySelector<HTMLDetailsElement>('#settings-admin')!;
  const sizes = document.createElement('fieldset');
  const sizesTitle = document.createElement('legend'); sizesTitle.textContent = 'Tamaño de controles'; sizes.append(sizesTitle);
  const defaults = { ui: matchMedia('(any-pointer: coarse)').matches ? 75 : 100, joystick: 140, chat: 100 };
  let saved: Record<string, unknown> = {};
  try { const value = JSON.parse(localStorage.getItem('openworld3d.ui') ?? '{}'); if (value && typeof value === 'object') saved = value; } catch {}
  const sliders: HTMLInputElement[] = [];
  function persist() {
    try { localStorage.setItem('openworld3d.ui', JSON.stringify(Object.fromEntries(sliders.map(slider => [slider.name, Number(slider.value)])))); } catch {}
  }
  for (const [key, min, max, title] of [['ui', 25, 150, 'Escala de interfaz'], ['joystick', 90, 190, 'Joystick'], ['chat', 85, 150, 'Chat']] as const) {
    const label = document.createElement('label'), caption = document.createElement('span'), slider = document.createElement('input');
    slider.type = 'range'; slider.name = key; slider.min = String(min); slider.max = String(max); slider.step = '5';
    const value = saved[key];
    slider.value = String(typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : defaults[key]);
    const apply = () => {
      const value = Number(slider.value);
      caption.textContent = key === 'ui' ? `${title}: ×${(value / 100).toFixed(2)}` : `${title}: ${value}${key === 'joystick' ? ' px' : '%'}`;
      slider.setAttribute('aria-label', title);
      if (key === 'ui') { document.documentElement.style.setProperty('--ui-scale', String(value / 100)); return; }
      document.documentElement.style.setProperty(key === 'joystick' ? '--joystick-size' : '--chat-scale', key === 'joystick' ? value + 'px' : String(value / 100));
    };
    slider.addEventListener('input', () => { apply(); persist(); });
    label.append(caption, slider); sizes.append(label); sliders.push(slider); apply();
  }
  const resetSizes = document.createElement('button'); resetSizes.type = 'button'; resetSizes.textContent = 'Restablecer tamaños';
  resetSizes.addEventListener('click', () => {
    for (const slider of sliders) { slider.value = String(defaults[slider.name as keyof typeof defaults]); slider.dispatchEvent(new Event('input')); }
  });
  const sizeHint = document.createElement('p'); sizeHint.textContent = 'Escala general de ×0.25 a ×1.50. Se guarda en este dispositivo. Joystick y chat también tienen su propio ajuste.';
  sizes.append(sizeHint, resetSizes); admin.before(sizes);
  const form = dialog.querySelector<HTMLFormElement>('#admin-form')!;
  const input = form.querySelector<HTMLInputElement>('input')!;
  const submit = form.querySelector<HTMLButtonElement>('button')!;
  const status = dialog.querySelector<HTMLElement>('#admin-status')!;
  const coordinates = dialog.querySelector<HTMLInputElement>('#settings-coordinates')!;
  const moderation = adminPanel.querySelector<HTMLFormElement>('#admin-moderation')!;
  const commands = adminPanel.querySelector<HTMLFormElement>('#admin-commands')!;
  const command = commands.querySelector<HTMLInputElement>('input')!;
  command.maxLength = 176;
  commands.querySelector('label')!.textContent = 'Comando de administrador';
  const resultStatus = adminPanel.querySelector<HTMLElement>('#moderation-status')!;
  const select = moderation.querySelector<HTMLSelectElement>('select')!;
  select.multiple=true;select.size=5;
  select.setAttribute('aria-label','Jugadores seleccionados; permite varios');
  function selectedTargets() {
    const chosen=Array.from(select.selectedOptions).map(o=>o.value).filter(Boolean);
    return chosen.includes('all') ? ['me',...players.map(p=>p.id)] : chosen.length?chosen:['me'];
  }
  async function request(data:AdminRequest, targets?:string[]) {
    if(!('action' in data) || data.action==='announce')return sendRequest(data);
    const ids=targets ?? ('targetId' in data && data.targetId ? [data.targetId] : selectedTargets());
    let result=204;
    for(const id of ids){if(id==='me' && ['kick','rename','chat_allow','chat_block','tp'].includes(data.action))continue;const status=await sendRequest({...data,targetId:id});if(status!==204)result=status;}
    return result;
  }

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
    const selected = new Set(Array.from(select.selectedOptions).map(o=>o.value));
    select.replaceChildren(new Option('Selecciona un jugador', ''), new Option('Yo', 'me'), new Option('Todos', 'all'));
    for (const player of players) {
      const duplicate = players.some(other => other !== player && other.name === player.name);
      select.add(new Option((duplicate ? player.name + ' · ' + player.id.slice(0, 5) : player.name) + (player.freeChat ? ' (chat libre)' : ''), player.id));
    }
    for(const option of select.options)option.selected=selected.has(option.value);
  }

  async function moderate(action: 'kick' | 'rename' | 'chat_allow' | 'chat_block' | 'fly' | 'unfly', name = nickname.value.trim(), targetOverride?: string) {
    if (busy || adminTrigger.hidden) return false;
    const targetId = targetOverride ?? select.value;
    const target = (targetId === 'all' || targetId === 'me') && (action === 'fly' || action === 'unfly' || targetId==='all') ? {id:targetId,name:targetId==='all'?'Todos':'Yo'} : players.find(player => player.id === targetId);
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
    const result = await request({ action, targetId: target.id, name }, targetOverride ? [target.id] : selectedTargets());
    if (requestSession !== session) return false;
    busy = false;
    if (result === 204) {
      nickname.value = '';
      resultStatus.textContent = action === 'fly' ? 'Vuelo activado: Espacio sube, Ctrl baja; también hay botones táctiles.' : action === 'unfly' ? 'Vuelo desactivado.' : action === 'chat_allow' ? 'Chat libre habilitado durante esta sesión.' : action === 'chat_block' ? 'Chat libre bloqueado.' : action === 'kick' ? 'Jugador expulsado.' : 'Apodo cambiado.';
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
  for (const [action, label] of [['fly', 'Activar vuelo'], ['unfly', 'Desactivar vuelo'], ['chat_allow', 'Permitir chat libre'], ['chat_block', 'Bloquear chat libre']] as const) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    button.addEventListener('click', () => { void moderate(action); });
    kick.parentElement!.append(button);
  }
  async function setNoclip(action:'noclip'|'clip'|'groundcar'|'freecar'|'waterproof'|'waternormal'|'reloadall') {
    if(busy || adminTrigger.hidden)return;
    if(action==='reloadall' && !window.confirm('¿Recargar la página de los jugadores seleccionados? Se perderán sus monedas, casas y amigos de la sesión.'))return;
    const requestSession=session;busy=true;
    try {const result=await request({action});if(requestSession===session)resultStatus.textContent=result===204?(action==='reloadall'?'Recarga global enviada.':action==='waterproof'?'El agua ya no ralentiza tu carro.':action==='waternormal'?'Efecto del agua restaurado.':action==='groundcar'?'Carro pegado al suelo. Saltos y vuelo desactivados mientras esté activo.':action==='freecar'?'Físicas normales del carro restauradas.':action==='noclip'?'Atravesar paredes activado.':'Colisiones activadas; salir de paredes te devuelve a un lugar libre.'):'No se pudo cambiar el modo.';}
    finally {if(requestSession===session)busy=false;}
  }
  for(const [action,label] of [['noclip','Atravesar paredes'],['clip','Restaurar colisiones'],['groundcar','Pegar carro al suelo'],['freecar','Soltar carro del suelo'],['waterproof','Ignorar agua'],['waternormal','Restaurar efecto del agua'],['reloadall','Recargar seleccionados']] as const){
    const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=()=>void setNoclip(action);kick.parentElement!.append(button);
  }
  async function teleport(action:'tp'|'bring',targetId:string) {
    if(busy || adminTrigger.hidden)return;
    if(!targetId || targetId==='me'){resultStatus.textContent='Selecciona un jugador.';return;}
    if(targetId==='all' && !window.confirm('¿Traer a todos los jugadores hacia ti?'))return;
    busy=true;const requestSession=session;
    try{const result=await request({action,targetId}, targetId==='all'?['all']:targetId===select.value?selectedTargets():[targetId]);if(session===requestSession)resultStatus.textContent=result===204?'Teletransporte enviado.':'No se pudo teletransportar; comprueba que el jugador siga conectado.';}finally{if(session===requestSession)busy=false;}
  }
  for(const [action,label,all] of [['tp','Ir al jugador',false],['bring','Traer jugador',false],['bring','Traer a todos',true]] as const){const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=()=>void teleport(action,all?'all':select.value);kick.parentElement!.append(button);}
  document.querySelector('#admin-command-help')!.textContent = '/tp apodo · /bring apodo · /bring all · /waterproof · /waternormal · /reloadall · /groundcar · /freecar · /noclip · /clip · /anuncio mensaje (máx. 160 caracteres) · /fly me · /unfly me · /fly apodo · /kick · /rename apodo';
  commands.addEventListener('submit', async event => {
    event.preventDefault();
    const text = command.value.trim();
    if(['/noclip','/clip','/groundcar','/freecar','/waterproof','/waternormal','/reloadall'].includes(text)){await setNoclip(text.slice(1) as 'noclip'|'clip'|'groundcar'|'freecar'|'waterproof'|'waternormal'|'reloadall');command.value='';return;}
    const tp=/^\/(tp|bring)(?:\s+(.+))?$/.exec(text);
    if(tp){const name=tp[2];const matches=players.filter(p=>p.name.toLowerCase()===name?.toLowerCase());const target=tp[1]==='bring'&&name==='all'?'all':!name?select.value:matches.length===1?matches[0].id:'';await teleport(tp[1] as 'tp'|'bring',target);return;}
    const announcement = /^\/(?:anuncio|announce)(?:\s+(.*))?$/.exec(text);
    if (announcement) {
      if (busy || adminTrigger.hidden) return;
      const message = announcement[1]?.trim();
      if (!message || message.length > 160) { resultStatus.textContent = 'Escribe un anuncio de 1 a 160 caracteres.'; return; }
      const requestSession = session;
      busy = true;
      try {
        const result = await request({action:'announce',text:message});
        if (requestSession !== session) return;
        resultStatus.textContent = result === 204 ? 'Anuncio enviado a toda la partida.' : result === 429 ? 'Espera 5 segundos entre anuncios.' : 'No se pudo enviar el anuncio.';
        if (result === 204) command.value = '';
      } catch {
        if (requestSession === session) resultStatus.textContent = 'No se pudo enviar el anuncio. Revisa la conexión.';
      } finally { if (requestSession === session) busy = false; }
      return;
    }
    const flight = /^\/(fly|unfly)(?:\s+(.+))?$/.exec(text);
    if (flight) {
      const name = flight[2];
      const matches = name ? players.filter(p => p.name.toLowerCase() === name.toLowerCase()) : [];
      const target = name==='all' ? 'all' : !name ? select.value : ['me','yo'].includes(name.toLowerCase()) ? 'me' : matches.length === 1 ? matches[0].id : '';
      if (!target) { resultStatus.textContent = 'Selecciona un jugador o usa /fly me; si el apodo se repite usa el selector.'; return; }
      if (await moderate(flight[1] as 'fly' | 'unfly', '', target)) command.value = '';
      return;
    }
    const rename = /^\/rename\s+(.+)$/.exec(text);
    if (text !== '/kick' && !rename) {
      resultStatus.textContent = 'Usa /anuncio mensaje, /fly me, /unfly me, /fly apodo, /unfly apodo, /kick o /rename apodo.';
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
