import './settings.css';

export function createSettings(authorize: (code: string) => Promise<number>) {
  const trigger = document.querySelector<HTMLButtonElement>('#game-settings')!;
  const dialog = document.querySelector<HTMLDialogElement>('#settings-panel')!;
  const admin = dialog.querySelector<HTMLDetailsElement>('#settings-admin')!;
  const form = dialog.querySelector<HTMLFormElement>('#admin-form')!;
  const input = form.querySelector<HTMLInputElement>('input')!;
  const submit = form.querySelector<HTMLButtonElement>('button')!;
  const status = dialog.querySelector<HTMLElement>('#admin-status')!;
  const coordinates = dialog.querySelector<HTMLInputElement>('#settings-coordinates')!;
  let session = 0;

  trigger.addEventListener('click', () => dialog.showModal());
  dialog.querySelector('#settings-close')!.addEventListener('click', () => dialog.close());
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
    const result = await authorize(code);
    if (requestSession !== session) return;
    submit.disabled = false;

    if (result === 204) {
      form.hidden = true;
      status.textContent = 'Sesión de administrador activa.';
      return;
    }
    status.textContent = result === 403 ? 'Código incorrecto.'
      : result === 429 ? 'Demasiados intentos. Espera un minuto.'
        : result === 503 ? 'El servidor aún no tiene un código de administrador.'
          : 'No se pudo verificar el código.';
  });

  return {
    get open() { return dialog.open; },
    setConnected(connected: boolean) {
      session++;
      trigger.hidden = !connected;
      dialog.close();
      admin.open = false;
      form.reset();
      form.hidden = false;
      submit.disabled = false;
      status.textContent = '';
    }
  };
}
